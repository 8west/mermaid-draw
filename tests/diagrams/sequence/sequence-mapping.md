# Sequence mapping

Double-click a participant box, message arrow, or note to edit its text. Check that actor and participant IDs are unchanged. Drag a message past another, then save and reopen to check statement order and the dashed return arrow.

Drag a participant a short distance without crossing columns and change its fill. Save and reopen to check that both edits persist. Use **Reset styles** to clear colors and positions without undoing text edits or reordering.

```mermaid
sequenceDiagram
    actor C as Customer
    participant S as Shop
    C->>S: Place order
    Note over C,S: Checkout
    S-->>C: Order confirmed
```

Text after the diagram should remain unchanged.
