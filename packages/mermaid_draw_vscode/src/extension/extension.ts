import * as vscode from 'vscode';
import { MermaidDrawEditorProvider } from './MermaidDrawEditorProvider.ts';

const { viewType } = MermaidDrawEditorProvider;

function activeTabUri(): vscode.Uri | undefined {
  const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
  return input instanceof vscode.TabInputText || input instanceof vscode.TabInputCustom ? input.uri : undefined;
}

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(viewType, new MermaidDrawEditorProvider(context.extensionUri), {
      // Excalidraw scenes are expensive to rebuild when a tab is hidden.
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: true,
    }),
    vscode.commands.registerCommand('mermaidDraw.openEditor', async (uri?: vscode.Uri) => {
      const target = uri ?? activeTabUri();
      if (!target) return void vscode.window.showInformationMessage('Open a Markdown or Mermaid file first.');
      // From a text editor, keep the text visible beside the canvas.
      const fromText = vscode.window.activeTextEditor?.document.uri.toString() === target.toString();
      await vscode.commands.executeCommand('vscode.openWith', target, viewType,
        fromText ? vscode.ViewColumn.Beside : vscode.ViewColumn.Active);
    }),
    vscode.commands.registerCommand('mermaidDraw.openSource', async (uri?: vscode.Uri) => {
      const target = uri ?? activeTabUri();
      if (target) await vscode.window.showTextDocument(target, { viewColumn: vscode.ViewColumn.Beside });
    }),
  );
}

export function deactivate(): void {}
