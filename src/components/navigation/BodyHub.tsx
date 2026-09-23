import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import NutritionPage from '../nutrition/NutritionPage';
import WeightPage from '../weight/WeightPage';
import CheckInPage from '../checkin/CheckInPage';

const VIEWS = ['nutrition', 'weight', 'checkin'] as const;
type View = (typeof VIEWS)[number];

function viewOf(value: string | null): View {
  return VIEWS.includes(value as View) ? value as View : 'nutrition';
}

export default function BodyHub() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const view = viewOf(params.get('view'));
  const labels: Record<View, string> = {
    nutrition: t('nav.nutrition'),
    weight: t('nav.weight'),
    checkin: t('nav.checkin'),
  };

  return (
    <div>
      <div className="px-4 pt-4 flex gap-2" role="tablist" aria-label={t('nav.sectionBody')}>
        {VIEWS.map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={view === item}
            onClick={() => setParams({ view: item })}
            className={`min-h-11 flex-1 rounded-xl px-3 text-sm font-medium ${view === item ? 'bg-blue-600 text-white' : 'bg-neutral-900 text-neutral-300'}`}
          >
            {labels[item]}
          </button>
        ))}
      </div>
      {view === 'nutrition' ? <NutritionPage /> : null}
      {view === 'weight' ? <WeightPage /> : null}
      {view === 'checkin' ? <CheckInPage /> : null}
    </div>
  );
}
