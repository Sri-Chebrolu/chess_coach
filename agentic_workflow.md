# Agentic Workflow: Parallel Feature Implementation

## 1. Objective
Execute the backlog migration and implementation using a **Parallel Worktree Architecture**. The goal is to maximize velocity while maintaining zero context-bleed between features.

## 2. Phase 1: Ticket & Scout (Main Session)
- **Tool:** Use the Linear Plugin.
- **Input:** Read `backlog.md`.
- **Action:** 
    - Check if Linear tickets have been created for every `[ ]` item.
    - If an item does not have a Linear ticket created, create a Linear ticket
    - For each ticket, perform a `grep` or `find` to identify "Technical Context" (relevant files).
    - Add the file paths to the Linear ticket description.
- **Output:** A list of Linear IDs and their associated file-scopes.

## 3. Phase 2: Parallel Execution (Worktree Protocol)
For each P0 and P1 ticket identified:
1. **Isolate:** Create a new Git Worktree for the ticket: `git worktree add ../[ticket-id] [branch-name]`.
2. **Initialize:** Spin up a new Claude Code session within that worktree directory.
3. **Constraints:**
    - **How:** Follow the "Technical Design" standards (React for UI, python-chess for logic).
    - **Scope:** The agent must *only* modify files listed in the "Technical Context" of the ticket.
    - **Verification:** The agent must verify the fix/feature manually or via a test script before committing. 
4. **Handoff:** Commit the changes and push the branch to origin.

## 4. Phase 3: The "Boss Agent" Integration (Merge & Conflict Resolution)
Once worktrees are complete, the Main Session (Boss Agent) must:
1. **Sync:** Run `git fetch --all`.
2. **Sequential Merge:** Merge each feature branch into `main` one by one.
3. **Conflict Resolution:** If a merge conflict occurs (e.g., `App.tsx` layout), the Boss Agent must resolve it using first-principles reasoning to ensure neither feature's logic is broken.
4. **End-to-End Test:** Run the full application to ensure the application works.

## 5. Definition of Done
- All `backlog.md` items are marked as `[x]`.
- Linear tickets are moved to "Done".
- All worktrees are removed (`git worktree remove`).
- A single, clean PR exists for the combined features.