'use strict';

const IMMUTABLE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/;
const REQUIRED_SCOPE = 'staging';

function normalizeId(value) {
  return String(value || '').trim();
}

function readBetaOwnerTestAccessConfig(env = process.env) {
  const enabled = String(env.BETA_OWNER_TEST_ENABLED || '').trim().toLowerCase() === 'true';
  const scope = String(env.BETA_OWNER_TEST_SCOPE || '').trim().toLowerCase();
  const userId = normalizeId(env.BETA_OWNER_TEST_USER_ID);
  const workspaceId = normalizeId(env.BETA_OWNER_TEST_WORKSPACE_ID);
  const idsPresent = Boolean(userId && workspaceId);
  const idsValid = idsPresent
    && IMMUTABLE_ID_PATTERN.test(userId)
    && IMMUTABLE_ID_PATTERN.test(workspaceId);

  let status = 'disabled';
  if (enabled && scope !== REQUIRED_SCOPE) status = 'invalid_scope';
  else if (enabled && !idsPresent) status = 'missing_pair';
  else if (enabled && !idsValid) status = 'invalid_pair';
  else if (enabled) status = 'configured';

  return Object.freeze({
    enabled,
    scope,
    userId,
    workspaceId,
    configured: status === 'configured',
    status,
  });
}

function matchesBetaOwnerTestPair(config, user, workspaceId) {
  if (!config?.configured || !user?.id) return false;
  return user.id === config.userId && String(workspaceId || '') === config.workspaceId;
}

function getSafeBetaOwnerTestDiagnostic(config) {
  return {
    configured: Boolean(config?.configured),
    enabled: Boolean(config?.enabled),
    requiredScope: REQUIRED_SCOPE,
    status: String(config?.status || 'disabled'),
  };
}

module.exports = {
  IMMUTABLE_ID_PATTERN,
  REQUIRED_SCOPE,
  getSafeBetaOwnerTestDiagnostic,
  matchesBetaOwnerTestPair,
  readBetaOwnerTestAccessConfig,
};
