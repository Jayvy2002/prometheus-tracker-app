import { supabase } from '../../../lib/supabase';
import {
  MESSAGE_ATTACHMENT_BUCKET,
  attachmentKindFor,
  attachmentPath,
  attachmentProblem,
  extensionOf,
  type AttachmentProblem,
  type MessageAttachment,
} from '../domain/messageContent';

/**
 * Uploads one file into the thread's private folder. The message that
 * references it is written afterwards; until then the file is « unsent » and
 * its uploader may remove it (storage policy).
 */
export async function uploadMessageAttachment(input: {
  coachId: string;
  clientId: string;
  file: File | Blob;
  name: string;
  alreadyAttached: number;
  durationS?: number;
}): Promise<{ attachment: MessageAttachment | null; error: AttachmentProblem | 'upload_failed' | null }> {
  const type = input.file.type || 'application/octet-stream';
  const problem = attachmentProblem({ name: input.name, type, size: input.file.size }, input.alreadyAttached);
  if (problem) return { attachment: null, error: problem };
  const extension = extensionOf(input.name, type);
  if (!extension) return { attachment: null, error: 'type_not_allowed' };
  const path = attachmentPath(input.coachId, input.clientId, crypto.randomUUID(), extension);
  const contentType = type.split(';')[0];
  const { error } = await supabase.storage
    .from(MESSAGE_ATTACHMENT_BUCKET)
    .upload(path, input.file, { contentType, upsert: false, cacheControl: '3600' });
  if (error) return { attachment: null, error: 'upload_failed' };
  return {
    attachment: {
      path,
      kind: attachmentKindFor(extension, contentType),
      mime: contentType,
      size: input.file.size,
      name: input.name.trim().slice(0, 120) || `${path.split('/').pop()}`,
      ...(input.durationS != null ? { duration_s: Math.min(600, Math.max(0, Math.round(input.durationS))) } : {}),
    },
    error: null,
  };
}

/** Best effort: a removed chip or an abandoned draft leaves no orphan. */
export async function removeUnsentAttachment(path: string): Promise<void> {
  await supabase.storage.from(MESSAGE_ATTACHMENT_BUCKET).remove([path]).catch(() => undefined);
}

const signed = new Map<string, { url: string; expires: number }>();

/** Short-lived link for a thread party; nothing public. */
export async function attachmentUrl(path: string): Promise<string | null> {
  const cached = signed.get(path);
  if (cached && cached.expires > Date.now() + 60_000) return cached.url;
  const { data, error } = await supabase.storage.from(MESSAGE_ATTACHMENT_BUCKET).createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) return null;
  signed.set(path, { url: data.signedUrl, expires: Date.now() + 3600_000 });
  return data.signedUrl;
}
