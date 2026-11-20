# Class diagrams

## Class declarations

```mermaid
classDiagram
    class Animal
    Vehicle <|-- Car
```

Compare with [Mermaid: Define a class](https://mermaid.js.org/syntax/classDiagram.html#define-a-class).

## Composition and members

```mermaid
classDiagram
    class Order["Purchase Order"] {
        +String number
        +submit() void
    }
    class Item {
        +String name
    }
    Order "1" *-- "1..*" Item : contains
```

Edit the class alias, members, and relationship label. Drag Purchase Order twice, then Item. Check that the line, label, and multiplicities follow each move. Save and reopen, then reset styles; the text edits, class IDs, and composition operator should survive.

## Standalone and attached notes

```mermaid
classDiagram
    note "Overview"
    class Book {
        +String title
    }
    note for Book "First<br>Second"
    note for Book "First<br>Second"
```

For each note, edit its text, drag twice, and change fill and stroke without reselecting. Try the fill pattern, stroke width and pattern, roughness, opacity, corners, font, and alignment. Save and reopen. The two identical notes should keep independent formatting; reset should preserve text and class attachments.
