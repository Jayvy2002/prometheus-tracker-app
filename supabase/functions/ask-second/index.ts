import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handleCoachAgentHttp } from "../_shared/coachAgent.ts";

/**
 * Compat alias of coach-agent. Same sync OpenAI path, same 200 + draft.
 * Does NOT ping the Grok Bot webhook / Second.
 */

Deno.serve(handleCoachAgentHttp);
