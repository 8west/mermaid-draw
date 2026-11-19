import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { chromium } from 'playwright';

test('class connectors follow a drag, colors persist, and Reset styles clears formatting', { timeout: 20_000 }, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(process.env.MERMAID_DRAW_TEST_URL ?? new URL('../../packages/mermaid_draw_web/dist/index.html', import.meta.url).href);
    await page.getByLabel('Open Markdown or Mermaid file').setInputFiles(fileURLToPath(
      new URL('../diagrams/class/class-mapping.md', import.meta.url),
    ));
    const canvas = page.getByRole('tabpanel').locator('.excalidraw');
    await canvas.waitFor();
    const view = await canvas.boundingBox();
    assert.ok(view);
    const x = view.x + view.width / 2 - 160;
    const y = view.y + view.height / 2 - 26;
    const corridor = { x: 620, y: 498, width: 55, height: 8 };
    const before = await page.screenshot({ clip: corridor });
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 45, y + 80, { steps: 10 });
    // Sample the original connector corridor while the pointer is still held.
    const during = await page.screenshot({ clip: corridor });
    await page.mouse.up();
    const dropped = await page.screenshot({ clip: corridor });
    // Drag the same class again, then move the other endpoint without remounting.
    for (const [fromX, fromY, dx, dy] of [[x + 45, y + 80, 20, 35], [x + 275, y, 35, -40]]) {
      await page.mouse.move(fromX, fromY);
      await page.mouse.down();
      await page.mouse.move(fromX + dx, fromY + dy, { steps: 10 });
      await page.mouse.up();
    }
    const reset = page.getByRole('button', { name: 'Reset styles' });
    const source = page.getByRole('textbox', { name: 'Document source' });
    await page.getByRole('tab', { name: 'SOURCE', exact: true }).click();
    assert.match(await source.inputValue(), /%% class-layout Order 65 115/);
    assert.match(await source.inputValue(), /%% class-layout Item 339 -40/);
    assert.ok(!during.equals(before), 'connector should leave its original route while dragging');
    assert.ok(during.equals(dropped), 'release should not be needed to clear the original connector route');
    await page.getByRole('tab', { name: 'Diagram 1', exact: true }).click();
    await page.mouse.click(x + 65, y + 115);
    await page.getByTestId('color-top-pick-#ffc9c9').click();
    await page.mouse.click(x + 65, y + 115);
    await page.getByTestId('color-top-pick-#e03131').click();
    await page.getByRole('tab', { name: 'SOURCE', exact: true }).click();
    assert.match(await source.inputValue(), /style Order fill:#ffc9c9,stroke:#e03131,color:#e03131/);
    await page.getByRole('tab', { name: 'Diagram 1', exact: true }).click();
    await reset.click({ timeout: 2000 });
    await page.getByRole('tab', { name: 'SOURCE', exact: true }).click();
    assert.doesNotMatch(await source.inputValue(), /%% class-layout/);
    assert.doesNotMatch(await source.inputValue(), /style Order/);
    assert.match(await source.inputValue(), /Order "1" \*-- "1\.\.\*" Item : contains/);
  } finally {
    await browser.close();
  }
});
