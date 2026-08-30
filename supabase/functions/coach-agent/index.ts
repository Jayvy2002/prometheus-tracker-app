import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handleCoachAgentHttp } from "../_shared/coachAgent.ts";

/**
 * Synchronous in-app coach agent. JWT required.
 * Writes a ready coach_interventions draft in this same request (200).
 * Does NOT ping Second. Do not create Grok Bots — weekly review is coach-fleet-round.
 * Env: OPENAI_API_KEY (same secret as analyze-product).
 */

Deno.serve(handleCoachAgentHttp);
