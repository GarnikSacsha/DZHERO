const assert = require('node:assert/strict');
const { reserveUsageCounter } = require('../backend/services/paidUsage.cjs');

process.env.GEMINI_API_KEY = 'test-key';
const { generateAgentReply } = require('../backend/services/agentEngine.js');

async function main() {
  const originalFetch = global.fetch;
  const db = { usageCounters: [] };
  let providerCalls = 0;
  global.fetch = async () => {
    providerCalls += 1;
    return {
      ok: false,
      status: 503,
      json: async () => ({ error: { message: 'simulated provider failure' } }),
    };
  };

  try {
    await assert.rejects(() => generateAgentReply({
      message: 'Test failed paid attempt',
      workspace: { brief: {} },
      snapshot: {},
      beforeProviderAttempt: async () => {
        reserveUsageCounter(db, {
          workspaceId: 'ws_tester',
          metric: 'ai_operations',
          period: '2026-07',
          limit: 50,
        });
      },
    }), /simulated provider failure/);
    assert.equal(providerCalls, 1);
    assert.equal(db.usageCounters[0].value, 1);
    console.log('agent paid-attempt hook tests passed');
  } finally {
    global.fetch = originalFetch;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
