import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useRecipeStore } from '../../stores/recipeStore';
import type { Recipe, RecipeIngredient } from '../../lib/types';
import { toast } from '../ui/Toast';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Card from '../ui/Card';
import IngredientPicker from './IngredientPicker';

interface Props {
  recipe?: Recipe | null;
  onClose: () => void;
  onSaved: (recipe: Recipe) => void;
}

interface IngredientDraft {
  name: string;
  quantity: number;
  unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export default function RecipeForm({ recipe, onClose, onSaved }: Props) {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { createRecipe, updateRecipe, addIngredient, deleteIngredient, recomputeMacros } = useRecipeStore();

  const [name, setName] = useState(recipe?.name ?? '');
  const [description, setDescription] = useState(recipe?.description ?? '');
  const [servings, setServings] = useState(recipe?.servings?.toString() ?? '1');
  const [ingredients, setIngredients] = useState<(RecipeIngredient | IngredientDraft)[]>(recipe?.ingredients ?? []);
  const [saving, setSaving] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  const isIngredientSaved = (ing: RecipeIngredient | IngredientDraft): ing is RecipeIngredient => 'id' in ing;

  const totals = ingredients.reduce((acc, ing) => ({
    calories: acc.calories + (ing.calories || 0),
    protein: acc.protein + (ing.protein || 0),
    carbs: acc.carbs + (ing.carbs || 0),
    fat: acc.fat + (ing.fat || 0),
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

  const perServing = {
    calories: Math.round(totals.calories / (+servings || 1)),
    protein: Math.round(totals.protein / (+servings || 1)),
    carbs: Math.round(totals.carbs / (+servings || 1)),
    fat: Math.round(totals.fat / (+servings || 1)),
  };

  const handleAddIngredient = (ing: IngredientDraft) => {
    setIngredients(prev => [...prev, ing]);
    setShowPicker(false);
  };

  const removeDraftIngredient = async (index: number) => {
    const ing = ingredients[index];
    if (isIngredientSaved(ing) && recipe) {
      await deleteIngredient(recipe.id, ing.id);
    }
    setIngredients(prev => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!user || !name.trim()) return;
    setSaving(true);
    try {
      let savedRecipe: Recipe | null = null;
      if (recipe) {
        await updateRecipe(recipe.id, { name, description, servings: +servings });
        savedRecipe = { ...recipe, name, description, servings: +servings };
      } else {
        savedRecipe = await createRecipe({ user_id: user.id, name, description, servings: +servings });
      }
      if (!savedRecipe) { setSaving(false); return; }

      for (const ing of ingredients) {
        if (!isIngredientSaved(ing)) {
          await addIngredient(savedRecipe.id, {
            name: ing.name,
            quantity: ing.quantity,
            unit: ing.unit,
            calories: ing.calories,
            protein: ing.protein,
            carbs: ing.carbs,
            fat: ing.fat,
            order_index: ingredients.indexOf(ing),
          });
        }
      }
      await recomputeMacros(savedRecipe.id);
      toast(recipe ? t('nutrition.recipeForm.updated') : t('nutrition.recipeForm.created'));
      onSaved(savedRecipe);
    } finally {
      setSaving(false);
    }
  };

  if (showPicker) {
    return (
      <IngredientPicker
        onAdd={handleAddIngredient}
        onClose={() => setShowPicker(false)}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black overflow-y-auto animate-fade-in">
      <div className="max-w-lg mx-auto px-4 py-6 animate-fade-in-up">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={onClose} className="p-2 -ml-2 text-neutral-400 hover:text-white transition-colors">
            <ArrowLeft size={20} />
          </button>
          <h2 className="text-xl font-bold text-white flex-1">{recipe ? t('nutrition.recipeForm.editTitle') : t('nutrition.recipeForm.newTitle')}</h2>
          <Button onClick={handleSave} loading={saving} size="sm">{t('common.save')}</Button>
        </div>

        <div className="space-y-4 mb-6">
          <Input label={t('nutrition.recipeForm.recipeName')} value={name} onChange={e => setName(e.target.value)} placeholder={t('nutrition.recipeForm.recipeName')} />
          <Input label={t('nutrition.recipeForm.description')} value={description} onChange={e => setDescription(e.target.value)} placeholder={t('nutrition.recipeForm.description')} />
          <Input label={t('nutrition.recipeForm.servings')} type="number" min="1" value={servings} onChange={e => setServings(e.target.value)} />
        </div>

        {totals.calories > 0 && (
          <Card className="mb-4 bg-blue-600/10 border-blue-500/30">
            <p className="text-xs text-neutral-400 mb-2">{t('nutrition.recipeForm.perServing', { n: servings })}</p>
            <div className="grid grid-cols-4 gap-2 text-center">
              <div>
                <p className="text-base font-bold text-white">{perServing.calories}</p>
                <p className="text-[10px] text-neutral-500">{t('common.kcal')}</p>
              </div>
              <div>
                <p className="text-base font-bold text-blue-400">{perServing.protein}g</p>
                <p className="text-[10px] text-neutral-500">{t('common.protein')}</p>
              </div>
              <div>
                <p className="text-base font-bold text-amber-400">{perServing.carbs}g</p>
                <p className="text-[10px] text-neutral-500">{t('common.carbs')}</p>
              </div>
              <div>
                <p className="text-base font-bold text-rose-400">{perServing.fat}g</p>
                <p className="text-[10px] text-neutral-500">{t('common.fat')}</p>
              </div>
            </div>
          </Card>
        )}

        <div className="mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider">{t('nutrition.recipeForm.ingredients')}</h3>
            <button
              onClick={() => setShowPicker(true)}
              className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors"
            >
              <Plus size={14} /> {t('common.add')}
            </button>
          </div>

          {ingredients.length === 0 && (
            <div className="text-center py-6 text-neutral-500 text-sm border border-neutral-800 rounded-xl">
              {t('nutrition.recipeForm.noIngredients')}
            </div>
          )}

          <div className="space-y-2">
            {ingredients.map((ing, i) => (
              <Card key={i} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{ing.name}</p>
                  <p className="text-xs text-neutral-500">{ing.quantity}{ing.unit} · {Math.round(ing.calories || 0)} kcal</p>
                </div>
                <button onClick={() => removeDraftIngredient(i)} className="p-1.5 text-neutral-600 hover:text-rose-400 transition-colors">
                  <Trash2 size={14} />
                </button>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
