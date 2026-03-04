# UI Specification: AI Chess Coach (v1)

## 1. Project Objective
A minimalist, high-utility interface for loading chess positions via FEN/PGN and engaging in a strategic dialogue with an AI coach.

---

## 2. Component Architecture & States
The application follows a strictly defined state machine to prevent rendering errors.

### State A: Input View (Initial State)
* **Objective:** Gather chess data before initializing the engine.
* **Layout:** Centered single-column layout.
* **Components:**
    * `TextArea [FEN]`: Labeled "FEN String". Placeholder: `rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1`
    * `TextArea [PGN]`: Labeled "PGN Data". Placeholder: `1. e4 e5 2. Nf3...`
    * `Button [Submit]`: Primary action button centered below inputs.
* **Transition Logic:** On click, validate strings using `BoardState.load_fen()` or `BoardState.load_pgn()`. If valid, mount the Analysis View. 

### State B: Analysis View (Active State)
* **Objective:** Provide an interactive board and contextual AI chat.
* **Layout:** Two-column split (60% Board / 40% Chat).
* **Left Column (Chessboard):**
    * Render an interactive board initialized with the validated FEN/PGN.
    * Enable click moves that update the local game state. 
* **Right Column (Coach Interface):**
    * `ChatHistory`: Scrollable window showing the conversation.
    * `ChatInput`: Text field for user questions.
    * **Context Rule:** Every message sent to the AI must include the current FEN string as hidden metadata to ensure the AI "sees" the board.

---

## 3. Visual Identity (Industrial Utilitarian)
* **Theme:** Dark Mode by default.
* **Primary Palette:** Background `#121212`, Surface `#1e1e1e`, Accent `#769656` (Chess Green).
* **Typography:** * **Headings:** Sans-serif (e.g., Inter).
    * **Data/Notations:** Monospace (e.g., JetBrains Mono) for FEN/PGN display.
* **Guiding Principle:** No "AI Slop" (no purple gradients or unnecessary shadows). Use sharp borders and high-contrast text.

---

## 4. Technical Constraints
* **Logic Engine:** `BoardState.load_fen()` or `BoardState.load_pgn()` for move validation and parsing.
* **UI Components:** `react-chessboard` (or equivalent) for the board UI. 
* **Framework:** React with Tailwind CSS.