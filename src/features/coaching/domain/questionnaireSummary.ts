import {
  validateQuestionnaireAnswers,
  type CoachQuestionnaire,
  type QuestionnaireAnswer,
  type QuestionnaireQuestion,
  type QuestionnaireSection,
} from './coachQuestionnaire';

export function questionHasAnswer(
  question: Pick<QuestionnaireQuestion, 'id'>,
  answers: Record<string, QuestionnaireAnswer>,
): boolean {
  if (!Object.prototype.hasOwnProperty.call(answers, question.id)) return false;
  const value = answers[question.id];
  if (value === undefined || value === null) return false;
  if (typeof value === 'string' && !value.trim()) return false;
  if (Array.isArray(value) && value.length === 0) return false;
  return true;
}

export function sectionHasMissingRequired(
  section: QuestionnaireSection,
  answers: Record<string, QuestionnaireAnswer>,
): boolean {
  return section.questions.some(q => q.required && !questionHasAnswer(q, answers));
}

export function carryForwardAnswers(
  previous: Record<string, QuestionnaireAnswer>,
  definition: CoachQuestionnaire,
): Record<string, QuestionnaireAnswer> {
  const next: Record<string, QuestionnaireAnswer> = {};
  for (const question of definition.sections.flatMap(section => section.questions)) {
    if (!questionHasAnswer(question, previous)) continue;
    const value = previous[question.id];
    const issues = validateQuestionnaireAnswers(definition, { [question.id]: value }, false);
    if (issues.some(issue => issue.path === `answers.${question.id}`)) continue;
    next[question.id] = value;
  }
  return next;
}

export function formatQuestionnaireAnswer(input: {
  question: QuestionnaireQuestion;
  value: QuestionnaireAnswer | undefined;
  lang: 'fr' | 'en';
  empty: string;
  yes: string;
  no: string;
}): string {
  const { question, value, lang, empty, yes, no } = input;
  if (value === undefined || value === null) return empty;
  if (typeof value === 'string' && !value.trim()) return empty;
  if (Array.isArray(value) && value.length === 0) return empty;
  switch (question.type) {
    case 'text':
      return typeof value === 'string' ? value : empty;
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? String(value) : empty;
    case 'yes_no':
      return typeof value === 'boolean' ? (value ? yes : no) : empty;
    case 'single': {
      if (typeof value !== 'string') return empty;
      return question.options?.find(option => option.id === value)?.label[lang] ?? value;
    }
    case 'multi': {
      if (!Array.isArray(value)) return empty;
      return value
        .map(item => question.options?.find(option => option.id === item)?.label[lang] ?? String(item))
        .join(', ');
    }
    case 'weekdays': {
      if (!Array.isArray(value)) return empty;
      const locale = lang === 'fr' ? 'fr-FR' : 'en-GB';
      return value
        .filter((item): item is number => typeof item === 'number')
        .sort((a, b) => a - b)
        .map(day => new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' })
          .format(new Date(Date.UTC(2024, 0, day))))
        .join(', ');
    }
    default:
      return empty;
  }
}
