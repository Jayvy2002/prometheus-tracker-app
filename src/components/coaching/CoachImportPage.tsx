import { useEffect, useMemo, useRef, useState } from 'react';
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
import { cancelCoachImport, commitCoachImport, getCoachImport, listCoachImports, previewCoachImport, recordCoachImportIncident, type CoachImportView } from '../../features/imports/api/coachImportApi';
import { listProvisionalDossiers, previewProvisionalImport, type ProvisionalDossier } from '../../features/provisional/api/provisionalApi';
import {
  COLUMN_ROLES,
  detectColumns,
  mappingIssues,
  proposeMapping,
  unresolvedAmbiguities,
  unresolvedDuplicateHeaders,
  type ColumnRole,
  type DateFormat,
  type EffortSource,
  type ImportKind,
  type ImportMapping,
  type MeasureUnit,
  type RpeMode,
} from '../../features/imports/domain/columns';
import { CsvParseError, parseCsvText, type ParsedCsv } from '../../features/imports/domain/csvParse';
import { importErrorCode, importErrorI18nKey, isImportIncident } from '../../features/imports/domain/errors';
import { IMPORT_MAX_BYTES } from '../../features/imports/domain/limits';
import { planImportRows } from '../../features/imports/domain/preview';

type Step = 'file' | 'map' | 'preview' | 'done';

function newKey(): string {
  return crypto.randomUUID();
}

function roleLabel(t: (key: string) => string, role: ColumnRole): string {
  return t(`coaching.importCsv.roles.${role}`);
}

function joinedCounts(
  t: (key: string, options?: Record<string, unknown>) => string,
  parts: Array<[string, number]>,
): string {
  return parts.map(([key, count]) => t(key, { count })).join(' · ');
}

/**
 * One import engine (Vision §24.1). `personal`: « pour moi », open to Solo,
 * Coaché and Coach alike, the subject is always the signed-in person.
 */
export default function CoachImportPage({ personal = false }: { personal?: boolean } = {}) {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { canActAsCoach, canImportCoachSpreadsheet, canImportPersonalHistory } = useResourcePermissions();
  const { clients, fetchClients } = useCoachingStore();
  const [params] = useSearchParams();
  const requested = params.get('subject');
  const requestedDossier = params.get('dossier');

  const [subjectId, setSubjectId] = useState<string>(
    personal
      ? (user?.id ?? '')
      : requestedDossier
      ? `dossier:${requestedDossier}`
      : requested === 'self'
        ? (user?.id ?? '')
        // The main case is a client: no silent « Moi », the coach picks who the data belongs to.
        : (requested ?? ''),
  );
  const [dossiers, setDossiers] = useState<ProvisionalDossier[]>([]);
  const [dossierLoadError, setDossierLoadError] = useState(false);
  const [dossierRetry, setDossierRetry] = useState(0);
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
  const [boundSubject, setBoundSubject] = useState<string | null>(null);
  const [openPreviews, setOpenPreviews] = useState<CoachImportView[]>([]);
  const [staleDuplicates, setStaleDuplicates] = useState(false);
  const previewGen = useRef(0);
  const subjectRef = useRef(subjectId);
  subjectRef.current = subjectId;

  useEffect(() => {
    if (!personal) fetchClients();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let live = true;
    listCoachImports({ limit: 50 }).then((result) => {
      if (!live || result.error) return;
      setOpenPreviews(result.data.filter((row) => row.status === 'previewed'));
    }).catch(() => undefined);
    return () => { live = false; };
  }, [step]);

  useEffect(() => {
    if (personal) return undefined;
    let live = true;
    listProvisionalDossiers().then((result) => {
      if (!live) return;
      if (result.error) {
        setDossierLoadError(true);
        return;
      }
      setDossierLoadError(false);
      setDossiers(result.data);
    }).catch(() => {
      if (live) setDossierLoadError(true);
    });
    return () => { live = false; };
  }, [dossierRetry, personal]);

  useEffect(() => {
    if (!user) return;
    if (personal) setSubjectId(user.id);
    else if (requestedDossier) setSubjectId(`dossier:${requestedDossier}`);
    else if (requested === 'self') setSubjectId(user.id);
    else setSubjectId(requested ?? '');
  }, [personal, requested, requestedDossier, user]);

  const detections = useMemo(() => (parsed ? detectColumns(parsed.headers) : []), [parsed]);
  const duplicateHeaders = mapping ? unresolvedDuplicateHeaders(detections, mapping) : [];
  const localPreview = parsed && mapping ? planImportRows(parsed.rows, mapping, detections) : null;
  const ownedClients = clients.filter((client) => (
    canImportCoachSpreadsheet({ subjectUserId: client.id, hasActiveRelationship: true })
  ));
  const openDossiers = dossiers.filter((dossier) => dossier.status === 'preparing' || dossier.status === 'invited');
  const dossierId = subjectId.startsWith('dossier:') ? subjectId.slice('dossier:'.length) : null;
  const subjectAllowed = personal
    ? canImportPersonalHistory && Boolean(user?.id) && subjectId === user?.id
    : canImportCoachSpreadsheet(dossierId
    ? { provisionalDossierId: dossierId, ownsProvisionalDossier: openDossiers.some((dossier) => dossier.id === dossierId) }
    : {
      subjectUserId: subjectId,
      hasActiveRelationship: ownedClients.some((client) => client.id === subjectId),
    });

  if (personal ? !canImportPersonalHistory : !canActAsCoach) return <Navigate to="/dashboard" replace />;

  const resetFile = () => {
    setStep('file');
    setFilename('');
    setSourceText('');
    setParsed(null);
    setMapping(null);
    setServerView(null);
    setBoundSubject(null);
    setStaleDuplicates(false);
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
      setStaleDuplicates(false);
      setIdempotencyKey(newKey());
      setStep('map');
    } catch (err) {
      const code = err instanceof CsvParseError ? err.code : 'malformed_csv';
      setLocalError(t(importErrorI18nKey(code)));
    }
  };

  const noteIncident = (message: string | null) => {
    // Operators see failures (parsing, unexpected server errors), not the
    // coach's normal decisions (duplicate, already imported, quota).
    const code = importErrorCode(message);
    if (!isImportIncident(code)) return;
    void recordCoachImportIncident(kind, code === 'generic' ? 'unexpected_error' : code);
  };

  const runPreview = async (nextMapping?: ImportMapping) => {
    const activeMapping = nextMapping ?? mapping;
    if (!parsed || !activeMapping || !subjectId) return;
    const generation = previewGen.current + 1;
    previewGen.current = generation;
    const requestedSubject = subjectId;
    const activeIssues = mappingIssues(activeMapping, parsed.headers.length, detections);
    const activeAmbiguities = unresolvedAmbiguities(detections, activeMapping);
    if (activeAmbiguities.length || activeIssues.length) {
      setLocalError(t('coaching.importCsv.fixBeforePreview'));
      return;
    }
    if (nextMapping) setMapping(nextMapping);
    setStaleDuplicates(false);
    setBusy(true);
    setLocalError(null);
    const result = dossierId
      ? await previewProvisionalImport({
        dossierId,
        filename,
        sourceText,
        mapping: activeMapping,
        idempotencyKey,
      })
      : await previewCoachImport({
        subjectUserId: subjectId,
        filename,
        sourceText,
        mapping: activeMapping,
        idempotencyKey,
      });
    setBusy(false);
    if (previewGen.current !== generation || subjectRef.current !== requestedSubject) return;
    if (result.error || !result.data) {
      noteIncident(result.error);
      setLocalError(t(importErrorI18nKey(result.error ?? 'generic')));
      toast(t(importErrorI18nKey(result.error ?? 'generic')), 'error');
      return;
    }
    const shownSubject = result.data.provisional_dossier_id
      ? `dossier:${result.data.provisional_dossier_id}`
      : result.data.subject_user_id;
    if (shownSubject && shownSubject !== requestedSubject) return;
    setBoundSubject(requestedSubject);
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

  const runCancel = async () => {
    if (!serverView) return;
    setBusy(true);
    setLocalError(null);
    const result = await cancelCoachImport(serverView.import_id);
    setBusy(false);
    if (result.error) {
      setLocalError(t(importErrorI18nKey(result.error)));
      return;
    }
    resetFile();
  };

  const onDelimiter = (delimiter: ImportMapping['delimiter']) => {
    if (!mapping || !sourceText) return;
    try {
      const next = parseCsvText(sourceText, delimiter);
      const proposed = proposeMapping(kind, detectColumns(next.headers), delimiter);
      setParsed(next);
      setMapping({
        ...proposed,
        date_format: mapping.date_format,
        load_unit: mapping.load_unit,
        body_weight_unit: mapping.body_weight_unit,
        rpe_mode: mapping.rpe_mode,
        effort_source: null,
        acknowledge_duplicates: false,
      });
      setServerView(null);
    } catch (err) {
      const code = err instanceof CsvParseError ? err.code : 'malformed_csv';
      setLocalError(t(importErrorI18nKey(code)));
    }
  };

  const runCommit = async () => {
    if (!serverView || !mapping || boundSubject !== subjectId) return;
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
      noteIncident(result.error);
      if (result.error === 'duplicates_changed') setStaleDuplicates(true);
      setLocalError(t(importErrorI18nKey(result.error ?? 'generic')));
      toast(t(importErrorI18nKey(result.error ?? 'generic')), 'error');
      return;
    }
    setStaleDuplicates(false);
    setServerView(result.data);
    setStep('done');
  };

  return (
    <PageTransition>
      <div className="px-4 pt-6 pb-28 max-w-lg mx-auto">
        <Link to={personal ? '/profile' : '/clients'} className="flex items-center gap-2 text-neutral-400 hover:text-white mb-4">
          <ArrowLeft size={18} /> {t(personal ? 'nav.profile' : 'nav.clients')}
        </Link>
        <h1 className="text-xl font-bold text-white mb-1">{t(personal ? 'coaching.importCsv.personalTitle' : 'coaching.importCsv.title')}</h1>
        <p className="text-sm text-neutral-500 mb-2">{t(personal ? 'coaching.importCsv.personalSubtitle' : 'coaching.importCsv.subtitle')}</p>
        <p className="text-sm text-neutral-400 mb-6">{t('coaching.importCsv.oneKind')}</p>
        {openPreviews.length > 0 ? (
          <Card className="mb-4 space-y-2">
            <p className="text-sm text-white">{t('coaching.importCsv.abandonedTitle')}</p>
            {openPreviews.map((row) => (
              <div key={row.import_id} className="flex items-center justify-between gap-2">
                <p className="text-sm text-neutral-300">{row.filename} · {t(`coaching.importCsv.kinds.${row.kind}`)}</p>
                <Button
                  variant="secondary"
                  onClick={() => {
                    void cancelCoachImport(row.import_id).then(() => {
                      setOpenPreviews((current) => current.filter((item) => item.import_id !== row.import_id));
                    });
                  }}
                >
                  {t('coaching.importCsv.cancelAbandoned')}
                </Button>
              </div>
            ))}
          </Card>
        ) : null}

        {personal ? null : (
        <label className="block mb-4">
          <span className="text-xs font-medium text-neutral-400">{t('coaching.importCsv.subject')}</span>
          <select
            className="mt-1 w-full min-h-11 bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white"
            value={subjectId}
            onChange={(event) => {
              previewGen.current += 1;
              setSubjectId(event.target.value);
              resetFile();
            }}
          >
            {!subjectId && <option value="" disabled>{t('coaching.importCsv.chooseSubject')}</option>}
            <optgroup label={t('coaching.importCsv.subjectPeople')}>
              {ownedClients.map((client) => (
                <option key={client.id} value={client.id}>{displayName(client)}</option>
              ))}
              {user ? <option value={user.id}>{t('coaching.importCsv.myself')}</option> : null}
            </optgroup>
            <optgroup label={t('coaching.importCsv.subjectDossiers')}>
              {openDossiers.map((dossier) => (
                <option key={dossier.id} value={`dossier:${dossier.id}`}>{dossier.display_name}</option>
              ))}
            </optgroup>
          </select>
        </label>
        )}
        {!personal && dossierLoadError ? (
          <p className="text-sm text-amber-200 mb-4">
            {t('coaching.provisional.loadError')}
            {' '}
            <button type="button" className="underline min-h-11" onClick={() => setDossierRetry((value) => value + 1)}>
              {t('errors.retry')}
            </button>
          </p>
        ) : null}

        {!personal && subjectId && !subjectAllowed ? (
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
              <p className="text-sm text-white">
                {filename} · {t('coaching.importCsv.counts.read', { count: parsed.rows.length })}
              </p>
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
            <label className="text-xs text-neutral-400 block">
              {t('coaching.importCsv.delimiter')}
              <select
                className="mt-1 w-full min-h-11 bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white"
                value={mapping.delimiter}
                onChange={(event) => onDelimiter(event.target.value as ImportMapping['delimiter'])}
              >
                <option value=",">{t('coaching.importCsv.delimiters.comma')}</option>
                <option value=";">{t('coaching.importCsv.delimiters.semicolon')}</option>
                <option value={'\t'}>{t('coaching.importCsv.delimiters.tab')}</option>
              </select>
            </label>
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
                {mapping.columns.unit != null ? (
                  <span className="block mt-1 text-neutral-500">{t('coaching.importCsv.unitColumnHint')}</span>
                ) : null}
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
            {kind === 'workout' && mapping.rpe_mode === 'convert_to_rir' && mapping.columns.rir != null && mapping.columns.rpe != null ? (
              <label className="text-xs text-neutral-400 block">
                {t('coaching.importCsv.effortSource')}
                <select
                  className="mt-1 w-full min-h-11 bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white"
                  value={mapping.effort_source ?? ''}
                  onChange={(event) => {
                    const value = event.target.value;
                    setMapping({
                      ...mapping,
                      effort_source: value === 'rir' || value === 'rpe' ? value as EffortSource : null,
                    });
                    setServerView(null);
                  }}
                >
                  <option value="">{t('coaching.importCsv.chooseMeaning')}</option>
                  <option value="rir">{t('coaching.importCsv.effortRir')}</option>
                  <option value="rpe">{t('coaching.importCsv.effortRpe')}</option>
                </select>
              </label>
            ) : null}
            <p className="text-xs text-neutral-500">{t('coaching.importCsv.previewRetention')}</p>
            {localPreview ? (
              <p className="text-sm text-neutral-400">
                {joinedCounts(t, [
                  ['coaching.importCsv.counts.ready', localPreview.readyCount],
                  ['coaching.importCsv.counts.ignored', localPreview.ignoredCount],
                  ['coaching.importCsv.counts.toFix', localPreview.errorCount],
                ])}
              </p>
            ) : null}
            <Button onClick={() => void runPreview()} loading={busy} disabled={!subjectAllowed}>
              {t('coaching.importCsv.seePlan')}
            </Button>
          </div>
        ) : null}

        {step === 'preview' && serverView ? (
          <div className="space-y-4">
            {serverView.potential_duplicates.length > 0 ? (
              <Card>
                <p className="text-sm text-amber-200">
                  {t('coaching.importCsv.duplicateSummary', { count: serverView.potential_duplicates.length })}
                </p>
                <p className="text-xs text-neutral-500 mt-1">{t('coaching.importCsv.potentialDuplicateHint')}</p>
                <ul className="mt-2 space-y-1">
                  {serverView.potential_duplicates.map((dup) => (
                    <li key={dup.workout_id} className="text-sm text-neutral-200">
                      {dup.name === dup.date
                        ? t('coaching.importCsv.duplicateItemSameName', { date: dup.date })
                        : t('coaching.importCsv.duplicateItem', { date: dup.date, name: dup.name })}
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}
            <Card>
              <p className="text-sm text-white">{t('coaching.importCsv.exactPlan')}</p>
              <p className="text-sm text-neutral-400 mt-1">
                {joinedCounts(t, [
                  ['coaching.importCsv.counts.ready', serverView.ready_count],
                  ['coaching.importCsv.counts.ignored', serverView.ignored_count],
                  ['coaching.importCsv.counts.toFix', serverView.error_count],
                ])}
              </p>
            </Card>
            <div className="space-y-2">
              {serverView.rows.map((row) => (
                <Card key={row.row_no}>
                  <p className="text-xs text-neutral-500">{t('coaching.importCsv.row', { n: row.row_no })} · {t(`coaching.importCsv.status.${row.status}`)}</p>
                  {row.error_code ? (
                    <p className="text-sm text-amber-200">{t(importErrorI18nKey(row.error_code))}</p>
                  ) : (
                    <>
                      <p className="text-sm text-neutral-200">
                        {String(row.planned?.date ?? '')}
                        {row.planned?.session_name ? ` · ${t('coaching.importCsv.sessionName', { name: String(row.planned.session_name) })}` : ''}
                        {row.planned?.exercise ? ` · ${String(row.planned.exercise)}` : ''}
                        {row.planned?.applied_order != null ? ` · ${t('coaching.importCsv.setOrder', { order: String(row.planned.applied_order) })}` : ''}
                        {row.planned?.reps != null ? ` · ${String(row.planned.reps)}` : ''}
                        {row.planned?.load_kg != null ? ` · ${String(row.planned.load_kg)} kg` : ''}
                        {row.planned?.rir != null ? ` · ${t('coaching.importCsv.rir', { value: String(row.planned.rir) })}` : ''}
                        {row.planned?.body_weight_kg != null ? ` · ${String(row.planned.body_weight_kg)} kg` : ''}
                        {row.planned?.notes ? ` · ${t('coaching.importCsv.notes', { notes: String(row.planned.notes) })}` : ''}
                      </p>
                      {row.planned?.order_rule ? (
                        <p className="text-xs text-neutral-500">{t(`coaching.importCsv.orderRule.${String(row.planned.order_rule)}`)}</p>
                      ) : null}
                    </>
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
              {serverView.issues.includes('potential_duplicate') && mapping ? (
                <Button
                  variant="secondary"
                  onClick={() => void runPreview({ ...mapping, acknowledge_duplicates: true })}
                  loading={busy}
                >
                  {t('coaching.importCsv.acknowledgeDuplicates')}
                </Button>
              ) : null}
              {staleDuplicates && mapping?.acknowledge_duplicates ? (
                <Button
                  variant="secondary"
                  onClick={() => void runPreview(mapping)}
                  loading={busy}
                >
                  {t('coaching.importCsv.reviewDuplicates')}
                </Button>
              ) : null}
              <Button variant="secondary" onClick={() => void runCancel()} loading={busy}>
                {t('coaching.importCsv.cancelPreview')}
              </Button>
              <Button
                onClick={() => void runCommit()}
                loading={busy}
                disabled={serverView.ready_count < 1 || serverView.issues.includes('potential_duplicate')}
              >
                {t('coaching.importCsv.confirm')}
              </Button>
            </div>
          </div>
        ) : null}

        {step === 'done' && serverView ? (
          <Card className="space-y-2">
            <p className="text-sm text-white">{t('coaching.importCsv.resultTitle')}</p>
            <p className="text-sm text-neutral-300">
              {joinedCounts(t, [
                ['coaching.importCsv.counts.applied', serverView.applied_count],
                ['coaching.importCsv.counts.ignored', serverView.ignored_count],
                ['coaching.importCsv.counts.toFix', serverView.error_count],
              ])}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={resetFile}>{t('coaching.importCsv.another')}</Button>
              {personal ? (
                <Link to="/calendar" className="min-h-11 inline-flex items-center px-3 text-sm text-blue-300 underline">
                  {t('coaching.importCsv.seeInCalendar')}
                </Link>
              ) : null}
            </div>
          </Card>
        ) : null}
      </div>
    </PageTransition>
  );
}
