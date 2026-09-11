/**
 * Custom questionnaire contract. No persistence or authorization lives here.
 * Standard intake fields remain owned by kinesiologyIntake; this first slice
 * deliberately cannot reinterpret them through a custom question.
 */
export const QUESTIONNAIRE_SCHEMA_VERSION = 1 as const;
export const QUESTION_TYPES = ['text', 'number', 'single', 'multi', 'yes_no', 'weekdays'] as const;
export type QuestionType = typeof QUESTION_TYPES[number];
export interface BilingualLabel { fr: string; en: string }
export interface QuestionnaireOption { id: string; label: BilingualLabel }
export interface QuestionnaireQuestion {
  id: string;
  label: BilingualLabel;
  type: QuestionType;
  required: boolean;
  medical: boolean;
  options?: QuestionnaireOption[];
}
export interface QuestionnaireSection {
  id: string;
  label: BilingualLabel;
  questions: QuestionnaireQuestion[];
}
export interface CoachQuestionnaire {
  schemaVersion: typeof QUESTIONNAIRE_SCHEMA_VERSION;
  id: string;
  coachId: string;
  version: number;
  name: BilingualLabel;
  sections: QuestionnaireSection[];
}
export type QuestionnaireAnswer = string | number | boolean | string[] | number[];
export interface QuestionnaireSubmission {
  definition: CoachQuestionnaire;
  answers: Record<string, QuestionnaireAnswer>;
}
export interface QuestionnaireIssue { path: string; code: string }
type Result<T> = { ok: true; value: T } | { ok: false; issues: QuestionnaireIssue[] };
const object = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const identifier = (v: unknown): v is string =>
  typeof v === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(v)
  && !['constructor', 'prototype', '__proto__'].includes(v);
const text = (v: unknown, max: number): v is string =>
  typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const label = (v: unknown): v is BilingualLabel =>
  object(v) && text(v.fr, 500) && text(v.en, 500);
const only = (v: Record<string, unknown>, keys: string[]) =>
  Object.keys(v).every(key => keys.includes(key));

/** Strict boundary for imported/stored definitions. Never logs answer content. */
export function parseCoachQuestionnaire(input: unknown): Result<CoachQuestionnaire> {
  const issues: QuestionnaireIssue[] = [];
  const issue = (path: string, code: string) => issues.push({ path, code });
  if (!object(input)) return { ok: false, issues: [{ path: '', code: 'object_required' }] };
  if (!only(input, ['schemaVersion', 'id', 'coachId', 'version', 'name', 'sections'])) issue('', 'unknown_field');
  if (input.schemaVersion !== QUESTIONNAIRE_SCHEMA_VERSION) issue('schemaVersion', 'unsupported_version');
  if (!identifier(input.id)) issue('id', 'invalid_id');
  if (!identifier(input.coachId)) issue('coachId', 'invalid_id');
  if (!Number.isSafeInteger(input.version) || Number(input.version) < 1) issue('version', 'invalid_version');
  if (!label(input.name)) issue('name', 'bilingual_label_required');
  if (!Array.isArray(input.sections) || input.sections.length < 1 || input.sections.length > 20) {
    issue('sections', 'section_count');
  } else {
    const sectionIds = new Set<string>();
    const questionIds = new Set<string>();
    let count = 0;
    input.sections.forEach((section, s) => {
      const path = 'sections.' + s;
      if (!object(section)) { issue(path, 'object_required'); return; }
      if (!only(section, ['id', 'label', 'questions'])) issue(path, 'unknown_field');
      if (!identifier(section.id) || sectionIds.has(section.id)) issue(path + '.id', 'invalid_or_duplicate_id');
      else sectionIds.add(section.id);
      if (!label(section.label)) issue(path + '.label', 'bilingual_label_required');
      if (!Array.isArray(section.questions) || section.questions.length === 0 || section.questions.length > 100) {
        issue(path + '.questions', 'question_count'); return;
      }
      count += section.questions.length;
      section.questions.forEach((q, n) => {
        const qp = path + '.questions.' + n;
        if (!object(q)) { issue(qp, 'object_required'); return; }
        if (!only(q, ['id', 'label', 'type', 'required', 'medical', 'options'])) issue(qp, 'unknown_field');
        // Namespaced custom IDs cannot masquerade as existing standard fields.
        if (!identifier(q.id) || !q.id.startsWith('custom_') || questionIds.has(q.id)) issue(qp + '.id', 'invalid_or_duplicate_id');
        else questionIds.add(q.id);
        if (!label(q.label)) issue(qp + '.label', 'bilingual_label_required');
        if (!QUESTION_TYPES.includes(q.type as QuestionType)) issue(qp + '.type', 'unknown_type');
        if (typeof q.required !== 'boolean') issue(qp + '.required', 'boolean_required');
        if (typeof q.medical !== 'boolean') issue(qp + '.medical', 'boolean_required');
        if (q.type === 'single' || q.type === 'multi') {
          if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 50) {
            issue(qp + '.options', 'option_count'); return;
          }
          const ids = new Set<string>();
          q.options.forEach((option, o) => {
            const op = qp + '.options.' + o;
            if (!object(option)) { issue(op, 'object_required'); return; }
            if (!only(option, ['id', 'label'])) issue(op, 'unknown_field');
            if (!identifier(option.id) || ids.has(option.id)) issue(op + '.id', 'invalid_or_duplicate_id');
            else ids.add(option.id);
            if (!label(option.label)) issue(op + '.label', 'bilingual_label_required');
          });
        } else if (q.options !== undefined) issue(qp + '.options', 'options_not_allowed');
      });
    });
    if (count > 100) issue('sections', 'question_count');
  }
  if (issues.length) return { ok: false, issues };
  return { ok: true, value: structuredClone(input) as unknown as CoachQuestionnaire };
}

/** Validate draft answers without requiring unanswered mandatory questions. */
export function validateQuestionnaireAnswers(
  definition: CoachQuestionnaire,
  input: unknown,
  complete = true,
): QuestionnaireIssue[] {
  const parsed = parseCoachQuestionnaire(definition);
  if (!parsed.ok) return parsed.issues;
  if (!object(input)) return [{ path: 'answers', code: 'object_required' }];
  const issues: QuestionnaireIssue[] = [];
  const questions = definition.sections.flatMap(s => s.questions);
  const known = new Set(questions.map(q => q.id));
  for (const id of Object.keys(input)) {
    if (!known.has(id)) issues.push({ path: 'answers.' + id, code: 'unknown_question' });
  }
  for (const q of questions) {
    const value = Object.prototype.hasOwnProperty.call(input, q.id) ? input[q.id] : undefined;
    const missing = value === undefined || value === null
      || (typeof value === 'string' && !value.trim()) || (Array.isArray(value) && value.length === 0);
    if (missing) {
      if (complete && q.required) issues.push({ path: 'answers.' + q.id, code: 'required' });
      continue;
    }
    const ids = new Set(q.options?.map(o => o.id));
    let valid = false;
    switch (q.type) {
      case 'text': valid = typeof value === 'string' && value.length <= 10000; break;
      case 'number': valid = typeof value === 'number' && Number.isFinite(value); break;
      case 'yes_no': valid = typeof value === 'boolean'; break;
      case 'single': valid = typeof value === 'string' && ids.has(value); break;
      case 'multi': valid = Array.isArray(value) && value.every(v => typeof v === 'string' && ids.has(v))
        && new Set(value).size === value.length; break;
      case 'weekdays': valid = Array.isArray(value) && value.every(v => Number.isInteger(v) && v >= 1 && v <= 7)
        && new Set(value).size === value.length; break;
    }
    if (!valid) issues.push({ path: 'answers.' + q.id, code: 'invalid_answer' });
  }
  return issues;
}

/** A submission owns a snapshot; editing the builder cannot rewrite its labels. */
export function snapshotQuestionnaireSubmission(
  definition: CoachQuestionnaire, answers: unknown,
): Result<QuestionnaireSubmission> {
  const issues = validateQuestionnaireAnswers(definition, answers);
  if (issues.length) return { ok: false, issues };
  const normalized: Record<string, QuestionnaireAnswer> = {};
  for (const q of definition.sections.flatMap(s => s.questions)) {
    if (!Object.prototype.hasOwnProperty.call(answers, q.id)) continue;
    const value = (answers as Record<string, unknown>)[q.id];
    if (value === undefined || value === null || (typeof value === 'string' && !value.trim())
      || (Array.isArray(value) && value.length === 0)) continue;
    normalized[q.id] = structuredClone(value) as QuestionnaireAnswer;
  }
  return { ok: true, value: { definition: structuredClone(definition), answers: normalized } };
}

/** Caller persists with an optimistic version check; this helper never authorizes. */
export function reviseCoachQuestionnaire(
  previous: CoachQuestionnaire,
  changes: Pick<CoachQuestionnaire, 'name' | 'sections'>,
): Result<CoachQuestionnaire> {
  const original = parseCoachQuestionnaire(previous);
  if (!original.ok) return original;
  return parseCoachQuestionnaire({
    ...original.value, name: changes.name, sections: changes.sections,
    version: original.value.version + 1,
  });
}
