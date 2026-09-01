/**
 * Noyau PUR de l'agent coach — aucune dépendance Deno, npm ou réseau.
 *
 * Importé par `_shared/coachAgent.ts` (edge functions), par le front
 * (`src/lib/coachSecond.ts`) et par les tests. Une seule copie : la consigne
 * envoyée à OpenAI est exactement celle que les tests vérifient.
 */

export interface CoachLesson {
  kind: string;
  proposed: unknown;
  accepted: unknown;
  note?: string | null;
}

export const LESSON_RULE =
  "Les leçons ci-dessous sont des corrections de CE coach. Extraire des patterns stables (ton, tutoiement, Relancer vs changement de cibles, split macros, densité du programme). Ne copie pas une erreur ponctuelle ni un one-off.";

const LESSONS_HEADER =
  "Corrections récentes de CE coach (patterns stables seulement — ton, Relancer vs cibles, split macros, densité programme. Ne copie pas une erreur ponctuelle) :";

export function formatLessonsForPrompt(lessons: CoachLesson[]): string {
  if (lessons.length === 0) return "";
  const lines = lessons.map((row, i) => {
    const note = row.note?.trim() ? ` note=${row.note.trim()}` : "";
    return `${i + 1}. kind=${row.kind}${note}\n   proposé: ${JSON.stringify(row.proposed)}\n   envoyé: ${JSON.stringify(row.accepted)}`;
  });
  return [LESSONS_HEADER, ...lines].join("\n");
}

const CREATE_PROGRAM_RE =
  /(cr[eé]er?|create|g[eé]n[eè]re|draft|fais|fait[es]?|make|build|propose|r[eé]dige).{0,48}(programme|program)|(programme|program).{0,20}(ia|ai)|un programme (pour|d['’e]|ia|ai)|un program (for|ia|ai)/i;

export function looksLikeCreateProgram(raw: string): boolean {
  return CREATE_PROGRAM_RE.test(raw.trim());
}
