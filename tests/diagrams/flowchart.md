# Flowcharts

## Left-to-right direction

```mermaid
flowchart LR
    Start --> Stop
```

Compare with the left-to-right example in [Mermaid: Direction](https://mermaid.js.org/syntax/flowchart.html#direction).

## Labeled arrow

```mermaid
flowchart LR
    A-->|text|B
```

Compare with [Mermaid: A link with arrow head and text](https://mermaid.js.org/syntax/flowchart.html#a-link-with-arrow-head-and-text).

## Labeled nodes

```mermaid
flowchart LR
    A[Thing A] --> B[Thing B]
```

Delete the arrow. Both labels should remain, including when opening the block as a standalone `.mermaid` file.

## Subgraph direction

```mermaid
flowchart TB
    A[Root]
    B[Branch 1]
    C[Branch 2]
    D[D]
    E[Leaf 2]
    F[Leaf 3]
    G[Leaf 4]
    H[Leaf 5]
    subgraph D [Leaf 1]
        direction TD
        B2[Branch 1]
        A2[Root]
        C2[Branch 2]
        D2[Leaf 1]
        E2[Leaf 2]
        F2[Leaf 3]
        G2[Leaf 4]
        H2[Leaf 5]
    end
    A --> B
    A --> C
    B --> D
    B --> E
    C --> F
    C --> G
    C --> H
    F <-->|hhhh| G
    A2 --> B2
    A2 --> C2
    B2 --> D2
    B2 --> E2
    C2 --> F2
    C2 --> G2
    C2 --> H2
    F2 <--> G2
```

Change the subgraph title's fill and opacity. Check that **Reset styles** clears both without changing its nodes or links.

## Implicit subgraph ID

```mermaid
flowchart LR
subgraph Group title
A[One]
B[Two]
end
A --> B
```

## Saved node position

```mermaid
flowchart LR
A[Root]
%% layout A {"x":10,"y":20}
```

Change the fill, then reset. Both the saved position and the new fill should clear.

The next three diagrams intentionally reuse node IDs. Edit the first and last of the three; verify that the middle diagram, prose, text fence, and footer survive export unchanged.

## Receive the order

```mermaid
flowchart LR
    Start[Order received] --> Done[Order confirmed]
```

Once the order is confirmed, send it to the warehouse for packing.

## Prepare the package

```mermaid
flowchart TD
    Start[Pick items] --> Pack[Pack items]
    Pack --> Done[Print shipping label]
```

Record the tracking number before handing the package to the carrier.

```text
Tracking status: awaiting pickup
```

## Ship the package

```mermaid
flowchart LR
    Start[Carrier pickup] --> Done[Notify customer]
```

## Footer

End of the order workflow. Keep this footer unchanged when exporting the diagrams.
