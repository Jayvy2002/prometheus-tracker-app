# AGENTS.md — Prometheus

> **MANDATORY REPOSITORY CONTRACT FOR CODING AGENTS**
>
> Read this file before changing code. Then read the source-of-truth documents below for the domain being changed.

## Sources of truth

1. `docs/VISION.md` — product destination and non-negotiable invariants.
2. `docs/CHANTIER.md` — current execution order and remaining work.
3. `docs/CARTE_PRODUIT.md` — target journeys, data ownership and permissions.
4. `docs/ARCHITECTURE.md` — technical boundaries and migration rules.
5. `CLAUDE.md` — detailed engineering rules and repository conventions.
6. `README.md` — current project entry point and commands.

Historical audit documents are diagnostic references only. They do **not** override the files above. Cursor project rules in `.cursor/rules/` reinforce this contract but never replace the product sources of truth.

## Branch and PR protocol — mandatory

`new-JV` is the stable integration branch. Coding agents must **not implement features directly on it**.

For every coherent subtask:

1. start from the latest green `new-JV`;
2. create `agent/pX-Y-short-description`;
3. inspect the existing implementation before proposing new primitives;
4. implement one coherent scope only;
5. update tests and durable docs when the contract changes;
6. update `docs/CHANTIER.md` with status/evidence;
7. open a PR to `new-JV` using `.github/pull_request_template.md`;
8. wait for all required checks to be green;
9. review the final diff and report the result to Jean-Vincent;
10. **STOP. Do not merge and do not begin the next subtask without explicit user approval.**

Do not force-push or rewrite `new-JV`. Do not bundle unrelated roadmap items into one PR. Native GitHub branch protection is an administrative reinforcement; this repository policy applies even when that setting is unavailable.

**Current task:** read the `CURRENT IMPLEMENTATION GATE` block near the top of `docs/CHANTIER.md`. It is the only authoritative pointer to the next allowed subtask. Do not hardcode or infer a later task from memory.

## Product model that must not be violated

```text
One user account
├── personal experience
│   ├── Solo: no active Coach
│   └── Coached: active Coach relationship
├── Coach capability: independent yes/no
├── workspace preference: Personal/Coaching
├── marketplace publication: independent opt-in
└── commercial entitlements: separate from identity/relationships
```

Rules:

- Do not build separate Solo/Coached/Coach engines.
- A Coach can use the personal tracker and can themselves be Coached.
- Workspace selection never grants server permissions.
- Permissions depend on resource ownership, relationship and action.
- One athlete can have at most one active Coach.
- AI prepares; a human explicitly decides.
- Missing data is not failure or non-compliance.
- Personal history stays with the user across Solo ↔ Coached transitions.
- Marketplace request ≠ active coaching relationship.
- Coach acceptance alone must not activate a marketplace relationship; final confirmation belongs to the athlete.
- Dashboard = today/overview. Calendar = time/history/future and belongs to Solo + Coached users.
- Program history and completed workouts are not rewritten by future edits.
- No public Coach star/review system unless the Vision is explicitly changed.
- Solo trial = 14 days. Coach grace = 7 days. Final prices are undecided.
- Beta access may bypass billing but usage/cost should remain measurable.

## Before implementing anything

Answer these questions from the current code/docs:

1. Which domain owns the capability?
2. Who owns the data?
3. Who can read it?
4. Who can mutate it?
5. Which relationship/capability/entitlement is actually required?
6. Which invariant must be enforced in DB/RPC/RLS rather than only UI?
7. Which existing primitive already covers part of the need?
8. What is the authoritative state?
9. What happens offline/network failure?
10. What happens for Solo, Coached, Coach, and Coach-who-is-Coached?
11. What happens when coaching ends?
12. Which tests prove completion?

If these are unclear, inspect first. Do not invent a local architecture just to complete the ticket.

## Implementation rules

- Reuse before creating new stores/tables/RPCs/functions/screens.
- Do not rewrite applied migrations. Add a new migration.
- New frontend business logic should follow `UI → hook/use-case/model → domain API → Supabase`.
- Critical authorization/state transitions belong server-side.
- Preserve existing workout/program/nutrition/check-in/message primitives unless a structural impossibility is demonstrated.
- Avoid broad refactors unrelated to the requested capability.
- Keep FR/EN parity, mobile usability, accessibility, loading/empty/error/retry states.
- Do not report success before persistence is confirmed.
- Protect private/sensitive content from product telemetry.

## Mandatory verification

Normal completion requires green:

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm run verify:migrations
npm run verify:edges
```

For RLS/RPC/security-sensitive work:

```bash
npm run test:rls
```

A normal feature task is not complete while the relevant CI is red.

## Final rule

When the simplest local implementation conflicts with `docs/VISION.md`, change the implementation plan — not the Vision.