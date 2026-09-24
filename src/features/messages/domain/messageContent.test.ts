import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import {
  MESSAGE_ATTACHMENTS_MAX,
  MESSAGE_ATTACHMENT_EXTENSIONS,
  MESSAGE_ATTACHMENT_MAX_BYTES,
  attachmentKindFor,
  attachmentPath,
  attachmentProblem,
  extensionOf,
  formatDuration,
  isThreadAttachmentPath,
  messageIdentityText,
  objectRefHref,
  objectRefInsertFields,
  objectRefOf,
  objectRefOpenHref,
  parseAttachments,
  parseObjectRefQuery,
  replyExcerpt,
} from './messageContent';

const COACH = 'c7c00000-0000-4000-8000-000000000001';
const CLIENT = 'c7c00000-0000-4000-8000-000000000002';
const FILE = 'c7c00000-0000-4000-8000-0000000000f1';
const sql = () => readFileSync(resolve(process.cwd(), 'supabase/migrations/20260924190000_rich_messages.sql'), 'utf8');

test('files: kind from extension, voice notes from their type, unknown refused', () => {
  assert.equal(extensionOf('Squat.MOV'), 'mov');
  assert.equal(attachmentKindFor('mov'), 'video');
  assert.equal(extensionOf('', 'audio/webm;codecs=opus'), 'webm');
  assert.equal(attachmentKindFor('webm', 'audio/webm'), 'audio');
  assert.equal(attachmentKindFor('webm', 'video/webm'), 'video');
  assert.equal(attachmentKindFor('pdf'), 'file');
  assert.equal(extensionOf('script.exe', 'application/x-msdownload'), null);
});

test('limits: 4 files, 25 MB, nothing empty, nothing executable', () => {
  const ok = { name: 'bilan.pdf', type: 'application/pdf', size: 1000 };
  assert.equal(attachmentProblem(ok, 0), null);
  assert.equal(attachmentProblem(ok, MESSAGE_ATTACHMENTS_MAX), 'too_many');
  assert.equal(attachmentProblem({ ...ok, size: MESSAGE_ATTACHMENT_MAX_BYTES + 1 }, 0), 'too_large');
  assert.equal(attachmentProblem({ ...ok, size: 0 }, 0), 'empty');
  assert.equal(attachmentProblem({ name: 'x.exe', type: 'application/x-msdownload', size: 10 }, 0), 'type_not_allowed');
});

test('paths live in the thread folder and survive a hostile row', () => {
  const path = attachmentPath(COACH, CLIENT, FILE, 'mp4');
  assert.equal(isThreadAttachmentPath(path, COACH, CLIENT), true);
  assert.equal(isThreadAttachmentPath(path, COACH, FILE), false);
  const parsed = parseAttachments([
    { path, kind: 'video', mime: 'video/mp4', size: 10, name: 'squat.mp4', duration_s: 18 },
    { path: '../../etc/passwd', kind: 'file', mime: 'text/plain', size: 1, name: 'x' },
    { path, kind: 'script', mime: 'x', size: 1, name: 'x' },
    'nope',
  ]);
  assert.deepEqual(parsed, [{ path, kind: 'video', mime: 'video/mp4', size: 10, name: 'squat.mp4', duration_s: 18 }]);
  assert.deepEqual(parseAttachments(null), []);
});

test('the same limits and extensions as the database', () => {
  const migration = sql();
  for (const ext of MESSAGE_ATTACHMENT_EXTENSIONS) assert.match(migration, new RegExp(`\\b${ext}\\b`));
  assert.match(migration, /jsonb_array_length\(p\) <= 4/);
  assert.match(migration, /BETWEEN 1 AND 26214400/);
  assert.equal(MESSAGE_ATTACHMENT_MAX_BYTES, 26214400);
  assert.match(migration, /public = false/);
});

test('references point to the canonical object and open on each side', () => {
  const q = (entries: Record<string, string>) => ({ get: (k: string) => entries[k] ?? null });
  assert.deepEqual(parseObjectRefQuery(q({ program: FILE.toUpperCase() })), { kind: 'program', id: FILE });
  assert.deepEqual(parseObjectRefQuery(q({ goal: 'not-a-uuid', exercise: '  Développé   couché ' })), { kind: 'exercise', name: 'Développé couché' });
  assert.equal(parseObjectRefQuery(q({})), null);
  assert.deepEqual(objectRefInsertFields({ kind: 'goal', id: FILE }), { program_id: null, goal_id: FILE, exercise_name: null });
  assert.deepEqual(objectRefInsertFields(null), { program_id: null, goal_id: null, exercise_name: null });
  assert.deepEqual(objectRefOf({ exercise_name: 'Squat' }), { kind: 'exercise', name: 'Squat' });
  assert.equal(objectRefHref('/messages', { kind: 'exercise', name: 'Squat avant' }), '/messages?exercise=Squat+avant');
  assert.equal(objectRefOpenHref({ kind: 'exercise', name: 'Squat avant' }, 'athlete', CLIENT), '/progress/exercise/Squat%20avant');
  assert.equal(objectRefOpenHref({ kind: 'goal', id: FILE }, 'coach', CLIENT), `/clients/${CLIENT}?tab=overview`);
  assert.equal(objectRefOpenHref({ kind: 'program', id: FILE }, null, CLIENT), null);
});

test('replies quote one line; a voice-only message is named, a lost one is said', () => {
  const labels = { attachment: 'Pièce jointe', missing: 'Message précédent' };
  assert.equal(replyExcerpt({ body: 'Top  séance\n aujourd’hui' }, labels), 'Top séance aujourd’hui');
  assert.equal(replyExcerpt({ body: 'x'.repeat(200) }, labels, 10), `${'x'.repeat(9)}…`);
  assert.equal(replyExcerpt({ body: '', attachments: parseAttachments([{ path: attachmentPath(COACH, CLIENT, FILE, 'webm'), kind: 'audio', mime: 'audio/webm', size: 5, name: 'v.webm' }]) }, labels), 'Pièce jointe');
  assert.equal(replyExcerpt(null, labels), 'Message précédent');
  assert.equal(formatDuration(72), '1:12');
  assert.equal(formatDuration(undefined), '');
  assert.notEqual(messageIdentityText('ok', []), messageIdentityText('ok', parseAttachments([{ path: attachmentPath(COACH, CLIENT, FILE, 'png'), kind: 'image', mime: 'image/png', size: 5, name: 'a.png' }])));
});

test('files stay private: short signed links, never a public URL; unsent uploads are cleaned', () => {
  const api = readFileSync(resolve(process.cwd(), 'src/features/messages/api/attachmentsApi.ts'), 'utf8');
  assert.match(api, /createSignedUrl\(path, 3600\)/);
  assert.doesNotMatch(api, /getPublicUrl/);
  const thread = readFileSync(resolve(process.cwd(), 'src/components/coaching/MessageThread.tsx'), 'utf8');
  assert.match(thread, /removeUnsentAttachment/);
  assert.match(thread, /objectRefOpenHref/);
  // References are sent only inside an active relationship; a prospect shares text and files.
  const client = readFileSync(resolve(process.cwd(), 'src/components/coaching/ClientMessagesPage.tsx'), 'utf8');
  assert.match(client, /ref: myCoach \? objectRef : null/);
  const coach = readFileSync(resolve(process.cwd(), 'src/components/coaching/CoachInboxPage.tsx'), 'utf8');
  assert.match(coach, /ref: activeClient \? objectRef : null/);
});
