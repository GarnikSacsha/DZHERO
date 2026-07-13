import assert from 'node:assert/strict';

import {
  buildWorkspaceProducerSnapshot,
} from '../src/data/uaMarket.js';

const base = {
  marketSegments: [{ id: 'all', label: 'All' }],
  competitors: [{ id: 'demo_competitor' }],
  reels: [{ id: 'demo_reel', score: 91 }],
  ideas: [{ id: 'demo_idea', title: 'Demo idea' }],
  plans: [['Demo plan', '10:00', 'Post']],
  sources: [['Demo source', 'Demo copy', 'Demo status']],
};

const emptyWorkspace = buildWorkspaceProducerSnapshot(base, {
  reels: [],
  ideas: [],
  contentPlanPosts: [],
});

assert.deepEqual(emptyWorkspace.marketSegments, base.marketSegments);
assert.deepEqual(emptyWorkspace.sources, base.sources);
assert.deepEqual(emptyWorkspace.competitors, []);
assert.deepEqual(emptyWorkspace.reels, []);
assert.deepEqual(emptyWorkspace.ideas, []);
assert.deepEqual(emptyWorkspace.plans, []);

const workspaceSnapshot = buildWorkspaceProducerSnapshot(base, {
  reels: [{ id: 'workspace_reel', score: 77 }],
  ideas: [{ id: 'workspace_idea', title: 'Workspace idea' }],
  contentPlanPosts: [{ title: 'Workspace post', time: '12:00', format: 'Reels' }],
});

assert.deepEqual(workspaceSnapshot.reels.map((item) => item.id), ['workspace_reel']);
assert.deepEqual(workspaceSnapshot.ideas.map((item) => item.id), ['workspace_idea']);
assert.deepEqual(workspaceSnapshot.plans, [['Workspace post', '12:00', 'Reels']]);

console.log('workspace snapshot tests passed');
