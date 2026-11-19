import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from 'playwright';
import { webviewHtml } from '../../packages/mermaid_draw_vscode/src/extension/webviewHtml.ts';

const root = fileURLToPath(new URL('../../packages/mermaid_draw_vscode/dist/webview/', import.meta.url));
const markdown = await readFile(new URL('../diagrams/flow_chart/three-flowcharts.md', import.meta.url), 'utf8');
const standalone = await readFile(new URL('../diagrams/flow_chart/flow_chart1.mermaid', import.meta.url), 'utf8');
const types: Record<string, string> = { '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };
type Message = { type: string; base?: string; text?: string };

test('the VS Code webview syncs canvas and document edits without echoes', { timeout: 90_000 }, async () => {
  const server = createServer(async (request, response) => {
    const { pathname } = new URL(request.url ?? '/', 'http://localhost');
    const origin = `http://${request.headers.host}`;
    if (pathname === '/') {
      response.writeHead(200, { 'content-type': 'text/html' });
      return response.end(webviewHtml({ assetRoot: `${origin}/`, cspSource: origin, nonce: 'test-nonce' }));
    }
    const file = resolve(root, `.${decodeURIComponent(pathname)}`);
    try {
      if (!file.startsWith(root.replace(/[\\/]$/, '') + sep)) throw new Error('outside root');
      const body = await readFile(file);
      response.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const origin = `http://127.0.0.1:${address.port}`;
  const browser = await chromium.launch();
  const errors: string[] = [];
  const foreignRequests: string[] = [];

  async function open(name: string, text: string) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.setDefaultTimeout(10_000);
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      // Chromium reports Excalidraw's own `unload` listener; it does not affect the webview.
      if (message.type() === 'error' && !message.text().startsWith('Permissions policy violation: unload')) errors.push(message.text());
    });
    page.on('request', (request) => {
      if (!request.url().startsWith(origin) && !/^(data|blob):/.test(request.url())) foreignRequests.push(request.url());
    });
    await page.addInitScript(() => {
      const sent: unknown[] = [];
      Object.assign(window, { sent, acquireVsCodeApi: () => ({ postMessage: (message: unknown) => sent.push(message) }) });
    });
    await page.goto(origin);
    await page.waitForFunction(() => (window as unknown as { sent: Message[] }).sent.some(({ type }) => type === 'ready'));
    await send(page, name, text);
    return page;
  }

  const send = (page: Page, name: string, text: string) => page.evaluate(([name, text]) =>
    window.postMessage({ type: 'document', name, text }, '*'), [name, text]);
  const edits = (page: Page) => page.evaluate(() =>
    (window as unknown as { sent: Message[] }).sent.filter(({ type }) => type === 'edit'));
  async function nextEdit(page: Page, count: number) {
    await page.waitForFunction((count) =>
      (window as unknown as { sent: Message[] }).sent.filter(({ type }) => type === 'edit').length >= count, count);
    const all = await edits(page);
    assert.equal(all.length, count, 'one canvas edit sends one document edit');
    return all[count - 1];
  }
  const canvas = (page: Page) => page.locator('.diagram-panel:not([inert]) .excalidraw');
  async function deleteCenteredArrow(page: Page) {
    await canvas(page).waitFor();
    // Wait for the scene to settle so the click lands on the arrow.
    await page.waitForFunction(() => /Source applied/.test(document.querySelector('[role="status"]')?.textContent ?? ''));
    const box = await canvas(page).boundingBox();
    assert.ok(box);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.keyboard.press('Delete');
  }

  try {
    const page = await open('three-flowcharts.md', markdown);
    const eol = markdown.includes('\r\n') ? '\r\n' : '\n';
    assert.deepEqual(await page.getByRole('tab').allTextContents(), ['Receive the order', 'Prepare the package', 'Ship the package']);
    await canvas(page).waitFor();
    await page.evaluate(() => document.fonts.ready);
    assert.ok(await page.evaluate(() => [...document.fonts].some(
      (font) => font.family === 'Excalifont' && font.status === 'loaded')), 'the canvas font loads from the extension');

    await deleteCenteredArrow(page);
    const first = await nextEdit(page, 1);
    assert.equal(first.base, markdown);
    assert.equal(first.text, markdown.replace('Start[Order received] --> Done[Order confirmed]',
      `Start[Order received]${eol}    Done[Order confirmed]`));

    // A text edit to another diagram re-renders that canvas in place and is not echoed back.
    const typed = first.text?.replace('Start[Carrier pickup]', 'Start[Carrier collects]') ?? '';
    await send(page, 'three-flowcharts.md', typed);
    await page.waitForTimeout(1_000);
    assert.equal((await edits(page)).length, 1, 'document updates must not echo back as edits');
    await page.getByRole('tab', { name: 'Ship the package' }).click();
    await deleteCenteredArrow(page);
    const second = await nextEdit(page, 2);
    assert.equal(second.base, typed);
    assert.equal(second.text, typed.replace('Start[Carrier collects] --> Done[Notify customer]',
      `Start[Carrier collects]${eol}    Done[Notify customer]`));

    // Invalid text shows an error without writing; fixing the text restores the canvas.
    await send(page, 'three-flowcharts.md', second.text?.replace('Start[Pick items] -->', 'Start[Pick items] --> -->') ?? '');
    await page.getByRole('tab', { name: 'Prepare the package' }).click();
    await page.locator('.diagram-panel:not([inert])').getByRole('alert').waitFor();
    await send(page, 'three-flowcharts.md', second.text ?? '');
    await canvas(page).waitFor();
    await page.waitForTimeout(1_000);
    assert.equal((await edits(page)).length, 2, 'invalid or restored text must not be written back');

    const single = await open('flow_chart1.mermaid', standalone);
    await canvas(single).waitFor();
    assert.equal(await single.getByRole('tab').count(), 0, 'a standalone diagram has no tabs');
    await single.evaluate(() => document.body.classList.add('vscode-dark'));
    await single.locator('.excalidraw.theme--dark').waitFor();
    await deleteCenteredArrow(single);
    const edit = await nextEdit(single, 1);
    assert.equal(edit.base, standalone);
    assert.doesNotMatch(edit.text ?? '', /-->/);

    const formatted = 'flowchart LR\nA[Root]\n%% layout A {"x":10,"y":20}\n';
    const resetPage = await open('reset.mermaid', formatted);
    await canvas(resetPage).waitFor();
    await resetPage.waitForFunction(() => /Source applied/.test(document.querySelector('[role="status"]')?.textContent ?? ''));
    await resetPage.getByRole('button', { name: 'Diagnostics' }).click();
    await resetPage.getByRole('heading', { name: 'Diagnostics' }).waitFor();
    const box = await canvas(resetPage).boundingBox();
    assert.ok(box);
    await resetPage.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await resetPage.getByTestId('color-top-pick-#ffc9c9').click();
    const styled = await nextEdit(resetPage, 1);
    assert.equal(styled.base, formatted);
    assert.match(styled.text ?? '', /style A .*fill:#ffc9c9/);

    await resetPage.getByRole('button', { name: 'Reset styles' }).click();
    const reset = await nextEdit(resetPage, 2);
    assert.equal(reset.base, styled.text);
    assert.equal(reset.text, 'flowchart LR\nA[Root]\n');

    assert.deepEqual(foreignRequests, [], 'the webview must not load remote resources');
    assert.deepEqual(errors, [], 'the webview must run without browser errors');
  } finally {
    await browser.close();
    server.close();
  }
});
