# Requirement diagrams

## Checkout relationships

```mermaid
requirementDiagram
  requirement checkout_req {
    id: 1
    text: Orders must be payable online.
    risk: high
    verifymethod: test
  }
  functionalRequirement payment_req {
    id: 1.1
    text: Card payments must be authorised.
    risk: high
    verifymethod: test
  }
  element checkout_service {
    type: service
  }
  checkout_req - contains -> payment_req
  checkout_service - satisfies -> payment_req
```

Compare with [Mermaid: Requirement Diagram - With the defaults](https://mermaid.js.org/syntax/requirementDiagram.html#with-the-defaults).
Move the checkout service beside the checkout requirement. Their arrows to the payment requirement should stay distinct.

## Fields and reverse links

```mermaid
requirementDiagram
    direction LR
    functionalRequirement Retry {
        id: "PAY-1"
        text: A failed payment can be retried.
        risk: medium
        verifymethod: test
    }

    element "Checkout suite" {
        type: "test suite"
        docRef: specs/checkout
    }

    Retry <- verifies - "Checkout suite"
    style Retry stroke:#1971c2
```

Edit Retry's risk and the relationship type. Save and reopen; the changes should keep the reverse arrow notation and leave the other diagrams untouched.

## Connector bends

```mermaid
requirementDiagram
requirement A {
}
requirement B {
}
A - verifies -> B
%% graph-route [[230,30]]
%% graph-layout requirement:B 400 150
```

Select the bend and switch between Sharp, Curved, and Elbow. After download and reopen, the route should keep its style and still connect A to B with `verifies`.
