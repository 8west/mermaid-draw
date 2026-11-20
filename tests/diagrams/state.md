# State diagrams

## State transitions

```mermaid
---
title: Simple sample
---
stateDiagram-v2
    [*] --> Still
    Still --> [*]

    Still --> Moving
    Moving --> Still
    Moving --> Crash
    Crash --> [*]
```

Compare with **Simple sample** in [Mermaid: State diagrams](https://mermaid.js.org/syntax/stateDiagram.html#state-diagrams).

## State aliases

```mermaid
stateDiagram-v2
    state "This is a state description" as s2
```

Compare with the `as` example in [Mermaid: States](https://mermaid.js.org/syntax/stateDiagram.html#states).

## Concurrent regions

```mermaid
stateDiagram-v2
    direction LR
    [*] --> Active
    state Active {
        [*] --> Idle
        Idle --> Running: begin
        Running --> [*]
        --
        [*] --> Listening
        Listening --> Listening: receive
    }
    state Done <<choice>>
    Active --> Done: finish
    Done --> [*]
    note right of Active : Two regions
```

Rename or move a state inside Active. Check that transitions stay connected, start/end markers remain in their own regions, and the note still belongs to Active.
