const CONTROLLED_LIVE_RUN_ENV = 'PERSONAL_URL_STRICT_LIVE_RUN';
const CONTROLLED_PREFLIGHT_ENV = 'PERSONAL_URL_CREDENTIALLESS_PREFLIGHT';
const PERSONAL_SAVED_URL_PROVIDER_SCOPE = 'personal_saved_url';

function isControlledLiveRunEnabled(env = process.env) {
  return String(env?.[CONTROLLED_LIVE_RUN_ENV] || '').trim().toLowerCase() === 'true';
}

function isControlledCredentiallessPreflightEnabled(env = process.env) {
  return String(env?.[CONTROLLED_PREFLIGHT_ENV] || '').trim().toLowerCase() === 'true';
}

function createControlledLiveRunScopeError(scope = '') {
  const error = new Error('controlled_live_run_scope_blocked');
  error.code = 'controlled_live_run_scope_blocked';
  error.status = 503;
  error.providerAttemptBlocked = true;
  error.payload = {
    error: 'controlled_live_run_scope_blocked',
    scope: String(scope || 'unscoped'),
    retryable: false,
  };
  return error;
}

function createControlledPreflightProviderError(scope = '') {
  const error = new Error('controlled_preflight_provider_not_configured');
  error.code = 'controlled_preflight_provider_not_configured';
  error.status = 503;
  error.providerAttemptBlocked = true;
  error.payload = {
    error: 'provider_not_configured',
    reason: 'controlled_preflight',
    mode: 'credentialless_preflight',
    scope: String(scope || 'unscoped'),
    retryable: false,
  };
  return error;
}

function assertControlledLiveRunProviderAccess({
  env = process.env,
  scope = '',
} = {}) {
  if (!isControlledLiveRunEnabled(env)) return true;
  if (scope !== PERSONAL_SAVED_URL_PROVIDER_SCOPE) throw createControlledLiveRunScopeError(scope);
  if (isControlledCredentiallessPreflightEnabled(env)) {
    throw createControlledPreflightProviderError(scope);
  }
  return true;
}

module.exports = {
  CONTROLLED_PREFLIGHT_ENV,
  CONTROLLED_LIVE_RUN_ENV,
  PERSONAL_SAVED_URL_PROVIDER_SCOPE,
  assertControlledLiveRunProviderAccess,
  createControlledPreflightProviderError,
  createControlledLiveRunScopeError,
  isControlledCredentiallessPreflightEnabled,
  isControlledLiveRunEnabled,
};
