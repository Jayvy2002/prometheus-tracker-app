import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../../lib/supabase';
import type { MessageObjectRef } from '../domain/messageContent';

/** « Ce message sera lié à : Programme · Bloc force » above the composer. */
export function useObjectRefHint(ref: MessageObjectRef | null): string | null {
  const { t } = useTranslation();
  const [name, setName] = useState<string | null>(null);
  const id = ref && ref.kind !== 'exercise' ? ref.id : null;
  const kind = ref?.kind ?? null;

  useEffect(() => {
    setName(null);
    if (!id || !kind) return;
    let live = true;
    void (async () => {
      if (kind === 'program') {
        const { data } = await supabase.from('programs').select('name').eq('id', id).maybeSingle();
        if (live) setName((data as { name?: string | null } | null)?.name?.trim() || null);
      } else {
        const { data } = await supabase.from('athlete_goals').select('kind, title').eq('id', id).maybeSingle();
        const row = data as { kind?: string; title?: string | null } | null;
        if (live) setName(row ? (row.title?.trim() || t(`goals.kinds.${row.kind}`)) : null);
      }
    })();
    return () => { live = false; };
  }, [id, kind, t]);

  if (!ref) return null;
  const label = t(`messages.refs.${ref.kind}`);
  const what = ref.kind === 'exercise' ? `${label} · ${ref.name}` : name ? `${label} · ${name}` : label;
  return t('messages.refs.composeAbout', { what });
}
