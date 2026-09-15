import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useProgramStore } from '../../stores/programStore';
import { supabase } from '../../lib/supabase';
import {
  revisionBeforeAfter,
  type ProgramRevisionRow,
} from '../../lib/programRevisionDiff';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import { toast } from '../ui/Toast';

interface Props {
  open: boolean;
  programId: string;
  programMeta: { name: string; description: string; duration_weeks: number };
  expectedUpdatedAt: string | null;
  onClose: () => void;
  onRestored: () => Promise<void> | void;
}

export default function ProgramRevisionHistory({
  open, programId, programMeta, expectedUpdatedAt, onClose, onRestored,
}: Props) {
  const { t, i18n } = useTranslation();
  const fetchProgramRevisions = useProgramStore(s => s.fetchProgramRevisions);
  const restoreProgramRevision = useProgramStore(s => s.restoreProgramRevision);
  const [rows, setRows] = useState<ProgramRevisionRow[]>([]);
  const [authors, setAuthors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [confirmNo, setConfirmNo] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void fetchProgramRevisions(programId).then(async list => {
      if (cancelled) return;
      setRows(list);
      const ids = [...new Set(list.map(r => r.created_by).filter((id): id is string => !!id))];
      if (!ids.length) return;
      const { data } = await supabase.from('user_profiles').select('id, full_name').in('id', ids);
      if (cancelled || !data) return;
      const map: Record<string, string> = {};
      for (const row of data as Array<{ id: string; full_name: string | null }>) {
        map[row.id] = row.full_name || t('coaching.unnamed');
      }
      setAuthors(map);
    });
    return () => { cancelled = true; };
  }, [open, programId, fetchProgramRevisions, t]);

  const restore = async (revisionNo: number) => {
    if (busy != null) return;
    setBusy(revisionNo);
    const result = await restoreProgramRevision(programId, revisionNo, programMeta, expectedUpdatedAt);
    setBusy(null);
    setConfirmNo(null);
    if (result.error) {
      toast(t('programs.saveFailed'), 'error');
      return;
    }
    await onRestored();
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={t('programs.revisionHistory')} size="lg">
      <div data-testid="program-revision-history" className="space-y-3 max-h-[70vh] overflow-y-auto">
        <p className="text-xs text-neutral-500">{t('programs.revisionRestoreHint')}</p>
        {rows.length === 0 && (
          <p className="text-sm text-neutral-400">{t('programs.revisionEmpty')}</p>
        )}
        {rows.map((row, index) => {
          const previous = rows[index + 1]?.snapshot ?? null;
          const diff = revisionBeforeAfter(previous, row.snapshot);
          return (
            <div
              key={row.id}
              data-testid="program-revision-row"
              className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-3 space-y-2"
            >
              <p className="text-sm text-white">
                {t('programs.revisionBadgeShort', {
                  n: row.revision_no,
                  date: new Date(row.created_at).toLocaleString(i18n.language),
                })}
              </p>
              <p className="text-[11px] text-neutral-500">
                {t('programs.revisionAuthor', {
                  name: (row.created_by && authors[row.created_by]) || t('coaching.unnamed'),
                })}
              </p>
              <div data-testid="program-revision-diff" className="text-xs text-neutral-300 space-y-1">
                <p>
                  <span className="text-neutral-500">{t('programs.revisionBefore')}</span>
                  {' '}
                  {diff.before || t('programs.revisionInitial')}
                </p>
                <p>
                  <span className="text-neutral-500">{t('programs.revisionAfter')}</span>
                  {' '}
                  {diff.after || '—'}
                </p>
              </div>
              {confirmNo === row.revision_no ? (
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setConfirmNo(null)} disabled={busy != null}>
                    {t('common.cancel')}
                  </Button>
                  <Button
                    size="sm"
                    data-testid="program-revision-restore"
                    loading={busy === row.revision_no}
                    onClick={() => { void restore(row.revision_no); }}
                  >
                    {t('programs.revisionRestore')}
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  data-testid="program-revision-restore"
                  onClick={() => setConfirmNo(row.revision_no)}
                >
                  {t('programs.revisionRestore')}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
