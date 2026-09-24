import { STANDARD_QUESTIONS, STANDARD_QUESTION_ORDER } from '../../../supabase/functions/_shared/questionnaireStandard';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import { useCoachingStore } from '../../stores/coachingStore';
import { QUESTION_TYPES, parseCoachQuestionnaire, type CoachQuestionnaire, type QuestionnaireQuestion } from '../../lib/coachQuestionnaire';
import {
  assignQuestionnaireComplements,
  getDefaultQuestionnaire,
  listCoachQuestionnaireResponses,
  listQuestionnaires,
  publishQuestionnaire,
  setDefaultQuestionnaire,
  type QuestionnaireVersion,
} from '../../lib/coachQuestionnaireApi';
import {
  canAssignPublicationAction,
  defaultAssignClientIds,
  previewPublicationImpact,
  questionnaireEffort,
  shortQuestionnaireTemplate,
  type PublicationAction,
  type RosterResponseFact,
} from '../../lib/questionnaireBuilder';
import { displayName } from '../../lib/coachText';
import { toast } from '../ui/Toast';
import { ensureLanguage } from '../../i18n';
import CoachQuestionnaireFields from '../onboarding/CoachQuestionnaireFields';
import Button from '../ui/Button';
import Modal from '../ui/Modal';

function nextVersion(versions: QuestionnaireVersion[], questionnaireId: string): number {
  const known = versions.filter(item => item.definition.id === questionnaireId).map(item => item.definition.version);
  return (known.length ? Math.max(...known) : 0) + 1;
}

export default function CoachQuestionnairePage() {
  const { user } = useAuthStore();
  const userId = user?.id;
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith('fr') ? 'fr' : 'en';
  const clients = useCoachingStore(s => s.clients);
  const fetchClients = useCoachingStore(s => s.fetchClients);
  const [versions, setVersions] = useState<QuestionnaireVersion[]>([]);
  const [selected, setSelected] = useState<CoachQuestionnaire | null>(null);
  const [defaultId, setDefaultId] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(false);
  const [previewLang, setPreviewLang] = useState<'fr' | 'en'>('fr');
  const [recapOpen, setRecapOpen] = useState(false);
  const [assignIds, setAssignIds] = useState<string[]>([]);
  const [rosterFacts, setRosterFacts] = useState<RosterResponseFact[]>([]);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  useEffect(() => {
    let active = true;
    if (!userId) return;
    setBusy(true);
    Promise.all([listQuestionnaires(userId), getDefaultQuestionnaire(userId)])
      .then(([v, d]) => { if (active) { setVersions(v); setDefaultId(d); } })
      .catch(() => { if (active) setError(t('coachQuestionnaire.loadError')); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [userId, t]);

  // One card per questionnaire: its latest version (older versions stay in the history).
  const latestVersions = useMemo(() => {
    const byId = new Map<string, (typeof versions)[number]>();
    for (const v of versions) {
      const current = byId.get(v.definition.id);
      if (!current || v.definition.version > current.definition.version) byId.set(v.definition.id, v);
    }
    return [...byId.values()];
  }, [versions]);
  const defaultVersion = versions.find(v => v.id === defaultId) ?? null;
  const localizedName = (definition: { name: { fr: string; en: string } }) =>
    (i18n.language.startsWith('en') ? definition.name.en : definition.name.fr) || definition.name.fr || definition.name.en;

  const previous = useMemo(() => {
    if (!selected) return null;
    return versions
      .filter(item => item.definition.id === selected.id && item.definition.version < selected.version)
      .sort((a, b) => b.definition.version - a.definition.version)[0]?.definition ?? null;
  }, [selected, versions]);

  const impact = useMemo(() => {
    if (!selected) return null;
    return previewPublicationImpact({
      next: selected,
      previous,
      clients: clients.map(client => ({ id: client.id, name: displayName(client) })),
      responses: rosterFacts,
    });
  }, [selected, previous, clients, rosterFacts]);

  const effort = selected ? questionnaireEffort(selected) : null;

  const newDefinition = (kind: 'empty' | 'standard' | 'short') => {
    if (!user) return;
    const id = crypto.randomUUID();
    if (kind === 'short') setSelected(shortQuestionnaireTemplate({ id, coachId: user.id }));
    else setSelected({
      schemaVersion: 1, id, coachId: user.id, version: 1,
      name: { fr: '', en: '' },
      sections: [{
        id: 'section_1',
        label: { fr: 'Questions', en: 'Questions' },
        questions: kind === 'standard' ? STANDARD_QUESTION_ORDER.map(qid => structuredClone(STANDARD_QUESTIONS[qid])) : [],
      }],
    });
    setError('');
    setPreview(kind !== 'empty');
    setPreviewLang(lang);
  };

  const question = (): QuestionnaireQuestion => ({
    id: 'custom_' + crypto.randomUUID(), type: 'text', label: { fr: '', en: '' }, required: false, medical: false,
  });

  const mutate = (fn: (d: CoachQuestionnaire) => void) => {
    if (!selected) return;
    const next = structuredClone(selected);
    fn(next);
    setSelected(next);
    setError('');
  };

  const openRecap = async () => {
    if (!selected || !user || busy) return;
    const parsed = parseCoachQuestionnaire(selected);
    if (!parsed.ok) { setError(t('coachQuestionnaire.invalidDefinition')); return; }
    setBusy(true);
    setError('');
    try {
      const rows = await listCoachQuestionnaireResponses(user.id);
      const facts: RosterResponseFact[] = [];
      for (const row of rows) {
        const matched = versions.find(item => item.id === row.version_id);
        if (!matched) continue;
        facts.push({
          clientId: row.client_id,
          versionId: row.version_id,
          questionnaireId: matched.definition.id,
          version: matched.definition.version,
          completedAt: row.completed_at,
          answers: row.answers,
          createdAt: row.created_at ?? '',
        });
      }
      setRosterFacts(facts);
      const nextImpact = previewPublicationImpact({
        next: parsed.value,
        previous,
        clients: clients.map(client => ({ id: client.id, name: displayName(client) })),
        responses: facts,
      });
      setAssignIds(defaultAssignClientIds(nextImpact.rows));
      setRecapOpen(true);
    } catch {
      setError(t('coachQuestionnaire.loadError'));
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    if (!selected || busy) return;
    const parsed = parseCoachQuestionnaire(selected);
    if (!parsed.ok) { setError(t('coachQuestionnaire.invalidDefinition')); return; }
    setBusy(true);
    setError('');
    try {
      const row = await publishQuestionnaire(parsed.value);
      const chosen = assignIds.filter(id => canAssignPublicationAction(
        impact?.rows.find(item => item.clientId === id)?.action ?? 'unassigned',
      ));
      if (chosen.length) await assignQuestionnaireComplements(row.id, chosen);
      setVersions(v => [row, ...v]);
      setSelected(null);
      setRecapOpen(false);
      toast(chosen.length
        ? t('coachQuestionnaire.publishedAssigned', { count: chosen.length })
        : t('coachQuestionnaire.published'));
    } catch {
      setError(t('coachQuestionnaire.saveError'));
    } finally {
      setBusy(false);
    }
  };

  const chooseDefault = async (id: string | null) => {
    if (!user || busy) return;
    setBusy(true);
    setError('');
    try {
      await setDefaultQuestionnaire(user.id, id);
      setDefaultId(id ?? undefined);
    } catch {
      setError(t('coachQuestionnaire.saveError'));
    } finally {
      setBusy(false);
    }
  };

  const toggleAssign = (clientId: string, action: PublicationAction) => {
    if (!canAssignPublicationAction(action)) return;
    setAssignIds(current => current.includes(clientId)
      ? current.filter(id => id !== clientId)
      : [...current, clientId]);
  };

  const actionLabel = (action: PublicationAction) => {
    if (action === 'keep') return t('coachQuestionnaire.publishKeep');
    if (action === 'in_progress') return t('coachQuestionnaire.publishInProgress');
    if (action === 'unassigned') return t('coachQuestionnaire.publishUnassigned');
    return t('coachQuestionnaire.completeSection');
  };

  const input = 'w-full p-2 rounded border border-neutral-700 bg-neutral-900 text-white';
  return (
    <div className="p-4 pb-28 space-y-4">
      <h1 className="text-xl font-bold">{t('coachQuestionnaire.title')}</h1>
      {error && <p role="alert" className="text-red-400">{error}</p>}
      {!selected ? (
        <>
          {/* 1. What new clients receive today. */}
          <p className="text-sm text-neutral-300" data-testid="questionnaire-current-default">
            {t('coachQuestionnaire.currentDefault', {
              name: defaultVersion ? localizedName(defaultVersion.definition) : t('coachQuestionnaire.standardName'),
            })}
          </p>
          {defaultVersion && (
            <Button variant="ghost" size="sm" onClick={() => void chooseDefault(null)} disabled={busy}>
              {t('coachQuestionnaire.standard')}
            </Button>
          )}

          {/* 2. My questionnaires: the latest version of each, older versions stay in history. */}
          <section className="space-y-2" aria-labelledby="questionnaire-list-title">
            <h2 id="questionnaire-list-title" className="text-sm font-semibold text-white">{t('coachQuestionnaire.listTitle')}</h2>
            {latestVersions.length === 0 ? (
              <p className="text-sm text-neutral-500">{t('coachQuestionnaire.listEmpty')}</p>
            ) : latestVersions.map(v => (
              <div key={v.id} className="border border-neutral-800 rounded-xl p-3 space-y-2">
                <p data-testid={`questionnaire-card-${v.id}`} className="text-sm text-white">
                  <span className="font-medium">{localizedName(v.definition)}</span>
                  <span className="text-neutral-500"> · v{v.definition.version}</span>
                  {defaultVersion?.definition.id === v.definition.id && (
                    <span className="ml-2 text-xs text-emerald-400">
                      ✓ {defaultId === v.id
                        ? t('coachQuestionnaire.defaultBadge')
                        : t('coachQuestionnaire.defaultBadgeOlder', { version: defaultVersion.definition.version })}
                    </span>
                  )}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" data-testid={`questionnaire-edit-${v.id}`} disabled={busy} onClick={() => {
                    const d = structuredClone(v.definition);
                    d.version = nextVersion(versions, d.id);
                    setSelected(d);
                    setPreview(false);
                  }}>{t('common.edit')}</Button>
                  <Button size="sm" variant="secondary" disabled={busy} onClick={() => {
                    const d = structuredClone(v.definition);
                    d.id = crypto.randomUUID();
                    d.version = 1;
                    setSelected(d);
                  }}>{t('coachQuestionnaire.duplicate')}</Button>
                  {defaultId !== v.id && (
                    <Button size="sm" variant="secondary" disabled={busy} onClick={() => void chooseDefault(v.id)}>{t('coachQuestionnaire.useDefault')}</Button>
                  )}
                </div>
              </div>
            ))}
          </section>

          {/* 3. Create: one recommended start, two alternatives. */}
          <section className="space-y-2" aria-labelledby="questionnaire-create-title">
            <h2 id="questionnaire-create-title" className="text-sm font-semibold text-white">{t('coachQuestionnaire.createTitle')}</h2>
            <Button data-testid="questionnaire-from-short" onClick={() => newDefinition('short')} disabled={busy}>
              {t('coachQuestionnaire.fromShort')}
            </Button>
            <p className="text-sm text-neutral-400">{t('coachQuestionnaire.fromShortHint')}</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => newDefinition('empty')} disabled={busy}>
                {t('coachQuestionnaire.emptyQuestionnaire')}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => newDefinition('standard')} disabled={busy}>
                {t('coachQuestionnaire.fromStandard')}
              </Button>
            </div>
          </section>
        </>
      ) : (
        <fieldset disabled={busy} className="space-y-4">
          {effort && (
            <p data-testid="questionnaire-effort" className="text-sm text-neutral-300">
              {t('coachQuestionnaire.effort', {
                screens: effort.screens,
                questions: effort.questions,
                required: effort.required,
              })}
            </p>
          )}
          {(['fr', 'en'] as const).map(item => (
            <label key={item} className="block">{t('coachQuestionnaire.name')} ({item.toUpperCase()})
              <input className={input} value={selected.name[item]} onChange={e => mutate(d => { d.name[item] = e.target.value; })} />
            </label>
          ))}
          {selected.sections.map((section, si) => (
            <section key={section.id} className="border border-neutral-700 rounded p-3 space-y-3">
              {(['fr', 'en'] as const).map(item => (
                <label key={item} className="block">{t('coachQuestionnaire.section')} ({item.toUpperCase()})
                  <input className={input} value={section.label[item]} onChange={e => mutate(d => { d.sections[si].label[item] = e.target.value; })} />
                </label>
              ))}
              {section.questions.map((q, qi) => (
                <div key={q.id} className="p-3 border border-neutral-800 rounded space-y-2">
                  {(['fr', 'en'] as const).map(item => (
                    <label key={item} className="block">{t('coachQuestionnaire.question')} ({item.toUpperCase()})
                      <input className={input} value={q.label[item]} onChange={e => mutate(d => { d.sections[si].questions[qi].label[item] = e.target.value; })} />
                    </label>
                  ))}
                  <details className="rounded-lg border border-neutral-800 p-2">
                    <summary className="min-h-11 flex items-center text-sm text-neutral-400">{t('coachQuestionnaire.advanced')}</summary>
                    <label className="block mt-2">{t('coachQuestionnaire.mapping')}<select className={input} value={q.maps_to ?? ''} onChange={e => mutate(d => {
                      const item = d.sections[si].questions[qi];
                      if (!e.target.value) {
                        delete item.maps_to;
                        if (!item.id.startsWith('custom_')) item.id = 'custom_' + crypto.randomUUID();
                      } else {
                        d.sections[si].questions[qi] = {
                          ...structuredClone(STANDARD_QUESTIONS[e.target.value]),
                          id: item.id.startsWith('custom_') ? item.id : e.target.value,
                        };
                      }
                    })}>
                      <option value="">{t('coachQuestionnaire.unmapped')}</option>
                      {Object.values(STANDARD_QUESTIONS).map(s => <option key={s.id} value={s.id}>{s.label.fr} / {s.label.en}</option>)}
                    </select></label>
                    <label className="block">{t('coachQuestionnaire.type')}<select disabled={!!q.maps_to} className={input} value={q.type} onChange={e => mutate(d => {
                      const item = d.sections[si].questions[qi];
                      item.type = e.target.value as QuestionnaireQuestion['type'];
                      if (item.type === 'single' || item.type === 'multi') item.options ??= [{ id: 'a', label: { fr: '', en: '' } }, { id: 'b', label: { fr: '', en: '' } }];
                      else delete item.options;
                    })}>{QUESTION_TYPES.map(type => <option key={type} value={type}>{t('coachQuestionnaire.types.' + type)}</option>)}</select></label>
                    {q.options?.map((option, oi) => (
                      <div key={option.id} className="flex gap-2">
                        {(['fr', 'en'] as const).map(item => (
                          <label key={item}>{t('coachQuestionnaire.option')} {oi + 1} ({item.toUpperCase()})
                            <input className={input} disabled={!!q.maps_to} value={option.label[item]} onChange={e => mutate(d => { d.sections[si].questions[qi].options![oi].label[item] = e.target.value; })} />
                          </label>
                        ))}
                        <button type="button" disabled={!!q.maps_to} onClick={() => mutate(d => { d.sections[si].questions[qi].options!.splice(oi, 1); })}>{t('common.delete')}</button>
                      </div>
                    ))}
                    {q.options && !q.maps_to && (
                      <button type="button" onClick={() => mutate(d => { d.sections[si].questions[qi].options!.push({ id: crypto.randomUUID(), label: { fr: '', en: '' } }); })}>
                        {t('coachQuestionnaire.addOption')}
                      </button>
                    )}
                    <label className="block"><input type="checkbox" checked={q.required} onChange={e => mutate(d => { d.sections[si].questions[qi].required = e.target.checked; })} />{t('coachQuestionnaire.mandatory')}</label>
                    <label className="block"><input type="checkbox" disabled={!!q.maps_to && STANDARD_QUESTIONS[q.maps_to]?.medical} checked={q.medical} onChange={e => mutate(d => { d.sections[si].questions[qi].medical = e.target.checked; })} />{t('coachQuestionnaire.medical')}</label>
                  </details>
                  <button type="button" disabled={qi === 0} onClick={() => mutate(d => { const qs = d.sections[si].questions; [qs[qi - 1], qs[qi]] = [qs[qi], qs[qi - 1]]; })}>{t('coachQuestionnaire.up')}</button>
                  <button type="button" disabled={qi === section.questions.length - 1} onClick={() => mutate(d => { const qs = d.sections[si].questions; [qs[qi], qs[qi + 1]] = [qs[qi + 1], qs[qi]]; })}>{t('coachQuestionnaire.down')}</button>
                  <button type="button" onClick={() => mutate(d => { d.sections[si].questions.splice(qi, 1); })}>{t('common.delete')}</button>
                </div>
              ))}
              <Button onClick={() => mutate(d => { d.sections[si].questions.push(question()); })}>{t('coachQuestionnaire.addQuestion')}</Button>
              <button type="button" disabled={si === 0} onClick={() => mutate(d => { [d.sections[si - 1], d.sections[si]] = [d.sections[si], d.sections[si - 1]]; })}>{t('coachQuestionnaire.up')}</button>
              <button type="button" onClick={() => mutate(d => { d.sections.splice(si, 1); })}>{t('common.delete')}</button>
            </section>
          ))}
          <Button onClick={() => mutate(d => { d.sections.push({ id: crypto.randomUUID(), label: { fr: '', en: '' }, questions: [] }); })}>{t('coachQuestionnaire.addSection')}</Button>
          <Button variant="secondary" onClick={() => setPreview(v => !v)}>{t('coachQuestionnaire.preview')}</Button>
          {preview && (
            <div data-testid="questionnaire-preview" className="space-y-3">
              <p className="text-sm text-neutral-400">{t('coachQuestionnaire.previewHint')}</p>
              <div className="flex gap-2">
                <Button type="button" variant={previewLang === 'fr' ? 'primary' : 'secondary'} data-testid="questionnaire-preview-fr" onClick={() => setPreviewLang('fr')}>
                  {t('coachQuestionnaire.previewLangFr')}
                </Button>
                <Button type="button" variant={previewLang === 'en' ? 'primary' : 'secondary'} data-testid="questionnaire-preview-en" onClick={() => { void ensureLanguage('en').then(() => setPreviewLang('en')).catch(() => toast(t('errors.generic'), 'error')); }}>
                  {t('coachQuestionnaire.previewLangEn')}
                </Button>
              </div>
              <div className="mx-auto w-full max-w-[390px] rounded-2xl border border-neutral-700 p-3">
                <CoachQuestionnaireFields
                  definition={selected}
                  answers={{}}
                  onChange={() => undefined}
                  disabled
                  previewLanguage={previewLang}
                />
              </div>
            </div>
          )}
          <Button onClick={() => void openRecap()} loading={busy}>{t('coachQuestionnaire.publish')}</Button>
          <Button variant="ghost" onClick={() => setSelected(null)}>{t('common.cancel')}</Button>
        </fieldset>
      )}
      <Modal open={recapOpen} onClose={() => setRecapOpen(false)} title={t('coachQuestionnaire.publishTitle')} size="lg">
        {impact && (
          <div data-testid="questionnaire-publish-recap" className="space-y-4">
            <p className="text-sm text-neutral-300">
              {t(impact.kind === 'complement'
                ? 'coachQuestionnaire.publishComplement'
                : impact.kind === 'first'
                  ? 'coachQuestionnaire.publishFirst'
                  : 'coachQuestionnaire.publishKeepAll')}
            </p>
            {impact.rows.length === 0 && <p className="text-sm text-neutral-400">{t('coachQuestionnaire.publishNone')}</p>}
            <ul className="space-y-2">
              {impact.rows.map(row => (
                <li key={row.clientId}>
                  <label className="flex items-start gap-3 min-h-11">
                    <input
                      type="checkbox"
                      className="mt-1"
                      data-testid={`questionnaire-assign-${row.clientId}`}
                      disabled={!canAssignPublicationAction(row.action)}
                      checked={assignIds.includes(row.clientId)}
                      onChange={() => toggleAssign(row.clientId, row.action)}
                    />
                    <span>
                      <span className="block text-white">{row.name}</span>
                      <span className="text-sm text-neutral-400">{actionLabel(row.action)}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void publish()} loading={busy}>
                {assignIds.length
                  ? t('coachQuestionnaire.assignCount', { count: assignIds.length })
                  : t('coachQuestionnaire.confirmPublish')}
              </Button>
              <Button variant="ghost" onClick={() => setRecapOpen(false)}>{t('common.cancel')}</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
