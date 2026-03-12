/**
 * Postinstall patch: fix ajv-keywords _formatLimit.js crash on Node 20+
 *
 * Multiple packages bundle old ajv-keywords v3 which calls ajv.formats.date —
 * but ajv v8 removed .formats, causing a crash. This script finds ALL instances
 * of _formatLimit.js across node_modules and patches them with a null-check.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ORIGINAL = 'var format = formats[name];';
const PATCHED  = 'if (!formats) return; var format = formats[name];';

// Find all _formatLimit.js files anywhere in node_modules
let files = [];
try {
  const result = execSync(
    'find node_modules -name "_formatLimit.js" 2>/dev/null',
    { cwd: path.join(__dirname, '..'), encoding: 'utf8' }
  ).trim();
  files = result.split('\n').filter(Boolean);
} catch (e) {
  console.log('patch-deps: find command failed, trying manual search');
}

if (files.length === 0) {
  console.log('patch-deps: no _formatLimit.js files found');
  process.exit(0);
}

let patched = 0;
for (const file of files) {
  const fullPath = path.join(__dirname, '..', file);
  if (!fs.existsSync(fullPath)) continue;

  let src = fs.readFileSync(fullPath, 'utf8');
  if (src.includes(PATCHED)) {
    console.log(`patch-deps: already patched: ${file}`);
    continue;
  }
  if (!src.includes(ORIGINAL)) {
    console.log(`patch-deps: target line not found in: ${file}`);
    continue;
  }
  src = src.replace(ORIGINAL, PATCHED);
  fs.writeFileSync(fullPath, src, 'utf8');
  console.log(`patch-deps: patched ✓ ${file}`);
  patched++;
}

console.log(`patch-deps: done — patched ${patched} file(s)`);
