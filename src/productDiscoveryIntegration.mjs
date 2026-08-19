import {
  normalizeProductBrand,
  resolveActiveBrandId,
  upsertProductBrand,
} from './productSettingsState.mjs';

function cleanApiBase(value) {
  return String(value || '/api').replace(/\/$/, '');
}

function normalizeSavedUrlLanguage(value) {
  return String(value || '').trim().toLowerCase() === 'en' ? 'en' : 'uk';
}

export function getProductRefreshMessageStatus(status, code) {
  if (status === 'blocked' && code === 'automatic_daily_run_limit_reached') {
    return 'dailyLimit';
  }
  return status;
}

function workspaceRoute(apiBase, workspaceId, suffix) {
  return `${cleanApiBase(apiBase)}/workspaces/${encodeURIComponent(String(workspaceId || ''))}/${suffix}`;
}

function ownerSignalRoute(apiBase, signalId) {
  return `${cleanApiBase(apiBase)}/owner/signals/${encodeURIComponent(String(signalId || ''))}/exclude`;
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

    async loadSignals() {
      const response = await request('reels');
      const payload = await readPayload(response);
      if (!response.ok) throw new Error(payload.error || 'signals_reels_load_failed');
      return payload;
    },

    async loadSavedSignals() {
      const response = await request('saved-signals');
      const payload = await readPayload(response);
      if (!response.ok) throw new Error(payload.error || 'saved_signals_load_failed');
      return payload;
    },

    async loadSavedUrls() {
      const response = await request('saved-urls');
      const payload = await readPayload(response);
      if (!response.ok) throw new Error(payload.error || 'saved_urls_load_failed');
      return payload;
    },

    async saveUrl(url) {
      const response = await request('saved-urls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const payload = await readPayload(response);
      if (!response.ok) {
        const error = new Error(payload.error || 'saved_url_failed');
        error.code = payload.error || 'saved_url_failed';
        error.reason = payload.reason || '';
        error.status = response.status;
        throw error;
      }
      return payload;
    },

    async deleteSavedUrl(savedUrlId) {
      const response = await request(`saved-urls/${encodeURIComponent(String(savedUrlId || ''))}`, {
        method: 'DELETE',
      });
      const payload = await readPayload(response);
      if (!response.ok) {
        const error = new Error(payload.error || 'saved_url_delete_failed');
        error.code = payload.error || 'saved_url_delete_failed';
        error.payload = payload;
        error.status = response.status;
        throw error;
      }
      return payload;
    },

    async loadSavedUrlAdaptation(savedUrlId, language = 'uk') {
      const analysisLanguage = normalizeSavedUrlLanguage(language);
      const response = await request(`saved-urls/${encodeURIComponent(String(savedUrlId || ''))}/adaptation?language=${analysisLanguage}`);
      const payload = await readPayload(response);
      if (!response.ok) {
        const error = new Error(payload.error || 'saved_url_adaptation_load_failed');
        error.code = payload.error || 'saved_url_adaptation_load_failed';
        error.payload = payload;
        error.status = response.status;
        throw error;
      }
      return payload;
    },

    async analyzeAdaptSavedUrl(savedUrlId, language = 'uk') {
      const analysisLanguage = normalizeSavedUrlLanguage(language);
      const response = await request(`saved-urls/${encodeURIComponent(String(savedUrlId || ''))}/analyze-adapt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: analysisLanguage }),
      });
      const payload = await readPayload(response);
      if (!response.ok) {
        const error = new Error(payload.error || 'saved_url_adaptation_generate_failed');
        error.code = payload.error || 'saved_url_adaptation_generate_failed';
        error.payload = payload;
        error.status = response.status;
        throw error;
      }
      return payload;
    },

    async saveSignal(signalId) {
      const response = await request(`saved-signals/${encodeURIComponent(String(signalId || ''))}`, {
        method: 'PUT',
      });
      const payload = await readPayload(response);
      if (!response.ok) throw new Error(payload.error || 'saved_signal_failed');
      return payload;
    },

    async unsaveSignal(signalId) {
      const response = await request(`saved-signals/${encodeURIComponent(String(signalId || ''))}`, {
        method: 'DELETE',
      });
      const payload = await readPayload(response);
      if (!response.ok) throw new Error(payload.error || 'unsave_signal_failed');
      return payload;
    },

    async loadAdaptation(signalId, { targetLanguage = '' } = {}) {
      const languageQuery = targetLanguage ? `?targetLanguage=${encodeURIComponent(String(targetLanguage))}` : '';
      const response = await request(`adaptations/${encodeURIComponent(String(signalId || ''))}${languageQuery}`);
      const payload = await readPayload(response);
      if (!response.ok) {
        const error = new Error(payload.error || 'workspace_adaptation_load_failed');
        error.code = payload.error || 'workspace_adaptation_load_failed';
        error.payload = payload;
        error.status = response.status;
        throw error;
      }
      return payload;
    },

    async generateAdaptation(signalId, { targetLanguage = '' } = {}) {
      const response = await request(`adaptations/${encodeURIComponent(String(signalId || ''))}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        ...(targetLanguage ? { body: JSON.stringify({ targetLanguage }) } : {}),
      });
      const payload = await readPayload(response);
      if (!response.ok) {
        const error = new Error(payload.error || 'workspace_adaptation_generate_failed');
        error.code = payload.error || 'workspace_adaptation_generate_failed';
        error.payload = payload;
        error.status = response.status;
        throw error;
      }
      return payload;
    },

    async loadContentPlan() {
      const response = await request('content-plan?surface=product_redesign');
      const payload = await readPayload(response);
      if (!response.ok) {
        const error = new Error(payload.error || 'content_plan_load_failed');
        error.code = payload.error || 'content_plan_load_failed';
        error.payload = payload;
        error.status = response.status;
        throw error;
      }
      return payload;
    },

    async createContentPlanPost(post) {
      const response = await request('content-plan/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post }),
      });
      const payload = await readPayload(response);
      if (!response.ok) {
        const error = new Error(payload.error || 'content_plan_post_create_failed');
        error.code = payload.error || 'content_plan_post_create_failed';
        error.payload = payload;
        error.status = response.status;
        throw error;
      }
      return payload;
    },

    async updateContentPlanPost(postId, post) {
      const response = await request(`content-plan/posts/${encodeURIComponent(String(postId || ''))}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post }),
      });
      const payload = await readPayload(response);
      if (!response.ok) {
        const error = new Error(payload.error || 'content_plan_post_update_failed');
        error.code = payload.error || 'content_plan_post_update_failed';
        error.payload = payload;
        error.status = response.status;
        throw error;
      }
      return payload;
    },

    async deleteContentPlanPost(postId) {
      const response = await request(`content-plan/posts/${encodeURIComponent(String(postId || ''))}`, {
        method: 'DELETE',
      });
      const payload = await readPayload(response);
      if (!response.ok) {
        const error = new Error(payload.error || 'content_plan_post_delete_failed');
        error.code = payload.error || 'content_plan_post_delete_failed';
        error.payload = payload;
        error.status = response.status;
        throw error;
      }
      return payload;
    },

    async excludeSignal({ signalId, reasonCode } = {}) {
      const response = await fetcher(ownerSignalRoute(apiBase, signalId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reasonCode }),
      });
      const payload = await readPayload(response);
      if (!response.ok) throw new Error(payload.error || 'owner_signal_exclusion_failed');
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
