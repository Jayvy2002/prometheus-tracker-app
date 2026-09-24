import { useCallback, useEffect, useState } from 'react';
import { deleteTemplate, listMyTemplates, saveTemplate } from '../api/checkinPlanApi';
import type { CheckinQuestion, CheckinTemplate } from '../domain/checkinTemplate';

/** The templates the viewer owns (a coach's library, or a Solo's own template). */
export function useCheckinTemplates(ownerId: string | null | undefined) {
  const [templates, setTemplates] = useState<CheckinTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!ownerId) return;
    setLoading(true);
    const result = await listMyTemplates(ownerId);
    setLoading(false);
    setError(result.error);
    if (!result.error) setTemplates(result.templates);
  }, [ownerId]);

  useEffect(() => { void reload(); }, [reload]);

  const save = useCallback(async (input: { id?: string | null; name: string; questions: CheckinQuestion[] }) => {
    if (!ownerId) return { id: null, error: 'no_owner' };
    const result = await saveTemplate({ ...input, ownerId });
    if (!result.error) await reload();
    return result;
  }, [ownerId, reload]);

  const remove = useCallback(async (id: string) => {
    const result = await deleteTemplate(id);
    if (!result.error) await reload();
    return result;
  }, [reload]);

  return { templates, loading, error, reload, save, remove };
}
