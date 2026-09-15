import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import { getQuestionnaireVersion, listQuestionnaireResponses, saveQuestionnaireResponse, type QuestionnaireResponse } from '../../lib/coachQuestionnaireApi';
import { validateQuestionnaireAnswers, type CoachQuestionnaire, type QuestionnaireAnswer, type QuestionnaireIssue } from '../../lib/coachQuestionnaire';
import {
  carryForwardAnswers,
  formatQuestionnaireAnswer,
  questionHasAnswer,
  sectionHasMissingRequired,
} from '../../lib/questionnaireSummary';
import CoachQuestionnaireFields from './CoachQuestionnaireFields';
import { track } from '../../lib/telemetryClient';
import { useCoachingStore } from '../../stores/coachingStore';
import Button from '../ui/Button';

function ResponseForm({
  initial, readOnly, previousAnswers, onCompleted,
}: {
  initial: QuestionnaireResponse;
  readOnly: boolean;
  previousAnswers?: Record<string, QuestionnaireAnswer>;
  onCompleted?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith('fr') ? 'fr' : 'en';
  const [response, setResponse] = useState(initial);
  const [definition, setDefinition] = useState<CoachQuestionnaire | null>(null);
  const [answers, setAnswers] = useState<Record<string, QuestionnaireAnswer>>(initial.answers);
  const [issues, setIssues] = useState<QuestionnaireIssue[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [retry, setRetry] = useState(0);
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [carried, setCarried] = useState(false);
  const inFlight = useRef(false);
  const dirty = JSON.stringify(answers) !== JSON.stringify(response.answers);
  const locked = readOnly || busy || !!response.completed_at;

  useEffect(() => {
    setResponse(initial);
    setAnswers(initial.answers ?? {});
    setIssues([]);
    setSaved(false);
    setEditingSection(null);
    setCarried(false);
    // Bind to the server row identity; `initial` object identity changes every list fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
  }, [initial.id, initial.revision, initial.completed_at, initial.answers]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  useEffect(() => {
    let active = true;
    setError('');
    getQuestionnaireVersion(initial.version_id).then(v => {
      if (active) setDefinition(v.definition);
    }).catch(() => {
      if (active) setError('coachQuestionnaire.loadError');
    });
    return () => { active = false; };
  }, [initial.version_id, retry]);

  useEffect(() => {
    if (!definition || carried || response.completed_at) return;
    if (Object.keys(initial.answers ?? {}).length > 0) return;
    if (!previousAnswers) return;
    const next = carryForwardAnswers(previousAnswers, definition);
    if (Object.keys(next).length === 0) return;
    setCarried(true);
    setAnswers(next);
  }, [definition, previousAnswers, initial.answers, response.completed_at, carried]);

  const save = async (complete: boolean) => {
    if (!definition || inFlight.current || locked) return;
    const problems = validateQuestionnaireAnswers(definition, answers, complete);
    setIssues(problems);
    if (problems.length) {
      const questionId = problems[0].path.replace(/^answers\./, '');
      const section = definition.sections.find(item => item.questions.some(q => q.id === questionId));
      if (section) setEditingSection(section.id);
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      const next = await saveQuestionnaireResponse(response, answers, complete);
      setResponse(next);
      setSaved(true);
      setEditingSection(null);
      if (complete) {
        track('intake_completed', {
          questionnaire_id: definition.id,
          questionnaire_version: definition.version,
          revisit: false,
          targets_computed: false,
        });
        onCompleted?.();
      }
    } catch {
      setError('coachQuestionnaire.saveError');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <section className="border border-neutral-800 rounded-xl p-4 space-y-3">
      {error && (
        <div role="alert" className="text-red-400">
          <p>{t(error)}</p>
          {!definition && <Button onClick={() => setRetry(n => n + 1)}>{t('errors.retry')}</Button>}
        </div>
      )}
      {!definition && !error && <p role="status">{t('common.loading')}</p>}
      {definition && (
        <>
          <h2 className="font-semibold">
            {definition.name[lang]} · v{definition.version}
          </h2>
          {carried && !response.completed_at && (
            <p className="text-sm text-neutral-400">{t('coachQuestionnaire.carried')}</p>
          )}
          {editingSection ? (
            <>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setEditingSection(null)}
                data-testid="questionnaire-back-summary"
              >
                {t('coachQuestionnaire.backToSummary')}
              </Button>
              <CoachQuestionnaireFields
                definition={definition}
                answers={answers}
                onChange={v => { setAnswers(v); setSaved(false); }}
                issues={issues}
                disabled={locked}
                onlySectionId={editingSection}
              />
            </>
          ) : (
            <div className="space-y-4" data-testid="questionnaire-summary">
              <p className="text-sm text-neutral-400">{t('coachQuestionnaire.summaryTitle')}</p>
              {definition.sections.map(section => {
                const incomplete = sectionHasMissingRequired(section, answers);
                return (
                  <div
                    key={section.id}
                    data-testid={`questionnaire-section-${section.id}`}
                    className="rounded-lg border border-neutral-800 p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-medium">{section.label[lang]}</h3>
                      {incomplete && (
                        <span className="text-[11px] text-amber-300">{t('coachQuestionnaire.sectionIncomplete')}</span>
                      )}
                    </div>
                    <dl className="space-y-1 text-sm">
                      {section.questions.map(question => (
                        <div key={question.id} className="flex gap-2">
                          <dt className="text-neutral-500 shrink-0 max-w-[45%]">{question.label[lang]}</dt>
                          <dd className="text-neutral-200">
                            {formatQuestionnaireAnswer({
                              question,
                              value: answers[question.id],
                              lang,
                              empty: t('coachQuestionnaire.unanswered'),
                              yes: t('common.yes'),
                              no: t('common.no'),
                            })}
                          </dd>
                        </div>
                      ))}
                    </dl>
                    {!locked && (
                      <Button
                        type="button"
                        variant="secondary"
                        data-testid={`questionnaire-edit-${section.id}`}
                        onClick={() => setEditingSection(section.id)}
                      >
                        {t(incomplete || !section.questions.some(q => questionHasAnswer(q, answers))
                          ? 'coachQuestionnaire.completeSection'
                          : 'coachQuestionnaire.editSection')}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {!readOnly && !response.completed_at && (
            <div className="flex gap-2">
              <Button onClick={() => void save(false)} loading={busy}>{t('coachQuestionnaire.saveDraft')}</Button>
              <Button onClick={() => void save(true)} disabled={busy}>{t('coachQuestionnaire.submit')}</Button>
            </div>
          )}
          {(saved || response.completed_at) && (
            <p role="status">{t(response.completed_at ? 'coachQuestionnaire.completed' : 'coachQuestionnaire.saved')}</p>
          )}
        </>
      )}
    </section>
  );
}

export default function ClientQuestionnairePanel({
  clientId, responseId, onCompleted, emptyFallback,
}: {
  clientId?: string;
  responseId?: string;
  onCompleted?: () => void;
  emptyFallback?: ReactNode;
}) {
  const { user } = useAuthStore();
  const myCoach = useCoachingStore(s => s.myCoach);
  const { t } = useTranslation();
  const owner = clientId ?? user?.id;
  const viewingOwn = !clientId || clientId === user?.id;
  const [responses, setResponses] = useState<QuestionnaireResponse[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setResponses([]);
    setError('');
    setLoading(true);
    if (!owner) return () => { active = false; };
    listQuestionnaireResponses(owner).then(rows => {
      if (active) setResponses(rows);
    }).catch(() => {
      if (active) setError('coachQuestionnaire.loadError');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [owner, user?.id, retry]);
  if (!loading && !error && !responses.length && emptyFallback !== undefined) return <>{emptyFallback}</>;
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{t(viewingOwn ? 'coachQuestionnaire.myTitle' : 'coachQuestionnaire.title')}</h1>
      {loading && <p role="status">{t('common.loading')}</p>}
      {error && (
        <div role="alert">
          <p>{t(error)}</p>
          <Button onClick={() => setRetry(v => v + 1)}>{t('errors.retry')}</Button>
        </div>
      )}
      {!loading && !error && !responses.length && <p>{t('coachQuestionnaire.empty')}</p>}
      {responses.filter(r => !responseId || r.id === responseId).map(r => (
        <ResponseForm
          key={r.id}
          initial={r}
          previousAnswers={responses.find(item => item.id !== r.id && item.completed_at)?.answers}
          readOnly={(!!clientId && clientId !== user?.id) || (!clientId && r.coach_id !== myCoach?.id)}
          onCompleted={onCompleted}
        />
      ))}
    </div>
  );
}
