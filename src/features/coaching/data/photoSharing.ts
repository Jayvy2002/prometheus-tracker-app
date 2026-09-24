import { supabase } from '../../../lib/supabase';

/**
 * Vision §14.4 / §22.2 — progress photos are private by default. The athlete
 * shares them with the active coach; ending the relationship ends the share.
 * The database enforces it (`coach_can_see_progress_photos`); this is only the
 * read/write surface.
 */
export type PhotoSharingState =
  | { status: 'ready'; shared: boolean }
  | { status: 'error' };

/** Athlete side: is my photo history shared with my current coach? */
export async function fetchMyPhotoSharing(userId: string): Promise<PhotoSharingState> {
  const { data, error } = await supabase
    .from('progress_photo_shares')
    .select('coach_id')
    .eq('client_id', userId)
    .maybeSingle();
  if (error) return { status: 'error' };
  return { status: 'ready', shared: !!data };
}

/** Coach side: RLS only returns the row for the active coach it was shared with. */
export async function fetchClientPhotoSharing(clientId: string): Promise<PhotoSharingState> {
  const { data, error } = await supabase
    .from('progress_photo_shares')
    .select('client_id')
    .eq('client_id', clientId)
    .maybeSingle();
  if (error) return { status: 'error' };
  return { status: 'ready', shared: !!data };
}

/** Resolves only after the server confirmed the new state. */
export async function setMyPhotoSharing(share: boolean): Promise<{ shared: boolean } | { error: string }> {
  const { data, error } = await supabase.rpc('set_progress_photo_sharing', { p_share: share });
  if (error) return { error: error.message };
  return { shared: data === true };
}
