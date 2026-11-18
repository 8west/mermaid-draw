# Order workflow

This document describes how an order is received, prepared, and shipped.

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
