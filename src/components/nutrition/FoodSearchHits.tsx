import { useTranslation } from 'react-i18next';
import { Clock, Database, Globe, Star } from 'lucide-react';
import { foodProvenanceKey, foodProvenanceKind } from '../../lib/foodProvenance';
import type { RankedFoodHit } from '../../lib/pickerSearch';

interface Props {
  results: RankedFoodHit[];
  onSelect: (hit: RankedFoodHit) => void;
}

function SourceIcon({ source }: { source: RankedFoodHit['_source'] }) {
  if (source === 'favorite') return <Star size={11} className="text-amber-400 fill-amber-400 shrink-0 mt-0.5" />;
  if (source === 'recent') return <Clock size={11} className="text-neutral-500 shrink-0 mt-0.5" />;
  if (source === 'openfoodfacts') return <Globe size={11} className="text-emerald-500 shrink-0 mt-0.5" />;
  return <Database size={11} className="text-blue-400 shrink-0 mt-0.5" />;
}

export default function FoodSearchHits({ results, onSelect }: Props) {
  const { t } = useTranslation();
  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl max-h-52 overflow-y-auto">
      {results.map((p, i) => (
        <button
          key={`${p.barcode || p.id || i}`}
          type="button"
          onClick={() => onSelect(p)}
          className="w-full text-left px-3 py-2.5 text-sm text-neutral-300 hover:bg-neutral-800 transition-colors border-b border-neutral-800/50 last:border-0"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1 flex items-start gap-1.5">
              <SourceIcon source={p._source} />
              <div className="min-w-0">
                <span className="font-medium text-white">{p.name}</span>
                {p.brand && <span className="text-neutral-500 ml-1.5 text-xs">{p.brand}</span>}
              </div>
            </div>
            <span className="text-xs text-neutral-500 whitespace-nowrap">{Math.round(p.calories_per_100g)} cal</span>
          </div>
          <div className="text-[11px] text-neutral-600 mt-0.5 pl-[18px]">
            {t(foodProvenanceKey(foodProvenanceKind(p)))}
            {' · '}
            P: {Math.round(p.protein_per_100g)}g | C: {Math.round(p.carbs_per_100g)}g | F: {Math.round(p.fat_per_100g)}g / 100g
          </div>
        </button>
      ))}
    </div>
  );
}
