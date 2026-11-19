import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const dist = new URL('../../packages/mermaid_draw_web/dist/', import.meta.url);
const entry = new URL('index.html', dist);
const standalone = new URL('../diagrams/flow_chart/flow_chart1.mermaid', import.meta.url);
const subgraph = new URL('../diagrams/flow_chart/subgraph.mermaid', import.meta.url);
const markdown = new URL('../diagrams/flow_chart/three-flowcharts.md', import.meta.url);

test('the standalone build edits and downloads local files offline', { timeout: 45_000 }, async () => {
  assert.deepEqual(await readdir(dist), ['index.html']);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ offline: true, viewport: { width: 1280, height: 900 } });
    page.setDefaultTimeout(7_500);
    const networkRequests: string[] = [];
    const errors: string[] = [];
    page.on('request', (request) => {
      if (request.url() !== entry.href) networkRequests.push(request.url());
    });
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });

    await page.goto(entry.href);
    const tab = (name: string) => page.getByRole('tab', { name, exact: true });
    const button = (name: string) => page.getByRole('button', { name, exact: true });
    const panel = page.getByRole('tabpanel');
    const canvas = () => panel.locator('.excalidraw');
    const source = page.getByRole('textbox', { name: 'Document source' });
    const upload = page.getByLabel('Open Markdown or Mermaid file');

    async function download(name: string) {
      const [file] = await Promise.all([page.waitForEvent('download'), button('Download').click()]);
      assert.equal(file.suggestedFilename(), name);
      return readFile(await file.path(), 'utf8');
    }

    async function deleteCenteredArrow() {
      await canvas().waitFor();
      const box = await canvas().boundingBox();
      assert.ok(box);
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.keyboard.press('Delete');
    }

    await canvas().waitFor();
    assert.match(await page.locator('link[rel="icon"]').getAttribute('href') ?? '', /^data:image\/svg\+xml/);
    await page.evaluate(() => document.fonts.ready);
    assert.ok(await page.evaluate(() => [...document.fonts].some(
      (font) => font.family === 'Excalifont' && font.status === 'loaded',
    )), 'the canvas font is available offline');

    await upload.setInputFiles(fileURLToPath(standalone));
    await page.getByRole('heading', { name: 'flow_chart1.mermaid', exact: true }).waitFor();
    assert.equal(await download('flow_chart1.mermaid'), await readFile(standalone, 'utf8'));
    await deleteCenteredArrow();
    await tab('SOURCE').click();
    assert.doesNotMatch(await source.inputValue(), /-->/);

    await upload.setInputFiles(fileURLToPath(subgraph));
    await page.getByRole('heading', { name: 'subgraph.mermaid', exact: true }).waitFor();
    await page.waitForFunction(() =>
      !!document.querySelector('.diagram-panel .excalidraw') || !!document.querySelector('.diagram-error'));
    assert.deepEqual(await page.locator('.diagram-error').allTextContents(), [], 'Subgraph should render without errors.');
    assert.equal(await download('subgraph.mermaid'), await readFile(subgraph, 'utf8'));
    await page.mouse.click(640, 506);
    await page.getByTestId('color-top-pick-#ffc9c9').click();
    await tab('SOURCE').click();
    const styledSource = await source.inputValue();
    assert.match(styledSource, /style D .*fill:#ffc9c9/,
      'subgraph title fill should be saved as a subgraph style');
    assert.equal((await download('subgraph.mermaid')).replace(/\r\n/g, '\n'), styledSource);
    await tab('Diagram 1').click();
    await page.mouse.click(640, 506);
    await page.getByTestId('opacity').focus();
    await page.keyboard.press('ArrowLeft');
    await tab('SOURCE').click();
    const opacitySource = await source.inputValue();
    assert.match(opacitySource, /layout D .*"appearance":\{"opacity":90\}/,
      'subgraph title opacity should be saved in layout metadata');
    assert.equal((await download('subgraph.mermaid')).replace(/\r\n/g, '\n'), opacitySource);
    await tab('Diagram 1').click();
    const resetStyles = button('Reset styles');
    await resetStyles.click();
    await tab('SOURCE').click();
    const resetSource = await source.inputValue();
    assert.doesNotMatch(resetSource, /%% (?:layout|arrow|excalidraw)\b/,
      'reset should remove editor formatting comments');
    assert.doesNotMatch(resetSource, /style D\b/,
      'reset should restore generic styling when the original source had no style directive');

    const implicitSubgraph = 'flowchart LR\nsubgraph Group title\nA[One]\nB[Two]\nend\nA --> B\n';
    await upload.setInputFiles({
      name: 'implicit-subgraph.mermaid', mimeType: 'text/plain', buffer: Buffer.from(implicitSubgraph),
    });
    await page.getByRole('heading', { name: 'implicit-subgraph.mermaid', exact: true }).waitFor();
    await page.waitForFunction(() =>
      !!document.querySelector('.diagram-panel .excalidraw') || !!document.querySelector('.diagram-error'));
    assert.deepEqual(await page.locator('.diagram-error').allTextContents(), [], 'Implicit subgraph should render without errors.');
    assert.equal(await download('implicit-subgraph.mermaid'), implicitSubgraph);

    await upload.setInputFiles(fileURLToPath(markdown));
    await tab('Receive the order').waitFor();
    await button('Download').click({ trial: true });
    await deleteCenteredArrow();
    await tab('Ship the package').click();
    await deleteCenteredArrow();

    const original = await readFile(markdown, 'utf8');
    const eol = original.includes('\r\n') ? '\r\n' : '\n';
    const expected = original
      .replace('Start[Order received] --> Done[Order confirmed]', `Start[Order received]${eol}    Done[Order confirmed]`)
      .replace('Start[Carrier pickup] --> Done[Notify customer]', `Start[Carrier pickup]${eol}    Done[Notify customer]`);
    assert.equal(await download('three-flowcharts.md'), expected);

    await tab('SOURCE').click();
    await source.fill((await source.inputValue()).replace('Start[Order received]', 'Start[Order received] -->'));
    await button('Apply').click();
    await tab('Receive the order').click();
    await panel.getByRole('alert').waitFor();
    assert.equal(await canvas().isVisible(), false);
    assert.equal(await button('Download').isDisabled(), true);
    await tab('SOURCE').click();
    await button('Restore last valid source').click();
    await tab('Receive the order').click();
    await canvas().waitFor();
    assert.equal(await download('three-flowcharts.md'), expected);
    assert.deepEqual(networkRequests, [], 'the standalone page must not request additional resources');
    assert.deepEqual(errors, [], 'the page must run without browser errors');
  } finally {
    await browser.close();
  }
});
