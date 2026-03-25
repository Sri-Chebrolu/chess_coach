# Frontend Architecture

## Component Diagram

```mermaid
flowchart LR
    App["App.tsx\nApp state + view switching"] --> Input["InputPanel.tsx\nInitial FEN/PGN submission UI"]
    App --> Layout["AnalysisLayout.tsx\n2-column analysis screen layout"]
    App --> Types["types.ts\nShared TS types/state shapes"]
    App --> Api["api.ts\nFrontend HTTP helpers"]

    Layout --> Board["BoardPanel.tsx\nChessboard area + move handling"]
    Layout --> Coach["CoachPanel.tsx\nCoach chat panel"]

    Board --> Eval["EvalBar.tsx\nVertical evaluation bar"]
    Board --> MoveCard["MoveCard.tsx\nEngine line card"]
    Board --> Pgn["PgnNavigator.tsx\nPGN navigation controls + move display"]
    Board --> Api
    Board --> Types

    Coach --> Chat["ChatBubble.tsx\nIndividual chat message UI"]
    Coach --> Api
    Coach --> Types

    Pgn --> Api
    Pgn --> Types

    App -.passes props/state.-> Board
    App -.passes props/state.-> Coach