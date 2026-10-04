---
id: lld-worked-tictactoe
chapter: lld-round
title: A worked pass: Tic Tac Toe
minutes: 4
---
Tic Tac Toe is the framework's own worked example — simple enough that you practise *pacing*, not domain complexity.

**Requirements:** two players alternate X/O on a 3x3 grid; win by row/column/diagonal; draw if the board fills; reject invalid moves (occupied cell, move after game over); query state; reset.

**Entities:** `Game` (orchestrator), `Board`, `Player`, `GameState` enum (IN_PROGRESS / WON / DRAW).

**The key move is separating concerns.** A naïve version mixes display, input, and win-checking in one `play()` loop. Instead each concern owns a class:

- `Board` owns the grid and `hasWinner()` / `makeMove(move)`.
- an `InputHandler` owns reading a move.
- a `Display` owns rendering.
- `Game` just coordinates them.

```flow
dir: LR
game: Game | step
input: InputHandler | tool
board: Board | store
display: Display | tool
game -> input : read move
game -> board : makeMove
board -> game : hasWinner
game -> display : render
```

Payoff: swapping console input for a GUI touches only `InputHandler`; changing win conditions touches only `Board`. Each concern is independently testable.

Signature detail worth copying: prefer `makeMove(player, row, col) -> bool` over a generic `execute(command)` — a specific signature communicates the contract without documentation. And `getWinner() -> Player?` (nullable) beats returning a string.

```recall
Q: Why is Tic Tac Toe the framework's worked example rather than a harder problem?
A: It is simple enough that you practice pacing (scope, entities, class design, one deep method) instead of fighting domain complexity. The skill being drilled is the process, not the game logic.
Q: What does separating Board, InputHandler, Display, and Game buy you concretely?
A: Each concern changes in isolation: swapping console input for a GUI touches only InputHandler, changing win conditions touches only Board, and each is independently testable. A naive single play() loop that mixes them forces edits in one place for unrelated reasons.
Q: Why prefer makeMove(player, row, col) -> bool over a generic execute(command)?
A: A specific signature communicates the contract (who moves, where, and whether it succeeded) without documentation, whereas execute(command) hides what is required and what comes back, pushing the reader to the implementation.
Q: Why return getWinner() -> Player? (nullable) instead of a string?
A: A nullable domain type encodes "there may be no winner yet" in the type system and hands back a real Player the caller can use, while a string invites typos and reparsing and loses the "no winner" case to a magic value.
```
