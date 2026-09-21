import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Dumbbell,
  Apple,
  User,
  ClipboardCheck,
  Users,
  CalendarRange,
  MessageSquare,
  Sparkles,
  TrendingUp,
  Scale,
  Camera,
  Search,
  Inbox,
  CalendarDays,
  BarChart2,
  Flame,
  ListFilter,
} from 'lucide-react';
import type { AccountContext } from '../../lib/accountContext';
import type { ResolvedTrackingConfig } from '../../lib/clientTracking';

export type NavTracking = Pick<
  ResolvedTrackingConfig,
  'track_workouts' | 'track_checkins' | 'track_nutrition' | 'track_weight'
>;

export type NavPersona = 'coaching' | 'coached' | 'solo';

export type NavItemDef = {
  id: string;
  path: string;
  labelKey: string;
  icon: LucideIcon;
  end?: boolean;
  badge?: 'unreadMessages';
};

export type NavSectionDef = {
  id: string;
  labelKey?: string;
  tone?: 'primary' | 'muted';
  items: NavItemDef[];
};

export type QuickAddDef = {
  id: string;
  path: string;
  labelKey: string;
  icon: LucideIcon;
  state?: { offPlan?: boolean };
};

const today: NavItemDef = { id: 'today', path: '/dashboard', labelKey: 'nav.today', icon: LayoutDashboard, end: true };
const workout: NavItemDef = { id: 'train', path: '/workout', labelKey: 'nav.workout', icon: Dumbbell };
const progress: NavItemDef = { id: 'progress', path: '/exercise-progress', labelKey: 'nav.exerciseProgress', icon: TrendingUp };
const nutrition: NavItemDef = { id: 'nutrition', path: '/nutrition', labelKey: 'nav.nutrition', icon: Apple };
const profile: NavItemDef = { id: 'you', path: '/profile', labelKey: 'nav.profile', icon: User };
const checkin: NavItemDef = { id: 'checkin', path: '/checkin', labelKey: 'nav.checkin', icon: ClipboardCheck };
const messages: NavItemDef = { id: 'messages', path: '/messages', labelKey: 'nav.messages', icon: MessageSquare, badge: 'unreadMessages' };
const clients: NavItemDef = { id: 'clients', path: '/clients', labelKey: 'nav.clients', icon: Users };
const programs: NavItemDef = { id: 'programs', path: '/programs', labelKey: 'nav.programs', icon: CalendarRange };
const myProgram: NavItemDef = { id: 'myProgram', path: '/programs', labelKey: 'nav.myProgram', icon: CalendarRange };
const copilot: NavItemDef = { id: 'copilot', path: '/prometheus', labelKey: 'nav.copilot', icon: Sparkles };
const coachOffer: NavItemDef = { id: 'coachOffer', path: '/coach/profile', labelKey: 'marketplace.profile', icon: User };
const requests: NavItemDef = { id: 'requests', path: '/coaching-requests', labelKey: 'marketplace.requests', icon: Inbox };
const directory: NavItemDef = { id: 'directory', path: '/coaches', labelKey: 'marketplace.directory', icon: Search };
const coachMatch: NavItemDef = { id: 'coachMatch', path: '/coaches/match', labelKey: 'marketplace.match', icon: ListFilter };
const weight: NavItemDef = { id: 'weight', path: '/weight', labelKey: 'nav.weight', icon: Scale };
const photos: NavItemDef = { id: 'photos', path: '/photos', labelKey: 'nav.photos', icon: Camera };
const calendar: NavItemDef = { id: 'calendar', path: '/calendar', labelKey: 'nav.calendar', icon: CalendarDays };
const stats: NavItemDef = { id: 'stats', path: '/stats', labelKey: 'nav.stats', icon: BarChart2 };

export function navPersona(context: AccountContext): NavPersona {
  if (context.activeWorkspace === 'coaching') return 'coaching';
  if (context.personalCoaching === 'coached') return 'coached';
  return 'solo';
}

export function mobileTabs(persona: NavPersona, tracking: NavTracking): NavItemDef[] {
  if (persona === 'coaching') {
    return [today, clients, messages, programs, profile];
  }
  if (persona === 'coached') {
    // UX111 : 5 onglets. Check-in reste en tab si le module est on.
    // Nutrition : desktop + carte Profil + FAB repas. Pas de 6ᵉ onglet.
    return [
      today,
      ...(tracking.track_workouts ? [workout] : []),
      ...(tracking.track_checkins ? [checkin] : []),
      messages,
      profile,
    ];
  }
  return [
    today,
    ...(tracking.track_workouts ? [workout] : []),
    progress,
    ...(tracking.track_nutrition ? [nutrition] : []),
    profile,
  ];
}

function nonempty(sections: NavSectionDef[]): NavSectionDef[] {
  return sections.filter(section => section.items.length > 0);
}

export function desktopSections(persona: NavPersona, tracking: NavTracking): NavSectionDef[] {
  if (persona === 'coaching') {
    return nonempty([
      { id: 'primary', items: [today, clients, messages, programs] },
      { id: 'copilot', labelKey: 'nav.sectionCopilot', items: [copilot] },
      { id: 'activity', labelKey: 'nav.sectionActivity', tone: 'muted', items: [coachOffer, requests, directory, coachMatch] },
      { id: 'account', items: [profile] },
    ]);
  }

  if (persona === 'coached') {
    return nonempty([
      { id: 'today', items: [today] },
      {
        id: 'train',
        labelKey: 'nav.sectionTrain',
        items: [
          ...(tracking.track_workouts ? [workout, myProgram] : []),
          progress,
          stats,
          calendar,
        ],
      },
      {
        id: 'body',
        labelKey: 'nav.sectionBody',
        items: [
          ...(tracking.track_checkins ? [checkin] : []),
          ...(tracking.track_nutrition ? [nutrition] : []),
          ...(tracking.track_weight ? [weight] : []),
          photos,
        ],
      },
      { id: 'inbox', items: [messages] },
      { id: 'account', items: [profile] },
      { id: 'marketplace', labelKey: 'nav.sectionActivity', tone: 'muted', items: [directory, coachMatch, requests] },
    ]);
  }

  return nonempty([
    { id: 'today', items: [today] },
    {
      id: 'train',
      labelKey: 'nav.sectionTrain',
      items: [
        ...(tracking.track_workouts ? [workout, myProgram] : []),
      ],
    },
    {
      id: 'body',
      labelKey: 'nav.sectionBody',
      items: [
        ...(tracking.track_nutrition ? [nutrition] : []),
        ...(tracking.track_checkins ? [checkin] : []),
        ...(tracking.track_weight ? [weight] : []),
        photos,
      ],
    },
    {
      id: 'understand',
      labelKey: 'nav.sectionUnderstand',
      items: [progress, stats, calendar],
    },
    { id: 'account', items: [profile] },
    { id: 'marketplace', labelKey: 'nav.sectionActivity', tone: 'muted', items: [directory, coachMatch, requests] },
  ]);
}

export function quickAddActions(
  tracking: NavTracking,
  opts?: { programDayDue?: boolean },
): QuickAddDef[] {
  return [
    ...(tracking.track_workouts
      ? [{
          id: 'newWorkout',
          path: '/workout/new',
          labelKey: opts?.programDayDue ? 'nav.addWorkoutOffPlan' : 'nav.newWorkout',
          icon: Dumbbell,
          state: opts?.programDayDue ? { offPlan: true } : undefined,
        }]
      : []),
    ...(tracking.track_checkins
      ? [{ id: 'checkin', path: '/checkin', labelKey: 'nav.addCheckin', icon: ClipboardCheck }]
      : []),
    ...(tracking.track_weight
      ? [{ id: 'logWeight', path: '/weight?log=1', labelKey: 'nav.logWeight', icon: Scale }]
      : []),
    ...(tracking.track_nutrition
      ? [{ id: 'addMeal', path: '/nutrition?add=1', labelKey: 'nav.addMeal', icon: Flame }]
      : []),
  ];
}

export function pathMatchesItem(pathname: string, item: NavItemDef): boolean {
  if (item.end) return pathname === item.path;
  return pathname === item.path || pathname.startsWith(`${item.path}/`);
}

export function tabIndexForPath(pathname: string, tabs: NavItemDef[]): number {
  let best = -1;
  let bestLen = -1;
  tabs.forEach((item, index) => {
    if (!pathMatchesItem(pathname, item)) return;
    if (item.path.length > bestLen) {
      best = index;
      bestLen = item.path.length;
    }
  });
  return best;
}
