import { useTranslation } from 'react-i18next';
import {
  EXTRA_CARDIO_OPTIONS,
  EXTRA_OCCUPATION_OPTIONS,
  EXTRA_SLEEP_OPTIONS,
  ORIGINAL_LABELS_EN,
  ORIGINAL_LABELS_FR,
  ORIGINAL_QUESTION_IDS,
  formatAnswer,
  parseIntake,
  type KinesiologyIntake,
  type OriginalQuestionId,
} from '../../lib/kinesiologyIntake';
import Card from '../ui/Card';

function originalLabel(id: OriginalQuestionId, en: boolean) {
  return en ? ORIGINAL_LABELS_EN[id] : ORIGINAL_LABELS_FR[id];
}

function Row({ label, value }: { label: string; value: string }) {
  if (!value.trim()) {
    return (
      <div className="py-2 border-b border-neutral-800/60 last:border-0">
        <p className="text-xs text-neutral-500">{label}</p>
        <p className="text-sm text-neutral-600 mt-0.5">—</p>
      </div>
    );
  }
  return (
    <div className="py-2 border-b border-neutral-800/60 last:border-0">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="text-sm text-white mt-0.5 whitespace-pre-wrap">{value}</p>
    </div>
  );
}

function extrasDisplay(intake: KinesiologyIntake, t: (key: string) => string, en: boolean) {
  const extras = intake.extras;
  const occ = EXTRA_OCCUPATION_OPTIONS.find(o => o.value === extras.occupation);
  const sleep = EXTRA_SLEEP_OPTIONS.find(o => o.value === extras.sommeil);
  const cardio = EXTRA_CARDIO_OPTIONS.find(o => o.value === extras.cardio);
  const days = extras.joursDispo.map(d => t(`intake.weekdays.${d}`)).join(', ');
  return [
    { label: t('intake.extras.poidsVise'), value: extras.poidsViseKg },
    { label: t('intake.extras.occupation'), value: occ ? (en ? occ.labelEn : occ.labelFr) : '' },
    { label: t('intake.extras.dateCible'), value: extras.dateCible },
    { label: t('intake.extras.pourquoiMaintenant'), value: extras.pourquoiMaintenant },
    { label: t('intake.extras.joursDispo'), value: days },
    { label: t('intake.extras.douleurOu'), value: extras.douleurOu },
    { label: t('intake.extras.douleurIntensite'), value: extras.douleurIntensite },
    { label: t('intake.extras.douleurDepuis'), value: extras.douleurDepuis },
    { label: t('intake.extras.physioEnCours'), value: extras.physioEnCours },
    { label: t('intake.extras.blessureAnnee'), value: extras.blessureAnnee },
    { label: t('intake.extras.blessureSuivi'), value: extras.blessureSuivi },
    { label: t('intake.extras.medicamentsEffort'), value: extras.medicamentsEffort },
    { label: t('intake.extras.grossesse'), value: extras.grossessePostpartumTraitement },
    { label: t('intake.extras.sommeil'), value: sleep ? (en ? sleep.labelEn : sleep.labelFr) : '' },
    { label: t('intake.extras.cardio'), value: cardio ? (en ? cardio.labelEn : cardio.labelFr) : '' },
  ];
}

export default function KinesiologyIntakeReview({
  raw,
}: {
  raw: unknown;
}) {
  const { t, i18n } = useTranslation();
  const en = i18n.language.toLowerCase().startsWith('en');
  const intake = parseIntake(raw);
  const extraRows = extrasDisplay(intake, t, en);

  return (
    <div className="space-y-4">
      <Card>
        <p className="text-sm font-medium text-white mb-2">{t('intake.reviewOriginal')}</p>
        {ORIGINAL_QUESTION_IDS.map(id => (
          <Row key={id} label={originalLabel(id, en)} value={formatAnswer(intake, id)} />
        ))}
      </Card>
      <Card>
        <p className="text-sm font-medium text-amber-200 mb-1">{t('intake.extrasTitle')}</p>
        <p className="text-xs text-neutral-500 mb-2">{t('intake.extrasHint')}</p>
        {extraRows.map(row => (
          <Row key={row.label} label={row.label} value={row.value} />
        ))}
      </Card>
    </div>
  );
}
