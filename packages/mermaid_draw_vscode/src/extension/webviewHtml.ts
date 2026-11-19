/**
 * The webview page. `assetRoot` is the webview URL of `dist/webview/`, ending in `/`, and `cspSource` the origin
 * allowed to serve it. Excalidraw loads its fonts relative to `EXCALIDRAW_ASSET_PATH` instead of its CDN.
 */
export function webviewHtml({ assetRoot, cspSource, nonce }: { assetRoot: string; cspSource: string; nonce: string }): string {
  const policy = [
    "default-src 'none'",
    `img-src ${cspSource} data: blob:`,
    `style-src ${cspSource} 'unsafe-inline'`,
    `font-src ${cspSource} data:`,
    `script-src 'nonce-${nonce}' ${cspSource}`,
    `connect-src ${cspSource}`,
    `worker-src ${cspSource} blob:`,
  ].join('; ');
  const attribute = (value: string) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="${attribute(policy)}">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="stylesheet" href="${attribute(`${assetRoot}webview.css`)}">
    <script nonce="${nonce}">window.EXCALIDRAW_ASSET_PATH = ${JSON.stringify(assetRoot).replaceAll('<', '\\u003c')};</script>
    <script type="module" nonce="${nonce}" src="${attribute(`${assetRoot}webview.js`)}"></script>
  </head>
  <body>
    <div id="app"></div>
  </body>
</html>`;
}
