import { useState, useEffect, useRef } from 'react';
import { Search, Sparkles, Star, Clock, ChefHat, Heart, Plus, ScanLine, Globe, Database, Loader2, Camera } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { useNutritionStore } from '../../stores/nutritionStore';
import { useRecipeStore } from '../../stores/recipeStore';
import { FOOD_UNITS, MEAL_CATEGORIES, UNIT_TO_GRAMS } from '../../lib/constants';
import type { FoodProduct, FoodFavorite, Recipe } from '../../lib/types';
import { toast } from '../ui/Toast';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';
import CreateProductForm from '../scanner/CreateProductForm';
import FoodPhotoAnalyzer from './FoodPhotoAnalyzer';
import RecipeForm from './RecipeForm';

type Tab = 'search' | 'recent' | 'favorites' | 'recipes';

interface Props {
  category: string;
  date: string;
  onClose: () => void;
  prefill?: FoodProduct | null;
}

type SearchSource = 'db' | 'openfoodfacts';

interface SearchResult extends FoodProduct {
  _source?: SearchSource;
}

async function searchOpenFoodFacts(query: string): Promise<SearchResult[]> {
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=15&fields=product_name,brands,nutriments,serving_quantity,code`
    );
    const data = await res.json();
    if (!data.products) return [];
    return data.products
      .filter((p: Record<string, unknown>) => p.product_name)
      .map((p: Record<string, unknown>) => {
        const n = (p.nutriments || {}) as Record<string, number>;
        return {
          id: '',
          barcode: (p.code as string) || null,
          name: p.product_name as string,
          brand: (p.brands as string) || null,
          calories_per_100g: n['energy-kcal_100g'] || 0,
          protein_per_100g: n.proteins_100g || 0,
          carbs_per_100g: n.carbohydrates_100g || 0,
          fat_per_100g: n.fat_100g || 0,
          serving_size: +(p.serving_quantity || 100),
          serving_unit: 'g',
          created_by: null,
          created_at: '',
          data_source: null,
          _source: 'openfoodfacts' as const,
        };
      });
  } catch {
    return [];
  }
}

export default function FoodForm({ category, date, onClose, prefill }: Props) {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { addLog, searchProducts, createProduct, batchSaveProducts, favorites, recentProducts, fetchFavorites, fetchRecentProducts, addFavorite, removeFavorite } = useNutritionStore();
  const { recipes, fetchRecipes } = useRecipeStore();

  const [tab, setTab] = useState<Tab>('search');
  const [name, setName] = useState(prefill?.name ?? '');
  const [calories, setCalories] = useState(prefill?.calories_per_100g?.toString() ?? '');
  const [protein, setProtein] = useState(prefill?.protein_per_100g?.toString() ?? '');
  const [carbs, setCarbs] = useState(prefill?.carbs_per_100g?.toString() ?? '');
  const [fat, setFat] = useState(prefill?.fat_per_100g?.toString() ?? '');
  const [quantity, setQuantity] = useState(prefill?.serving_size?.toString() ?? '100');
  const [unit, setUnit] = useState(prefill?.serving_unit ?? 'g');
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchPhase, setSearchPhase] = useState<'idle' | 'db' | 'openfoodfacts'>('idle');
  const [saving, setSaving] = useState(false);
  const [activeCategory, setActiveCategory] = useState(category);
  const [showCreateProduct, setShowCreateProduct] = useState(false);
  const [showPhotoAnalyzer, setShowPhotoAnalyzer] = useState(false);
  const [showNewRecipe, setShowNewRecipe] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<FoodProduct | null>(prefill ?? null);
  const [favDisplayCount, setFavDisplayCount] = useState(15);
  const [recentDisplayCount, setRecentDisplayCount] = useState(15);
  const searchRef = useRef(0);
  const LIST_PAGE = 15;

  // 'serving' unit: values in the form are per-serving, scale = number of servings
  const isServingUnit = unit === 'serving';
  const grams = isServingUnit ? 0 : (+quantity || 0) * (UNIT_TO_GRAMS[unit] ?? 1);
  const scale = isServingUnit ? (+quantity || 1) : grams / 100;

  useEffect(() => {
    if (!user) return;
    fetchFavorites(user.id);
    fetchRecentProducts(user.id);
    fetchRecipes(user.id);
  }, [user]);

  const handleSearch = async () => {
    const q = searchQuery.trim();
    if (!q) return;
    const searchId = ++searchRef.current;
    setSearching(true);
    setSearched(false);
    setResults([]);

    setSearchPhase('db');
    const dbResults = await searchProducts(q);
    if (searchRef.current !== searchId) return;

    if (dbResults.length > 0) {
      setResults(dbResults.map(p => ({ ...p, _source: 'db' as const })));
      setSearched(true);
      setSearching(false);
      setSearchPhase('idle');
      return;
    }

    setSearchPhase('openfoodfacts');
    const offResults = await searchOpenFoodFacts(q);
    if (searchRef.current !== searchId) return;

    setResults(offResults);
    setSearched(true);
    setSearching(false);
    setSearchPhase('idle');
    // Persist barcoded products to local DB in background to grow the catalog
    if (offResults.length > 0) batchSaveProducts(offResults);
  };

  const selectProduct = async (p: SearchResult) => {
    let product: FoodProduct = p;

    if (p._source === 'openfoodfacts' && !p.id) {
      const saved = await createProduct({
        barcode: p.barcode,
        name: p.name,
        brand: p.brand,
        calories_per_100g: p.calories_per_100g,
        protein_per_100g: p.protein_per_100g,
        carbs_per_100g: p.carbs_per_100g,
        fat_per_100g: p.fat_per_100g,
        serving_size: p.serving_size,
        serving_unit: p.serving_unit,
      });
      if (saved) product = saved;
    }

    setSelectedProduct(product);
    setName(product.name);
    setCalories(product.calories_per_100g.toString());
    setProtein(product.protein_per_100g.toString());
    setCarbs(product.carbs_per_100g.toString());
    setFat(product.fat_per_100g.toString());
    setQuantity(product.serving_size.toString());
    setUnit(product.serving_unit);
    setResults([]);
    setSearchQuery('');
    setSearched(false);
  };

  const selectFavorite = (f: FoodFavorite) => {
    selectProduct({
      id: f.product_id ?? '',
      barcode: null,
      name: f.product_name,
      brand: f.brand || null,
      calories_per_100g: f.calories_per_100g,
      protein_per_100g: f.protein_per_100g,
      carbs_per_100g: f.carbs_per_100g,
      fat_per_100g: f.fat_per_100g,
      serving_size: f.serving_size,
      serving_unit: f.serving_unit,
      created_by: null,
      created_at: '',
      data_source: null,
    });
    setTab('search');
  };

  const selectRecipe = (r: Recipe) => {
    setName(r.name);
    setCalories((r.calories_per_serving).toString());
    setProtein((r.protein_per_serving).toString());
    setCarbs((r.carbs_per_serving).toString());
    setFat((r.fat_per_serving).toString());
    setQuantity('1');
    setUnit('serving');
    setSelectedProduct(null);
    setTab('search');
  };

  const isFavorited = selectedProduct?.id ? favorites.some(f => f.product_id === selectedProduct.id) : false;

  const toggleFavorite = async () => {
    if (!user || !selectedProduct) return;
    if (isFavorited) {
      const fav = favorites.find(f => f.product_id === selectedProduct.id);
      if (fav) {
        await removeFavorite(fav.id);
        toast('Removed from favorites', 'info');
      }
    } else {
      await addFavorite(user.id, selectedProduct);
      toast('Added to favorites');
    }
  };

  const handleProductCreated = (p: FoodProduct) => {
    setShowCreateProduct(false);
    selectProduct(p);
  };

  const handlePhotoResult = (p: FoodProduct, confidence: number) => {
    setShowPhotoAnalyzer(false);
    selectProduct(p);
    if (confidence < 70) {
      toast('Low confidence — verify the nutritional values before saving', 'info');
    }
  };

  const handleSave = async () => {
    if (!user || !name.trim()) return;
    const qty = +quantity;
    const cal = +calories;
    const pro = +protein;
    const carb = +carbs;
    const f = +fat;
    if (qty <= 0) { toast('La quantité doit être supérieure à 0.', 'error'); return; }
    if (cal < 0 || pro < 0 || carb < 0 || f < 0) { toast('Les valeurs nutritionnelles ne peuvent pas être négatives.', 'error'); return; }
    if (cal > 9000) { toast('Calories par 100g trop élevées (max 9000).', 'error'); return; }
    setSaving(true);
    await addLog({
      user_id: user.id,
      name,
      calories: cal * scale,
      protein: pro * scale,
      carbs: carb * scale,
      fat: f * scale,
      category: activeCategory as 'breakfast' | 'lunch' | 'dinner' | 'snack',
      quantity: qty,
      unit,
      logged_at: date,
    });
    toast('Aliment enregistré');
    setSaving(false);
    onClose();
  };

  if (showCreateProduct) {
    return (
      <CreateProductForm
        barcode=""
        onClose={() => setShowCreateProduct(false)}
        onCreated={handleProductCreated}
      />
    );
  }

  if (showPhotoAnalyzer) {
    return (
      <FoodPhotoAnalyzer
        onResult={handlePhotoResult}
        onClose={() => setShowPhotoAnalyzer(false)}
      />
    );
  }

  if (showNewRecipe) {
    return (
      <RecipeForm
        onClose={() => setShowNewRecipe(false)}
        onSaved={() => { setShowNewRecipe(false); if (user) fetchRecipes(user.id); }}
      />
    );
  }

  const tabList: { id: Tab; label: string; Icon: typeof Search }[] = [
    { id: 'search', label: 'Search', Icon: Search },
    { id: 'recent', label: 'Recent', Icon: Clock },
    { id: 'favorites', label: 'Saved', Icon: Star },
    { id: 'recipes', label: 'Recipes', Icon: ChefHat },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black overflow-y-auto animate-fade-in">
      <div className="max-w-lg mx-auto px-4 py-6 animate-fade-in-up">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold text-white">Add Food</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPhotoAnalyzer(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white hover:border-neutral-700 text-sm transition-colors"
              title="Identify food with AI photo analysis"
            >
              <Camera size={14} />
              Photo
            </button>
            <button
              onClick={() => navigate('/scanner')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white hover:border-neutral-700 text-sm transition-colors"
            >
              <ScanLine size={14} />
              Scan
            </button>
            <button onClick={onClose} className="text-neutral-400 hover:text-white text-sm transition-colors">Cancel</button>
          </div>
        </div>

        <div className="flex gap-1 mb-5 bg-neutral-900 rounded-xl p-1">
          {tabList.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium transition-all
                ${tab === t.id ? 'bg-neutral-700 text-white' : 'text-neutral-500 hover:text-neutral-300'}`}
            >
              <t.Icon size={11} />
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'search' && (
          <div className="mb-5">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" size={16} />
                <Input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  placeholder="Search food..."
                  className="pl-10"
                  autoFocus
                />
              </div>
              <Button onClick={handleSearch} variant="secondary" loading={searching}>Search</Button>
            </div>

            {searching && (
              <div className="mt-3 flex items-center justify-center gap-2 py-4 bg-neutral-900/30 border border-neutral-800/30 rounded-xl animate-fade-in">
                <Loader2 size={16} className="text-blue-400 animate-spin" />
                <span className="text-sm text-neutral-400">
                  {searchPhase === 'db' ? 'Searching local database...' : 'Searching Open Food Facts...'}
                </span>
              </div>
            )}

            {!searching && results.length > 0 && (
              <div className="mt-2 animate-fade-in-down">
                {results[0]?._source === 'openfoodfacts' && (
                  <div className="flex items-center gap-1.5 mb-1.5 px-1">
                    <Globe size={11} className="text-emerald-500" />
                    <span className="text-[10px] text-neutral-500">Results from Open Food Facts</span>
                  </div>
                )}
                {results[0]?._source === 'db' && (
                  <div className="flex items-center gap-1.5 mb-1.5 px-1">
                    <Database size={11} className="text-blue-400" />
                    <span className="text-[10px] text-neutral-500">Results from database</span>
                  </div>
                )}
                <div className="bg-neutral-900 border border-neutral-800 rounded-xl max-h-52 overflow-y-auto">
                  {results.map((p, i) => (
                    <button
                      key={`${p.barcode || p.id || i}`}
                      onClick={() => selectProduct(p)}
                      className="w-full text-left px-3 py-2.5 text-sm text-neutral-300 hover:bg-neutral-800 transition-colors border-b border-neutral-800/50 last:border-0"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <span className="font-medium text-white">{p.name}</span>
                          {p.brand && <span className="text-neutral-500 ml-1.5 text-xs">{p.brand}</span>}
                        </div>
                        <span className="text-xs text-neutral-500 whitespace-nowrap">{Math.round(p.calories_per_100g)} cal</span>
                      </div>
                      <div className="text-[11px] text-neutral-600 mt-0.5">
                        P: {Math.round(p.protein_per_100g)}g | C: {Math.round(p.carbs_per_100g)}g | F: {Math.round(p.fat_per_100g)}g per 100g
                      </div>
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setShowCreateProduct(true)}
                  className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 text-xs text-neutral-500 hover:text-blue-400 transition-colors"
                >
                  <Sparkles size={12} />
                  Can't find it? Add with AI
                </button>
              </div>
            )}

            {!searching && searched && results.length === 0 && (
              <div className="mt-3 text-center py-6 bg-neutral-900/30 border border-neutral-800/30 rounded-xl animate-fade-in-up">
                <p className="text-sm text-neutral-400 mb-1">No products found anywhere</p>
                <p className="text-xs text-neutral-600 mb-4">Not in database or Open Food Facts</p>
                <button
                  onClick={() => setShowCreateProduct(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600/15 border border-blue-500/30 text-sm font-medium text-blue-400 hover:bg-blue-600/25 transition-colors"
                >
                  <Sparkles size={14} />
                  Add with AI photo analysis
                </button>
              </div>
            )}
          </div>
        )}

        {tab === 'recent' && (
          <div className="mb-5">
            {recentProducts.length === 0 ? (
              <div className="text-center py-8 text-neutral-500 text-sm">No recent foods yet</div>
            ) : (
              <div className="space-y-2">
                {recentProducts.slice(0, recentDisplayCount).map((p, i) => (
                  <button
                    key={i}
                    onClick={() => { selectProduct(p); setTab('search'); }}
                    className="w-full text-left px-3 py-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 transition-colors border border-neutral-800"
                  >
                    <div className="flex items-center gap-2">
                      <Clock size={13} className="text-neutral-500 shrink-0" />
                      <span className="font-medium text-white text-sm flex-1 truncate">{p.name}</span>
                      <span className="text-xs text-neutral-500">{p.calories_per_100g} cal/100g</span>
                    </div>
                  </button>
                ))}
                {recentProducts.length > recentDisplayCount && (
                  <button
                    onClick={() => setRecentDisplayCount(c => c + LIST_PAGE)}
                    className="w-full py-2 text-xs text-neutral-500 hover:text-blue-400 transition-colors text-center"
                  >
                    Show more ({recentProducts.length - recentDisplayCount} remaining)
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {tab === 'favorites' && (
          <div className="mb-5">
            {favorites.length === 0 ? (
              <div className="text-center py-8 text-neutral-500 text-sm">No favorites yet. Star a product after selecting it.</div>
            ) : (
              <div className="space-y-2">
                {favorites.slice(0, favDisplayCount).map(f => (
                  <button
                    key={f.id}
                    onClick={() => selectFavorite(f)}
                    className="w-full text-left px-3 py-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 transition-colors border border-neutral-800"
                  >
                    <div className="flex items-center gap-2">
                      <Star size={13} className="text-amber-400 fill-amber-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-white text-sm">{f.product_name}</span>
                        {f.brand && <span className="text-neutral-500 text-xs ml-1">{f.brand}</span>}
                      </div>
                      <span className="text-xs text-neutral-500">{f.calories_per_100g} cal/100g</span>
                    </div>
                  </button>
                ))}
                {favorites.length > favDisplayCount && (
                  <button
                    onClick={() => setFavDisplayCount(c => c + LIST_PAGE)}
                    className="w-full py-2 text-xs text-neutral-500 hover:text-blue-400 transition-colors text-center"
                  >
                    Show more ({favorites.length - favDisplayCount} remaining)
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {tab === 'recipes' && (
          <div className="mb-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-neutral-400">Your recipes</span>
              <button onClick={() => setShowNewRecipe(true)} className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors">
                <Plus size={13} /> New
              </button>
            </div>
            {recipes.length === 0 ? (
              <div className="text-center py-6 text-neutral-500 text-sm border border-neutral-800 rounded-xl">
                No recipes yet
              </div>
            ) : (
              <div className="space-y-2">
                {recipes.map(r => (
                  <button
                    key={r.id}
                    onClick={() => selectRecipe(r)}
                    className="w-full text-left px-3 py-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 transition-colors border border-neutral-800"
                  >
                    <div className="flex items-center gap-2">
                      <ChefHat size={13} className="text-blue-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-white text-sm truncate">{r.name}</p>
                        <p className="text-xs text-neutral-500">{r.calories_per_serving} kcal/serving</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <p className="text-xs font-medium text-neutral-400 mb-2">Add to meal</p>
            <div className="grid grid-cols-4 gap-1">
              {MEAL_CATEGORIES.map(c => (
                <button
                  key={c.value}
                  onClick={() => setActiveCategory(c.value)}
                  className={`py-1.5 rounded-lg text-xs font-medium transition-all ${
                    activeCategory === c.value
                      ? 'bg-blue-600 text-white'
                      : 'bg-neutral-900 text-neutral-400 hover:bg-neutral-800 border border-neutral-800'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-end gap-2">
            <div className="flex-1">
              {selectedProduct ? (
                <div>
                  <p className="text-xs font-medium text-neutral-400 mb-1.5">Food Name</p>
                  <p className="px-3 py-2 rounded-xl bg-neutral-900/60 border border-neutral-800/50 text-white text-sm truncate">{name}</p>
                </div>
              ) : (
                <Input label="Food Name" value={name} onChange={e => setName(e.target.value)} placeholder="Chicken breast" />
              )}
            </div>
            {selectedProduct?.id && (
              <button
                onClick={toggleFavorite}
                className={`mb-0.5 p-2.5 rounded-xl border transition-all ${isFavorited ? 'bg-amber-500/20 border-amber-500/40 text-amber-400' : 'bg-neutral-900 border-neutral-700 text-neutral-500 hover:text-amber-400'}`}
              >
                <Heart size={16} className={isFavorited ? 'fill-current' : ''} />
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input label="Quantity" type="number" value={quantity} onChange={e => setQuantity(e.target.value)} />
            <Select
              label="Unit"
              value={unit}
              onChange={e => setUnit(e.target.value)}
              options={FOOD_UNITS.map(u => ({ value: u, label: u }))}
            />
          </div>

          {selectedProduct && selectedProduct.serving_size > 0 && (selectedProduct.serving_size !== +quantity || selectedProduct.serving_unit !== unit) && (
            <button
              onClick={() => { setQuantity(selectedProduct.serving_size.toString()); setUnit(selectedProduct.serving_unit); }}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors -mt-1"
            >
              → 1 serving ({selectedProduct.serving_size} {selectedProduct.serving_unit})
            </button>
          )}

          <p className="text-xs text-neutral-500">
            {isServingUnit ? 'Nutritional values per serving:' : 'Nutritional values per 100g (scaled to your quantity):'}
          </p>

          <div className="grid grid-cols-2 gap-3">
            <Input label="Calories" type="number" value={calories} onChange={e => setCalories(e.target.value)} placeholder="0" />
            <Input label="Protein (g)" type="number" value={protein} onChange={e => setProtein(e.target.value)} placeholder="0" />
            <Input label="Carbs (g)" type="number" value={carbs} onChange={e => setCarbs(e.target.value)} placeholder="0" />
            <Input label="Fat (g)" type="number" value={fat} onChange={e => setFat(e.target.value)} placeholder="0" />
          </div>

          {+calories > 0 && +quantity > 0 && (
            <div className="bg-blue-600/10 border border-blue-500/30 rounded-xl p-3 text-sm">
              <p className="text-blue-400 font-medium">
                Total: {Math.round(+calories * scale)} cal | P: {Math.round(+protein * scale)}g | C: {Math.round(+carbs * scale)}g | F: {Math.round(+fat * scale)}g
              </p>
            </div>
          )}

          <Button onClick={handleSave} loading={saving} className="w-full">Save</Button>
        </div>
      </div>
    </div>
  );
}
