# Sequence diagrams

## Explicit participants

```mermaid
sequenceDiagram
    participant Alice
    participant Bob
    Bob->>Alice: Hi Alice
    Alice->>Bob: Hi Bob
```

Compare the participant order with [Mermaid: Participants](https://mermaid.js.org/syntax/sequenceDiagram.html#participants).

## Actors

```mermaid
sequenceDiagram
    actor Alice
    actor Bob
    Alice->>Bob: Hi Bob
    Bob->>Alice: Hi Alice
```

Compare with [Mermaid: Actors](https://mermaid.js.org/syntax/sequenceDiagram.html#actors).

## Message order and notes

```mermaid
sequenceDiagram
    actor C as Customer
    participant S as Shop
    C->>S: Place order
    Note over C,S: Checkout
    S-->>C: Order confirmed
```

Double-click a participant, message, or note to edit its text. Drag the reply above the request; check the source order, participant IDs, and dashed return arrow.
Move and color a participant, then save and reopen. **Reset styles** should clear colors and positions without undoing text edits or reordering.

## Activations

```mermaid
sequenceDiagram
    participant C as Client
    participant S as Server
    C->>S: Login
    activate S
    S-->>C: Token
    deactivate S
    C->>+S: Fetch
    S-->>-C: Data
```

Each activation draws a narrow locked bar on the server lifeline. Edit a message label and check that `activate`, `deactivate`, `+`, and `-` stay in source. Reorder messages and check the activation lines follow their message; a reorder that leaves an activation unbalanced is rejected. Compare with [Mermaid: Activations](https://mermaid.js.org/syntax/sequenceDiagram.html#activations).
