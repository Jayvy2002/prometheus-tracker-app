import { useTranslation } from 'react-i18next';
import type { MarketplaceReport } from '../../lib/marketplace';

export default function MarketplaceReportsList({ rows }: { rows: MarketplaceReport[] }) {
  const { t, i18n } = useTranslation();
  return (
    <section className="space-y-3">
      <h2 className="font-semibold text-white">{t('marketplace.myReports')}</h2>
      <p className="text-sm text-neutral-400">{t('marketplace.reportHelp')}</p>
      {!rows.length && <p className="text-sm text-neutral-400">{t('marketplace.noReports')}</p>}
      {rows.map(row => (
        <article key={row.id} className="space-y-1 rounded-xl border border-neutral-800 p-3">
          <p className="text-sm text-white">{t(`marketplace.reportSubject_${row.subject_type}`)} · {t(`marketplace.reportCategory_${row.category}`)}</p>
          <p className="text-sm text-neutral-300">{t(`marketplace.reportStatus_${row.status}`)}</p>
          <time className="block text-xs text-neutral-500" dateTime={row.created_at}>{new Date(row.created_at).toLocaleDateString(i18n.language)}</time>
        </article>
      ))}
    </section>
  );
}
