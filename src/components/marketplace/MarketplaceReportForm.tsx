import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import Button from '../ui/Button';
import { marketRpc } from '../../lib/marketplaceApi';
import {
  REPORT_CATEGORIES,
  REPORT_SUBJECT_TYPES,
  clearCoachingReportKey,
  coachingReportKey,
  type MarketplaceReport,
  type ReportCategory,
  type ReportSubjectType,
} from '../../lib/marketplace';

const fieldStyle = 'w-full rounded-xl bg-neutral-900 border border-neutral-700 p-3 text-white';

interface Props {
  owner: string;
  targetUserId: string;
  relatedRequestId?: string | null;
  subjectType: ReportSubjectType;
  onSubmitted: (row: MarketplaceReport) => void;
}

export default function MarketplaceReportForm({ owner, targetUserId, relatedRequestId = null, subjectType, onSubmitted }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState<ReportSubjectType>(subjectType);
  const [category, setCategory] = useState<ReportCategory>('other');
  const [context, setContext] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || owner === targetUserId) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const saved = await marketRpc<MarketplaceReport>('submit_marketplace_report', {
        p_target: targetUserId,
        p_subject_type: subject,
        p_category: category,
        p_context: context,
        p_request: relatedRequestId,
        p_client_report_id: coachingReportKey(sessionStorage, owner, targetUserId, relatedRequestId),
      }, owner);
      clearCoachingReportKey(sessionStorage, owner, targetUserId, relatedRequestId);
      onSubmitted(saved);
      setContext('');
      setNotice(t('marketplace.reportSent'));
      setOpen(false);
    } catch (cause) {
      const message = cause && typeof cause === 'object' && 'message' in cause ? String(cause.message) : '';
      const key = ['invalid_target', 'request_mismatch', 'report_limit', 'report_key_conflict', 'session_changed'].includes(message) ? message : 'saveError';
      setError(t(`marketplace.${key}`));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3 rounded-xl border border-neutral-800 p-4">
      <Button type="button" variant="secondary" onClick={() => setOpen(value => !value)}>
        {t('marketplace.report')}
      </Button>
      {notice && <p role="status" className="text-emerald-300">{notice}</p>}
      {open && (
        <form className="space-y-3" onSubmit={submit}>
          <p className="text-sm text-neutral-400">{t('marketplace.reportHelp')}</p>
          <div className="space-y-2">
            <label htmlFor={`report-subject-${targetUserId}`}>{t('marketplace.reportSubject')}</label>
            <select id={`report-subject-${targetUserId}`} className={fieldStyle} value={subject} onChange={e => setSubject(e.target.value as ReportSubjectType)}>
              {REPORT_SUBJECT_TYPES.map(value => <option key={value} value={value}>{t(`marketplace.reportSubject_${value}`)}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label htmlFor={`report-category-${targetUserId}`}>{t('marketplace.reportCategory')}</label>
            <select id={`report-category-${targetUserId}`} className={fieldStyle} value={category} onChange={e => setCategory(e.target.value as ReportCategory)}>
              {REPORT_CATEGORIES.map(value => <option key={value} value={value}>{t(`marketplace.reportCategory_${value}`)}</option>)}
            </select>
          </div>
          <label className="block space-y-2">{t('marketplace.reportContext')}
            <textarea required className={fieldStyle} maxLength={2000} rows={4} value={context} onChange={e => setContext(e.target.value)} />
          </label>
          {error && <p role="alert" className="text-rose-300">{error}</p>}
          <Button type="submit" loading={busy} disabled={!context.trim()}>{t('marketplace.reportSend')}</Button>
        </form>
      )}
    </section>
  );
}
