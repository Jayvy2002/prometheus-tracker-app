import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import type { CoachMessage } from '../../../lib/types';

export type MessageBilanChip = {
  kind: 'workout' | 'checkin';
  date: string;
  name: string;
};

export function useMessageBilanLabels(messages: CoachMessage[]): Record<string, MessageBilanChip> {
  const [labels, setLabels] = useState<Record<string, MessageBilanChip>>({});
  const key = useMemo(() => {
    const parts = messages.flatMap(m => [m.workout_id ? `w:${m.workout_id}` : '', m.checkin_id ? `c:${m.checkin_id}` : '']);
    return [...new Set(parts.filter(Boolean))].sort().join('|');
  }, [messages]);

  useEffect(() => {
    const workoutIds = [...new Set(messages.map(m => m.workout_id).filter((id): id is string => !!id))];
    const checkinIds = [...new Set(messages.map(m => m.checkin_id).filter((id): id is string => !!id))];
    if (workoutIds.length === 0 && checkinIds.length === 0) {
      setLabels({});
      return;
    }
    let cancelled = false;
    void (async () => {
      const next: Record<string, MessageBilanChip> = {};
      if (workoutIds.length) {
        const { data } = await supabase.from('workouts').select('id, name, date').in('id', workoutIds);
        for (const row of (data ?? []) as Array<{ id: string; name: string | null; date: string }>) {
          next[`w:${row.id}`] = { kind: 'workout', date: row.date, name: row.name?.trim() || '' };
        }
      }
      if (checkinIds.length) {
        const { data } = await supabase.from('daily_checkins').select('id, checked_at').in('id', checkinIds);
        for (const row of (data ?? []) as Array<{ id: string; checked_at: string }>) {
          next[`c:${row.id}`] = { kind: 'checkin', date: row.checked_at, name: '' };
        }
      }
      if (!cancelled) setLabels(next);
    })();
    return () => { cancelled = true; };
  }, [key, messages]);

  return useMemo(() => {
    const byMessage: Record<string, MessageBilanChip> = {};
    for (const msg of messages) {
      if (msg.workout_id && labels[`w:${msg.workout_id}`]) byMessage[msg.id] = labels[`w:${msg.workout_id}`];
      else if (msg.checkin_id && labels[`c:${msg.checkin_id}`]) byMessage[msg.id] = labels[`c:${msg.checkin_id}`];
    }
    return byMessage;
  }, [messages, labels]);
}
