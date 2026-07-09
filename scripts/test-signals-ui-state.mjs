import assert from 'node:assert/strict';
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
assert.equal(authoritativeEmpty.primaryAction.label, 'Запустити зараз');
assert.equal(authoritativeEmpty.secondaryAction.kind, 'advanced_import');
assert.match(authoritativeEmpty.title, /авт/i);

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
assert.match(filteredEmpty.title, /Нічого|немає|Знайшли/i);

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
assert.match(failedNotice.message, /помил/i);
assert.match(failedNotice.message, /1/);
assert.match(failedNotice.message, /2/);
assert.doesNotMatch(failedNotice.message, /без нових сигналів/i);

console.log('signals UI state tests passed');
