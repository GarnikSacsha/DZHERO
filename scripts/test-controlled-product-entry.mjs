import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PRODUCT_DISCOVER_PREVIEW_PATH,
  resolveAuthFailureProductEntry,
  resolveDefaultProductEntry,
} from '../src/productEntryRouting.mjs';

assert.equal(resolveDefaultProductEntry({ pathname: '/', search: '' }), '');
assert.equal(resolveDefaultProductEntry({
  pathname: '/',
  search: '',
  controlledLiveRunEnabled: true,
}), PRODUCT_DISCOVER_PREVIEW_PATH);
assert.equal(resolveDefaultProductEntry({
  pathname: '/',
  search: '',
  defaultPreviewEnabled: true,
}), PRODUCT_DISCOVER_PREVIEW_PATH);
assert.equal(resolveDefaultProductEntry({
  pathname: '/',
  search: '?preview=onboarding',
  controlledLiveRunEnabled: true,
}), '');

assert.equal(resolveAuthFailureProductEntry({
  pathname: '/',
  search: '?preview=product&tab=discover',
  productPreview: true,
  controlledLiveRunEnabled: true,
}), PRODUCT_DISCOVER_PREVIEW_PATH);
assert.equal(resolveAuthFailureProductEntry({
  pathname: '/',
  search: '?preview=product&tab=discover&auth=google',
  productPreview: true,
  authReturn: true,
  controlledLiveRunEnabled: true,
}), PRODUCT_DISCOVER_PREVIEW_PATH);
assert.equal(resolveAuthFailureProductEntry({
  pathname: '/privacy',
  search: '',
  controlledLiveRunEnabled: true,
}), '');
assert.equal(resolveAuthFailureProductEntry({
  pathname: '/',
  search: '?preview=product&tab=discover&source=login',
  productPreview: true,
}), '/?source=login');
assert.equal(resolveAuthFailureProductEntry({
  pathname: '/',
  search: '',
  productPreview: false,
}), '');
assert.equal(resolveDefaultProductEntry({
  pathname: '/privacy',
  search: '',
  controlledLiveRunEnabled: true,
}), '');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mainSource = fs.readFileSync(path.join(root, 'src', 'main.jsx'), 'utf8');
assert.match(mainSource, /VITE_PERSONAL_URL_CONTROLLED_PRODUCT_ENTRY/);
assert.match(mainSource, /resolveDefaultProductEntry/);
assert.match(mainSource, /resolveAuthFailureProductEntry/);
assert.match(mainSource, /controlledLiveRunEnabled:\s*CONTROLLED_LIVE_RUN_PRODUCT_ENTRY/);
assert.match(mainSource, /if \(CONTROLLED_LIVE_RUN_PRODUCT_ENTRY\) selectDefaultProductEntry\(\);/);
assert.match(
  mainSource,
  /\.catch\(\(\) => \{[\s\S]*resolveAuthFailureProductEntry\([\s\S]*controlledLiveRunEnabled:\s*CONTROLLED_LIVE_RUN_PRODUCT_ENTRY[\s\S]*replaceState/,
  'the auth-failure branch must preserve Product Discover in controlled mode',
);

console.log('Controlled live-run product entry checks passed.');
