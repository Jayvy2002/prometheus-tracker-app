/**
 * Session scope (S05) — isole caches, brouillons et minuteurs par compte.
 *
 * Sur un navigateur partagé, A → logout → B ne doit jamais réafficher les
 * données de A, même hors ligne ou via une vieille URL. Chaque stockage local
 * sensible est donc namespacé par le user id courant.
 */

let currentOwner: string | null = null;

export function setSessionOwner(owner: string | null): void {
  currentOwner = owner;
}

export function getSessionOwner(): string | null {
  return currentOwner;
}

/** Clé locale namespacée par compte. Sans owner (déconnecté), espace "anon". */
export function scopedKey(prefix: string, id: string): string {
  const owner = currentOwner ?? 'anon';
  return `${prefix}_${owner}_${id}`;
}

/**
 * Générations anti-repeuplement : chaque store incrémente sa génération au reset.
 * Les réponses async capturent la génération et s'ignorent si elle a changé
 * (logout ou changement de compte pendant la requête).
 */
export function createGeneration(): {
  next: () => number;
  current: () => number;
  capture: () => number;
  isStale: (captured: number) => boolean;
} {
  let generation = 0;
  return {
    next: () => ++generation,
    current: () => generation,
    capture: () => generation,
    isStale: (captured: number) => captured !== generation,
  };
}
