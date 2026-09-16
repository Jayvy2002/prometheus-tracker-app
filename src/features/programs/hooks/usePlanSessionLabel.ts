import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../../lib/supabase';
import { namedSessionLine } from '../domain/namedSession';

/** UX22 — weekday du jour de plan + nom de séance, sans réécrire le log. */
export function usePlanSessionLabel(
  programDayId: string | null | undefined,
  fallbackName: string,
): string {
  const { t } = useTranslation();
  const [weekday, setWeekday] = useState<number | null>(null);

  useEffect(() => {
    if (!programDayId) {
      setWeekday(null);
      return;
    }
    let cancelled = false;
    void supabase
      .from('program_days')
      .select('weekday')
      .eq('id', programDayId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && typeof data?.weekday === 'number') setWeekday(data.weekday);
      });
    return () => {
      cancelled = true;
    };
  }, [programDayId]);

  const weekdayLabel = weekday != null ? t(`programs.weekdays.${weekday}`) : '';
  return namedSessionLine(weekdayLabel, fallbackName);
}
