export const TRACKER_URL = 'https://crmdzhero-production.up.railway.app/static/dzhero-tracker.v1.4.0.min.js';
export const TRACKER_INTEGRITY = 'sha384-afTAN1iK3sOdUC+yM3cZ01ZgUXOtEPnUl/4DHQtkhjY63tlo2M6mAEj0j63UKc7e';


const viteEnv = import.meta.env || {};
export function shouldEnableTelemetry({ env = viteEnv, hostname = globalThis.location?.hostname } = {}) {
  return Boolean(
    env.PROD
    && env.VITE_DZHERO_CRM_ENABLED !== 'false'
    && ['dzhero.com.ua', 'www.dzhero.com.ua'].includes(hostname),
  );
}


const productionEnabled = shouldEnableTelemetry();


export function createTelemetry({
  windowRef = globalThis.window,
  documentRef = globalThis.document,
  enabled = productionEnabled,
  trackerUrl = TRACKER_URL,
  integrity = TRACKER_INTEGRITY,
  maxQueue = 32,
} = {}) {
  let state = enabled ? 'idle' : 'disabled';
  const queue = [];

  const invoke = (globalName, args) => {
    if (state === 'disabled' || state === 'failed') return undefined;
    const method = windowRef?.[globalName];
    if (typeof method === 'function') {
      try {
        return method(...args);
      } catch {
        return undefined;
      }
    }
    if (state === 'idle' || state === 'loading') {
      queue.push([globalName, args]);
      if (queue.length > maxQueue) queue.shift();
    }
    return undefined;
  };

  const flush = () => {
    state = 'ready';
    queue.splice(0).forEach(([globalName, args]) => {
      try {
        windowRef?.[globalName]?.(...args);
      } catch {
        // Analytics must never interrupt the product.
      }
    });
  };

  return {
    load() {
      if (state !== 'idle' || !documentRef?.head) return;
      state = 'loading';
      const script = documentRef.createElement('script');
      script.src = trackerUrl;
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.integrity = integrity;
      script.referrerPolicy = 'strict-origin-when-cross-origin';
      script.dataset.site = 'dzhero.com.ua';
      script.onload = flush;
      script.onerror = () => {
        state = 'failed';
        queue.length = 0;
      };
      documentRef.head.appendChild(script);
    },
    track(eventType, elementId, options) {
      return invoke('dzheroTrack', [eventType, elementId, options]);
    },
    pageView(routeId) {
      return invoke('dzheroPageView', [routeId]);
    },
    getVisitorId() {
      const method = windowRef?.dzheroGetVisitorId;
      if (typeof method !== 'function') return undefined;
      try { return method(); } catch { return undefined; }
    },
  };
}


export const telemetry = createTelemetry();


export async function syncCrmSession({
  user,
  telemetryClient = telemetry,
  windowRef = globalThis.window,
  fetcher = globalThis.fetch,
  apiBase = '/api',
} = {}) {
  if (!user || user.provider !== 'google' || !windowRef || typeof fetcher !== 'function') return;
  try {
    const params = new URLSearchParams(windowRef.location.search);
    const body = {};
    const visitorId = telemetryClient.getVisitorId?.();
    if (visitorId) body.visitor_id = visitorId;
    for (const key of ['utm_source', 'utm_medium', 'utm_campaign']) {
      const value = params.get(key);
      if (value) body[key] = value.slice(0, 100);
    }
    const base = String(apiBase || '/api').replace(/\/$/, '');
    await fetcher(`${base}/account/crm-sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    params.delete('auth');
    const query = params.toString();
    const nextUrl = `${windowRef.location.pathname}${query ? `?${query}` : ''}${windowRef.location.hash || ''}`;
    windowRef.history?.replaceState(windowRef.history.state, '', nextUrl);
  } catch {
    // CRM synchronization must never interrupt authentication or product access.
  }
}
