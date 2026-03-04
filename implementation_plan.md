# Backlog implementation plan

## Board UX plan

### Scope (from `backlog.md` lines 4-7)
1. Lock board orientation to user choice (no auto-flip on every ply).
2. Ensure explicit PGN backward/forward controls are available and usable.
3. Allow sideline exploration from any PGN position without stale navigation state.

### Success criteria
- Board does not flip automatically after each move.
- Player can explicitly step `prev`/`next` through PGN history.
- If player makes an alternative move from a PGN position, PGN navigation exits cleanly and the user can continue exploring the new sideline.

### To-do checklist
- [x] Add explicit board orientation state and a toggle control.
- [x] Keep orientation independent from side-to-move updates.
- [x] Improve PGN nav controls labeling/UX for clear prev/next stepping.
- [x] Handle PGN state transition when deviating via a played move.
- [x] Add/update e2e coverage for orientation lock + PGN deviation behavior.

## Coach responses plan

### Scope (from `backlog.md` lines 9-11)
1. Enforce shorter coach replies (2-4 sentences, punchier style).
2. Reduce response latency and remove event-loop blocking hot paths.

### Success criteria
- Coach outputs are brief and direct (capped to 4 sentences).
- Backend offloads blocking engine/LLM work from async event loop.
- End-to-end perceived response time for move/chat paths improves and no longer stalls due to blocking waits.

### To-do checklist
- [x] Tighten prompt instructions for short, punchy responses.
- [x] Lower generation token budget to reduce output latency.
- [x] Add a deterministic post-processor to cap responses at 4 sentences.
- [x] Run engine + coach blocking calls in worker threads (`asyncio.to_thread`) in API endpoints.
- [x] Replace blocking retry sleep with safer retry behavior tuned for low latency.
- [x] Add/update tests for capped coach response formatting and latency-safe execution path.

## Validation plan
- Run targeted frontend Playwright tests for PGN and board behavior.
- Run targeted Python tests for coach response capping and API concurrency behavior.
- Manually verify in browser with a short walkthrough video and screenshot artifact.
