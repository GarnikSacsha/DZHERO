const fs = require('node:fs');
const path = require('node:path');

function loadLocalEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  for (const row of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = row.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

async function main() {
  loadLocalEnv();
  const { createOpenAIAgentRunner } = require('../backend/services/agentStudioAgents.cjs');
  const model = process.env.OPENAI_AGENT_MODEL || 'gpt-5.6';
  const runAgent = createOpenAIAgentRunner({ maxTurns: 2, timeoutMs: 45000 });
  const result = await runAgent({
    agentId: 'trend_analyst',
    groupId: `smoke_${Date.now()}`,
    input: {
      objective: 'Choose one practical, low-budget short-form content mechanic for a neighborhood coffee shop.',
      signals: [
        {
          title: 'Quiet setup followed by a fast sensory coffee reveal',
          sourceUrl: 'https://example.com/reel/coffee-reveal',
          summary: 'Phone-shot counter scene with a calm opening and fast espresso reveal.',
        },
      ],
    },
  });
  console.log(JSON.stringify({ ok: true, model, outputValidated: Boolean(result?.title && result?.rationale) }));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    code: error?.code || 'openai_smoke_failed',
    status: error?.status || error?.response?.status || null,
    message: String(error?.message || 'OpenAI smoke check failed').slice(0, 300),
  }));
  process.exitCode = 1;
});
