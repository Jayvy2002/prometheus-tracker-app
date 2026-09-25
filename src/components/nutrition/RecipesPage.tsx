import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, ChefHat, Pencil, Trash2, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import { useRecipeStore } from '../../stores/recipeStore';
import type { Recipe } from '../../lib/types';
import { toast } from '../ui/Toast';
import PageTransition from '../ui/PageTransition';
import RecipeForm from './RecipeForm';


export default function RecipesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { recipes, loading, fetchRecipes, deleteRecipe } = useRecipeStore();


  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Recipe | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    if (user) fetchRecipes(user.id);
  }, [user]);

  const filtered = recipes.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    (r.description ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const handleDelete = async (id: string) => {
    await deleteRecipe(id);
    toast(t('nutrition.recipes.deleteTitle'), 'info');
    setConfirmDelete(null);
  };

  const handleSaved = () => {
    setShowNew(false);
    setEditing(null);
    if (user) fetchRecipes(user.id);
  };

  if (showNew) {
    return (
      <RecipeForm
        onClose={() => setShowNew(false)}
        onSaved={handleSaved}
      />
    );
  }

  if (editing) {
    return (
      <RecipeForm
        recipe={editing}
        onClose={() => setEditing(null)}
        onSaved={handleSaved}
      />
    );
  }

  return (
    <PageTransition>
      <div className="px-4 pt-6 pb-24">
        <div className="flex items-center gap-3 mb-6">
          <button
            type="button"
            onClick={() => navigate('/nutrition')}
            aria-label={t('common.back')}
            className="inline-flex min-h-11 min-w-11 items-center justify-center -ml-3 rounded-xl text-neutral-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={20} aria-hidden="true" />
          </button>
          <h1 className="text-2xl font-bold text-white flex-1">{t('nutrition.recipes.title')}</h1>
          <button
            type="button"
            onClick={() => setShowNew(true)}
            className="flex min-h-11 items-center gap-1.5 px-3 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-xl transition-colors"
          >
            <Plus size={15} />
            {t('common.new')}
          </button>
        </div>


        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" size={16} />
          <input
            aria-label={t('common.search')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('nutrition.recipes.searchPlaceholder')}
            className="w-full bg-neutral-900 border border-neutral-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-[#525252]"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-14 h-14 rounded-2xl bg-neutral-900 flex items-center justify-center mx-auto mb-4">
              <ChefHat size={24} className="text-neutral-600" />
            </div>
            <p className="text-neutral-400 font-medium">
              {search ? t('nutrition.recipes.noMatch') : t('nutrition.recipes.noRecipes')}
            </p>
            {!search && (
              <p className="text-neutral-600 text-sm mt-1">
                {t('nutrition.recipes.createFirstRecipe')}
              </p>
            )}
            {!search && (
              <button
                onClick={() => setShowNew(true)}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-xl transition-colors"
              >
                <Plus size={15} />
                {t('nutrition.recipes.createRecipe')}
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((recipe, i) => (
              <div
                key={recipe.id}
                className="bg-neutral-900/60 border border-neutral-800/50 rounded-2xl p-4 animate-fade-in-up"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-600/15 border border-blue-500/20 flex items-center justify-center shrink-0">
                    <ChefHat size={18} className="text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-white truncate">{recipe.name}</p>
                    {recipe.description ? (
                      <p className="text-xs text-neutral-500 mt-0.5 truncate">{recipe.description}</p>
                    ) : null}
                    {/* Wraps on a narrow phone; macros use the shared P · G · L wording. */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
                      <span className="text-xs font-medium text-white">
                        {t('nutrition.kcalPerServing', { value: recipe.calories_per_serving })}
                      </span>
                      <span className="text-xs text-neutral-400">
                        {t('nutrition.macrosShort', { p: recipe.protein_per_serving, c: recipe.carbs_per_serving, f: recipe.fat_per_serving })}
                      </span>
                      <span className="text-xs text-neutral-500">
                        {recipe.servings} {t(recipe.servings === 1 ? 'nutrition.recipes.serving' : 'nutrition.recipes.servings')}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setEditing(recipe)}
                      aria-label={`${t('common.edit')} ${recipe.name}`}
                      className="inline-flex min-h-11 min-w-11 items-center justify-center text-neutral-400 hover:text-white rounded-xl hover:bg-neutral-800 transition-colors"
                    >
                      <Pencil size={16} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(recipe.id)}
                      aria-label={`${t('common.delete')} ${recipe.name}`}
                      className="inline-flex min-h-11 min-w-11 items-center justify-center text-neutral-400 hover:text-rose-400 rounded-xl hover:bg-neutral-800 transition-colors"
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 w-full max-w-sm animate-fade-in-up">
            <h3 className="text-base font-semibold text-white mb-1">{t('nutrition.recipes.deleteTitle')}</h3>
            <p className="text-sm text-neutral-400 mb-5">{t('common.cannotBeUndone')}</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="flex-1 py-2.5 rounded-xl bg-neutral-800 text-neutral-300 text-sm font-medium hover:bg-neutral-700 transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={() => handleDelete(confirmDelete)}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-medium transition-colors"
              >
                {t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageTransition>
  );
}
