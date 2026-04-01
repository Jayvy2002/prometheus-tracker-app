import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, ChefHat, Pencil, Trash2, Search } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useRecipeStore } from '../../stores/recipeStore';
import type { Recipe } from '../../lib/types';
import { toast } from '../ui/Toast';
import PageTransition from '../ui/PageTransition';
import RecipeForm from './RecipeForm';

export default function RecipesPage() {
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
    toast('Recipe deleted', 'info');
    setConfirmDelete(null);
  };

  const handleSaved = (_recipe: Recipe) => {
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
            onClick={() => navigate('/nutrition')}
            className="p-2 -ml-2 text-neutral-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-2xl font-bold text-white flex-1">Recipes</h1>
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-xl transition-colors"
          >
            <Plus size={15} />
            New
          </button>
        </div>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" size={16} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search recipes..."
            className="w-full bg-neutral-900 border border-neutral-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-neutral-600"
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
              {search ? 'No recipes match your search' : 'No recipes yet'}
            </p>
            {!search && (
              <p className="text-neutral-600 text-sm mt-1">
                Create your first recipe to track meals easily
              </p>
            )}
            {!search && (
              <button
                onClick={() => setShowNew(true)}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-xl transition-colors"
              >
                <Plus size={15} />
                Create Recipe
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
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-xs text-neutral-400">
                        <span className="font-medium text-white">{recipe.calories_per_serving}</span> kcal
                      </span>
                      <span className="text-xs text-neutral-600">·</span>
                      <span className="text-xs text-blue-400">
                        P <span className="font-medium">{recipe.protein_per_serving}g</span>
                      </span>
                      <span className="text-xs text-amber-400">
                        C <span className="font-medium">{recipe.carbs_per_serving}g</span>
                      </span>
                      <span className="text-xs text-rose-400">
                        F <span className="font-medium">{recipe.fat_per_serving}g</span>
                      </span>
                      <span className="text-xs text-neutral-600 ml-auto">
                        {recipe.servings} serving{recipe.servings !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => setEditing(recipe)}
                      className="p-2 text-neutral-500 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => setConfirmDelete(recipe.id)}
                      className="p-2 text-neutral-500 hover:text-rose-400 rounded-lg hover:bg-neutral-800 transition-colors"
                    >
                      <Trash2 size={14} />
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
            <h3 className="text-base font-semibold text-white mb-1">Delete Recipe</h3>
            <p className="text-sm text-neutral-400 mb-5">This action cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 py-2.5 rounded-xl bg-neutral-800 text-neutral-300 text-sm font-medium hover:bg-neutral-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-medium transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </PageTransition>
  );
}
