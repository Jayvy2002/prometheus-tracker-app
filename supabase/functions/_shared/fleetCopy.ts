/**
 * Every human-readable string the fleet round writes into a coach_interventions draft
 * (title, observation, cause, rationale, prepared Relancer message), in the coach's language.
 *
 * Pure module, no Deno / browser globals: imported by the Edge Function
 * (`coach-fleet-round`) and by the app-side mirror (`src/lib/coachFleet.ts`) so the
 * two never drift on copy.
 */

export type FleetLocale = "fr" | "en";

export function fleetLocale(raw: unknown): FleetLocale {
  return typeof raw === "string" && raw.trim().toLowerCase().startsWith("en") ? "en" : "fr";
}

export type FleetGoalKey = "cut" | "bulk" | "other";

export interface FleetCopy {
  /** Fallback when the client has no usable name. */
  you: string;
  relance: {
    nutritionOverTarget: (name: string, target: number) => string;
    nutritionOffPlan: (name: string) => string;
    ghost: (name: string) => string;
    tooFastTip: Record<FleetGoalKey, string>;
    tooFast: (name: string, tip: string, windowDays: number) => string;
    training: (name: string) => string;
  };
  kcal: {
    title: Record<string, (name: string) => string>;
    cause: Record<string, string>;
    defaultTitle: (name: string) => string;
    defaultCause: string;
    /** "Cible 2200 kcal, logs ~2180, poids -0.8 kg. Fatigue / perf." */
    carbSupportObservation: (target: number, avg: number, delta: string) => string;
    /** stall_adherent: plan followed, still off goal. */
    stallObservation: (target: number, avg: number, days: number, delta: string) => string;
  };
  keepInTouch: {
    observationSilent: (days: number) => string;
    observationNoMessage: string;
    cause: string;
    body: (name: string) => string;
    title: (name: string) => string;
    /** I04 : profil protégé — revue qualifiée, pas d'ajustement auto. */
    guardedObservation: string;
    guardedCause: string;
  };
  onboarding: {
    observationIncomplete: string;
    observationNoProgram: string;
    observationNoSession: (linkedDays: number) => string;
    causeFirstWeek: string;
    causeNoPlan: string;
    titleFirstWeek: (name: string) => string;
    titleSetup: (name: string) => string;
    rationale: string;
    notes: (name: string) => string;
  };
  nutrition: {
    observationTarget: (target: number, avg: number, days: number, adherence: number | null, delta: string) => string;
    observationOffPlan: (days: number, delta: string) => string;
    causeOverTarget: (target: number) => string;
    causeOffPlan: string;
    titleOverTarget: (target: number) => string;
    titleOffPlan: string;
  };
  training: {
    observationGhost: (idleDays: number) => string;
    observationMissed: (done: number, expected: number, windowDays: number) => string;
    causeGhost: string;
    causeMissed: string;
    titleGhost: (name: string) => string;
    titleMissed: (name: string) => string;
  };
  tooFast: {
    observation: (delta: string, windowDays: number, target: number, avg: number) => string;
    cause: Record<FleetGoalKey, string>;
    titleCut: (name: string) => string;
    titleBulk: (name: string) => string;
    relanceSuffix: string;
    rationaleSuffix: string;
  };
}

const fr: FleetCopy = {
  you: "toi",
  relance: {
    nutritionOverTarget: (name, target) =>
      `Salut ${name}, tes logs sont clairement au-dessus des ${target} kcal qu’on a posés. On ne touche pas encore à la cible : d’abord on l’applique. Tu me dis ce qui bloque (faim, resto, week-end) et on ajuste le plan autour, pas les chiffres.`,
    nutritionOffPlan: (name) =>
      `Salut ${name}, tes logs nutrition ne suivent pas le plan. On n’invente pas une nouvelle cible — dis-moi ce qui bloque et on recale la semaine.`,
    ghost: (name) =>
      `Salut ${name}, je ne te vois plus sur l’app depuis un moment (séances, check-ins, nutrition). Tout va bien ? Réponds-moi quand tu peux — on reprend sans te charger.`,
    tooFastTip: {
      cut: "tu perds un peu vite",
      bulk: "tu prends un peu vite",
      other: "le rythme sort de la trajectoire",
    },
    tooFast: (name, tip, windowDays) =>
      `Salut ${name}, ${tip} sur les ${windowDays} derniers jours. On en parle avant de toucher aux cibles — comment tu te sens (faim, énergie, séances) ?`,
    training: (name) =>
      `Salut ${name}, je n’ai pas vu tes séances récemment. Tout va bien de ton côté ? Dis-moi si on ajuste le programme ou le timing.`,
  },
  kcal: {
    title: {
      cut_stall: (name) => `${name} stagne malgré l’adhérence`,
      cut_gain: (name) => `${name} reprend du poids sur le cut`,
      too_fast_cut: (name) => `${name} perd trop vite`,
      bulk_stall: (name) => `${name} ne progresse pas malgré l’adhérence`,
      bulk_too_fast: (name) => `${name} prend trop vite`,
      carb_support: (name) => `${name} — plus de glucides (fatigue / perf)`,
    },
    cause: {
      cut_stall: "Cut plat et plan suivi — petite baisse, macros complètes. Rien ne s’applique tout seul.",
      cut_gain: "Prise de poids sur un cut alors que le plan est suivi — baisse plus franche, macros complètes.",
      too_fast_cut: "Cut trop rapide et plan suivi — on réduit un peu le déficit, macros complètes.",
      bulk_stall: "Pas de prise alors que le plan est suivi — petite hausse, macros complètes.",
      bulk_too_fast: "Bulk trop rapide et plan suivi — on réduit un peu le surplus, macros complètes.",
      carb_support: "Signes de fatigue / perf en baisse — plus de glucides, pas une nouvelle coupe calorie.",
    },
    defaultTitle: (name) => `${name} — ajustement nutrition`,
    defaultCause: "Proposition data-driven, macros complètes. Le coach confirme.",
    carbSupportObservation: (target, avg, delta) =>
      `Cible ${target} kcal, logs ~${avg}, poids ${delta} kg. Fatigue / perf.`,
    stallObservation: (target, avg, days, delta) =>
      `Cible ${target} kcal, logs ~${avg} (${days} j), poids ${delta} kg. Plan suivi.`,
  },
  keepInTouch: {
    observationSilent: (days) => `Ça va côté logs. Pas de contact coach depuis ${days} jours.`,
    observationNoMessage: "Ça va côté logs. Pas de message coach dans le fil.",
    cause: "Garder le lien — pas un stall, pas une lecture calories.",
    body: (name) =>
      `Salut ${name}, petit check de la semaine — comment tu vas ? L’entraînement passe bien, et tu as besoin de quelque chose ?`,
    title: (name) => `Prendre des nouvelles de ${name}`,
    guardedObservation: "Signal chiffré, mais profil protégé : pas d’ajustement automatique.",
    guardedCause: "Revue qualifiée — à voir ensemble, sans objectif auto de restriction.",
  },
  onboarding: {
    observationIncomplete: "Nouveau client, onboarding incomplet.",
    observationNoProgram: "Onboarding fait, pas encore de programme assigné.",
    observationNoSession: (linkedDays) => `Nouveau client (J+${linkedDays}), aucune séance encore.`,
    causeFirstWeek: "Première semaine — setup, pas un stall.",
    causeNoPlan: "Pas un stall : il n’a pas encore de plan à suivre.",
    titleFirstWeek: (name) => `${name} — première semaine`,
    titleSetup: (name) => `${name} — configurer le plan`,
    rationale: "Nouveau client — setup, pas une relance de stall.",
    notes: (name) =>
      `Configure le suivi et le programme de ${name}. Les calories ISSN du profil restent en place tant que tu ne les écris pas.`,
  },
  nutrition: {
    observationTarget: (target, avg, days, adherence, delta) =>
      `Cible ${target} kcal, logs ~${avg} (${days} j)${adherence != null ? `, adhérence ${adherence}/5` : ""}, poids ${delta} kg.`,
    observationOffPlan: (days, delta) => `Logs nutrition hors plan (${days} j), poids ${delta} kg.`,
    causeOverTarget: (target) =>
      `Il n’applique pas les ${target} — on ne coupe pas les calories tant que le plan n’est pas suivi.`,
    causeOffPlan: "Le plan nutrition n’est pas suivi. Relancer, pas une nouvelle cible.",
    titleOverTarget: (target) => `Il n’applique pas les ${target}`,
    titleOffPlan: "Il n’applique pas le plan nutrition",
  },
  training: {
    observationGhost: (idleDays) => `Pas de séance, check-in ni nutrition depuis plus de ${idleDays} jours.`,
    observationMissed: (done, expected, windowDays) => `Séances ${done}/${expected} sur ${windowDays} jours.`,
    causeGhost: "Client ghost — Relancer, pas de nutrition inventée, pas de chiffres de récup.",
    causeMissed: "Séances manquées — Relancer, pas un nouveau programme.",
    titleGhost: (name) => `${name} a disparu`,
    titleMissed: (name) => `${name} ne suit pas les séances`,
  },
  tooFast: {
    observation: (delta, windowDays, target, avg) =>
      `Poids ${delta} kg sur ${windowDays} j${target ? `, logs ~${avg} vs ${target}` : ""}.`,
    cause: {
      cut: "Cut trop rapide.",
      bulk: "Bulk trop rapide.",
      other: "Rythme hors trajectoire.",
    },
    titleCut: (name) => `${name} perd trop vite`,
    titleBulk: (name) => `${name} prend trop vite`,
    relanceSuffix: "Relancer avant de toucher aux cibles.",
    rationaleSuffix: "Relancer.",
  },
};

const en: FleetCopy = {
  you: "you",
  relance: {
    nutritionOverTarget: (name, target) =>
      `Hey ${name}, your logs are clearly above the ${target} kcal we set. We’re not touching the target yet — first we hit it. Tell me what gets in the way (hunger, eating out, weekends) and we’ll adjust the plan around it, not the numbers.`,
    nutritionOffPlan: (name) =>
      `Hey ${name}, your nutrition logs aren’t following the plan. No new target out of thin air — tell me what’s blocking you and we’ll reset the week.`,
    ghost: (name) =>
      `Hey ${name}, I haven’t seen you in the app for a while (sessions, check-ins, nutrition). Everything OK? Reply when you can — we’ll pick it back up without overloading you.`,
    tooFastTip: {
      cut: "you’re losing a bit fast",
      bulk: "you’re gaining a bit fast",
      other: "the pace is drifting off track",
    },
    tooFast: (name, tip, windowDays) =>
      `Hey ${name}, ${tip} over the last ${windowDays} days. Let’s talk before touching the targets — how are you feeling (hunger, energy, sessions)?`,
    training: (name) =>
      `Hey ${name}, I haven’t seen your sessions lately. Everything OK on your end? Tell me if we should adjust the program or the timing.`,
  },
  kcal: {
    title: {
      cut_stall: (name) => `${name} is stalling despite adherence`,
      cut_gain: (name) => `${name} is regaining weight on the cut`,
      too_fast_cut: (name) => `${name} is losing too fast`,
      bulk_stall: (name) => `${name} isn’t progressing despite adherence`,
      bulk_too_fast: (name) => `${name} is gaining too fast`,
      carb_support: (name) => `${name} — more carbs (fatigue / performance)`,
    },
    cause: {
      cut_stall: "Flat cut and plan followed — small drop, complete macros. Nothing applies on its own.",
      cut_gain: "Weight gain on a cut while the plan is followed — firmer drop, complete macros.",
      too_fast_cut: "Cut too fast and plan followed — we ease the deficit a bit, complete macros.",
      bulk_stall: "No gain while the plan is followed — small bump, complete macros.",
      bulk_too_fast: "Bulk too fast and plan followed — we trim the surplus a bit, complete macros.",
      carb_support: "Signs of fatigue / performance dropping — more carbs, not another calorie cut.",
    },
    defaultTitle: (name) => `${name} — nutrition adjustment`,
    defaultCause: "Data-driven proposal, complete macros. The coach confirms.",
    carbSupportObservation: (target, avg, delta) =>
      `Target ${target} kcal, logs ~${avg}, weight ${delta} kg. Fatigue / performance.`,
    stallObservation: (target, avg, days, delta) =>
      `Target ${target} kcal, logs ~${avg} (${days} d), weight ${delta} kg. Plan followed.`,
  },
  keepInTouch: {
    observationSilent: (days) => `Logs look fine. No coach contact for ${days} days.`,
    observationNoMessage: "Logs look fine. No coach message in the thread.",
    cause: "Keep the connection — not a stall, not a calorie lecture.",
    body: (name) =>
      `Hey ${name}, quick weekly check — how are you doing? Training going well, and do you need anything?`,
    title: (name) => `Check in with ${name}`,
    guardedObservation: "Flagged numbers, but a protected profile: no automatic adjustment.",
    guardedCause: "Qualified review — see it together, no automatic restriction goal.",
  },
  onboarding: {
    observationIncomplete: "New client, onboarding incomplete.",
    observationNoProgram: "Onboarding done, no program assigned yet.",
    observationNoSession: (linkedDays) => `New client (day ${linkedDays}), no session yet.`,
    causeFirstWeek: "First week — setup, not a stall.",
    causeNoPlan: "Not a stall: they don’t have a plan to follow yet.",
    titleFirstWeek: (name) => `${name} — first week`,
    titleSetup: (name) => `${name} — set up the plan`,
    rationale: "New client — setup, not a stall follow-up.",
    notes: (name) =>
      `Set up ${name}’s tracking and program. The profile’s ISSN calories stay in place until you write yours.`,
  },
  nutrition: {
    observationTarget: (target, avg, days, adherence, delta) =>
      `Target ${target} kcal, logs ~${avg} (${days} d)${adherence != null ? `, adherence ${adherence}/5` : ""}, weight ${delta} kg.`,
    observationOffPlan: (days, delta) => `Nutrition logs off plan (${days} d), weight ${delta} kg.`,
    causeOverTarget: (target) =>
      `They’re not hitting the ${target} — we don’t cut calories until the plan is followed.`,
    causeOffPlan: "The nutrition plan isn’t being followed. Follow up, not a new target.",
    titleOverTarget: (target) => `Not hitting the ${target}`,
    titleOffPlan: "Not following the nutrition plan",
  },
  training: {
    observationGhost: (idleDays) => `No session, check-in or nutrition for more than ${idleDays} days.`,
    observationMissed: (done, expected, windowDays) => `Sessions ${done}/${expected} over ${windowDays} days.`,
    causeGhost: "Ghost client — follow up, no invented nutrition, no made-up recovery numbers.",
    causeMissed: "Missed sessions — follow up, not a new program.",
    titleGhost: (name) => `${name} has gone quiet`,
    titleMissed: (name) => `${name} isn’t keeping up with sessions`,
  },
  tooFast: {
    observation: (delta, windowDays, target, avg) =>
      `Weight ${delta} kg over ${windowDays} d${target ? `, logs ~${avg} vs ${target}` : ""}.`,
    cause: {
      cut: "Cut too fast.",
      bulk: "Bulk too fast.",
      other: "Pace off track.",
    },
    titleCut: (name) => `${name} is losing too fast`,
    titleBulk: (name) => `${name} is gaining too fast`,
    relanceSuffix: "Follow up before touching the targets.",
    rationaleSuffix: "Follow up.",
  },
};

export const FLEET_COPY: Record<FleetLocale, FleetCopy> = { fr, en };
