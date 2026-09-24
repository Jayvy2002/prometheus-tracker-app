import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { objectRefOf, type MessageObjectRef } from '../domain/messageContent';

export interface MessageRefLabel {
  ref: MessageObjectRef;
  /** Current name of the object, or null when it can no longer be read (permissions, deleted). */
  name: string | null;
}

type Refable = { id: string; program_id: string | null; goal_id: string | null; exercise_name: string | null };

/**
 * Reads the canonical objects referenced by messages. What the viewer may
 * no longer read stays a neutral label: the thread is not rewritten.
 */
export function useMessageRefLabels(messages: Refable[], goalLabel: (kind: string) => string): Record<string, MessageRefLabel> {
  const [names, setNames] = useState<Record<string, string>>({});
  const programIds = useMemo(() => [...new Set(messages.map(m => m.program_id).filter((id): id is string => !!id))].sort(), [messages]);
  const goalIds = useMemo(() => [...new Set(messages.map(m => m.goal_id).filter((id): id is string => !!id))].sort(), [messages]);
  const key = `${programIds.join(',')}|${goalIds.join(',')}`;

  useEffect(() => {
    if (!programIds.length && !goalIds.length) {
      setNames({});
      return;
    }
    let cancelled = false;
    void (async () => {
      const next: Record<string, string> = {};
      if (programIds.length) {
        const { data } = await supabase.from('programs').select('id, name').in('id', programIds);
        for (const row of (data ?? []) as Array<{ id: string; name: string | null }>) {
          if (row.name?.trim()) next[`p:${row.id}`] = row.name.trim();
        }
      }
      if (goalIds.length) {
        const { data } = await supabase.from('athlete_goals').select('id, kind, title').in('id', goalIds);
        for (const row of (data ?? []) as Array<{ id: string; kind: string; title: string | null }>) {
          next[`g:${row.id}`] = row.title?.trim() || goalLabel(row.kind);
        }
      }
      if (!cancelled) setNames(next);
    })();
    return () => { cancelled = true; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return useMemo(() => {
    const out: Record<string, MessageRefLabel> = {};
    for (const message of messages) {
      const ref = objectRefOf(message);
      if (!ref) continue;
      const name = ref.kind === 'exercise'
        ? ref.name
        : names[`${ref.kind === 'program' ? 'p' : 'g'}:${ref.id}`] ?? null;
      out[message.id] = { ref, name };
    }
    return out;
  }, [messages, names]);
}
