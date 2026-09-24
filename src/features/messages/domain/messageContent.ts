/**
 * Vision §19 — what a message can carry besides text: attachments stored in
 * the thread's private folder, a reply to an earlier message, and a
 * reference to a canonical Prometheus object (never a copy of it).
 * Mirrors `message_attachments_valid` and `coach_message_bilan_owned`.
 */

export type AttachmentKind = 'image' | 'video' | 'audio' | 'file';

export interface MessageAttachment {
  path: string;
  kind: AttachmentKind;
  mime: string;
  size: number;
  name: string;
  duration_s?: number;
}

export const MESSAGE_ATTACHMENTS_MAX = 4;
export const MESSAGE_ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024;
export const MESSAGE_ATTACHMENT_BUCKET = 'message-attachments';

const EXTENSION_KIND: Record<string, AttachmentKind> = {
  jpg: 'image', jpeg: 'image', png: 'image', webp: 'image', gif: 'image', heic: 'image',
  mp4: 'video', mov: 'video', webm: 'video',
  m4a: 'audio', mp3: 'audio', ogg: 'audio', oga: 'audio', wav: 'audio', aac: 'audio',
  pdf: 'file', txt: 'file', csv: 'file', xlsx: 'file', xls: 'file', docx: 'file', doc: 'file', pptx: 'file',
};

export const MESSAGE_ATTACHMENT_EXTENSIONS = Object.keys(EXTENSION_KIND);

/** What the file picker offers. */
export const MESSAGE_ATTACHMENT_ACCEPT = [
  'image/*', 'video/mp4', 'video/quicktime', 'video/webm', 'audio/*',
  ...MESSAGE_ATTACHMENT_EXTENSIONS.map(ext => `.${ext}`),
].join(',');

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const PATH_RE = new RegExp(`^${UUID}/${UUID}/${UUID}[.](${MESSAGE_ATTACHMENT_EXTENSIONS.join('|')})$`);

export function extensionOf(name: string, mime = ''): string | null {
  const fromName = /\.([a-z0-9]{2,5})$/i.exec(name.trim())?.[1]?.toLowerCase();
  if (fromName && EXTENSION_KIND[fromName]) return fromName;
  // A recorded voice note has no file name worth trusting: use its type.
  const base = mime.split(';')[0].trim().toLowerCase();
  if (base === 'audio/webm') return 'webm';
  if (base === 'audio/ogg') return 'ogg';
  if (base === 'audio/mp4' || base === 'audio/x-m4a') return 'm4a';
  if (base === 'image/jpeg') return 'jpg';
  if (base === 'image/png') return 'png';
  if (base === 'video/mp4') return 'mp4';
  if (base === 'video/quicktime') return 'mov';
  return null;
}

export function attachmentKindFor(extension: string, mime = ''): AttachmentKind {
  // webm is a container: audio when the recorder says so.
  if (extension === 'webm' && mime.startsWith('audio/')) return 'audio';
  return EXTENSION_KIND[extension] ?? 'file';
}

export type AttachmentProblem = 'too_large' | 'type_not_allowed' | 'empty' | 'too_many';

export function attachmentProblem(
  file: { name: string; type: string; size: number },
  alreadyAttached: number,
): AttachmentProblem | null {
  if (alreadyAttached >= MESSAGE_ATTACHMENTS_MAX) return 'too_many';
  if (!file.size) return 'empty';
  if (file.size > MESSAGE_ATTACHMENT_MAX_BYTES) return 'too_large';
  if (!extensionOf(file.name, file.type)) return 'type_not_allowed';
  return null;
}

export function attachmentPath(coachId: string, clientId: string, fileId: string, extension: string): string {
  return `${coachId}/${clientId}/${fileId}.${extension}`;
}

export function isThreadAttachmentPath(path: string, coachId: string, clientId: string): boolean {
  return PATH_RE.test(path) && path.startsWith(`${coachId}/${clientId}/`);
}

/** Server rows are data: anything off-shape is dropped, never rendered. */
export function parseAttachments(raw: unknown): MessageAttachment[] {
  if (!Array.isArray(raw)) return [];
  const out: MessageAttachment[] = [];
  for (const item of raw.slice(0, MESSAGE_ATTACHMENTS_MAX)) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    if (typeof row.path !== 'string' || !PATH_RE.test(row.path)) continue;
    if (row.kind !== 'image' && row.kind !== 'video' && row.kind !== 'audio' && row.kind !== 'file') continue;
    if (typeof row.mime !== 'string' || typeof row.name !== 'string' || typeof row.size !== 'number') continue;
    out.push({
      path: row.path,
      kind: row.kind,
      mime: row.mime,
      size: row.size,
      name: row.name,
      ...(typeof row.duration_s === 'number' ? { duration_s: row.duration_s } : {}),
    });
  }
  return out;
}

/** « 0:12 », « 3:05 ». */
export function formatDuration(seconds: number | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '';
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/** « 820 Ko », « 2,4 Mo » — unit label supplied by i18n. */
export function formatSize(bytes: number, units: { kb: string; mb: string }, format: (n: number) => string): string {
  if (bytes < 1024 * 1024) return `${format(Math.max(1, Math.round(bytes / 1024)))} ${units.kb}`;
  return `${format(Math.round((bytes / (1024 * 1024)) * 10) / 10)} ${units.mb}`;
}

// ---------------------------------------------------------------------------
// References to canonical objects (program, goal, exercise). Session and
// check-in references keep their existing « bilan » helpers.
// ---------------------------------------------------------------------------

export type MessageObjectRef =
  | { kind: 'program'; id: string }
  | { kind: 'goal'; id: string }
  | { kind: 'exercise'; name: string };

const UUID_RE = new RegExp(`^${UUID}$`, 'i');

export const REF_PROGRAM_PARAM = 'program';
export const REF_GOAL_PARAM = 'goal';
export const REF_EXERCISE_PARAM = 'exercise';

export function normalizeExerciseName(value: string | null | undefined): string | null {
  const name = (value ?? '').replace(/\s+/g, ' ').trim();
  if (!name || name.length > 120) return null;
  return name;
}

export function parseObjectRefQuery(search: { get: (key: string) => string | null }): MessageObjectRef | null {
  const program = search.get(REF_PROGRAM_PARAM)?.trim().toLowerCase() ?? '';
  if (UUID_RE.test(program)) return { kind: 'program', id: program };
  const goal = search.get(REF_GOAL_PARAM)?.trim().toLowerCase() ?? '';
  if (UUID_RE.test(goal)) return { kind: 'goal', id: goal };
  const exercise = normalizeExerciseName(search.get(REF_EXERCISE_PARAM));
  if (exercise) return { kind: 'exercise', name: exercise };
  return null;
}

export function objectRefHref(base: string, ref: MessageObjectRef): string {
  const params = new URLSearchParams();
  if (ref.kind === 'program') params.set(REF_PROGRAM_PARAM, ref.id);
  if (ref.kind === 'goal') params.set(REF_GOAL_PARAM, ref.id);
  if (ref.kind === 'exercise') params.set(REF_EXERCISE_PARAM, ref.name);
  return `${base}?${params.toString()}`;
}

export function objectRefInsertFields(ref: MessageObjectRef | null | undefined): {
  program_id: string | null;
  goal_id: string | null;
  exercise_name: string | null;
} {
  return {
    program_id: ref?.kind === 'program' ? ref.id : null,
    goal_id: ref?.kind === 'goal' ? ref.id : null,
    exercise_name: ref?.kind === 'exercise' ? ref.name : null,
  };
}

export function objectRefOf(message: {
  program_id?: string | null;
  goal_id?: string | null;
  exercise_name?: string | null;
}): MessageObjectRef | null {
  if (message.program_id) return { kind: 'program', id: message.program_id };
  if (message.goal_id) return { kind: 'goal', id: message.goal_id };
  const exercise = normalizeExerciseName(message.exercise_name);
  if (exercise) return { kind: 'exercise', name: exercise };
  return null;
}

/** Where the reference opens, from each side of the thread. */
export function objectRefOpenHref(
  ref: MessageObjectRef,
  viewer: 'coach' | 'athlete' | null,
  clientId: string,
): string | null {
  if (!viewer) return null;
  if (ref.kind === 'exercise') {
    return viewer === 'coach'
      ? `/clients/${clientId}?tab=training&exercise=${encodeURIComponent(ref.name)}`
      : `/progress/exercise/${encodeURIComponent(ref.name)}`;
  }
  if (ref.kind === 'goal') {
    return viewer === 'coach' ? `/clients/${clientId}?tab=overview` : '/profile?section=goals';
  }
  return viewer === 'coach' ? `/clients/${clientId}?tab=program` : '/programs';
}

// ---------------------------------------------------------------------------
// Replies
// ---------------------------------------------------------------------------

/** One line quoting the answered message; attachments are named, not shown. */
export function replyExcerpt(
  message: { body: string; attachments?: MessageAttachment[] } | null | undefined,
  labels: { attachment: string; missing: string },
  max = 90,
): string {
  if (!message) return labels.missing;
  const text = message.body.replace(/\s+/g, ' ').trim();
  if (text) return text.length > max ? `${text.slice(0, max - 1)}…` : text;
  return message.attachments?.length ? labels.attachment : labels.missing;
}

/** Key for the retry-safe client_msg_id: same text AND same files = same message. */
export function messageIdentityText(body: string, attachments: MessageAttachment[]): string {
  return [body.trim(), ...attachments.map(a => a.path)].join('\n');
}
