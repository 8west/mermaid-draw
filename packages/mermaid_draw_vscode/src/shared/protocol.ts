/**
 * Messages between the extension host and the MermaidDraw webview.
 *
 * The VS Code text document is authoritative. The host sends its full text whenever it changes outside the
 * canvas; the webview sends full replacement text with the `base` text it edited, so the host can reject edits
 * made against an older document instead of overwriting newer text.
 */
export type HostMessage = { type: 'document'; name: string; text: string };

export type WebviewMessage = { type: 'ready' } | { type: 'edit'; base: string; text: string };
