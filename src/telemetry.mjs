export const TRACKER_URL = 'https://crmdzhero-production.up.railway.app/static/dzhero-tracker.v1.3.0.min.js';
export const TRACKER_INTEGRITY = 'sha384-QN3eJBX5Fi2HH/RS9Mqgfnlyd6zQeTXfdI3jmDent/EJEy1ZXL8cIgS9a6w62nfg';


const viteEnv = import.meta.env || {};
const productionEnabled = Boolean(
  viteEnv.PROD && viteEnv.VITE_DZHERO_CRM_ENABLED !== 'false',
);


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
    identify(user) {
      return invoke('dzheroIdentify', [user]);
    },
    authSuccess(user) {
      return invoke('dzheroAuthSuccess', [user]);
    },
    logout() {
      return invoke('dzheroAuthLogout', []);
    },
  };
}


export const telemetry = createTelemetry();
