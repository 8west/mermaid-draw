import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import type { HostMessage, WebviewMessage } from '../shared/protocol.ts';
import { diffText } from './textEdit.ts';
import { webviewHtml } from './webviewHtml.ts';

/** Text changes are batched briefly so typing does not re-render the canvas on every keystroke. */
const TEXT_SYNC_DELAY_MS = 150;

/**
 * Opens Markdown and Mermaid documents on an Excalidraw canvas. The text document stays the source of truth:
 * canvas edits are applied to it as minimal text edits, and outside changes are pushed back to the canvas.
 */
export class MermaidDrawEditorProvider implements vscode.CustomTextEditorProvider {
  static readonly viewType = 'mermaidDraw.editor';

  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveCustomTextEditor(document: vscode.TextDocument, panel: vscode.WebviewPanel): void {
    const root = vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview');
    panel.webview.options = { enableScripts: true, localResourceRoots: [root] };
    panel.webview.html = webviewHtml({
      assetRoot: `${panel.webview.asWebviewUri(root).toString()}/`,
      cspSource: panel.webview.cspSource,
      nonce: randomBytes(16).toString('base64'),
    });
    const name = document.uri.path.split('/').pop() ?? 'diagram.mermaid';
    // The text the webview holds, so its own edits are not echoed back.
    let shown: string | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let edits = Promise.resolve();

    const post = () => {
      clearTimeout(timer);
      timer = undefined;
      const text = document.getText();
      if (text === shown) return;
      shown = text;
      const message: HostMessage = { type: 'document', name, text };
      void panel.webview.postMessage(message);
    };

    const applyEdit = async ({ base, text }: { base: string; text: string }) => {
      const before = document.getText();
      // The document changed after the canvas last saw it; drop the edit and send the newer text.
      if (before !== base) return post();
      const change = diffText(before, text);
      shown = text;
      if (!change) return;
      const edit = new vscode.WorkspaceEdit();
      edit.replace(document.uri, new vscode.Range(document.positionAt(change.start), document.positionAt(change.end)), change.text);
      if (!await vscode.workspace.applyEdit(edit)) post();
    };

    const subscriptions = [
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document !== document || !event.contentChanges.length || shown === undefined) return;
        clearTimeout(timer);
        timer = setTimeout(post, TEXT_SYNC_DELAY_MS);
      }),
      panel.webview.onDidReceiveMessage((message: WebviewMessage) => {
        if (message.type === 'ready') {
          shown = undefined;
          post();
        } else if (message.type === 'edit') {
          // Apply in order so each edit's base check sees the previous edit.
          edits = edits.then(() => applyEdit(message)).catch((failure: unknown) => {
            void vscode.window.showErrorMessage(`MermaidDraw could not update ${name}: ${String(failure)}`);
            post();
          });
        }
      }),
    ];
    panel.onDidDispose(() => {
      clearTimeout(timer);
      for (const subscription of subscriptions) subscription.dispose();
    });
  }
}
