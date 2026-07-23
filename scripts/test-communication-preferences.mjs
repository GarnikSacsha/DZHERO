import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';


const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const component = read('../src/CommunicationPreferences.jsx');
const main = read('../src/main.jsx');

for (const consent of ['product_updates', 'early_bird_offers', 'research_invites']) {
  assert.ok(component.includes(consent), consent);
}
assert.ok(component.includes('/account/communication-preferences'));
assert.ok(component.includes("method: 'PUT'"));
assert.ok(component.includes("source: mode === 'prompt' ? 'first_login_prompt' : 'settings'"));
assert.ok(component.includes("href=\"/privacy\""));
assert.ok(component.includes('Skip for now'));
assert.equal(component.includes('type="email"'), false);
assert.ok(main.includes("import CommunicationPreferences from './CommunicationPreferences.jsx'"));
assert.ok(main.includes("['communications'"));
assert.ok(main.includes('mode="prompt"'));
assert.ok(main.includes('mode="settings"'));
console.log('communication preferences UI contract passed');
