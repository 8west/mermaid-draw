# Entity relationship mapping

Tests entity aliases, nested subgraphs, optional types, keys, comments, and identifying and non-identifying relationships. Edit an attribute and a relationship label, move an entity, and check that cardinalities stay attached.

```mermaid
erDiagram
    direction LR
    subgraph SALES [Sales]
        CUSTOMER["Customer account"] {
            int id PK
            string? email UK "Contact address"
        }
        subgraph ORDERS [Orders]
            ORDER {
                int id PK
                int customerId FK
            }
        end
        CUSTOMER ||--o{ ORDER : places
    end
    ORDER }o..|| CHANNEL : uses
```
