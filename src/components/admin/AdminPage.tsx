import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import PageTransition from '../ui/PageTransition';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import {
  actionReady,
  adminErrorKey,
  formatCivilDate,
  isOperatorUserId,
  reportNoteRequired,
  shortOperatorId,
  type AdminErrorCode,
} from '../../features/admin/domain/adminConsole';
import { useExerciseStore } from '../../stores/exerciseStore';
import { importErrorI18nKey } from '../../features/imports/domain/errors';
import type {
  AdminExerciseDuplicate,
  AdminExerciseProposal,
  AdminOperator,
  AdminProblemImport,
  AdminQualification,
  AdminReport,
} from '../../features/admin/types';

type TabId = 'qualifications' | 'exercises' | 'imports' | 'reports';
type LoadState = 'loading' | 'ready' | 'error';

const TABS: TabId[] = ['qualifications', 'exercises', 'imports', 'reports'];
const CATEGORIES = ['compound', 'isolation', 'cardio', 'stretch', 'plyometric'] as const;
const EQUIPMENT = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'kettlebell', 'band', 'other'] as const;
type ReportAction = 'acknowledge' | 'dismiss' | 'resolve' | 'suspend_directory' | 'restore_directory';

function labelOf(t: (key: string) => string, group: string, code: string): string {
  const key = `admin.${group}.${code}`;
  const text = t(key);
  return text === key ? code : text;
}

function formatWhen(value: string, language: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(language.toLowerCase().startsWith('en') ? 'en' : 'fr', { dateStyle: 'medium' }).format(date);
}

function rowsOf<T>(data: unknown): T[] {
  return Array.isArray(data) ? data as T[] : [];
}

function ConfirmNote({
  confirm,
  onConfirm,
  note,
  onNote,
  noteRequired,
}: {
  confirm: boolean;
  onConfirm: (value: boolean) => void;
  note: string;
  onNote: (value: string) => void;
  noteRequired: boolean;
}) {
  const { t } = useTranslation();
  const confirmId = useId();
  const noteId = useId();
  return (
    <div className="space-y-3">
      <label htmlFor={confirmId} className="flex items-center gap-2 text-sm text-ink min-h-11">
        <input
          id={confirmId}
          type="checkbox"
          checked={confirm}
          onChange={event => onConfirm(event.target.checked)}
        />
        {t('admin.confirm')}
      </label>
      <div className="space-y-1.5">
        <label htmlFor={noteId} className="block text-sm font-medium text-ink-secondary">{t('admin.note')}</label>
        <textarea
          id={noteId}
          value={note}
          onChange={event => onNote(event.target.value)}
          required={noteRequired}
          rows={2}
          className="w-full bg-surface-raised border border-line rounded-xl px-4 py-2.5 text-ink min-h-11"
        />
        <p className="text-xs text-ink-disabled">{t('admin.noteHint')}</p>
      </div>
    </div>
  );
}

function StatusLine({ code, notice }: { code: AdminErrorCode | null; notice: string }) {
  const { t } = useTranslation();
  if (code) return <p role="alert">{t(`admin.errors.${code}`)}</p>;
  if (notice) return <p role="status">{notice}</p>;
  return null;
}

export default function AdminPage() {
  const { t } = useTranslation();
  const userId = useAuthStore(state => state.user?.id ?? '');
  const [access, setAccess] = useState<'checking' | 'allowed' | 'denied' | 'error'>('checking');
  const [tab, setTab] = useState<TabId>('qualifications');
  const [accessRetry, setAccessRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setAccess('checking');
    supabase.rpc('is_platform_operator').then(({ data, error }) => {
      if (cancelled) return;
      if (error) setAccess('error');
      else setAccess(data === true ? 'allowed' : 'denied');
    });
    return () => { cancelled = true; };
  }, [userId, accessRetry]);

  return (
    <PageTransition>
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold text-ink">{t('admin.title')}</h1>
          <p className="text-sm text-ink-secondary">{t('admin.intro')}</p>
        </header>
        {access === 'checking' && <p>{t('admin.loading')}</p>}
        {access === 'error' && (
          <div className="space-y-3">
            <p role="alert">{t('admin.accessError')}</p>
            <Button onClick={() => setAccessRetry(n => n + 1)}>{t('admin.retry')}</Button>
          </div>
        )}
        {access === 'denied' && <p role="status">{t('admin.denied')}</p>}
        {access === 'allowed' && (
          <>
            {typeof navigator !== 'undefined' && !navigator.onLine && (
              <p role="status">{t('admin.offline')}</p>
            )}
            <div role="tablist" aria-label={t('admin.title')} className="flex gap-2 overflow-x-auto">
              {TABS.map(id => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  id={`admin-tab-${id}`}
                  aria-selected={tab === id}
                  aria-controls={`admin-panel-${id}`}
                  className={`min-h-11 shrink-0 rounded-xl px-4 text-sm ${tab === id ? 'bg-primary text-ink' : 'bg-surface-hover text-ink-secondary'}`}
                  onClick={() => setTab(id)}
                >
                  {t(`admin.tabs.${id}`)}
                </button>
              ))}
            </div>
            <div role="tabpanel" id={`admin-panel-${tab}`} aria-labelledby={`admin-tab-${tab}`} className="space-y-4">
              {tab === 'qualifications' && <QualificationQueue />}
              {tab === 'exercises' && <ExerciseQueue />}
              {tab === 'imports' && <ImportQueue />}
              {tab === 'reports' && <ReportQueue />}
            </div>
            <OperatorPanel selfId={userId} />
          </>
        )}
      </div>
    </PageTransition>
  );
}

function QualificationQueue() {
  const { t, i18n } = useTranslation();
  const [state, setState] = useState<LoadState>('loading');
  const [rows, setRows] = useState<AdminQualification[]>([]);
  const [retry, setRetry] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [note, setNote] = useState('');
  const [armed, setArmed] = useState<{ id: string; decision: 'verified' | 'rejected' } | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [busy, setBusy] = useState('');
  const [code, setCode] = useState<AdminErrorCode | null>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    supabase.rpc('admin_list_pending_qualifications').then(({ data, error }) => {
      if (cancelled) return;
      if (error) setState('error');
      else {
        const next = rowsOf<AdminQualification>(data);
        setRows(next);
        setHasMore(next.length >= 50);
        setState('ready');
      }
    });
    return () => { cancelled = true; };
  }, [retry]);

  async function review(id: string, decision: 'verified' | 'rejected') {
    if (!actionReady(confirm, note, decision === 'rejected') || !navigator.onLine) return;
    setBusy(id);
    setCode(null);
    setNotice('');
    const { error } = await supabase.rpc('admin_review_qualification', {
      p_id: id,
      p_decision: decision,
      p_note: note,
      p_confirm: true,
    });
    setBusy('');
    if (error) {
      setCode(adminErrorKey(error.message));
      return;
    }
    setNotice(t('admin.saved'));
    setConfirm(false);
    setNote('');
    setRetry(n => n + 1);
  }

  async function openProof(id: string) {
    if (!navigator.onLine) return;
    setBusy(id);
    setCode(null);
    const opened = await supabase.rpc('admin_open_qualification_proof', { p_id: id });
    if (opened.error || !opened.data || typeof opened.data !== 'object') {
      setBusy('');
      setCode(adminErrorKey(opened.error?.message ?? 'proof_missing'));
      return;
    }
    const path = String((opened.data as { proof_path?: string }).proof_path ?? '');
    const file = path
      ? await supabase.storage.from('qualification-proofs').download(path)
      : { data: null, error: { message: 'proof_missing' } };
    setBusy('');
    if (!path || file.error || !file.data) {
      setCode('proof_missing');
      return;
    }
    const url = URL.createObjectURL(file.data);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.target = '_blank';
    anchor.rel = 'noopener';
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    setNotice(t('admin.proof.opened'));
  }

  if (state !== 'ready') {
    return (
      <div className="space-y-3">
        <StatusLine code={code} notice={notice} />
        <QueueStatus state={state} onRetry={() => setRetry(n => n + 1)} />
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="space-y-3">
        <StatusLine code={code} notice={notice} />
        <p>{t('admin.empty.qualifications')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <StatusLine code={code} notice={notice} />
      {rows.map(row => (
        <Card key={row.id} className="space-y-3">
          <div>
            <h2 className="text-base font-medium text-ink">{row.title}</h2>
            <p className="text-sm text-ink-secondary">{row.coach_label}</p>
            <p className="text-sm text-ink-secondary">{labelOf(t, 'type', row.qualification_type)} · {row.issuer}</p>
            <p className="text-xs text-ink-disabled">{t('admin.qualification.declared', { date: formatWhen(row.declared_at, i18n.language) })}</p>
            {row.expires_on && (
              <p className="text-xs text-ink-disabled">{t('admin.qualification.expires', { date: formatCivilDate(row.expires_on, i18n.language) })}</p>
            )}
          </div>
          {row.proof_present ? (
            <Button variant="secondary" loading={busy === row.id} onClick={() => openProof(row.id)}>{t('admin.proof.open')}</Button>
          ) : (
            <p className="text-sm text-ink-disabled">{t('admin.proof.absent')}</p>
          )}
          {armed?.id === row.id ? (
            <ConfirmNote confirm={confirm} onConfirm={setConfirm} note={note} onNote={setNote} noteRequired={armed.decision === 'rejected'} />
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={(armed?.id === row.id && armed.decision === 'verified' && !actionReady(confirm, note, false)) || busy === row.id}
              onClick={() => {
                if (armed?.id !== row.id || armed.decision !== 'verified') {
                  setArmed({ id: row.id, decision: 'verified' });
                  setConfirm(false);
                  setNote('');
                  return;
                }
                void review(row.id, 'verified');
              }}
            >
              {t('admin.qualification.verify')}
            </Button>
            <Button
              variant="danger"
              disabled={(armed?.id === row.id && armed.decision === 'rejected' && !actionReady(confirm, note, true)) || busy === row.id}
              onClick={() => {
                if (armed?.id !== row.id || armed.decision !== 'rejected') {
                  setArmed({ id: row.id, decision: 'rejected' });
                  setConfirm(false);
                  setNote('');
                  return;
                }
                void review(row.id, 'rejected');
              }}
            >
              {t('admin.qualification.reject')}
            </Button>
          </div>
        </Card>
      ))}
      {hasMore ? (
        <Button variant="secondary" onClick={() => {
          const last = rows[rows.length - 1];
          if (!last) return;
          void supabase.rpc('admin_list_pending_qualifications', {
            p_before: last.declared_at,
            p_before_id: last.id,
            p_limit: 50,
          }).then(({ data, error }) => {
            if (error) {
              setCode(adminErrorKey(error.message));
              return;
            }
            const next = rowsOf<AdminQualification>(data);
            setRows(current => [...current, ...next.filter(row => !current.some(item => item.id === row.id))]);
            setHasMore(next.length >= 50);
          });
        }}
        >
          {t('admin.more')}
        </Button>
      ) : null}
    </div>
  );
}

function QueueStatus({ state, onRetry }: { state: LoadState; onRetry: () => void }) {
  const { t } = useTranslation();
  if (state === 'loading') return <p>{t('admin.loading')}</p>;
  return (
    <div className="space-y-3">
      <p role="alert">{t('admin.errors.generic')}</p>
      <Button onClick={onRetry}>{t('admin.retry')}</Button>
    </div>
  );
}

function ExerciseQueue() {
  const { t, i18n } = useTranslation();
  const [state, setState] = useState<LoadState>('loading');
  const [proposals, setProposals] = useState<AdminExerciseProposal[]>([]);
  const [duplicates, setDuplicates] = useState<AdminExerciseDuplicate[]>([]);
  const [retry, setRetry] = useState(0);
  const [code, setCode] = useState<AdminErrorCode | null>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    Promise.all([
      supabase.rpc('admin_list_exercise_proposals'),
      supabase.rpc('admin_list_exercise_duplicates', { p_limit: 30 }),
    ]).then(([proposalResult, duplicateResult]) => {
      if (cancelled) return;
      if (proposalResult.error || duplicateResult.error) setState('error');
      else {
        setProposals(rowsOf<AdminExerciseProposal>(proposalResult.data));
        setDuplicates(rowsOf<AdminExerciseDuplicate>(duplicateResult.data));
        setState('ready');
      }
    });
    return () => { cancelled = true; };
  }, [retry]);

  if (state !== 'ready') return <QueueStatus state={state} onRetry={() => setRetry(n => n + 1)} />;

  return (
    <div className="space-y-6">
      <StatusLine code={code} notice={notice} />
      <section className="space-y-3">
        <h2 className="text-lg font-medium text-ink">{t('admin.exercise.proposals')}</h2>
        {proposals.length === 0 && <p>{t('admin.empty.proposals')}</p>}
        {proposals.map(row => (
          <ProposalCard
            key={row.id}
            row={row}
            language={i18n.language}
            onDone={message => {
              setNotice(message);
              setCode(null);
              setRetry(n => n + 1);
            }}
            onError={setCode}
            onRefresh={() => setRetry(n => n + 1)}
          />
        ))}
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-medium text-ink">{t('admin.exercise.duplicates')}</h2>
        {duplicates.length === 0 && <p>{t('admin.empty.duplicates')}</p>}
        {duplicates.map(row => (
          <DuplicateCard
            key={`${row.left_id}-${row.right_id}`}
            row={row}
            onDone={message => {
              setNotice(message);
              setCode(null);
              setRetry(n => n + 1);
            }}
            onError={setCode}
          />
        ))}
      </section>
    </div>
  );
}

function ProposalCard({
  row,
  language,
  onDone,
  onError,
  onRefresh,
}: {
  row: AdminExerciseProposal;
  language: string;
  onDone: (message: string) => void;
  onError: (code: AdminErrorCode) => void;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const [confirm, setConfirm] = useState(false);
  const [note, setNote] = useState('');
  const [name, setName] = useState(row.name);
  const [nameFr, setNameFr] = useState(row.suggestion_name_fr);
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('compound');
  const [equipment, setEquipment] = useState<(typeof EQUIPMENT)[number]>('other');
  const [matches, setMatches] = useState<Array<{ id: string; name: string; name_fr: string }>>([]);
  const [chosen, setChosen] = useState('');
  const [busy, setBusy] = useState('');
  const [searchState, setSearchState] = useState<'idle' | 'loading' | 'empty' | 'error'>('idle');

  async function search() {
    setSearchState('loading');
    const { data, error } = await supabase.rpc('suggest_exercise_matches', { p_name: row.name });
    if (error || !data || typeof data !== 'object') {
      setSearchState('error');
      return;
    }
    const body = data as { exact?: Array<{ id: string; name: string; name_fr: string }>; nearby?: Array<{ id: string; name: string; name_fr: string }> };
    const found = [...(body.exact ?? []), ...(body.nearby ?? [])];
    setMatches(found);
    setSearchState(found.length === 0 ? 'empty' : 'idle');
  }

  async function run(kind: 'approve' | 'reject' | 'match') {
    const needsNote = kind === 'reject';
    if (!actionReady(confirm, note, needsNote) || !navigator.onLine) return;
    if (kind === 'approve' && name.trim().length < 2) {
      onError('name_required');
      return;
    }
    if (kind === 'match' && !chosen) return;
    setBusy(kind);
    const result = kind === 'approve'
      ? await supabase.rpc('admin_approve_exercise_proposal', {
        p_id: row.id,
        p_name: name.trim(),
        p_name_fr: nameFr.trim(),
        p_category: category,
        p_equipment: equipment,
        p_confirm: true,
        p_updated_at: row.updated_at,
      })
      : kind === 'reject'
        ? await supabase.rpc('admin_reject_exercise_proposal', {
          p_id: row.id,
          p_note: note,
          p_confirm: true,
          p_updated_at: row.updated_at,
        })
        : await supabase.rpc('admin_match_exercise_proposal', {
          p_id: row.id,
          p_exercise: chosen,
          p_confirm: true,
          p_updated_at: row.updated_at,
        });
    setBusy('');
    if (result.error) {
      const key = adminErrorKey(result.error.message);
      onError(key);
      if (key === 'request_changed') onRefresh();
      return;
    }
    useExerciseStore.getState().reset();
    onDone(t('admin.saved'));
  }

  const label = (match: { name: string; name_fr: string }) => (
    language.toLowerCase().startsWith('en') ? match.name : (match.name_fr || match.name)
  );

  return (
    <Card className="space-y-3">
      <div>
        <h3 className="text-base font-medium text-ink">{row.name}</h3>
        {row.muscles && <p className="text-sm text-ink-secondary">{row.muscles}</p>}
        {row.description && <p className="text-sm text-ink-secondary">{row.description}</p>}
        <p className="text-xs text-ink-disabled">{formatWhen(row.created_at, language)}</p>
      </div>
      <Input label={t('admin.exercise.name')} value={name} onChange={event => setName(event.target.value)} />
      <Input label={t('admin.exercise.nameFr')} value={nameFr} onChange={event => setNameFr(event.target.value)} />
      {row.suggestion_name_fr && <p className="text-xs text-ink-disabled">{t('admin.exercise.suggestion')}</p>}
      <label className="block text-sm text-ink-secondary">
        {t('admin.exercise.category')}
        <select className="mt-1 w-full min-h-11 rounded-xl border border-line bg-surface-raised px-3 text-ink" value={category} onChange={event => setCategory(event.target.value as (typeof CATEGORIES)[number])}>
          {CATEGORIES.map(item => <option key={item} value={item}>{t(`admin.category.${item}`)}</option>)}
        </select>
      </label>
      <label className="block text-sm text-ink-secondary">
        {t('admin.exercise.equipment')}
        <select className="mt-1 w-full min-h-11 rounded-xl border border-line bg-surface-raised px-3 text-ink" value={equipment} onChange={event => setEquipment(event.target.value as (typeof EQUIPMENT)[number])}>
          {EQUIPMENT.map(item => <option key={item} value={item}>{t(`admin.equipment.${item}`)}</option>)}
        </select>
      </label>
      <ConfirmNote confirm={confirm} onConfirm={setConfirm} note={note} onNote={setNote} noteRequired={false} />
      <div className="flex flex-wrap gap-2">
        <Button disabled={!actionReady(confirm, note, false) || busy !== ''} loading={busy === 'approve'} onClick={() => run('approve')}>
          {t('admin.exercise.approve')}
        </Button>
        <Button variant="danger" disabled={!actionReady(confirm, note, true) || busy !== ''} loading={busy === 'reject'} onClick={() => run('reject')}>
          {t('admin.exercise.reject')}
        </Button>
        <Button variant="secondary" onClick={search}>{t('admin.exercise.search')}</Button>
      </div>
      {searchState === 'loading' && <p>{t('admin.exercise.searching')}</p>}
      {searchState === 'error' && <p role="alert">{t('admin.errors.generic')}</p>}
      {searchState === 'empty' && <p>{t('admin.exercise.noMatch')}</p>}
      {matches.length > 0 && (
        <div className="space-y-2">
          {matches.map(match => (
            <label key={match.id} className="flex items-center gap-2 min-h-11 text-sm text-ink">
              <input type="radio" name={`match-${row.id}`} checked={chosen === match.id} onChange={() => setChosen(match.id)} />
              {label(match)}
            </label>
          ))}
          <Button variant="secondary" disabled={!actionReady(confirm, note, false) || !chosen || busy !== ''} loading={busy === 'match'} onClick={() => run('match')}>
            {t('admin.exercise.match')}
          </Button>
        </div>
      )}
    </Card>
  );
}

function DuplicateCard({
  row,
  onDone,
  onError,
}: {
  row: AdminExerciseDuplicate;
  onDone: (message: string) => void;
  onError: (code: AdminErrorCode) => void;
}) {
  const { t } = useTranslation();
  const [confirm, setConfirm] = useState(false);
  const [inverted, setInverted] = useState(false);
  const [busy, setBusy] = useState(false);
  const winner = inverted ? row.right_name : row.left_name;
  const loser = inverted ? row.left_name : row.right_name;

  async function merge() {
    if (!actionReady(confirm, '', false) || !navigator.onLine) return;
    setBusy(true);
    const { error } = await supabase.rpc('admin_merge_exercises', {
      p_winner: inverted ? row.right_id : row.left_id,
      p_loser: inverted ? row.left_id : row.right_id,
      p_confirm: true,
    });
    setBusy(false);
    if (error) {
      onError(adminErrorKey(error.message));
      return;
    }
    useExerciseStore.getState().reset();
    onDone(t('admin.saved'));
  }

  async function dismiss() {
    if (!actionReady(confirm, '', false) || !navigator.onLine) return;
    setBusy(true);
    const { error } = await supabase.rpc('admin_dismiss_exercise_duplicate', {
      p_left: row.left_id,
      p_right: row.right_id,
      p_confirm: true,
    });
    setBusy(false);
    if (error) {
      onError(adminErrorKey(error.message));
      return;
    }
    onDone(t('admin.saved'));
  }

  return (
    <Card className="space-y-3">
      <p className="text-sm text-ink">{t('admin.exercise.winner')}: {winner}</p>
      <p className="text-sm text-ink-secondary">{t('admin.exercise.loser')}: {loser}</p>
      <p className="text-xs text-ink-disabled">{t('admin.exercise.score', { score: Math.round(row.score * 100) })}</p>
      <label className="flex items-center gap-2 min-h-11 text-sm text-ink">
        <input type="checkbox" checked={inverted} onChange={event => setInverted(event.target.checked)} />
        {t('admin.exercise.invert')}
      </label>
      <label className="flex items-center gap-2 min-h-11 text-sm text-ink">
        <input type="checkbox" checked={confirm} onChange={event => setConfirm(event.target.checked)} />
        {t('admin.confirm')}
      </label>
      <div className="flex flex-wrap gap-2">
        <Button variant="danger" disabled={!actionReady(confirm, '', false) || busy} loading={busy} onClick={() => void merge()}>
          {t('admin.exercise.merge')}
        </Button>
        <Button variant="secondary" disabled={!actionReady(confirm, '', false) || busy} loading={busy} onClick={() => void dismiss()}>
          {t('admin.exercise.distinct')}
        </Button>
      </div>
    </Card>
  );
}

function ImportQueue() {
  const { t, i18n } = useTranslation();
  const [state, setState] = useState<LoadState>('loading');
  const [rows, setRows] = useState<AdminProblemImport[]>([]);
  const [retry, setRetry] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [note, setNote] = useState('');
  const [armedId, setArmedId] = useState<string | null>(null);
  const [busy, setBusy] = useState('');
  const [code, setCode] = useState<AdminErrorCode | null>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    supabase.rpc('admin_list_problem_imports').then(({ data, error }) => {
      if (cancelled) return;
      if (error) setState('error');
      else {
        setRows(rowsOf<AdminProblemImport>(data));
        setState('ready');
      }
    });
    return () => { cancelled = true; };
  }, [retry]);

  async function acknowledge(id: string) {
    if (!actionReady(confirm, note, true) || !navigator.onLine) return;
    setBusy(id);
    const { error } = await supabase.rpc('admin_acknowledge_problem_import', {
      p_id: id,
      p_note: note,
      p_confirm: true,
    });
    setBusy('');
    if (error) {
      setCode(adminErrorKey(error.message));
      return;
    }
    setNotice(t('admin.saved'));
    setConfirm(false);
    setNote('');
    setRetry(n => n + 1);
  }

  if (state !== 'ready') {
    return (
      <div className="space-y-3">
        <StatusLine code={code} notice={notice} />
        <QueueStatus state={state} onRetry={() => setRetry(n => n + 1)} />
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="space-y-3">
        <StatusLine code={code} notice={notice} />
        <p>{t('admin.empty.imports')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <StatusLine code={code} notice={notice} />
      {rows.map(row => (
        <Card key={row.id} className="space-y-2">
          <h2 className="text-base font-medium text-ink">{row.coach_label || t('admin.import.account')}</h2>
          <p className="text-sm text-ink-secondary">
            {labelOf(t, 'status', row.kind)} · {labelOf(t, 'status', row.status)} · {row.subject_kind === 'provisional' ? t('admin.import.provisional') : t('admin.import.account')}
          </p>
          <p className="text-sm text-ink-secondary">
            {t('admin.import.rows', { count: row.row_count })} · {t('admin.import.errors', { count: row.error_count })}
          </p>
          {row.error_codes && row.error_codes.length > 0 && (
            <p className="text-xs text-ink-disabled">{t('admin.import.codes')}: {row.error_codes.map(code => t(importErrorI18nKey(code))).join(', ')}</p>
          )}
          <p className="text-xs text-ink-disabled">{formatWhen(row.created_at, i18n.language)}</p>
          {armedId === row.id ? (
            <ConfirmNote confirm={confirm} onConfirm={setConfirm} note={note} onNote={setNote} noteRequired />
          ) : null}
          <Button
            disabled={(armedId === row.id && !actionReady(confirm, note, true)) || busy === row.id}
            loading={busy === row.id}
            onClick={() => {
              if (armedId !== row.id) {
                setArmedId(row.id);
                setConfirm(false);
                setNote('');
                return;
              }
              void acknowledge(row.id);
            }}
          >
            {t('admin.import.acknowledge')}
          </Button>
        </Card>
      ))}
    </div>
  );
}

function ReportQueue() {
  const { t, i18n } = useTranslation();
  const [state, setState] = useState<LoadState>('loading');
  const [rows, setRows] = useState<AdminReport[]>([]);
  const [holds, setHolds] = useState<AdminReport[]>([]);
  const [retry, setRetry] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [note, setNote] = useState('');
  const [armed, setArmed] = useState<{ id: string; action: ReportAction } | null>(null);
  const [busy, setBusy] = useState('');
  const [code, setCode] = useState<AdminErrorCode | null>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    Promise.all([
      supabase.rpc('admin_list_open_reports'),
      supabase.rpc('admin_list_directory_holds'),
    ]).then(([openResult, holdResult]) => {
      if (cancelled) return;
      if (openResult.error || holdResult.error) setState('error');
      else {
        setRows(rowsOf<AdminReport>(openResult.data));
        setHolds(rowsOf<AdminReport>(holdResult.data));
        setState('ready');
      }
    });
    return () => { cancelled = true; };
  }, [retry]);

  async function review(id: string, action: ReportAction) {
    if (!actionReady(confirm, note, reportNoteRequired(action)) || !navigator.onLine) return;
    setBusy(`${id}:${action}`);
    const { error } = await supabase.rpc('admin_review_marketplace_report', {
      p_report: id,
      p_action: action,
      p_note: note,
      p_confirm: true,
    });
    setBusy('');
    if (error) {
      setCode(adminErrorKey(error.message));
      return;
    }
    setNotice(t('admin.saved'));
    setConfirm(false);
    setNote('');
    setRetry(n => n + 1);
  }

  if (state !== 'ready') {
    return (
      <div className="space-y-3">
        <StatusLine code={code} notice={notice} />
        <QueueStatus state={state} onRetry={() => setRetry(n => n + 1)} />
      </div>
    );
  }
  if (rows.length === 0 && holds.length === 0) {
    return (
      <div className="space-y-3">
        <StatusLine code={code} notice={notice} />
        <p>{t('admin.empty.reports')}</p>
      </div>
    );
  }

  const press = (id: string, action: ReportAction) => {
    if (armed?.id !== id || armed.action !== action) {
      setArmed({ id, action });
      setConfirm(false);
      setNote('');
      return;
    }
    void review(id, action);
  };

  return (
    <div className="space-y-4">
      <StatusLine code={code} notice={notice} />
      {rows.map(row => (
        <Card key={row.id} className="space-y-3">
          <div>
            <h2 className="text-base font-medium text-ink">{row.target_label}</h2>
            <p className="text-sm text-ink-secondary">{row.subject_type} · {labelOf(t, 'reportCategory', row.category)} · {labelOf(t, 'status', row.status)}</p>
            {row.context && <p className="text-sm text-ink">{row.context}</p>}
            {row.directory_hold_active && <p className="text-sm text-ink-secondary">{t('admin.report.hold')}</p>}
            <p className="text-xs text-ink-disabled">{formatWhen(row.created_at, i18n.language)}</p>
          </div>
          {armed?.id === row.id ? (
            <ConfirmNote confirm={confirm} onConfirm={setConfirm} note={note} onNote={setNote} noteRequired={reportNoteRequired(armed.action)} />
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button disabled={(armed?.id === row.id && armed.action === 'acknowledge' && !actionReady(confirm, note, false)) || busy.startsWith(row.id)} onClick={() => press(row.id, 'acknowledge')}>{t('admin.report.acknowledge')}</Button>
            <Button variant="secondary" disabled={(armed?.id === row.id && armed.action === 'dismiss' && !actionReady(confirm, note, true)) || busy.startsWith(row.id)} onClick={() => press(row.id, 'dismiss')}>{t('admin.report.dismiss')}</Button>
            <Button variant="secondary" disabled={(armed?.id === row.id && armed.action === 'resolve' && !actionReady(confirm, note, true)) || busy.startsWith(row.id)} onClick={() => press(row.id, 'resolve')}>{t('admin.report.resolve')}</Button>
            <Button variant="danger" disabled={(armed?.id === row.id && armed.action === 'suspend_directory' && !actionReady(confirm, note, true)) || busy.startsWith(row.id)} onClick={() => press(row.id, 'suspend_directory')}>{t('admin.report.suspend')}</Button>
            <Button variant="secondary" disabled={(armed?.id === row.id && armed.action === 'restore_directory' && !actionReady(confirm, note, true)) || busy.startsWith(row.id)} onClick={() => press(row.id, 'restore_directory')}>{t('admin.report.restore')}</Button>
          </div>
        </Card>
      ))}
      {holds.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-lg font-medium text-ink">{t('admin.holds')}</h2>
          {holds.map(row => (
            <Card key={`hold-${row.id}`} className="space-y-2">
              <p className="text-sm text-ink">{row.target_label}</p>
              <p className="text-sm text-ink-secondary">{labelOf(t, 'status', row.status)} · {labelOf(t, 'reportCategory', row.category)}</p>
              <Button variant="secondary" disabled={busy.startsWith(row.id)} onClick={() => press(row.id, 'restore_directory')}>{t('admin.report.restore')}</Button>
              {armed?.id === row.id && armed.action === 'restore_directory' ? (
                <ConfirmNote confirm={confirm} onConfirm={setConfirm} note={note} onNote={setNote} noteRequired />
              ) : null}
            </Card>
          ))}
        </section>
      ) : null}
    </div>
  );
}

function OperatorPanel({ selfId }: { selfId: string }) {
  const { t, i18n } = useTranslation();
  const [state, setState] = useState<LoadState>('loading');
  const [rows, setRows] = useState<AdminOperator[]>([]);
  const [retry, setRetry] = useState(0);
  const [draft, setDraft] = useState('');
  const [confirmGrant, setConfirmGrant] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState('');
  const [busy, setBusy] = useState('');
  const [code, setCode] = useState<AdminErrorCode | null>(null);
  const [notice, setNotice] = useState('');
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    supabase.rpc('admin_list_operators').then(({ data, error }) => {
      if (cancelled) return;
      if (error) setState('error');
      else {
        setRows(rowsOf<AdminOperator>(data));
        setState('ready');
      }
    });
    return () => { cancelled = true; };
  }, [retry]);

  async function grant() {
    if (!isOperatorUserId(draft)) {
      setInvalid(true);
      return;
    }
    if (!actionReady(confirmGrant, '', false) || !navigator.onLine) return;
    setBusy('grant');
    setInvalid(false);
    const { error } = await supabase.rpc('grant_platform_operator', {
      p_user: draft.trim(),
      p_confirm: true,
    });
    setBusy('');
    if (error) {
      setCode(adminErrorKey(error.message));
      return;
    }
    setDraft('');
    setConfirmGrant(false);
    setNotice(t('admin.saved'));
    setRetry(n => n + 1);
  }

  async function revoke(userId: string) {
    if (!actionReady(confirmRevoke === userId, '', false) || !navigator.onLine) return;
    setBusy(userId);
    const { error } = await supabase.rpc('admin_revoke_platform_operator', {
      p_user: userId,
      p_confirm: true,
    });
    setBusy('');
    if (error) {
      setCode(adminErrorKey(error.message));
      return;
    }
    setConfirmRevoke('');
    setNotice(t('admin.saved'));
    setRetry(n => n + 1);
  }

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-medium text-ink">{t('admin.operators.title')}</h2>
      <p className="text-sm text-ink-secondary">{t('admin.operators.hint')}</p>
      <StatusLine code={code} notice={notice} />
      {state !== 'ready' ? <QueueStatus state={state} onRetry={() => setRetry(n => n + 1)} /> : (
        <>
          {rows.length === 0 && <p>{t('admin.empty.operators')}</p>}
          {rows.map(row => (
            <Card key={row.user_id} className="space-y-2">
              <p className="text-sm text-ink">
                {shortOperatorId(row.user_id)}
                {row.user_id === selfId ? ` · ${t('admin.operators.self')}` : ''}
              </p>
              <p className="text-xs text-ink-disabled">{t('admin.operators.since', { date: formatWhen(row.granted_at, i18n.language) })}</p>
              <label className="flex items-center gap-2 min-h-11 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={confirmRevoke === row.user_id}
                  onChange={event => setConfirmRevoke(event.target.checked ? row.user_id : '')}
                />
                {t('admin.confirm')}
              </label>
              <Button
                variant="danger"
                disabled={rows.length < 2 || confirmRevoke !== row.user_id || busy === row.user_id}
                loading={busy === row.user_id}
                onClick={() => revoke(row.user_id)}
              >
                {t('admin.operators.revoke')}
              </Button>
            </Card>
          ))}
        </>
      )}
      <Card className="space-y-3">
        <Input
          label={t('admin.operators.userId')}
          value={draft}
          autoComplete="off"
          spellCheck={false}
          onChange={event => {
            setDraft(event.target.value);
            setInvalid(false);
          }}
          error={invalid ? t('admin.operators.invalidId') : undefined}
        />
        <label className="flex items-center gap-2 min-h-11 text-sm text-ink">
          <input type="checkbox" checked={confirmGrant} onChange={event => setConfirmGrant(event.target.checked)} />
          {t('admin.confirm')}
        </label>
        <Button disabled={!actionReady(confirmGrant, '', false) || busy === 'grant'} loading={busy === 'grant'} onClick={grant}>
          {t('admin.operators.grant')}
        </Button>
      </Card>
    </section>
  );
}
