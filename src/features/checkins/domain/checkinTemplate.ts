/**
 * Vision §11 — reusable check-in templates. The essential fields (sleep,
 * energy, stress, pain…) stay the shared base read by the AI and the alerts;
 * a template adds typed custom questions, possibly conditional, each with an
 * optional « why » shown to the athlete (§10: the athlete understands why a
 * habit is asked). Answers keep the label of the moment: editing a template
 * never rewrites the past.
 */

export type QuestionType = 'scale' | 'yes_no' | 'choice' | 'number' | 'text' | 'pain' | 'fatigue';
export const QUESTION_TYPES: readonly QuestionType[] = ['scale', 'yes_no', 'choice', 'number', 'text', 'pain', 'fatigue'];

export interface LocalizedText { fr: string; en?: string }

export interface ChoiceOption { id: string; label: LocalizedText }

export interface QuestionCondition {
  /** Id of an earlier question. */
  question: string;
  /** yes_no or choice option id. */
  equals?: boolean | string;
  /** scale / number / pain / fatigue. */
  gte?: number;
}

export interface CheckinQuestion {
  id: string;
  type: QuestionType;
  label: LocalizedText;
  why?: LocalizedText;
  required?: boolean;
  /** scale: 1–5 by default. pain / fatigue: always 0–10. */
  min?: number;
  max?: number;
  unit?: string;
  options?: ChoiceOption[];
  multiple?: boolean;
  show_if?: QuestionCondition;
}

export interface CheckinTemplate {
  id: string;
  owner_id: string;
  name: string;
  questions: CheckinQuestion[];
  updated_at: string;
}

export type CheckinFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly';
export const CHECKIN_FREQUENCIES: readonly CheckinFrequency[] = ['daily', 'weekly', 'biweekly', 'monthly'];

export interface CheckinPlan {
  user_id: string;
  template_id: string | null;
  frequency: CheckinFrequency;
  weekday: number | null;
  anchor_date: string;
  habit_reasons: Record<string, string>;
  set_by: string | null;
  updated_at: string;
}

export type AnswerValue = boolean | number | string | string[] | null;

/** Stored on daily_checkins.custom_answers: the question as it was asked. */
export interface CustomAnswer {
  id: string;
  type: QuestionType;
  label: string;
  value: AnswerValue;
  /** Choice answers keep their option labels too. */
  display?: string;
}

export function localized(text: LocalizedText | undefined, lang: string): string {
  if (!text) return '';
  return (lang.toLowerCase().startsWith('en') ? text.en?.trim() || text.fr : text.fr) ?? '';
}

export function scaleRange(q: Pick<CheckinQuestion, 'type' | 'min' | 'max'>): { min: number; max: number } {
  if (q.type === 'pain' || q.type === 'fatigue') return { min: 0, max: 10 };
  const min = Number.isFinite(q.min) ? Math.round(q.min as number) : 1;
  const max = Number.isFinite(q.max) ? Math.round(q.max as number) : 5;
  return max > min ? { min, max } : { min: 1, max: 5 };
}

export function isAnswered(value: AnswerValue): boolean {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/** A conditional question shows only once its condition is met by an earlier answer. */
export function conditionMet(q: CheckinQuestion, answers: Record<string, AnswerValue>): boolean {
  const cond = q.show_if;
  if (!cond) return true;
  const value = answers[cond.question];
  if (!isAnswered(value)) return false;
  if (cond.equals !== undefined) {
    return Array.isArray(value) ? value.includes(String(cond.equals)) : value === cond.equals;
  }
  if (cond.gte !== undefined) return typeof value === 'number' && value >= cond.gte;
  return true;
}

export function visibleQuestions(questions: readonly CheckinQuestion[], answers: Record<string, AnswerValue>): CheckinQuestion[] {
  return questions.filter(q => conditionMet(q, answers));
}

/** Required and visible but empty: the check-in cannot be saved yet. */
export function missingRequired(questions: readonly CheckinQuestion[], answers: Record<string, AnswerValue>): string[] {
  return visibleQuestions(questions, answers).filter(q => q.required && !isAnswered(answers[q.id])).map(q => q.id);
}

/** Answers of visible questions only, with the label of today (history never rewritten). */
export function snapshotAnswers(
  questions: readonly CheckinQuestion[],
  answers: Record<string, AnswerValue>,
  lang: string,
): CustomAnswer[] {
  return visibleQuestions(questions, answers)
    .filter(q => isAnswered(answers[q.id]))
    .map(q => {
      const value = answers[q.id];
      const out: CustomAnswer = { id: q.id, type: q.type, label: localized(q.label, lang), value };
      if (q.type === 'choice') {
        const ids = Array.isArray(value) ? value : [String(value)];
        out.display = ids
          .map(id => localized(q.options?.find(o => o.id === id)?.label, lang))
          .filter(Boolean)
          .join(', ');
      }
      return out;
    });
}

/** Builder rules, mirrored by `checkin_questions_valid` in the database. */
export function questionErrors(q: CheckinQuestion, earlier: readonly CheckinQuestion[]): string[] {
  const errors: string[] = [];
  if (!q.label.fr.trim()) errors.push('label');
  if (q.label.fr.length > 200 || (q.label.en ?? '').length > 200) errors.push('labelLength');
  if (q.type === 'choice' && (!q.options || q.options.length < 2 || q.options.some(o => !o.label.fr.trim()))) errors.push('options');
  if (q.show_if) {
    const target = earlier.find(e => e.id === q.show_if?.question);
    if (!target) errors.push('condition');
  }
  return errors;
}

let seq = 0;
export function newQuestionId(): string {
  seq += 1;
  return `q${Date.now().toString(36)}${seq}`;
}

export function emptyQuestion(type: QuestionType): CheckinQuestion {
  const base: CheckinQuestion = { id: newQuestionId(), type, label: { fr: '', en: '' } };
  if (type === 'choice') base.options = [{ id: 'a', label: { fr: '' } }, { id: 'b', label: { fr: '' } }];
  if (type === 'scale') { base.min = 1; base.max = 5; }
  return base;
}

export function moveQuestion(questions: readonly CheckinQuestion[], index: number, delta: -1 | 1): CheckinQuestion[] {
  const next = [...questions];
  const target = index + delta;
  if (target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  // A condition must point to an earlier question: drop the ones that no longer do.
  return next.map((q, i) =>
    q.show_if && !next.slice(0, i).some(e => e.id === q.show_if?.question) ? { ...q, show_if: undefined } : q,
  );
}
