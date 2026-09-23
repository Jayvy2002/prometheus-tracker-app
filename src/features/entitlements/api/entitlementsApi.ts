import { supabase } from '../../../lib/supabase';
import { parseMyEntitlements, type MyEntitlements } from '../domain/entitlements';

/** The signed-in account's own rights. Never another account's. */
export async function fetchMyEntitlements(): Promise<{ data: MyEntitlements | null; error: string | null }> {
  const { data, error } = await supabase.rpc('get_my_entitlements');
  if (error) return { data: null, error: error.message };
  return { data: parseMyEntitlements(data), error: null };
}
