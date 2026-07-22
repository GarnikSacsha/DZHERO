const crypto = require('crypto');


const CONSENT_TYPES = Object.freeze([
  'product_updates',
  'early_bird_offers',
  'research_invites',
]);
const CONSENT_VERSION = '2026-07-23';
const CONSENT_SOURCES = new Set(['first_login_prompt', 'settings']);
const CONSENT_LOCALES = new Set(['uk', 'en']);


function cleanOptional(value, maxLength = 255) {
  const clean = String(value || '').trim();
  return clean ? clean.slice(0, maxLength) : undefined;
}

function isVerifiedGoogleUser(user) {
  return Boolean(
    user
    && user.oauthSubject
    && (user.authProvider === 'google' || (user.oauthProviders || []).includes('google'))
    && String(user.email || '').includes('@'),
  );
}

function normalizeVisitorId(value) {
  const clean = cleanOptional(value, 128);
  return clean && /^[A-Za-z0-9_.:-]{8,128}$/.test(clean) ? clean : undefined;
}

function currentConsentDecisions(user) {
  const preferences = user.communicationPreferences || {};
  return CONSENT_TYPES.flatMap((consentType) => {
    const decision = preferences[consentType];
    if (!decision || typeof decision.granted !== 'boolean') return [];
    return [{
      consent_type: consentType,
      granted: decision.granted,
      consent_version: decision.consentVersion,
      locale: decision.locale,
      source: decision.source,
      recorded_at: decision.recordedAt,
    }];
  });
}

function buildLeadSyncPayload({ user, visitorId, attribution = {} }) {
  if (!isVerifiedGoogleUser(user)) throw new Error('CRM sync requires a verified Google identity.');
  const consents = currentConsentDecisions(user);
  const revisionInput = JSON.stringify({
    userId: user.id,
    email: String(user.email).trim().toLowerCase(),
    googleId: user.oauthSubject,
    name: user.name || '',
    avatarUrl: user.avatarUrl || '',
    consents,
  });
  const revision = crypto.createHash('sha256').update(revisionInput).digest('hex').slice(0, 32);
  const safeUserId = String(user.id).replace(/[^A-Za-z0-9_.:-]/g, '_').slice(0, 96);
  return {
    idempotency_key: `dzhero:${safeUserId}:${revision}`,
    site_id: 'dzhero.com.ua',
    ...(normalizeVisitorId(visitorId) ? { visitor_id: normalizeVisitorId(visitorId) } : {}),
    external_user_id: String(user.id),
    google_id: String(user.oauthSubject),
    email: String(user.email).trim().toLowerCase(),
    ...(cleanOptional(user.name) ? { full_name: cleanOptional(user.name) } : {}),
    ...(cleanOptional(user.avatarUrl, 1000) ? { avatar_url: cleanOptional(user.avatarUrl, 1000) } : {}),
    ...(cleanOptional(attribution.utm_source, 100) ? { utm_source: cleanOptional(attribution.utm_source, 100) } : {}),
    ...(cleanOptional(attribution.utm_medium, 100) ? { utm_medium: cleanOptional(attribution.utm_medium, 100) } : {}),
    ...(cleanOptional(attribution.utm_campaign, 100) ? { utm_campaign: cleanOptional(attribution.utm_campaign, 100) } : {}),
    consents,
  };
}

function updateCommunicationPreferences(user, values) {
  const locale = String(values.locale || '').toLowerCase();
  const source = String(values.source || 'settings');
  if (!CONSENT_LOCALES.has(locale)) throw new Error('Consent locale must be uk or en.');
  if (!CONSENT_SOURCES.has(source)) throw new Error('Consent source is invalid.');
  const recordedAt = new Date(values.recordedAt || Date.now());
  if (!Number.isFinite(recordedAt.getTime())) throw new Error('Consent timestamp is invalid.');
  if (recordedAt.getTime() > Date.now() + 5 * 60 * 1000) throw new Error('Consent timestamp cannot be in the future.');
  user.communicationPreferences ||= {};
  CONSENT_TYPES.forEach((consentType) => {
    if (typeof values[consentType] !== 'boolean') throw new Error(`${consentType} must be boolean.`);
    user.communicationPreferences[consentType] = {
      granted: values[consentType],
      consentVersion: CONSENT_VERSION,
      locale,
      source,
      recordedAt: recordedAt.toISOString(),
    };
  });
  user.communicationPreferences.updatedAt = recordedAt.toISOString();
  user.communicationPreferences.revision = Number(user.communicationPreferences.revision || 0) + 1;
  return user.communicationPreferences;
}

function publicCommunicationPreferences(user) {
  const preferences = user?.communicationPreferences || {};
  return {
    product_updates: preferences.product_updates?.granted ?? null,
    early_bird_offers: preferences.early_bird_offers?.granted ?? null,
    research_invites: preferences.research_invites?.granted ?? null,
    consent_version: CONSENT_VERSION,
    updated_at: preferences.updatedAt || null,
    has_decisions: CONSENT_TYPES.some((key) => typeof preferences[key]?.granted === 'boolean'),
  };
}

function createCrmSyncClient({ apiUrl, token, fetchImpl = globalThis.fetch, timeoutMs = 3000 } = {}) {
  const baseUrl = String(apiUrl || '').trim().replace(/\/$/, '');
  const secret = String(token || '').trim();
  const configured = Boolean(baseUrl && secret && typeof fetchImpl === 'function');
  return {
    configured,
    async sync(payload) {
      if (!configured) throw new Error('crm_sync_not_configured');
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), Math.max(250, timeoutMs));
      try {
        const response = await fetchImpl(`${baseUrl}/api/internal/leads/sync`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'X-DZHero-Sync-Token': secret,
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          const error = new Error(result.detail || `crm_sync_http_${response.status}`);
          error.status = response.status;
          throw error;
        }
        return result;
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

function createLatestSyncScheduler(worker) {
  const states = new Map();

  function start(key, payload, state) {
    const promise = Promise.resolve().then(() => worker(payload));
    state.running = promise;
    promise.catch(() => {}).finally(() => {
      if (state.pending) {
        const next = state.pending;
        state.pending = null;
        start(key, next, state);
        return;
      }
      state.running = null;
      states.delete(key);
      state.waiters.splice(0).forEach((resolve) => resolve());
    });
    return promise;
  }

  return {
    schedule(key, payload) {
      let state = states.get(key);
      if (!state) {
        state = { running: null, pending: null, waiters: [] };
        states.set(key, state);
      }
      if (state.running) {
        state.pending = payload;
        return Promise.resolve({ status: 'queued_latest' });
      }
      return start(key, payload, state);
    },
    pendingCount() {
      return Array.from(states.values()).filter((state) => state.pending).length;
    },
    idle(key) {
      const state = states.get(key);
      if (!state?.running) return Promise.resolve();
      return new Promise((resolve) => state.waiters.push(resolve));
    },
  };
}


module.exports = {
  CONSENT_TYPES,
  CONSENT_VERSION,
  buildLeadSyncPayload,
  createCrmSyncClient,
  createLatestSyncScheduler,
  isVerifiedGoogleUser,
  publicCommunicationPreferences,
  updateCommunicationPreferences,
};
