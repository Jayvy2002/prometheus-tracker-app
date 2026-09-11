import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";

const record = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const clipped = (v: unknown, max: number): string => typeof v === "string" ? v.slice(0, max) : "";
const label = (v: unknown) => ({ fr: clipped(record(v).fr, 300), en: clipped(record(v).en, 300) });

/** Untrusted client/coach text is context, never a system instruction or a standard field. */
export function compactQuestionnaireContext(definition: unknown, answers: unknown) {
  const d = record(definition);
  const a = record(answers);
  const out: Array<Record<string, unknown>> = [];
  let budget = 12000;
  let omitted = 0;
  const sections = Array.isArray(d.sections) ? d.sections.slice(0, 20) : [];
  for (const section of sections) {
    const questions = record(section).questions;
    for (const raw of (Array.isArray(questions) ? questions.slice(0, 100) : [])) {
      const q = record(raw);
      const id = clipped(q.id, 100);
      if (!id.startsWith("custom_") || !Object.prototype.hasOwnProperty.call(a, id)) continue;
      const value = a[id];
      if (value === null || value === "" || (Array.isArray(value) && value.length === 0)) continue;
      let answer: unknown;
      if (q.type === "single" || q.type === "multi") {
        const selected = Array.isArray(value) ? value : [value];
        answer = (Array.isArray(q.options) ? q.options : [])
          .filter(o => selected.includes(record(o).id))
          .map(o => ({ id: clipped(record(o).id, 100), label: label(record(o).label) }));
      } else if (typeof value === "string") answer = value.slice(0, 1200);
      else if (typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) answer = value;
      else if (q.type === "weekdays" && Array.isArray(value)) {
        answer = value.filter(v => Number.isInteger(v) && Number(v) >= 1 && Number(v) <= 7).slice(0, 7);
      } else continue;
      const item = { id, label: label(q.label), type: clipped(q.type, 20), medical: q.medical === true, answer };
      const size = JSON.stringify(item).length;
      if (out.length >= 40 || size > budget) { omitted++; continue; }
      out.push(item);
      budget -= size;
    }
  }
  return {
    questionnaire_id: clipped(d.id, 100),
    version: typeof d.version === "number" ? d.version : null,
    audience: "active_coach_and_client",
    weekdays: "1=Monday, 7=Sunday",
    answers: out,
    omitted,
  };
}

/** Service-role callers must independently prove the active relationship. Drafts stay out. */
export async function fetchQuestionnaireContext(admin: SupabaseClient, coachId: string, clientId: string | null) {
  if (!clientId || clientId === coachId) return null;
  const link = await admin.from("coach_client_links").select("id")
    .eq("coach_id", coachId).eq("client_id", clientId).eq("status", "active").maybeSingle();
  if (link.error) throw new Error("questionnaire_context_unavailable");
  if (!link.data) return null;
  const response = await admin.from("client_questionnaire_responses")
    .select("version_id,answers").eq("coach_id", coachId).eq("client_id", clientId)
    .not("completed_at", "is", null).order("completed_at", { ascending: false }).limit(1).maybeSingle();
  if (response.error) throw new Error("questionnaire_context_unavailable");
  if (!response.data) return null;
  const version = await admin.from("coach_questionnaire_versions").select("definition")
    .eq("id", response.data.version_id).eq("coach_id", coachId).single();
  if (version.error) throw new Error("questionnaire_context_unavailable");
  return compactQuestionnaireContext(version.data.definition, response.data.answers);
}
