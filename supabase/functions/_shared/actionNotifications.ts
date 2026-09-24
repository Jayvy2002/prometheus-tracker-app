/**
 * Vision §21 — copy for « action now » notifications. Pure, FR/EN, shared by the
 * send-daily-reminders cron (Deno) and the app tests (Node). A notification says
 * what happened and where to act; it never carries message content.
 */

export type ActionNotificationKind =
  | 'coach_message'
  | 'client_message'
  | 'coaching_request'
  | 'coach_accepted'
  | 'athlete_confirmed'
  | 'program_assigned'
  | 'proposals_waiting';

export interface ActionNotificationRow {
  kind: ActionNotificationKind | string;
  item_count: number;
  payload: Record<string, unknown> | null;
  url: string;
  language: string | null;
}

export interface PushPayload {
  title: string;
  body: string;
  tag: string;
  url: string;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function renderActionNotification(row: ActionNotificationRow): PushPayload | null {
  const fr = (row.language ?? 'fr').toLowerCase().startsWith('fr');
  const n = Math.max(1, Math.floor(row.item_count || 1));
  const name = text(row.payload?.name);
  const program = text(row.payload?.program);
  const title = 'Prometheus';

  switch (row.kind) {
    case 'coach_message':
    case 'client_message': {
      const fromCoach = row.kind === 'coach_message';
      // « de Marie » / « de ton coach » / « d'un client » — French elides « de un ».
      const from = fr
        ? (name ? `de ${name}` : fromCoach ? 'de ton coach' : "d'un client")
        : `from ${name ?? (fromCoach ? 'your coach' : 'a client')}`;
      const body = fr
        ? (n > 1 ? `${n} nouveaux messages ${from}` : `Nouveau message ${from}`)
        : (n > 1 ? `${n} new messages ${from}` : `New message ${from}`);
      return { title, body, tag: `messages:${row.url}`, url: row.url };
    }
    case 'coaching_request':
      return {
        title,
        body: fr
          ? `Nouvelle demande de coaching${name ? ` : ${name}` : ''}`
          : `New coaching request${name ? `: ${name}` : ''}`,
        tag: 'coaching-requests',
        url: row.url,
      };
    case 'coach_accepted':
      return {
        title,
        body: fr
          ? `${name ?? 'Le coach'} a accepté ta demande. Confirme pour commencer.`
          : `${name ?? 'The coach'} accepted your request. Confirm to start.`,
        tag: 'coaching-requests',
        url: row.url,
      };
    case 'athlete_confirmed':
      return {
        title,
        body: fr
          ? `${name ?? 'Ton nouveau client'} a confirmé : le suivi peut commencer.`
          : `${name ?? 'Your new client'} confirmed: coaching can start.`,
        tag: 'coaching-confirmed',
        url: row.url,
      };
    case 'program_assigned':
      return {
        title,
        body: fr
          ? (program ? `Nouveau programme de ton coach : ${program}` : 'Nouveau programme de ton coach')
          : (program ? `New program from your coach: ${program}` : 'New program from your coach'),
        tag: 'program',
        url: row.url,
      };
    case 'proposals_waiting':
      return {
        title,
        body: fr
          ? (n > 1 ? `${n} propositions de Prometheus à décider` : 'Une proposition de Prometheus à décider')
          : (n > 1 ? `${n} Prometheus proposals to decide` : 'A Prometheus proposal to decide'),
        tag: 'decisions',
        url: row.url,
      };
    default:
      // Unknown kind: never send a vague notification.
      return null;
  }
}

/** Opt-in fixed-time reminders: factual, never guilt (« Tu n'as pas encore… Go ! »). */
export function renderFixedReminder(
  kind: 'workout' | 'nutrition',
  language: string | null,
  sessionName: string | null,
): PushPayload {
  const fr = (language ?? 'fr').toLowerCase().startsWith('fr');
  if (kind === 'workout') {
    return {
      title: 'Prometheus',
      body: sessionName
        ? (fr ? `Séance prévue aujourd'hui : ${sessionName}` : `Session planned today: ${sessionName}`)
        : (fr ? "C'est l'heure que tu as choisie pour t'entraîner." : "It's the time you chose to train."),
      tag: 'workout-reminder',
      url: '/workout',
    };
  }
  return {
    title: 'Prometheus',
    body: fr ? "C'est l'heure que tu as choisie pour noter tes repas." : "It's the time you chose to log your meals.",
    tag: 'nutrition-reminder',
    url: '/nutrition',
  };
}
