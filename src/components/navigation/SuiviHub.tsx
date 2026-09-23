import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ExerciseProgressPage from '../workout/ExerciseProgressPage';
import WeightPage from '../weight/WeightPage';
import CalendarPage from '../calendar/CalendarPage';

const VIEWS = ['exercises', 'body', 'calendar'] as const;
type View = (typeof VIEWS)[number];

function viewOf(value: string | null): View {
  return VIEWS.includes(value as View) ? value as View : 'exercises';
}

export default function SuiviHub() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const view = viewOf(params.get('view'));
  const labels: Record<View, string> = {
    exercises: t('nav.progressTraining'),
    body: t('nav.sectionBody'),
    calendar: t('nav.calendar'),
  };

  return (
    <div>
      <Link to="/watch" className="block px-4 pt-4 text-sm text-neutral-300 min-h-11">
        {t('prometheusWatch.title')}
      </Link>
      <div className="px-4 pt-2 flex gap-2" role="tablist" aria-label={t('nav.suivi')}>
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
      {view === 'exercises' ? <ExerciseProgressPage embedded /> : null}
      {view === 'body' ? <WeightPage /> : null}
      {view === 'calendar' ? <CalendarPage /> : null}
    </div>
  );
}
