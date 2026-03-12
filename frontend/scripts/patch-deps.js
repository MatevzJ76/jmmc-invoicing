/**
 * Postinstall patch: fix ajv-keywords _formatLimit.js crash on Node 20+
 *
 * fork-ts-checker-webpack-plugin bundles ajv-keywords v3 which calls
 * ajv.formats.date — but ajv v8 removed .formats, causing a crash at
 * require() time before craco can filter the plugin out.
 *
 * This patch adds a null-check so the module loads cleanly.
 */
const fs = require('fs');
const path = require('path');

const target = path.join(
  __dirname,
  '..',
  'node_modules',
  'fork-ts-checker-webpack-plugin',
  'node_modules',
  'ajv-keywords',
  'keywords',
  '_formatLimit.js'
);

if (!fs.existsSync(target)) {
  console.log('patch-deps: _formatLimit.js not found, skipping');
  process.exit(0);
}

let src = fs.readFileSync(target, 'utf8');

const ORIGINAL = 'var format = formats[name];';
const PATCHED  = 'if (!formats) return; var format = formats[name];';

if (src.includes(PATCHED)) {
  console.log('patch-deps: already patched, skipping');
  process.exit(0);
}

if (!src.includes(ORIGINAL)) {
  console.log('patch-deps: target line not found, skipping');
  process.exit(0);
}

src = src.replace(ORIGINAL, PATCHED);
fs.writeFileSync(target, src, 'utf8');
console.log('patch-deps: patched fork-ts-checker-webpack-plugin ajv-keywords _formatLimit.js ✓');
