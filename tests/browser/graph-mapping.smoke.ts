import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { chromium } from 'playwright';

test('state and entity relationship fixtures open and accept new diagram nodes', { timeout: 20_000 }, async () => {
  const browser = await chromium.launch();
  try {
    for (const [fixture, header, added] of [
      ['state', 'stateDiagram-v2', 'State1'],
      ['entity_relationship', 'erDiagram', 'Entity1'],
    ]) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await page.goto(process.env.MERMAID_DRAW_TEST_URL ?? new URL('../../packages/mermaid_draw_web/dist/index.html', import.meta.url).href);
      const open = page.getByLabel('Open Markdown or Mermaid file');
      await open.setInputFiles(fileURLToPath(new URL(`../diagrams/${fixture}/${fixture}-mapping.md`, import.meta.url)));
      const canvas = page.getByRole('tabpanel').locator('.excalidraw');
      await canvas.waitFor();
      await page.locator('button:not(:disabled)').and(page.getByRole('button', { name: 'Download', exact: true })).waitFor();
      await page.getByRole('radio', { name: 'Rectangle', exact: true }).locator('..').click();
      await page.mouse.move(1025, 720);
      await page.mouse.down();
      await page.mouse.move(1135, 773, { steps: 10 });
      await page.mouse.up();
      const reset = page.getByRole('button', { name: 'Reset styles' });
      await page.locator('button:not(:disabled)').and(reset).waitFor({ timeout: 3000 });
      await page.getByRole('tab', { name: 'SOURCE', exact: true }).click();
      const saved = await page.getByRole('textbox', { name: 'Document source' }).inputValue();
      assert.match(saved, new RegExp(`^${header}$`, 'm'));
      assert.match(saved, new RegExp(`^\\s*${added}$`, 'm'));
      assert.match(saved, /%% graph-layout/);
      await open.setInputFiles({ name: 'reopened.md', mimeType: 'text/markdown', buffer: Buffer.from(saved) });
      await canvas.waitFor();
      await page.locator('button:not(:disabled)').and(reset).waitFor({ timeout: 3000 });
      await page.close();
    }
  } finally {
    await browser.close();
  }
});
