'use strict';

const fs = require('node:fs');

globalThis.fetch = async function blockedControlledLiveRunFetch(input) {
  const target = String(process.env.CONTROLLED_LIVE_RUN_PROVIDER_CALLS_PATH || '').trim();
  if (target) {
    let url = '';
    try {
      url = new URL(typeof input === 'string' ? input : input?.url || '').origin;
    } catch {
      url = 'invalid';
    }
    fs.appendFileSync(target, `${JSON.stringify({ kind: 'network_attempt', origin: url })}\n`, 'utf8');
  }
  throw new Error('controlled_live_run_external_network_blocked');
};
