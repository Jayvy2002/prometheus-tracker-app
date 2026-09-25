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
  Ruler,
  Eye,
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
/** The training page itself, listed under the « Entraînement » section on desktop. */
const sessions: NavItemDef = { id: 'sessions', path: '/workout', labelKey: 'nav.sessions', icon: Dumbbell };
const routines: NavItemDef = { id: 'routines', path: '/routines', labelKey: 'nav.routines', icon: ListFilter };
const myProgram: NavItemDef = { id: 'myProgram', path: '/programs', labelKey: 'nav.myProgram', icon: CalendarRange };

/*
 * Corps and Suivi sub-pages. One list, read by the mobile hub tabs (BodyHub,
 * SuiviHub) and by the desktop sections: same groups, same names, same order.
 */
const nutrition: NavItemDef = { id: 'nutrition', path: '/nutrition', match: ['/nutrition', '/recipes'], labelKey: 'nav.nutrition', icon: Apple };
const weight: NavItemDef = { id: 'weight', path: '/weight', labelKey: 'nav.weight', icon: Scale };
const measurements: NavItemDef = { id: 'measurements', path: '/measurements', labelKey: 'nav.measurements', icon: Ruler };
const checkin: NavItemDef = { id: 'checkin', path: '/checkin', labelKey: 'nav.checkin', icon: ClipboardCheck };
const photos: NavItemDef = { id: 'photos', path: '/photos', labelKey: 'nav.photos', icon: Camera };
const calendar: NavItemDef = { id: 'calendar', path: '/calendar', labelKey: 'nav.calendar', icon: CalendarDays };
const exercises: NavItemDef = {
  id: 'exercises',
  path: '/exercise-progress',
  match: ['/exercise-progress', '/progress/exercise'],
  labelKey: 'nav.progressTraining',
  icon: TrendingUp,
};
const stats: NavItemDef = { id: 'trends', path: '/stats', labelKey: 'nav.progressSummary', icon: BarChart2 };
const watch: NavItemDef = { id: 'watch', path: '/watch', labelKey: 'prometheusWatch.title', icon: Eye };

/** Corps : ce qu'on logge sur soi (nutrition, poids, mensurations, check-in, photos). */
const body: NavItemDef = {
  id: 'body',
  path: '/body',
  match: ['/body', '/nutrition', '/recipes', '/weight', '/measurements', '/checkin', '/photos'],
  labelKey: 'nav.sectionBody',
  icon: Apple,
};
/** Suivi : le Calendrier d'abord (Vision §13), puis exercices, résumé et ce que Prometheus surveille. */
const suivi: NavItemDef = {
  id: 'suivi',
  path: '/suivi',
  match: ['/suivi', '/calendar', '/exercise-progress', '/progress', '/stats', '/watch'],
  labelKey: 'nav.suivi',
  icon: TrendingUp,
};
const profile: NavItemDef = { id: 'you', path: '/profile', labelKey: 'nav.profile', icon: User };
const messages: NavItemDef = { id: 'messages', path: '/messages', labelKey: 'nav.messages', icon: MessageSquare, badge: 'unreadMessages' };
const clients: NavItemDef = { id: 'clients', path: '/clients', labelKey: 'nav.clients', icon: Users };
const programs: NavItemDef = { id: 'programs', path: '/programs', labelKey: 'nav.programs', icon: CalendarRange };
const copilot: NavItemDef = { id: 'copilot', path: '/prometheus', labelKey: 'nav.copilot', icon: Sparkles };
const coachOffer: NavItemDef = { id: 'coachOffer', path: '/coach/profile', labelKey: 'marketplace.profile', icon: User };
const requests: NavItemDef = { id: 'requests', path: '/coaching-requests', labelKey: 'marketplace.requests', icon: Inbox };
const directory: NavItemDef = { id: 'directory', path: '/coaches', labelKey: 'marketplace.directory', icon: Search };
const coachMatch: NavItemDef = { id: 'coachMatch', path: '/coaches/match', labelKey: 'marketplace.match', icon: ListFilter };
const coachImport: NavItemDef = { id: 'coachImport', path: '/coach/import', labelKey: 'nav.importCsv', icon: Upload };
const coachDossiers: NavItemDef = { id: 'coachDossiers', path: '/coach/dossiers', labelKey: 'nav.provisionalDossiers', icon: FolderOpen };

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
 * Solo : Dashboard · Entraînement · Corps · Suivi · Profil.
 * Coaché : Dashboard · Entraînement · Corps · Suivi · Messages — le Calendrier est une
 * page principale pour le Coaché aussi (Vision §13) ; le Profil s'ouvre depuis
 * l'avatar, en haut à gauche de chaque page principale (profileShortcutVisible).
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

/** What the viewer may open in Suivi (Vision §13: calendar and history are personal read surfaces). */
export type SuiviAccess = { calendar: boolean; history: boolean };

const FULL_SUIVI_ACCESS: SuiviAccess = { calendar: true, history: true };

/**
 * Corps sub-pages, in the mobile hub order. A module switched off (by the coach
 * or by the Solo) is not an empty view: it does not exist. Measurements follow
 * the weight module (Vision §14.4). Photos (private by default) always exist.
 */
export function bodyHubItems(tracking: NavTracking, options: { checkinHasFields?: boolean } = {}): NavItemDef[] {
  const checkinHasFields = options.checkinHasFields ?? true;
  return [
    ...(tracking.track_nutrition ? [nutrition] : []),
    ...(tracking.track_weight ? [weight, measurements] : []),
    ...(tracking.track_checkins && checkinHasFields ? [checkin] : []),
    photos,
  ];
}

/** Suivi sub-pages: Calendrier · Exercices · Résumé. */
export function suiviHubItems(access: SuiviAccess = FULL_SUIVI_ACCESS): NavItemDef[] {
  return [
    ...(access.calendar ? [calendar] : []),
    exercises,
    ...(access.history ? [stats] : []),
  ];
}

/** « Ce que Prometheus surveille » sits beside the Suivi tabs, never as one more tab. */
export const suiviWatchItem: NavItemDef = watch;

/** Former `?view=` ids of the hubs, so old links (`/body?view=measurements`) keep landing right. */
const LEGACY_HUB_VIEWS: Record<string, string> = {
  nutrition: 'nutrition',
  weight: 'weight',
  measurements: 'measurements',
  checkin: 'checkin',
  photos: 'photos',
  calendar: 'calendar',
  exercises: 'exercises',
  trends: 'trends',
};

/**
 * `/body` and `/suivi` open a sub-page: the one asked by `?view=` when it is
 * available, otherwise the first one. Never an empty hub.
 */
export function hubRedirectPath(items: NavItemDef[], requestedView: string | null): string | null {
  if (items.length === 0) return null;
  const id = requestedView ? LEGACY_HUB_VIEWS[requestedView] : undefined;
  const wanted = id ? items.find(item => item.id === id) : undefined;
  return (wanted ?? items[0]).path;
}

/**
 * Desktop mirrors the mobile tabs: the same groups, names and sub-pages
 * (Dashboard · Entraînement · Corps · Suivi · Messages/Profil). Only the
 * discreet « Trouver un coach » is desktop-only for a Solo; on mobile it lives
 * in the Profil tab. The coaching workspace keeps its own map.
 */
export function desktopSections(
  persona: NavPersona,
  tracking: NavTracking,
  options: { checkinHasFields?: boolean; suivi?: SuiviAccess } = {},
): NavSectionDef[] {
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

  const personal: NavSectionDef[] = [
    { id: 'today', items: [today] },
    {
      id: 'train',
      labelKey: 'nav.workout',
      // Routines stay available with a program, coached or not (Vision §7.1).
      items: tracking.track_workouts ? [sessions, routines, myProgram] : [],
    },
    { id: 'body', labelKey: 'nav.sectionBody', items: bodyHubItems(tracking, options) },
    { id: 'suivi', labelKey: 'nav.suivi', items: [...suiviHubItems(options.suivi), watch] },
  ];

  if (persona === 'coached') {
    // A coached athlete has his coach: no marketplace in his menu.
    return nonempty([
      ...personal,
      { id: 'inbox', items: [messages] },
      { id: 'account', items: [profile] },
    ]);
  }

  return nonempty([
    ...personal,
    { id: 'account', items: [profile] },
    // Solo sans coach : « Trouver un coach » vit dans l'espace personnel (dans Profil sur mobile).
    { id: 'findCoach', labelKey: 'nav.sectionFindCoach', tone: 'muted', items: [directory, coachMatch] },
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

export function tabIndexForPath(pathname: string, tabs: readonly NavItemDef[]): number {
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

/**
 * The profile is reached the same way from every main page. Where Profil is a
 * tab (Solo, Coach) the tab is the way. Where it is not (a coached athlete keeps
 * Messages as his fifth tab), the avatar stands in, top-left, on every page of a
 * tab; the Dashboard carries the same avatar in its own header. Messages is a
 * full-height conversation and keeps its composer on screen instead.
 */
export function profileShortcutVisible(pathname: string, tabs: readonly NavItemDef[]): boolean {
  if (tabs.some(tab => tab.path === '/profile')) return false;
  if (pathname === '/dashboard' || pathname === '/messages' || pathname.startsWith('/messages/')) return false;
  return tabIndexForPath(pathname, tabs) !== -1;
}
