import assert from 'node:assert/strict';

import {
  getProductContentPlanIdentity,
  isCurrentProductContentPlanResponse,
} from '../src/productContentPlanLifecycle.mjs';
import { buildStudioContentPlanDraft } from '../src/contentPlanUtils.mjs';

const workspaceA = getProductContentPlanIdentity({ workspaceId: 'ws-a', brandId: 'brand-a' });
const workspaceB = getProductContentPlanIdentity({ workspaceId: 'ws-a', brandId: 'brand-b' });
assert.equal(isCurrentProductContentPlanResponse({ requestIdentity: workspaceA, currentIdentity: workspaceA }), true);
assert.equal(isCurrentProductContentPlanResponse({ requestIdentity: workspaceA, currentIdentity: workspaceB }), false);
assert.equal(isCurrentProductContentPlanResponse({ requestIdentity: workspaceA, currentIdentity: workspaceA, cancelled: true }), false);

const adaptation = {
  id: 'adaptation-a',
  result: {
    remixes: [
      { title: 'Variant one', hook: 'Hook one', visualFlow: [{ timeframe: '0:00', actionDescription: 'One' }] },
      { title: 'Variant two', hook: 'Hook two', cta: 'CTA two', visualFlow: [{ timeframe: '0:01', actionDescription: 'Two' }] },
      { title: 'Variant three', hook: 'Hook three', visualFlow: [{ timeframe: '0:02', actionDescription: 'Three' }] },
    ],
  },
};
const selected = buildStudioContentPlanDraft({ id: 'signal-a', title: 'Source signal' }, adaptation, adaptation.result.remixes[1]);
assert.equal(selected.title, 'Variant two');
assert.match(selected.body, /Hook two/);
assert.match(selected.body, /CTA two/);
assert.doesNotMatch(selected.body, /Hook one/);

console.log('Product Content Plan lifecycle and selected-variant checks passed.');
