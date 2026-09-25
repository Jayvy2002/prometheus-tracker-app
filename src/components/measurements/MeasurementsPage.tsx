import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Ruler } from 'lucide-react';
import Button from '../ui/Button';
import Card from '../ui/Card';
import EmptyState from '../ui/EmptyState';
import ErrorState from '../ui/ErrorState';
import Input from '../ui/Input';
import DateField from '../ui/DateField';
import Modal from '../ui/Modal';
import Sparkline from '../ui/Sparkline';
import { toast } from '../ui/Toast';
import { useMeasurements } from '../../features/measurements/hooks/useMeasurements';
import {
  MEASUREMENT_SITES,
  buildMeasurementEntries,
  cmToUnit,
  draftForDay,
  isMeasurementSite,
  summarizeBySite,
  type LengthUnit,
  type MeasurementDraft,
  type MeasurementSite,
} from '../../features/measurements/domain/measurements';
import { formatDate, formatNumber, formatSignedNumber, todayStr } from '../../lib/utils';
import { userFacingError } from '../../lib/userFacingError';

/**
 * Vision §14.4 — tours par site. Chaque site a sa courbe ; l'écart est
 * affiché tel quel, sans couleur « bien/mal » ni note globale. L’athlète écrit,
 * son Coach actif lit (viewer = 'coach').
 */
export default function MeasurementsPage({
  userId,
  unit,
  viewer = 'athlete',
}: {
  userId: string;
  unit: LengthUnit;
  viewer?: 'athlete' | 'coach';
}) {
  const { t, i18n } = useTranslation();
  const { rows, loading, error, busy, reload, saveDay, deleteDay } = useMeasurements(userId);
  const summaries = useMemo(() => summarizeBySite(rows), [rows]);
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState(todayStr());
  const [draft, setDraft] = useState<MeasurementDraft>({});
  const [invalid, setInvalid] = useState<MeasurementSite[]>([]);
  const [expanded, setExpanded] = useState<MeasurementSite | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const canWrite = viewer === 'athlete';
  const typed = (value: number) => formatNumber(value, { maxDigits: 1 });
  const savedForDay = useMemo(() => draftForDay(rows, day, unit), [rows, day, unit]);
  const dayHasValues = Object.keys(savedForDay).length > 0;

  const show = (cm: number) => `${formatNumber(cmToUnit(cm, unit))} ${t(`measurements.unit.${unit}`)}`;

  const startEntry = (nextDay: string) => {
    setDay(nextDay);
    setDraft(draftForDay(rows, nextDay, unit, typed));
    setInvalid([]);
    setConfirmDelete(false);
    setOpen(true);
  };

  const changeDay = (nextDay: string) => {
    setDay(nextDay);
    setDraft(draftForDay(rows, nextDay, unit, typed));
    setInvalid([]);
  };

  const save = async () => {
    const { entries, invalid: bad } = buildMeasurementEntries(draft, unit);
    setInvalid(bad);
    if (bad.length) return;
    const cleared = Object.keys(savedForDay)
      .filter(isMeasurementSite)
      .filter(site => !(draft[site] ?? '').trim());
    if (!entries.length && !cleared.length) {
      toast(t('measurements.nothingToSave'), 'error');
      return;
    }
    const result = await saveDay(day, entries, cleared);
    if (result.error) {
      toast(userFacingError(result.error, t('measurements.saveFailed')), 'error');
      return;
    }
    toast(t('measurements.saved'));
    setOpen(false);
  };

  const removeDay = async () => {
    const result = await deleteDay(day);
    if (result.error) {
      toast(userFacingError(result.error, t('measurements.saveFailed')), 'error');
      return;
    }
    toast(t('measurements.deleted'), 'error');
    setOpen(false);
  };

  if (loading && rows.length === 0) {
    return <div className="h-24 rounded-2xl bg-neutral-900 animate-pulse" aria-label={t('common.loading')} />;
  }
  if (error) return <ErrorState title={t('measurements.loadError')} onRetry={() => void reload()} />;

  return (
    <section className="space-y-3" aria-labelledby="measurements-title" data-testid="measurements">
      <div className="flex items-center justify-between gap-3">
        <h2 id="measurements-title" className="text-lg font-semibold text-white flex items-center gap-2">
          <Ruler size={18} className="text-neutral-400" aria-hidden="true" /> {t('measurements.title')}
        </h2>
        {canWrite && summaries.length > 0 && (
          <Button size="sm" onClick={() => startEntry(todayStr())}>
            <Plus size={16} aria-hidden="true" /> {t('measurements.measure')}
          </Button>
        )}
      </div>

      {summaries.length === 0 ? (
        <EmptyState
          title={t(canWrite ? 'measurements.emptyTitle' : 'measurements.emptyCoach')}
          body={canWrite ? t('measurements.emptyBody') : undefined}
          action={canWrite ? (
            <Button size="sm" onClick={() => startEntry(todayStr())}>{t('measurements.measure')}</Button>
          ) : undefined}
        />
      ) : (
        <>
          <ul className="space-y-2">
            {summaries.map(summary => {
              const isOpen = expanded === summary.site;
              const history = rows
                .filter(row => row.site === summary.site)
                .sort((a, b) => b.measured_at.localeCompare(a.measured_at));
              return (
                <li key={summary.site}>
                  <Card className="!p-0">
                    <button
                      type="button"
                      className="w-full min-h-14 px-4 py-3 flex items-center gap-3 text-left"
                      aria-expanded={isOpen}
                      onClick={() => setExpanded(isOpen ? null : summary.site)}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-neutral-400">{t(`measurements.sites.${summary.site}`)}</p>
                        <p className="text-lg font-semibold text-white">{show(summary.latest.value_cm)}</p>
                        <p className="text-xs text-neutral-500">
                          {formatDate(summary.latest.measured_at, i18n.language)}
                          {summary.deltaCm != null && summary.deltaCm !== 0 && (
                            <> · {t('measurements.sincePrevious', {
                              delta: `${formatSignedNumber(cmToUnit(summary.deltaCm, unit))} ${t(`measurements.unit.${unit}`)}`,
                            })}</>
                          )}
                          {summary.deltaCm === 0 && <> · {t('measurements.unchanged')}</>}
                        </p>
                      </div>
                      <Sparkline values={summary.series} className="text-neutral-300" />
                    </button>
                    {isOpen && (
                      <ul className="border-t border-neutral-800 px-4 py-2 space-y-1" aria-label={t('measurements.historyFor', { site: t(`measurements.sites.${summary.site}`) })}>
                        {history.map(row => (
                          <li key={row.id} className="flex items-center justify-between gap-3 min-h-11">
                            <span className="text-sm text-neutral-300">{formatDate(row.measured_at, i18n.language)}</span>
                            <span className="text-sm text-white">{show(row.value_cm)}</span>
                            {canWrite && (
                              <Button size="sm" variant="ghost" onClick={() => startEntry(row.measured_at)}>
                                {t('measurements.correct')}
                              </Button>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-neutral-500">{t(canWrite ? 'measurements.neutralNote' : 'measurements.neutralNoteCoach')}</p>
        </>
      )}

      {canWrite && (
        <Modal open={open} onClose={() => setOpen(false)} title={t(dayHasValues ? 'measurements.editTitle' : 'measurements.addTitle')}>
          <div className="space-y-4">
            <DateField label={t('measurements.date')} value={day} max={todayStr()} onChange={changeDay} />
            <p className="text-xs text-neutral-400">{t('measurements.howTo')}</p>
            <div className="grid grid-cols-2 gap-3">
              {MEASUREMENT_SITES.map(site => (
                <Input
                  key={site}
                  label={`${t(`measurements.sites.${site}`)} (${t(`measurements.unit.${unit}`)})`}
                  type="text"
                  inputMode="decimal"
                  value={draft[site] ?? ''}
                  error={invalid.includes(site) ? t('measurements.invalid') : undefined}
                  onChange={e => setDraft(prev => ({ ...prev, [site]: e.target.value }))}
                />
              ))}
            </div>
            <p className="text-xs text-neutral-500">{t('measurements.onlyWhatYouWant')}</p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void save()} disabled={busy} loading={busy}>{t('common.save')}</Button>
              <Button variant="ghost" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
              {dayHasValues && (
                confirmDelete ? (
                  <Button variant="danger" disabled={busy} onClick={() => void removeDay()}>{t('measurements.confirmDeleteDay')}</Button>
                ) : (
                  <Button variant="ghost" onClick={() => setConfirmDelete(true)}>{t('measurements.deleteDay')}</Button>
                )
              )}
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}
