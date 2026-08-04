import {
  normalizeProductBrand,
  resolveActiveBrandId,
  upsertProductBrand,
} from './productSettingsState.mjs';

function cleanApiBase(value) {
  return String(value || '/api').replace(/\/$/, '');
}

function workspaceRoute(apiBase, workspaceId, suffix) {
  return `${cleanApiBase(apiBase)}/workspaces/${encodeURIComponent(String(workspaceId || ''))}/${suffix}`;
}

async function readPayload(response) {
  return response?.json?.().catch(() => ({})) || {};
}

function classifyBlockedStatus(response, payload = {}) {
  const code = String(payload.error || 'automatic_discovery_blocked');
  if ([409, 422, 429, 501, 503].includes(Number(response?.status))) {
    return { status: 'blocked', code, payload };
  }
  return { status: 'error', code, payload };
}

export function mergeRestoredProductBrand(brands, backendBrand) {
  const restored = normalizeProductBrand(backendBrand);
  const current = Array.isArray(brands) ? brands : [];
  if (!restored) {
    return {
      brands: current,
      activeBrandId: resolveActiveBrandId(current),
      restored: null,
    };
  }
  const merged = upsertProductBrand(current, restored);
  return {
    brands: merged,
    activeBrandId: restored.id,
    restored,
  };
}

export function getActiveProductBrand(brands, activeBrandId) {
  const resolved = resolveActiveBrandId(brands, activeBrandId);
  return (Array.isArray(brands) ? brands : []).find((brand) => brand.id === resolved) || null;
}

export function createProductDiscoveryClient({
  apiBase = '/api',
  workspaceId,
  fetcher = globalThis.fetch,
} = {}) {
  let refreshPromise = null;

  const request = (suffix, options) => fetcher(
    workspaceRoute(apiBase, workspaceId, suffix),
    options,
  );

  return {
    async loadBrand() {
      const response = await request('agent/context');
      const payload = await readPayload(response);
      if (!response.ok) throw new Error(payload.error || 'product_brand_brain_load_failed');
      return payload.productBrand || null;
    },

    async saveBrand(brand) {
      const normalized = normalizeProductBrand(brand);
      if (!normalized) throw new Error('product_brand_brain_invalid');
      const response = await request('agent/context/redesign', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand: normalized }),
      });
      const payload = await readPayload(response);
      if (!response.ok) throw new Error(payload.error || 'product_brand_brain_save_failed');
      return payload;
    },

    refreshBank({ activeBrandId } = {}) {
      if (refreshPromise) return refreshPromise;
      refreshPromise = (async () => {
        try {
          const response = await request('signals/discovery/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              surface: 'product_redesign',
              activeBrandId: String(activeBrandId || ''),
            }),
          });
          const payload = await readPayload(response);
          if (!response.ok) return classifyBlockedStatus(response, payload);
          const run = payload?.run || {};
          const errorCount = Number(run.errorCount ?? payload.errorCount ?? 0);
          const acceptedCount = Number(payload.acceptedSignals ?? run.acceptedCount ?? 0);
          const qualityGateTechnicalFailure = Array.isArray(run.errors)
            && run.errors.some((error) => error?.lane === 'quality_gate');
          const completedWithTechnicalFailure = run.status === 'completed'
            && errorCount > 0
            && acceptedCount === 0
            && (run.classifiedFailure?.stage === 'quality_gate'
              || run.auditTrace?.failure?.stage === 'quality_gate'
              || qualityGateTechnicalFailure);
          if (run.status === 'failed' || completedWithTechnicalFailure) {
            return {
              status: 'error',
              code: run.classifiedFailure?.code || 'automatic_discovery_run_failed',
              retryable: true,
              payload,
            };
          }

          const reelsResponse = await request('reels');
          const reelsPayload = await readPayload(reelsResponse);
          if (!reelsResponse.ok) {
            return {
              status: 'error',
              code: reelsPayload.error || 'signals_reels_refresh_failed',
              payload: reelsPayload,
            };
          }
          const changedCount = Number(payload.acceptedSignals || 0) + Number(payload.updatedSignals || 0);
          return {
            status: changedCount > 0 ? 'success' : 'empty',
            code: changedCount > 0 ? 'automatic_discovery_completed' : 'automatic_discovery_empty',
            payload,
            reels: Array.isArray(reelsPayload.reels) ? reelsPayload.reels : [],
          };
        } catch (error) {
          return {
            status: 'error',
            code: error?.message || 'automatic_discovery_run_failed',
            payload: null,
          };
        } finally {
          refreshPromise = null;
        }
      })();
      return refreshPromise;
    },
  };
}
