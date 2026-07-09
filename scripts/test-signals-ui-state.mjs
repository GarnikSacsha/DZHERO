import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  deriveDiscoveryRunNotice,
  deriveDiscoveryRunStatusCode,
  deriveSignalsEmptyState,
} from '../src/signalsUiState.mjs';

const authoritativeEmpty = deriveSignalsEmptyState({
  reelsCount: 0,
  filteredReelsCount: 0,
  hasActiveFilters: false,
  automationEnabled: true,
  canRunAutomation: true,
});

assert.equal(authoritativeEmpty.kind, 'authoritative');
assert.equal(authoritativeEmpty.primaryAction.kind, 'run');
assert.equal(authoritativeEmpty.primaryAction.disabled, false);
assert.equal(authoritativeEmpty.secondaryAction.kind, 'advanced_import');
assert.ok(authoritativeEmpty.title.length > 0);

const filteredEmpty = deriveSignalsEmptyState({
  reelsCount: 0,
  filteredReelsCount: 0,
  hasActiveFilters: true,
  sourceFilter: 'youtube',
  automationEnabled: true,
  canRunAutomation: true,
});

assert.equal(filteredEmpty.kind, 'filtered');
assert.equal(filteredEmpty.primaryAction, null);
assert.ok(filteredEmpty.title.length > 0);

const failedNotice = deriveDiscoveryRunNotice({
  run: {
    status: 'failed',
    errors: [{ message: 'APIFY_TOKEN is missing' }],
  },
  acceptedSignalsCount: 1,
  updatedSignalsCount: 2,
});

assert.equal(deriveDiscoveryRunStatusCode({ status: 'failed' }, { enabled: true }), 'failed');
assert.equal(failedNotice.tone, 'error');
assert.ok(failedNotice.message.length > 0);
assert.match(failedNotice.message, /1/);
assert.match(failedNotice.message, /2/);

const mainSource = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
const emptyStateIndex = mainSource.indexOf('const emptyState = deriveSignalsEmptyState({');
const canRunAutomationIndex = mainSource.indexOf('const canRunAutomation = Boolean(');

assert.notEqual(emptyStateIndex, -1, 'expected emptyState derivation in src/main.jsx');
assert.notEqual(canRunAutomationIndex, -1, 'expected canRunAutomation declaration in src/main.jsx');
assert.ok(
  canRunAutomationIndex < emptyStateIndex,
  'canRunAutomation must be declared before emptyState derives it',
);

console.log('signals UI state tests passed');
