import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Upload } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useCoachingStore } from '../../stores/coachingStore';
import { useResourcePermissions } from '../../lib/useResourcePermissions';
import { displayName } from '../../lib/coachText';
import Button from '../ui/Button';
import Card from '../ui/Card';
import PageTransition from '../ui/PageTransition';
import { toast } from '../ui/Toast';
import { commitCoachImport, getCoachImport, previewCoachImport, type CoachImportView } from '../../features/imports/api/coachImportApi';
import {
  COLUMN_ROLES,
  detectColumns,
  mappingIssues,
  proposeMapping,
  unresolvedAmbiguities,
  unresolvedDuplicateHeaders,
  type ColumnRole,
  type DateFormat,
  type ImportKind,
  type ImportMapping,
  type MeasureUnit,
  type RpeMode,
} from '../../features/imports/domain/columns';
import { CsvParseError, parseCsvText, type ParsedCsv } from '../../features/imports/domain/csvParse';
import { importErrorI18nKey } from '../../features/imports/domain/errors';
import { IMPORT_MAX_BYTES } from '../../features/imports/domain/limits';
import { planImportRows } from '../../features/imports/domain/preview';

type Step = 'file' | 'map' | 'preview' | 'done';

function newKey(): string {
  return crypto.randomUUID();
}

function roleLabel(t: (key: string) => string, role: ColumnRole): string {
  return t(`coaching.importCsv.roles.${role}`);
}

export default function CoachImportPage() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { canActAsCoach, canImportCoachSpreadsheet } = useResourcePermissions();
  const { clients, fetchClients } = useCoachingStore();
  const [params] = useSearchParams();
  const requested = params.get('subject');

  const [subjectId, setSubjectId] = useState<string>(requested && requested !== 'self' ? requested : (user?.id ?? ''));
  const [step, setStep] = useState<Step>('file');
  const [filename, setFilename] = useState('');
  const [sourceText, setSourceText] = useState('');
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [kind, setKind] = useState<ImportKind>('workout');
  const [mapping, setMapping] = useState<ImportMapping | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(newKey);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [serverView, setServerView] = useState<CoachImportView | null>(null);

  useEffect(() => {
    fetchClients();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user) return;
    if (requested === 'self' || !requested) setSubjectId(user.id);
  }, [requested, user]);

  const detections = useMemo(() => (parsed ? detectColumns(parsed.headers) : []), [parsed]);
  const ambiguities = mapping && parsed ? unresolvedAmbiguities(detections, mapping) : [];
  const issues = mapping && parsed ? mappingIssues(mapping, parsed.headers.length, detections) : [];
  const duplicateHeaders = mapping ? unresolvedDuplicateHeaders(detections, mapping) : [];
  const localPreview = parsed && mapping ? planImportRows(parsed.rows, mapping, detections) : null;
  const ownedClients = clients.filter((client) => (
    canImportCoachSpreadsheet({ subjectUserId: client.id, hasActiveRelationship: true })
  ));
  const subjectAllowed = canImportCoachSpreadsheet({
    subjectUserId: subjectId,
    hasActiveRelationship: ownedClients.some((client) => client.id === subjectId),
  });

  if (!canActAsCoach) return <Navigate to="/dashboard" replace />;

  const resetFile = () => {
    setStep('file');
    setFilename('');
    setSourceText('');
    setParsed(null);
    setMapping(null);
    setServerView(null);
    setLocalError(null);
    setIdempotencyKey(newKey());
  };

  const applyKind = (next: ImportKind) => {
    if (!parsed) return;
    setKind(next);
    setMapping(proposeMapping(next, detectColumns(parsed.headers), parsed.delimiter));
    setServerView(null);
  };

  const assignRole = (index: number, role: ColumnRole | 'ignored') => {
    if (!mapping) return;
    const columns = { ...mapping.columns };
    for (const key of Object.keys(columns) as ColumnRole[]) {
      if (columns[key] === index) delete columns[key];
    }
    const ignored = mapping.ignored.filter((value) => value !== index);
    if (role === 'ignored') ignored.push(index);
    else columns[role] = index;
    setMapping({ ...mapping, columns, ignored });
    setServerView(null);
  };

  const onFile = async (file: File | null) => {
    if (!file) return;
    setLocalError(null);
    if (file.size > IMPORT_MAX_BYTES) {
      setLocalError(t('coaching.importCsv.errors.file_too_large'));
      return;
    }
    const text = await file.text();
    try {
      const next = parseCsvText(text);
      const nextMapping = proposeMapping(kind, detectColumns(next.headers), next.delimiter);
      setFilename(file.name.slice(0, 200));
      setSourceText(next.sourceText);
      setParsed(next);
      setMapping(nextMapping);
      setServerView(null);
      setIdempotencyKey(newKey());
      setStep('map');
    } catch (err) {
      const code = err instanceof CsvParseError ? err.code : 'malformed_csv';
      setLocalError(t(importErrorI18nKey(code)));
    }
  };

  const runPreview = async () => {
    if (!parsed || !mapping || !subjectId) return;
    if (ambiguities.length || issues.length) {
      setLocalError(t('coaching.importCsv.fixBeforePreview'));
      return;
    }
    setBusy(true);
    setLocalError(null);
    const result = await previewCoachImport({
      subjectUserId: subjectId,
      filename,
      sourceText,
      mapping,
      idempotencyKey,
    });
    setBusy(false);
    if (result.error || !result.data) {
      setLocalError(t(importErrorI18nKey(result.error ?? 'generic')));
      toast(t(importErrorI18nKey(result.error ?? 'generic')), 'error');
      return;
    }
    setServerView(result.data);
    setStep('preview');
  };

  const loadPage = async (offset: number, errorsOnly: boolean) => {
    if (!serverView) return;
    setBusy(true);
    setLocalError(null);
    const result = await getCoachImport(serverView.import_id, { offset, limit: 50, errorsOnly });
    setBusy(false);
    if (result.error || !result.data) {
      setLocalError(t(importErrorI18nKey(result.error ?? 'generic')));
      return;
    }
    setServerView(result.data);
  };

  const runCommit = async () => {
    if (!serverView || !mapping) return;
    if (serverView.ready_count < 1) {
      setLocalError(t('coaching.importCsv.errors.nothing_to_import'));
      return;
    }
    setBusy(true);
    setLocalError(null);
    const result = await commitCoachImport({
      importId: serverView.import_id,
      sourceText,
      mapping,
    });
    setBusy(false);
    if (result.error || !result.data) {
      setLocalError(t(importErrorI18nKey(result.error ?? 'generic')));
      toast(t(importErrorI18nKey(result.error ?? 'generic')), 'error');
      return;
    }
    setServerView(result.data);
    setStep('done');
  };

  return (
    <PageTransition>
      <div className="px-4 pt-6 pb-28 max-w-lg mx-auto">
        <Link to="/clients" className="flex items-center gap-2 text-neutral-400 hover:text-white mb-4">
          <ArrowLeft size={18} /> {t('nav.clients')}
        </Link>
        <h1 className="text-xl font-bold text-white mb-1">{t('coaching.importCsv.title')}</h1>
        <p className="text-sm text-neutral-500 mb-6">{t('coaching.importCsv.subtitle')}</p>

        <label className="block mb-4">
          <span className="text-xs font-medium text-neutral-400">{t('coaching.importCsv.subject')}</span>
          <select
            className="mt-1 w-full min-h-11 bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white"
            value={subjectId}
            onChange={(event) => {
              setSubjectId(event.target.value);
              resetFile();
            }}
          >
            {user ? <option value={user.id}>{t('coaching.importCsv.myself')}</option> : null}
            {ownedClients.map((client) => (
              <option key={client.id} value={client.id}>{displayName(client)}</option>
            ))}
          </select>
        </label>

        {!subjectAllowed ? (
          <p className="text-sm text-amber-200 mb-4">{t('coaching.importCsv.errors.not_your_client')}</p>
        ) : null}

        {localError ? <p className="text-sm text-amber-200 mb-4">{localError}</p> : null}

        {step === 'file' ? (
          <label className="block rounded-2xl border border-dashed border-neutral-700 p-8 text-center cursor-pointer hover:border-blue-500">
            <Upload className="mx-auto mb-3 text-neutral-400" />
            <p className="text-sm text-white">{t('coaching.importCsv.drop')}</p>
            <p className="text-xs text-neutral-500 mt-1">{t('coaching.importCsv.dropHint')}</p>
            <input
              type="file"
              accept=".csv,text/csv,text/plain"
              className="sr-only"
              onChange={(event) => void onFile(event.target.files?.[0] ?? null)}
            />
          </label>
        ) : null}

        {step === 'map' && parsed && mapping ? (
          <div className="space-y-4">
            <Card>
              <p className="text-sm text-white">{t('coaching.importCsv.understood', { file: filename, rows: parsed.rows.length })}</p>
            </Card>
            <div className="flex gap-2">
              {(['workout', 'body_weight'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => applyKind(value)}
                  className={`flex-1 min-h-11 rounded-xl text-sm ${kind === value ? 'bg-blue-600 text-white' : 'bg-neutral-900 text-neutral-300 border border-neutral-800'}`}
                >
                  {t(`coaching.importCsv.kinds.${value}`)}
                </button>
              ))}
            </div>
            <section>
              <h2 className="text-xs uppercase tracking-wider text-neutral-500 mb-2">{t('coaching.importCsv.certain')}</h2>
              {detections.filter((row) => row.confidence === 'certain').map((row) => (
                <p key={row.index} className="text-sm text-neutral-300">{row.header} → {roleLabel(t, row.candidates[0])}</p>
              ))}
            </section>
            {duplicateHeaders.length > 0 ? (
              <section>
                <h2 className="text-xs uppercase tracking-wider text-neutral-500 mb-2">{t('coaching.importCsv.duplicateHeader')}</h2>
                <p className="text-xs text-neutral-500 mb-2">{t('coaching.importCsv.duplicateHeaderHint')}</p>
                {duplicateHeaders.map((row) => (
                  <label key={row.index} className="block mb-2">
                    <span className="text-sm text-white">{row.header}</span>
                    <select
                      className="mt-1 w-full min-h-11 bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white"
                      value={
                        Object.entries(mapping.columns).find(([, index]) => index === row.index)?.[0]
                        ?? (mapping.ignored.includes(row.index) ? 'ignored' : '')
                      }
                      onChange={(event) => {
                        const value = event.target.value;
                        if (!value) return;
                        assignRole(row.index, value as ColumnRole | 'ignored');
                      }}
                    >
                      <option value="">{t('coaching.importCsv.chooseMeaning')}</option>
                      {(row.candidates.length ? row.candidates : COLUMN_ROLES).map((role) => (
                        <option key={role} value={role}>{roleLabel(t, role)}</option>
                      ))}
                      <option value="ignored">{t('coaching.importCsv.ignoreColumn')}</option>
                    </select>
                  </label>
                ))}
              </section>
            ) : null}
            <section>
              <h2 className="text-xs uppercase tracking-wider text-neutral-500 mb-2">{t('coaching.importCsv.ambiguous')}</h2>
              {detections.filter((row) => row.confidence === 'ambiguous').length === 0 ? (
                <p className="text-sm text-neutral-500">{t('coaching.importCsv.noAmbiguous')}</p>
              ) : detections.filter((row) => row.confidence === 'ambiguous').map((row) => (
                <label key={row.index} className="block mb-2">
                  <span className="text-sm text-white">{row.header}</span>
                  <p className="text-xs text-neutral-500">{t('coaching.importCsv.ambiguousHint')}</p>
                  <select
                    className="mt-1 w-full min-h-11 bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white"
                    value={
                      Object.entries(mapping.columns).find(([, index]) => index === row.index)?.[0]
                      ?? (mapping.ignored.includes(row.index) ? 'ignored' : '')
                    }
                    onChange={(event) => {
                      const value = event.target.value;
                      if (!value) return;
                      assignRole(row.index, value as ColumnRole | 'ignored');
                    }}
                  >
                    <option value="">{t('coaching.importCsv.chooseMeaning')}</option>
                    {row.candidates.map((role) => (
                      <option key={role} value={role}>{roleLabel(t, role)}</option>
                    ))}
                    <option value="ignored">{t('coaching.importCsv.ignoreColumn')}</option>
                  </select>
                </label>
              ))}
            </section>
            <section>
              <h2 className="text-xs uppercase tracking-wider text-neutral-500 mb-2">{t('coaching.importCsv.unknown')}</h2>
              {detections.filter((row) => row.confidence === 'unknown').map((row) => (
                <label key={row.index} className="block mb-2">
                  <span className="text-sm text-neutral-300">{row.header}</span>
                  <select
                    className="mt-1 w-full min-h-11 bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white"
                    value={
                      Object.entries(mapping.columns).find(([, index]) => index === row.index)?.[0]
                      ?? 'ignored'
                    }
                    onChange={(event) => assignRole(row.index, event.target.value as ColumnRole | 'ignored')}
                  >
                    <option value="ignored">{t('coaching.importCsv.ignoreColumn')}</option>
                    {COLUMN_ROLES.map((role) => (
                      <option key={role} value={role}>{roleLabel(t, role)}</option>
                    ))}
                  </select>
                </label>
              ))}
            </section>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-neutral-400">
                {t('coaching.importCsv.dateFormat')}
                <select
                  className="mt-1 w-full min-h-11 bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white"
                  value={mapping.date_format}
                  onChange={(event) => setMapping({ ...mapping, date_format: event.target.value as DateFormat })}
                >
                  <option value="iso">{t('coaching.importCsv.formats.iso')}</option>
                  <option value="dmy">{t('coaching.importCsv.formats.dmy')}</option>
                  <option value="mdy">{t('coaching.importCsv.formats.mdy')}</option>
                </select>
              </label>
              <label className="text-xs text-neutral-400">
                {kind === 'body_weight' ? t('coaching.importCsv.bodyUnit') : t('coaching.importCsv.loadUnit')}
                <select
                  className="mt-1 w-full min-h-11 bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white"
                  value={kind === 'body_weight' ? mapping.body_weight_unit : mapping.load_unit}
                  onChange={(event) => {
                    const unit = event.target.value as MeasureUnit;
                    setMapping(kind === 'body_weight'
                      ? { ...mapping, body_weight_unit: unit }
                      : { ...mapping, load_unit: unit });
                  }}
                >
                  <option value="kg">kg</option>
                  <option value="lb">lb</option>
                </select>
              </label>
            </div>
            {kind === 'workout' ? (
              <label className="text-xs text-neutral-400 block">
                {t('coaching.importCsv.rpeMode')}
                <select
                  className="mt-1 w-full min-h-11 bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white"
                  value={mapping.rpe_mode}
                  onChange={(event) => setMapping({ ...mapping, rpe_mode: event.target.value as RpeMode })}
                >
                  <option value="notes">{t('coaching.importCsv.rpeNotes')}</option>
                  <option value="convert_to_rir">{t('coaching.importCsv.rpeToRir')}</option>
                </select>
              </label>
            ) : null}
            {localPreview ? (
              <p className="text-sm text-neutral-400">
                {t('coaching.importCsv.localCounts', {
                  ready: localPreview.readyCount,
                  ignored: localPreview.ignoredCount,
                  error: localPreview.errorCount,
                })}
              </p>
            ) : null}
            <Button onClick={() => void runPreview()} loading={busy} disabled={!subjectAllowed}>
              {t('coaching.importCsv.seePlan')}
            </Button>
          </div>
        ) : null}

        {step === 'preview' && serverView ? (
          <div className="space-y-4">
            <Card>
              <p className="text-sm text-white">{t('coaching.importCsv.exactPlan')}</p>
              <p className="text-sm text-neutral-400 mt-1">
                {t('coaching.importCsv.localCounts', {
                  ready: serverView.ready_count,
                  ignored: serverView.ignored_count,
                  error: serverView.error_count,
                })}
              </p>
            </Card>
            <div className="space-y-2">
              {serverView.rows.map((row) => (
                <Card key={row.row_no}>
                  <p className="text-xs text-neutral-500">{t('coaching.importCsv.row', { n: row.row_no })} · {t(`coaching.importCsv.status.${row.status}`)}</p>
                  {row.error_code ? (
                    <p className="text-sm text-amber-200">{t(importErrorI18nKey(row.error_code))}</p>
                  ) : (
                    <p className="text-sm text-neutral-200">
                      {String(row.planned?.date ?? '')}
                      {row.planned?.exercise ? ` · ${String(row.planned.exercise)}` : ''}
                      {row.planned?.reps != null ? ` · ${String(row.planned.reps)}` : ''}
                      {row.planned?.load_kg != null ? ` · ${String(row.planned.load_kg)} kg` : ''}
                      {row.planned?.body_weight_kg != null ? ` · ${String(row.planned.body_weight_kg)} kg` : ''}
                    </p>
                  )}
                </Card>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {serverView.error_count > 0 ? (
                <Button variant="secondary" onClick={() => void loadPage(0, true)} loading={busy}>
                  {t('coaching.importCsv.showErrors')}
                </Button>
              ) : null}
              {serverView.row_offset > 0 ? (
                <Button variant="secondary" onClick={() => void loadPage(Math.max(0, serverView.row_offset - 50), serverView.errors_only)} loading={busy}>
                  {t('coaching.importCsv.prevPage')}
                </Button>
              ) : null}
              {serverView.row_offset + serverView.rows.length < (serverView.errors_only ? serverView.error_count : serverView.row_count) ? (
                <Button variant="secondary" onClick={() => void loadPage(serverView.row_offset + serverView.rows.length, serverView.errors_only)} loading={busy}>
                  {t('coaching.importCsv.nextPage')}
                </Button>
              ) : null}
              <Button variant="secondary" onClick={() => setStep('map')}>{t('coaching.importCsv.correct')}</Button>
              <Button onClick={() => void runCommit()} loading={busy} disabled={serverView.ready_count < 1}>
                {t('coaching.importCsv.confirm')}
              </Button>
            </div>
          </div>
        ) : null}

        {step === 'done' && serverView ? (
          <Card className="space-y-2">
            <p className="text-sm text-white">{t('coaching.importCsv.resultTitle')}</p>
            <p className="text-sm text-neutral-300">
              {t('coaching.importCsv.resultBody', {
                applied: serverView.applied_count,
                ignored: serverView.ignored_count,
                error: serverView.error_count,
              })}
            </p>
            <Button variant="secondary" onClick={resetFile}>{t('coaching.importCsv.another')}</Button>
          </Card>
        ) : null}
      </div>
    </PageTransition>
  );
}
