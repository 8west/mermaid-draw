import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { chromium } from 'playwright';

test('sequence labels open on double-click and edits and reordering reach Mermaid', { timeout: 20_000 }, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(process.env.MERMAID_DRAW_TEST_URL ?? new URL('../../packages/mermaid_draw_web/dist/index.html', import.meta.url).href);
    await page.getByLabel('Open Markdown or Mermaid file').setInputFiles(fileURLToPath(
      new URL('../diagrams/sequence/sequence-mapping.md', import.meta.url),
    ));
    const canvas = page.getByRole('tabpanel').locator('.excalidraw');
    await canvas.waitFor();
    await page.locator('button:not(:disabled)').and(page.getByRole('button', { name: 'Download', exact: true })).waitFor();
    const edit = canvas.locator('textarea:visible');
    for (const [x, y, before, after] of [
      [530, 365, 'Customer', 'Buyer'], [640, 441, 'Place order', 'Submit order'], [640, 531, 'Checkout', 'Payment'],
    ] as const) {
      await page.mouse.dblclick(x, y);
      await edit.waitFor({ timeout: 2000 });
      assert.equal(await edit.inputValue(), before);
      await edit.fill(after);
      await page.keyboard.press('Escape');
      await edit.waitFor({ state: 'hidden' });
    }
    await page.mouse.move(640, 581);
    await page.mouse.down();
    await page.mouse.move(640, 396, { steps: 10 });
    await page.mouse.up();
    await page.getByRole('tab', { name: 'SOURCE', exact: true }).click();
    assert.match((await page.getByRole('textbox', { name: 'Document source' }).inputValue()).replace(/^\s*%% sequence-layout.*$/gm, ''),
      /actor C as Buyer\s+participant S as Shop\s+S-->>C: Order confirmed\s+C->>S: Submit order\s+Note over C,S: Payment/);
  } finally {
    await browser.close();
  }
});

test('sequence position and color survive reopening and can be reset', { timeout: 20_000 }, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(process.env.MERMAID_DRAW_TEST_URL ?? new URL('../../packages/mermaid_draw_web/dist/index.html', import.meta.url).href);
    const open = page.getByLabel('Open Markdown or Mermaid file');
    await open.setInputFiles(fileURLToPath(new URL('../diagrams/sequence/sequence-mapping.md', import.meta.url)));
    const canvas = page.getByRole('tabpanel').locator('.excalidraw');
    await canvas.waitFor();
    await page.locator('button:not(:disabled)').and(page.getByRole('button', { name: 'Download', exact: true })).waitFor();
    const edit = canvas.locator('textarea:visible');
    await page.mouse.dblclick(530, 365);
    await edit.waitFor({ timeout: 2500 });
    assert.equal(await edit.inputValue(), 'Customer');
    await page.keyboard.press('Escape');
    await edit.waitFor({ state: 'hidden' });
    await page.mouse.click(465, 305);
    await page.mouse.move(530, 365);
    await page.mouse.down();
    await page.mouse.move(565, 390, { steps: 10 });
    await page.mouse.up();
    const reset = page.getByRole('button', { name: 'Reset styles' });
    await page.locator('button:not(:disabled)').and(reset).waitFor({ timeout: 2500 });
    const source = page.getByRole('textbox', { name: 'Document source' });
    await page.getByRole('tab', { name: 'SOURCE', exact: true }).click();
    assert.match(await source.inputValue(), /%% sequence-layout participant C 67 25/);
    await page.getByRole('tab', { name: 'Diagram 1', exact: true }).click();
    await page.mouse.click(565, 390);
    await page.getByTestId('color-top-pick-#ffc9c9').click({ timeout: 2000 });
    await page.getByRole('tab', { name: 'SOURCE', exact: true }).click();
    const saved = await source.inputValue();
    assert.match(saved, /%% sequence-style participant C fill:#ffc9c9/);
    await open.setInputFiles({ name: 'saved.md', mimeType: 'text/markdown', buffer: Buffer.from(saved) });
    await page.getByRole('tab', { name: 'Diagram 1', exact: true }).click();
    await page.locator('button:not(:disabled)').and(reset).waitFor({ timeout: 2500 });
    const fillRendered = await canvas.locator('canvas.static').evaluate((surface: HTMLCanvasElement) => {
      const bounds = surface.getBoundingClientRect();
      const x = Math.round((520 - bounds.left) * surface.width / bounds.width);
      const y = Math.round((380 - bounds.top) * surface.height / bounds.height);
      const rgba = surface.getContext('2d')!.getImageData(x, y, 20, 20).data;
      return rgba.some((red, i) => i % 4 === 0 && red === 255 &&
        rgba[i + 1] === 201 && rgba[i + 2] === 201 && rgba[i + 3] === 255);
    });
    assert.ok(fillRendered, 'the reopened participant should render the saved fill');
    await page.mouse.dblclick(565, 390);
    await edit.waitFor({ timeout: 2000 });
    assert.equal(await edit.inputValue(), 'Customer');
    await page.keyboard.press('Escape');
    await reset.click({ timeout: 2000 });
    await page.getByRole('tab', { name: 'SOURCE', exact: true }).click();
    assert.doesNotMatch(await source.inputValue(), /%% sequence-(?:layout|style)/);
    assert.match(await source.inputValue(), /actor C as Customer/);
  } finally {
    await browser.close();
  }
});
