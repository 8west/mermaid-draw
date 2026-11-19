# 1. VS Code document sync

## Status

Accepted

## Context

The VS Code extension shows a file on Excalidraw canvases while the same file can be edited as text, by other extensions, or on disk. Canvas edits change the text, and text changes redraw the canvas. Naive two-way sync loops or lets a stale canvas overwrite newer text.

## Decision

- Use a `CustomTextEditorProvider`. The VS Code `TextDocument` is the only source of truth; undo, dirty state, and saving stay native.
- The host remembers the text the webview holds and never posts that text back. The webview ignores a document equal to the text it last synced.
- Each webview edit carries the text it was based on. The host serializes edits and drops any whose base no longer matches the document, then sends the current text instead.
- Edits are applied as one minimal replacement range, so cursors and unrelated text are undisturbed.
- After an external change, canvases whose diagram changed are excluded from the webview's text until they have re-rendered the new source. Invalid or still-rendering diagrams keep their current text.
- Document change notifications are debounced so typing does not redraw on every keystroke.

## Consequences

- One follow-up edit can occur when conversion normalizes newly typed Mermaid (for example, adding layout comments); it converges because the result is stable.
- A canvas edit made while the document changes is discarded rather than merged.
