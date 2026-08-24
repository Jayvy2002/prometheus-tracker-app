const PREFIX = 'prometheus_session_timer_';

export interface SessionTimerState {
  startedAt: number | null;
  elapsedMs: number;
  running: boolean;
}

export function emptyTimer(): SessionTimerState {
  return { startedAt: null, elapsedMs: 0, running: false };
}

export function loadSessionTimer(workoutId: string): SessionTimerState {
  try {
    const raw = localStorage.getItem(PREFIX + workoutId);
    if (!raw) return emptyTimer();
    const parsed = JSON.parse(raw) as SessionTimerState;
    if (typeof parsed.elapsedMs !== 'number') return emptyTimer();
    return {
      startedAt: parsed.startedAt ?? null,
      elapsedMs: Math.max(0, parsed.elapsedMs),
      running: !!parsed.running && parsed.startedAt != null,
    };
  } catch {
    return emptyTimer();
  }
}

export function saveSessionTimer(workoutId: string, state: SessionTimerState) {
  try {
    localStorage.setItem(PREFIX + workoutId, JSON.stringify(state));
  } catch {
    // ignore quota
  }
}

export function clearSessionTimer(workoutId: string) {
  try {
    localStorage.removeItem(PREFIX + workoutId);
  } catch {
    // ignore
  }
}

export function currentElapsedMs(state: SessionTimerState, now = Date.now()): number {
  if (state.running && state.startedAt) {
    return state.elapsedMs + Math.max(0, now - state.startedAt);
  }
  return state.elapsedMs;
}

export function startTimer(state: SessionTimerState, now = Date.now()): SessionTimerState {
  if (state.running) return state;
  return { ...state, running: true, startedAt: now };
}

export function pauseTimer(state: SessionTimerState, now = Date.now()): SessionTimerState {
  if (!state.running) return state;
  return {
    startedAt: null,
    elapsedMs: currentElapsedMs(state, now),
    running: false,
  };
}
