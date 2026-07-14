import { chromium } from 'playwright';
import { performance } from 'node:perf_hooks';

const BASE_URL = process.env.STRESS_BASE_URL || 'https://dzhero.com.ua';
const USERS = Number(process.env.STRESS_USERS || 10);
const RUN_ID = process.env.STRESS_RUN_ID || new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const HEADLESS = process.env.STRESS_HEADLESS !== 'false';
const ENABLE_AI = process.env.STRESS_ENABLE_AI === 'true';
const ENABLE_APIFY = process.env.STRESS_ENABLE_APIFY === 'true';
const AI_CALLS = Math.min(Number(process.env.STRESS_AI_CALLS || 2), USERS);
const APIFY_CALLS = Math.min(Number(process.env.STRESS_APIFY_CALLS || 1), USERS);
const AUTH_STAGGER_MS = Number(process.env.STRESS_AUTH_STAGGER_MS || 0);
const PREAUTH_ALL = process.env.STRESS_PREAUTH_ALL === 'true';

const metrics = [];

function endpointName(url) {
  return String(url)
    .replace(BASE_URL, '')
    .replace(/\/workspaces\/[^/]+/g, '/workspaces/:workspaceId')
    .replace(/\/ideas\/[^/]+/g, '/ideas/:ideaId')
    .replace(/\?.*$/, '');
}

async function timed(label, task) {
  const startedAt = performance.now();
  try {
    const result = await task();
    const durationMs = Math.round(performance.now() - startedAt);
    metrics.push({ label, durationMs, ok: true });
    return result;
  } catch (error) {
    const durationMs = Math.round(performance.now() - startedAt);
    metrics.push({ label, durationMs, ok: false, error: error.message });
    throw error;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkedJson(page, method, path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const startedAt = performance.now();
  const responsePayload = await page.evaluate(
    async ({ url: requestUrl, method: requestMethod, data, timeout }) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      try {
        const response = await fetch(requestUrl, {
          method: requestMethod.toUpperCase(),
          credentials: 'include',
          headers: data === undefined ? {} : { 'Content-Type': 'application/json' },
          body: data === undefined ? undefined : JSON.stringify(data),
          signal: controller.signal,
        });
        const text = await response.text();
        return {
          ok: response.ok,
          status: response.status,
          text,
        };
      } finally {
        clearTimeout(timeoutId);
      }
    },
    { url, method, data: options.data, timeout: options.timeout || 60000 }
  );
  const durationMs = Math.round(performance.now() - startedAt);
  const text = responsePayload.text;
  const status = responsePayload.status;
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 500) };
  }
  metrics.push({
    label: `${method.toUpperCase()} ${endpointName(url)}`,
    durationMs,
    ok: responsePayload.ok,
    status,
    error: responsePayload.ok ? '' : json?.error || json?.message || text.slice(0, 160),
  });
  if (!responsePayload.ok) {
    throw new Error(`${method.toUpperCase()} ${path} -> ${status}: ${json?.error || json?.message || text.slice(0, 160)}`);
  }
  return json;
}

function makeBrief(userIndex) {
  return {
    businessType: 'Stress test local service',
    product: `Test product ${RUN_ID}-${userIndex}`,
    audience: 'Small Ukrainian business owners',
    toneOfVoice: 'clear, practical, calm',
    contentFocus: 'short-form educational content',
    cta: 'Book a consultation',
    stopTopics: ['politics', 'medical claims'],
  };
}

function makeContentPlan(userIndex) {
  return {
    posts: [
      {
        id: `stress_post_${RUN_ID}_${userIndex}`,
        day: 'Mon',
        format: 'Reels',
        status: 'draft',
        title: `Stress plan ${RUN_ID}-${userIndex}`,
        hook: 'One small workflow that saves an hour today',
        script: 'Show before, show after, explain the one repeatable step.',
        cta: 'Save this and test it tomorrow.',
      },
    ],
  };
}

function makeGlobalInsight(userIndex) {
  return {
    id: `stress_signal_${RUN_ID}_${userIndex}`,
    title: 'Tiny workflow turns one idea into five content angles',
    source: 'stress-test',
    market: 'global',
    score: 82,
    hook: 'Stop making content from a blank page.',
    mechanic: 'Show a before state, apply one simple system, reveal multiple useful outputs.',
    whyItWorks: 'The viewer sees a fast practical transformation.',
  };
}

async function prepareVirtualUser(browser, userIndex) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) {
      errors.push(`console.${message.type()}: ${message.text().slice(0, 180)}`);
    }
  });

  const email = `stress+${RUN_ID}-${userIndex}@dzhero.test`;
  const result = {
    userIndex,
    email,
    workspaceId: '',
    errors,
    ok: false,
  };

  try {
    await timed(`UI ${userIndex} load /`, async () => {
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForLoadState('networkidle', { timeout: 45000 }).catch(() => {});
    });

    if (AUTH_STAGGER_MS > 0) {
      await sleep(AUTH_STAGGER_MS * (userIndex - 1));
    }

    const auth = await checkedJson(page, 'post', '/api/auth/register', {
      data: {
        name: `Stress User ${userIndex}`,
        email,
        password: `stress-${RUN_ID}-${userIndex}`,
      },
    });
    if (!auth?.user?.workspaceId) throw new Error('auth response did not include workspaceId');
    result.workspaceId = auth.user.workspaceId;
    return { context, page, result };
  } catch (error) {
    result.errors.push(error.message);
    await context.close().catch(() => {});
    return { context: null, page: null, result };
  }
}

async function exercisePreparedVirtualUser(prepared) {
  const { context, page, result } = prepared;
  if (!context || !page) return result;
  const userIndex = result.userIndex;
  try {
    const me = await checkedJson(page, 'get', '/api/auth/me');
    if (me?.user?.email !== result.email) throw new Error(`auth/me returned unexpected email ${me?.user?.email}`);

    const workspaces = await checkedJson(page, 'get', '/api/workspaces');
    if (!workspaces?.workspaces?.some((workspace) => workspace.id === result.workspaceId)) {
      throw new Error('created workspace is not visible in /api/workspaces');
    }

    await Promise.all([
      checkedJson(page, 'get', `/api/workspaces/${result.workspaceId}/billing`),
      checkedJson(page, 'get', `/api/workspaces/${result.workspaceId}/reels`),
      checkedJson(page, 'get', `/api/workspaces/${result.workspaceId}/content-plan`),
      checkedJson(page, 'get', `/api/workspaces/${result.workspaceId}/agent/context`),
      checkedJson(page, 'get', `/api/workspaces/${result.workspaceId}/sources`),
    ]);

    await checkedJson(page, 'put', `/api/workspaces/${result.workspaceId}/agent/context`, {
      data: makeBrief(userIndex),
    });
    await checkedJson(page, 'put', `/api/workspaces/${result.workspaceId}/content-plan`, {
      data: makeContentPlan(userIndex),
    });
    await checkedJson(page, 'post', `/api/workspaces/${result.workspaceId}/ideas`, {
      data: {
        title: `Stress idea ${RUN_ID}-${userIndex}`,
        source: 'stress-test',
        description: 'A lightweight concurrent write generated during production stress testing.',
      },
    });

    const [savedContext, savedPlan, savedIdeas] = await Promise.all([
      checkedJson(page, 'get', `/api/workspaces/${result.workspaceId}/agent/context`),
      checkedJson(page, 'get', `/api/workspaces/${result.workspaceId}/content-plan`),
      checkedJson(page, 'get', `/api/workspaces/${result.workspaceId}/ideas`),
    ]);
    if (savedContext?.brief?.product !== makeBrief(userIndex).product) {
      throw new Error('saved Brand Brain context was not persisted');
    }
    if (!savedPlan?.posts?.some((post) => post.id === `stress_post_${RUN_ID}_${userIndex}`)) {
      throw new Error('saved content plan post was not persisted');
    }
    if (!savedIdeas?.ideas?.some((idea) => idea.title === `Stress idea ${RUN_ID}-${userIndex}`)) {
      throw new Error('saved idea was not persisted');
    }

    await timed(`UI ${userIndex} reload authenticated app`, async () => {
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForLoadState('networkidle', { timeout: 45000 }).catch(() => {});
    });

    if (ENABLE_AI && userIndex <= AI_CALLS) {
      await checkedJson(page, 'post', `/api/workspaces/${result.workspaceId}/agent/chat`, {
        timeout: 90000,
        data: { message: 'Give me one short practical content idea for tomorrow. Keep it brief.' },
      });
      await checkedJson(page, 'post', `/api/workspaces/${result.workspaceId}/remix/generate`, {
        timeout: 90000,
        data: {
          globalInsight: makeGlobalInsight(userIndex),
          businessBrief: makeBrief(userIndex),
        },
      });
    }

    if (ENABLE_APIFY && userIndex <= APIFY_CALLS) {
      await checkedJson(page, 'post', `/api/workspaces/${result.workspaceId}/signals/apify/import`, {
        timeout: 180000,
        data: {
          platform: 'tiktok',
          inputType: 'search',
          inputValue: 'small business marketing',
          limit: 1,
          downloadVideo: false,
          market: 'global',
        },
      });
    }

    result.ok = true;
    return result;
  } catch (error) {
    result.errors.push(error.message);
    return result;
  } finally {
    await context.close().catch(() => {});
  }
}

async function runVirtualUser(browser, userIndex) {
  return exercisePreparedVirtualUser(await prepareVirtualUser(browser, userIndex));
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
}

function summarize(results, totalDurationMs) {
  const durations = metrics.map((metric) => metric.durationMs);
  const failedMetrics = metrics.filter((metric) => !metric.ok);
  const byStatus = new Map();
  const byLabel = new Map();
  for (const metric of metrics) {
    if (metric.status) byStatus.set(metric.status, (byStatus.get(metric.status) || 0) + 1);
    const current = byLabel.get(metric.label) || { count: 0, failures: 0, durations: [] };
    current.count += 1;
    if (!metric.ok) current.failures += 1;
    current.durations.push(metric.durationMs);
    byLabel.set(metric.label, current);
  }

  return {
    baseUrl: BASE_URL,
    runId: RUN_ID,
    users: USERS,
    enableAi: ENABLE_AI,
    enableApify: ENABLE_APIFY,
    authStaggerMs: AUTH_STAGGER_MS,
    preauthAll: PREAUTH_ALL,
    totalDurationMs: Math.round(totalDurationMs),
    successfulUsers: results.filter((result) => result.ok).length,
    failedUsers: results.filter((result) => !result.ok).length,
    requests: metrics.length,
    failedRequests: failedMetrics.length,
    latency: {
      p50: percentile(durations, 50),
      p95: percentile(durations, 95),
      max: durations.length ? Math.max(...durations) : 0,
    },
    statusCounts: Object.fromEntries([...byStatus.entries()].sort((a, b) => Number(a[0]) - Number(b[0]))),
    endpoints: Object.fromEntries([...byLabel.entries()].map(([label, value]) => [label, {
      count: value.count,
      failures: value.failures,
      p95: percentile(value.durations, 95),
      max: Math.max(...value.durations),
    }])),
    userErrors: results
      .filter((result) => result.errors.length)
      .map((result) => ({ userIndex: result.userIndex, email: result.email, workspaceId: result.workspaceId, errors: result.errors })),
    requestErrors: failedMetrics.map((metric) => ({
      label: metric.label,
      status: metric.status || null,
      durationMs: metric.durationMs,
      error: metric.error,
    })),
  };
}

const startedAt = performance.now();
const browser = await chromium.launch({ headless: HEADLESS });
try {
  let results;
  if (PREAUTH_ALL) {
    const prepared = [];
    for (let index = 0; index < USERS; index += 1) {
      prepared.push(await prepareVirtualUser(browser, index + 1));
    }
    results = await Promise.all(prepared.map((user) => exercisePreparedVirtualUser(user)));
  } else {
    results = await Promise.all(
      Array.from({ length: USERS }, (_, index) => runVirtualUser(browser, index + 1))
    );
  }
  const summary = summarize(results, performance.now() - startedAt);
  console.log(JSON.stringify(summary, null, 2));
  if (summary.failedUsers || summary.failedRequests) {
    process.exitCode = 1;
  }
} finally {
  await browser.close().catch(() => {});
}
