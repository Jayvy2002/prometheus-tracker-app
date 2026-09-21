import { useTranslation } from 'react-i18next';
import { coachHasVerifiedBadge, publicQualifications, qualificationEffectiveStatus, type CoachQualification } from '../../lib/marketplace';

export default function QualificationList({ rows }: { rows: CoachQualification[] }) {
  const { t } = useTranslation();
  const visible = publicQualifications(rows);
  const badge = coachHasVerifiedBadge(rows);
  return (
    <section className="space-y-3">
      <h3 className="font-semibold text-white">{t('marketplace.qualifications')}</h3>
      {badge && <p className="text-sm text-blue-300">{t('marketplace.verifiedBadge')}</p>}
      {!badge && <p className="text-sm text-neutral-500">{t('marketplace.noVerifiedBadge')}</p>}
      {!visible.length && <p className="text-sm text-neutral-400">{t('marketplace.noQualifications')}</p>}
      {visible.map(row => {
        const status = qualificationEffectiveStatus(row);
        return (
          <article key={row.id} className="rounded-xl border border-neutral-800 p-3 space-y-1">
            <p className="font-medium text-white">{row.title}</p>
            <p className="text-sm text-neutral-400">{row.issuer} · {t(`marketplace.qualType_${row.qualification_type}`)}</p>
            <p className="text-sm text-neutral-300">{t(`marketplace.qualStatus_${status}`)}</p>
          </article>
        );
      })}
    </section>
  );
}
