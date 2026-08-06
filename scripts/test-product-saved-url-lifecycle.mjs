import assert from 'node:assert/strict';
import {
  getSavedUrlIdentity,
  isCurrentSavedUrlResponse,
  upsertSavedUrl,
} from '../src/productSavedUrlState.mjs';
import { createProductDiscoveryClient } from '../src/productDiscoveryIntegration.mjs';
import { mapQualityAcceptedSignalsToProductCards } from '../src/productSignalsViewState.mjs';

const identityA = getSavedUrlIdentity({ workspaceId: 'workspace-a' });
const identityB = getSavedUrlIdentity({ workspaceId: 'workspace-b' });
assert.equal(isCurrentSavedUrlResponse({ requestRevision: 1, currentRevision: 1, requestWorkspaceId: identityA, currentWorkspaceId: identityA }), true);
assert.equal(isCurrentSavedUrlResponse({ requestRevision: 1, currentRevision: 2, requestWorkspaceId: identityA, currentWorkspaceId: identityA }), false);
assert.equal(isCurrentSavedUrlResponse({ requestRevision: 1, currentRevision: 1, requestWorkspaceId: identityA, currentWorkspaceId: identityB }), false);
assert.equal(isCurrentSavedUrlResponse({ requestRevision: 1, currentRevision: 1, requestWorkspaceId: identityA, currentWorkspaceId: identityA, cancelled: true }), false);

const saved = { id: 'saved-a', canonicalUrl: 'https://instagram.com/reel/abc', workspaceId: 'workspace-a' };
assert.deepEqual(upsertSavedUrl([], saved), [saved]);
assert.deepEqual(upsertSavedUrl([saved], { ...saved, originalUrl: 'https://www.instagram.com/reel/abc/?utm_source=x' }), [{ ...saved, originalUrl: 'https://www.instagram.com/reel/abc/?utm_source=x' }]);
assert.deepEqual(upsertSavedUrl([saved], { id: 'saved-b', canonicalUrl: 'https://youtube.com/shorts/xyz' }).map(({ id }) => id), ['saved-b', 'saved-a']);

const calls = [];
const storedByWorkspace = new Map([['workspace-a', [saved]], ['workspace-b', []]]);
const response = (status, payload) => ({ ok: status >= 200 && status < 300, status, json: async () => payload });
const fetcher = async (url, options = {}) => {
  calls.push({ url, options });
  const match = url.match(/\/workspaces\/([^/]+)\/saved-urls(?:\/([^/]+))?$/);
  assert.ok(match, `unexpected URL: ${url}`);
  const workspaceId = match[1];
  const savedUrlId = match[2];
  const current = storedByWorkspace.get(workspaceId) || [];
  if (!options.method) return response(200, { workspaceId, savedUrls: current });
  if (options.method === 'POST') {
    const body = JSON.parse(options.body);
    if (body.url === 'invalid') return response(400, { error: 'saved_url_invalid' });
    const record = { id: `saved-${workspaceId}`, workspaceId, canonicalUrl: body.url, status: 'not_analyzed' };
    const alreadySaved = current.some((item) => item.canonicalUrl === body.url);
    if (!alreadySaved) storedByWorkspace.set(workspaceId, [record, ...current]);
    return response(alreadySaved ? 200 : 201, { saved: true, alreadySaved, savedUrl: alreadySaved ? current[0] : record });
  }
  if (options.method === 'DELETE') {
    storedByWorkspace.set(workspaceId, current.filter((item) => item.id !== savedUrlId));
    return response(200, { deleted: true, savedUrlId });
  }
  throw new Error(`unexpected method: ${options.method}`);
};

const clientA = createProductDiscoveryClient({ apiBase: '/api', workspaceId: 'workspace-a', fetcher });
const clientB = createProductDiscoveryClient({ apiBase: '/api', workspaceId: 'workspace-b', fetcher });
assert.equal((await clientA.loadSavedUrls()).savedUrls.length, 1, 'load returns the current workspace library');
assert.equal((await clientA.saveUrl('https://youtube.com/shorts/new')).alreadySaved, false, 'save creates a URL-only record');
assert.equal((await clientA.saveUrl('https://youtube.com/shorts/new')).alreadySaved, true, 'repeat save is idempotent');
await assert.rejects(() => clientA.saveUrl('invalid'), /saved_url_invalid/);
assert.equal((await clientB.loadSavedUrls()).savedUrls.length, 0, 'workspace B cannot read workspace A links');
assert.equal((await clientA.deleteSavedUrl('saved-workspace-a')).deleted, true, 'delete persists through the client');
assert.ok(calls.some(({ url }) => url === '/api/workspaces/workspace-a/saved-urls'));
assert.ok(calls.some(({ url }) => url === '/api/workspaces/workspace-b/saved-urls'));
assert.deepEqual(mapQualityAcceptedSignalsToProductCards([
  { id: saved.id, sourceUrl: saved.canonicalUrl, status: 'not_analyzed' },
]), [], 'URL-only records never enter verified signal card mapping');

console.log('Product Personal URL lifecycle checks passed.');
