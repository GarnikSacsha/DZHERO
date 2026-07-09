import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  deriveDiscoveryRunNotice,
  deriveDiscoveryRunStatusCode,
  deriveDiscoveryToolbarStatus,
  canRunDiscoveryNow,
  deriveDiscoveryRunNowLabel,
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

const loadingEmpty = deriveSignalsEmptyState({
  reelsCount: 0,
  filteredReelsCount: 0,
  hasActiveFilters: false,
  isLoading: true,
});

assert.equal(loadingEmpty.kind, 'loading');
assert.equal(loadingEmpty.primaryAction, null);
assert.equal(loadingEmpty.secondaryAction, null);

const loadFailedEmpty = deriveSignalsEmptyState({
  reelsCount: 0,
  filteredReelsCount: 0,
  hasActiveFilters: false,
  loadIssue: 'Reels fetch failed',
});

assert.equal(loadFailedEmpty.kind, 'error');
assert.equal(loadFailedEmpty.primaryAction.kind, 'retry');
assert.equal(loadFailedEmpty.secondaryAction.kind, 'advanced_import');

const pausedEmpty = deriveSignalsEmptyState({
  reelsCount: 0,
  filteredReelsCount: 0,
  hasActiveFilters: false,
  automationEnabled: false,
  canRunAutomation: false,
});

assert.equal(pausedEmpty.primaryAction.kind, 'enable');

const blockedEmpty = deriveSignalsEmptyState({
  reelsCount: 0,
  filteredReelsCount: 0,
  hasActiveFilters: false,
  automationEnabled: true,
  canRunAutomation: false,
});

assert.equal(blockedEmpty.primaryAction, null);

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

const partialRun = {
  status: 'completed',
  acceptedCount: 2,
  errorCount: 1,
  errors: [{ platform: 'instagram', lane: 'accounts', message: '429 rate limit' }],
};
const partialNotice = deriveDiscoveryRunNotice({
  run: partialRun,
  acceptedSignalsCount: 2,
  updatedSignalsCount: 0,
});

assert.equal(deriveDiscoveryRunStatusCode(partialRun, { enabled: true }), 'partial');
assert.equal(partialNotice.tone, 'warning');
assert.match(partialNotice.message, /2/);
assert.match(partialNotice.message, /Instagram/);
assert.match(partialNotice.message, /помил/i);

const runningToolbar = deriveDiscoveryToolbarStatus({
  status: {
    running: true,
    activeRun: { attemptedCallCount: 2 },
  },
});

const budgetToolbar = deriveDiscoveryToolbarStatus({
  settings: { enabled: true },
  status: { code: 'budget_reached', tokenConfigured: true },
});

const partialToolbar = deriveDiscoveryToolbarStatus({
  settings: { enabled: true },
  status: { code: 'completed', tokenConfigured: true, latestRun: partialRun },
});

assert.equal(runningToolbar.label, 'Виконується');
assert.equal(budgetToolbar.label, 'Ліміт вичерпано');
assert.equal(partialToolbar.label, 'Частково');
assert.equal(partialToolbar.tone, 'warning');
assert.match(partialToolbar.detail, /Instagram/);

assert.equal(canRunDiscoveryNow({
  settings: { enabled: false },
  status: {
    canRunNow: true,
    dailySpendUsd: 0,
    dailyBudgetUsd: 0.8,
    remainingBudgetUsd: 0.8,
  },
}), false, 'paused discovery cannot run');
assert.equal(canRunDiscoveryNow({
  settings: { enabled: true },
  status: {
    code: 'budget_reached',
    canRunNow: true,
    dailySpendUsd: 0,
    dailyBudgetUsd: 0.8,
    remainingBudgetUsd: 0.8,
  },
}), true, 'a stale status string must not block a new UTC budget');
assert.equal(canRunDiscoveryNow({
  settings: { enabled: true },
  status: {
    canRunNow: true,
    dailySpendUsd: 0.8,
    dailyBudgetUsd: 0.8,
    remainingBudgetUsd: 0,
  },
}), false, 'the current daily budget fields remain authoritative');
assert.equal(deriveDiscoveryRunNowLabel({
  settings: { enabled: true },
  status: {
    code: 'budget_reached',
    canRunNow: true,
    dailySpendUsd: 0,
    dailyBudgetUsd: 0.8,
    remainingBudgetUsd: 0.8,
  },
}), 'Запустити зараз');

const mainSource = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
const emptyStateIndex = mainSource.indexOf('const emptyState = deriveSignalsEmptyState({');
const canRunAutomationIndex = mainSource.indexOf('const canRunAutomation = canRunDiscoveryNow(');
const signalsTableIndex = mainSource.indexOf('isLoading={automation?.isLoading}');
const signalsLoadIssueIndex = mainSource.indexOf('loadIssue={automation?.error}');
const refreshWrapperIndex = mainSource.indexOf('onRefreshAutomation={() => void refreshSignalsWorkspaceState({ silent: false })}');
const toolbarHelperIndex = mainSource.indexOf('deriveDiscoveryToolbarStatus(discovery)');
const runHandlerStart = mainSource.indexOf('const runSignalDiscoveryNow = async () => {');
const runHandlerEnd = mainSource.indexOf('const pushIdeaToPlan = (idea) => {');
const requestContextHelperIndex = mainSource.indexOf('const createSignalsWorkspaceRequestContext =');
const requestGuardHelperIndex = mainSource.indexOf('const isSignalsWorkspaceRequestCurrent =');
const visibleRefreshGuardIndex = mainSource.indexOf('if (!silent && visibleSignalsRefreshPromiseRef.current) return visibleSignalsRefreshPromiseRef.current;');
const toggleGuardIndex = mainSource.indexOf('if (!isSignalsWorkspaceRequestCurrent(requestContext, signalDiscoveryToggleRequestRef)) return payload;');
const runGuardIndex = mainSource.indexOf('if (!isSignalsWorkspaceRequestCurrent(requestContext, signalDiscoveryRunRequestRef)) return payload;');

assert.notEqual(emptyStateIndex, -1, 'expected emptyState derivation in src/main.jsx');
assert.notEqual(canRunAutomationIndex, -1, 'expected canRunAutomation declaration in src/main.jsx');
assert.notEqual(signalsTableIndex, -1, 'expected loading state prop in Signals table call');
assert.notEqual(signalsLoadIssueIndex, -1, 'expected load error prop in Signals table call');
assert.notEqual(refreshWrapperIndex, -1, 'expected refresh wrapper in Signals UI');
assert.notEqual(toolbarHelperIndex, -1, 'expected shared toolbar status helper in src/main.jsx');
assert.notEqual(requestContextHelperIndex, -1, 'expected request context helper in src/main.jsx');
assert.notEqual(requestGuardHelperIndex, -1, 'expected request guard helper in src/main.jsx');
assert.notEqual(visibleRefreshGuardIndex, -1, 'expected visible refresh overlap guard in src/main.jsx');
assert.notEqual(toggleGuardIndex, -1, 'expected toggle workspace/request guard in src/main.jsx');
assert.notEqual(runGuardIndex, -1, 'expected run workspace/request guard in src/main.jsx');
assert.match(mainSource, /deriveDiscoveryRunNowLabel\(discovery,/);
assert.ok(
  canRunAutomationIndex < emptyStateIndex,
  'canRunAutomation must be declared before emptyState derives it',
);
assert.ok(runHandlerStart !== -1 && runHandlerEnd !== -1 && runHandlerStart < runHandlerEnd, 'expected run handler block in src/main.jsx');
assert.ok(
  !mainSource.slice(runHandlerStart, runHandlerEnd).includes('throw error;'),
  'run handler must not rethrow after handling notifications',
);

console.log('signals UI state tests passed');
