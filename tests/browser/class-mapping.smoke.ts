import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { openDocument } from '../../packages/mermaid_draw_core/src/diagramDocument.ts';
import { readMappedDiagram } from '../../packages/mermaid_draw_core/src/mappedDiagram.ts';

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
    await page.getByTestId('color-top-pick-#e03131').click({ timeout: 1500 });
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

test('each class note accepts repeated drags and style choices, downloads, reopens, and resets', { timeout: 30_000 }, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.setDefaultTimeout(2500);
    await page.goto(process.env.MERMAID_DRAW_TEST_URL ?? new URL('../../packages/mermaid_draw_web/dist/index.html', import.meta.url).href);
    const file = new URL('../diagrams/class/class-notes.md', import.meta.url);
    const originalBytes = readFileSync(file, 'utf8');
    const original = originalBytes.replace(/\r\n/g, '\n');
    const open = page.getByLabel('Open Markdown or Mermaid file');
    await open.setInputFiles(fileURLToPath(file));
    const canvas = page.getByRole('tabpanel').locator('.excalidraw');
    const download = page.getByRole('button', { name: 'Download', exact: true });
    await download.and(page.locator(':enabled')).waitFor();
    const bounds = await canvas.boundingBox();
    assert.ok(bounds);
    const originalDiagram = openDocument('notes.md', original).diagrams[0].source;
    const shapes = readMappedDiagram(originalDiagram)!.elements.filter((element) => element.type === 'rectangle');
    const midX = (Math.min(...shapes.map((shape) => shape.x)) + Math.max(...shapes.map((shape) => shape.x + shape.width!))) / 2;
    const midY = (Math.min(...shapes.map((shape) => shape.y)) + Math.max(...shapes.map((shape) => shape.y + shape.height!))) / 2;
    const notes = shapes.filter((shape) => shape.id?.startsWith('class-note:'));
    const source = page.getByRole('textbox', { name: 'Document source' });
    const readSource = async () => {
      await page.getByRole('tab', { name: 'SOURCE', exact: true }).click();
      const value = await source.inputValue();
      await page.getByRole('tab', { name: 'Diagram 1', exact: true }).click();
      return value;
    };
    const savedNotes = (value: string) => readMappedDiagram(openDocument('notes.md', value).diagrams[0].source)!
      .elements.filter((shape) => shape.type === 'rectangle' && shape.id?.startsWith('class-note:'));
    for (const index of notes.keys()) {
      const note = savedNotes(await readSource())[index];
      let x = bounds.x + bounds.width / 2 + note.x + note.width! / 2 - midX;
      let y = bounds.y + bounds.height / 2 + note.y + note.height! / 2 - midY;
      for (const [dx, dy] of [[80, 20], [35, -10]]) {
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x + dx, y + dy, { steps: 10 });
        await page.mouse.up();
        x += dx;
        y += dy;
      }
      await page.mouse.click(x, y);
      await page.getByTestId('color-top-pick-#ffc9c9').click({ timeout: 1500 });
      await page.getByTestId('color-top-pick-#e03131').click({ timeout: 1500 });
      await page.getByRole('group', { name: 'Stroke width', exact: true }).locator('[title="Extra bold"]').click();
      await page.getByRole('group', { name: 'Stroke style', exact: true }).locator('[title="Dotted"]').click();
      await page.getByRole('group', { name: 'Sloppiness', exact: true }).locator('[title="Cartoonist"]').click();
      await page.getByRole('group', { name: 'Fill', exact: true }).getByRole('button', { name: 'Cross-hatch', exact: true }).click();
      await page.getByRole('group', { name: 'Edges', exact: true }).locator('[title="Round"]').click();
      await page.getByRole('group', { name: 'Font family', exact: true }).getByRole('button', { name: 'Normal', exact: true }).click();
      await page.getByRole('group', { name: 'Font size', exact: true }).locator('[title="Large"]').click();
      await page.getByRole('group', { name: 'Text align', exact: true }).locator('[title="Left"]').click();
      await page.locator('[title="Align top"]').click();
      await page.getByRole('slider').focus();
      await page.getByRole('slider').press('ArrowLeft');
      const value = await readSource();
      const saved = savedNotes(value);
      assert.deepEqual([saved[index].x, saved[index].y], [note.x + 115, note.y + 10]);
      assert.deepEqual([saved[index].backgroundColor, saved[index].strokeColor, saved[index].strokeWidth,
        saved[index].strokeStyle, saved[index].roughness], ['#ffc9c9', '#e03131', 4, 'dotted', 2]);
      assert.deepEqual(saved[index].roundness, { type: 3 });
      assert.deepEqual([saved[index].fillStyle, saved[index].opacity, saved[index].label?.fontFamily,
        saved[index].label?.fontSize, saved[index].label?.textAlign, saved[index].label?.verticalAlign,
        saved[index].label?.opacity], ['cross-hatch', 90, 6, 28, 'left', 'top', 90]);
      if (index < notes.length - 1) assert.notEqual(saved[index + 1].backgroundColor, '#ffc9c9');
      await page.mouse.dblclick(x, y);
      const edit = canvas.locator('textarea:visible');
      await edit.waitFor({ timeout: 1500 });
      await edit.fill(`Edited note ${index + 1}`);
      await page.keyboard.press('Escape');
      await edit.waitFor({ state: 'hidden' });
    }
    const saved = await readSource();
    const pendingDownload = page.waitForEvent('download');
    await download.click();
    const exported = await pendingDownload;
    const exportedBytes = readFileSync((await exported.path())!, 'utf8');
    assert.equal(exportedBytes, originalBytes.includes('\r\n') ? saved.replace(/\n/g, '\r\n') : saved);
    await open.setInputFiles({ name: 'reopened.md', mimeType: 'text/markdown', buffer: Buffer.from(exportedBytes) });
    await download.and(page.locator(':enabled')).waitFor();
    assert.equal(await readSource(), saved, 'reopening must not rewrite formatting or Markdown');
    // A saved scene must actually paint the translucent fill, not just retain a comment.
    const painted = await canvas.locator('canvas.static').evaluate((surface: HTMLCanvasElement) => {
      const rgba = surface.getContext('2d')!.getImageData(0, 0, surface.width, surface.height).data;
      return rgba.some((red, i) => i % 4 === 0 && red === 255 && rgba[i + 1] >= 201 && rgba[i + 1] <= 207 &&
        rgba[i + 2] === rgba[i + 1] && rgba[i + 3] > 0);
    });
    assert.ok(painted, 'reopened notes should paint their saved pink fill');
    const reopenedShapes = readMappedDiagram(openDocument('notes.md', saved).diagrams[0].source)!
      .elements.filter((element) => element.type === 'rectangle');
    const centerX = (Math.min(...reopenedShapes.map((shape) => shape.x)) +
      Math.max(...reopenedShapes.map((shape) => shape.x + shape.width!))) / 2;
    const centerY = (Math.min(...reopenedShapes.map((shape) => shape.y)) +
      Math.max(...reopenedShapes.map((shape) => shape.y + shape.height!))) / 2;
    const first = savedNotes(saved)[0];
    const firstX = bounds.x + bounds.width / 2 + first.x + first.width! / 2 - centerX;
    const firstY = bounds.y + bounds.height / 2 + first.y + first.height! / 2 - centerY;
    await page.mouse.click(firstX, firstY);
    assert.equal(await page.getByRole('slider').inputValue(), '90');
    for (const [name, choice] of [['Stroke width', 'Extra bold'], ['Stroke style', 'Dotted'],
      ['Edges', 'Round'], ['Font size', 'Large']]) {
      assert.equal(await page.getByRole('group', { name, exact: true }).locator('input:checked').locator('..').getAttribute('title'), choice);
    }
    await page.mouse.dblclick(firstX, firstY);
    const edit = canvas.locator('textarea:visible');
    await edit.waitFor();
    assert.equal(await edit.inputValue(), 'Edited note 1');
    assert.deepEqual(await edit.evaluate((element) => {
      const style = getComputedStyle(element);
      return [style.fontSize, style.textAlign];
    }), ['28px', 'left']);
    await page.keyboard.press('Escape');
    await edit.waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: 'Reset styles' }).click();
    const reset = await readSource();
    assert.doesNotMatch(reset, /%% class-note /);
    assert.equal(reset, original.replace('note "Overview"', 'note "Edited note 1"')
      .replace('note for Book "First<br>Second"', 'note for Book "Edited note 2"')
      .replace('note for Book "First<br>Second"', 'note for Book "Edited note 3"'));
  } finally {
    await browser.close();
  }
});
