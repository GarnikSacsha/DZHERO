export const TRACKER_URL = 'https://crmdzhero-production.up.railway.app/static/dzhero-tracker.v1.3.0.min.js';
export const TRACKER_INTEGRITY = 'sha384-QN3eJBX5Fi2HH/RS9Mqgfnlyd6zQeTXfdI3jmDent/EJEy1ZXL8cIgS9a6w62nfg';


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


export function syncTelemetryIdentity({
  user,
  telemetryClient = telemetry,
  windowRef = globalThis.window,
} = {}) {
  if (!user || user.provider !== 'google' || !user.email || !user.id || !windowRef) return;
  const lead = {
    email: user.email,
    google_id: user.id,
    full_name: user.name,
    avatar_url: user.avatarUrl,
  };
  try {
    const params = new URLSearchParams(windowRef.location.search);
    if (params.get('auth') !== 'google') {
      telemetryClient.identify(lead);
      return;
    }

    const eventId = `google_login:${user.id}:${user.lastLoginAt || 'current'}`;
    const storageKey = `dzhero_crm_${eventId}`;
    if (windowRef.sessionStorage?.getItem(storageKey)) {
      telemetryClient.identify(lead);
    } else {
      telemetryClient.authSuccess({ ...lead, event_id: eventId });
      windowRef.sessionStorage?.setItem(storageKey, '1');
    }

    params.delete('auth');
    const query = params.toString();
    const nextUrl = `${windowRef.location.pathname}${query ? `?${query}` : ''}${windowRef.location.hash || ''}`;
    windowRef.history?.replaceState(windowRef.history.state, '', nextUrl);
  } catch {
    // Identity telemetry must never interrupt authentication.
  }
}
