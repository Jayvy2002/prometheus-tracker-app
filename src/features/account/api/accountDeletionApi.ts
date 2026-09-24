import { supabase } from '../../../lib/supabase';
import { parseAccountDeletion, type AccountDeletionState } from '../domain/accountDeletion';

export async function fetchAccountDeletion(userId: string): Promise<{ state: AccountDeletionState; error: string | null }> {
  const { data, error } = await supabase
    .from('account_deletion_requests')
    .select('status, purge_after')
    .eq('user_id', userId)
    .maybeSingle();
  return { state: parseAccountDeletion(data as { status?: unknown; purge_after?: unknown } | null), error: error?.message ?? null };
}

export async function requestAccountDeletion(): Promise<{ state: AccountDeletionState | null; error: string | null }> {
  const { data, error } = await supabase.rpc('request_account_deletion');
  if (error) return { state: null, error: error.message };
  return { state: parseAccountDeletion(data as { status?: unknown; purge_after?: unknown }), error: null };
}

export async function cancelAccountDeletion(): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('cancel_account_deletion');
  return { error: error?.message ?? null };
}
