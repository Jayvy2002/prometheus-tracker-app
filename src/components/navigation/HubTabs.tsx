import { useTranslation } from 'react-i18next';

/** Segmented control shared by the Corps and Suivi hubs. */
export default function HubTabs<V extends string>({
  label,
  views,
  value,
  labels,
  onChange,
}: {
  label: string;
  views: readonly V[];
  value: V;
  labels: Record<V, string>;
  onChange: (next: V) => void;
}) {
  const { t } = useTranslation();
  if (views.length < 2) return null;
  return (
    <div className="px-4 pt-4 flex gap-1 rounded-xl" role="tablist" aria-label={label || t('nav.sectionBody')}>
      {views.map(item => (
        <button
          key={item}
          type="button"
          role="tab"
          aria-selected={value === item}
          onClick={() => onChange(item)}
          className={`min-h-11 flex-1 rounded-xl px-3 text-sm font-medium ${value === item ? 'bg-blue-600 text-white' : 'bg-neutral-900 text-neutral-300'}`}
        >
          {labels[item]}
        </button>
      ))}
    </div>
  );
}
