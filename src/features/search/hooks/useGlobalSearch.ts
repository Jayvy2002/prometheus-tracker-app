import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../../stores/authStore';
import { useCoachingStore } from '../../../stores/coachingStore';
import { useExerciseStore } from '../../../stores/exerciseStore';
import { useProgramStore } from '../../../stores/programStore';
import { displayName } from '../../../lib/coachText';
import { isProspectConversationStatus } from '../../../lib/marketplace';
import { readRequests } from '../../../lib/marketplaceApi';
import { displayExerciseName, exerciseSearchFields } from '../../../lib/pickerSearch';
import { muscleLabel } from '../../workout/domain/muscleLabels';
import { formatDate } from '../../../lib/utils';
import {
  coachMessagesMatching,
  ownConstraints,
  ownGoals,
  ownPrograms,
  ownRecipes,
  ownRoutines,
  ownSessionsMatching,
} from '../api/searchSources';
import {
  field,
  rankSearch,
  searchReady,
  snippetAround,
  type SearchGroup,
  type SearchItem,
  type SearchScope,
} from '../domain/globalSearch';

/**
 * Candidates are loaded when the palette opens (own rows / Coach scope only),
 * free-text sources are queried as the person types. Nothing is cached
 * across people: the hook lives inside the palette.
 */
export function useGlobalSearch(open: boolean, scope: SearchScope, query: string): { groups: SearchGroup[]; loading: boolean } {
  const { t, i18n } = useTranslation();
  const userId = useAuthStore(s => s.user?.id ?? null);
  const clients = useCoachingStore(s => s.clients);
  const fetchClients = useCoachingStore(s => s.fetchClients);
  const exercises = useExerciseStore(s => s.exercises);
  const fetchExercises = useExerciseStore(s => s.fetchExercises);
  const assignment = useProgramStore(s => s.assignment);
  const [base, setBase] = useState<SearchItem[]>([]);
  const [live, setLive] = useState<SearchItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Static candidates, once per opening.
  useEffect(() => {
    if (!open || !userId) return undefined;
    let cancelled = false;
    void fetchExercises();
    void (async () => {
      const items: SearchItem[] = [];
      if (scope === 'coach') {
        if (clients.length === 0) void fetchClients();
        const [programs, requests] = await Promise.all([
          ownPrograms(userId),
          readRequests(userId).catch(() => []),
        ]);
        for (const row of programs) {
          items.push({ id: `program:${row.id}`, category: 'programs', title: row.name || t('programs.untitled', { defaultValue: '—' }), href: `/programs/${row.id}`, fields: [field(row.name)] });
        }
        for (const row of requests) {
          if (row.coach_id !== userId || !isProspectConversationStatus(row.status)) continue;
          items.push({
            id: `prospect:${row.client_id}`,
            category: 'prospects',
            title: row.public_name || t('coaching.unnamed'),
            subtitle: t('search.prospectHint'),
            href: `/messages/${row.client_id}`,
            fields: [field(row.public_name), field(row.summary, 0.5)],
          });
        }
      } else {
        const [programs, routines, recipes, goals, constraints] = await Promise.all([
          ownPrograms(userId),
          ownRoutines(userId),
          ownRecipes(userId),
          ownGoals(userId),
          ownConstraints(userId),
        ]);
        for (const row of programs) {
          items.push({ id: `program:${row.id}`, category: 'programs', title: row.name || '—', href: '/programs', fields: [field(row.name)] });
        }
        for (const row of routines) {
          items.push({ id: `routine:${row.id}`, category: 'routines', title: row.name || '—', href: '/routines', fields: [field(row.name)] });
        }
        for (const row of recipes) {
          items.push({ id: `recipe:${row.id}`, category: 'personal', title: row.name || '—', subtitle: t('search.kinds.recipe'), href: '/recipes', fields: [field(row.name), field(t('search.kinds.recipe'), 0.6)] });
        }
        for (const row of goals) {
          const kind = t(`goals.kinds.${row.kind}`);
          items.push({
            id: `goal:${row.id}`,
            category: 'personal',
            title: row.title?.trim() || kind,
            subtitle: `${t('search.kinds.goal')} · ${t(`goals.status.${row.status}`)}`,
            href: '/profile?section=goals',
            fields: [field(row.title), field(kind), field(t('search.kinds.goal'), 0.6)],
          });
        }
        for (const row of constraints) {
          const area = row.body_area !== 'none' ? t(`constraints.areas.${row.body_area}`) : '';
          items.push({
            id: `constraint:${row.id}`,
            category: 'personal',
            title: [t(`constraints.kinds.${row.kind}`), area].filter(Boolean).join(' · '),
            subtitle: row.description || t('search.kinds.constraint'),
            href: '/profile?section=constraints',
            fields: [field(area), field(row.description, 0.8), field(t(`constraints.kinds.${row.kind}`), 0.7)],
          });
        }
      }
      if (!cancelled) setBase(items);
    })();
    return () => { cancelled = true; };
  }, [open, scope, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Free-text sources, debounced.
  useEffect(() => {
    if (!open || !userId || !searchReady(query)) {
      setLive([]);
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(() => {
      void (async () => {
        const items: SearchItem[] = [];
        if (scope === 'coach') {
          const rows = await coachMessagesMatching(userId, query);
          const seen = new Set<string>();
          for (const row of rows) {
            if (seen.has(row.client_id)) continue;
            seen.add(row.client_id);
            const client = clients.find(c => c.id === row.client_id);
            const snippet = snippetAround(row.body, query);
            items.push({
              id: `conversation:${row.client_id}`,
              category: 'conversations',
              title: client ? displayName(client, t('coaching.unnamed')) : t('search.kinds.conversation'),
              subtitle: snippet,
              href: `/messages/${row.client_id}`,
              fields: [field(snippet), field(row.body, 0.9)],
            });
          }
        } else {
          const rows = await ownSessionsMatching(userId, query);
          for (const row of rows) {
            items.push({
              id: `session:${row.id}`,
              category: 'sessions',
              title: row.name?.trim() || t('workout.unnamed'),
              subtitle: formatDate(row.date, i18n.language),
              href: `/workout/${row.id}`,
              fields: [field(row.name)],
            });
          }
        }
        if (!cancelled) {
          setLive(items);
          setLoading(false);
        }
      })();
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, scope, userId, query]); // eslint-disable-line react-hooks/exhaustive-deps

  const groups = useMemo(() => {
    if (!searchReady(query)) return [];
    const items: SearchItem[] = [...base, ...live];
    if (scope === 'coach') {
      for (const client of clients) {
        items.push({
          id: `client:${client.id}`,
          category: 'clients',
          title: displayName(client, t('coaching.unnamed')),
          subtitle: client.email ?? undefined,
          href: `/clients/${client.id}?tab=overview`,
          fields: [field(client.full_name), field(client.email, 0.7)],
        });
      }
    } else if (assignment?.program) {
      items.push({
        id: `assigned:${assignment.program.id}`,
        category: 'programs',
        title: assignment.program.name,
        subtitle: t('search.assignedProgram'),
        href: '/programs',
        fields: [field(assignment.program.name)],
      });
    }
    for (const exercise of exercises) {
      const name = displayExerciseName(exercise, i18n.language);
      const muscles = exercise.primary_muscles.map(m => muscleLabel(m, i18n.language)).join(', ');
      items.push({
        id: `exercise:${exercise.id}`,
        category: 'exercises',
        title: name,
        subtitle: [muscles, exercise.equipment ? t(`workout.exercisePicker.equipment.${exercise.equipment}`, { defaultValue: exercise.equipment }) : ''].filter(Boolean).join(' · '),
        // Personal: the athlete's own progress. Coach: the catalog video when there is one.
        href: scope === 'personal'
          ? `/progress/exercise/${encodeURIComponent(name)}`
          : (exercise.video_url?.trim() || null),
        external: scope === 'coach' && Boolean(exercise.video_url?.trim()),
        fields: exerciseSearchFields(exercise, i18n.language),
      });
    }
    return rankSearch(items, query, scope);
  }, [base, live, clients, exercises, assignment, scope, query, t, i18n.language]);

  return { groups, loading };
}
