import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';

export async function waitForRowChange<T>(opts: {
  table: string;
  filter: string;
  timeoutMs: number;
  pollMs: number;
  poll: () => Promise<T | null>;
  isDone: (row: T) => boolean;
}): Promise<T | null> {
  let settled = false;
  let channel: RealtimeChannel | null = null;
  let last: T | null = null;

  const finish = (row: T | null): T | null => {
    if (!settled) {
      settled = true;
      if (channel) void supabase.removeChannel(channel);
    }
    return row;
  };

  const tryRow = async (): Promise<T | null> => {
    const row = await opts.poll();
    last = row;
    if (row && opts.isDone(row)) return row;
    return null;
  };

  const immediate = await tryRow();
  if (immediate) return finish(immediate);

  const done = new Promise<T | null>(resolve => {
    const timer = window.setTimeout(() => {
      resolve(last);
    }, opts.timeoutMs);

    const pollId = window.setInterval(() => {
      void tryRow().then(row => {
        if (!row) return;
        window.clearTimeout(timer);
        window.clearInterval(pollId);
        resolve(row);
      });
    }, opts.pollMs);

    channel = supabase
      .channel(`wait-${opts.table}-${opts.filter}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: opts.table, filter: opts.filter },
        () => {
          void tryRow().then(row => {
            if (!row) return;
            window.clearTimeout(timer);
            window.clearInterval(pollId);
            resolve(row);
          });
        },
      )
      .subscribe();
  });

  const row = await done;
  return finish(row && opts.isDone(row) ? row : last);
}
