import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { openDocument } from '../../packages/mermaid_draw_core/src/diagramDocument.ts';
import { readMappedDiagram } from '../../packages/mermaid_draw_core/src/mappedDiagram.ts';
import { exampleNamed, examplePath } from '../diagrams/examples.ts';

test('state and entity relationship examples open and accept new diagram nodes', { timeout: 20_000 }, async () => {
  const browser = await chromium.launch();
  try {
    for (const [type, feature, header, added] of [
      ['state', 'Concurrent regions', 'stateDiagram-v2', 'State1'],
      ['entity-relationship', 'Attributes and subgraphs', 'erDiagram', 'Entity1'],
    ]) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await page.goto(process.env.MERMAID_DRAW_TEST_URL ?? new URL('../../packages/mermaid_draw_web/dist/index.html', import.meta.url).href);
      const open = page.getByLabel('Open Markdown or Mermaid file');
      await open.setInputFiles(examplePath(type));
      const featureTab = page.getByRole('tab', { name: feature, exact: true });
      await featureTab.click();
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
      const { source } = exampleNamed(openDocument(`${type}.md`, saved), feature);
      assert.match(source, new RegExp(`^${header}$`, 'm'));
      assert.match(source, new RegExp(`^\\s*${added}$`, 'm'));
      assert.match(source, /%% graph-layout/);
      await open.setInputFiles({ name: 'reopened.md', mimeType: 'text/markdown', buffer: Buffer.from(saved) });
      await page.getByRole('heading', { name: 'reopened.md', exact: true }).waitFor();
      await featureTab.click();
      await canvas.waitFor();
      await page.locator('button:not(:disabled)').and(reset).waitFor({ timeout: 3000 });
      await page.close();
    }
  } finally {
    await browser.close();
  }
});

test('requirement field edits and repeated moves survive download, reopen and reset', { timeout: 25_000 }, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.setDefaultTimeout(3000);
    await page.goto(process.env.MERMAID_DRAW_TEST_URL ?? new URL('../../packages/mermaid_draw_web/dist/index.html', import.meta.url).href);
    const file = examplePath('requirement');
    const original = readFileSync(file, 'utf8');
    const feature = 'Fields and reverse links';
    const featureTab = page.getByRole('tab', { name: feature, exact: true });
    const open = page.getByLabel('Open Markdown or Mermaid file');
    await open.setInputFiles(file);
    await featureTab.click();
    const download = page.getByRole('button', { name: 'Download', exact: true }).and(page.locator(':enabled'));
    await download.waitFor();
    const canvas = page.getByRole('tabpanel').locator('.excalidraw');
    const bounds = await canvas.boundingBox();
    assert.ok(bounds);
    const elements = readMappedDiagram(exampleNamed(openDocument(file, original), feature).source)!.elements;
    const boxes = elements.filter((element) => element.type === 'rectangle');
    const x = bounds.x + bounds.width / 2 - Math.max(...boxes.map((e) => e.x + e.width!)) / 2;
    const y = bounds.y + bounds.height / 2 - Math.max(...boxes.map((e) => e.y + e.height!)) / 2;
    const risk = elements.find((e) => e.type === 'text' && e.text === 'risk: medium')!;
    // The first double-click enters the grouped box; the second edits its field.
    await page.mouse.dblclick(x + risk.x + 30, y + risk.y + 10);
    await page.mouse.dblclick(x + risk.x + 30, y + risk.y + 10);
    const edit = canvas.locator('textarea:visible');
    await edit.fill('risk: high');
    await page.keyboard.press('Escape');
    await edit.waitFor({ state: 'hidden' });
    const [link] = elements.filter((e) => e.type === 'arrow');
    const [dx, dy] = link.points!.at(-1)!;
    await page.mouse.dblclick(x + link.x + dx / 2, y + link.y + dy / 2);
    await edit.fill('satisfies');
    await page.keyboard.press('Escape');
    await edit.waitFor({ state: 'hidden' });
    const retry = boxes.find((e) => e.id === 'requirement:Retry')!;
    let handleX = x + retry.x + retry.width! / 2;
    let handleY = y + retry.y;
    for (const [dx, dy] of [[20, 40], [25, 30]]) {
      await page.mouse.move(handleX, handleY);
      await page.mouse.down();
      handleX += dx;
      handleY += dy;
      await page.mouse.move(handleX, handleY, { steps: 10 });
      await page.mouse.up();
    }
    const pending = page.waitForEvent('download');
    await download.click();
    const saved = readFileSync((await (await pending).path())!, 'utf8');
    const { source } = exampleNamed(openDocument(file, saved), feature);
    assert.match(source, /%% graph-layout requirement:Retry 45 70/);
    assert.match(source, /risk: high/);
    assert.match(source, /Retry <- satisfies - "Checkout suite"/);
    await open.setInputFiles({ name: 'reopened.md', mimeType: 'text/markdown', buffer: Buffer.from(saved) });
    await page.getByRole('heading', { name: 'reopened.md', exact: true }).waitFor();
    await featureTab.click();
    await page.getByRole('button', { name: 'Reset styles' }).click();
    await page.getByRole('tab', { name: 'SOURCE', exact: true }).click();
    assert.equal(await page.getByRole('textbox', { name: 'Document source' }).inputValue(),
      original.replace(/\r\n/g, '\n').replace('risk: medium', 'risk: high').replace('<- verifies -', '<- satisfies -'));
  } finally {
    await browser.close();
  }
});

test('dragging a requirement connector midpoint keeps the bend and enables download', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.setDefaultTimeout(3000);
    await page.goto(process.env.MERMAID_DRAW_TEST_URL ?? new URL('../../packages/mermaid_draw_web/dist/index.html', import.meta.url).href);
    const file = examplePath('requirement');
    const document = openDocument(file, readFileSync(file, 'utf8'));
    const original = exampleNamed(document, 'Checkout relationships').source +
      '%% graph-layout requirement:checkout_service 604 -48\n%% graph-layout requirement:checkout_req -394 -98\n';
    const open = page.getByLabel('Open Markdown or Mermaid file');
    await open.setInputFiles({ name: 'checkout.mermaid', mimeType: 'text/plain', buffer: Buffer.from(original) });
    const download = page.getByRole('button', { name: 'Download', exact: true });
    await download.and(page.locator(':enabled')).waitFor();
    const canvas = page.getByRole('tabpanel').locator('.excalidraw');
    const bounds = await canvas.boundingBox();
    assert.ok(bounds);
    const elements = readMappedDiagram(original)!.elements;
    const [arrow] = elements.filter((e) => e.type === 'arrow');
    const [dx, dy] = arrow.points!.at(-1)!;
    const boxes = elements.filter((e) => e.type === 'rectangle');
    const centerX = (Math.min(...boxes.map((e) => e.x)) + Math.max(...boxes.map((e) => e.x + e.width!))) / 2;
    const centerY = (Math.min(...boxes.map((e) => e.y)) + Math.max(...boxes.map((e) => e.y + e.height!))) / 2;
    const x = bounds.x + bounds.width / 2 - centerX + arrow.x;
    const y = bounds.y + bounds.height / 2 - centerY + arrow.y;
    await page.mouse.click(x + dx / 4, y + dy / 4);
    await page.mouse.move(x + dx / 2, y + dy / 2);
    await page.mouse.down();
    await page.mouse.move(x + dx / 2 + 60, y + dy / 2 - 30, { steps: 10 });
    await page.mouse.up();
    assert.deepEqual(await page.getByRole('alert').allTextContents(), []);
    assert.equal(await download.isEnabled(), true);
    const exported = page.waitForEvent('download');
    await download.click();
    const saved = readFileSync((await (await exported).path())!, 'utf8');
    const reopened = readMappedDiagram(saved)!.elements.find((e) => e.type === 'arrow')!;
    assert.equal(reopened.points?.length, 3, 'the downloaded relationship should retain the new waypoint');
    assert.ok(Math.abs(reopened.x + reopened.points[1][0] - (arrow.x + dx / 2 + 60)) < 3);
    assert.ok(Math.abs(reopened.y + reopened.points[1][1] - (arrow.y + dy / 2 - 30)) < 3);
    assert.deepEqual([reopened.start?.id, reopened.end?.id], [arrow.start?.id, arrow.end?.id]);
    await open.setInputFiles({ name: 'reopened.mermaid', mimeType: 'text/plain', buffer: Buffer.from(saved) });
    await page.getByRole('heading', { name: 'reopened.mermaid' }).waitFor();
    await download.and(page.locator(':enabled')).waitFor();
    // Click the reopened bend: its label follows the handle rather than the old straight line.
    const bendX = x + reopened.x - arrow.x + reopened.points[1][0];
    const bendY = y + reopened.y - arrow.y + reopened.points[1][1];
    await page.mouse.click((x + bendX) / 2, (y + bendY) / 2);
    await page.keyboard.press('Control+Enter');
    await page.mouse.move(bendX, bendY);
    await page.mouse.down();
    await page.mouse.move(bendX + 30, bendY + 10, { steps: 10 });
    await page.mouse.up();
    await page.keyboard.press('Escape');
    await page.getByRole('tab', { name: 'SOURCE', exact: true }).click();
    const twice = await page.getByRole('textbox', { name: 'Document source' }).inputValue();
    const moved = readMappedDiagram(twice)!.elements.find((e) => e.type === 'arrow')!;
    assert.equal(moved.points?.length, 3);
    assert.ok(Math.abs(moved.x + moved.points[1][0] - (reopened.x + reopened.points[1][0] + 30)) < 3, twice);
    assert.ok(Math.abs(moved.y + moved.points[1][1] - (reopened.y + reopened.points[1][1] + 10)) < 3);
  } finally {
    await browser.close();
  }
});

test('requirement arrow types survive switching, download and reopen without changing the relationship', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.setDefaultTimeout(3000);
    await page.goto(process.env.MERMAID_DRAW_TEST_URL ?? new URL('../../packages/mermaid_draw_web/dist/index.html', import.meta.url).href);
    const file = examplePath('requirement');
    const document = openDocument(file, readFileSync(file, 'utf8'));
    let saved = exampleNamed(document, 'Connector bends').source;
    const native = saved.split('%% graph-route')[0];
    const open = page.getByLabel('Open Markdown or Mermaid file');
    const download = page.getByRole('button', { name: 'Download', exact: true });
    const types = page.getByRole('group', { name: 'Arrow type' });
    for (const [index, kind] of ['Curved', 'Elbow', 'Sharp'].entries()) {
      const name = `reopened-${index}.mermaid`;
      await open.setInputFiles({ name, mimeType: 'text/plain', buffer: Buffer.from(saved) });
      await page.getByRole('heading', { name }).waitFor();
      await download.and(page.locator(':enabled')).waitFor();
      const bounds = await page.getByRole('tabpanel').locator('.excalidraw').boundingBox();
      assert.ok(bounds);
      const scene = readMappedDiagram(saved)!.elements;
      const boxes = scene.filter((e) => e.type === 'rectangle');
      const arrow = scene.find((e) => e.type === 'arrow')!;
      const x = bounds.x + (bounds.width - Math.max(...boxes.map((e) => e.x + e.width!))) / 2;
      const y = bounds.y + (bounds.height - Math.max(...boxes.map((e) => e.y + e.height!))) / 2;
      await page.mouse.click(x + arrow.x + arrow.points![1][0], y + arrow.y + arrow.points![1][1]);
      const previous = ['Sharp', 'Curved', 'Elbow'][index];
      assert.equal(await types.locator(`[title="${previous} arrow"] input`).isChecked(), true);
      const control = types.locator(`[title="${kind} arrow"]`);
      await control.click();
      assert.equal(await control.locator('input').isChecked(), true, `${kind} should remain selected`);
      const pending = page.waitForEvent('download');
      await download.click();
      saved = readFileSync((await (await pending).path())!, 'utf8');
      const reopened = readMappedDiagram(saved)!.elements.find((e) => e.type === 'arrow')!;
      assert.ok(saved.startsWith(native));
      assert.deepEqual([reopened.start?.id, reopened.end?.id], ['requirement:A', 'requirement:B']);
      if (kind === 'Curved') {
        assert.ok(reopened.roundness);
        assert.equal(reopened.points?.length, 3, 'curving a bent line must keep its waypoint');
      } else if (kind === 'Elbow') {
        const points = reopened.points!;
        assert.ok(points.length > 2);
        assert.ok(points.slice(1).every(([x,y], i) => points[i][0] === x || points[i][1] === y), 'elbows must be orthogonal');
      } else assert.equal(reopened.roundness, null);
    }
  } finally { await browser.close(); }
});
