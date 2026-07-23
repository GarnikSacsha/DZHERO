import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';


const require = createRequire(import.meta.url);
const { buildLeadSyncPayload } = require('../backend/services/crmSync.cjs');
const fixture = JSON.parse(await readFile(new URL('./fixtures/trusted-sync-request.json', import.meta.url), 'utf8'));
const decisions = Object.fromEntries(fixture.consents.map((item) => [item.consent_type, {
  granted: item.granted,
  consentVersion: item.consent_version,
  locale: item.locale,
  source: item.source,
  recordedAt: item.recorded_at,
}]));
const payload = buildLeadSyncPayload({
  user: {
    id: fixture.external_user_id,
    oauthSubject: fixture.google_id,
    email: fixture.email,
    name: fixture.full_name,
    avatarUrl: fixture.avatar_url,
    authProvider: 'google',
    oauthProviders: ['google'],
    communicationPreferences: decisions,
  },
  visitorId: fixture.visitor_id,
  attribution: { utm_source: fixture.utm_source, utm_medium: fixture.utm_medium, utm_campaign: fixture.utm_campaign },
  idempotencyKey: fixture.idempotency_key,
});

assert.deepEqual(payload, fixture);
console.log('cross-repository CRM fixture contract passed');
