# State mapping

Tests scoped start and end markers, a composite state with concurrent regions, a choice, and a note. Rename a state or transition, move a state, and check that its transitions stay connected.

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
