# MermaidDraw

A developer focused tool for managing Mermaid diagram drawing using Excalidraw for UI.

Positioning and styling done in the UI should be stored within mermaid's supported syntax, and as comments where it is not directly supported.

Changes to the diagrams should be reflected in the corresponding Markdown files and domain docs, ensuring consistency between the UI and the underlying Mermaid syntax.

Phase 1: Implemented as a website where a md or mermaid file can be loaded, edited using the Excalidraw UI, and saved back with the appropriate Mermaid syntax and comments.

Phase 2: Implementing this as a vscode extension that can be activated from within the editor to provide the same UI and functionality as the website, but without having to upload and download files manually.

## Repository Overview

Details of the sub-projects are in [`docs/MonoRepo.md`](docs/MonoRepo.md)

## Tech Stack

Tech used is documented in [`docs/TechStack.md`](docs/TechStack.md)

## Coding Standards

Coding standards are documented in [`docs/CodingStandards.md`](docs/CodingStandards.md)

## Ubiquitous Language

Terminology is maintained in [`docs/Glossary.md`](docs/Glossary.md)

## Agent Persona

* In all interactions and commit messages, be extremely concise and sacrifice grammar for the sake of concision.
* Ask one brief question at a time. State what decision is needed concisely without long explanations.
* Prioritize clarity and brevity over politeness or formality.

## Agent skills

### Issue tracker

Issues and specs live as Markdown files in `.scratch/`. See `docs/agents/issue-tracker.md`.

### Triage labels

For triage roles and their tracker labels, see `docs/agents/triage-labels.md`.

### Domain docs

Single-context domain docs use `docs/Glossary.md` and `docs/adr/`. See `docs/agents/domain.md`.