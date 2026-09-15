import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { DailyCheckin } from '../../lib/types';
import { summarizeCheckin } from '../../lib/coachInsight';
import Button from '../ui/Button';
import Card from '../ui/Card';
import CheckinSummaryCard from './CheckinSummaryCard';
import CheckinFilledScores from '../checkin/CheckinFilledScores';

export default function CheckinReviewPanel({
  checkin,
  previous,
  relanceHref,
  onSaveNote,
  savingNote,
}: {
  checkin: DailyCheckin;
  previous: DailyCheckin | null;
  relanceHref: string;
  onSaveNote: (body: string) => Promise<void>;
  savingNote: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [note, setNote] = useState('');
  const summary = summarizeCheckin(previous ? [checkin, previous] : [checkin]);

  const saveNote = async () => {
    const body = note.trim();
    if (!body) return;
    await onSaveNote(body);
    setNote('');
  };

  return (
    <div className="space-y-3">
      <CheckinSummaryCard summary={summary} hideSeeAnswers />
      <Card>
        <CheckinFilledScores row={checkin} />
        {checkin.notes ? (
          <p className="text-xs text-neutral-300 mt-3">
            <span className="text-neutral-500">{t('coaching.checkinReview.clientNote')} </span>
            {checkin.notes}
          </p>
        ) : null}
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => navigate(relanceHref)}>
          {t('coaching.queue.relance')}
        </Button>
      </div>

      <form
        className="flex gap-2"
        onSubmit={e => { e.preventDefault(); void saveNote(); }}
      >
        <input
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder={t('coaching.checkinReview.notePlaceholder')}
          className="flex-1 bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white"
          maxLength={180}
        />
        <Button size="sm" type="submit" loading={savingNote} disabled={!note.trim()}>
          {t('coaching.checkinReview.noteSave')}
        </Button>
      </form>
      <p className="text-[11px] text-neutral-600">{t('coaching.checkinReview.noteHint')}</p>
    </div>
  );
}
