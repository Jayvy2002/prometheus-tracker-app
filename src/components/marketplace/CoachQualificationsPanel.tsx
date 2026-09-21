import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { marketRpc, uploadQualificationProof } from '../../lib/marketplaceApi';
import {
  QUALIFICATION_TYPES,
  qualificationEffectiveStatus,
  type CoachQualification,
} from '../../lib/marketplace';

const fieldStyle = 'w-full rounded-xl bg-neutral-900 border border-neutral-700 p-3 text-white';

interface Props {
  owner: string;
  rows: CoachQualification[];
  busy: boolean;
  onChange: (rows: CoachQualification[]) => void;
  onError: (message: string) => void;
}

export default function CoachQualificationsPanel({ owner, rows, busy, onChange, onError }: Props) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [type, setType] = useState<(typeof QUALIFICATION_TYPES)[number]>('certification');
  const [issuer, setIssuer] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [saving, setSaving] = useState(false);

  async function run(action: () => Promise<void>) {
    if (saving) return;
    setSaving(true);
    try { await action(); }
    catch (cause) {
      const message = cause && typeof cause === 'object' && 'message' in cause ? String(cause.message) : '';
      const key = ['coach_required', 'qualification_limit', 'qualification_locked', 'proof_required', 'not_found', 'invalid_proof_path'].includes(message) ? message : 'saveError';
      onError(t(`marketplace.${key}`));
    } finally { setSaving(false); }
  }

  function replace(row: CoachQualification) {
    onChange([row, ...rows.filter(item => item.id !== row.id)]);
  }

  return (
    <section className="space-y-4 rounded-2xl border border-neutral-800 p-4">
      <div>
        <h2 className="font-semibold text-white">{t('marketplace.qualifications')}</h2>
        <p className="text-sm text-neutral-400">{t('marketplace.qualificationsHelp')}</p>
      </div>
      {rows.map(row => {
        const status = qualificationEffectiveStatus(row);
        return (
          <article key={row.id} className="space-y-3 rounded-xl border border-neutral-800 p-3">
            <p className="font-medium text-white">{row.title}</p>
            <p className="text-sm text-neutral-400">{row.issuer} · {t(`marketplace.qualType_${row.qualification_type}`)}</p>
            <p className="text-sm text-neutral-300">{t(`marketplace.qualStatus_${status}`)}</p>
            {row.expires_on && <p className="text-xs text-neutral-500">{t('marketplace.qualExpires', { date: row.expires_on })}</p>}
            {status === 'rejected' && row.review_note && <p className="text-sm text-red-300">{row.review_note}</p>}
            <div className="flex flex-wrap gap-2">
              {(status === 'declared' || status === 'rejected') && (
                <>
                  <label className="inline-flex min-h-11 items-center text-sm text-blue-300">
                    <input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" disabled={busy || saving} onChange={event => {
                      const file = event.target.files?.[0];
                      event.target.value = '';
                      if (!file) return;
                      void run(async () => {
                        const path = await uploadQualificationProof(owner, row.id, file);
                        const saved = await marketRpc<CoachQualification>('save_coach_qualification', {
                          p_id: row.id, p_title: row.title, p_type: row.qualification_type, p_issuer: row.issuer, p_proof_path: path, p_expires_on: row.expires_on,
                        }, owner);
                        replace(saved);
                      });
                    }} />
                    {t('marketplace.qualAddProof')}
                  </label>
                  <Button variant="secondary" disabled={busy || saving} onClick={() => void run(async () => {
                    const saved = await marketRpc<CoachQualification>('submit_coach_qualification', { p_id: row.id }, owner);
                    replace(saved);
                  })}>{t('marketplace.qualSubmit')}</Button>
                </>
              )}
              {status !== 'verified' && status !== 'expired' && (
                <Button variant="secondary" disabled={busy || saving} onClick={() => void run(async () => {
                  const saved = await marketRpc<CoachQualification>('withdraw_coach_qualification', { p_id: row.id }, owner);
                  if (status === 'pending') replace(saved);
                  else onChange(rows.filter(item => item.id !== row.id));
                })}>{t('marketplace.qualWithdraw')}</Button>
              )}
            </div>
          </article>
        );
      })}
      <form className="space-y-3" onSubmit={(event: FormEvent) => {
        event.preventDefault();
        void run(async () => {
          const saved = await marketRpc<CoachQualification>('declare_coach_qualification', {
            p_title: title, p_type: type, p_issuer: issuer, p_proof_path: null, p_expires_on: expiresOn || null,
          }, owner);
          onChange([saved, ...rows]);
          setTitle(''); setIssuer(''); setExpiresOn('');
        });
      }}>
        <Input required maxLength={160} label={t('marketplace.qualTitle')} value={title} onChange={e => setTitle(e.target.value)} />
        <label className="block space-y-2">{t('marketplace.qualType')}<select className={fieldStyle} value={type} onChange={e => setType(e.target.value as typeof type)}>{QUALIFICATION_TYPES.map(value => <option key={value} value={value}>{t(`marketplace.qualType_${value}`)}</option>)}</select></label>
        <Input required maxLength={160} label={t('marketplace.qualIssuer')} value={issuer} onChange={e => setIssuer(e.target.value)} />
        <Input type="date" label={t('marketplace.qualExpiresOn')} value={expiresOn} onChange={e => setExpiresOn(e.target.value)} />
        <Button type="submit" loading={saving} disabled={busy}>{t('marketplace.qualDeclare')}</Button>
      </form>
    </section>
  );
}
