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
  Upload,
  FolderOpen,
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
  match?: string[];
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
/** Corps : ce qu'on logge sur soi (nutrition, poids, check-in, photos). */
const body: NavItemDef = {
  id: 'body',
  path: '/body',
  match: ['/body', '/nutrition', '/weight', '/checkin', '/recipes', '/photos'],
  labelKey: 'nav.sectionBody',
  icon: Apple,
};
/** Suivi : le Calendrier d'abord (Vision §13), puis progression et tendances. */
const suivi: NavItemDef = {
  id: 'suivi',
  path: '/suivi',
  match: ['/suivi', '/exercise-progress', '/progress', '/calendar', '/stats', '/watch'],
  labelKey: 'nav.suivi',
  icon: TrendingUp,
};
const routines: NavItemDef = { id: 'routines', path: '/routines', labelKey: 'nav.routines', icon: ListFilter };
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
const coachImport: NavItemDef = { id: 'coachImport', path: '/coach/import', labelKey: 'nav.importCsv', icon: Upload };
const coachDossiers: NavItemDef = { id: 'coachDossiers', path: '/coach/dossiers', labelKey: 'nav.provisionalDossiers', icon: FolderOpen };
const weight: NavItemDef = { id: 'weight', path: '/weight', labelKey: 'nav.weight', icon: Scale };
const photos: NavItemDef = { id: 'photos', path: '/photos', labelKey: 'nav.photos', icon: Camera };
const calendar: NavItemDef = { id: 'calendar', path: '/calendar', labelKey: 'nav.calendar', icon: CalendarDays };
const stats: NavItemDef = { id: 'stats', path: '/stats', labelKey: 'nav.stats', icon: BarChart2 };

export function navPersona(context: AccountContext): NavPersona {
  if (context.activeWorkspace === 'coaching') return 'coaching';
  if (context.personalCoaching === 'coached') return 'coached';
  return 'solo';
}

export function tracksBody(tracking: NavTracking): boolean {
  return tracking.track_nutrition || tracking.track_weight || tracking.track_checkins;
}

/**
 * Pas de 6ᵉ onglet : cinq au plus, jamais un « Plus ».
 * Solo : Dashboard · Séance · Corps · Suivi · Profil.
 * Coaché : Dashboard · Séance · Corps · Suivi · Messages — le Calendrier est une
 * page principale pour le Coaché aussi (Vision §13) ; le Profil s'ouvre depuis
 * l'avatar du Dashboard.
 * Corps existe toujours : les photos de progression y vivent, quel que soit le suivi.
 */
export function mobileTabs(persona: NavPersona, tracking: NavTracking): NavItemDef[] {
  if (persona === 'coaching') {
    return [today, clients, messages, programs, profile];
  }
  if (persona === 'coached') {
    return [
      today,
      ...(tracking.track_workouts ? [workout] : []),
      body,
      suivi,
      messages,
    ];
  }
  return [
    today,
    ...(tracking.track_workouts ? [workout] : []),
    body,
    suivi,
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
      // « Mon offre » (ce que le coach publie et reçoit) ≠ « Trouver un coach »
      // (démarche personnelle, dans l'espace personnel). L'import reste à part.
      { id: 'offer', labelKey: 'nav.sectionOffer', tone: 'muted', items: [coachOffer, requests] },
      { id: 'import', labelKey: 'nav.sectionImport', tone: 'muted', items: [coachImport, coachDossiers] },
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
          // Routines personnelles : outil du solo. Un coaché suit le plan de son coach.
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
    ]);
  }

  return nonempty([
    { id: 'today', items: [today] },
    {
      id: 'train',
      labelKey: 'nav.sectionTrain',
      items: [
        ...(tracking.track_workouts ? [workout, routines, myProgram] : []),
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
    // Solo sans coach : « Trouver un coach » vit dans l'espace personnel.
    { id: 'findCoach', labelKey: 'nav.sectionFindCoach', tone: 'muted', items: [directory, coachMatch] },
    { id: 'account', items: [profile] },
  ]);
}

export function quickAddActions(tracking: NavTracking): QuickAddDef[] {
  return [
    // « Séance » opens the training page (today's session, routines, off-plan),
    // never an empty workout the athlete then has to discard.
    ...(tracking.track_workouts
      ? [{ id: 'session', path: '/workout', labelKey: 'nav.quickSession', icon: Dumbbell }]
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

/**
 * Pages where the mobile quick-add button is the natural way to log something.
 * Everywhere else the page has its own main action (Ajouter, Peser, Enregistrer…)
 * or is a form: a second floating button would cover it.
 */
const QUICK_ADD_PAGES = ['/dashboard', '/workout', '/calendar', '/suivi', '/stats', '/watch', '/exercise-progress'];

export function quickAddVisible(pathname: string): boolean {
  return QUICK_ADD_PAGES.includes(pathname) || pathname.startsWith('/progress/exercise/');
}

export function pathMatchesItem(pathname: string, item: NavItemDef): boolean {
  const paths = item.match ?? [item.path];
  return paths.some((path) => {
    if (item.end && path === item.path) return pathname === path;
    return pathname === path || pathname.startsWith(`${path}/`);
  });
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
