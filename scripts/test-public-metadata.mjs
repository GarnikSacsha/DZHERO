import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexHtml = await readFile(path.join(ROOT_DIR, 'index.html'), 'utf8');
const styles = await readFile(path.join(ROOT_DIR, 'src', 'styles.css'), 'utf8');
const server = await readFile(path.join(ROOT_DIR, 'backend', 'server.js'), 'utf8');

const requiredIndexPatterns = [
  /<meta\s+name="description"\s+content="[^"]+"/i,
  /<link\s+rel="canonical"\s+href="https:\/\/dzhero\.com\.ua\/"/i,
  /<meta\s+property="og:type"\s+content="website"/i,
  /<meta\s+property="og:title"\s+content="[^"]+"/i,
  /<meta\s+property="og:description"\s+content="[^"]+"/i,
  /<meta\s+property="og:image"\s+content="https:\/\/dzhero\.com\.ua\/og-image\.png"/i,
  /<meta\s+name="twitter:card"\s+content="summary_large_image"/i,
  /<link\s+rel="manifest"\s+href="\/site\.webmanifest"/i,
];

for (const pattern of requiredIndexPatterns) {
  assert.match(indexHtml, pattern, `missing public metadata matching ${pattern}`);
}

const googleFontDeclarations = `${indexHtml}\n${styles}`.match(/fonts\.googleapis\.com\/css2/g) || [];
assert.equal(googleFontDeclarations.length, 1, 'Google Fonts must be declared exactly once');
assert.match(server, /styleSrc:[^\n]*'https:\/\/fonts\.googleapis\.com'/, 'CSP style-src must allow Google Fonts CSS');
assert.match(server, /fontSrc:[^\n]*'https:\/\/fonts\.gstatic\.com'/, 'CSP font-src must allow Google Fonts files');

for (const relativePath of [
  'public/robots.txt',
  'public/sitemap.xml',
  'public/.well-known/security.txt',
  'public/site.webmanifest',
  'public/og-image.png',
]) {
  await access(path.join(ROOT_DIR, relativePath));
}

console.log('Public metadata checks passed.');
