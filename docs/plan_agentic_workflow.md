# Agentic Workflow Execution Plan

## To-Do List

### Phase 1: Ticket & Scout
- [x] Read backlog.md and identify all items
- [x] Check existing Linear tickets (AIC-1 through AIC-10 exist)
- [x] Create missing tickets (AIC-11, AIC-12, AIC-13 created)
- [x] Map technical context (file paths) to each ticket

### Phase 2: Parallel Execution (Worktree Protocol)
- [ ] **Group A** — `feat/coach-behavior` (AIC-11 + AIC-13): Coach prompt & brevity
- [ ] **Group C** — `feat/pgn-pipeline` (AIC-9 + AIC-12): PGN bug fix + navigation
- [ ] **Group D** — `feat/computer-opponent` (AIC-5): ELO-based computer opponent
- [ ] **Group B** — `feat/move-pipeline` (AIC-6 + AIC-7): Streaming + conditional coach *(after Group A merges)*

### Phase 3: Boss Agent Integration
- [ ] Sequential merge: C → A → D → B
- [ ] Resolve conflicts (expected in merge 4 only)
- [ ] E2E smoke test
- [ ] Update backlog.md + move Linear tickets to Done
- [ ] Clean up worktrees

---

## Context

13 backlog items span 4 categories (Board UX, Opponent Play, Coach Responses, Bugs). The workflow calls for parallel worktree execution of P0/P1 tickets. File overlap analysis reveals that naive 1-ticket-per-worktree would cause merge conflicts in `server.py`, `coach.py`, and `BoardPanel.tsx`. The plan below batches conflicting tickets and sequences merges to minimize conflict resolution.

---

## Ticket Grouping & Rationale

### Group A: Coach Behavior (1 worktree)
| Ticket | Priority | Summary |
|--------|----------|---------|
| AIC-11 | P1 | Coach asks questions first, waits for response |
| AIC-13 | P1 | Shorten responses to 2-4 sentences |

**Why batched:** Both rewrite `SYSTEM_PROMPT` in `coach.py`. Separate worktrees = guaranteed merge conflict.

**Files:** `coach.py` (SYSTEM_PROMPT), `CoachPanel.tsx`

### Group B: Move Pipeline (1 worktree)
| Ticket | Priority | Summary |
|--------|----------|---------|
| AIC-6 | P1 | Reduce latency to <5s (streaming) |
| AIC-7 | P1 | Coach only responds on suboptimal moves |

**Why batched:** Both restructure `/api/move` in `server.py`. AIC-7's conditional logic wraps AIC-6's streaming.

**Why sequenced after Group A:** Group A settles the prompt; Group B refactors the delivery mechanism.

**Files:** `server.py` (/api/move), `coach.py` (_send → streaming), `engine.py`, `api.ts`, `BoardPanel.tsx`

### Group C: PGN Pipeline (1 worktree)
| Ticket | Priority | Summary |
|--------|----------|---------|
| AIC-9 | P3 | Fix "No PGN loaded" bug (do first) |
| AIC-12 | P1 | PGN navigation end-to-end |

**Why batched:** AIC-12 depends on AIC-9. Same code path.

**Files:** `server.py` (/api/analyze), `board_state.py` (pgn methods), `PgnNavigator.tsx`

### Group D: Computer Opponent (1 worktree)
| Ticket | Priority | Summary |
|--------|----------|---------|
| AIC-5 | P0 | Configurable ELO computer opponent |

**Why isolated:** Mostly additive (new endpoint, new UI). Low conflict risk.

**Files:** `engine.py`, `server.py` (new endpoint), `board_state.py`, `BoardPanel.tsx`, `InputPanel.tsx`, `App.tsx`, `types.ts`

---

## Execution Plan

```
Phase 2 — Parallel:
  ├── Worktree A: feat/coach-behavior   (AIC-11 + AIC-13)
  ├── Worktree C: feat/pgn-pipeline     (AIC-9 → AIC-12)
  └── Worktree D: feat/computer-opponent (AIC-5)

Phase 2b — Sequential (after A merges):
  └── Worktree B: feat/move-pipeline    (AIC-6 + AIC-7)
```

### Merge Sequence

| Order | Group | Branch | Conflict Risk | Notes |
|-------|-------|--------|---------------|-------|
| 1 | C | `feat/pgn-pipeline` | None | Touches /api/analyze, board_state pgn, PgnNavigator |
| 2 | A | `feat/coach-behavior` | None | Touches SYSTEM_PROMPT, CoachPanel |
| 3 | D | `feat/computer-opponent` | Low | New endpoint; possible import-line conflict in server.py |
| 4 | B | `feat/move-pipeline` | Medium | Rebase onto main first; resolve /api/move + _send() conflicts |

---

## P2/P3 Tickets Not Included

| Ticket | Reason |
|--------|--------|
| AIC-10 (false sideline msg) | Likely fixed by AIC-9 (same root cause). Verify after Group C merge. |
| AIC-8 (rapid move error) | Partially addressed by AIC-6/7 (streaming + conditional). Verify after Group B. |
| AIC-1–4 (P2 features) | No P0/P1 dependency. Execute after all merges land. |

---

## Verification

**Per-worktree (before commit):**
- Group A: Send move → verify 2-4 sentence Socratic response
- Group B: Measure /api/move latency <5s; best move → no coach response
- Group C: Load PGN → click Start/Prev/Next/End → verify board updates
- Group D: Load FEN + set ELO → verify computer plays opponent moves

**Post-merge E2E smoke test:**
1. `python server.py` — no import errors
2. `cd frontend && npm run dev` — no build errors
3. FEN input → user move → coach response (Groups A, B)
4. PGN input → nav buttons work (Group C)
5. FEN + ELO → computer opponent plays (Group D)
6. Rapid moves → no "Analysis failed" (AIC-8 regression)
7. PGN move → no false sideline message (AIC-10 regression)

---

## Worktree Commands

```bash
# Create worktrees
git worktree add ../coach-behavior -b feat/coach-behavior
git worktree add ../pgn-pipeline -b feat/pgn-pipeline
git worktree add ../computer-opponent -b feat/computer-opponent
# (After Group A merges into main)
git worktree add ../move-pipeline -b feat/move-pipeline

# Cleanup after all merges
git worktree remove ../coach-behavior
git worktree remove ../pgn-pipeline
git worktree remove ../computer-opponent
git worktree remove ../move-pipeline
```
