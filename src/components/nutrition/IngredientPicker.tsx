import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Sparkles, Star, Clock, ScanLine, Globe, Database, Loader2, ArrowLeft } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useNutritionStore } from '../../stores/nutritionStore';
import { FOOD_UNITS, UNIT_TO_GRAMS } from '../../lib/constants';
import type { FoodProduct, FoodFavorite } from '../../lib/types';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';
import UnifiedScanner from '../scanner/UnifiedScanner';

type Tab = 'search' | 'recent' | 'favorites';

interface IngredientResult {
  name: string;
  quantity: number;
  unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface Props {
  onAdd: (ingredient: IngredientResult) => void;
  onClose: () => void;
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

export default function IngredientPicker({ onAdd, onClose }: Props) {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { searchProducts, createProduct, batchSaveProducts, favorites, recentProducts, fetchFavorites, fetchRecentProducts } = useNutritionStore();

  const [tab, setTab] = useState<Tab>('search');
  const [name, setName] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [quantity, setQuantity] = useState('100');
  const [unit, setUnit] = useState('g');
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchPhase, setSearchPhase] = useState<'idle' | 'db' | 'openfoodfacts'>('idle');
  const [showScanner, setShowScanner] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<FoodProduct | null>(null);
  const searchRef = useRef(0);

  const isServingUnit = unit === 'serving';
  const grams = isServingUnit ? 0 : (+quantity || 0) * (UNIT_TO_GRAMS[unit] ?? 1);
  const scale = isServingUnit ? (+quantity || 1) : grams / 100;

  useEffect(() => {
    if (!user) return;
    fetchFavorites(user.id);
    fetchRecentProducts(user.id);
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

  const handleAdd = () => {
    if (!name.trim()) return;
    onAdd({
      name,
      quantity: +quantity,
      unit,
      calories: Math.round(+calories * scale),
      protein: Math.round(+protein * scale * 10) / 10,
      carbs: Math.round(+carbs * scale * 10) / 10,
      fat: Math.round(+fat * scale * 10) / 10,
    });
  };

  const handleScannerResult = (product: FoodProduct) => {
    setShowScanner(false);
    selectProduct(product);
  };

  const tabList: { id: Tab; label: string; Icon: typeof Search }[] = [
    { id: 'search', label: t('nutrition.foodForm.tabs.search'), Icon: Search },
    { id: 'recent', label: t('nutrition.foodForm.tabs.recent'), Icon: Clock },
    { id: 'favorites', label: t('nutrition.foodForm.tabs.saved'), Icon: Star },
  ];

  return (
    <>
    {showScanner && (
      <div className="fixed inset-0 z-[70] bg-black overflow-y-auto">
        <UnifiedScanner
          onResult={handleScannerResult}
          onClose={() => setShowScanner(false)}
          showRecent={false}
        />
      </div>
    )}
    <div className="fixed inset-0 z-[60] bg-black overflow-y-auto animate-fade-in">
      <div className="max-w-lg mx-auto px-4 py-6 animate-fade-in-up">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="p-2 -ml-2 text-neutral-400 hover:text-white transition-colors">
              <ArrowLeft size={20} />
            </button>
            <h2 className="text-xl font-bold text-white">{t('nutrition.ingredientPicker.title')}</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowScanner(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white hover:border-neutral-700 text-sm transition-colors"
            >
              <ScanLine size={14} />
              {t('nutrition.ingredientPicker.scannerButton')}
            </button>
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
                  placeholder={t('nutrition.foodForm.searchPlaceholder')}
                  className="pl-10"
                />
              </div>
              <Button onClick={handleSearch} variant="secondary" loading={searching}>{t('common.search')}</Button>
            </div>

            {searching && (
              <div className="mt-3 flex items-center justify-center gap-2 py-4 bg-neutral-900/30 border border-neutral-800/30 rounded-xl animate-fade-in">
                <Loader2 size={16} className="text-blue-400 animate-spin" />
                <span className="text-sm text-neutral-400">
                  {searchPhase === 'db' ? t('nutrition.foodForm.searchingLocal') : t('nutrition.foodForm.searchingOpenFoodFacts')}
                </span>
              </div>
            )}

            {!searching && results.length > 0 && (
              <div className="mt-2 animate-fade-in-down">
                {results[0]?._source === 'openfoodfacts' && (
                  <div className="flex items-center gap-1.5 mb-1.5 px-1">
                    <Globe size={11} className="text-emerald-500" />
                    <span className="text-[10px] text-neutral-500">{t('nutrition.foodForm.resultsFromOFF')}</span>
                  </div>
                )}
                {results[0]?._source === 'db' && (
                  <div className="flex items-center gap-1.5 mb-1.5 px-1">
                    <Database size={11} className="text-blue-400" />
                    <span className="text-[10px] text-neutral-500">{t('nutrition.foodForm.resultsFromDB')}</span>
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
                  onClick={() => setShowScanner(true)}
                  className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 text-xs text-neutral-500 hover:text-blue-400 transition-colors"
                >
                  <Sparkles size={12} />
                  {t('nutrition.ingredientPicker.notRight')}
                </button>
              </div>
            )}

            {!searching && searched && results.length === 0 && (
              <div className="mt-3 text-center py-6 bg-neutral-900/30 border border-neutral-800/30 rounded-xl animate-fade-in-up">
                <p className="text-sm text-neutral-400 mb-1">{t('nutrition.foodForm.notFound')}</p>
                <p className="text-xs text-neutral-600 mb-4">{t('nutrition.ingredientPicker.tryScanning')}</p>
                <button
                  onClick={() => setShowScanner(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600/15 border border-blue-500/30 text-sm font-medium text-blue-400 hover:bg-blue-600/25 transition-colors"
                >
                  <Sparkles size={14} />
                  {t('nutrition.foodForm.openScanner')}
                </button>
              </div>
            )}
          </div>
        )}

        {tab === 'recent' && (
          <div className="mb-5">
            {recentProducts.length === 0 ? (
              <div className="text-center py-8 text-neutral-500 text-sm">{t('nutrition.foodForm.noRecentFoods')}</div>
            ) : (
              <div className="space-y-2">
                {recentProducts.map((p, i) => (
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
              </div>
            )}
          </div>
        )}

        {tab === 'favorites' && (
          <div className="mb-5">
            {favorites.length === 0 ? (
              <div className="text-center py-8 text-neutral-500 text-sm">{t('nutrition.ingredientPicker.noFavorites')}</div>
            ) : (
              <div className="space-y-2">
                {favorites.map(f => (
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
              </div>
            )}
          </div>
        )}

        <div className="space-y-4">
          {selectedProduct ? (
            <div>
              <p className="text-xs font-medium text-neutral-400 mb-1.5">{t('nutrition.ingredientPicker.ingredientName')}</p>
              <p className="px-3 py-2 rounded-xl bg-neutral-900/60 border border-neutral-800/50 text-white text-sm truncate">{name}</p>
            </div>
          ) : (
            <Input label={t('nutrition.ingredientPicker.ingredientName')} value={name} onChange={e => setName(e.target.value)} placeholder={t('nutrition.ingredientPicker.ingredientName')} />
          )}

          <div className="grid grid-cols-2 gap-3">
            <Input label={t('nutrition.foodForm.quantity')} type="number" value={quantity} onChange={e => setQuantity(e.target.value)} />
            <Select
              label={t('nutrition.foodForm.unit')}
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
            {isServingUnit ? t('nutrition.foodForm.nutritionalValuesPer') : t('nutrition.foodForm.nutritionalValuesPer100g')}
          </p>

          <div className="grid grid-cols-2 gap-3">
            <Input label={t('common.calories')} type="number" value={calories} onChange={e => setCalories(e.target.value)} placeholder="0" />
            <Input label={`${t('common.protein')} (g)`} type="number" value={protein} onChange={e => setProtein(e.target.value)} placeholder="0" />
            <Input label={`${t('common.carbs')} (g)`} type="number" value={carbs} onChange={e => setCarbs(e.target.value)} placeholder="0" />
            <Input label={`${t('common.fat')} (g)`} type="number" value={fat} onChange={e => setFat(e.target.value)} placeholder="0" />
          </div>

          {+calories > 0 && +quantity > 0 && (
            <div className="bg-blue-600/10 border border-blue-500/30 rounded-xl p-3 text-sm">
              <p className="text-blue-400 font-medium">
                {t('nutrition.foodForm.total')} {Math.round(+calories * scale)} {t('common.cal')} | P: {Math.round(+protein * scale)}g | C: {Math.round(+carbs * scale)}g | F: {Math.round(+fat * scale)}g
              </p>
            </div>
          )}

          <Button onClick={handleAdd} className="w-full">{t('nutrition.ingredientPicker.addButton')}</Button>
        </div>
      </div>
    </div>
    </>
  );
}
