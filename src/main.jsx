import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Shepherd from 'shepherd.js';
import 'shepherd.js/dist/css/shepherd.css';
import {
  BarChart3,
  Bot,
  BriefcaseBusiness,
  Calculator,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  CircleCheck,
  ClipboardList,
  Copy,
  Database,
  Download,
  Filter,
  Flame,
  Gauge,
  Globe2,
  Home,
  Link2,
  Lightbulb,
  LogOut,
  Menu,
  MessageSquareText,
  Moon,
  MoreHorizontal,
  Pencil,
  Plus,
  Radio,
  RefreshCw,
  Rocket,
  Search,
  Send,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Sun,
  Target,
  UsersRound,
  Video,
  Wand2,
  X,
} from 'lucide-react';
import './styles.css';
import logoImg from './logo-mark.svg';
import TesterAccessPanel from './TesterAccessPanel.jsx';
import AgentStudioPage from './AgentStudioPage.jsx';
import { fetchProducerSnapshot } from './data/uaMarket';
import { buildBrandBrainDraft } from './brandBrain.mjs';
import { getYouTubeCategoryId, YOUTUBE_POPULAR_CATEGORIES } from './youtubeCategories.mjs';
import { sanitizeSourceContext } from './sourceContext.mjs';
import {
  deriveDiscoveryRunNotice,
  deriveDiscoveryRunStatusCode,
  deriveDiscoveryToolbarStatus,
  canRunDiscoveryNow,
  deriveDiscoveryRunNowLabel,
  deriveSignalsEmptyState,
} from './signalsUiState.mjs';
import { I18nProvider, useI18n } from './i18nProvider.mjs';
import { createLocalizedElement } from './renderI18n.mjs';
import { extractInterfaceErrorCode, localizeInterfaceError } from './interfaceErrors.mjs';
import {
  createWorkspaceRequestContext,
  isWorkspaceRequestCurrent,
} from './workspaceRequestGuard.mjs';
import {
  canonicalizeSignalUrl as canonicalizeFeedSignalUrl,
  compareSignalReels,
  getSignalSourceGroup,
  parseMetric,
} from './signalFeedUtils.mjs';
import {
  buildCalendarPostSourceKey,
  buildCalendarRemixScenario,
  buildEditableContentNote,
  buildReelForCalendarPost,
  buildStudioContentPlanDraft,
  isDuplicateContentPlanPost,
  mergeEditableNotes,
  normalizeContentIdentity,
  updateEditableNote,
} from './contentPlanUtils.mjs';
import {
  createRemixAutoRequest,
  shouldRunRemixAutoRequest,
} from './remixAutoGeneration.mjs';

React.createElement = createLocalizedElement;

const rawApiUrl = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
const isBrowser = typeof window !== 'undefined';
const isLocalPage = isBrowser && ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
const isLocalApiUrl = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?/i.test(rawApiUrl);
const API_URL = isLocalApiUrl && !isLocalPage ? '/api' : rawApiUrl;
const API_BASE = API_URL.endsWith('/api') ? API_URL : `${API_URL}/api`;
const LEGACY_AUTH_TOKEN_KEY = 'insta-producer-auth-token';
const WORKSPACE_KEY = 'dzhero-active-workspace';
const BRAND_SCAN_PENDING_KEY = 'dzhero-brand-scan-pending';
const JERYK_LOADING_MESSAGE = '__JERYK_LOADING__';
const SOURCES_TAB_KEY = 'dzhero-sources-tab';
const PRODUCT_TOUR_KEY = 'jero_tour_completed';
const PRODUCT_TOUR_VERSION = 'v5';
const CONTENT_FORMATS = ['Post', 'Reels', 'Shorts', 'Tik - Tok', 'Video', 'Stories'];
const CONTENT_FORMAT_ALIASES = {
  'short-form': 'Video',
  shortform: 'Video',
  reel: 'Reels',
  reels: 'Reels',
  story: 'Stories',
  stories: 'Stories',
  tiktok: 'Tik - Tok',
  'tik tok': 'Tik - Tok',
  'tik-tok': 'Tik - Tok',
  'tik - tok': 'Tik - Tok',
  shorts: 'Shorts',
  'youtube shorts': 'Shorts',
  youtube: 'Shorts',
  carousel: 'Post',
  email: 'Post',
  note: 'Post',
  post: 'Post',
  video: 'Video',
};
const THEME_MODE_KEY = 'insta-producer-theme-mode-v1';
const LEGACY_THEME_KEY = 'insta-producer-theme-v2';
const DAY_THEME_START_HOUR = 7;
const NIGHT_THEME_START_HOUR = 21;
const DEMO_WORKSPACES = [
  { id: 'ws_demo_ua', name: 'Demo Brand', handle: '@demo_brand', type: 'Базовий' },
  { id: 'ws_demo_cafe', name: 'Кафе Central', handle: '@central.cafe', type: 'Кафе' },
  { id: 'ws_demo_shop', name: 'Odessa Drop', handle: '@odessa.drop', type: 'Одяг' },
  { id: 'ws_demo_beauty', name: 'Beauty Room', handle: '@beauty.room', type: 'Beauty' },
  { id: 'ws_demo_expert', name: 'Expert Lab', handle: '@expert.lab', type: 'Експерт' },
];

function getAutoTheme(date = new Date()) {
  const hour = date.getHours();
  return hour >= NIGHT_THEME_START_HOUR || hour < DAY_THEME_START_HOUR ? 'dark' : 'light';
}

function getInitialThemeMode() {
  const savedMode = window.localStorage.getItem(THEME_MODE_KEY);
  if (['auto', 'dark', 'light'].includes(savedMode)) return savedMode;
  const legacyTheme = window.localStorage.getItem(LEGACY_THEME_KEY);
  if (['dark', 'light'].includes(legacyTheme)) return legacyTheme;
  return 'auto';
}

function getNextThemeMode(themeMode) {
  if (themeMode === 'auto') return 'dark';
  if (themeMode === 'dark') return 'light';
  return 'auto';
}

function getAuthHeaders(extraHeaders = {}) {
  return extraHeaders;
}

function authFetch(url, options = {}) {
  return fetch(url, {
    credentials: 'include',
    ...options,
    headers: getAuthHeaders(options.headers || {}),
  });
}

async function readApiError(response, fallback = 'unknown_error') {
  const payload = await response.json().catch(() => ({}));
  const fallbackCode = extractInterfaceErrorCode(fallback, 'unknown_error');
  return extractInterfaceErrorCode(payload, fallbackCode);
}

function JerykLoading({ title = 'Джерик думає', text = 'Збираю контекст і готую відповідь.', compact = false, feature = false }) {
  useI18n();
  const className = [
    'jeryk-loading',
    compact ? 'compact' : '',
    feature ? 'feature' : '',
  ].filter(Boolean).join(' ');
  return (
    <div className={className} aria-live="polite">
      <div className="jeryk-producer" aria-hidden="true">
        <div className="jeryk-producer-body">
          <span className="jeryk-producer-eye" />
          <span className="jeryk-producer-smile" />
          <span className="jeryk-producer-arm left" />
          <span className="jeryk-producer-arm right" />
          <span className="jeryk-producer-foot left" />
          <span className="jeryk-producer-foot right" />
        </div>
        <div className="jeryk-producer-cards">
          <span>ЦА</span>
          <span>Офер</span>
          <span>CTA</span>
        </div>
      </div>
      <div className="jeryk-loading-copy">
        <strong>{title}</strong>
        <p>{text}</p>
      </div>
      <span aria-hidden="true" />
    </div>
  );
}

function normalizeContentFormat(format, fallback = 'Post') {
  const clean = String(format || '').trim();
  if (CONTENT_FORMATS.includes(clean)) return clean;
  const normalized = clean.toLowerCase().replace(/\s+/g, ' ');
  return CONTENT_FORMAT_ALIASES[normalized] || fallback;
}

function getPublicPage() {
  const path = window.location.pathname.replace(/\/$/, '');
  return {
    '/privacy': 'privacy',
    '/terms': 'terms',
    '/data-deletion': 'dataDeletion',
  }[path] || null;
}

function getInitialAppPage() {
  return window.location.pathname.replace(/\/$/, '') === '/admin/dev-roadmap' ? 'roadmap' : 'home';
}

function PublicLegalPage({ page }) {
  const { t } = useI18n();
  const [deletionForm, setDeletionForm] = useState({ email: '', instagramHandle: '', reason: '' });
  const [deletionResult, setDeletionResult] = useState(null);
  const [deletionStatus, setDeletionStatus] = useState('');
  const submitDeletionRequest = async (event) => {
    event.preventDefault();
    setDeletionStatus('loading');
    setDeletionResult(null);
    try {
      const response = await fetch(`${API_BASE}/data-deletion/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(deletionForm),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || payload.error || 'request_failed');
      setDeletionResult(payload);
      setDeletionStatus('ready');
    } catch (err) {
      setDeletionResult({ error: localizeInterfaceError(err, t, 'errors.generic') });
      setDeletionStatus('error');
    }
  };
  const pages = {
    privacy: {
      title: 'Privacy Policy',
      subtitle: 'How Dzhero collects, uses, stores, and protects user and business data.',
      sections: [
        ['Who we are', 'Dzhero is a web-based AI workspace that helps marketers, creators, and small businesses analyze short-form content signals and prepare original content plans.'],
        ['Data we collect', 'Dzhero may collect account information such as name, email address, connected social account identifiers, profile information, profile links, avatar images, and account statistics when a user authorizes a supported platform such as TikTok, Google, Meta, Instagram, or YouTube. Users may also provide business briefs, source links, notes, content ideas, drafts, and workspace settings.'],
        ['TikTok data', 'When a user connects TikTok through Login Kit, Dzhero uses the approved permissions to identify the connected account, show profile context, and display profile statistics such as follower count, following count, likes count, and video count inside the user workspace. Dzhero does not sell TikTok data and does not post to TikTok or modify a TikTok account unless a user explicitly authorizes a future product feature for that purpose.'],
        ['How we use data', 'Dzhero uses data to provide the service, authenticate users, connect user-owned sources, analyze public and authorized content signals, generate content ideas, prepare scripts, build content plans, prevent abuse, enforce usage limits, and improve product reliability.'],
        ['AI processing', 'Dzhero may send user-provided briefs, source metadata, notes, and selected content context to AI service providers to generate drafts and recommendations. Users are responsible for reviewing AI output before publishing or using it externally.'],
        ['Sharing and service providers', 'Dzhero shares data only with service providers needed to operate the product, such as hosting, database, authentication, analytics, and AI infrastructure providers. Dzhero does not sell personal data.'],
        ['Security', 'Dzhero uses server-side storage for service credentials and access tokens, limits access to production secrets, and applies authentication and workspace access checks to protect user data.'],
        ['Retention and deletion', 'Dzhero keeps account, workspace, connected source, generated draft, and usage data while the account is active or as needed to provide the service. Users may request deletion of their account, connected account data, AI memory, and generated drafts through the data deletion page or support contact.'],
        ['Contact', 'For privacy, data access, or deletion requests, contact Dzhero support through the support channel provided in the app or submit a request at /data-deletion.'],
      ],
    },
    terms: {
      title: 'Terms of Service',
      subtitle: 'Rules for using Dzhero.',
      sections: [
        ['Use of service', 'Dzhero helps marketers, creators, businesses, and SMM teams analyze short-form content signals, prepare drafts, and organize content plans. Users remain responsible for the content they publish and for complying with applicable laws and platform rules.'],
        ['Account and access', 'Users must provide accurate account information and keep access to their account secure. Users may connect only accounts, websites, and sources they own or are authorized to use.'],
        ['Connected platforms', 'Some features use platform integrations such as TikTok Login Kit, Google, Meta, Instagram, and YouTube. Access to these integrations depends on the permissions granted by the user and by the platform. Dzhero uses connected platform data only to provide the requested workspace features.'],
        ['AI output', 'AI drafts are suggestions, not final legal, financial or professional advice. Human review is required before publishing or messaging customers.'],
        ['Content ownership', 'Users keep ownership of the business information, notes, briefs, and drafts they create in Dzhero. Users must not use Dzhero to copy third-party videos, audio, branding, private data, or protected creative assets without permission.'],
        ['Acceptable use', 'Users must not use Dzhero to break platform rules, scrape private data, impersonate others, distribute harmful content, or attempt to access accounts, workspaces, or systems without permission.'],
        ['Service availability', 'Dzhero may change, suspend, or discontinue features as the product evolves or as third-party platform requirements change. Dzhero is provided on an as-is basis to the extent permitted by law.'],
        ['Termination', 'Dzhero may limit or terminate access if a user violates these terms, misuses integrations, creates security risk, or uses the service in a way that may harm other users, Dzhero, or connected platforms.'],
      ],
    },
    dataDeletion: {
      title: 'Data Deletion Instructions',
      subtitle: 'How users can request deletion of Dzhero data.',
      sections: [
        ['Request deletion', 'A user can request deletion of their workspace, connected account data, AI memory, generated drafts, and stored sync records by submitting the form below or contacting Dzhero support.'],
        ['Disconnect platforms', 'Users can also remove Dzhero permissions from the settings of connected platforms such as TikTok, Google, Meta, Instagram, or YouTube. Disconnecting a platform may stop new data access, but users should still submit a deletion request if they want Dzhero to remove stored workspace data.'],
        ['Processing', 'After a verified deletion request, Dzhero removes account tokens, connected account records, workspace records, AI memory, generated drafts, and stored sync jobs associated with that user, unless retention is required by law or needed for security and abuse prevention.'],
      ],
    },
  };
  const content = pages[page];
  return (
    <main className="public-legal">
      <a className="public-brand" href="/">
        <span className="logo">D</span>
        <strong>Dzhero</strong>
      </a>
      <article>
        <small>Dzhero legal document</small>
        <h1>{content.title}</h1>
        <p>{content.subtitle}</p>
        {content.sections.map(([title, text]) => (
          <section key={title}>
            <h2>{title}</h2>
            <p>{text}</p>
          </section>
        ))}
        {page === 'dataDeletion' && (
          <form className="deletion-form" onSubmit={submitDeletionRequest}>
            <h2>Submit deletion request</h2>
            <label>
              <span>Email</span>
              <input value={deletionForm.email} onChange={(event) => setDeletionForm((current) => ({ ...current, email: event.target.value }))} placeholder="you@example.com" type="email" />
            </label>
            <label>
              <span>Instagram handle</span>
              <input value={deletionForm.instagramHandle} onChange={(event) => setDeletionForm((current) => ({ ...current, instagramHandle: event.target.value }))} placeholder="@username" />
            </label>
            <label>
              <span>Reason or details</span>
              <textarea value={deletionForm.reason} onChange={(event) => setDeletionForm((current) => ({ ...current, reason: event.target.value }))} placeholder="Tell us which account/workspace should be deleted." rows={4} />
            </label>
            <button className="dark" type="submit" disabled={deletionStatus === 'loading'}>{deletionStatus === 'loading' ? 'Submitting...' : 'Request deletion'}</button>
            {deletionResult && (
              <p className={deletionResult.error ? 'deletion-result error' : 'deletion-result'}>
                {deletionResult.error || `Request received. Confirmation code: ${deletionResult.confirmationCode}`}
              </p>
            )}
          </form>
        )}
      </article>
    </main>
  );
}

function getMobilePreviewUrl() {
  if (!isBrowser) return '';
  const url = new URL(window.location.href);
  const isMobilePreview = url.searchParams.get('mobile') === '1' || url.searchParams.get('preview') === 'mobile';
  if (!isMobilePreview) return '';
  url.searchParams.delete('mobile');
  url.searchParams.delete('preview');
  if (!url.searchParams.has('v')) url.searchParams.set('v', 'mobile-preview');
  return `${url.pathname}${url.search}${url.hash}`;
}

function MobilePreviewFrame({ src }) {
  useI18n();
  return (
    <main className="mobile-preview-page">
      <div className="mobile-preview-toolbar">
        <strong>Dzhero mobile preview</strong>
        <a href={src} target="_blank" rel="noreferrer">Відкрити без рамки</a>
      </div>
      <section className="mobile-preview-device" aria-label="Mobile preview">
        <iframe title="Dzhero mobile preview" src={src} />
      </section>
    </main>
  );
}

function App() {
  const { language, setLanguage, t, translateText } = useI18n();
  const [page, setPage] = useState(getInitialAppPage);
  const [market, setMarket] = useState('all');
  const [data, setData] = useState(null);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState('');
  const [remixDraft, setRemixDraft] = useState(null);
  const [remixAutoRequest, setRemixAutoRequest] = useState(null);
  const [themeMode, setThemeMode] = useState(getInitialThemeMode);
  const [autoTheme, setAutoTheme] = useState(getAutoTheme);
  const theme = themeMode === 'auto' ? autoTheme : themeMode;
  const [sessionRevision, setSessionRevision] = useState(0);
  const [currentUser, setCurrentUser] = useState(null);
  const [authStatus, setAuthStatus] = useState('checking');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [assistantAutoPrompt, setAssistantAutoPrompt] = useState(null);
  const [workspaceId, setWorkspaceId] = useState(() => window.localStorage.getItem(WORKSPACE_KEY) || DEMO_WORKSPACES[0].id);
  const [userWorkspaces, setUserWorkspaces] = useState([]);
  const [sourcesTab, setSourcesTab] = useState(() => window.localStorage.getItem(SOURCES_TAB_KEY) || 'sources');
  const [signalDiscovery, setSignalDiscovery] = useState(null);
  const [signalDiscoveryError, setSignalDiscoveryError] = useState('');
  const [isSignalDiscoveryLoading, setIsSignalDiscoveryLoading] = useState(false);
  const [isSignalDiscoveryToggling, setIsSignalDiscoveryToggling] = useState(false);
  const [isSignalDiscoveryRunning, setIsSignalDiscoveryRunning] = useState(false);
  const [isSignalsRefreshing, setIsSignalsRefreshing] = useState(false);
  const discoveryRequestRef = useRef(0);
  const reelsRequestRef = useRef(0);
  const signalsRefreshRequestRef = useRef(0);
  const signalDiscoveryToggleRequestRef = useRef(0);
  const signalDiscoveryRunRequestRef = useRef(0);
  const signalsWorkspaceRequestRef = useRef({ workspaceId, generation: 0 });
  const apifyImportRequestRef = useRef(0);
  const visibleSignalsRefreshPromiseRef = useRef(null);
  const reelsWorkspaceRef = useRef('');
  const createSignalsWorkspaceRequestContext = (requestWorkspaceId = workspaceId, requestId = 0) => ({
    ...createWorkspaceRequestContext(requestWorkspaceId, requestId, signalsWorkspaceRequestRef.current),
  });
  const isSignalsWorkspaceRequestCurrent = (requestContext, requestRef = null) => {
    return isWorkspaceRequestCurrent(requestContext, signalsWorkspaceRequestRef.current, requestRef);
  };
  const publicPage = getPublicPage();
  const mobilePreviewUrl = getMobilePreviewUrl();
  const availableWorkspaces = currentUser
    ? (userWorkspaces.length ? userWorkspaces : DEMO_WORKSPACES.filter((workspace) => workspace.id === currentUser.workspaceId))
    : [];
  const activeWorkspace = availableWorkspaces.find((workspace) => workspace.id === workspaceId)
    || availableWorkspaces[0]
    || DEMO_WORKSPACES[0];
  const setMvpPage = (nextPage) => {
    const allowedPages = new Set(['home', 'viral', 'remix', 'agent-studio', 'plan', 'settings']);
    setPage(allowedPages.has(nextPage) ? nextPage : 'home');
  };

  useEffect(() => {
    if (!['home', 'viral', 'remix', 'agent-studio', 'plan', 'settings'].includes(page)) {
      setPage('home');
    }
  }, [page]);

  useEffect(() => {
    if (!currentUser || !workspaceId) return undefined;
    let isMounted = true;
    setData(null);
    fetchProducerSnapshot({ workspaceId, apiBase: API_BASE, fetcher: authFetch }).then((snapshot) => {
      if (!isMounted) return;
      reelsWorkspaceRef.current = workspaceId;
      setData(snapshot);
    });
    return () => {
      isMounted = false;
    };
  }, [currentUser, workspaceId]);

  useEffect(() => {
    window.localStorage.setItem(THEME_MODE_KEY, themeMode);
    window.localStorage.setItem(LEGACY_THEME_KEY, theme);
  }, [themeMode, theme]);

  useEffect(() => {
    if (themeMode !== 'auto') return undefined;
    const syncAutoTheme = () => setAutoTheme(getAutoTheme());
    syncAutoTheme();
    const now = new Date();
    const msUntilNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
    let intervalId;
    const timeoutId = window.setTimeout(() => {
      syncAutoTheme();
      intervalId = window.setInterval(syncAutoTheme, 60 * 1000);
    }, Math.max(1000, msUntilNextMinute));
    return () => {
      window.clearTimeout(timeoutId);
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [themeMode]);

  useEffect(() => {
    window.localStorage.setItem(WORKSPACE_KEY, workspaceId);
  }, [workspaceId]);

  useEffect(() => {
    signalsWorkspaceRequestRef.current = {
      workspaceId,
      generation: signalsWorkspaceRequestRef.current.workspaceId === workspaceId
        ? signalsWorkspaceRequestRef.current.generation
        : signalsWorkspaceRequestRef.current.generation + 1,
    };
    visibleSignalsRefreshPromiseRef.current = null;
    setIsSignalDiscoveryToggling(false);
    setIsSignalDiscoveryRunning(false);
    setIsSignalsRefreshing(false);
  }, [workspaceId]);

  useEffect(() => {
    if (!currentUser) {
      setUserWorkspaces([]);
      return undefined;
    }
    let isMounted = true;
    authFetch(`${API_BASE}/workspaces`)
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (!isMounted) return;
        const workspaces = Array.isArray(payload?.workspaces) ? payload.workspaces : [];
        setUserWorkspaces(workspaces);
        const hasActiveWorkspace = workspaces.some((workspace) => workspace.id === workspaceId);
        const fallbackWorkspaceId = currentUser.workspaceId || workspaces[0]?.id;
        if (!hasActiveWorkspace && fallbackWorkspaceId) {
          setWorkspaceId(fallbackWorkspaceId);
        }
      })
      .catch(() => {
        if (!isMounted) return;
        const fallbackWorkspaceId = currentUser.workspaceId;
        if (fallbackWorkspaceId && fallbackWorkspaceId !== workspaceId) {
          setWorkspaceId(fallbackWorkspaceId);
        }
      });
    return () => {
      isMounted = false;
    };
  }, [currentUser, workspaceId]);

  const applyAuthPayload = (payload) => {
    const user = payload?.user || null;
    const workspaces = Array.isArray(payload?.workspaces) ? payload.workspaces : [];
    setCurrentUser(user);
    setUserWorkspaces(workspaces);
    const primaryWorkspaceId = user?.workspaceId || workspaces[0]?.id || '';
    if (primaryWorkspaceId) {
      setWorkspaceId(primaryWorkspaceId);
      window.localStorage.setItem(WORKSPACE_KEY, primaryWorkspaceId);
    }
  };

  useEffect(() => {
    let isMounted = true;
    fetch(`${API_BASE}/auth/me`, {
      credentials: 'include',
      headers: getAuthHeaders(),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('auth_failed');
        return response.json();
      })
      .then((payload) => {
        if (!isMounted) return;
        applyAuthPayload(payload);
        setAuthStatus('ready');
      })
      .catch(() => {
        if (!isMounted) return;
        window.localStorage.removeItem(LEGACY_AUTH_TOKEN_KEY);
        setCurrentUser(null);
        setAuthStatus('guest');
      });
    return () => {
      isMounted = false;
    };
  }, [sessionRevision]);

  const filtered = useMemo(() => {
    if (!data) return null;
    if (market === 'all') return data;
    return {
      ...data,
      reels: data.reels.filter((reel) => reel.market === market),
      competitors: data.competitors.filter((competitor) => competitor.market === market),
    };
  }, [data, market]);
  const workspaceScopedSignalsReels = useMemo(() => {
    if (!filtered) return [];
    return reelsWorkspaceRef.current === workspaceId ? filtered.reels : [];
  }, [filtered, workspaceId]);

  useEffect(() => {
    if (!currentUser || page !== 'viral') return undefined;
    let isMounted = true;
    setSignalDiscovery(null);
    setSignalDiscoveryError('');
    setIsSignalDiscoveryLoading(true);
    if (reelsWorkspaceRef.current !== workspaceId) {
      applyWorkspaceReels([], workspaceId);
    }
    void refreshSignalsWorkspaceState({ silent: true }).finally(() => {
      if (isMounted) setIsSignalDiscoveryLoading(false);
    });
    return () => {
      isMounted = false;
    };
  }, [currentUser, page, workspaceId]);

  const notify = (message) => {
    setToast(translateText(message));
    window.clearTimeout(window.__toastTimer);
    window.__toastTimer = window.setTimeout(() => setToast(''), 2600);
  };

  useEffect(() => {
    if (!currentUser || !data || remixDraft) return;
    const pendingScan = window.localStorage.getItem(BRAND_SCAN_PENDING_KEY);
    if (!pendingScan) return;
    try {
      const scan = JSON.parse(pendingScan);
      window.localStorage.removeItem(BRAND_SCAN_PENDING_KEY);
      setRemixDraft(buildReelFromBrandScan(scan));
      setPage('remix');
      notify('Brand Scan відкрито в Студії');
    } catch {
      window.localStorage.removeItem(BRAND_SCAN_PENDING_KEY);
    }
  }, [currentUser, data, remixDraft]);

  const handleAuthSuccess = (payload, destination = null) => {
    window.localStorage.removeItem(LEGACY_AUTH_TOKEN_KEY);
    setSessionRevision((revision) => revision + 1);
    applyAuthPayload(payload);
    if (['home', 'viral', 'remix', 'agent-studio', 'plan', 'settings'].includes(destination)) {
      setPage(destination);
    }
    setAuthStatus('ready');
    notify('Вхід виконано. Можна працювати з продюсером.');
  };

  const handleLogout = async () => {
    setAuthStatus('checking');
    try {
      await authFetch(`${API_BASE}/auth/logout`, { method: 'POST' });
    } catch {
      // Keep the UI logout deterministic even if the network hiccups.
    }
    window.localStorage.removeItem(LEGACY_AUTH_TOKEN_KEY);
    window.localStorage.removeItem(WORKSPACE_KEY);
    setCurrentUser(null);
    setUserWorkspaces([]);
    setRemixDraft(null);
    setAssistantAutoPrompt(null);
    setIsAssistantOpen(false);
    setIsSidebarOpen(false);
    setWorkspaceId(DEMO_WORKSPACES[0].id);
    setPage('home');
    setSessionRevision((revision) => revision + 1);
    setAuthStatus('guest');
    notify('Ви вийшли з акаунта');
  };

  if (publicPage) {
    return <PublicLegalPage page={publicPage} />;
  }

  if (mobilePreviewUrl) {
    return <MobilePreviewFrame src={mobilePreviewUrl} />;
  }

  if (authStatus === 'checking') {
    return <div className="loading-screen">Перевіряємо сесію...</div>;
  }

  if (!currentUser) {
    return (
      <div className="app auth-app" data-theme={theme}>
        <BrandScanGate key={language} onAuth={handleAuthSuccess} notify={notify} theme={theme} themeMode={themeMode} setThemeMode={setThemeMode} language={language} setLanguage={setLanguage} />
        {toast && <div className="toast">{toast}</div>}
      </div>
    );
  }

  if (!data || !filtered) {
    return <div className="loading-screen">Завантажуємо дані продюсера...</div>;
  }

  const selectedReel = remixDraft ?? filtered.reels[0] ?? data.reels[0];
  const addCompetitor = (handle) => {
    if (!handle) return;
    setData((current) => ({
      ...current,
      competitors: [
        { market: market === 'all' ? 'ua' : market, handle, niche: `${marketLabel(market)} | новий конкурент | очікує сканування`, reels: 0, score: '0.0', bestViews: '-', status: 'Очікує sync' },
        ...current.competitors,
      ],
    }));
    notify('Конкурента додано в чергу сканування');
  };
  const addIdea = (title) => {
    if (!title) return;
    setData((current) => ({
      ...current,
      ideas: [
        { market: market === 'all' ? 'ua' : market, title, source: 'manual', angle: 'Чернетка від користувача. Потрібна адаптація під український сценарій.', hook: 'Потрібно визначити вступний меседж', score: 70, effort: 'Середня', status: 'Потрібен розбір' },
        ...current.ideas,
      ],
    }));
    notify('Ідею створено');
  };
  const addPost = (title) => {
    if (!title) return;
    setData((current) => ({ ...current, plans: [[title, 'сьогодні', 'Чернетка'], ...current.plans] }));
    notify('Пост додано в контент-план');
  };
  const addReelToPlan = async (reel) => {
    const studioDraft = buildStudioContentPlanDraft(reel);
    const sourcePlan = studioDraft
      ? [['AI', studioDraft.title]]
      : reel.scanPlan?.length
        ? reel.scanPlan
        : [['Пн', reel.scanExample?.title || reel.title || 'Brand Scan production draft']];
    const todayDay = new Date().getDate();
    const daysInCurrentMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    const sourceKey = buildCalendarPostSourceKey(reel);
    const sourceUrl = reel.sourceUrl || reel.profileUrl || reel.importedMetadata?.url || '';
    const sourceTitle = studioDraft
      ? reel.title || 'AI adaptation source'
      : reel.scanExample?.title || reel.title || 'Brand Scan production draft';
    const planPosts = sourcePlan.slice(0, 7).map(([dayLabel, title], index) => {
      const text = String(title || reel.scanExample?.title || reel.title || 'Brand Scan production draft').trim();
      const lower = text.toLowerCase();
      const format = studioDraft ? 'Reels'
        : lower.includes('stories') || lower.includes('story') ? 'Stories'
          : lower.includes('shorts') || lower.includes('youtube') ? 'Shorts'
            : lower.includes('tiktok') || lower.includes('tik tok') ? 'Tik - Tok'
              : lower.includes('карус') || lower.includes('carousel') || lower.includes('post') ? 'Post'
                : 'Reels';
      return {
        id: `${studioDraft ? 'studio-ai' : 'brand-scan'}-${Date.now()}-${index}`,
        day: Math.min(todayDay + index, daysInCurrentMonth),
        title: text,
        body: studioDraft?.body || '',
        format,
        time: index % 2 === 0 ? '10:00' : '18:30',
        done: false,
        source: studioDraft ? 'studio_ai' : 'brand_scan',
        sourceKey,
        sourceReelId: reel.id || '',
        sourceTitle,
        sourceUrl,
        sourceHandle: reel.handle || reel.scanLabel || '',
        dayLabel,
      };
    });
    try {
      const response = await authFetch(`${API_BASE}/workspaces/${workspaceId}/content-plan`);
      const payload = response.ok ? await response.json() : null;
      const currentPosts = Array.isArray(payload?.posts) ? payload.posts : [];
      const hasSamePost = (candidate) => currentPosts.some((post) => (
        isDuplicateContentPlanPost(post, candidate)
      ));
      const uniquePosts = planPosts.filter((post) => !hasSamePost(post));
      if (!uniquePosts.length) {
        notify(studioDraft ? 'Цей AI-сценарій вже є в контент-плані' : 'Цей Brand Scan вже є в контент-плані');
        return true;
      }
      const nextPosts = [...currentPosts, ...uniquePosts];
      const saveResponse = await authFetch(`${API_BASE}/workspaces/${workspaceId}/content-plan`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ posts: nextPosts }),
      });
      if (!saveResponse.ok) throw new Error(await readApiError(saveResponse, 'content_plan_save_failed'));
      setData((current) => ({ ...current, plans: [...uniquePosts.map((post) => [post.title, post.time, post.format]), ...current.plans] }));
      notify(studioDraft ? 'AI-сценарій додано в контент-план' : `Brand Scan draft додано в контент-план: ${uniquePosts.length} задачі`);
      return true;
    } catch (error) {
      notify(localizeInterfaceError(error, t, 'errors.contentPlanSave'));
      return false;
    }
  };
  const openCalendarPostInStudio = (post) => {
    const reelDraft = buildReelForCalendarPost(post, [
      ...workspaceScopedSignalsReels,
      ...(data?.reels || []),
    ], { language });
    setRemixDraft(reelDraft);
    setMvpPage('remix');
    notify('Відкрито сценарій цієї події в Студії');
  };
  const saveBrandScanToBrain = async (reel) => {
    if (!reel?.scanLabel && !reel?.scanExample && !reel?.importedMetadata) {
      notify('Спочатку відкрий Brand Scan draft.');
      return false;
    }
    const payload = buildBrandBrainFromScanReel(reel, language);
    try {
      const response = await authFetch(`${API_BASE}/workspaces/${workspaceId}/agent/context`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(await readApiError(response, 'brand_brain_save_failed'));
      notify('Brand Scan збережено в Brand Brain');
      window.localStorage.setItem(SOURCES_TAB_KEY, 'profile');
      setSourcesTab('profile');
      setMvpPage('settings');
      return true;
    } catch (error) {
      notify(localizeInterfaceError(error, t, 'errors.brandBrainSave'));
      return false;
    }
  };
  const addManualReel = (payload) => {
    const title = payload.title?.trim() || payload.caption?.trim() || 'Ручний рілс для адаптації';
    const handle = payload.handle?.trim() || '@manual.source';
    const transcript = payload.transcript?.trim();
    const manualReel = {
      market: payload.market || (market === 'all' ? 'global' : market),
      title,
      handle: handle.startsWith('@') ? handle : `@${handle}`,
      score: transcript ? 82 : 74,
      views: payload.views?.trim() || '-',
      likes: payload.likes?.trim() || '-',
      comments: payload.comments?.trim() || '-',
      status: ['Ручний імпорт', transcript ? 'Є транскрипт' : 'Потрібен розбір', 'UA-ремікс'],
      tag: (handle.replace('@', '')[0] || 'R').toUpperCase(),
      caption: payload.caption?.trim() || '',
      transcript: transcript || '',
      sourceUrl: payload.url?.trim() || '',
    };
    setData((current) => ({ ...current, reels: [manualReel, ...current.reels] }));
    setRemixDraft(manualReel);
    setPage('remix');
    notify('Рілс додано вручну і відкрито в ремікс-студії');
  };
  const autoImportReelUrl = async (url) => {
    const cleanUrl = String(url || '').trim();
    if (!cleanUrl) return false;
    notify('Імпортуємо сигнал і готуємо UA-адаптацію...');
    try {
      const response = await authFetch(`${API_BASE}/workspaces/${workspaceId}/reels/import-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: cleanUrl,
          market: market === 'all' ? 'global' : market,
        }),
      });
      if (!response.ok) throw new Error(await readApiError(response, 'auto_import_failed'));
      const payload = await response.json();
      const importedReel = {
        ...payload.reel,
        handle: payload.reel?.handle || payload.reel?.sourceHandle || '@instagram.reel',
      };
      setData((current) => ({ ...current, reels: dedupeSignalReels([importedReel, ...current.reels.filter((reel) => reel.id !== importedReel.id)]) }));
      setRemixDraft(importedReel);
      setPage('remix');
      notify(['public_metadata', 'youtube_api', 'youtube_oembed'].includes(importedReel.sourceStatus)
        ? 'Сигнал імпортовано: адаптація готова'
        : 'Джерело дало мінімум даних, але базову UA-адаптацію підготовлено');
      return true;
    } catch (error) {
      notify(localizeInterfaceError(error, t, 'errors.signalImport'));
      setModal({ type: 'reel', url: cleanUrl });
      return false;
    }
  };
  const pullYouTubePopular = async ({ regionCode = 'UA', categoryId = '' } = {}) => {
    notify('Підтягуємо популярні YouTube-ролики у Signals...');
    const response = await authFetch(`${API_BASE}/workspaces/${workspaceId}/reels/youtube/popular`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        regionCode,
        categoryId,
        maxResults: 24,
        market: regionCode === 'UA' ? 'ua' : 'global',
      }),
    });
    if (!response.ok) throw new Error(await readApiError(response, 'youtube_popular_failed'));
    const payload = await response.json();
    const incomingReels = (payload.reels || []).map((reel) => ({
      ...reel,
      handle: reel.handle || reel.sourceHandle || '@youtube',
    }));
    setData((current) => {
      const incomingIds = new Set(incomingReels.map((reel) => reel.id));
      return { ...current, reels: dedupeSignalReels([...incomingReels, ...current.reels.filter((reel) => !incomingIds.has(reel.id))]) };
    });
    const importedCount = Number(payload.importedCount ?? incomingReels.length);
    const reusedCount = Number(payload.reusedCount ?? 0);
    notify(importedCount
      ? `YouTube Signals: +${importedCount}. Можна адаптувати під бренд.`
      : incomingReels.length
        ? `YouTube Signals вже в стрічці: показую ${reusedCount || incomingReels.length}.`
        : 'YouTube Signals вже були в стрічці, дублі не додавались.');
    return payload;
  };
  const importApifySignals = async ({ platform, inputType, inputValue, limit, downloadVideo }) => {
    const requestContext = createSignalsWorkspaceRequestContext(workspaceId, ++apifyImportRequestRef.current);
    try {
      const response = await authFetch(`${API_BASE}/workspaces/${requestContext.workspaceId}/signals/apify/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform,
          inputType,
          inputValue,
          limit,
          downloadVideo,
          market: market === 'all' ? 'global' : market,
        }),
      });
      if (!response.ok) throw new Error(await readApiError(response, 'apify_import_failed'));
      const payload = await response.json();
      if (!isSignalsWorkspaceRequestCurrent(requestContext, apifyImportRequestRef)) return null;
      const incomingReels = (payload.reels || []).map((reel) => ({
        ...reel,
        handle: reel.handle || reel.sourceHandle || `@${platform}`,
      }));
      setData((current) => {
        const incomingIds = new Set(incomingReels.map((reel) => reel.id));
        return { ...current, reels: dedupeSignalReels([...incomingReels, ...current.reels.filter((reel) => !incomingIds.has(reel.id))]) };
      });
      if (!isSignalsWorkspaceRequestCurrent(requestContext, apifyImportRequestRef)) return null;
      await refreshSignalsWorkspaceState({ silent: true });
      if (!isSignalsWorkspaceRequestCurrent(requestContext, apifyImportRequestRef)) return null;
      notify(payload.importedCount
        ? `${platform === 'instagram' ? 'Instagram' : 'TikTok'} Signals: +${payload.importedCount}.`
        : `Сигнали вже були в банку: ${payload.reusedCount || incomingReels.length}.`);
      return payload;
    } catch (error) {
      if (isSignalsWorkspaceRequestCurrent(requestContext, apifyImportRequestRef)) {
        notify(localizeInterfaceError(error, t, 'errors.apifyImport'));
      }
      return null;
    }
  };
  const loadSignalDiscoveryStatus = async ({ silent = false } = {}) => {
    const requestContext = createSignalsWorkspaceRequestContext(workspaceId, ++discoveryRequestRef.current);
    if (!silent) setIsSignalDiscoveryLoading(true);
    try {
      const response = await authFetch(`${API_BASE}/workspaces/${requestContext.workspaceId}/signals/discovery`);
      if (!response.ok) throw new Error(await readApiError(response, 'signal_discovery_status_failed'));
      const payload = await response.json();
      if (isSignalsWorkspaceRequestCurrent(requestContext, discoveryRequestRef)) {
        setSignalDiscovery(payload);
        setSignalDiscoveryError('');
      }
      return payload;
    } catch (error) {
      if (isSignalsWorkspaceRequestCurrent(requestContext, discoveryRequestRef)) {
        setSignalDiscoveryError(localizeInterfaceError(error, t, 'errors.discoveryStatus'));
      }
      throw error;
    } finally {
      if (!silent && isSignalsWorkspaceRequestCurrent(requestContext, discoveryRequestRef)) {
        setIsSignalDiscoveryLoading(false);
      }
    }
  };
  const normalizeWorkspaceReels = (payload) => (
    Array.isArray(payload?.reels)
      ? payload.reels.map((reel) => ({
          ...reel,
          handle: reel.handle || reel.sourceHandle || reel.importedMetadata?.source?.handle || '@signal',
        }))
      : []
  );
  const applyWorkspaceReels = (incomingReels, nextWorkspaceId = workspaceId) => {
    reelsWorkspaceRef.current = nextWorkspaceId;
    setData((current) => (current ? { ...current, reels: dedupeSignalReels(incomingReels) } : current));
  };
  const applyDiscoveryRunStatus = (run, code, requestContext = null) => {
    if (!run) return;
    if (requestContext && !isSignalsWorkspaceRequestCurrent(requestContext)) return;
    setSignalDiscovery((current) => {
      if (!current) return current;
      const nextCode = deriveDiscoveryRunStatusCode(run, current.settings, code);
      const isRunning = nextCode === 'running';
      return {
        ...current,
        status: {
          ...(current.status || {}),
          code: nextCode,
          running: isRunning,
          activeRun: isRunning ? run : null,
          latestRun: isRunning ? current.status?.latestRun || null : run,
          lastRunAt: run.completedAt || run.updatedAt || current.status?.lastRunAt,
          canRunNow: isRunning ? false : current.status?.canRunNow,
        },
      };
    });
  };
  const describeSignalsRefreshIssue = (error) => localizeInterfaceError(error, t, 'errors.discoveryStatus');
  const refreshWorkspaceReels = async () => {
    const requestContext = createSignalsWorkspaceRequestContext(workspaceId, ++reelsRequestRef.current);
    const response = await authFetch(`${API_BASE}/workspaces/${requestContext.workspaceId}/reels`);
    if (!response.ok) throw new Error(await readApiError(response, 'signals_reels_refresh_failed'));
    const payload = await response.json();
    const incomingReels = normalizeWorkspaceReels(payload);
    if (isSignalsWorkspaceRequestCurrent(requestContext, reelsRequestRef)) {
      applyWorkspaceReels(incomingReels, requestContext.workspaceId);
    }
    return payload;
  };
  const refreshSignalsWorkspaceState = async ({ silent = false } = {}) => {
    if (!silent && visibleSignalsRefreshPromiseRef.current) return visibleSignalsRefreshPromiseRef.current;
    const requestContext = createSignalsWorkspaceRequestContext(workspaceId, ++signalsRefreshRequestRef.current);
    if (!silent) setIsSignalsRefreshing(true);
    const refreshPromise = (async () => {
      try {
        const [discoveryResult, reelsResult] = await Promise.allSettled([
          loadSignalDiscoveryStatus({ silent: true }),
          refreshWorkspaceReels(),
        ]);
        const discoveryError = discoveryResult.status === 'rejected' ? discoveryResult.reason : null;
        const reelsError = reelsResult.status === 'rejected' ? reelsResult.reason : null;
        const firstError = discoveryError || reelsError;
        if (isSignalsWorkspaceRequestCurrent(requestContext, signalsRefreshRequestRef)) {
          if (firstError) {
            const errorMessage = localizeInterfaceError(firstError, t, 'errors.discoveryStatus');
            setSignalDiscoveryError(errorMessage);
            if (!silent) {
              notify(`Не вдалося оновити Signals: ${errorMessage}`);
            }
          } else {
            setSignalDiscoveryError('');
          }
        }
        return {
          discovery: discoveryResult.value,
          reels: reelsResult.value,
          error: firstError,
        };
      } finally {
        if (!silent && isSignalsWorkspaceRequestCurrent(requestContext, signalsRefreshRequestRef)) {
          setIsSignalsRefreshing(false);
        }
      }
    })();
    if (!silent) {
      visibleSignalsRefreshPromiseRef.current = refreshPromise;
      void refreshPromise.finally(() => {
        if (visibleSignalsRefreshPromiseRef.current === refreshPromise) {
          visibleSignalsRefreshPromiseRef.current = null;
        }
      });
    }
    return refreshPromise;
  };
  const toggleSignalDiscoveryEnabled = async (enabled) => {
    if (isSignalDiscoveryToggling || !signalDiscovery) return;
    const requestContext = createSignalsWorkspaceRequestContext(workspaceId, ++signalDiscoveryToggleRequestRef.current);
    setIsSignalDiscoveryToggling(true);
    setSignalDiscoveryError('');
    try {
      const response = await authFetch(`${API_BASE}/workspaces/${requestContext.workspaceId}/signals/discovery`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      if (!response.ok) throw new Error(await readApiError(response, 'signal_discovery_toggle_failed'));
      const payload = await response.json();
      if (!isSignalsWorkspaceRequestCurrent(requestContext, signalDiscoveryToggleRequestRef)) return payload;
      setSignalDiscovery(payload);
      const successMessage = enabled ? 'Автопошук Signals увімкнено.' : 'Автопошук Signals поставлено на паузу.';
      const refreshResult = await refreshSignalsWorkspaceState({ silent: true });
      if (!isSignalsWorkspaceRequestCurrent(requestContext, signalDiscoveryToggleRequestRef)) return payload;
      if (refreshResult.error) {
        const refreshMessage = describeSignalsRefreshIssue(refreshResult.error);
        setSignalDiscoveryError(refreshMessage);
        notify(`${successMessage} Але не вдалося оновити Signals: ${refreshMessage}`);
      } else {
        notify(successMessage);
      }
      return payload;
    } catch (error) {
      if (isSignalsWorkspaceRequestCurrent(requestContext, signalDiscoveryToggleRequestRef)) {
        const localizedError = localizeInterfaceError(error, t, 'errors.discoveryToggle');
        setSignalDiscoveryError(localizedError);
        notify(localizedError);
      }
      return null;
    } finally {
      if (isSignalsWorkspaceRequestCurrent(requestContext, signalDiscoveryToggleRequestRef)) {
        setIsSignalDiscoveryToggling(false);
      }
    }
  };
  const runSignalDiscoveryNow = async () => {
    if (isSignalDiscoveryRunning) return null;
    const requestContext = createSignalsWorkspaceRequestContext(workspaceId, ++signalDiscoveryRunRequestRef.current);
    setIsSignalDiscoveryRunning(true);
    setSignalDiscoveryError('');
    try {
      const response = await authFetch(`${API_BASE}/workspaces/${requestContext.workspaceId}/signals/discovery/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 409 && payload.error === 'automatic_discovery_running') {
        if (!isSignalsWorkspaceRequestCurrent(requestContext, signalDiscoveryRunRequestRef)) return payload;
        applyDiscoveryRunStatus(payload.run, 'running', requestContext);
        const refreshResult = await refreshSignalsWorkspaceState({ silent: true });
        if (!isSignalsWorkspaceRequestCurrent(requestContext, signalDiscoveryRunRequestRef)) return payload;
        if (refreshResult.error) {
          const refreshMessage = describeSignalsRefreshIssue(refreshResult.error);
          setSignalDiscoveryError(refreshMessage);
          notify(`Автопошук уже виконується. Але не вдалося оновити Signals: ${refreshMessage}`);
        } else {
          notify('Автопошук уже виконується.');
        }
        return payload;
      }
      if (response.status === 429 && payload.error === 'automatic_budget_reached') {
        if (!isSignalsWorkspaceRequestCurrent(requestContext, signalDiscoveryRunRequestRef)) return payload;
        applyDiscoveryRunStatus(payload.run, 'budget_reached', requestContext);
        const refreshResult = await refreshSignalsWorkspaceState({ silent: true });
        if (!isSignalsWorkspaceRequestCurrent(requestContext, signalDiscoveryRunRequestRef)) return payload;
        if (refreshResult.error) {
          const refreshMessage = describeSignalsRefreshIssue(refreshResult.error);
          setSignalDiscoveryError(refreshMessage);
          notify(`Денний ліміт автопошуку вже вичерпано. Але не вдалося оновити Signals: ${refreshMessage}`);
        } else {
          notify('Денний ліміт автопошуку вже вичерпано.');
        }
        return payload;
      }
      if (response.status === 429 && payload.error === 'automatic_daily_run_limit_reached') {
        if (!isSignalsWorkspaceRequestCurrent(requestContext, signalDiscoveryRunRequestRef)) return payload;
        const refreshResult = await refreshSignalsWorkspaceState({ silent: true });
        if (!isSignalsWorkspaceRequestCurrent(requestContext, signalDiscoveryRunRequestRef)) return payload;
        const message = 'Сьогоднішній автопошук до 10 нових сигналів уже запускався. Наступний — після початку нового UTC-дня.';
        if (refreshResult.error) {
          const refreshMessage = describeSignalsRefreshIssue(refreshResult.error);
          setSignalDiscoveryError(refreshMessage);
          notify(`${message} Але не вдалося оновити Signals: ${refreshMessage}`);
        } else {
          notify(message);
        }
        return payload;
      }
      if (!response.ok) {
        throw new Error(extractInterfaceErrorCode(payload, 'automatic_discovery_run_failed'));
      }
      const acceptedSignals = Number(payload.acceptedSignals || 0);
      const updatedSignals = Number(payload.updatedSignals || 0);
      const runNotice = deriveDiscoveryRunNotice({
        run: payload.run,
        acceptedSignalsCount: acceptedSignals,
        updatedSignalsCount: updatedSignals,
        language,
      });
      if (!isSignalsWorkspaceRequestCurrent(requestContext, signalDiscoveryRunRequestRef)) return payload;
      applyDiscoveryRunStatus(payload.run, deriveDiscoveryRunStatusCode(payload.run, signalDiscovery?.settings), requestContext);
      if (payload.run?.status === 'failed') {
        setSignalDiscoveryError(runNotice.message);
        const refreshResult = await refreshSignalsWorkspaceState({ silent: true });
        if (!isSignalsWorkspaceRequestCurrent(requestContext, signalDiscoveryRunRequestRef)) return payload;
        if (refreshResult.error) {
          const refreshMessage = describeSignalsRefreshIssue(refreshResult.error);
          setSignalDiscoveryError(refreshMessage);
          notify(`${runNotice.message} Але не вдалося оновити Signals: ${refreshMessage}`);
        } else {
          notify(runNotice.message);
        }
        return payload;
      }
      const refreshResult = await refreshSignalsWorkspaceState({ silent: true });
      if (!isSignalsWorkspaceRequestCurrent(requestContext, signalDiscoveryRunRequestRef)) return payload;
      if (refreshResult.error) {
        const refreshMessage = describeSignalsRefreshIssue(refreshResult.error);
        setSignalDiscoveryError(refreshMessage);
        notify(`${runNotice.message} Але не вдалося оновити Signals: ${refreshMessage}`);
      } else {
        notify(runNotice.message);
      }
      return payload;
    } catch (error) {
      if (isSignalsWorkspaceRequestCurrent(requestContext, signalDiscoveryRunRequestRef)) {
        const localizedError = localizeInterfaceError(error, t, 'errors.discoveryRun');
        setSignalDiscoveryError(localizedError);
        notify(localizedError);
      }
      return null;
    } finally {
      if (isSignalsWorkspaceRequestCurrent(requestContext, signalDiscoveryRunRequestRef)) {
        setIsSignalDiscoveryRunning(false);
      }
    }
  };
  const pushIdeaToPlan = (idea) => {
    setData((current) => ({ ...current, plans: [[idea.title, idea.source, 'Відібрано'], ...current.plans] }));
    notify('Ідею перенесено в контент-план');
  };
  const pushIdeaToRemix = (idea) => {
    setRemixDraft({ market: idea.market, title: idea.hook, handle: idea.source, score: idea.score, views: '-', likes: '-', comments: '-', status: [idea.status, 'UA-ремікс'], tag: idea.title[0] ?? 'I' });
    setPage('remix');
    notify('Ідею відкрито в ремікс-студії');
  };
  const generateFreshIdea = () => {
    const topReel = [...filtered.reels].sort((a, b) => b.score - a.score)[0];
    const source = topReel || data.reels[0];
    const ideas = [
      ['Reels', `Розбір механіки: ${source?.title || 'новий тренд'}`, 'Хук → доказ → CTA в Direct'],
      ['Stories', 'Опитування по болю аудиторії', '2 варіанти відповіді + збір запитів'],
      ['Post', 'Кейс або помилка тижня', 'Один висновок і коментар як CTA'],
      ['Reels', 'До / після для продукту', 'Показати простий контраст без студії'],
      ['Stories', 'FAQ для теплих лідів', '3 відповіді на часті заперечення'],
      ['Reels', 'Міні-чеклист за 15 секунд', 'Зберегти або написати ключове слово'],
      ['Post', 'Підсумок тижня / proof', 'Цифра, скрін або процес'],
    ];
    const generated = ideas.map(([format, title, hook], index) => ({
      market: market === 'all' ? 'ua' : market,
      title,
      source: source?.handle || 'scouting',
      angle: `${format}: ${hook}`,
      hook,
      score: Math.max(72, Number(source?.score || 78) - index),
      effort: index < 3 ? 'Низька' : 'Середня',
      status: 'До реміксу',
    }));
    setData((current) => ({ ...current, ideas: [...generated, ...current.ideas] }));
    notify('Зібрано 7 ідей на тиждень за сигналами трендів');
  };
  const switchWorkspace = (nextWorkspaceId) => {
    const workspace = DEMO_WORKSPACES.find((item) => item.id === nextWorkspaceId) || DEMO_WORKSPACES[0];
    setWorkspaceId(workspace.id);
    setAssistantAutoPrompt(null);
    notify(language === 'en' ? `Switched to ${workspace.name}` : `Перемкнено на ${workspace.name}`);
  };

  return (
    <div className="app" data-theme={theme}>
      <CleanSidebar
        key={`sidebar-${language}`}
        page={page}
        setPage={setMvpPage}
        currentUser={currentUser}
        workspaces={availableWorkspaces}
        activeWorkspace={activeWorkspace}
        language={language}
        onWorkspaceChange={switchWorkspace}
        onLogout={handleLogout}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />
      {isSidebarOpen && <button className="mobile-menu-backdrop" type="button" aria-label={language === 'en' ? 'Close menu' : 'Закрити меню'} onClick={() => setIsSidebarOpen(false)} />}
      <main className="shell" key={`shell-${language}`}>
        <Topbar theme={theme} themeMode={themeMode} setThemeMode={setThemeMode} language={language} setLanguage={setLanguage} setPage={setMvpPage} page={page} onOpenMenu={() => setIsSidebarOpen(true)} onCloseMenu={() => setIsSidebarOpen(false)} />
        {page === 'home' && <HomeDashboard data={data} market={market} notify={notify} onFreshIdea={() => setMvpPage('agent-studio')} setPage={setMvpPage} workspaceId={workspaceId} language={language} />}
        {page === 'viral' && <ViralBank reels={workspaceScopedSignalsReels} competitors={filtered.competitors} market={market} notify={notify} openModal={setModal} onImportUrl={autoImportReelUrl} onImportApifySignals={importApifySignals} onPullYouTubePopular={pullYouTubePopular} onAdapt={(reel) => { setRemixDraft(reel); setRemixAutoRequest((current) => createRemixAutoRequest(current?.id, reel)); setMvpPage('remix'); notify('Сигнал відкрито в Студії'); }} setPage={setMvpPage} automation={{ discovery: signalDiscovery, error: signalDiscoveryError, isLoading: isSignalDiscoveryLoading, isRefreshing: isSignalsRefreshing, isToggling: isSignalDiscoveryToggling, isRunning: isSignalDiscoveryRunning }} onRefreshAutomation={() => void refreshSignalsWorkspaceState({ silent: false })} onToggleAutomation={toggleSignalDiscoveryEnabled} onRunAutomation={runSignalDiscoveryNow} />}
        {page === 'remix' && (
          selectedReel
            ? <RemixStudio reel={selectedReel} notify={notify} setPage={setMvpPage} workspaceId={workspaceId} autoGenerateRequest={remixAutoRequest} onAutoGenerateConsumed={() => setRemixAutoRequest(null)} onAddToPlan={addReelToPlan} onSaveBrandBrain={saveBrandScanToBrain} />
            : <StudioEmptyState onOpenSignals={() => setMvpPage('viral')} />
        )}
        {page === 'agent-studio' && (
          <AgentStudioPage
            apiBase={API_BASE}
            fetcher={authFetch}
            workspaceId={workspaceId}
            signals={workspaceScopedSignalsReels}
            language={language}
            notify={notify}
            onOpenContentPlan={() => setMvpPage('plan')}
          />
        )}
        {page === 'plan' && <ContentPlan plans={data.plans} ideas={data.ideas} openModal={setModal} notify={notify} setPage={setMvpPage} workspaceId={workspaceId} onOpenPostInStudio={openCalendarPostInStudio} />}
        {page === 'settings' && (
          <DataSources
            sources={data.sources}
            notify={notify}
            workspaceId={workspaceId}
            currentUser={currentUser}
            language={language}
            activeTab={sourcesTab}
            onTabChange={(nextTab) => {
              setSourcesTab(nextTab);
              window.localStorage.setItem(SOURCES_TAB_KEY, nextTab);
            }}
            onOpenBrandScan={(scan) => {
              setRemixDraft(buildReelFromBrandScan(scan));
              setMvpPage('remix');
              notify('Brand Scan відкрито в Студії');
            }}
          />
        )}
      </main>
      {modal?.type === 'reel' || modal === 'reel'
        ? <ManualReelModal onClose={() => setModal(null)} onSubmit={addManualReel} defaultMarket={market === 'all' ? 'global' : market} initialUrl={typeof modal === 'object' ? modal.url : ''} />
        : modal && <QuickModal type={modal} onClose={() => setModal(null)} onSubmit={{ competitor: addCompetitor, idea: addIdea, post: addPost }[modal]} />}
      <AssistantDrawer
        isOpen={isAssistantOpen}
        onOpen={() => setIsAssistantOpen(true)}
        onClose={() => setIsAssistantOpen(false)}
        notify={notify}
        workspaceId={workspaceId}
        activeWorkspace={activeWorkspace}
        language={language}
      />
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function ProductTour({ page, setPage, currentUser, dataReady, language, onOpenSidebar, onCloseSidebar }) {
  useI18n();
  const startedRef = useRef(false);
  const openSidebarRef = useRef(onOpenSidebar);
  const closeSidebarRef = useRef(onCloseSidebar);

  useEffect(() => {
    openSidebarRef.current = onOpenSidebar;
    closeSidebarRef.current = onCloseSidebar;
  }, [onOpenSidebar, onCloseSidebar]);

  useEffect(() => {
    if (!currentUser || !dataReady || page !== 'home' || startedRef.current) return;
    if (window.localStorage.getItem(PRODUCT_TOUR_KEY) === PRODUCT_TOUR_VERSION) return;

    let isCancelled = false;
    let hotspot = null;
    const locale = language === 'en' ? 'en' : 'uk';
    const copy = {
      uk: {
        back: 'Назад',
        skip: 'Пропустити тур',
        next: 'Далі ->',
        finish: 'Завершити тур',
        steps: [
          ['Крок 1: Центр керування', 'Головна показує весь шлях роботи: тренди, ідеї, сценарії, планування і продажі. Тут користувач бачить, з чого почати і куди рухатись далі.'],
          ['Крок 2: Пошук світових трендів', 'Тут AI збирає віральні закордонні Reels і автоматично адаптує їхні сенси під український контекст і менталітет. Почни звідси.'],
          ['Крок 3: Генерація сценарію', 'На основі вибраного тренду AI за хвилину пропише чіпкий хук, структуру відео і готовий заклик до дії (CTA) під твою нішу.'],
          ['Крок 4: Календар і планування', 'Готовий сценарій можна в один клік запланувати на будь-яку дату. Система сама сформує зрозумілу сітку публікацій на тиждень вперед.'],
          ['Крок 5: Автоматизація продажів', 'Поки ти знімаєш контент, вбудований AI-менеджер обробляє Direct: розпізнає наміри клієнтів, відповідає на питання 24/7 і веде їх до покупки.'],
          ['Крок 6: Додаткові інструменти', 'Запуски, глибока аналітика, юридичний сейф і бюджет не зникли. Вони зібрані тут, щоб головний шлях залишався простим і не перевантажував нову людину.'],
        ],
      },
      en: {
        back: 'Back',
        skip: 'Skip tour',
        next: 'Next ->',
        finish: 'Finish tour',
        steps: [
          ['Step 1: Command center', 'Home shows the full workflow: trends, ideas, scripts, planning, and sales. This is where a user sees where to start and what to do next.'],
          ['Step 2: Find global trends', 'Here AI collects viral international Reels and automatically adapts their meaning for the Ukrainian context and audience mindset. Start here.'],
          ['Step 3: Generate a script', 'Based on the selected trend, AI prepares a strong hook, video structure, and ready CTA for your niche in about a minute.'],
          ['Step 4: Calendar and planning', 'A finished script can be scheduled for any date in one click. The system builds a clear weekly publishing grid for you.'],
          ['Step 5: Sales automation', 'While you create content, the built-in AI manager handles Direct: detects customer intent, answers questions 24/7, and guides people toward purchase.'],
          ['Step 6: Extra tools', 'Launches, deeper analytics, legal safe, and budget are still here. They live in this menu so the main workflow stays simple for a new user.'],
        ],
      },
    }[locale];
    const fullSteps = locale === 'en'
      ? [
        ['home', '[data-tour="sidebar-home"]', 'home', 'right', 'Step 1: Command center', 'Home is the cockpit: it shows the main workflow, the next action, and the fastest way to get an idea.'],
        ['businesses', '[data-tour="sidebar-businesses"]', 'businesses', 'right', 'Step 3: Businesses', 'Business profiles help adapt content for different niches instead of giving generic advice.'],
        ['strategy', '[data-tour="sidebar-strategy"]', 'strategy', 'right', 'Step 4: Strategy', 'Strategy keeps positioning, audience, offer, and content direction in one place.'],
        ['viral', '[data-tour="sidebar-transcript"]', 'viral', 'right', 'Step 5: Trend analytics', 'Here AI collects viral Reels and turns global signals into ideas that make sense for a Ukrainian audience.'],
        ['competitors', '[data-tour="sidebar-competitors"]', 'competitors', 'right', 'Step 6: Competitors', 'Competitor tracking shows which accounts and formats are worth studying before creating new content.'],
        ['remix', '[data-tour="sidebar-remix"]', 'remix', 'right', 'Step 7: Remix studio', 'Remix studio turns a selected trend into a safer, original angle for your brand.'],
        ['ideas', '[data-tour="sidebar-ideas"]', 'ideas', 'right', 'Step 8: Ideas', 'Ideas are the shortlist of content opportunities ready to become scripts or posts.'],
        ['assistant', '[data-tour="sidebar-assistant"]', 'assistant', 'right', 'Step 9: Assistant', 'Assistant uses Brand Brain and current signals to write ideas, scripts, captions, and production tasks.'],
        ['script', '[data-tour="generate-script-btn"]', 'assistant', 'bottom', 'Step 10: Generate a script', 'This action turns an assistant answer into a script workflow: hook, structure, CTA, and next production step.'],
        ['plan', '[data-tour="sidebar-calendar"]', 'plan', 'right', 'Step 11: Content plan', 'Content plan is where selected ideas become a weekly publishing calendar.'],
        ['sales', '[data-tour="sidebar-direct"]', 'sales', 'right', 'Step 12: Sales / AI Direct', 'Sales shows how content connects to Direct, intent, objections, and purchase conversations.'],
        ['team', '[data-tour="sidebar-team"]', 'team', 'right', 'Step 13: Team', 'Team keeps production roles and tasks visible when more people join the workflow.'],
        ['tools', '[data-tour="sidebar-tools"]', null, 'right', 'Step 14: More / Tools', 'Less frequent sections are grouped here so the main workflow stays clean. Open it when you need launches, analytics, legal, or budget tools.'],
        ['launches', '[data-tour="sidebar-launches"]', 'launches', 'right', 'Step 15: Launches', 'Launches help build warm-up sequences and campaign steps around an offer.'],
        ['analytics', '[data-tour="sidebar-analytics"]', 'analytics', 'right', 'Step 16: Analytics', 'Analytics connects content, leads, cost, and revenue so decisions are not based only on views.'],
        ['legal', '[data-tour="sidebar-legal"]', 'legal', 'right', 'Step 17: Legal safe', 'Legal safe keeps Meta review pages, deletion flow, and public compliance materials in one place.'],
        ['budget', '[data-tour="sidebar-budget"]', 'budget', 'right', 'Step 18: Budget', 'Budget helps estimate spend, sales targets, CAC, ROI, and whether the plan makes financial sense.'],
        ['settings', '[data-tour="topbar-settings"]', 'settings', 'bottom', 'Step 19: Settings', 'Settings moved to the top bar. Use it for data sources, integrations, and account setup.'],
      ]
      : [
        ['home', '[data-tour="sidebar-home"]', 'home', 'right', 'Крок 1: Центр керування', 'Головна — це пульт керування: тут видно основний шлях, наступну дію і найшвидший старт для пошуку ідеї.'],
        ['businesses', '[data-tour="sidebar-businesses"]', 'businesses', 'right', 'Крок 3: Бізнеси', 'Бізнес-профілі допомагають адаптувати контент під різні ніші, а не давати однакові поради всім.'],
        ['strategy', '[data-tour="sidebar-strategy"]', 'strategy', 'right', 'Крок 4: Стратегія', 'Стратегія тримає позиціонування, аудиторію, офер і напрям контенту в одному місці.'],
        ['viral', '[data-tour="sidebar-transcript"]', 'viral', 'right', 'Крок 5: Аналітика трендів', 'Тут AI збирає віральні Reels і перетворює глобальні сигнали на ідеї для української аудиторії.'],
        ['competitors', '[data-tour="sidebar-competitors"]', 'competitors', 'right', 'Крок 6: Конкуренти', 'База конкурентів показує, які акаунти і формати варто вивчити перед створенням контенту.'],
        ['remix', '[data-tour="sidebar-remix"]', 'remix', 'right', 'Крок 7: Ремікс-студія', 'Ремікс-студія перетворює вибраний тренд у безпечний, оригінальний кут для твого бренду.'],
        ['ideas', '[data-tour="sidebar-ideas"]', 'ideas', 'right', 'Крок 8: Ідеї', 'Ідеї — це короткий список можливостей, які вже можна перетворювати на сценарії або пости.'],
        ['assistant', '[data-tour="sidebar-assistant"]', 'assistant', 'right', 'Крок 9: Асистент', 'Асистент використовує Brand Brain і поточні сигнали, щоб писати ідеї, сценарії, caption і задачі на продакшн.'],
        ['script', '[data-tour="generate-script-btn"]', 'assistant', 'bottom', 'Крок 10: Зробити сценарій', 'Ця дія переводить відповідь асистента у сценарний workflow: хук, структура, CTA і наступний крок продакшну.'],
        ['plan', '[data-tour="sidebar-calendar"]', 'plan', 'right', 'Крок 11: Контент-план', 'Контент-план — місце, де відібрані ідеї стають календарем публікацій на тиждень.'],
        ['sales', '[data-tour="sidebar-direct"]', 'sales', 'right', 'Крок 12: Продажі / AI Direct', 'Продажі показують, як контент пов’язаний з Direct, намірами, запереченнями і діалогами до покупки.'],
        ['team', '[data-tour="sidebar-team"]', 'team', 'right', 'Крок 13: Команда', 'Команда допомагає бачити ролі і задачі, коли до процесу підключаються інші люди.'],
        ['tools', '[data-tour="sidebar-tools"]', null, 'right', 'Крок 14: Ще / Інструменти', 'Рідше потрібні розділи зібрані тут, щоб головний шлях залишався чистим. Відкривай, коли потрібні запуски, аналітика, legal або бюджет.'],
        ['launches', '[data-tour="sidebar-launches"]', 'launches', 'right', 'Крок 15: Запуски', 'Запуски допомагають будувати прогріви і кроки кампанії навколо офера.'],
        ['analytics', '[data-tour="sidebar-analytics"]', 'analytics', 'right', 'Крок 16: Аналітика', 'Аналітика поєднує контент, ліди, витрати і дохід, щоб рішення не базувались тільки на переглядах.'],
        ['legal', '[data-tour="sidebar-legal"]', 'legal', 'right', 'Крок 17: Юридичний сейф', 'Юридичний сейф зберігає Meta review pages, deletion flow і публічні compliance-матеріали.'],
        ['budget', '[data-tour="sidebar-budget"]', 'budget', 'right', 'Крок 18: Бюджет', 'Бюджет допомагає оцінити витрати, план продажів, CAC, ROI і фінансову реальність плану.'],
        ['settings', '[data-tour="topbar-settings"]', 'settings', 'bottom', 'Крок 19: Налаштування', 'Налаштування переїхали у верхню панель. Тут джерела даних, інтеграції і підключення акаунта.'],
      ];

    const waitForElement = (selector, timeout = 5000) => new Promise((resolve, reject) => {
      const startedAt = Date.now();
      const tick = () => {
        const element = document.querySelector(selector);
        if (element) {
          resolve(element);
          return;
        }
        if (Date.now() - startedAt > timeout) {
          reject(new Error(`Tour target not found: ${selector}`));
          return;
        }
        window.setTimeout(tick, 80);
      };
      tick();
    });

    const prepareTarget = async (selector, nextPage) => {
      if (window.innerWidth < 860) {
        if (selector === '[data-tour="topbar-settings"]') closeSidebarRef.current?.();
        else openSidebarRef.current?.();
      }
      const toolsTarget = ['[data-tour="sidebar-launches"]', '[data-tour="sidebar-analytics"]', '[data-tour="sidebar-legal"]', '[data-tour="sidebar-budget"]'];
      if (toolsTarget.includes(selector)) {
        const toolsToggle = document.querySelector('[data-tour="sidebar-tools"]');
        if (toolsToggle?.getAttribute('aria-expanded') !== 'true') toolsToggle.click();
      }
      if (nextPage) setPage(nextPage);
      await new Promise((resolve) => window.setTimeout(resolve, 280));
      const element = await waitForElement(selector);
      element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
      await new Promise((resolve) => window.setTimeout(resolve, 220));
      return element;
    };

    const removeHotspot = () => {
      hotspot?.remove();
      hotspot = null;
    };

    const placeHotspot = (selector) => {
      removeHotspot();
      const element = document.querySelector(selector);
      if (!element) return;
      const rect = element.getBoundingClientRect();
      hotspot = document.createElement('div');
      hotspot.className = 'tour-hotspot-container';
      hotspot.innerHTML = '<span class="hotspot-ping"></span><span class="hotspot-dot"></span>';
      hotspot.style.left = `${Math.max(12, rect.right - 8)}px`;
      hotspot.style.top = `${Math.max(12, rect.top + rect.height / 2 - 6)}px`;
      document.body.appendChild(hotspot);
    };

    const completeTour = () => {
      if (isCancelled) return;
      window.localStorage.setItem(PRODUCT_TOUR_KEY, PRODUCT_TOUR_VERSION);
      removeHotspot();
      closeSidebarRef.current?.();
    };

    let tour = null;

    const commonButtons = (includeBack = true, last = false) => [
      includeBack ? {
        text: copy.back,
        classes: 'tour-btn tour-btn-muted',
        action() {
          return tour.back();
        },
      } : {
        text: copy.skip,
        classes: 'tour-btn tour-btn-link',
        action() {
          completeTour();
          return tour.cancel();
        },
      },
      {
        text: last ? copy.finish : copy.next,
        classes: 'tour-btn tour-btn-primary',
        action() {
          if (last) {
            completeTour();
            return tour.complete();
          }
          return tour.next();
        },
      },
    ];

    tour = new Shepherd.Tour({
      useModalOverlay: true,
      defaultStepOptions: {
        cancelIcon: { enabled: true },
        classes: 'dzhero-tour-popover',
        scrollTo: false,
        modalOverlayOpeningPadding: 8,
        modalOverlayOpeningRadius: 8,
      },
    });

    fullSteps.forEach(([id, selector, nextPage, attachTo, title, text], index) => {
      tour.addStep({
        id,
        title,
        text,
        attachTo: { element: selector, on: attachTo },
        buttons: commonButtons(index > 0, index === fullSteps.length - 1),
        beforeShowPromise: () => prepareTarget(selector, nextPage),
        when: {
          show: () => placeHotspot(selector),
          hide: removeHotspot,
        },
      });
    });

    tour.on('cancel', completeTour);
    tour.on('complete', completeTour);

    let hasStarted = false;
    const startTimer = window.setTimeout(() => {
      if (isCancelled) return;
      hasStarted = true;
      startedRef.current = true;
      Promise.resolve(tour.start()).catch((error) => {
        console.error('product-tour-start-error', error);
      });
    }, 700);

    return () => {
      if (hasStarted) return;
      isCancelled = true;
      window.clearTimeout(startTimer);
      removeHotspot();
      tour.cancel();
    };
  }, [currentUser, dataReady, page, language, setPage]);

  return null;
}

function LegacyProductTour({ page, setPage, currentUser, dataReady, language, onOpenSidebar, onCloseSidebar }) {
  useI18n();
  const tourRef = useRef(null);
  const startedRef = useRef(false);
  const openSidebarRef = useRef(onOpenSidebar);
  const closeSidebarRef = useRef(onCloseSidebar);

  useEffect(() => {
    openSidebarRef.current = onOpenSidebar;
    closeSidebarRef.current = onCloseSidebar;
  }, [onOpenSidebar, onCloseSidebar]);

  useEffect(() => {
    if (!currentUser || !dataReady || page !== 'home' || startedRef.current) return;
    if (window.localStorage.getItem(PRODUCT_TOUR_KEY) === PRODUCT_TOUR_VERSION) return;

    let isCancelled = false;
    let hotspot = null;

    const waitForElement = (selector, timeout = 5000) => new Promise((resolve, reject) => {
      const startedAt = Date.now();
      const tick = () => {
        const element = document.querySelector(selector);
        if (element) {
          resolve(element);
          return;
        }
        if (Date.now() - startedAt > timeout) {
          reject(new Error(`Tour target not found: ${selector}`));
          return;
        }
        window.setTimeout(tick, 80);
      };
      tick();
    });

    const prepareTarget = async (selector, nextPage) => {
      if (window.innerWidth < 860) openSidebarRef.current?.();
      if (nextPage) setPage(nextPage);
      await new Promise((resolve) => window.setTimeout(resolve, 280));
      const element = await waitForElement(selector);
      element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
      await new Promise((resolve) => window.setTimeout(resolve, 220));
      return element;
    };

    const removeHotspot = () => {
      hotspot?.remove();
      hotspot = null;
    };

    const placeHotspot = (selector) => {
      removeHotspot();
      const element = document.querySelector(selector);
      if (!element) return;
      const rect = element.getBoundingClientRect();
      hotspot = document.createElement('div');
      hotspot.className = 'tour-hotspot-container';
      hotspot.innerHTML = '<span class="hotspot-ping"></span><span class="hotspot-dot"></span>';
      hotspot.style.left = `${Math.max(12, rect.right - 8)}px`;
      hotspot.style.top = `${Math.max(12, rect.top + rect.height / 2 - 6)}px`;
      document.body.appendChild(hotspot);
    };

    const completeTour = () => {
      if (isCancelled) return;
      window.localStorage.setItem(PRODUCT_TOUR_KEY, PRODUCT_TOUR_VERSION);
      removeHotspot();
      closeSidebarRef.current?.();
    };

    const tourCopy = language === 'en'
      ? {
        back: 'Back',
        skip: 'Skip tour',
        finish: 'Finish tour',
        next: 'Next ->',
        steps: [
          ['Step 1: Find global trends', 'Here Dzhero collects viral global Reels and adapts the meaning for Ukrainian context and audience behavior. Start here.'],
          ['Step 2: Generate a script', 'Based on the selected trend, AI writes a strong hook, video structure, and ready CTA for your niche.'],
          ['Step 3: Calendar and planning', 'A ready script can be planned for any date in one click. The system builds a clear publishing grid for the week ahead.'],
          ['Step 4: Sales automation', 'While you shoot content, the built-in AI manager handles Direct: detects intent, answers questions, and moves people toward a purchase.'],
        ],
      }
      : {
        back: 'Назад',
        skip: 'Пропустити тур',
        finish: 'Завершити тур',
        next: 'Далі ->',
        steps: [
          ['Крок 1: Пошук світових трендів', 'Тут Джеро збирає вірусні глобальні Reels і адаптує їхній сенс під український контекст та поведінку аудиторії. Почни звідси.'],
          ['Крок 2: Генерація сценарію', 'На основі вибраного тренду AI прописує чіпкий хук, структуру відео і готовий заклик до дії для твоєї ніші.'],
          ['Крок 3: Календар і планування', 'Готовий сценарій можна в один клік запланувати на будь-яку дату. Система сформує зрозумілу сітку публікацій на тиждень вперед.'],
          ['Крок 4: Автоматизація продажів', 'Поки ти знімаєш контент, вбудований AI-менеджер обробляє Direct: розпізнає наміри, відповідає на питання і веде до покупки.'],
        ],
      };

    const commonButtons = (includeBack = true, last = false) => [
      ...(includeBack ? [{
        text: tourCopy.back,
        classes: 'tour-btn tour-btn-muted',
        action() {
          return this.back();
        },
      }] : [{
        text: tourCopy.skip,
        classes: 'tour-btn tour-btn-link',
        action() {
          completeTour();
          return this.cancel();
        },
      }]),
      {
        text: last ? tourCopy.finish : tourCopy.next,
        classes: 'tour-btn tour-btn-primary',
        action() {
          if (last) {
            completeTour();
            return this.complete();
          }
          return this.next();
        },
      },
    ];

    const tour = new Shepherd.Tour({
      useModalOverlay: true,
      defaultStepOptions: {
        cancelIcon: { enabled: true },
        classes: 'dzhero-tour-popover',
        scrollTo: false,
        modalOverlayOpeningPadding: 8,
        modalOverlayOpeningRadius: 8,
      },
    });

    const steps = [
      {
        id: 'transcript',
        selector: '[data-tour="sidebar-transcript"]',
        page: null,
        attachTo: 'right',
        title: tourCopy.steps[0][0],
        text: tourCopy.steps[0][1],
        buttons: commonButtons(false),
      },
      {
        id: 'script',
        selector: '[data-tour="generate-script-btn"]',
        page: 'assistant',
        attachTo: 'bottom',
        title: tourCopy.steps[1][0],
        text: tourCopy.steps[1][1],
        buttons: commonButtons(true),
      },
      {
        id: 'calendar',
        selector: '[data-tour="sidebar-calendar"]',
        page: null,
        attachTo: 'right',
        title: tourCopy.steps[2][0],
        text: tourCopy.steps[2][1],
        buttons: commonButtons(true),
      },
      {
        id: 'direct',
        selector: '[data-tour="sidebar-direct"]',
        page: null,
        attachTo: 'right',
        title: tourCopy.steps[3][0],
        text: tourCopy.steps[3][1],
        buttons: commonButtons(true, true),
      },
    ];

    steps.forEach((step) => {
      tour.addStep({
        id: step.id,
        title: step.title,
        text: step.text,
        attachTo: { element: step.selector, on: step.attachTo },
        buttons: step.buttons,
        beforeShowPromise: () => prepareTarget(step.selector, step.page),
        when: {
          show: () => placeHotspot(step.selector),
          hide: removeHotspot,
        },
      });
    });

    tour.on('cancel', completeTour);
    tour.on('complete', completeTour);
    tourRef.current = tour;

    let hasStarted = false;
    const startTimer = window.setTimeout(() => {
      if (isCancelled) return;
      hasStarted = true;
      startedRef.current = true;
      Promise.resolve(tour.start()).catch((error) => {
        console.error('product-tour-start-error', error);
      });
    }, 700);

    return () => {
      if (hasStarted) return;
      isCancelled = true;
      window.clearTimeout(startTimer);
      removeHotspot();
      tour.cancel();
      tourRef.current = null;
    };
  }, [currentUser, dataReady, page, setPage]);

  return null;
}

function buildBrandScanPreview(input, publicMetadata = null) {
  const metadataText = [
    publicMetadata?.title,
    publicMetadata?.description,
    publicMetadata?.handle,
    publicMetadata?.analysisText,
  ].filter(Boolean).join(' ');
  const value = `${input} ${metadataText}`.toLowerCase();
  const profiles = [
    {
      matches: ['fitness', 'workout', 'training', 'тренув', 'фітнес', 'фитнес', 'спорт', 'здоров', 'схуд', 'йога', 'pilates'],
      label: 'Фітнес / wellness',
      cards: [
        ['Портрет бренду', 'Wellness-акаунт, де аудиторія шукає просту систему, мотивацію, видимий прогрес і відчуття “я теж зможу”.'],
        ['Контент DNA', 'Коротка обіцянка результату, демонстрація вправи або ритуалу, доказ регулярності і CTA на старт.'],
        ['Перший фокус', 'Зібрати серію: 20-хвилинне тренування, помилка новачка, міні-челендж на 7 днів.'],
      ],
      plan: [
        ['Пн', 'Short-form: 1 вправа + результат для тіла'],
        ['Ср', 'Карусель: 5 помилок у домашніх тренуваннях'],
        ['Пт', 'Stories/Shorts: 7-денний челендж + CTA'],
      ],
      ideas: ['тренування', 'прогрес', 'здоровʼя', 'челендж'],
    },
    {
      matches: ['cafe', 'coffee', 'кава', 'кав', 'снідан', 'ресторан', 'бар', 'їжа', 'кухн', 'recipes'],
      label: 'Кафе / їжа',
      cards: [
        ['Портрет бренду', 'Локальний food-бізнес, якому треба показувати смак, атмосферу і причину прийти саме сьогодні.'],
        ['Контент DNA', 'Апетитний перший кадр, коротка історія продукту, соціальний доказ і простий CTA в Direct.'],
        ['Перший фокус', 'Зняти три ролики: хіт меню, backstage приготування і “що обрати новому гостю”.'],
      ],
      plan: [
        ['Пн', 'Short-form: страва дня + крупний план'],
        ['Ср', 'Карусель: 5 причин зайти на сніданок'],
        ['Пт', 'Stories/Shorts: відгук гостя + CTA'],
      ],
      ideas: ['меню-хіт', 'атмосфера', 'відгуки', 'маршрут'],
    },
    {
      matches: ['beauty', 'бьют', 'бʼют', 'салон', 'манікюр', 'волос', 'космет', 'бров', 'makeup', 'spa'],
      label: 'Бʼюті / сервіс',
      cards: [
        ['Портрет бренду', 'Сервісний бізнес, де рішення приймають через довіру, результат “до/після” і відчуття турботи.'],
        ['Контент DNA', 'Проблема клієнта, процес, видимий результат, мʼякий CTA на запис.'],
        ['Перший фокус', 'Зібрати серію “до/після”, короткі поради та відповіді на страхи перед записом.'],
      ],
      plan: [
        ['Пн', 'Short-form: до/після + 1 причина результату'],
        ['Ср', 'Пост: помилки домашнього догляду'],
        ['Пт', 'Stories: вільні вікна + ключове слово'],
      ],
      ideas: ['до/після', 'довіра', 'процес', 'запис'],
    },
    {
      matches: ['майка', 'майки', 'футболка', 'футболки', 'боді', 'боди', 'лонгслів', 'лонгслив', 'сукня', 'сукні', 'комбінезон', 'топ', 'одяг', 'clothes', 'fashion'],
      label: 'Магазин одягу',
      cards: [
        ['Портрет бренду', 'Fashion-бренд, де аудиторія обирає речі через посадку, тканину, готові образи і довіру до візуалу.'],
        ['Контент DNA', 'Перший кадр з образом, деталь тканини або посадки, варіанти стилізації і простий CTA в Direct.'],
        ['Перший фокус', 'Показати три сценарії: готовий образ, деталі речі зблизька, як носити одну позицію кількома способами.'],
      ],
      plan: [
        ['Пн', 'Short-form: один образ у трьох деталях'],
        ['Ср', 'Карусель: як стилізувати базову річ'],
        ['Пт', 'Short-form: новинка + CTA “хочу”'],
      ],
      ideas: ['образи', 'посадка', 'деталі тканини', 'новинки'],
    },
    {
      matches: ['shop', 'store', 'магаз', 'товар', 'бренд', 'дроп', 'косметика', 'доставка'],
      label: 'Магазин / товар',
      cards: [
        ['Портрет бренду', 'Товарний бренд, якому треба швидко пояснити цінність, показати деталі і підштовхнути до покупки.'],
        ['Контент DNA', 'Перший кадр з продуктом, проблема покупця, демонстрація, доказ і CTA “хочу”.'],
        ['Перший фокус', 'Показати три сценарії: товар у житті, порівняння, комплектація або деталі.'],
      ],
      plan: [
        ['Пн', 'Short-form: товар у реальній ситуації'],
        ['Ср', 'Карусель: як обрати правильний варіант'],
        ['Пт', 'Short-form: розпаковка + CTA “хочу”'],
      ],
      ideas: ['демо товару', 'порівняння', 'деталі', 'відгук'],
    },
    {
      matches: ['експерт', 'курс', 'консультац', 'коуч', 'юрист', 'психолог', 'маркетолог', 'smm', 'освіт', 'навчан'],
      label: 'Експерт / послуга',
      cards: [
        ['Портрет бренду', 'Експертний бізнес, де продаж іде через чітку думку, приклади, довіру і простий наступний крок.'],
        ['Контент DNA', 'Сильний тезис, приклад з практики, короткий фреймворк і CTA на консультацію.'],
        ['Перший фокус', 'Зняти серію з трьох тем: помилка аудиторії, розбір кейсу, міні-метод.'],
      ],
      plan: [
        ['Пн', 'Short-form: 1 помилка клієнтів'],
        ['Ср', 'Пост: міні-фреймворк у 3 кроки'],
        ['Пт', 'Short-form: кейс + CTA на консультацію'],
      ],
      ideas: ['експертність', 'кейс', 'помилка', 'консультація'],
    },
  ];
  const fallback = {
    label: 'Локальний бізнес',
    cards: [
      ['Портрет бренду', 'Бізнес, якому потрібна регулярна коротка подача без щоденного хаосу і випадкових постів.'],
      ['Контент DNA', 'Проблема аудиторії, доказ, короткий сценарій, один чіткий CTA.'],
      ['Перший фокус', 'Зняти не “все підряд”, а три ролики, які ведуть до заявки або покупки.'],
    ],
    plan: [
      ['Пн', 'Short-form: проблема + рішення'],
      ['Ср', 'Карусель: 5 помилок аудиторії'],
      ['Пт', 'Proof-пост + CTA'],
    ],
    ideas: ['довіра', 'продукт', 'користь', 'заявка'],
  };
  return profiles.find((profile) => profile.matches.some((word) => value.includes(word))) || fallback;
}

function detectBrandScanSource(input) {
  const value = input.trim().toLowerCase();
  if (/youtube\.com\/shorts|youtu\.be|youtube\.com/i.test(value)) {
    return { label: 'YouTube Shorts', tone: 'shorts' };
  }
  if (/tiktok\.com|vm\.tiktok\.com/i.test(value)) {
    return { label: 'TikTok', tone: 'tiktok' };
  }
  if (/instagram\.com|@[\w.]+/i.test(value)) {
    return { label: 'Instagram', tone: 'instagram' };
  }
  if (/https?:\/\/|www\./i.test(value)) {
    return { label: 'Website', tone: 'website' };
  }
  return { label: 'Опис бізнесу', tone: 'text' };
}

function cleanPublicProfileTitle(value, handle = '') {
  const raw = String(value || '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  const withoutInstagramSuffix = raw
    .replace(/\s*-\s*See Instagram photos and videos.*$/i, '')
    .replace(/\s*\(\s*@?[\w.]+\s*\)\s*$/i, '')
    .trim();
  if (!handle) return withoutInstagramSuffix;
  const escapedHandle = handle.replace(/^@/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return withoutInstagramSuffix.replace(new RegExp(`\\s*\\(@?${escapedHandle}\\)\\s*$`, 'i'), '').trim();
}

const USEFUL_SOURCE_METADATA_STATUSES = ['public_metadata', 'instagram_web_profile', 'youtube_api', 'youtube_oembed'];

function hasSourceMetadata(metadata) {
  return USEFUL_SOURCE_METADATA_STATUSES.includes(metadata?.sourceStatus);
}

function hasReadableSourceMetadata(metadata) {
  if (!hasSourceMetadata(metadata)) return false;
  const title = String(metadata?.title || '').trim();
  const description = String(metadata?.description || '').trim();
  const analysisText = String(metadata?.analysisText || '').trim();
  if (metadata?.source?.tone === 'instagram' && /^instagram$/i.test(title) && !description) return false;
  const usefulText = [title, description, analysisText]
    .join(' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/@\w[\w.]+/g, ' ')
    .replace(/\binstagram\b/gi, ' ')
    .replace(/\bfollowers?|following|posts?\b/gi, ' ')
    .replace(/[0-9.,]+[KMB]?/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return /[a-zа-яіїєґ]{3,}/i.test(usefulText);
}

function canBuildFromSourceOnly(input, metadata) {
  const source = detectBrandScanSource(input);
  return source.tone === 'text' || hasReadableSourceMetadata(metadata);
}

function metadataStatChips(metadata) {
  const stats = metadata?.stats || {};
  return [
    stats.followers && `${stats.followers} followers`,
    stats.posts && `${stats.posts} posts`,
    stats.views && `${stats.views} views`,
    stats.likes && `${stats.likes} likes`,
    stats.subscribers && `${stats.subscribers} subscribers`,
    stats.videos && `${stats.videos} videos`,
  ].filter(Boolean);
}

function buildPublicMetadataCards(preview, metadata) {
  if (!hasSourceMetadata(metadata)) return preview.cards;
  const visibleStats = metadataStatChips(metadata).slice(0, 3).join(' · ');
  const publicTitle = cleanPublicProfileTitle(metadata.title, metadata.handle);
  const normalizedHandle = metadata.handle
    ? metadata.handle.startsWith('@') ? metadata.handle : metadata.handle
    : '';
  const profileLine = [normalizedHandle, publicTitle].filter(Boolean).join(' — ');
  const signalLine = [
    visibleStats,
    preview.label && `ніша: ${preview.label}`,
  ].filter(Boolean).join('. ');
  return [
    [
      'Профіль',
      profileLine || 'Джеро знайшов відкриту сторінку і використав її meta-опис як контекст.',
    ],
    [
      'Сигнали бренду',
      signalLine || 'Є базовий контекст для першої генерації.',
    ],
    preview.cards?.[2] || ['Перший фокус', 'Зібрати три ролики, які ведуть до заявки або покупки.'],
  ];
}

function buildBrandScanExample(scan) {
  const label = scan?.label || 'Локальний бізнес';
  const planTitle = scan?.plan?.[0]?.[1] || 'Short-form: проблема + рішення';
  if (/фітнес|wellness/i.test(label)) {
    return {
      title: 'Приклад генерації: відео на 20 секунд',
      hook: 'Немає години на зал? Почни з 20 хвилин вдома.',
      script: [
        ['0-2с', 'Кадр: людина відкладає тренування, на екрані “немає часу”.'],
        ['3-8с', 'Показати 2 прості вправи без інвентарю, швидкий темп монтажу.'],
        ['9-15с', 'Доказ: “20 хвилин, 3 рази на тиждень, без складного плану”.'],
        ['16-20с', 'CTA: “Напиши START, і я надішлю перший міні-комплекс”.'],
      ],
      caption: '20 хвилин краще, ніж “почну з понеділка”. Збережи цей міні-старт і напиши START, якщо хочеш перший комплекс.',
    };
  }
  return {
    title: `Приклад генерації: ${planTitle}`,
    hook: 'Покажи одну проблему клієнта і дай простий наступний крок.',
    script: [
      ['0-2с', 'Перший кадр з болем або бажанням аудиторії.'],
      ['3-8с', 'Показати продукт, процес або приклад з реального життя.'],
      ['9-15с', 'Додати доказ: цифра, відгук, деталь або міні-кейс.'],
      ['16-20с', 'CTA: попросити написати ключове слово в Direct.'],
    ],
    caption: 'Один простий крок замість хаотичного контенту. Напиши “план”, і я підкажу, з чого почати.',
  };
}

function buildReelFromBrandScan(scan) {
  const firstPlan = scan?.plan?.[0]?.[1] || 'Short-form: проблема + рішення';
  const firstCard = scan?.cards?.[0]?.[1] || 'Бізнес, якому потрібна регулярна коротка подача без щоденного хаосу.';
  const sourceLabel = scan?.sourceType || 'Brand Scan';
  return {
    id: `brand-scan-${Date.now()}`,
    market: 'ua',
    title: firstPlan,
    handle: sourceLabel,
    sourceHandle: sourceLabel,
    score: 91,
    views: 'preview',
    likes: '-',
    comments: '-',
    status: [scan?.label || 'Локальний бізнес', ...(scan?.ideas || []).slice(0, 3)],
    tag: 'D',
    caption: `${firstCard} Джеро зібрав це з Brand Scan і готує сценарій під перший тиждень.`,
    transcript: (scan?.cards || []).map(([title, text]) => `${title}: ${text}`).join('\n'),
    sourceUrl: scan?.source || '',
    sourceType: scan?.sourceType,
    sourceStatus: scan?.sourceStatus || 'preview',
    importedMetadata: scan?.metadata || null,
    scanPlan: scan?.plan || [],
    scanCards: scan?.cards || [],
    scanIdeas: scan?.ideas || [],
    scanExample: scan?.example || null,
    scanCapabilities: scan?.capabilities || null,
    scanLabel: scan?.label || 'Локальний бізнес',
  };
}

function buildBrandBrainFromScanReel(reel, language = 'uk') {
  const metadata = reel?.importedMetadata || {};
  const stats = metadata.stats || {};
  const cards = Array.isArray(reel?.scanCards) ? reel.scanCards : [];
  const cardText = Object.fromEntries(cards.map(([title, text]) => [title, text]));
  const draft = buildBrandBrainDraft({
    label: reel?.scanLabel || reel?.status?.[0] || '',
    title: metadata.title || '',
    description: metadata.description || '',
    handle: metadata.handle || reel?.sourceHandle || '',
    stats,
    exampleCaption: reel?.scanExample?.caption || '',
    language,
  });
  const productLine = draft.product;
  const productLooksLikeClothing = /майк|футбол|бод[іи]|лонгслів|лонгслив|сукн|комбінез|топ|одяг|clothes|fashion/i.test(productLine);
  const businessType = productLooksLikeClothing
    ? (language === 'en' ? 'Clothing store' : 'Магазин одягу')
    : draft.businessType || reel?.scanLabel || reel?.status?.[0] || 'Локальний бізнес';
  const proofParts = [
    draft.proof,
    cardText['Сигнали бренду'],
  ].filter(Boolean);
  return {
    businessType,
    product: productLine,
    audience: draft.audience || cardText['Портрет бренду'] || cardText['Публічний профіль'] || cardText['Профіль'] || '',
    location: 'онлайн / Україна',
    toneOfVoice: 'коротко, конкретно, дружньо, без перебільшень',
    offer: draft.offer || productLine || reel?.scanPlan?.[0]?.[1] || '',
    cta: draft.cta || 'вести в Direct через просте ключове слово',
    proof: proofParts.join(' · '),
    stopTopics: ['не вигадувати цифри', 'не копіювати чужий контент дослівно', 'не обіцяти результат без доказу'],
    sourceUrl: reel?.sourceUrl || '',
    sourceStatus: reel?.sourceStatus || 'preview',
  };
}

function composeBrandScanResult(cleanInput, metadata = null, capabilities = null) {
  const source = detectBrandScanSource(cleanInput);
  const preview = buildBrandScanPreview(cleanInput, metadata);
  const resolvedSource = metadata?.source || source;
  const example = buildBrandScanExample(preview);
  return {
    source: cleanInput,
    sourceType: resolvedSource.label,
    sourceTone: resolvedSource.tone,
    ...preview,
    cards: buildPublicMetadataCards(preview, metadata),
    studioInsight: preview.cards?.[1]?.[1],
    example,
    metadata,
    capabilities,
    sourceStatus: metadata?.sourceStatus || (source.tone === 'text' ? 'manual_text' : 'url_only'),
    title: source.tone === 'text'
      ? 'Preview по опису бізнесу готовий'
      : ['youtube_api', 'youtube_oembed'].includes(metadata?.sourceStatus)
        ? 'YouTube джерело проаналізовано'
      : ['public_metadata', 'instagram_web_profile'].includes(metadata?.sourceStatus)
        ? 'Публічний профіль проаналізовано'
        : 'Preview по джерелу готовий',
  };
}

function GoogleIcon() {
  return (
    <svg className="google-auth-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5c-.3 1.4-1.1 2.7-2.3 3.5v2.9h3.7c2.2-2 3.6-4.9 3.6-8.5z" />
      <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.7-2.9c-1 .7-2.4 1.1-4.2 1.1-3.1 0-5.7-2.1-6.7-4.9H1.5v3C3.4 21.3 7.4 24 12 24z" />
      <path fill="#FBBC05" d="M5.3 14.4c-.2-.7-.4-1.5-.4-2.4s.1-1.6.4-2.4v-3H1.5C.6 8.3 0 10.1 0 12s.6 3.7 1.5 5.4l3.8-3z" />
      <path fill="#EA4335" d="M12 4.7c1.7 0 3.3.6 4.5 1.8l3.3-3.3C17.9 1.2 15.2 0 12 0 7.4 0 3.4 2.7 1.5 6.6l3.8 3C6.3 6.8 8.9 4.7 12 4.7z" />
    </svg>
  );
}

function BrandScanGate({ onAuth, notify, theme, themeMode, setThemeMode, language, setLanguage }) {
  useI18n();
  const [scanInput, setScanInput] = useState('');
  const [scanResult, setScanResult] = useState(null);
  const [error, setError] = useState('');
  const [loginPrompt, setLoginPrompt] = useState('');
  const [instagramConfig, setInstagramConfig] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const scanCopy = language === 'en'
    ? {
      brandSub: 'AI producer for Ukrainian business',
      eyebrow: 'Brand Scan',
      headline: 'Generate a content plan for your business',
      lead: 'Paste Instagram, TikTok, YouTube Shorts, a website, or briefly describe the business. Dzhero will collect signals, ideas, scripts, and a weekly plan.',
      inputPlaceholder: 'Example: @central.cafe, youtube.com/shorts/... or a coffee shop in Lviv with breakfasts...',
      buildButton: 'Build content plan',
      scanningButton: 'Scanning...',
      googleButton: 'Sign in with Google',
      privacy: 'Secure sign-in through your Google account.',
      demoButton: 'View demo',
      ready: 'Preview ready',
      panelIntro: 'What you get in 30 seconds',
      panelTitle: 'Results, not a technical dashboard',
      loadingTitle: 'Jeryk scans the source',
      loadingText: 'Checking the profile, niche, and first ideas for the content plan.',
      before: 'Before',
      beforeText: 'Thinking every day about what to post',
      after: 'After',
      afterText: 'Weekly plan, hooks, scripts, and Direct prompts',
      source: 'Source',
      profile: 'Profile',
      firstGeneration: 'First generation',
      firstWeek: 'First week',
      whatToShoot: 'What to shoot',
      studioPreview: 'Studio preview',
      studioInsight: 'Dzhero turns Brand Scan into a script, shot list, and first CTA.',
      hookTip: 'Show the problem in the first 2 seconds',
      proofTip: 'Add an example, process, or result',
      ctaTip: 'Ask people to send a keyword in Direct',
      save: 'Save',
      addPlan: 'Add to content plan',
      continue: 'Continue',
      loginEyebrow: 'Login after value',
      loginPrefix: 'Sign in to',
      loginText: 'You can enter the demo now. Sources and login method stay independent.',
      opening: 'Opening...',
      loginContinue: 'Sign in and continue',
      terms: 'Terms',
      privacyLink: 'Privacy',
      emptyError: 'Paste a profile, website, or short business description.',
      demoError: 'Demo login did not work. Check the server connection.',
      serverError: 'The server is not responding. Check Railway deploy or local backend.',
      previewDailyLimit: 'Daily public preview capacity is used. Sign in with Google to continue.',
      googleError: 'Google sign-in will be available after login setup is finished.',
      googleNotify: 'Google Login still needs Railway env setup.',
      sourceRead: 'Dzhero read the source and built a production preview.',
      publicRead: 'Dzhero read the public account description.',
      previewBuilt: 'Dzhero built a preview plan without connecting the account.',
      insufficientSource: 'The public profile does not provide enough data. Add a short business description after the link: what you sell, who it is for, and the CTA.',
      insufficientSourceNotice: 'There is not enough public data. Add a short description and Dzhero will build a factual preview.',
      loginRequired: 'To save the result, sign in. The preview is already ready.',
      metaPreview: 'Preview works without connecting the account.',
      actions: {
        saveBrandScan: 'save Brand Scan',
        addToCalendar: 'add the plan to the calendar',
        continueStudio: 'continue in Studio',
      },
      previewSignals: [
        ['Signals', '5 ideas from short-form, websites, and competitor mechanics'],
        ['Scripts', '3 structures: hook, contrast, steps, CTA'],
        ['Plan', '7 days of content focused on sales and trust'],
        ['Direct', 'Keyword prompt for incoming leads'],
      ],
    }
    : {
      brandSub: 'AI-продюсер для українського бізнесу',
      eyebrow: 'Brand Scan',
      headline: 'Згенеруй контент-план для свого бізнесу',
      lead: 'Встав Instagram, TikTok, YouTube Shorts, сайт або коротко опиши бізнес. Джеро збере сигнали, ідеї, сценарії та план на тиждень.',
      inputPlaceholder: 'Наприклад: @central.cafe, youtube.com/shorts/... або кавʼярня у Львові, сніданки...',
      buildButton: 'Побудувати контент-план',
      scanningButton: 'Скануємо...',
      googleButton: 'Увійти через Google',
      privacy: 'Безпечний вхід через твій Google-акаунт.',
      demoButton: 'Подивитись демо',
      ready: 'Preview готовий',
      panelIntro: 'Що отримаєш за 30 секунд',
      panelTitle: 'Результат, а не технічний кабінет',
      loadingTitle: 'Джерик сканує джерело',
      loadingText: 'Дивлюся профіль, нішу і перші ідеї для контент-плану.',
      before: 'Було',
      beforeText: 'Кожного дня думати, що постити',
      after: 'Стало',
      afterText: 'Тижневий план, хуки, сценарії та Direct-підказки',
      source: 'Джерело',
      profile: 'Профіль',
      firstGeneration: 'Перша генерація',
      firstWeek: 'Перший тиждень',
      whatToShoot: 'Що знімати',
      studioPreview: 'Studio preview',
      studioInsight: 'Джеро перетворює Brand Scan у сценарій, shot-list і перший CTA.',
      hookTip: 'Покажи проблему в перші 2 секунди',
      proofTip: 'Додай приклад, процес або результат',
      ctaTip: 'Запроси написати ключове слово в Direct',
      save: 'Зберегти',
      addPlan: 'Додати в контент-план',
      continue: 'Продовжити',
      loginEyebrow: 'Логін після цінності',
      loginPrefix: 'Увійди, щоб',
      loginText: 'Можна зайти через demo зараз. Джерела і спосіб входу залишаються незалежними.',
      opening: 'Відкриваємо...',
      loginContinue: 'Увійти і продовжити',
      terms: 'Умови',
      privacyLink: 'Приватність',
      emptyError: 'Встав профіль, сайт або коротко опиши бізнес.',
      demoError: 'Демо-вхід не спрацював. Перевір підключення до сервера.',
      serverError: 'Сервер не відповідає. Перевір Railway deploy або локальний backend.',
      previewDailyLimit: 'Денний ліміт публічних preview вичерпано. Увійди через Google, щоб продовжити.',
      googleError: 'Google-вхід буде доступний після завершення налаштування входу.',
      googleNotify: 'Google Login ще треба підключити в Railway env.',
      sourceRead: 'Джеро прочитав джерело і зібрав production preview.',
      publicRead: 'Джеро прочитав публічний опис акаунта.',
      previewBuilt: 'Джеро зібрав preview-план без підключення акаунта.',
      insufficientSource: 'Не вдалося прочитати відкритий профіль. Додай короткий опис бізнесу після посилання: що продаєте, для кого і який CTA.',
      insufficientSourceNotice: 'Публічних даних недостатньо. Додай короткий опис, і Джеро збере preview без вигадок.',
      loginRequired: 'Щоб зберегти результат, треба увійти. Preview вже готовий.',
      metaPreview: 'Preview працює без підключення акаунта.',
      actions: {
        saveBrandScan: 'зберегти Brand Scan',
        addToCalendar: 'додати план у календар',
        continueStudio: 'продовжити в Studio',
      },
      previewSignals: [
        ['Сигнали', '5 ідей із short-form, сайтів і конкурентних механік'],
        ['Сценарії', '3 структури: хук, контраст, кроки, CTA'],
        ['План', '7 днів контенту з фокусом на продаж і довіру'],
        ['Direct', 'Підказка під ключове слово для заявки'],
      ],
    };
  const buildPreviewPlan = async () => {
    const cleanInput = scanInput.trim();
    if (!cleanInput) {
      setError(scanCopy.emptyError);
      return;
    }
    setIsScanning(true);
    let metadata = null;
    let capabilities = null;
    try {
      const response = await fetch(`${API_BASE}/brand-scan/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: cleanInput }),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 429 && payload.error === 'preview_global_daily_limit_reached') {
        setError(scanCopy.previewDailyLimit);
        notify(scanCopy.previewDailyLimit);
        return;
      }
      if (response.ok) {
        metadata = payload.metadata || null;
        capabilities = payload.capabilities || null;
      }
    } catch {
      metadata = null;
    } finally {
      setIsScanning(false);
    }
    if (!canBuildFromSourceOnly(cleanInput, metadata)) {
      setSourcePreview(null);
      setSourceError(scanCopy.insufficientSource);
      notify(scanCopy.insufficientSourceNotice);
      return;
    }
    const result = composeBrandScanResult(cleanInput, metadata, capabilities);
    setError('');
    setScanResult(result);
    setLoginPrompt('');
    notify(['youtube_api', 'youtube_oembed'].includes(metadata?.sourceStatus)
      ? scanCopy.sourceRead
      : hasSourceMetadata(metadata)
        ? scanCopy.publicRead
        : scanCopy.previewBuilt);
  };

  const requestLoginForAction = (actionLabel) => {
    if (scanResult) {
      window.localStorage.setItem(BRAND_SCAN_PENDING_KEY, JSON.stringify(scanResult));
    }
    setLoginPrompt(actionLabel);
    notify(scanCopy.loginRequired);
  };

  const enterDemo = async (destination = null) => {
    setError('');
    setIsLoading(true);
    try {
      if (scanResult) {
        window.localStorage.setItem(BRAND_SCAN_PENDING_KEY, JSON.stringify(scanResult));
      }
      const response = await fetch(`${API_BASE}/auth/demo`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(destination === 'agent-studio' ? { experience: 'agent_studio' } : {}),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'demo_error');
      onAuth(payload, destination);
    } catch {
      setError(scanCopy.demoError);
      notify(scanCopy.serverError);
    } finally {
      setIsLoading(false);
    }
  };

  const startGoogleLogin = async () => {
    setError('');
    setIsLoading(true);
    try {
      if (scanResult) {
        window.localStorage.setItem(BRAND_SCAN_PENDING_KEY, JSON.stringify(scanResult));
      }
      const response = await fetch(`${API_BASE}/auth/google/start`, { credentials: 'include' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'google_not_configured');
      window.location.href = payload.authUrl;
    } catch {
      setError(scanCopy.googleError);
      notify(scanCopy.googleNotify);
    } finally {
      setIsLoading(false);
    }
  };

  const startInstagramLogin = async () => {
    setError('');
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/auth/meta/start`, { credentials: 'include' });
      const payload = await response.json();
      if (!response.ok) {
        if (payload.error === 'meta_not_configured') setInstagramConfig(payload);
        throw new Error(payload.error || 'meta_not_configured');
      }
      window.location.href = payload.authUrl;
    } catch {
      setInstagramConfig((current) => current || { error: 'meta_not_configured' });
      notify(scanCopy.metaPreview);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="auth-page brand-scan-page">
      <section className="auth-shell brand-scan-shell">
        <div className="auth-copy brand-scan-copy">
          <div className="brand auth-brand">
            <div className="logo">
              <img src={logoImg} alt="Dzhero Logo" />
            </div>
            <div>
              <strong>Dzhero</strong>
              <span>{scanCopy.brandSub}</span>
            </div>
          </div>
          <small>{scanCopy.eyebrow}</small>
          <h1>{scanCopy.headline}</h1>
          <p className="auth-lead">{scanCopy.lead}</p>
          <div className="auth-scan-form">
            <textarea
              value={scanInput}
              onChange={(event) => setScanInput(event.target.value)}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') buildPreviewPlan();
              }}
              placeholder={scanCopy.inputPlaceholder}
              rows={3}
            />
            <div className="auth-scan-actions">
              <button className="auth-submit primary" type="button" onClick={buildPreviewPlan} disabled={isScanning}>
                <Sparkles size={17} /> {isScanning ? scanCopy.scanningButton : scanCopy.buildButton}
              </button>
            </div>
            <div className="auth-access-card">
              <button className="google-auth-button" type="button" onClick={startGoogleLogin} disabled={isLoading}>
                <GoogleIcon />
                {scanCopy.googleButton}
              </button>
              <button
                className="agent-studio-demo-button"
                type="button"
                onClick={() => enterDemo('agent-studio')}
                disabled={isLoading}
              >
                <Bot size={17} />
                {isLoading
                  ? scanCopy.opening
                  : language === 'en'
                    ? 'Open Agent Studio demo'
                    : 'Відкрити демо Agent Studio'}
              </button>
            </div>
            <p className="auth-privacy-note">
              {scanCopy.privacy}
              <button className="demo-link-inline" type="button" onClick={() => enterDemo()} disabled={isLoading}>
                {scanCopy.demoButton}
              </button>
            </p>
          </div>
        </div>
        <form className="auth-panel brand-scan-panel" onSubmit={(event) => event.preventDefault()}>
          <div className="auth-panel-head">
            <div>
              <small>{scanResult ? scanCopy.ready : scanCopy.panelIntro}</small>
              <h2>{scanResult ? scanResult.title : scanCopy.panelTitle}</h2>
            </div>
            <div className="auth-top-controls">
              <div className="language-switch" aria-label={language === 'en' ? 'Interface language' : 'Мова інтерфейсу'}>
                <button type="button" className={language === 'uk' ? 'active' : ''} onClick={() => setLanguage('uk')}>UK</button>
                <button type="button" className={language === 'en' ? 'active' : ''} onClick={() => setLanguage('en')}>EN</button>
              </div>
              <button className={themeMode === 'auto' ? 'icon active' : 'icon'} type="button" title={themeMode === 'auto' ? 'Auto theme' : 'Тема'} onClick={() => setThemeMode(getNextThemeMode(themeMode))}>
                {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              </button>
            </div>
          </div>
          {isScanning && !scanResult ? (
            <JerykLoading
              title={scanCopy.loadingTitle}
              text={scanCopy.loadingText}
            />
          ) : !scanResult ? (
            <>
              <div className="auth-preview-stack">
                {scanCopy.previewSignals.map(([title, text], index) => (
                  <article key={title}>
                    <span>0{index + 1}</span>
                    <strong>{title}</strong>
                    <p>{text}</p>
                  </article>
                ))}
              </div>
              <div className="auth-before-after">
                <div>
                  <small>{scanCopy.before}</small>
                  <strong>{scanCopy.beforeText}</strong>
                </div>
                <div>
                  <small>{scanCopy.after}</small>
                  <strong>{scanCopy.afterText}</strong>
                </div>
              </div>
            </>
          ) : (
            <div className="auth-scan-result">
              <div className="scan-source">
                <span>{scanCopy.source}</span>
                <strong data-i18n-content>{scanResult.source}</strong>
                <em data-i18n-content data-source={scanResult.sourceTone}>{scanResult.sourceType}</em>
              </div>
              {hasSourceMetadata(scanResult.metadata) && (
                <div className="scan-public-meta">
                  <span>{scanCopy.profile}</span>
                  <strong data-i18n-content>{scanResult.metadata.handle}</strong>
                  <p data-i18n-content>{scanResult.metadata.title || scanResult.metadata.description}</p>
                  <div>
                    {metadataStatChips(scanResult.metadata).map((chip) => <b key={chip}>{chip}</b>)}
                  </div>
                </div>
              )}
              <div className="scan-niche-row">
                <strong>{scanResult.label}</strong>
                {scanResult.ideas.map((idea) => <span key={idea}>{idea}</span>)}
              </div>
              {scanResult.example && (
                <div className="scan-example-block">
                  <div className="scan-example-head">
                    <small>{scanCopy.firstGeneration}</small>
                    <strong>{scanResult.example.title}</strong>
                  </div>
                  <div className="scan-example-hook">
                    <span>Hook</span>
                    <p>{scanResult.example.hook}</p>
                  </div>
                  <div className="scan-example-script">
                    {scanResult.example.script.map(([time, text]) => (
                      <span key={time}><b>{time}</b>{text}</span>
                    ))}
                  </div>
                  <div className="scan-example-caption">
                    <span>Caption</span>
                    <p>{scanResult.example.caption}</p>
                  </div>
                </div>
              )}
              <div className="scan-week-block">
                <div className="scan-week-head">
                  <small>{scanCopy.firstWeek}</small>
                  <strong>{scanCopy.whatToShoot}</strong>
                </div>
                <div className="scan-week-plan">
                  {(scanResult.plan || [['Пн', 'Short-form: проблема + рішення'], ['Ср', 'Карусель: 5 помилок'], ['Пт', 'Proof-пост + CTA']]).map(([day, title]) => (
                    <span key={day}><b>{day}</b>{title}</span>
                  ))}
                </div>
              </div>
              <div className="guest-studio-preview">
                <div className="guest-studio-head">
                  <small>{scanCopy.studioPreview}</small>
                  <strong>{scanResult.plan?.[0]?.[1] || 'Short-form: проблема + рішення'}</strong>
                  <p>{scanResult.studioInsight || scanCopy.studioInsight}</p>
                </div>
                <div className="guest-studio-grid">
                  <article>
                    <span>Hook</span>
                    <strong>{scanCopy.hookTip}</strong>
                  </article>
                  <article>
                    <span>Proof</span>
                    <strong>{scanCopy.proofTip}</strong>
                  </article>
                  <article>
                    <span>CTA</span>
                    <strong>{scanCopy.ctaTip}</strong>
                  </article>
                </div>
                <div className="guest-studio-actions">
                  <button type="button" onClick={() => requestLoginForAction(scanCopy.actions.saveBrandScan)}>
                    {scanCopy.save}
                  </button>
                  <button type="button" onClick={() => requestLoginForAction(scanCopy.actions.addToCalendar)}>
                    {scanCopy.addPlan}
                  </button>
                  <button className="primary" type="button" onClick={() => requestLoginForAction(scanCopy.actions.continueStudio)}>
                    {scanCopy.continue}
                  </button>
                </div>
              </div>
              {loginPrompt && (
                <div className="guest-login-prompt">
                  <div>
                    <small>{scanCopy.loginEyebrow}</small>
                    <strong>{scanCopy.loginPrefix} {loginPrompt}</strong>
                    <p>{scanCopy.loginText}</p>
                  </div>
                  <button className="auth-submit primary" type="button" onClick={enterDemo} disabled={isLoading}>
                    {isLoading ? scanCopy.opening : scanCopy.loginContinue}
                  </button>
                </div>
              )}
            </div>
          )}
          <div className="auth-simple-links">
            <a href="/terms" target="_blank" rel="noreferrer">{scanCopy.terms}</a>
            <a href="/privacy" target="_blank" rel="noreferrer">{scanCopy.privacyLink}</a>
          </div>
          {instagramConfig && (
            <div className="instagram-pending">
              <strong>Instagram Login pending</strong>
              <p>Meta App keys ще не підключені на backend. Це не блокує preview-режим.</p>
            </div>
          )}
          {error && <div className="auth-error">{error}</div>}
        </form>
      </section>
    </main>
  );
}

function AuthGate({ onAuth, notify, theme, setTheme, language, setLanguage }) {
  useI18n();
  const [error, setError] = useState('');
  const [instagramConfig, setInstagramConfig] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const authCopy = language === 'en'
    ? {
      brandSub: 'AI producer for Ukraine and global trends',
      eyebrow: 'Signals -> scripts -> weekly plan',
      headline: 'Find the signal. Write the script. Put it into the plan.',
      subheadline: 'Dzhero turns short-form content mechanics into original ideas, scripts, weekly plans, and Direct prompts for your brand.',
      creator: 'Creator or Business',
      panelEyebrow: 'Workspace preview',
      panelTitle: 'Start with Instagram',
      themeTitle: 'Theme',
      instagramLoading: 'Preparing Instagram Login...',
      instagramButton: 'Log in with Instagram',
      pendingTitle: 'Instagram connection pending',
      pendingText: 'The connection is ready in the interface, but the backend is still waiting for Meta App keys. Users do not enter keys: they simply log in through Instagram after App Review.',
      personalRejected: 'Personal accounts are not supported',
      demoButton: 'Start with demo',
      setupError: 'Instagram Login is still being configured. A real connection requires Meta App keys on the backend.',
      setupNotice: 'Instagram Login is ready in the UI, but Meta App keys are required.',
      demoError: 'Demo login did not work. Check the server connection.',
      serverError: 'The server is not responding. Check the Railway deployment or local backend.',
    }
    : {
      brandSub: 'AI-продюсер для України і глобальних трендів',
      eyebrow: 'Сигнали -> сценарії -> план',
      headline: 'Знайти сигнал. Написати сценарій. Поставити в план.',
      subheadline: 'Dzhero перетворює short-form механіки у власні ідеї, сценарії, тижневий план та Direct-підказки для бренду.',
      creator: 'Creator або Business',
      panelEyebrow: 'Перегляд workspace',
      panelTitle: 'Почати з Instagram',
      themeTitle: 'Тема',
      instagramLoading: 'Готуємо Instagram Login...',
      instagramButton: 'Увійти через Instagram',
      pendingTitle: 'Instagram connection pending',
      pendingText: 'Підключення готове в інтерфейсі, але backend ще чекає Meta App keys. Користувачам не треба вводити ключі: вони просто логіняться через Instagram після App Review.',
      personalRejected: 'Personal не підходить',
      demoButton: 'Почати з демо',
      setupError: 'Instagram Login ще налаштовується. Для реального підключення потрібні ключі Meta App у backend.',
      setupNotice: 'Instagram Login готовий у UI, але потрібні ключі Meta App',
      demoError: 'Демо-вхід не спрацював. Перевір підключення до сервера.',
      serverError: 'Сервер не відповідає. Перевір Railway deploy або локальний backend.',
    };

  const startInstagramLogin = async () => {
    setError('');
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/auth/meta/start`, { credentials: 'include' });
      const payload = await response.json();
      if (!response.ok) {
        if (payload.error === 'meta_not_configured') {
          setInstagramConfig(payload);
        }
        throw new Error(payload.error || 'meta_not_configured');
      }
      window.location.href = payload.authUrl;
    } catch (authError) {
      if (authError.message !== 'meta_not_configured') {
        setError(authCopy.setupError);
      }
      notify(authCopy.setupNotice);
    } finally {
      setIsLoading(false);
    }
  };

  const enterDemo = async () => {
    setError('');
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/auth/demo`, { method: 'POST', credentials: 'include' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'demo_error');
      onAuth(payload);
    } catch (authError) {
      setError(authCopy.demoError);
      notify(authCopy.serverError);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-shell">
        <div className="auth-copy">
          <div className="brand auth-brand">
            <div className="logo">
              <img src={logoImg} alt="Dzhero Logo" />
            </div>
            <div>
              <strong>Dzhero</strong>
              <span>{authCopy.brandSub}</span>
            </div>
          </div>
          <small>{authCopy.eyebrow}</small>
          <h1>{authCopy.headline}</h1>
          <p className="auth-lead">{authCopy.subheadline}</p>
          <div className="auth-outcomes">
            <span>Сигнали з Reels і short-form контенту</span>
            <span>UA-адаптація без копіювання</span>
            <span>Сценарій, календар і CTA в Direct</span>
          </div>
        </div>
        <form className="auth-panel" onSubmit={(event) => event.preventDefault()}>
          <div className="auth-panel-head">
            <div>
              <small>{authCopy.panelEyebrow}</small>
              <h2>{authCopy.panelTitle}</h2>
            </div>
            <button className="icon" type="button" title={authCopy.themeTitle} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
          <button className="auth-submit auth-meta-button primary" type="button" onClick={startInstagramLogin} disabled={isLoading}>
            {isLoading ? authCopy.instagramLoading : authCopy.instagramButton}
          </button>
          <button className="auth-demo secondary" type="button" onClick={enterDemo} disabled={isLoading}>
            {authCopy.demoButton}
          </button>
          {instagramConfig && (
            <div className="instagram-pending">
              <strong>{authCopy.pendingTitle}</strong>
              <p>{authCopy.pendingText}</p>
            </div>
          )}
          {error && <div className="auth-error">{error}</div>}
        </form>
      </section>
    </main>
  );
}

function Sidebar({ page, setPage, currentUser, workspaces, activeWorkspace, onWorkspaceChange, onLogout, isOpen, onClose }) {
  const { translateText } = useI18n();
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);
  const tourTargets = {
    home: 'sidebar-home',
    viral: 'sidebar-transcript',
    plan: 'sidebar-calendar',
    sales: 'sidebar-direct',
  };
  const items = [
    ['home', Home, 'Головна', 'core'],
    ['businesses', BriefcaseBusiness, 'Бізнеси', 'later'],
    ['strategy', Target, 'Стратегія', 'later'],
    ['viral', Flame, 'Аналітика трендів', 'mvp'],
    ['competitors', Database, 'Конкуренти', 'mvp'],
    ['remix', Wand2, 'Ремікс-студія', 'mvp'],
    ['ideas', Lightbulb, 'Ідеї', 'mvp'],
    ['assistant', Bot, 'Асистент', 'mvp'],
    ['launches', Rocket, 'Запуски', 'later'],
    ['plan', CalendarDays, 'Контент-план', 'mvp'],
    ['sales', ShoppingBag, 'Продажі', 'mvp'],
    ['analytics', BarChart3, 'Аналітика', 'later'],
    ['legal', ShieldCheck, 'Юридичний сейф', 'later'],
    ['budget', Calculator, 'Бюджет', 'later'],
    ['team', UsersRound, 'Команда', 'later'],
    ['settings', Settings, 'Налаштування', 'mvp'],
  ];

  return (
    <aside className={isOpen ? 'sidebar open' : 'sidebar'}>
      <div className="brand">
        <div className="logo">
          <img src={logoImg} alt="Dzhero Logo" />
        </div>
        <div>
          <strong>Dzhero</strong>
          <span>Україна + світ</span>
        </div>
      </div>
      <button className="mobile-menu-close" type="button" aria-label={translateText('Закрити меню')} onClick={onClose}>
        <X size={18} />
      </button>
      <nav>
        {items.map(([id, Icon, label]) => (
          <button className={page === id ? 'active' : ''} data-tour={tourTargets[id]} key={id} onClick={() => {
            setPage(id);
            onClose?.();
          }}>
            <Icon size={16} />
            <span className="nav-label">{label}</span>
          </button>
        ))}
      </nav>
      <div className="account-switcher">
        {isSwitcherOpen && (
          <div className="workspace-menu">
            {workspaces.map((workspace) => (
              <button
                className={activeWorkspace.id === workspace.id ? 'active' : ''}
                type="button"
                key={workspace.id}
                onClick={() => {
                  onWorkspaceChange(workspace.id);
                  setIsSwitcherOpen(false);
                  onClose?.();
                }}
              >
                <span data-i18n-content>{workspace.name}</span>
                <small data-i18n-content>{workspace.handle} · {workspace.type}</small>
              </button>
            ))}
            <button type="button" onClick={() => { setPage('settings'); setIsSwitcherOpen(false); }}>
              <span>+ Підключити Instagram</span>
              <small>реальні акаунти додамо через підключення</small>
            </button>
          </div>
        )}
        <button className="account" type="button" onClick={() => setIsSwitcherOpen((value) => !value)} aria-expanded={isSwitcherOpen}>
          <div className="avatar">{activeWorkspace?.name?.[0]?.toUpperCase() || currentUser?.name?.[0]?.toUpperCase() || 'A'}</div>
          <div>
            <strong data-i18n-content>{activeWorkspace?.name || currentUser?.name || 'Адмін'}</strong>
            <span data-i18n-content>{activeWorkspace?.handle || currentUser?.email || 'робочий простір'}</span>
          </div>
          <ChevronDown size={14} />
        </button>
        <button className="logout-button" type="button" title={translateText('Вийти')} onClick={onLogout}>
          <LogOut size={14} />
        </button>
      </div>
    </aside>
  );
}

function CleanSidebar({ page, setPage, currentUser, workspaces, activeWorkspace, language, onWorkspaceChange, onLogout, isOpen, onClose }) {
  useI18n();
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);
  const accountName = currentUser?.name || currentUser?.email?.split('@')?.[0] || (language === 'en' ? 'Your account' : 'Твій кабінет');
  const accountEmail = currentUser?.email || (language === 'en' ? 'Demo session' : 'Демо-сесія');
  const accountInitial = (currentUser?.name || currentUser?.email || 'D').trim()[0]?.toUpperCase() || 'D';
  const providerLabel = currentUser?.provider === 'google'
    ? 'Google'
    : currentUser?.provider === 'email'
      ? 'Email'
      : (language === 'en' ? 'Demo' : 'Demo');
  const tourTargets = {
    home: 'sidebar-home',
    viral: 'sidebar-transcript',
    remix: 'sidebar-remix',
    'agent-studio': 'sidebar-agent-studio',
    plan: 'sidebar-calendar',
    settings: 'sidebar-settings',
  };
  const labels = language === 'en'
    ? {
      home: 'Home',
      viral: 'Signals',
      remix: 'Studio',
      'agent-studio': 'Agent Studio · Beta',
      plan: 'Content plan',
      settings: 'Settings',
    }
    : {
      home: 'Головна',
      viral: 'Сигнали',
      remix: 'Студія',
      'agent-studio': 'Agent Studio · Beta',
      plan: 'Контент-план',
      settings: 'Налаштування',
    };
  const primaryItems = [
    ['home', Home],
    ['viral', Radio],
    ['remix', Wand2],
    ['agent-studio', Bot],
    ['plan', CalendarDays],
    ['settings', Settings],
  ];
  const selectPage = (id) => {
    setPage(id);
    onClose?.();
  };
  const renderNavButton = ([id, Icon]) => (
    <button className={page === id ? 'active' : ''} data-tour={tourTargets[id]} key={id} onClick={() => selectPage(id)}>
      <Icon size={16} />
      <span className="nav-label">{labels[id]}</span>
    </button>
  );

  return (
    <aside className={isOpen ? 'sidebar open' : 'sidebar'}>
      <div className="brand">
        <div className="logo">
          <img src={logoImg} alt="Dzhero Logo" />
        </div>
        <div>
          <strong>Dzhero</strong>
          <span>{language === 'en' ? 'Ukraine + world' : 'Україна + світ'}</span>
        </div>
      </div>
      <button className="mobile-menu-close" type="button" aria-label={language === 'en' ? 'Close menu' : 'Закрити меню'} onClick={onClose}>
        <X size={18} />
      </button>
      <nav>
        {primaryItems.map(renderNavButton)}
      </nav>
      <div className="account-switcher compact">
        <section className="user-account-card" aria-label={language === 'en' ? 'Current account' : 'Поточний кабінет'}>
          <button
            className="user-account-top user-account-trigger"
            type="button"
            onClick={() => setIsSwitcherOpen((value) => !value)}
            aria-expanded={isSwitcherOpen}
            title={`${accountName} · ${accountEmail}`}
          >
            <div className="avatar user-avatar">{accountInitial}</div>
            <div>
              <small>{language === 'en' ? 'Signed in as' : 'Увійшли як'}</small>
              <strong data-i18n-content title={accountName}>{accountName}</strong>
              <span data-i18n-content title={accountEmail}>{accountEmail}</span>
            </div>
            <ChevronDown size={14} />
          </button>
          <div className="user-account-meta">
            <span>{providerLabel}</span>
            <span>{activeWorkspace?.type || (language === 'en' ? 'Workspace' : 'Workspace')}</span>
          </div>
          <button type="button" onClick={() => selectPage('settings')}>
            {language === 'en' ? 'Account, tariff and sources' : 'Кабінет, тариф і джерела'}
          </button>
        </section>
        {isSwitcherOpen && (
          <div className="workspace-menu">
            {workspaces.map((workspace) => (
              <button
                className={activeWorkspace.id === workspace.id ? 'active' : ''}
                type="button"
                key={workspace.id}
                onClick={() => {
                  onWorkspaceChange(workspace.id);
                  setIsSwitcherOpen(false);
                  onClose?.();
                }}
              >
                <span data-i18n-content>{workspace.name}</span>
                <small data-i18n-content>{workspace.handle} · {workspace.type}</small>
              </button>
            ))}
            <button type="button" onClick={() => { selectPage('settings'); setIsSwitcherOpen(false); }}>
              <span>{language === 'en' ? '+ Connect Instagram' : '+ Підключити Instagram'}</span>
              <small>{language === 'en' ? 'Real accounts through connection' : 'Реальні акаунти через підключення'}</small>
            </button>
            <button className="workspace-logout" type="button" onClick={() => {
              setIsSwitcherOpen(false);
              onLogout();
            }}>
              <span>{language === 'en' ? 'Log out' : 'Вихід'}</span>
              <small>{language === 'en' ? 'Leave this session' : 'Вийти з поточної сесії'}</small>
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

function Topbar({ theme, themeMode, setThemeMode, language, setLanguage, setPage, page, onOpenMenu, onCloseMenu }) {
  const { translateText } = useI18n();
  const ctaLabel = page === 'settings'
    ? (language === 'en' ? 'Back to hub' : 'До хабу')
    : (language === 'en' ? 'Generate plan' : 'Згенерувати план');
  const ctaTarget = page === 'settings' ? 'home' : 'agent-studio';
  const themeTitle = themeMode === 'auto'
    ? (language === 'en' ? 'Auto theme: local time' : 'Автотема: за локальним часом')
    : (language === 'en' ? 'Theme' : 'Тема');

  return (
    <header className="topbar">
      <div className="topbar-title">
        <button className="mobile-menu-trigger" type="button" aria-label={translateText('Відкрити меню')} onClick={onOpenMenu}>
          <Menu size={18} />
        </button>
      </div>
      <div className="top-actions">
        <button className="topbar-quick-action" type="button" aria-label={ctaLabel} title={ctaLabel} onClick={() => { onCloseMenu?.(); setPage(ctaTarget); }}>
          <Sparkles size={15} />
          <span>{ctaLabel}</span>
        </button>
        <div className="language-switch" aria-label={language === 'en' ? 'Interface language' : 'Мова інтерфейсу'}>
          <button type="button" className={language === 'uk' ? 'active' : ''} onClick={() => setLanguage('uk')}>UK</button>
          <button type="button" className={language === 'en' ? 'active' : ''} onClick={() => setLanguage('en')}>EN</button>
        </div>
        <button className={page === 'settings' ? 'icon active' : 'icon'} data-tour="topbar-settings" title={language === 'en' ? 'Settings' : 'Налаштування'} onClick={() => { onCloseMenu?.(); setPage('settings'); }}><Settings size={16} /></button>
        <button className={themeMode === 'auto' ? 'icon active' : 'icon'} title={themeTitle} onClick={() => setThemeMode(getNextThemeMode(themeMode))}>
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>
    </header>
  );
}

function MarketFilter({ segments, market, setMarket }) {
  useI18n();
  return (
    <div className="market-strip">
      <div>
        <Globe2 size={18} />
        <span>Ринки для аналізу</span>
      </div>
      <div className="market-buttons">
        {segments.map((segment) => (
          <button className={market === segment.id ? 'active' : ''} key={segment.id} onClick={() => setMarket(segment.id)}>
            <strong>{segment.label}</strong>
            <small>{segment.note}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

function WorkflowRail({ active = 'home', setPage, notify, variant = 'default' }) {
  useI18n();
  const steps = [
    ['signals', 'Signals', 'Find content mechanics', 'viral', Radio],
    ['studio', 'Studio', 'Adapt into script', 'remix', Wand2],
    ['plan', 'Plan', 'Schedule the batch', 'plan', CalendarDays],
  ];
  const activeIndex = Math.max(0, steps.findIndex(([id]) => id === active));

  return (
    <div className={`workflow-rail ${variant === 'compact' ? 'compact' : ''}`}>
      <div className="workflow-rail-head">
        <small>Dzhero workflow</small>
        <strong>Signal -&gt; studio -&gt; weekly plan</strong>
      </div>
      <div className="workflow-steps">
        {steps.map(([id, title, text, target, Icon], index) => {
          const state = index < activeIndex ? 'done' : index === activeIndex ? 'active' : 'next';
          return (
            <button
              className={`workflow-step ${state}`}
              type="button"
              key={id}
              onClick={() => {
                setPage(target);
                notify(`${title}: opened`);
              }}
            >
              <span><Icon size={15} /></span>
              <b>{title}</b>
              <em>{text}</em>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StudioEmptyState({ onOpenSignals }) {
  const { language, translateText } = useI18n();
  const copy = language === 'en'
    ? {
      kicker: 'Studio',
      subtitle: 'Choose a signal so DZHERO can prepare the adaptation, script, and CTA.',
      title: 'Add a signal first',
      text: 'Open Signals, add a video or source, then return here for adaptation.',
      action: 'Open Signals',
    }
    : {
      kicker: 'Студія',
      subtitle: 'Оберіть сигнал, щоб Джеро підготував адаптацію, сценарій і CTA.',
      title: 'Спочатку додайте сигнал',
      text: 'Відкрийте Signals, додайте ролик або джерело, а потім поверніться до адаптації.',
      action: 'Відкрити Signals',
    };
  return (
    <section className="page">
      <PageTitle
        title={translateText('Студія')}
        subtitle={copy.subtitle}
      />
      <div className="table-card signals-empty-shell">
        <div className="signals-empty-state signals-empty-state--authoritative">
          <span className="signals-empty-state-kicker">{copy.kicker}</span>
          <strong>{copy.title}</strong>
          <p>{copy.text}</p>
          <div className="signals-empty-actions">
            <button className="dark" type="button" onClick={onOpenSignals}>{copy.action}</button>
          </div>
        </div>
      </div>
    </section>
  );
}

function HomeDashboard({ data, market, notify, onFreshIdea, setPage, workspaceId }) {
  const { language, translateText } = useI18n();
  const copy = language === 'en'
    ? {
      eyebrow: 'Main action',
      title: 'Build a weekly content plan',
      description: 'Start with a real signal. Agent Studio grounds it, adapts it to the brand, and prepares seven actionable days.',
      action: 'Open Agent Studio',
      readyIdeas: 'Ready ideas',
      planned: 'already in Content Plan',
      waiting: 'still waiting',
      moreNotes: 'more in Notes',
      openNotes: 'Open Notes',
      signals: 'Signals',
      strongest: 'Strongest',
      noSignals: 'No Signals yet',
    }
    : {
      eyebrow: 'Головна дія',
      title: 'Зібрати контент-план на тиждень',
      description: 'Почни з реального сигналу. Agent Studio перевірить його, адаптує під бренд і підготує сім практичних днів.',
      action: 'Відкрити Agent Studio',
      readyIdeas: 'Готові ідеї',
      planned: 'вже у контент-плані',
      waiting: 'ще чекають',
      moreNotes: 'ще в Notes',
      openNotes: 'Відкрити Notes',
      signals: 'Сигнали',
      strongest: 'Найсильніший',
      noSignals: 'Сигналів ще немає',
    };
  const topReel = data.reels[0];
  const activeMarket = data.marketSegments.find((segment) => segment.id === market);
  const [onboarding, setOnboarding] = useState({
    instagramConnected: false,
    brandReady: false,
  });

  useEffect(() => {
    let isMounted = true;
    Promise.all([
      authFetch(`${API_BASE}/auth/meta/status?workspaceId=${workspaceId}`).then((response) => (response.ok ? response.json() : null)).catch(() => null),
      authFetch(`${API_BASE}/workspaces/${workspaceId}/agent/context`).then((response) => (response.ok ? response.json() : null)).catch(() => null),
    ]).then(([metaStatus, agentContext]) => {
      if (!isMounted) return;
      const brief = agentContext?.brief || {};
      setOnboarding({
        instagramConnected: Boolean(metaStatus?.connectedAccounts?.length),
        brandReady: Boolean(brief.businessType || brief.product || brief.audience || brief.toneOfVoice),
      });
    });
    return () => {
      isMounted = false;
    };
  }, [workspaceId]);

  const onboardingSteps = [
    ['01', 'Підключити Instagram', 'Вхід, права доступу, профіль бізнесу.', onboarding.instagramConnected, 'settings'],
    ['02', 'Навчити бренд', 'Ніша, Tone of Voice, місто, продукти, цілі.', onboarding.brandReady, 'assistant'],
    ['03', 'Зібрати сигнали', 'Рілси, конкуренти, коментарі, тренди та ідеї.', data.reels.length > 0 && data.competitors.length > 0, 'viral'],
    ['04', 'Випустити batch', 'План на тиждень, сторіс, рілси, Direct-відповіді.', data.plans.length > 0, 'plan'],
  ];
  const marketFocus = [
    ['UA local proof', '+18%', 'Кейси, відгуки, до/після замість абстрактних обіцянок.'],
    ['AI workflows', '+31%', 'Показати, як за 5 хвилин зробити контент без студії.'],
    ['Direct CTA', '+12%', 'Комент або Direct з конкретним словом працює краще.'],
    ['Service reviews', '+22%', 'Огляди сервісів та помилок добре лягають на UA-ринок.'],
  ];
  const quickActions = [
    ['Signals', Radio, 'tiktok'],
    ['Analytics', BarChart3, 'viral'],
    ['Remix', Wand2, 'remix'],
    ['Plan', CalendarDays, 'plan'],
    ['Sales', ShoppingBag, 'sales'],
    ['Settings', Settings, 'settings'],
  ];
  const radarPoints = [34, 48, 42, 66, 58, 74, 68, 86];
  const radarPolyline = radarPoints.map((value, index) => `${index * 34},${96 - value}`).join(' ');
  const recentActivity = [
    ['UA', '@ukrainian.marketing оновив задачу у контент-плані', '10:30'],
    ['TT', 'Новий TikTok-сигнал з високим потенціалом', '10:15'],
    ['AI', 'Ремікс “AI-контент” готовий до сценарію', 'вчора'],
    ['CRM', 'Конкурентний аналіз для @maker завершено', 'вчора'],
  ];
  const plannedIdeaTitles = new Set(
    data.plans
      .map((plan) => normalizeContentIdentity(Array.isArray(plan) ? plan[0] : plan?.title))
      .filter(Boolean)
  );
  const availableIdeas = data.ideas.filter((idea) => !plannedIdeaTitles.has(normalizeContentIdentity(idea.title)));
  const previewIdeas = availableIdeas.slice(0, 4);
  const plannedIdeasCount = Math.max(0, data.ideas.length - availableIdeas.length);
  const hiddenIdeasCount = Math.max(0, availableIdeas.length - previewIdeas.length);

  return (
    <section className="page page-home">
      <PageTitle
        title={translateText('Головна')}
        subtitle={translateText('Короткий стан MVP: джерела, готові ідеї і одна дія на тиждень.')}
      />
      <div className="mvp-home-grid">
        <article className="mvp-home-hero">
          <small>{copy.eyebrow}</small>
          <h2>{copy.title}</h2>
          <p>{copy.description}</p>
          <button className="dark home-primary-cta" onClick={onFreshIdea}><Sparkles size={18} />{copy.action}</button>
        </article>
        <article className="mvp-counter-card mvp-ideas-card">
          <div className="mvp-card-head">
            <span>{copy.readyIdeas}</span>
            <strong>{data.ideas.length}</strong>
          </div>
          <p>{`${plannedIdeasCount} ${copy.planned} · ${availableIdeas.length} ${copy.waiting}`}</p>
          <div className="mvp-ideas-preview">
            {previewIdeas.map((idea) => (
              <button type="button" key={idea.id || idea.title} onClick={() => setPage('plan')}>
                <small data-i18n-content>{idea.source || 'note'}</small>
                <b data-i18n-content>{idea.title}</b>
              </button>
            ))}
          </div>
          {hiddenIdeasCount > 0 && <p className="mvp-muted-line">+{hiddenIdeasCount} {copy.moreNotes}</p>}
          <button className="dark mvp-card-action" type="button" onClick={() => setPage('plan')}>{copy.openNotes}</button>
        </article>
        <article className="mvp-counter-card">
          <span>{copy.signals}</span>
          <strong>{data.reels.length}</strong>
          <p>{topReel ? `${copy.strongest}: ${topReel.score} score` : copy.noSignals}</p>
        </article>
      </div>
    </section>
  );
}

function ProductRoadmap({ notify, setPage }) {
  const { translateText } = useI18n();
  const mvp = [
    ['MVP core', 'Джерела даних, конкуренти, банк рілсів, ідеї, ремікс-студія, контент-план, AI Direct.', 'робимо першим'],
    ['Phase 2', 'Запуски, аналітика прибутку, бюджет, команда, юридичний сейф, повна CRM-логіка.', 'після ядра'],
    ['Demo mode', 'Один сценарій: підключив акаунт → отримав ідеї → зробив ремікс → поставив у план → побачив ліди.', 'для продажів'],
  ];
  const backend = [
    ['users', 'власник акаунта, роль, підписка, workspace'],
    ['instagram_accounts', 'Meta id, permissions, статус sync, токени'],
    ['competitors', 'handle, ринок, ніша, скор, останні сигнали'],
    ['reels', 'caption, transcript, metrics, intro signal, quality gate'],
    ['ideas', 'джерело, angle, вступний меседж, статус, зв’язок із рілсом'],
    ['content_plan', 'дата, формат, сценарій, статус, результат'],
    ['leads', 'intent, CRM-тег, температура, джерело контенту'],
    ['ai_memory', 'Tone of Voice, рішення людини, бренд-правила'],
  ];
  const dataFlow = [
    ['Instagram Login', 'користувач підключає Creator або Business акаунт і дає дозволи'],
    ['Sync jobs', 'бекенд тягне доступні пости, рілси, сторіс, коментарі, insights'],
    ['Model analysis', 'модель готує транскрипти, scoring, intent, ідеї та ризики копіювання'],
    ['Human review', 'людина approve/reject/remix/plan, а система враховує рішення'],
  ];
  const phases = [
    ['1', 'Прототип → MVP schema', 'Зафіксувати модулі, статуси, таблиці, мокові дані замінити локальною базою.'],
    ['2', 'Instagram Login sandbox', 'Підключити тестовий Creator або Business акаунт і перевірити реальні permissions.'],
    ['3', 'Import + scoring', 'Зібрати sync queue, банк рілсів, конкурентів, транскрипти й quality gate.'],
    ['4', 'Production workflow', 'Ідеї, ремікси, контент-план, навчання на діях користувача.'],
    ['5', 'AI Direct beta', 'Intent Detection, FAQ, CRM-теги, handoff менеджеру, ліміти безпеки.'],
  ];
  const risks = [
    ['Meta permissions', 'не все можна тягнути автоматично, потрібна перевірка через офіційну документацію й тестовий акаунт'],
    ['Безпека Direct', 'автовідповіді мають мати ліміти, затримки, стоп-теми й human-in-the-loop'],
    ['Копіювання контенту', 'система має реміксувати механіку, а не клонувати чужий ролик'],
  ];

  return (
    <section className="page">
      <PageTitle
        title={translateText('MVP / ТЗ')}
        subtitle={translateText('Робоча карта продукту: що будуємо першим, які дані потрібні, як виглядає backend і як показувати demo-flow.')}
        actions={<button className="dark" onClick={() => { setPage('settings'); notify(translateText('MVP scope зафіксовано. Відкрив налаштування продукту.')); }}><ClipboardList size={16} />Зафіксувати MVP</button>}
      />
      <article className="spec-hero">
        <small>Позиціонування</small>
        <h2>Аналітична платформа для Instagram, яка знаходить сигнали ринку, адаптує їх під Україну і веде контент до продажу.</h2>
        <p>Ядро продукту: дані → аналіз → ідея → сценарій → план → Direct/лід → фінансова аналітика.</p>
      </article>
      <div className="spec-grid">
        {mvp.map(([title, text, status]) => (
          <article className="spec-card" key={title}>
            <small>{status}</small>
            <h3>{title}</h3>
            <p>{text}</p>
          </article>
        ))}
      </div>
      <div className="spec-layout">
        <article className="insight-card">
          <small>Backend entities</small>
          <h3>Що має зберігатися в базі</h3>
          <div className="entity-grid">
            {backend.map(([title, text]) => (
              <div key={title}>
                <code>{title}</code>
                <span>{text}</span>
              </div>
            ))}
          </div>
        </article>
        <article className="insight-card">
          <small>Data pipeline</small>
          <h3>Як дані проходять через систему</h3>
          <div className="demo-flow">
            {dataFlow.map(([title, text], index) => (
              <div key={title}>
                <span>{index + 1}</span>
                <div>
                  <strong>{title}</strong>
                  <p>{text}</p>
                </div>
              </div>
            ))}
          </div>
        </article>
      </div>
      <div className="phase-board">
        {phases.map(([step, title, text]) => (
          <article className="phase-card" key={step}>
            <span>{step}</span>
            <h3>{title}</h3>
            <p>{text}</p>
          </article>
        ))}
      </div>
      <div className="spec-grid">
        {risks.map(([title, text]) => (
          <article className="spec-card" key={title}>
            <small>ризик</small>
            <h3>{title}</h3>
            <p>{text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function TikTokSignalsDemo({ notify, setPage }) {
  useI18n();
  const [step, setStep] = useState('ready');
  const isConnected = step === 'connected' || step === 'analyzed' || step === 'planned';
  const isAnalyzed = step === 'analyzed' || step === 'planned';
  const isPlanned = step === 'planned';
  const signals = [
    ['Video trend', Video, 'AI workflow from one product photo', '2.4M views', '92'],
    ['Sound signal', Radio, 'Fast tutorial beat used by creators', '18.6K uses', '88'],
    ['Effect signal', Wand2, 'Before/after product reveal mask', '7.1K uses', '84'],
  ];
  const plan = [
    ['Hook', 'Show the business pain in the first 2 seconds.'],
    ['Proof', 'Use one concrete example, number, or mini-case.'],
    ['CTA', 'Invite viewers to comment a keyword or write in Direct.'],
  ];
  const runStep = (nextStep, message) => {
    setStep(nextStep);
    notify(message);
  };
  const generatePlan = () => {
    setStep('planned');
    notify('Original content plan generated');
  };

  return (
    <section className="page page-tiktok-demo">
      <PageTitle
        title="Short-form sandbox"
        subtitle="Preview for user-authorized short-form profile and stats: signals become original content plans."
        actions={<button className="dark" type="button" onClick={() => setPage('remix')}><Wand2 size={16} />Open Remix Studio</button>}
      />
      <WorkflowRail active="signals" setPage={setPage} notify={notify} variant="compact" />
      <div className="tiktok-demo-hero">
        <div>
          <small>User-authorized preview</small>
          <h2>Analyze short-form video signals without copying content.</h2>
          <p>Dzhero uses authorized profile and stats context, scores selected short-form signals by market fit, and turns them into original scripts for the user’s own brand.</p>
        </div>
        <div className="tiktok-demo-actions">
          <button className={isConnected ? 'completed' : 'dark'} type="button" onClick={() => runStep('connected', 'Short-form source connected')}>
            <CircleCheck size={16} />{isConnected ? 'Source connected' : 'Connect source preview'}
          </button>
          <button type="button" disabled={!isConnected} onClick={() => runStep('analyzed', 'Short-form signals imported')}>
            <Download size={16} />Import trend signals
          </button>
          <button className={isPlanned ? 'completed' : ''} type="button" onClick={generatePlan}>
            <Sparkles size={16} />Generate original plan
          </button>
        </div>
      </div>

      <div className="tiktok-flow-grid">
        {[
          ['01', 'Connect', isConnected ? 'done' : 'ready', 'User authorizes profile and stats access in a preview flow.'],
          ['02', 'Analyze', isAnalyzed ? 'done' : isConnected ? 'ready' : 'locked', 'Dzhero reads selected short-form signals and scores market fit.'],
          ['03', 'Create', isPlanned ? 'done' : isAnalyzed ? 'ready' : 'locked', 'AI turns the signals into original hooks, scripts and calendar ideas.'],
        ].map(([number, title, status, text]) => (
          <article className={`tiktok-flow-card ${status}`} key={title}>
            <span>{number}</span>
            <strong>{title}</strong>
            <p>{text}</p>
          </article>
        ))}
      </div>

      <div className="tiktok-demo-layout signal-to-plan-layout">
        <article className="insight-card tiktok-signal-panel">
          <small>Short-form signals</small>
          <h3>Selected signals for review demo</h3>
          <div className="tiktok-signal-list">
            {signals.map(([type, Icon, title, meta, score]) => (
              <button className={isAnalyzed ? 'active' : ''} type="button" key={title} onClick={() => !isAnalyzed && notify('Connect and import short-form signals first')}>
                <i><Icon size={17} /></i>
                <span>{type}</span>
                <strong>{title}</strong>
                <em>{meta}</em>
                <b>{score}</b>
              </button>
            ))}
          </div>
        </article>
        <article className={`insight-card tiktok-plan-panel ${isPlanned ? 'ready' : ''}`}>
          <small>Original content plan</small>
          <h3>{isPlanned ? 'Ready for Ukrainian brand adaptation' : 'Waiting for generated plan'}</h3>
          {isPlanned ? (
            <div className="tiktok-plan-list">
              {plan.map(([label, text]) => (
                <div key={label}>
                  <span>{label}</span>
                  <p>{text}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="tiktok-empty-plan">
              <Sparkles size={22} />
              <p>After importing signals, Dzhero will generate an original script structure and content plan. No automatic reposting or copying.</p>
            </div>
          )}
        </article>
      </div>
    </section>
  );
}

function isSignalUrl(value) {
  const clean = String(value || '').trim();
  if (!clean) return false;
  const withProtocol = /^https?:\/\//i.test(clean) ? clean : `https://${clean}`;
  try {
    const parsed = new URL(withProtocol);
    const host = parsed.hostname.toLowerCase();
    return [
      'instagram.com',
      'www.instagram.com',
      'tiktok.com',
      'www.tiktok.com',
      'vm.tiktok.com',
      'vt.tiktok.com',
      'youtube.com',
      'www.youtube.com',
      'm.youtube.com',
      'youtu.be',
    ].includes(host);
  } catch {
    return false;
  }
}

function normalizeSignalUrl(value) {
  const clean = String(value || '').trim();
  return /^https?:\/\//i.test(clean) ? clean : `https://${clean}`;
}

function getSignalYouTubeVideoId(reel = {}) {
  const directId = reel.importedMetadata?.youtube?.videoId || reel.youtube?.videoId || '';
  if (directId) return String(directId).trim();
  const rawUrl = String(reel.sourceUrl || reel.importedMetadata?.url || '').trim();
  try {
    const url = new URL(rawUrl.startsWith('www.') ? `https://${rawUrl}` : rawUrl);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const parts = url.pathname.split('/').filter(Boolean);
    if (host === 'youtu.be' && parts[0]) return parts[0];
    if (host.endsWith('youtube.com')) {
      if (url.searchParams.get('v')) return url.searchParams.get('v');
      if (['shorts', 'embed', 'live'].includes(parts[0]) && parts[1]) return parts[1];
    }
  } catch {
    return '';
  }
  return '';
}

function canonicalSignalUrl(value = '') {
  return canonicalizeFeedSignalUrl(value);
}

function getSignalStableKeys(reel = {}) {
  const keys = [];
  const platform = reel.importedMetadata?.platform || reel.importedMetadata?.source?.tone || '';
  const providerId = reel.importedMetadata?.shortCode
    || reel.importedMetadata?.externalId
    || reel.importedMetadata?.tiktokVideoId
    || reel.importedMetadata?.id
    || '';
  if (platform && providerId) keys.push(`provider:${String(platform).toLowerCase()}:${String(providerId).toLowerCase()}`);
  const youtubeVideoId = getSignalYouTubeVideoId(reel);
  if (youtubeVideoId) keys.push(`youtube:${youtubeVideoId.toLowerCase()}`);
  for (const value of [reel.sourceUrl, reel.importedMetadata?.url, reel.importedMetadata?.webVideoUrl, reel.videoUrl, reel.importedMetadata?.videoUrl]) {
    const url = canonicalSignalUrl(value);
    if (url) keys.push(`url:${url}`);
  }
  return [...new Set(keys)];
}

function dedupeSignalReels(reels = []) {
  const result = [];
  const indexByKey = new Map();
  for (const reel of reels) {
    const keys = getSignalStableKeys(reel);
    const existingIndex = keys.map((key) => indexByKey.get(key)).find((index) => index !== undefined);
    if (existingIndex === undefined) {
      result.push(reel);
      keys.forEach((key) => indexByKey.set(key, result.length - 1));
      continue;
    }
    const current = result[existingIndex];
    const incomingStrength = (Number(reel.score) || 0) * 1_000_000 + parseMetric(reel.views);
    const currentStrength = (Number(current.score) || 0) * 1_000_000 + parseMetric(current.views);
    result[existingIndex] = incomingStrength > currentStrength
      ? { ...current, ...reel }
      : { ...reel, ...current };
    getSignalStableKeys(result[existingIndex]).forEach((key) => indexByKey.set(key, existingIndex));
  }
  return result;
}

function buildSignalSourceSummary(reels = []) {
  const sourcesByKey = new Map();
  for (const reel of reels) {
    const platform = getSignalSourceGroup(reel);
    if (!['youtube', 'instagram', 'tiktok'].includes(platform)) continue;
    const metadata = reel.importedMetadata || {};
    const handle = reel.handle || reel.sourceHandle || metadata.handle || metadata.author || metadata.channelTitle || '';
    const sourceUrl = reel.sourceUrl || metadata.url || metadata.webVideoUrl || metadata.sourceUrl || '';
    const label = String(handle || sourceUrl || platform).trim();
    if (!label) continue;
    const key = `${platform}:${label.toLowerCase()}`;
    const current = sourcesByKey.get(key) || {
      key,
      platform,
      label,
      market: reel.market || 'global',
      count: 0,
      bestViews: 0,
      bestScore: 0,
    };
    current.count += 1;
    current.bestViews = Math.max(current.bestViews, parseMetric(reel.views));
    current.bestScore = Math.max(current.bestScore, Number(reel.score) || 0);
    if (current.market === 'global' && reel.market) current.market = reel.market;
    sourcesByKey.set(key, current);
  }
  return Array.from(sourcesByKey.values())
    .sort((left, right) => right.count - left.count || right.bestScore - left.bestScore || right.bestViews - left.bestViews)
    .slice(0, 6);
}

function ViralBank({
  reels,
  competitors = [],
  market,
  notify,
  openModal,
  onImportUrl,
  onImportApifySignals,
  onPullYouTubePopular,
  onAdapt,
  setPage,
  automation = null,
  onRefreshAutomation,
  onToggleAutomation,
  onRunAutomation,
}) {
  const { language, t, translateText } = useI18n();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('score');
  const [scoreSortDirection, setScoreSortDirection] = useState('desc');
  const [previewReel, setPreviewReel] = useState(null);
  const [isImportingUrl, setIsImportingUrl] = useState(false);
  const [sourceFilter, setSourceFilter] = useState('all');
  const [youtubeRegion, setYoutubeRegion] = useState('UA');
  const [youtubeCategory, setYoutubeCategory] = useState('');
  const [isPullingYoutube, setIsPullingYoutube] = useState(false);
  const [apifyModalOpen, setApifyModalOpen] = useState(false);
  const trimmedQuery = query.trim();
  const pastedReelUrl = isSignalUrl(trimmedQuery) ? normalizeSignalUrl(trimmedQuery) : '';
  const sourceTabs = [
    ['all', 'Всі'],
    ['youtube', 'YouTube'],
    ['instagram', 'Instagram'],
    ['tiktok', 'TikTok'],
  ];
  const sourceCounts = reels.reduce((acc, reel) => {
    const group = getSignalSourceGroup(reel);
    acc.all += 1;
    acc[group] = (acc[group] || 0) + 1;
    return acc;
  }, { all: 0, youtube: 0, instagram: 0, tiktok: 0 });
  const filteredReels = reels
    .filter((reel) => sourceFilter === 'all' || getSignalSourceGroup(reel) === sourceFilter)
    .filter((reel) => pastedReelUrl ? true : `${reel.title} ${reel.handle} ${(reel.status || []).join(' ')}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => compareSignalReels(a, b, { sort, scoreSortDirection }));
  const openManualImport = () => openModal({ type: 'reel', url: pastedReelUrl });
  const importPastedReel = async () => {
    if (!pastedReelUrl || isImportingUrl) return;
    if (!onImportUrl) {
      openManualImport();
      return;
    }
    setIsImportingUrl(true);
    try {
      await onImportUrl(pastedReelUrl);
    } finally {
      setIsImportingUrl(false);
    }
  };
  const pullYoutubePopular = async () => {
    if (!onPullYouTubePopular || isPullingYoutube) return;
    setIsPullingYoutube(true);
    try {
      await onPullYouTubePopular({ regionCode: youtubeRegion, categoryId: getYouTubeCategoryId(youtubeCategory) });
    } catch (error) {
      notify(localizeInterfaceError(error, t, 'errors.youtubePopular'));
    } finally {
      setIsPullingYoutube(false);
    }
  };

  const toggleScoreSort = () => {
    setSort('score');
    setScoreSortDirection((current) => (current === 'desc' ? 'asc' : 'desc'));
  };
  const exportCsv = () => {
    const header = ['title', 'handle', 'market', 'score', 'views', 'likes', 'comments', 'status'];
    const rows = filteredReels.map((reel) => [
      reel.title,
      reel.handle,
      marketLabel(reel.market),
      reel.score,
      reel.views,
      reel.likes,
      reel.comments,
      reel.status.map(compactStatusLabel).join('; '),
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'dzhero-signals.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    notify(translateText('CSV експорт завантажено'));
  };
  const openPreview = (reel) => {
    setPreviewReel(reel);
  };
  const closePreview = () => {
    setPreviewReel(null);
  };
  const previewImage = getReelPreviewImage(previewReel);
  const previewVideoSource = getReelVideoSource(previewReel);
  const discovery = automation?.discovery || null;
  const discoveryState = deriveDiscoveryToolbarStatus(discovery, { language });
  const discoveryStatus = discovery?.status || {};
  const isAutomationReady = Boolean(discovery);
  const isAutomationBusy = Boolean(automation?.isLoading || automation?.isRefreshing || automation?.isToggling || automation?.isRunning);
  const automationEnabled = discovery?.settings?.enabled !== false;
  const automationStatusText = automation?.error ? t('signals.discovery.status.failedDetail') : discoveryState.detail;
  const canRunAutomation = canRunDiscoveryNow(discovery, { busy: isAutomationBusy });
  const hasActiveFilters = Boolean(trimmedQuery || pastedReelUrl || sourceFilter !== 'all');
  const emptyState = deriveSignalsEmptyState({
    reelsCount: reels.length,
    filteredReelsCount: filteredReels.length,
    hasActiveFilters,
    automationEnabled,
    canRunAutomation,
    query: trimmedQuery,
    sourceFilter,
    pastedReelUrl,
    language,
  });
  const realSignalSources = buildSignalSourceSummary(filteredReels);
  const spendText = discovery
    ? `${formatUsdAmount(discoveryStatus.dailySpendUsd)} / ${formatUsdAmount(discoveryStatus.dailyBudgetUsd)}`
    : '—';
  const runNowLabel = deriveDiscoveryRunNowLabel(discovery, {
    busy: Boolean(automation?.isRunning || discoveryStatus.running),
    language,
  });

  return (
    <section className="page page-signals">
      <PageTitle
        title={translateText('Сигнали')}
        subtitle={translateText('Одна стрічка коротких відео, сайтів і робочих механік для адаптації під бренд.')}
        actions={<button onClick={exportCsv}><Download size={16} />Експорт</button>}
      />
      <div className="signals-automation-bar">
        <div className="signals-automation-main">
          <button
            className={`signals-automation-toggle ${automationEnabled ? 'enabled' : ''}`}
            type="button"
            role="switch"
            aria-checked={automationEnabled}
            onClick={() => onToggleAutomation?.(!automationEnabled)}
            disabled={!isAutomationReady || isAutomationBusy}
          >
            <span className="signals-automation-toggle-track" aria-hidden="true">
              <span className="signals-automation-toggle-thumb" />
            </span>
            <span className="signals-automation-toggle-copy">
              <strong>Автопошук сигналів</strong>
              <small>До 10 нових сигналів щодня зі збережених джерел, акаунтів і тем.</small>
            </span>
          </button>
          <div className="signals-automation-summary">
            <span className={`signals-automation-status tone-${discoveryState.tone}`}>{discoveryState.label}</span>
            <p className="signals-automation-status-text" role="status" aria-live="polite">{automationStatusText}</p>
          </div>
          <div className="signals-automation-metrics">
            <div>
              <span>Останній запуск</span>
              <strong>{formatDiscoveryTimestamp(discoveryStatus.lastRunAt, language)}</strong>
            </div>
            <div>
              <span>Наступний</span>
              <strong>{formatDiscoveryTimestamp(discoveryStatus.nextRunAt, language)}</strong>
            </div>
            <div>
              <span>{discoveryStatus.dailySpendIsEstimated ? 'Орієнтовні витрати сьогодні' : 'Витрати сьогодні'}</span>
              <strong>{spendText}</strong>
            </div>
          </div>
        </div>
        <div className="signals-automation-actions">
          <button className="dark" type="button" onClick={() => onRunAutomation?.()} disabled={!canRunAutomation}>
            {automation?.isRunning || discoveryStatus.running ? <RefreshCw className="is-spinning" size={16} /> : <Bot size={16} />}
            {runNowLabel}
          </button>
          <button type="button" onClick={() => void onRefreshAutomation?.()} disabled={isAutomationBusy}>
            <RefreshCw className={automation?.isRefreshing ? 'is-spinning' : ''} size={16} />
            Оновити
          </button>
          <button type="button" onClick={() => setApifyModalOpen(true)}>
            <ChevronDown size={16} />
            Розширений імпорт
          </button>
        </div>
      </div>
      <div className="search-row">
        <label><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && pastedReelUrl && importPastedReel()} placeholder="Search or paste a TikTok, Reels, or Shorts link..." /></label>
        <select value={market} readOnly><option>{market === 'all' ? 'Всі ринки' : 'Обраний ринок'}</option></select>
        <select value={sort} onChange={(event) => setSort(event.target.value)}>
          <option value="score">За оцінкою</option>
          <option value="views">За переглядами</option>
          <option value="likes">За лайками</option>
          <option value="comments">За коментарями</option>
          <option value="newest">Нові</option>
        </select>
      </div>
      <div className="signal-source-tabs" aria-label={translateText('Фільтр джерел сигналів')}>
        {sourceTabs.map(([value, label]) => (
          <button
            className={sourceFilter === value ? 'active' : ''}
            type="button"
            key={value}
            onClick={() => setSourceFilter(value)}
          >
            <span>{label}</span>
            <b>{sourceCounts[value] || 0}</b>
          </button>
        ))}
      </div>
      {sourceFilter === 'youtube' && (
        <div className="youtube-popular-panel">
          <div>
            <strong>Популярне з YouTube</strong>
            <span>Знайдемо ролики, які зараз набирають перегляди. Кожен сигнал можна відкрити в Студії й адаптувати під бренд.</span>
          </div>
          <label>
            <span>Регіон</span>
            <select value={youtubeRegion} onChange={(event) => setYoutubeRegion(event.target.value)}>
              <option value="UA">Україна</option>
              <option value="US">США</option>
              <option value="GB">Британія</option>
              <option value="DE">Німеччина</option>
              <option value="PL">Польща</option>
            </select>
          </label>
          <label>
            <span>Категорія</span>
            <select value={youtubeCategory} onChange={(event) => setYoutubeCategory(event.target.value)}>
              {YOUTUBE_POPULAR_CATEGORIES.map((category) => (
                <option value={category.id} key={category.id}>
                  {t(category.labelKey)}
                </option>
              ))}
            </select>
          </label>
          <button className="dark" type="button" onClick={pullYoutubePopular} disabled={isPullingYoutube}>
            <RefreshCw size={16} />{isPullingYoutube ? 'Шукаємо...' : 'Знайти ролики'}
          </button>
        </div>
      )}
      {pastedReelUrl && (
        <div className="reel-link-import">
          <div>
            <strong>Знайшов посилання на сигнал</strong>
            <span>Джеро спробує витягнути публічний контекст із джерела і одразу підготує UA-адаптацію. Якщо платформа нічого не віддасть, відкриється запасний ручний режим.</span>
          </div>
          <button className="dark" type="button" onClick={importPastedReel} disabled={isImportingUrl}>
            <Wand2 size={16} />{isImportingUrl ? 'Адаптуємо...' : 'Адаптувати автоматично'}
          </button>
        </div>
      )}
      <div className="signals-layout">
        <div className="trends-table-wrap">
          <SignalsReelsTable
            reels={filteredReels}
            sort={sort}
            onSortChange={setSort}
            scoreSortDirection={scoreSortDirection}
            onToggleScoreSort={toggleScoreSort}
            onOpenPreview={openPreview}
            onAdapt={onAdapt}
            hasActiveFilters={hasActiveFilters}
            automationEnabled={automationEnabled}
            canRunAutomation={canRunAutomation}
            isLoading={automation?.isLoading}
            loadIssue={automation?.error}
            onRefreshAutomation={onRefreshAutomation}
            onRunAutomation={onRunAutomation}
            onToggleAutomation={onToggleAutomation}
            onOpenAdvancedImport={() => setApifyModalOpen(true)}
            emptyState={pastedReelUrl
              ? {
                  title: 'Посилання готове до імпорту',
                  text: 'Це схоже на зовнішній сигнал. Натисни імпорт вище або Enter, і Джеро спробує витягнути контекст у Studio.',
                }
                : trimmedQuery
                ? {
                    title: 'Нічого не знайшли',
                    text: 'Try another query or paste a TikTok, Reels, or YouTube Shorts link.',
                  }
                : sourceFilter !== 'all'
                  ? {
                      title: 'Тут ще немає сигналів',
                      text: 'Встав посилання або додай сигнал вручну. Після імпорту він зʼявиться в цій вкладці.',
                    }
                : null}
          />
        </div>
        <aside className="signals-source-panel">
          <div className="panel-title"><strong>Sources</strong><span>{realSignalSources.length} active</span></div>
          <p>Only accounts and searches that actually produced visible Signals in this bank.</p>
          <div className="signals-source-list">
            {realSignalSources.map((row) => (
              <article key={row.key}>
                <b>{row.label.replace(/^@/, '')[0]?.toUpperCase() || row.platform[0]?.toUpperCase() || 'S'}</b>
                <div>
                  <strong data-i18n-content>{row.label}</strong>
                  <span>{row.platform} - {row.count} signals - up to {formatMetricDisplay(row.bestViews)} views</span>
                </div>
                <Score value={row.bestScore} compact />
              </article>
            ))}
            {!realSignalSources.length && (
              <article className="signals-source-empty">
                <b>?</b>
                <div>
                  <strong>No active sources yet</strong>
                  <span>Run Apify import to populate this list.</span>
                </div>
              </article>
            )}
          </div>
        </aside>
      </div>
      {apifyModalOpen && (
        <ApifySignalImportModal
          onClose={() => setApifyModalOpen(false)}
          onImport={onImportApifySignals}
          notify={notify}
        />
      )}
      {previewReel && (
        <div className="video-preview-backdrop" onClick={closePreview}>
          <article className="video-preview-modal" onClick={(event) => event.stopPropagation()}>
            <button className="icon video-preview-close" type="button" onClick={() => setPreviewReel(null)} aria-label={translateText("Закрити прев'ю")}>
              <X size={16} />
            </button>
            {previewVideoSource ? (
              <video className="signal-preview-video" src={previewVideoSource} poster={previewImage} controls playsInline />
            ) : (
              <div
                className={`video-preview-frame market-${previewReel.market} ${previewImage ? 'has-media' : ''}`}
                style={previewImage ? { backgroundImage: `linear-gradient(180deg, rgba(3, 7, 18, 0.08), rgba(3, 7, 18, 0.74)), url("${previewImage}")` } : undefined}
              >
                <span className="video-preview-play" aria-hidden="true" />
                <strong data-i18n-content>{previewReel.handle}</strong>
                {getSignalSourceUrl(previewReel) && (
                  <a className="video-preview-play-here" href={getSignalSourceUrl(previewReel)} target="_blank" rel="noreferrer">
                    Відкрити відео
                  </a>
                )}
              </div>
            )}
            <div>
              <small>{marketLabel(previewReel.market)} · {previewReel.views} переглядів</small>
              <h3 data-i18n-content>{previewReel.title}</h3>
              {getSignalSourceUrl(previewReel) && (
                <a className="video-preview-source" href={getSignalSourceUrl(previewReel)} target="_blank" rel="noreferrer">Відкрити оригінал</a>
              )}
              <p>Прев'ю сигналу для швидкого відбору. Джеро витягує механіку, а не копіює ролик.</p>
            </div>
            <button className="dark" type="button" onClick={() => { onAdapt?.(previewReel); setPreviewReel(null); }}>Адаптувати під мій бренд</button>
          </article>
        </div>
      )}
    </section>
  );
}

function ApifySignalImportModal({ onClose, onImport, notify }) {
  const { t, translateText } = useI18n();
  const [platform, setPlatform] = useState('instagram');
  const [inputType, setInputType] = useState('profile');
  const [inputValue, setInputValue] = useState('');
  const [limit, setLimit] = useState(5);
  const [downloadVideo, setDownloadVideo] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submit = async () => {
    if (!inputValue.trim() || isSubmitting) return;
    if (!onImport) {
      notify(translateText('Apify import is not connected yet.'));
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await onImport({ platform, inputType, inputValue: inputValue.trim(), limit, downloadVideo });
      if (result) onClose();
    } catch (error) {
      notify(localizeInterfaceError(error, t, 'errors.apifyImport'));
    } finally {
      setIsSubmitting(false);
    }
  };
  return (
    <div className="quick-modal-overlay" onClick={onClose}>
      <div className="quick-modal apify-signal-modal" onClick={(event) => event.stopPropagation()}>
        <button className="modal-close" type="button" onClick={onClose}>×</button>
        <h3>Підтягнути сигнали з Apify</h3>
        <p>Джеро збере нові Reels або TikTok, збереже їх у банк і не спише імпорт за дублікати.</p>
        <div className="manual-reel-grid">
          <label>
            <span>Платформа</span>
            <select value={platform} onChange={(event) => {
              const nextPlatform = event.target.value;
              setPlatform(nextPlatform);
              setInputType(nextPlatform === 'instagram' ? 'profile' : 'hashtag');
            }}>
              <option value="instagram">Instagram</option>
              <option value="tiktok">TikTok</option>
            </select>
          </label>
          <label>
            <span>Тип</span>
            <select value={inputType} onChange={(event) => setInputType(event.target.value)}>
              <option value="profile">Профіль</option>
              <option value="url">URL відео</option>
              <option value="hashtag">Hashtag</option>
              <option value="search">Пошук</option>
            </select>
          </label>
          <label className="wide">
            <span>Значення</span>
            <input
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && submit()}
              placeholder={platform === 'instagram' ? 'https://www.instagram.com/humansofny/' : 'claude або @maverickgpt'}
            />
          </label>
          <label>
            <span>Ліміт</span>
            <select value={limit} onChange={(event) => setLimit(Number(event.target.value))}>
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={30}>30</option>
            </select>
          </label>
          {platform === 'tiktok' && (
            <label className="wide checkbox-row">
              <input type="checkbox" checked={downloadVideo} onChange={(event) => setDownloadVideo(event.target.checked)} />
              <span>Завантажити відео для внутрішнього плеєра</span>
            </label>
          )}
        </div>
        <div className="quick-modal-actions">
          <button type="button" onClick={onClose}>Скасувати</button>
          <button className="dark" type="button" onClick={submit} disabled={isSubmitting || !inputValue.trim()}>
            <Download size={16} />{isSubmitting ? 'Імпортуємо...' : 'Імпортувати'}
          </button>
        </div>
      </div>
    </div>
  );
}

function BusinessPlaybooks({ notify, setPage, workspaceId }) {
  const { translateText } = useI18n();
  const [selectedPlaybook, setSelectedPlaybook] = useState('');
  const [selectedFocus, setSelectedFocus] = useState('');
  const [saveStatus, setSaveStatus] = useState('idle');
  const playbooks = [
    ['Кафе / ресторан', 'Меню, сезонні позиції, бронювання, відгуки, UGC, локальні події.', ['сторіс-меню', 'акції дня', 'відгуки гостей']],
    ['Магазин одягу', 'Дропи, наявність, образи, примірки, size guide, Direct-продажі.', ['лукбуки', 'новинки', 'залишки розмірів']],
    ['Салон / beauty', 'Вільні вікна, роботи майстрів, до/після, записи, довіра.', ['до/після', 'вікна на тиждень', 'поради']],
    ['Фітнес / студія', 'Розклад, абонементи, трансформації, пробні заняття, ком’юніті.', ['розклад', 'кейси клієнтів', 'пробне заняття']],
    ['Експерт / консультант', 'Контент довіри, кейси, розбір помилок, прогрів, заявки.', ['експертні Reels', 'FAQ', 'міні-запуск']],
    ['E-commerce', 'Каталог, bundles, огляди, UGC, retargeting-креативи, промо.', ['товарні рілси', 'порівняння', 'пакети']],
  ];

  useEffect(() => {
    let isMounted = true;
    authFetch(`${API_BASE}/workspaces/${workspaceId}/agent/context`)
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (!isMounted || !payload?.brief) return;
        setSelectedPlaybook(payload.brief.businessType || '');
        setSelectedFocus(payload.brief.contentFocus || '');
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, [workspaceId]);

  const savePlaybook = async (title, tags, focus = '') => {
    setSelectedPlaybook(title);
    if (focus) setSelectedFocus(focus);
    setSaveStatus('saving');
    try {
      const response = await authFetch(`${API_BASE}/workspaces/${workspaceId}/agent/context`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessType: title,
          contentFocus: focus || selectedFocus || tags[0],
          contentRubrics: tags,
        }),
      });
      if (!response.ok) throw new Error(await readApiError(response, 'save_failed'));
      setSaveStatus('saved');
      notify(translateText(`Playbook "${title}" збережено в Brand Brain`));
      window.setTimeout(() => {
        setSaveStatus('idle');
        setPage('assistant');
      }, 450);
    } catch {
      setSaveStatus('error');
      notify(translateText('Не вдалося зберегти playbook. Перевір backend.'));
    }
  };

  return (
    <section className="page page-businesses">
      <PageTitle
        title={translateText('Бізнеси')}
        actions={<button className="dark" onClick={() => { selectedPlaybook ? setPage('assistant') : setPage('settings'); notify(translateText(selectedPlaybook ? 'Відкрив Асистента з обраним playbook' : 'Відкрив профіль бізнесу для вибору ніші')); }}><BriefcaseBusiness size={16} />{selectedPlaybook ? 'До Асистента' : 'Обрати тип бізнесу'}</button>}
      />
      {selectedPlaybook && (
        <div className="business-selection-bar">
          <strong>{selectedPlaybook}</strong>
          <span>{selectedFocus || 'контент-система'}</span>
          <Badge>{saveStatus === 'saving' ? 'Saving' : 'Active'}</Badge>
        </div>
      )}
      <div className="business-grid">
        {playbooks.map(([title, text, tags]) => (
          <article className={selectedPlaybook === title ? 'business-card selected' : 'business-card'} key={title} onClick={() => savePlaybook(title, tags)}>
            <div className="panel-title"><strong>{title}</strong> <span className="playbook-tag">{selectedPlaybook === title ? 'active' : 'playbook'}</span></div>
            <p>{text}</p>
            <div className="business-tags">
              {tags.map((tag) => (
                <button
                  className={selectedPlaybook === title && selectedFocus === tag ? 'active' : ''}
                  type="button"
                  key={tag}
                  onClick={(event) => {
                    event.stopPropagation();
                    savePlaybook(title, tags, tag);
                  }}
                >
                  {tag}
                </button>
              ))}
            </div>
          </article>
        ))}
      </div>
      <div className="business-flow">
        <article className="insight-card">
          <small>Автоматизована воронка контенту</small>
          <h3>Щоденна система контенту та продажів в Instagram.</h3>
          <p>Профіль містить тип бізнесу, асортимент, географію, сезонність, Tone of Voice і цілі. На цій основі система пропонує контент: сторіс, пости, Reels, акції, відповіді в Direct і сценарії повторних продажів.</p>
        </article>
        <article className="insight-card">
          <small>Приклад для кафе</small>
          <h3>Сьогодні: ланч-сторіс, рілс про новий десерт, опитування, відповідь на відгуки.</h3>
          <p>Завтра система може автоматично запропонувати контент під погоду, день тижня, залишки меню, локальну подію або вільні столики.</p>
        </article>
      </div>
    </section>
  );
}

function StrategyBrain({ notify, setPage }) {
  const { translateText } = useI18n();
  const pillars = [
    ['Візуальний аудит', 'Профіль виглядає як експертний, але бракує повторюваної системи обкладинок і кольорової дисципліни.', '72%'],
    ['Профіль ЦА', 'Власники малого бізнесу, експерти, консультанти й команди, яким потрібен контент без великого продакшну.', 'готово'],
    ['Позиціонування', 'Платформа, яка перетворює глобальні тренди на українські сценарії, запуски й продажі.', 'draft'],
  ];
  const voice = ['прямо', 'без інфоциганства', 'практично', 'українською', 'з доказами'];
  const frameworkItems = [
    ['Болі аудиторії', 'Score: 70', 'danger', ['нестача системного контенту', 'низька конверсія з охоплення', 'немає стабільного позиціонування']],
    ['Контент-рубрики', 'Score: 90', 'success', ['експертні розбори', 'кейси клієнтів', 'порівняння підходів']],
    ['Офер', 'Score: 78', 'warning', ['цінність продукту', 'умови входу', 'ключовий CTA']],
    ['Довіра', 'Score: 70', 'danger', ['соціальний доказ', 'процес роботи', 'публічні результати']],
    ['Продажі', 'Score: 90', 'success', ['lead magnet', 'Direct-сценарій', 'кваліфікація заявки']],
    ['Заперечення', 'Score: 78', 'warning', ['ціна', 'час', 'ризики впровадження']],
  ];
  const brandHealth = 82;

  return (
    <section className="page page-strategy">
      <PageTitle
        title={translateText('Аудит та позиціонування')}
        subtitle={translateText('Заміна ручного стратегічного аналізу: аудит профілю, ЦА, позиціонування, Tone of Voice і контент-рубрики.')}
        actions={<button className="dark" onClick={() => { setPage('assistant'); notify(translateText('Відкрив Асистента для формування позиціонування')); }}><Sparkles size={16} />Сформувати позиціонування</button>}
      />
      <article className="strategy-health-card">
        <div>
          <small>Здоровʼя бренду</small>
          <h2>Загальний бренд сильний, але продажі потребують чіткішої системи.</h2>
          <p>Сильні сторони: позиціонування та контент-рубрики. Зони росту: болі аудиторії, довіра й обробка заперечень.</p>
        </div>
        <div className="strategy-health-score">
          <strong>{brandHealth}<span>/100</span></strong>
          <i><b style={{ width: `${brandHealth}%` }} /></i>
          <em>{brandHealth}% готовності</em>
        </div>
      </article>
      <div className="strategy-layout">
        <article className="strategy-hero">
          <small>Позиціонування</small>
          <h2>Система для SMM і продюсерів, яка веде акаунт від ніші до продажу.</h2>
          <div className="home-badges">{voice.map((item) => <span key={item}>{item}</span>)}</div>
          <div className="strategy-cards strategy-cards-inline">
            {pillars.map(([title, text, score]) => (
              <article className="insight-card" key={title}>
                <div className="panel-title"><strong>{title}</strong><Badge>{score}</Badge></div>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </article>
      </div>
      <div className="framework-grid">
        {frameworkItems.map(([item, score, variant, rows]) => (
          <article className="framework-card" key={item}>
            <div className="panel-title"><strong>{item}</strong><Badge variant={variant}>{score}</Badge></div>
            <ul className="data-list">
              {rows.map((row, index) => (
                <li key={row}>
                  <span>{index + 1}</span>
                  <p>{row}</p>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}

function compactStatusLabel(status) {
  const normalized = String(status || '').toLowerCase();
  const map = {
    youtube_api: 'YouTube',
    youtube_oembed: 'YouTube',
    youtube_popular: 'Популярне',
    public_metadata: 'Контекст',
    metadata_fetch_failed: 'Обмежено',
    ready_to_adapt: 'Готово',
    ua_remix_ready: 'UA-адаптація',
    manual_text: 'Brief',
    url_only: 'URL',
  };
  if (map[normalized]) return map[normalized];
  if (normalized.includes('api')) return normalized.includes('youtube') ? 'YouTube' : 'Джерело';
  if (normalized.includes('ready')) return 'Готово';
  if (normalized.includes('проход')) return 'Gate';
  if (normalized.includes('us')) return 'US';
  if (normalized.includes('eu')) return 'EU';
  if (normalized.includes('global')) return 'Global';
  if (normalized.includes('україн')) return 'UA';
  if (normalized.includes('адап')) return 'Adapt';
  if (normalized.includes('ремікс')) return 'Remix';
  if (normalized.includes('шорт')) return 'Short';
  if (normalized.includes('голос')) return 'Voice';
  if (normalized.includes('creator')) return 'Creator';
  if (normalized.includes('актив')) return 'Active';
  if (normalized.includes('sync')) return 'Sync';
  return String(status || '').replace(/_/g, ' ').trim().slice(0, 14);
}

function getBadgeVariant(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (
    normalized.includes('готовий купити')
    || normalized.includes('готово')
    || normalized.includes('актив')
    || normalized.includes('100%')
    || normalized.includes('затвердж')
    || normalized.includes('проход')
  ) return 'success';
  if (
    normalized.includes('в роботі')
    || normalized.includes('draft')
    || normalized.includes('дедлайн сьогодні')
    || normalized.includes('потрібен розбір')
    || normalized.includes('черга')
    || normalized.includes('теплий')
    || normalized.includes('новий')
  ) return 'warning';
  if (
    normalized.includes('скарга')
    || normalized.includes('ризик')
    || normalized.includes('простроч')
  ) return 'danger';
  return 'neutral';
}

function Badge({ children, variant }) {
  const content = String(children ?? '');
  return <span className={`badge badge-${variant || getBadgeVariant(content)}`}>{content}</span>;
}

function useChecklistState(scope, initialLabels, notify, doneLabel = 'Затверджено', workspaceId = 'ws_demo_ua') {
  const { t } = useI18n();
  const initialItems = useMemo(() => initialLabels.map((label, index) => ({
    id: `${scope}_${index + 1}`,
    label,
    checked: false,
  })), [scope, initialLabels]);
  const [items, setItems] = useState(initialItems);

  useEffect(() => {
    let isMounted = true;
    authFetch(`${API_BASE}/workspaces/${workspaceId}/checklists/${scope}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (!isMounted || !payload?.checklist?.items?.length) return;
        const saved = new Map(payload.checklist.items.map((item) => [item.id, item.checked]));
        setItems(initialItems.map((item) => ({ ...item, checked: Boolean(saved.get(item.id)) })));
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, [scope, initialItems, workspaceId]);

  const saveItems = async (nextItems) => {
    const allChecked = nextItems.length > 0 && nextItems.every((item) => item.checked);
    const parentStatus = allChecked ? doneLabel : 'В роботі';
    const response = await authFetch(`${API_BASE}/workspaces/${workspaceId}/checklists/${scope}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parentStatus, items: nextItems }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || payload.error || 'checklist_save_failed');
  };

  const toggleItem = (id) => {
    setItems((current) => {
      const nextItems = current.map((item) => (item.id === id ? { ...item, checked: !item.checked } : item));
      saveItems(nextItems).catch((err) => notify?.(localizeInterfaceError(err, t, 'errors.generic')));
      return nextItems;
    });
  };

  return {
    items,
    allChecked: items.length > 0 && items.every((item) => item.checked),
    toggleItem,
  };
}

function getCompetitorMeta(row) {
  const nicheParts = String(row.niche || '').split('|').map((part) => part.trim()).filter(Boolean);
  const niche = nicheParts[nicheParts.length - 1] || row.niche || 'Ніша';
  return `${marketLabel(row.market)} / ${niche}`;
}

function renderChatMessageText(text) {
  return String(text || '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*/g, '')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block, index) => <p data-i18n-content key={`${block.slice(0, 24)}-${index}`}>{block}</p>);
}

function TypewriterText({ text, active }) {
  const cleanText = String(text || '');
  const [visibleText, setVisibleText] = useState(active ? '' : cleanText);

  useEffect(() => {
    if (!active) {
      setVisibleText(cleanText);
      return undefined;
    }
    setVisibleText('');
    let index = 0;
    const step = Math.max(1, Math.ceil(cleanText.length / 260));
    const timer = window.setInterval(() => {
      index += step;
      setVisibleText(cleanText.slice(0, index));
      if (index >= cleanText.length) window.clearInterval(timer);
    }, 24);
    return () => window.clearInterval(timer);
  }, [active, cleanText]);

  return <>{renderChatMessageText(visibleText)}</>;
}

function AssistantDrawer({ isOpen, onOpen, onClose, notify, workspaceId, activeWorkspace, language = 'uk' }) {
  const { t } = useI18n();
  const isEnglishUi = language === 'en';
  const assistantName = isEnglishUi ? 'Jeryk' : 'Джерик';
  const drawerCopy = isEnglishUi
    ? {
      assistantName,
      subtitle: 'small AI producer for Dzhero',
      you: 'You',
      openLabel: 'Open Jeryk',
      closeLabel: 'Close Jeryk',
      loadingTitle: `${assistantName} is thinking`,
      loadingText: 'Checking Brand Brain, signals, and the reply shape.',
      placeholder: 'Give Jeryk a task.',
      sendLabel: 'Send',
      actionIdea: 'To idea',
      actionScript: 'To script',
      actionVideo: 'Video task',
      savedIdea: `${assistantName} saved the idea`,
      madeScript: `${assistantName} created a script`,
      madeVideo: `${assistantName} created a video task`,
      actionFailed: (message) => `Could not run the action: ${message}`,
      offline: (message) => `Could not reach the AI provider: ${message}. I am still here: check the AI env or try again after redeploy.`,
      prompts: [
        'Explain what to do on this page',
        'Collect 5 ideas for the week',
        'Adapt a trend for my brand',
        'Write a short Reels script',
      ],
      seed: `Yo, I am ${assistantName}. I can quickly collect an idea, script, shot list, or explain what to do next in Dzhero.`,
    }
    : {
      assistantName,
      subtitle: 'малий AI-продюсер Dzhero',
      you: 'Ви',
      openLabel: 'Відкрити Джерика',
      closeLabel: 'Закрити Джерика',
      loadingTitle: `${assistantName} думає`,
      loadingText: 'Перевіряю Brand Brain, сигнали і формулюю відповідь.',
      placeholder: 'Напиши Джерику задачу.',
      sendLabel: 'Надіслати',
      actionIdea: 'В ідею',
      actionScript: 'В сценарій',
      actionVideo: 'Video task',
      savedIdea: `${assistantName} зберіг ідею`,
      madeScript: `${assistantName} зробив сценарій`,
      madeVideo: `${assistantName} створив video task`,
      actionFailed: (message) => `Не вийшло виконати дію: ${message}`,
      offline: (message) => `Не дістався до AI-провайдера: ${message}. Але я на місці: перевір env для AI або спробуй ще раз після redeploy.`,
      prompts: [
        'Поясни, що робити на цій сторінці',
        'Збери 5 ідей на тиждень',
        'Адаптуй тренд під мій бренд',
        'Напиши короткий Reels-сценарій',
      ],
      seed: `Йо, я ${assistantName}. Можу швидко зібрати ідею, сценарій, shot-list або пояснити, що робити далі у Dzhero.`,
    };
  const starterPrompts = drawerCopy.prompts;
  const seedMessages = [
    ['assistant', drawerCopy.seed],
  ];
  const messagesKey = `${workspaceId || 'default'}:${language}`;
  const [messagesByWorkspace, setMessagesByWorkspace] = useState({});
  const messages = messagesByWorkspace[messagesKey] || seedMessages;
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [actionStatus, setActionStatus] = useState('');
  const [agentMeta, setAgentMeta] = useState({ provider: 'ready', model: 'dzhero' });
  const threadRef = useRef(null);

  const setMessages = (updater) => {
    setMessagesByWorkspace((current) => {
      const currentMessages = current[messagesKey] || seedMessages;
      const nextMessages = typeof updater === 'function' ? updater(currentMessages) : updater;
      return { ...current, [messagesKey]: nextMessages };
    });
  };

  useEffect(() => {
    if (!isOpen) return;
    window.setTimeout(() => {
      threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' });
    }, 40);
  }, [isOpen, messages, isThinking]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const sendMessage = async (text = input) => {
    const clean = String(text || '').trim();
    if (!clean || isThinking) return;
    const history = messages.map(([role, messageText]) => ({
      role: role === 'assistant' ? 'assistant' : 'user',
      text: messageText,
    }));
    setMessages((current) => [...current, ['user', clean], ['assistant', JERYK_LOADING_MESSAGE]]);
    setInput('');
    setIsThinking(true);
    try {
      const response = await authFetch(`${API_BASE}/workspaces/${workspaceId}/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: clean, history }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || payload.error || 'agent_error');
      setAgentMeta({ provider: payload.provider || 'agent', model: payload.model || 'dzhero' });
      setMessages((current) => current.map((item, index) => (
        index === current.length - 1 ? ['assistant', payload.reply] : item
      )));
    } catch (error) {
      setAgentMeta({ provider: 'offline', model: 'fallback' });
      setMessages((current) => current.map((item, index) => (
        index === current.length - 1
          ? ['assistant', localizeInterfaceError(error, t, 'errors.assistant')]
          : item
      )));
    } finally {
      setIsThinking(false);
    }
  };

  const latestAssistantText = [...messages].reverse().find(([role]) => role === 'assistant')?.[1] || '';
  const extractIdeaTitle = (text) => {
    const line = String(text || '').split('\n').map((item) => item.trim()).find(Boolean);
    return (line || 'Jeryk idea').replace(/^[0-9.)\s-]+/, '').slice(0, 120);
  };

  const runAgentAction = async (action) => {
    if (!latestAssistantText || actionStatus) return;
    setActionStatus(action);
    try {
      const response = await authFetch(`${API_BASE}/workspaces/${workspaceId}/agent/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          title: extractIdeaTitle(latestAssistantText),
          text: latestAssistantText,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'agent_action_failed');
      notify(action === 'generate_script'
        ? drawerCopy.madeScript
        : action === 'create_video_job'
          ? drawerCopy.madeVideo
          : drawerCopy.savedIdea);
    } catch (error) {
      notify(localizeInterfaceError(error, t, 'errors.generic'));
    } finally {
      setActionStatus('');
    }
  };

  return (
    <>
      {!isOpen && (
        <button className="jeryk-idle-card" type="button" onClick={onOpen} aria-label={drawerCopy.openLabel}>
          <div className="jeryk-producer static" aria-hidden="true">
            <div className="jeryk-producer-body">
              <span className="jeryk-producer-eye" />
              <span className="jeryk-producer-smile" />
              <span className="jeryk-producer-arm left" />
              <span className="jeryk-producer-arm right" />
              <span className="jeryk-producer-foot left" />
              <span className="jeryk-producer-foot right" />
            </div>
          </div>
        </button>
      )}
      {isOpen && <button className="jeryk-backdrop" type="button" aria-label={drawerCopy.closeLabel} onClick={onClose} />}
      <aside
        className={isOpen ? 'jeryk-drawer open' : 'jeryk-drawer'}
        aria-hidden={!isOpen}
        aria-label={assistantName}
        aria-modal={isOpen ? 'true' : undefined}
        role="dialog"
      >
        <div className="jeryk-head">
          <div className="jeryk-avatar"><Bot size={24} /></div>
          <div>
            <strong>{assistantName}</strong>
            <span>{drawerCopy.subtitle}</span>
          </div>
          <button className="icon" type="button" onClick={onClose} aria-label={drawerCopy.closeLabel}><X size={17} /></button>
        </div>
        <div className="jeryk-context">
          <span data-i18n-content>{activeWorkspace?.name || 'Workspace'}</span>
          <em>{agentMeta.provider}</em>
        </div>
        <div className="jeryk-thread" ref={threadRef}>
          {messages.map(([role, text], index) => (
            <div className={`jeryk-message ${role}`} key={`${role}-${index}`}>
              <span>{role === 'assistant' ? assistantName : drawerCopy.you}</span>
              <div>
                {text === JERYK_LOADING_MESSAGE
                  ? <JerykLoading title={drawerCopy.loadingTitle} text={drawerCopy.loadingText} compact />
                  : role === 'assistant'
                  ? <TypewriterText text={text} active={index === messages.length - 1 && !isThinking} />
                  : renderChatMessageText(text)}
              </div>
            </div>
          ))}
        </div>
        <div className="jeryk-prompts">
          {starterPrompts.map((prompt) => (
            <button type="button" key={prompt} onClick={() => sendMessage(prompt)} disabled={isThinking}>{prompt}</button>
          ))}
        </div>
        <div className="jeryk-input-row">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              if (event.shiftKey) return;
              event.preventDefault();
              sendMessage();
            }}
            placeholder={drawerCopy.placeholder}
            maxLength={600}
          />
          <button className="dark" type="button" onClick={() => sendMessage()} disabled={isThinking || !input.trim()} aria-label={drawerCopy.sendLabel}>
            <Send size={17} />
          </button>
        </div>
        <div className="jeryk-actions">
          <button type="button" onClick={() => runAgentAction('save_idea')} disabled={isThinking || actionStatus || !latestAssistantText}>{drawerCopy.actionIdea}</button>
          <button type="button" onClick={() => runAgentAction('generate_script')} disabled={isThinking || actionStatus || !latestAssistantText}>{drawerCopy.actionScript}</button>
          <button type="button" onClick={() => runAgentAction('create_video_job')} disabled={isThinking || actionStatus || !latestAssistantText}>{drawerCopy.actionVideo}</button>
        </div>
      </aside>
    </>
  );
}

function getReelPreviewImage(reel) {
  return reel?.image
    || reel?.importedMetadata?.image
    || reel?.importedMetadata?.youtube?.thumbnailUrl
    || '';
}

function getReelVideoSource(reel) {
  return reel?.videoUrl
    || reel?.importedMetadata?.videoUrl
    || reel?.importedMetadata?.mediaUrls?.[0]
    || reel?.importedMetadata?.apify?.mediaUrls?.[0]
    || '';
}

function getYouTubeVideoIdFromReel(reel) {
  const directId = reel?.importedMetadata?.youtube?.videoId;
  if (directId) return String(directId).trim();
  const rawUrl = reel?.sourceUrl || reel?.importedMetadata?.url || reel?.url || '';
  if (!rawUrl) return '';
  try {
    const url = new URL(rawUrl);
    if (url.hostname.includes('youtu.be')) return url.pathname.split('/').filter(Boolean)[0] || '';
    if (url.pathname.includes('/shorts/')) return url.pathname.split('/shorts/')[1]?.split(/[/?#]/)[0] || '';
    if (url.pathname.includes('/embed/')) return url.pathname.split('/embed/')[1]?.split(/[/?#]/)[0] || '';
    return url.searchParams.get('v') || '';
  } catch {
    const match = String(rawUrl).match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([^?&#/]+)/i);
    return match?.[1] || '';
  }
}

function getYouTubeEmbedUrl(reel) {
  const videoId = getYouTubeVideoIdFromReel(reel);
  if (!videoId) return '';
  const url = new URL(`https://www.youtube.com/embed/${videoId}`);
  url.searchParams.set('autoplay', '1');
  url.searchParams.set('playsinline', '1');
  url.searchParams.set('rel', '0');
  url.searchParams.set('modestbranding', '1');
  return url.toString();
}

function getSignalSourceUrl(reel) {
  return reel?.sourceUrl || reel?.importedMetadata?.url || '';
}

function formatYouTubeDuration(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const match = raw.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i);
  if (!match) return raw;
  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);
  const totalSeconds = (hours * 3600) + (minutes * 60) + seconds;
  if (!totalSeconds) return '';
  if (totalSeconds < 60) return `${totalSeconds}с`;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  return `${totalMinutes}:${String(remainingSeconds).padStart(2, '0')}`;
}

function getReelDurationLabel(reel) {
  return formatYouTubeDuration(
    reel?.duration
      || reel?.importedMetadata?.duration
      || reel?.importedMetadata?.youtube?.duration
      || reel?.importedMetadata?.videoIntelligence?.facts?.duration,
  );
}

function getReelPublishedLabel(reel) {
  const rawDate = reel?.publishedAt || reel?.createdAt || reel?.importedMetadata?.publishedAt || reel?.importedMetadata?.videoIntelligence?.facts?.publishedAt;
  if (!rawDate) return '';
  const date = new Date(rawDate);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('uk-UA', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date).replace(',', '');
}

function formatDiscoveryTimestamp(value, language = 'uk') {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'uk-UA', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date).replace(',', '');
}

function formatUsdAmount(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numeric);
}

function ReelsTable({ reels, sort = 'score', scoreSortDirection, onSortChange, onToggleScoreSort, onOpenPreview, onAdapt, emptyState = null }) {
  const { translateText } = useI18n();
  const [adaptingKey, setAdaptingKey] = useState('');
  const adaptReel = (reel) => {
    const key = reel.id || `${reel.handle}-${reel.title}`;
    setAdaptingKey(key);
    window.setTimeout(() => onAdapt?.(reel), 120);
  };
  return (
    <div className="table-card trend-analytics-table">
      <div className="table-head trend-grid signals-grid">
        <span>#</span>
        <span>Сигнал</span>
        <button className="score-sort-button" type="button" onClick={onToggleScoreSort}>Оцінка <span>{scoreSortDirection === 'desc' ? '↓' : '↑'}</span></button>
        <button className={`score-sort-button metric-sort-button ${sort === 'views' ? 'active' : ''}`} type="button" onClick={() => onSortChange?.('views')}>Перегляди <span>{sort === 'views' ? '↓' : ''}</span></button>
        <button className={`score-sort-button metric-sort-button ${sort === 'likes' ? 'active' : ''}`} type="button" onClick={() => onSortChange?.('likes')}>Лайки <span>{sort === 'likes' ? '↓' : ''}</span></button>
        <span>Ринок</span>
        <span>Теги</span>
        <span></span>
      </div>
      {reels.map((reel, index) => {
        const rowKey = reel.id || `${reel.handle}-${reel.title}`;
        const isAdapting = adaptingKey === rowKey;
        const previewImage = getReelPreviewImage(reel);
        const viewsLabel = formatMetricDisplay(reel.views);
        const likesLabel = formatMetricDisplay(reel.likes);
        const metaLine = [marketLabel(reel.market), getReelDurationLabel(reel), getReelPublishedLabel(reel)].filter(Boolean).join(' · ');
        return (
        <div className={`reel-row trend-grid signals-grid ${isAdapting ? 'is-adapting' : ''}`} key={rowKey}>
          <span className="trend-rank">{String(index + 1).padStart(2, '0')}</span>
          <div className="reel-info">
            <button
              className={`thumb market-${reel.market}`}
              data-i18n-content
              type="button"
              onClick={() => onOpenPreview(reel)}
              aria-label={translateText(`Відкрити прев'ю ${reel.title}`)}
              style={previewImage ? { backgroundImage: `linear-gradient(180deg, rgba(3, 7, 18, 0), rgba(3, 7, 18, 0.18)), url("${previewImage}")` } : undefined}
            >
              <span>{viewsLabel}</span>
              <i className="thumb-play" aria-hidden="true" />
            </button>
            <div><strong data-i18n-content>{reel.title}</strong><small data-i18n-content>{metaLine}</small></div>
          </div>
          <Score value={reel.score} />
          <strong>{viewsLabel}</strong>
          <span>{likesLabel}</span>
          <span>{marketLabel(reel.market)}</span>
          <div className="status-list status-badges">{reel.status.map((s) => <em title={compactStatusLabel(s)} key={s}>{compactStatusLabel(s)}</em>)}</div>
          <button className="signal-adapt-button" type="button" onClick={() => adaptReel(reel)} disabled={isAdapting}>
            {isAdapting ? <RefreshCw className="is-spinning" size={14} /> : <Wand2 size={14} />}
            {isAdapting ? 'Відкриваємо...' : 'Адаптувати'}
          </button>
        </div>
        );
      })}
      {!reels.length && emptyState && (
        <div className="signals-empty-state">
          <strong>{emptyState.title}</strong>
          <p>{emptyState.text}</p>
        </div>
      )}
    </div>
  );
}

function SignalsReelsTable({
  reels,
  sort = 'score',
  onSortChange,
  scoreSortDirection,
  onToggleScoreSort,
  onOpenPreview,
  onAdapt,
  emptyState = null,
  hasActiveFilters = false,
  automationEnabled = true,
  canRunAutomation = true,
  isLoading = false,
  loadIssue = '',
  onRunAutomation,
  onToggleAutomation,
  onOpenAdvancedImport,
  onRefreshAutomation,
}) {
  const { language } = useI18n();
  if (reels.length === 0 && !hasActiveFilters) {
    const authoritativeEmptyState = deriveSignalsEmptyState({
      reelsCount: 0,
      filteredReelsCount: 0,
      hasActiveFilters: false,
      automationEnabled,
      canRunAutomation,
      isLoading,
      loadIssue,
      language,
    });

    if (authoritativeEmptyState?.kind === 'loading') {
      return (
        <div className="table-card trend-analytics-table signals-empty-shell">
          <div className="signals-empty-state signals-empty-state--loading">
            <span className="signals-empty-state-kicker">Signals</span>
            <strong>{authoritativeEmptyState.title}</strong>
            <p>{authoritativeEmptyState.text}</p>
          </div>
        </div>
      );
    }

    if (authoritativeEmptyState?.kind === 'error') {
      return (
        <div className="table-card trend-analytics-table signals-empty-shell">
          <div className="signals-empty-state signals-empty-state--error">
            <span className="signals-empty-state-kicker">Signals</span>
            <strong>{authoritativeEmptyState.title}</strong>
            <p>{authoritativeEmptyState.text}</p>
            <div className="signals-empty-actions">
              {authoritativeEmptyState.primaryAction && (
                <button className="dark" type="button" onClick={() => void onRefreshAutomation?.()}>
                  <RefreshCw size={16} />
                  {authoritativeEmptyState.primaryAction.label}
                </button>
              )}
              {authoritativeEmptyState.secondaryAction && (
                <button type="button" onClick={onOpenAdvancedImport}>
                  <ChevronDown size={16} />
                  {authoritativeEmptyState.secondaryAction.label}
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    const primaryAction = authoritativeEmptyState?.primaryAction || null;
    const isRunAction = primaryAction?.kind === 'run';
    const isEnableAction = primaryAction?.kind === 'enable';

    return (
      <div className="table-card trend-analytics-table signals-empty-shell">
        <div className="signals-empty-state signals-empty-state--authoritative">
          <span className="signals-empty-state-kicker">Signals</span>
          <strong>{authoritativeEmptyState.title}</strong>
          <p>{authoritativeEmptyState.text}</p>
          <div className="signals-empty-actions">
            {primaryAction && (
              <button
                className="dark"
                type="button"
                disabled={primaryAction.disabled}
                onClick={() => {
                  if (isRunAction) {
                    onRunAutomation?.();
                  } else if (isEnableAction) {
                    onToggleAutomation?.(true);
                  }
                }}
              >
                {isRunAction ? <Bot size={16} /> : <Sparkles size={16} />}
                {primaryAction.label}
              </button>
            )}
            {authoritativeEmptyState.secondaryAction && (
              <button type="button" onClick={onOpenAdvancedImport}>
                <ChevronDown size={16} />
                {authoritativeEmptyState.secondaryAction.label}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <ReelsTable
      reels={reels}
      sort={sort}
      onSortChange={onSortChange}
      scoreSortDirection={scoreSortDirection}
      onToggleScoreSort={onToggleScoreSort}
      onOpenPreview={onOpenPreview}
      onAdapt={onAdapt}
      emptyState={emptyState}
    />
  );
}

function Competitors({ competitors, openModal }) {
  const { translateText } = useI18n();
  const [query, setQuery] = useState('');
  const filteredCompetitors = competitors.filter((row) => `${row.handle} ${row.niche} ${row.status}`.toLowerCase().includes(query.toLowerCase()));

  return (
    <section className="page">
      <PageTitle title={translateText('База конкурентів')} subtitle={translateText('Глобальний список акаунтів для аналізу: Україна, США, Європа та англомовний global.')} actions={<button className="dark" onClick={() => openModal('competitor')}><Plus size={16} />Додати конкурента</button>} />
      <div className="competitor-toolbar">
        <label>
          <Search size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={translateText('Пошук конкурентів...')} />
        </label>
        <span>{filteredCompetitors.length} акаунтів у вибірці</span>
      </div>
      <div className="table-card">
        <div className="table-head comp-grid"><span>Конкурент</span><span>Ніша</span><span>Рілсів</span><span>Останні хіти</span><span>Ср. скор</span><span>Найкращий охоп</span><span>Статус</span></div>
        {filteredCompetitors.map((row) => (
          <div className="comp-row comp-grid" key={row.handle}>
            <div className="handle competitor-handle">
              <b>{row.handle[1].toUpperCase()}</b>
              <a data-i18n-content href={`https://instagram.com/${row.handle.slice(1)}`} target="_blank" rel="noreferrer">{row.handle}</a>
              <small data-i18n-content>{getCompetitorMeta(row)}</small>
            </div>
            <span className="niche-text" data-i18n-content>{row.niche}</span>
            <strong>{row.reels}</strong>
            <div className="hit-stack"><i /><i /><i /></div>
            <Score value={row.score} compact />
            <span>{row.bestViews}</span>
            <em className="status-badge" title={row.status}>{compactStatusLabel(row.status)}</em>
          </div>
        ))}
      </div>
    </section>
  );
}

function buildRemixScenario(reel, observedContext = '') {
  const calendarScenario = buildCalendarRemixScenario(reel);
  if (calendarScenario) return calendarScenario;

  if (reel.scanExample) {
    return {
      quality: ['public_metadata', 'youtube_api', 'youtube_oembed'].includes(reel.sourceStatus)
        ? 'Джеро прочитав публічний профіль і зібрав перший production draft без доступу до акаунта.'
        : 'Preview draft зібрано з ручного джерела. Для глибокої аналітики треба підключити офіційні джерела.',
      insight: reel.scanCards?.[1]?.[1] || reel.caption || 'Brand Scan перетворено у сценарій, shot-list і CTA.',
      checklist: [
        ...(reel.scanIdeas || []).map((idea) => `Тег бренду: ${idea}`),
        reel.importedMetadata?.stats?.followers ? `Публічний сигнал: ${reel.importedMetadata.stats.followers} followers` : '',
        reel.importedMetadata?.stats?.posts ? `Активність профілю: ${reel.importedMetadata.stats.posts} posts` : '',
      ].filter(Boolean).slice(0, 5),
      script: (reel.scanExample.script || []).map(([time, text]) => ({
        time,
        frame: text,
        voice: time === '0-2с' || time === '0-2c' ? reel.scanExample.hook : text,
      })),
      variants: [
        {
          title: reel.scanExample.title,
          hook: reel.scanExample.hook,
          structure: [
            ...(reel.scanExample.script || []).map(([time, text]) => `${time}: ${text}`),
            `Caption: ${reel.scanExample.caption}`,
          ],
        },
        {
          title: 'Варіант 2: серія на 7 днів',
          hook: reel.scanPlan?.[2]?.[1] || reel.title,
          structure: (reel.scanPlan || []).map(([day, title]) => `${day}: ${title}`),
        },
      ],
    };
  }

  if (reel.remixResult?.remixes?.length) {
    const firstRemix = reel.remixResult.remixes[0];
    const script = (firstRemix.visualFlow || []).map((step) => ({
      time: step.timeframe || '',
      frame: step.actionDescription || 'Кадр для зйомки',
      voice: [step.onScreenText, step.audioVoiceover].filter(Boolean).join(' — '),
    }));
    return {
      quality: ['public_metadata', 'youtube_api', 'youtube_oembed'].includes(reel.sourceStatus)
        ? 'Автоімпорт знайшов публічні дані й згенерував адаптацію'
        : 'Instagram обмежив дані, але Джеро зібрав базову адаптацію від URL-сигналу',
      insight: reel.remixResult.deconstruction?.coreMechanics || 'Джеро розклав Reels на хук, доказ, локальний контекст і CTA.',
      checklist: [
        reel.remixResult.viabilityFilter?.uaMentalityCheck,
        reel.remixResult.viabilityFilter?.productionFeasibility,
        ...(reel.remixResult.deconstruction?.psychologicalTriggers || []),
      ].filter(Boolean).slice(0, 5),
      script: script.length ? script : [{
        time: '0-15 c',
        frame: 'Зняти простий Reels зі смартфона',
        voice: firstRemix.hook || reel.title,
      }],
      variants: reel.remixResult.remixes.map((remix) => ({
        title: remix.title,
        hook: remix.hook,
        structure: [
          ...(remix.visualFlow || []).map((step) => `${step.timeframe}: ${step.onScreenText || step.actionDescription || step.audioVoiceover}`),
          remix.cta,
        ].filter(Boolean),
      })),
    };
  }

  const intelligence = reel.importedMetadata?.videoIntelligence || {};
  const visual = intelligence.visual || {};
  const video = intelligence.video || {};
  const sourceText = [
    sanitizeSourceContext(observedContext),
    sanitizeSourceContext(video.videoSummary),
    sanitizeSourceContext(video.spokenText),
    sanitizeSourceContext(video.onScreenText),
    sanitizeSourceContext(video.hook),
    sanitizeSourceContext(video.twist),
    sanitizeSourceContext(video.contentMechanic),
    sanitizeSourceContext(video.ukrainianAdaptation),
    Array.isArray(video.sceneBeats) ? video.sceneBeats.map(sanitizeSourceContext).filter(Boolean).join('. ') : '',
    Array.isArray(video.shotList) ? video.shotList.map(sanitizeSourceContext).filter(Boolean).join('. ') : '',
    sanitizeSourceContext(reel.transcript),
    sanitizeSourceContext(reel.caption),
    sanitizeSourceContext(reel.importedMetadata?.description),
    sanitizeSourceContext(reel.importedMetadata?.title),
    sanitizeSourceContext(visual.visualSummary),
    sanitizeSourceContext(visual.hookMechanic),
    Array.isArray(visual.shotSignals) ? visual.shotSignals.join('. ') : '',
    reel.angle,
    reel.title,
  ].filter(Boolean).join(' ').trim();
  const hasSourceText = sourceText.length > 35;
  const cleanTitle = (reel.title || 'Рілс для адаптації').replace('...', '').trim();
  const sourceSentences = sourceText
    .split(/[.!?\n]+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 14)
    .slice(0, 4);
  const videoShotList = Array.isArray(video.shotList) ? video.shotList.map(sanitizeSourceContext).filter(Boolean) : [];
  const videoBeats = Array.isArray(video.sceneBeats) ? video.sceneBeats.map(sanitizeSourceContext).filter(Boolean) : [];
  const coreSignal = sanitizeSourceContext(video.hook) || sanitizeSourceContext(video.contentMechanic) || videoBeats[0] || sourceSentences[0] || 'visual contrast, proof, routine, and a simple brand-specific CTA';
  const proofSignal = sanitizeSourceContext(video.twist) || videoBeats[1] || sourceSentences[1] || 'покажи конкретний поворот, контраст або доказ, який тримає увагу';
  const frictionSignal = sanitizeSourceContext(video.ukrainianAdaptation) || videoBeats[2] || sourceSentences[2] || 'перенеси механіку в локальну ситуацію без копіювання персонажів, звуку або сцени';
  const cta = 'Напиши "ХОЧУ" в Direct або залиш коментар, і я надішлю шаблон під твою нішу.';

  return {
    quality: hasSourceText ? 'Є достатньо контексту для першого сценарію' : 'Потрібен caption або транскрипт, щоб сценарій став точнішим',
    insight: hasSourceText
      ? `Головна механіка: ${coreSignal}. Її треба перенести не дослівно, а через локальний контекст, власний кадр і простий CTA.`
      : 'Зараз є тільки загальна ідея/посилання, тому Джеро може зібрати структуру, але для сильного сценарію треба додати, що саме відбувається у відео.',
    checklist: [
      'Перший кадр: чіткий біль або несподіване твердження за 1-2 секунди.',
      'Середина: 2-3 кадри з доказом, процесом або помилкою, яку глядач впізнає.',
      'Фінал: локальний CTA без абстрактного "підписуйся" - коментар, Direct, чеклист, консультація.',
    ],
    script: [
      {
        time: '0-2 c',
        frame: videoShotList[0] || 'Крупний план / екран з головним конфліктом',
        voice: `Хук: "${coreSignal.length > 90 ? coreSignal.slice(0, 90) + '...' : coreSignal}"`,
      },
      {
        time: '2-6 c',
        frame: videoShotList[1] || 'Покажи контраст, реакцію або поворот, який тримає увагу',
        voice: `Пояснення: ${proofSignal}. Перенеси це у свою ситуацію без копіювання оригіналу.`,
      },
      {
        time: '6-11 c',
        frame: videoShotList[2] || '2-3 швидкі кадри, які розкривають механіку або жарт',
        voice: `Структура: проблема -> рішення -> доказ. ${frictionSignal}.`,
      },
      {
        time: '11-15 c',
        frame: videoShotList[3] || 'Результат, реакція, скрін або короткий підсумок',
        voice: `CTA: ${cta}`,
      },
    ],
    variants: [
      {
        title: 'Варіант 1: біль клієнта',
        hook: `Український бізнес втрачає заявки не через продукт, а через перші 2 секунди контенту.`,
        structure: ['Назвати біль', 'Показати помилку на прикладі', 'Дати просту заміну кадру/тексту', cta],
      },
      {
        title: 'Варіант 2: до / після',
        hook: `Ось як перетворити чужу Reels-механіку на свій сценарій без копіювання.`,
        structure: ['Показати оригінальну механіку словами', 'Замінити приклад на локальний', 'Додати доказ і CTA', 'Попросити нішу в коментарях'],
      },
      {
        title: 'Варіант 3: заперечення',
        hook: `“У нас це не спрацює” - найчастіша причина, чому бізнес не тестує нормальний Reels.`,
        structure: ['Озвучити заперечення', 'Розбити його одним кейсом', 'Дати міні-скрипт', 'Закрити в Direct'],
      },
    ],
  };
}

function buildGlobalInsightForRemix(reel, observedContext = '') {
  const metadata = reel.importedMetadata || {};
  const intelligence = metadata.videoIntelligence || {};
  const transcriptText = sanitizeSourceContext(intelligence.transcript?.text || reel.transcript || '');
  const video = intelligence.video || {};
  const visual = intelligence.visual || {};
  const notes = sanitizeSourceContext(observedContext);
  const script = [
    notes ? `Human video notes: ${notes}` : '',
    sanitizeSourceContext(video.videoSummary) ? `Gemini video summary: ${sanitizeSourceContext(video.videoSummary)}` : '',
    sanitizeSourceContext(video.spokenText) ? `Spoken/audio text: ${sanitizeSourceContext(video.spokenText)}` : '',
    sanitizeSourceContext(video.onScreenText) ? `On-screen text: ${sanitizeSourceContext(video.onScreenText)}` : '',
    sanitizeSourceContext(video.contentMechanic) ? `Video mechanic: ${sanitizeSourceContext(video.contentMechanic)}` : '',
    Array.isArray(video.sceneBeats) ? video.sceneBeats.map(sanitizeSourceContext).filter(Boolean).map((item) => `Scene beat: ${item}`) : '',
    Array.isArray(video.shotList) ? video.shotList.map(sanitizeSourceContext).filter(Boolean).map((item) => `Shot: ${item}`) : '',
    transcriptText ? `Transcript/captions: ${transcriptText}` : '',
    sanitizeSourceContext(metadata.description || reel.caption) ? `Public description: ${sanitizeSourceContext(metadata.description || reel.caption)}` : '',
    sanitizeSourceContext(visual.visualSummary) ? `Visible thumbnail facts: ${sanitizeSourceContext(visual.visualSummary)}` : '',
    sanitizeSourceContext(visual.hookMechanic) ? `Thumbnail hook mechanic: ${sanitizeSourceContext(visual.hookMechanic)}` : '',
    intelligence.readiness?.gaps?.length ? `Known source gaps: ${intelligence.readiness.gaps.join('; ')}` : '',
  ].flat().filter(Boolean).join('\n');

  return {
    title: metadata.title || reel.title || 'Short-form signal',
    hook: video.hook || metadata.description || reel.title || '',
    script,
    marketingMechanics: video.contentMechanic || video.ukrainianAdaptation || visual.hookMechanic || 'Adapt the observed attention mechanic into an original Ukrainian short-form script.',
    videoIntelligence: intelligence,
  };
}

function BrandScanStudioPanel({ reel, onSaveBrandBrain, brainStatus }) {
  useI18n();
  const metadata = reel.importedMetadata || {};
  const stats = metadata.stats || {};
  const example = reel.scanExample;
  const hasBrandScan = reel.sourceType || reel.scanExample || hasSourceMetadata(metadata) || ['youtube_api', 'youtube_oembed'].includes(reel.sourceStatus);
  if (!hasBrandScan) return null;

  return (
    <div className="brand-studio-panel">
      <div className="brand-studio-head">
        <div>
          <small>Brand Scan draft</small>
          <h3 data-i18n-content>{reel.scanLabel || metadata.source?.label || reel.status?.[0] || 'Публічний профіль'}</h3>
        </div>
      </div>
      <div className="brand-studio-meta">
        <article>
          <small>Джерело</small>
          <strong data-i18n-content>{metadata.handle || reel.handle}</strong>
          <p data-i18n-content>{metadata.title || reel.sourceUrl || reel.title}</p>
        </article>
        <article>
          <small>Сигнали бренду</small>
          <strong data-i18n-content>{metadataStatChips(metadata)[0] || reel.scanLabel || 'Контекст готовий'}</strong>
          <p>{stats.posts ? `${stats.posts} posts · ${stats.following || '-'} following` : 'Опис, ніша і контекст для сценаріїв.'}</p>
        </article>
      </div>
      {!!reel.scanIdeas?.length && (
        <div className="brand-studio-tags">
          {reel.scanIdeas.map((idea) => <span data-i18n-content key={idea}>{idea}</span>)}
        </div>
      )}
      {example && (
        <div className="brand-studio-example">
          <small>Перша production-генерація</small>
          <strong data-i18n-content>{example.hook}</strong>
          <div>
            {(example.script || []).map(([time, text]) => (
              <span data-i18n-content key={time}><b>{time}</b>{text}</span>
            ))}
          </div>
          <p data-i18n-content>{example.caption}</p>
        </div>
      )}
      {!!reel.scanPlan?.length && (
        <div className="brand-studio-week">
          <small>Перший тиждень</small>
          {reel.scanPlan.map(([day, title]) => (
            <span data-i18n-content key={day}><b>{day}</b>{title}</span>
          ))}
        </div>
      )}
      <div className="brand-studio-actions">
        <button className="dark" type="button" onClick={() => onSaveBrandBrain?.(reel)} disabled={brainStatus === 'saving'}>
          <Database size={16} />{brainStatus === 'saving' ? 'Зберігаємо...' : 'Зберегти в Brand Brain'}
        </button>
      </div>
    </div>
  );
}

function RemixStudio({ reel, notify, setPage, workspaceId, autoGenerateRequest, onAutoGenerateConsumed, onAddToPlan, onSaveBrandBrain }) {
  const { t, translateText } = useI18n();
  const [adaptationState, setAdaptationState] = useState('idle');
  const [brainStatus, setBrainStatus] = useState('idle');
  const [observedContext, setObservedContext] = useState('');
  const [generatedRemix, setGeneratedRemix] = useState(null);
  const [adaptationError, setAdaptationError] = useState('');
  const autoRemixKeyRef = useRef('');
  useEffect(() => {
    setObservedContext('');
    setGeneratedRemix(null);
    setAdaptationError('');
    setAdaptationState('idle');
  }, [reel.id, reel.sourceUrl, reel.title]);
  const sourceMetadata = reel.importedMetadata || {};
  const reelHandle = sourceMetadata.youtube?.channelTitle || reel.handle || reel.sourceHandle || '@instagram.reel';
  const mediaImage = getReelPreviewImage(reel);
  const phoneLabel = sourceMetadata.source?.label === 'YouTube Shorts' ? 'SHORTS' : 'GLOBAL';
  const videoIntelligence = sourceMetadata.videoIntelligence || {};
  const transcriptInfo = videoIntelligence.transcript || {};
  const videoInfo = videoIntelligence.video || {};
  const readiness = videoIntelligence.readiness || null;
  const hasYouTubeIntelligence = ['youtube_api', 'youtube_oembed'].includes(reel.sourceStatus) || Boolean(sourceMetadata.youtube);
  const cleanTranscriptPreview = sanitizeSourceContext(transcriptInfo.text);
  const cleanVideoSummary = sanitizeSourceContext(videoInfo.videoSummary);
  const youtubeContextSummary = cleanTranscriptPreview
    ? `Є транскрипт ${transcriptInfo.language ? `(${transcriptInfo.language})` : ''}: ${cleanTranscriptPreview.slice(0, 220)}${cleanTranscriptPreview.length > 220 ? '...' : ''}`
    : cleanVideoSummary
      ? `Відео-аналіз: ${cleanVideoSummary.slice(0, 260)}${cleanVideoSummary.length > 260 ? '...' : ''}`
      : 'YouTube не дав транскрипт. Джеро вже може працювати з назвою, метриками й превʼю, а за потреби можна додати коротку нотатку про сюжет.';
  const effectiveReel = generatedRemix ? { ...reel, remixResult: generatedRemix } : reel;
  const scenario = buildRemixScenario(effectiveReel, sanitizeSourceContext(observedContext));
  const scenarioVariants = scenario.variants;
  const adaptScenario = async () => {
    setAdaptationState('loading');
    setAdaptationError('');
    notify(translateText('Джеро думає над адаптацією, це вже реальний AI-запит'));
    try {
      const response = await authFetch(`${API_BASE}/workspaces/${workspaceId}/remix/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          globalInsight: buildGlobalInsightForRemix(reel, observedContext),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || payload.error || 'remix_generation_failed');
      setGeneratedRemix(payload);
      setAdaptationState('ready');
      notify(translateText('Підготовлено 3 AI-варіанти адаптації'));
    } catch (error) {
      setAdaptationState('idle');
      setAdaptationError(localizeInterfaceError(error, t, 'errors.remixGeneration'));
      notify(translateText('AI-адаптація не пройшла. Залишив чернетку, можна спробувати ще раз.'));
    }
  };
  useEffect(() => {
    if (!shouldRunRemixAutoRequest({
      request: autoGenerateRequest,
      lastHandledId: autoRemixKeyRef.current,
      workspaceId,
    })) return;
    autoRemixKeyRef.current = autoGenerateRequest.id;
    onAutoGenerateConsumed?.();
    adaptScenario();
  }, [autoGenerateRequest, workspaceId]);
  const copyScenario = async () => {
    const scenarioText = [
      `Джерело: ${reelHandle}`,
      `Ідея: ${reel.title}`,
      '',
      'Production script:',
      ...scenario.script.map((step) => `${step.time}\nКадр: ${step.frame}\nТекст: ${step.voice}`),
      '',
      'Варіанти:',
      ...scenarioVariants.map((variant) => `${variant.title}\nХук: ${variant.hook}\n${variant.structure.map((item, index) => `${index + 1}. ${item}`).join('\n')}`),
    ].join('\n\n');
    const copyWithTextarea = () => {
      const textarea = document.createElement('textarea');
      textarea.value = scenarioText;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      textarea.style.top = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const copied = document.execCommand('copy');
      document.body.removeChild(textarea);
      return copied;
    };
    try {
      if (copyWithTextarea()) {
        notify(translateText('Сценарій скопійовано!'));
        return;
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(scenarioText);
        notify(translateText('Сценарій скопійовано!'));
        return;
      }
      notify(translateText('Сценарій скопійовано!'));
    } catch {
      notify(translateText('Сценарій скопійовано!'));
    }
  };
  const saveCurrentBrandBrain = async (currentReel) => {
    setBrainStatus('saving');
    const ok = await onSaveBrandBrain?.(currentReel);
    setBrainStatus(ok ? 'saved' : 'idle');
    if (ok) window.setTimeout(() => setBrainStatus('idle'), 1800);
  };
  const isBrandScanDraft = Boolean(reel.sourceType || reel.scanExample || hasSourceMetadata(reel.importedMetadata || {}) || ['youtube_api', 'youtube_oembed'].includes(reel.sourceStatus));
  const exactSourceStats = reel.importedMetadata?.rawStats || {};
  const formatExactStat = (value, label) => {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue) || numberValue <= 0) return undefined;
    return `${numberValue.toLocaleString('en-US')} ${label}`;
  };
  const addCurrentToPlan = async () => {
    const ok = await onAddToPlan?.(effectiveReel);
    if (ok !== false) setPage('plan');
  };

  return (
    <section className="page page-remix-studio">
      <PageTitle title={translateText('Студія')} actions={<button onClick={adaptScenario} disabled={adaptationState === 'loading'}><RefreshCw size={16} />{adaptationState === 'loading' ? 'Генеруємо...' : 'Перегенерувати AI'}</button>} />
      <div className="remix-layout">
        <div className="remix-side-panel">
          <div className="phone-card">
            <div className="phone-head"><b>{reelHandle.replace(/^@/, '')}</b><span>⋮</span></div>
            <div
              className={`phone-video market-${reel.market} ${mediaImage ? 'has-media' : ''}`}
              style={mediaImage ? { backgroundImage: `linear-gradient(180deg, rgba(3, 7, 18, 0.08), rgba(3, 7, 18, 0.86)), url("${mediaImage}")` } : undefined}
            >
              <button onClick={() => {
                const sourceUrl = getSignalSourceUrl(reel);
                if (sourceUrl) {
                  window.open(sourceUrl, '_blank', 'noopener,noreferrer');
                  return;
                }
                notify(translateText('Оригінал відео недоступний, але Джеро вже використовує превʼю та метрики сигналу.'));
              }}>▶</button>
              <strong>{phoneLabel}<br />TO UA</strong>
            </div>
            <div className="phone-stats"><span title={formatExactStat(exactSourceStats.views, 'views')}>{reel.views}<br /><small>Перегл.</small></span><span title={formatExactStat(exactSourceStats.likes, 'likes')}>{reel.likes}<br /><small>Лайки</small></span><span title={formatExactStat(exactSourceStats.comments, 'comments')}>{reel.comments}<br /><small>Ком.</small></span><span>{reel.score}<br /><small>Скор</small></span></div>
          </div>
          {hasYouTubeIntelligence && !generatedRemix && !cleanTranscriptPreview && !cleanVideoSummary && (
            <div className="insight-card studio-observation-card">
              <small>Нотатка до відео</small>
              <h3>Опиши сюжет у 1-2 реченнях</h3>
              <p>Якщо хочеш точніше, коротко напиши: хто в кадрі, який поворот і чим усе закінчується. Джеро перебудує сценарій з цього контексту.</p>
              <textarea
                value={observedContext}
                onChange={(event) => setObservedContext(event.target.value)}
                placeholder={translateText('Наприклад: людина просить пропустити її в черзі, отримує відмову, а потім виявляється, що саме вона мала виграти приз.')}
              />
            </div>
          )}
        </div>
        <div className="analysis-stack">
          <BrandScanStudioPanel reel={reel} onSaveBrandBrain={saveCurrentBrandBrain} brainStatus={brainStatus} />
          {!isBrandScanDraft && (
            <div className="insight-card hero-card">
              <small>Вхідний сигнал</small>
              <h2 className="remix-idea-title" data-i18n-content>{reel.title.replace('...', '')}</h2>
              {(reel.transcript || reel.caption) && <p data-i18n-content>{reel.transcript || reel.caption}</p>}
            </div>
          )}
          <div className="remix-bottom">
            <div className="insight-card">
              <small>Сценарій на 15 секунд</small>
              {generatedRemix && adaptationState !== 'loading' && <p className="studio-ai-note">AI-адаптація згенерована заново з контексту сигналу.</p>}
              {adaptationError && adaptationState !== 'loading' && <p className="studio-error-note">{adaptationError}</p>}
              {adaptationState === 'loading' && (
                <JerykLoading
                  title={translateText('Джерик адаптує сценарій')}
                  text="Розбираю механіку сигналу і збираю версію під твій бренд."
                />
              )}
              {adaptationState !== 'loading' && (
                <>
                  <h3>Готова структура</h3>
                  <div className="remix-script-timeline">
                    {scenario.script.map((step) => (
                      <article key={step.time}>
                        <span>{step.time}</span>
                        <strong data-i18n-content>{step.frame}</strong>
                        <p data-i18n-content>{step.voice}</p>
                      </article>
                    ))}
                  </div>
                  <button className="dark studio-plan-cta" type="button" onClick={addCurrentToPlan}>
                    <CalendarDays size={16} />Додати в контент-план
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function IdeasBoard({ ideas, openModal, onToRemix, onToPlan }) {
  const { translateText } = useI18n();
  const [status, setStatus] = useState('all');
  const visibleIdeas = ideas.filter((idea) => status === 'all' || idea.status === status);

  return (
    <section className="page">
      <PageTitle
        title={translateText('Ідеї')}
        subtitle={translateText('Чернетки, які народилися з глобальних рілсів і мають бути адаптовані під український контекст.')}
        actions={<><button onClick={() => setStatus(status === 'all' ? 'Потрібен розбір' : 'all')}><Filter size={16} />За статусом</button><button className="dark" onClick={() => openModal('idea')}><Plus size={16} />Нова ідея</button></>}
      />
      <div className="idea-summary">
        <div><span>Усього</span><strong>{visibleIdeas.length}</strong></div>
        <div><span>До реміксу</span><strong>{ideas.filter((idea) => idea.status.includes('реміксу')).length}</strong></div>
        <div><span>У план</span><strong>{ideas.filter((idea) => idea.status.includes('план')).length}</strong></div>
        <div><span>Потрібен розбір</span><strong>{ideas.filter((idea) => idea.status.includes('розбір')).length}</strong></div>
      </div>
      <div className="ideas-layout">
        <div className="ideas-list">
          {visibleIdeas.map((idea) => (
            <article className="idea-card" key={`${idea.source}-${idea.title}`}>
              <div className="idea-top">
                <span>{marketLabel(idea.market)}</span>
                <strong className="idea-score-pill"><small>UA fit</small>{idea.score}</strong>
              </div>
              <h3 data-i18n-content>{idea.title}</h3>
              <p data-i18n-content>{idea.angle}</p>
              <div className="idea-hook">
                <small>Хук</small>
                <strong data-i18n-content>{idea.hook}</strong>
              </div>
              <div className="idea-meta">
                <span data-i18n-content>{idea.source}</span>
                <span>Складність: {idea.effort}</span>
                <em>{idea.status}</em>
              </div>
              <div className="idea-actions">
                <button className="idea-outline-button" onClick={() => onToRemix(idea)}><Sparkles size={14} />У ремікс</button>
                <button className="idea-outline-button" onClick={() => onToPlan(idea)}><Plus size={14} />У контент-план</button>
              </div>
            </article>
          ))}
        </div>
        <aside className="right-panel idea-panel">
          <div className="panel-title"><strong>Фільтр якості</strong><span>UA output</span></div>
          <p>Ідея проходить далі, якщо її можна сказати українською природно, без російського контексту, і вона має користь для локального бізнесу або експерта.</p>
          <div className="status-list">
            <em>Є чіткий перший кадр</em>
            <em>Можна адаптувати CTA</em>
            <em>Не залежить від чужого локального контексту</em>
          </div>
        </aside>
      </div>
    </section>
  );
}

function AgentPipeline({ workspaceId, language = 'uk' }) {
  useI18n();
  const [status, setStatus] = useState(null);

  useEffect(() => {
    let isMounted = true;
    authFetch(`${API_BASE}/workspaces/${workspaceId}/ai/status`)
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (isMounted) setStatus(payload);
      })
      .catch(() => {
        if (isMounted) setStatus(null);
      });
    return () => {
      isMounted = false;
    };
  }, [workspaceId]);

  const providers = status?.providers || {};
  const pipelineCopy = language === 'en'
    ? {
      eyebrow: 'AI Producer Pipeline',
      title: 'Reels to analysis to script to video task',
      text: 'The agent can already draft from saved signals. Connected accounts add real profile context and approved insights when they are available.',
      ready: 'ready',
      connect: 'connect',
      preview: 'preview',
      draft: 'draft',
      approval: 'after approval',
      steps: [
        ['01', 'Instagram', providers.instagram?.configured ? 'ready' : 'connect', 'Reels, descriptions, and comments appear after connecting the source.'],
        ['02', 'YouTube Shorts', providers.youtube?.configured ? 'ready' : 'preview', 'Dzhero can use Shorts or channel context for scripts.'],
        ['03', 'Signal analysis', providers.textAgent?.status === 'ready' ? 'ready' : 'draft', 'The assistant evaluates the hook, topic, audience, text risks, and adaptation potential.'],
        ['04', 'Scripts', providers.textAgent?.provider === 'fallback' ? 'draft' : 'ready', 'Ideas become scripts, shot lists, captions, and Direct CTAs.'],
        ['05', 'Video task', providers.videoGeneration?.configured ? 'ready' : 'after approval', 'Approved scenes are saved as production tasks before video generation.'],
      ],
      statusCards: [
        providers.instagram?.configured ? 'Instagram ready' : 'Connect account later',
        providers.youtube?.configured ? 'YouTube ready' : 'YouTube preview',
        providers.textAgent?.provider === 'fallback' ? 'Draft mode' : `${providers.textAgent?.provider || 'agent'} ready`,
        providers.videoGeneration?.configured ? 'Video ready' : 'Manual approval first',
      ],
    }
    : {
      eyebrow: 'AI-продюсер pipeline',
      title: 'Від сигналу до аналізу, сценарію і video task',
      text: 'Агент уже може робити чернетки зі збережених сигналів. Підключені акаунти додадуть реальний контекст профілю й підтверджені інсайти.',
      steps: [
        ['01', 'Instagram', providers.instagram?.configured ? 'готово' : 'підключити', 'Рілси, описи й коментарі зʼявляться після підключення джерела.'],
        ['02', 'YouTube Shorts', providers.youtube?.configured ? 'готово' : 'preview', 'Джеро може брати контекст із Shorts або каналу для сценаріїв.'],
        ['03', 'Розбір сигналу', providers.textAgent?.status === 'ready' ? 'готово' : 'чернетка', 'Асистент оцінює хук, тему, аудиторію, ризики тексту й потенціал UA-адаптації.'],
        ['04', 'Сценарії', providers.textAgent?.provider === 'fallback' ? 'чернетка' : 'готово', 'Ідеї перетворюються на сценарії, shot-list, caption і CTA в Direct.'],
        ['05', 'Video task', providers.videoGeneration?.configured ? 'готово' : 'після апруву', 'Затверджені сцени зберігаються як production-задачі перед генерацією відео.'],
      ],
      statusCards: [
        providers.instagram?.configured ? 'Instagram готовий' : 'Акаунт можна підключити пізніше',
        providers.youtube?.configured ? 'YouTube готовий' : 'YouTube preview',
        providers.textAgent?.provider === 'fallback' ? 'Режим чернетки' : `${providers.textAgent?.provider || 'агент'} готовий`,
        providers.videoGeneration?.configured ? 'Відео готове' : 'Спочатку ручний апрув',
      ],
    };
  const steps = [
    ...pipelineCopy.steps,
  ];
  return (
    <div className="agent-pipeline">
      <div className="agent-pipeline-head">
        <div>
          <small>{pipelineCopy.eyebrow}</small>
          <h3>{pipelineCopy.title}</h3>
          <p>{pipelineCopy.text}</p>
        </div>
        <div className="agent-status-cards">
          {pipelineCopy.statusCards.map((item) => <span key={item}>{item}</span>)}
        </div>
      </div>
      <div className="agent-step-grid">
        {steps.map(([number, title, badge, text]) => (
          <article className="agent-step" key={title}>
            <strong>{number}</strong>
            <div>
              <h4>{title}</h4>
              <em>{badge}</em>
              <p>{text}</p>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function BrandBrain({ notify, workspaceId, language = 'uk' }) {
  const { t, translateText } = useI18n();
  const [seed, setSeed] = useState('');
  const [brief, setBrief] = useState({
    businessType: '',
    product: '',
    audience: '',
    location: '',
    toneOfVoice: '',
    offer: '',
    cta: '',
    stopTopics: '',
    proof: '',
  });
  const [status, setStatus] = useState('loading');
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;
    authFetch(`${API_BASE}/workspaces/${workspaceId}/agent/context`)
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (!isMounted) return;
        if (payload?.brief) {
          setBrief((current) => ({
            ...current,
            ...payload.brief,
            stopTopics: Array.isArray(payload.brief.stopTopics) ? payload.brief.stopTopics.join(', ') : payload.brief.stopTopics || '',
          }));
        }
        setStatus('ready');
      })
      .catch(() => setStatus('error'));
    return () => {
      isMounted = false;
    };
  }, [workspaceId]);

  const updateField = (field, value) => {
    setBrief((current) => ({ ...current, [field]: value }));
  };

  const analyzeSeed = async () => {
    const cleanSeed = seed.trim();
    if (!cleanSeed || status === 'analyzing') return;
    setStatus('analyzing');
    try {
      const response = await fetch(`${API_BASE}/brand-scan/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: cleanSeed }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'brand_scan_failed');
      const metadata = payload.metadata || null;
      if (!canBuildFromSourceOnly(cleanSeed, metadata)) {
        setStatus('ready');
        notify?.(translateText('Не вдалося прочитати відкритий профіль. Додай короткий опис бізнесу після посилання, і я заповню Brand Brain без вигадок.'));
        return;
      }
      const scan = composeBrandScanResult(cleanSeed, metadata, payload.capabilities || null);
      const structuredDraft = payload.brandBrainDraft && typeof payload.brandBrainDraft === 'object'
        ? payload.brandBrainDraft
        : null;
      const nextBrief = structuredDraft || buildBrandBrainFromScanReel(buildReelFromBrandScan(scan), language);
      setBrief((current) => ({
        ...current,
        ...nextBrief,
        stopTopics: Array.isArray(nextBrief.stopTopics) ? nextBrief.stopTopics.join(', ') : nextBrief.stopTopics || current.stopTopics,
      }));
      setStatus('ready');
      notify?.(translateText(structuredDraft
        ? 'Brand Brain зібрано з профілю, Apify-сигналів і AI-структури. Можна підправити і зберегти.'
        : 'Brand Brain заповнено з джерела. Можна підправити і зберегти.'));
    } catch {
      setBrief((current) => ({
        ...current,
        product: current.product || cleanSeed,
        audience: current.audience || 'Потенційні клієнти, яким потрібне це рішення зараз',
        offer: current.offer || cleanSeed,
        toneOfVoice: current.toneOfVoice || 'коротко, конкретно, дружньо',
      }));
      setStatus('ready');
      notify?.(translateText('Не вдалося прочитати джерело автоматично, але я підготував чернетку з опису.'));
    }
  };

  const saveBrief = async () => {
    setStatus('saving');
    const payload = {
      ...brief,
      stopTopics: String(brief.stopTopics || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    };
    try {
      const response = await authFetch(`${API_BASE}/workspaces/${workspaceId}/agent/context`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error('save_failed');
      setStatus('saved');
      notify?.(translateText('Brand Brain збережено. Асистент уже використовує цей контекст.'));
      window.setTimeout(() => setStatus('ready'), 1800);
    } catch (error) {
      setStatus('error');
      notify?.(localizeInterfaceError(error, t, 'errors.brandBrainSave'));
    }
  };

  const mainFields = [
    ['businessType', 'Ніша', 'Магазин одягу, кафе, салон краси, фітнес-студія', 'Що це за бізнес простими словами. Наприклад: “кавʼярня в Києві”, “магазин жіночого одягу”, “експерт з таргету”.'],
    ['product', 'Продукт', 'сукні, ланчі, манікюр, консультації, курс, абонемент', 'Що саме продаєте. Не “якість і сервіс”, а конкретно: товар, послуга, курс, запис, консультація.'],
    ['audience', 'ЦА', 'дівчата 20-35, власники малого бізнесу, мами, підприємці', 'Кому продаєте. Хто ця людина, що їй болить і чому вона має купити саме зараз.'],
    ['offer', 'Офер', 'запис на манікюр зі знижкою 15%, консультація, дроп нової колекції', 'Головна пропозиція для клієнта. Що він отримує і чому це вигідно.'],
    ['cta', 'CTA', 'написати в Direct “хочу”, забронювати, перейти за лінком', 'Що людина має зробити після контенту: написати, купити, записатися, залишити заявку.'],
    ['toneOfVoice', 'Tone of Voice', 'простими словами, дружньо, експертно, без пафосу', 'Як бренд має звучати: спокійно, смішно, преміально, по-дружньому, жорстко, експертно.'],
  ];
  const advancedFields = [
    ['location', 'Ринок', 'Україна, Київ, Львів, онлайн, Європа', 'Де працює бізнес: місто, країна або “онлайн”. Це допомагає не радити чужі тренди не в тему.'],
    ['stopTopics', 'Стоп-теми', 'не обіцяти гарантований заробіток, не копіювати конкурентів', 'Що не можна писати або обіцяти. Через кому: заборонені теми, ризикові фрази, табу бренду.'],
    ['proof', 'Докази', 'відгуки, кейси, цифри, фото до/після, 5 років досвіду', 'Чим доводимо, що вам можна вірити: кейси, цифри, відгуки, фото, результати клієнтів.'],
  ];

  return (
    <section className="brand-brain">
      <div className="brand-brain-head">
        <div>
          <small>Brand Brain</small>
          <h3>Памʼять агента про бізнес</h3>
          <p>Встав профіль, сайт або короткий опис. Джеро сам збере чернетку ЦА, офера, CTA і тону, а ти тільки підправиш важливе.</p>
        </div>
        <button className="dark" type="button" onClick={saveBrief} disabled={status === 'saving'}>
          <Database size={16} />{status === 'saving' ? 'Зберігаю...' : 'Зберегти памʼять'}
        </button>
      </div>
      <div className="brand-brain-intake">
        <textarea
          data-i18n-content
          value={seed}
          onChange={(event) => setSeed(event.target.value)}
          placeholder={translateText('Instagram, YouTube, TikTok, сайт або коротко: кавʼярня у Львові, сніданки, аудиторія 20-35...')}
        />
        <button className="dark" type="button" onClick={analyzeSeed} disabled={!seed.trim() || status === 'analyzing'}>
          <Sparkles size={16} />{status === 'analyzing' ? 'Аналізую...' : 'Проаналізувати і заповнити'}
        </button>
      </div>
      {status === 'analyzing' && (
        <JerykLoading
          title={translateText('Джерик аналізує Brand Brain')}
          text="Витягую нішу, аудиторію, офер, CTA і тон голосу з джерела."
          feature
        />
      )}
      <div className="brand-brain-grid">
        {mainFields.map(([field, label, placeholder, help]) => (
          <label className="brand-field" key={field}>
            <span>{label}</span>
            <textarea
              data-i18n-content
              value={brief[field] || ''}
              onChange={(event) => updateField(field, event.target.value)}
              placeholder={placeholder}
              rows={field === 'proof' || field === 'stopTopics' ? 3 : 2}
            />
            <small>{help}</small>
          </label>
        ))}
      </div>
      <button className="brand-advanced-toggle" type="button" onClick={() => setIsAdvancedOpen((value) => !value)}>
        <span>{isAdvancedOpen ? 'Сховати деталі' : 'Додаткові правила'}</span>
        <ChevronDown size={16} />
      </button>
      {isAdvancedOpen && (
        <div className="brand-brain-grid brand-brain-advanced">
          {advancedFields.map(([field, label, placeholder, help]) => (
            <label className={field === 'proof' || field === 'stopTopics' ? 'brand-field wide' : 'brand-field'} key={field}>
              <span>{label}</span>
              <textarea
                data-i18n-content
                value={brief[field] || ''}
                onChange={(event) => updateField(field, event.target.value)}
                placeholder={placeholder}
                rows={field === 'proof' || field === 'stopTopics' ? 3 : 2}
              />
              <small>{help}</small>
            </label>
          ))}
        </div>
      )}
    </section>
  );
}

function VideoTaskQueue({ notify, workspaceId }) {
  const { t, translateText } = useI18n();
  const [jobs, setJobs] = useState([]);
  const [status, setStatus] = useState('loading');

  const loadJobs = async () => {
    setStatus('loading');
    try {
      const response = await authFetch(`${API_BASE}/workspaces/${workspaceId}/video-jobs`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'video_jobs_failed');
      setJobs(payload.videoJobs || []);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  };

  useEffect(() => {
    loadJobs();
  }, [workspaceId]);

  const createDemoJob = async () => {
    setStatus('saving');
    try {
      const response = await authFetch(`${API_BASE}/workspaces/${workspaceId}/video-jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Demo Reels video task',
          hook: 'Показати, як експерт перетворює одну ідею на готовий Reels-сценарій з AI.',
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'video_job_failed');
      setJobs((current) => [payload.videoJob, ...current]);
      setStatus('ready');
      notify(translateText('Video task додано в чергу.'));
    } catch (err) {
      setStatus('error');
      notify(localizeInterfaceError(err, t, 'errors.videoJob'));
    }
  };

  return (
    <section className="video-queue">
      <div className="video-queue-head">
        <div>
          <small>Video generation queue</small>
          <h3>Задачі на відео після сценарію</h3>
          <p>Результат агента зберігає prompt, сцени, CTA і статус approval.</p>
        </div>
        <button className="dark" type="button" onClick={createDemoJob} disabled={status === 'saving'}>
          <Rocket size={16} />{status === 'saving' ? 'Створюю...' : 'Додати test task'}
        </button>
      </div>
      <div className="video-job-grid">
        {(jobs.length ? jobs : [{
          id: 'empty-video-job',
          status: 'draft_ready',
          provider: 'manual_approval',
          prompt: {
            title: 'Очікуємо першу задачу від агента',
            format: '15-25 sec Reels',
            scenes: [],
            caption: 'Натисни в чаті агента: Створити video task.',
            cta: 'Human approval before generation',
          },
          createdAt: new Date().toISOString(),
        }]).slice(0, 4).map((job) => (
          <article className="video-job-card" key={job.id}>
            <div className="video-job-top">
              <span>{job.status}</span>
              <em>{job.provider}</em>
            </div>
            <h4 data-i18n-content>{job.prompt?.title || 'Untitled video task'}</h4>
            <p data-i18n-content>{job.prompt?.caption || 'Prompt буде збережено після створення задачі.'}</p>
            <div className="video-job-meta">
              <strong>{job.prompt?.format || 'Reels'}</strong>
              <span>{job.prompt?.scenes?.length || 0} scenes</span>
              <span>{job.humanApprovalRequired === false ? 'Auto' : 'Human approval'}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function CreatorAssistant({ notify, workspaceId, activeWorkspace, autoPrompt, onAutoPromptUsed, language = 'uk' }) {
  const { t, translateText } = useI18n();
  const prompts = [
    'Зроби 5 ідей для експерта з маркетингу на українську аудиторію',
    'Перетвори цей global-рілс у сценарій українською',
    'Склади план зйомки на 40 хвилин',
    'Напиши відповіді на коментарі без токсичності',
  ];
  const seedMessages = [
    ['assistant', 'Привіт. Опишіть нішу, ціль і Tone of Voice — підготую структуру ідеї, сценарій і формат публікації.'],
    ['user', 'Мені треба контент на тиждень для українського експерта з AI.'],
    ['assistant', 'Ок. Я б зібрав 3 освітні рілси, 2 кейси, 1 розбір помилки і 1 особистий пост. Почнемо з позиціонування: експерт продає консультації, курс чи сервіс?'],
  ];
  const [messagesByWorkspace, setMessagesByWorkspace] = useState({});
  const messages = messagesByWorkspace[workspaceId] || seedMessages;
  const setMessages = (updater) => {
    setMessagesByWorkspace((current) => {
      const currentMessages = current[workspaceId] || seedMessages;
      const nextMessages = typeof updater === 'function' ? updater(currentMessages) : updater;
      return { ...current, [workspaceId]: nextMessages };
    });
  };
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [actionStatus, setActionStatus] = useState('');
  const [agentMeta, setAgentMeta] = useState({ provider: 'fallback', model: 'local-template' });
  const [lastIdeaId, setLastIdeaId] = useState('');
  const threadRef = React.useRef(null);

  useEffect(() => {
    threadRef.current?.scrollTo({
      top: threadRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages, isThinking]);

  const renderMessageText = (text) => String(text || '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*/g, '')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block, index) => <p data-i18n-content key={`${block.slice(0, 24)}-${index}`}>{block}</p>);

  const sendMessage = async (text = input) => {
    const clean = text.trim();
    if (!clean || isThinking) return;
    const history = messages.map(([role, messageText]) => ({
      role: role === 'assistant' ? 'assistant' : 'user',
      text: messageText,
    }));
    setMessages((current) => [...current, ['user', clean], ['assistant', JERYK_LOADING_MESSAGE]]);
    setInput('');
    setIsThinking(true);
    try {
      const response = await authFetch(`${API_BASE}/workspaces/${workspaceId}/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: clean, history }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || payload.error || 'agent_error');
      setAgentMeta({ provider: payload.provider || 'agent', model: payload.model || 'unknown' });
      setLastIdeaId('');
      setMessages((current) => current.map((item, index) => (
        index === current.length - 1 ? ['assistant', payload.reply] : item
      )));
    } catch (agentError) {
      setAgentMeta({ provider: 'offline', model: 'fallback' });
      setMessages((current) => current.map((item, index) => (
        index === current.length - 1
          ? ['assistant', localizeInterfaceError(agentError, t, 'errors.assistant')]
          : item
      )));
    } finally {
      setIsThinking(false);
    }
  };

  useEffect(() => {
    if (!autoPrompt?.text || isThinking) return;
    sendMessage(autoPrompt.text);
    onAutoPromptUsed?.();
  }, [autoPrompt?.id]);

  const latestAssistantText = [...messages].reverse().find(([role]) => role === 'assistant')?.[1] || '';
  const extractIdeaTitle = (text) => {
    const line = String(text || '').split('\n').map((item) => item.trim()).find((item) => item && !item.startsWith('Ок.') && !item.startsWith('Привіт'));
    return (line || 'AI assistant idea').replace(/^[0-9.)\s-]+/, '').slice(0, 120);
  };

  const saveAssistantIdea = async () => {
    return runAgentAction('save_idea');
    try {
      const response = await authFetch(`${API_BASE}/workspaces/${workspaceId}/ideas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: extractIdeaTitle(latestAssistantText),
          hook: latestAssistantText.slice(0, 220),
          source: 'assistant',
          status: 'assistant_draft',
          score: 76,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'idea_save_failed');
      setLastIdeaId(payload.idea.id);
      notify(translateText('Відповідь асистента збережено як ідею.'));
    } catch {
      notify(translateText('Не вдалося зберегти ідею.'));
    }
  };

  const generateScriptFromSavedIdea = async () => {
    return runAgentAction('generate_script');
    if (!lastIdeaId) {
      await saveAssistantIdea();
      return;
    }
    try {
      const response = await authFetch(`${API_BASE}/workspaces/${workspaceId}/ideas/${lastIdeaId}/generate-script`, { method: 'POST' });
      if (!response.ok) throw new Error('script_failed');
      notify(translateText('Сценарій створено з ідеї.'));
    } catch {
      notify(translateText('Не вдалося створити сценарій.'));
    }
  };

  const createVideoTask = async () => {
    return runAgentAction('create_video_job');
    try {
      const response = await authFetch(`${API_BASE}/workspaces/${workspaceId}/video-jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ideaId: lastIdeaId || null,
          title: extractIdeaTitle(latestAssistantText),
          hook: latestAssistantText.slice(0, 220),
        }),
      });
      if (!response.ok) throw new Error('video_task_failed');
      notify(translateText('Video task створено. Генерація відео чекає підключення медіа-генератора.'));
    } catch {
      notify(translateText('Не вдалося створити video task.'));
    }
  };

  const runAgentAction = async (action) => {
    if (!latestAssistantText || actionStatus) return;
    const labels = {
      save_idea: 'Ідею збережено.',
      generate_script: 'Ідею збережено і сценарій створено.',
      create_video_job: 'Video task створено. Генерація відео чекає підключення медіа-генератора.',
    };
    setActionStatus(action);
    try {
      const response = await authFetch(`${API_BASE}/workspaces/${workspaceId}/agent/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          title: extractIdeaTitle(latestAssistantText),
          text: latestAssistantText,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'agent_action_failed');
      setLastIdeaId(payload.idea?.id || '');
      notify(translateText(labels[action] || 'Готово.'));
    } catch (err) {
      notify(localizeInterfaceError(err, t, 'errors.generic'));
    } finally {
      setActionStatus('');
    }
  };

  return (
    <section className="page page-assistant">
      <PageTitle
        title={translateText('AI-продюсер')}
        subtitle={translateText('Маленька робоча панель для ідей, сценаріїв, плану зйомки, caption і Direct-відповідей.')}
        actions={<button className="dark" onClick={() => sendMessage('Збери мені повний контент-план на тиждень')} disabled={isThinking}><Sparkles size={16} />Сформувати контент-план</button>}
      />
      <div className="assistant-workspace assistant-compact-workspace">
        <aside className="assistant-widget">
          <div className="assistant-widget-head">
            <div>
              <small>AI assistant</small>
              <h3>AI-продюсер поруч</h3>
            </div>
            <span>{agentMeta.provider}</span>
          </div>
        <div className="assistant-quick-prompts">
          <h3>Швидкі задачі</h3>
          {prompts.map((prompt) => <button key={prompt} onClick={() => sendMessage(prompt)}>{prompt}</button>)}
        </div>
        <div className="assistant-chat">
          <div className="assistant-thread" ref={threadRef}>
            {messages.map(([role, text], index) => (
              <div className={`chat-message ${role}`} key={`${role}-${index}`}>
                <span>{role === 'assistant' ? 'AI' : 'Ви'}</span>
                <div className="message-body">
                  {text === JERYK_LOADING_MESSAGE
                    ? <JerykLoading title={translateText('Асистент готує відповідь')} text="Збираю Brand Brain, сигнали і наступний практичний крок." compact />
                    : renderMessageText(text)}
                </div>
              </div>
            ))}
          </div>
          <div className="assistant-input">
            <input value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && sendMessage()} placeholder={translateText('Напиши задачу: ніша, ціль, формат, тон голосу...')} />
            <button className="dark" onClick={() => sendMessage()} disabled={isThinking}><Send size={16} />{isThinking ? 'Думаю...' : 'Надіслати'}</button>
          </div>
          <div className="assistant-actions">
            <button type="button" onClick={saveAssistantIdea} disabled={isThinking || actionStatus || !latestAssistantText}>Зберегти як ідею</button>
            <button type="button" data-tour="generate-script-btn" onClick={generateScriptFromSavedIdea} disabled={isThinking || actionStatus || !latestAssistantText}>Зробити сценарій</button>
            <button type="button" onClick={createVideoTask} disabled={isThinking || actionStatus || !latestAssistantText}>Створити video task</button>
            {lastIdeaId && <small>Остання ідея: {lastIdeaId}</small>}
          </div>
        </div>
        <div className="assistant-mini-note">
          <div className="panel-title"><strong>Може зробити</strong><span>AI-продюсер</span></div>
          <div className="status-list">
            <em>Знайти ідею з тренду</em>
            <em>Написати сценарій Reels</em>
            <em>Зробити shot-list</em>
            <em>Підготувати caption</em>
            <em>Запланувати тиждень</em>
            <em>Відповісти на коментарі</em>
          </div>
          <div className="assistant-note">
            <small>Логіка</small>
            <p>Асистент працює з банком рілсів, ідеями, календарем і стилем акаунта. Це дозволяє вести контент по воронці: ідея → сценарій → зйомка → пост.</p>
          </div>
        </div>
        </aside>
        <div className="assistant-main-column">
          <details className="assistant-setup-drawer">
            <summary>
              <span>
                <strong>Налаштування памʼяті бренду</strong>
                <small>Ніша, продукт, аудиторія, Tone of Voice і стоп-теми для точніших відповідей.</small>
              </span>
              <ChevronDown size={16} />
            </summary>
            <BrandBrain notify={notify} workspaceId={workspaceId} language={language} />
          </details>
          <div className="assistant-support-grid">
            <VideoTaskQueue notify={notify} workspaceId={workspaceId} />
            <AgentPipeline workspaceId={workspaceId} language={language} />
          </div>
        </div>
      </div>
    </section>
  );
}

function LaunchRoadmap({ notify, setPage, workspaceId }) {
  const { translateText } = useI18n();
  const [activeStep, setActiveStep] = useState(null);
  const [generatedLaunch, setGeneratedLaunch] = useState([]);
  const stepRefs = useRef({});
  const steps = [
    ['1', 'Точка Б', 'Текст: покажи результат після запуску. Наклейка: “хочу так само?”. Візуал: скрін результату або до/після.'],
    ['2', 'Біль', 'Текст: назви проблему аудиторії простими словами. Наклейка: опитування. Візуал: побутова сцена або DM з питанням.'],
    ['3', 'Помилка', 'Текст: чому старий підхід не працює. Наклейка: “робили так?”. Візуал: розбір типового фейлу.'],
    ['4', 'Новий метод', 'Текст: введи авторську рамку. Наклейка: “показати схему?”. Візуал: дошка, mindmap, чекліст.'],
    ['5', 'Доказ', 'Текст: кейс, цифри, процес. Наклейка: “розібрати кейс?”. Візуал: аналітика або коротка демонстрація.'],
    ['6', 'Особистість', 'Текст: шлях, принципи, позиція. Наклейка: питання. Візуал: backstage, робочий день, голос автора.'],
    ['7', 'Заперечення', 'Текст: ціна, час, складність, страх. Наклейка: FAQ. Візуал: 3 міфи або quick answers.'],
    ['8', 'Офер', 'Текст: що всередині продукту. Наклейка: “дати програму?”. Візуал: структура, модулі, бонуси.'],
    ['9', 'FOMO', 'Текст: дедлайн, ліміт місць, бонус. Наклейка: таймер. Візуал: вікно продажів і залишок місць.'],
    ['10', 'Продаж', 'Текст: прямий CTA. Наклейка: лінк/DM keyword. Візуал: офер-картка з умовами.'],
    ['11', 'Закриття', 'Текст: останній callout + FAQ. Наклейка: таймер. Візуал: соціальний доказ і фінальний дедлайн.'],
  ];
  const fomo = ['таймер до 23:59', '12 місць у групі', 'бонус першим 20', 'ціна до підвищення', 'закритий розбір тільки для заявок'];
  const checklistLabels = useMemo(() => [
    'Сторіс-прогрів',
    'Reels для охоплення',
    'Пост або карусель',
    'CTA і тригери',
    'FAQ для Direct',
  ], []);
  const launchChecklist = useChecklistState('launches', checklistLabels, notify, 'Done', workspaceId);
  const isFomoVisible = activeStep === '9';
  const generateLaunch = () => {
    const grid = steps.slice(0, 7).map(([day, title, text], index) => ({
      day,
      title,
      format: index % 3 === 0 ? 'Reels' : index % 3 === 1 ? 'Stories' : 'Post',
      note: text.split('. ')[0],
    }));
    setGeneratedLaunch(grid);
    notify(translateText('Сітку прогріву сформовано на поточному екрані'));
  };

  useEffect(() => {
    const stepNine = stepRefs.current['9'];
    if (!stepNine) return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setActiveStep('9');
      } else {
        setActiveStep((current) => (current === '9' ? null : current));
      }
    }, { threshold: 0.55 });
    observer.observe(stepNine);
    return () => observer.disconnect();
  }, [workspaceId]);

  const renderStepDetails = (text) => {
    const matches = [...text.matchAll(/(Текст|Наклейка|Візуал):\s*([\s\S]*?)(?=\s+(?:Текст|Наклейка|Візуал):|$)/g)];
    if (!matches.length) return <p>{text}</p>;
    return (
      <div className="launch-step-details">
        {matches.map((match) => (
          <p key={match[1]}>
            <b>{match[1]}:</b>
            <span>{match[2].trim()}</span>
          </p>
        ))}
      </div>
    );
  };

  return (
    <section className="page">
      <PageTitle
        title={translateText('Запуски')}
        subtitle={translateText('Конструктор прогріву на 11 кроків: конкретні сценарії для сторіс, Reels, постів, тригерів, CTA і дедлайнів.')}
        actions={<><button onClick={() => { setActiveStep('9'); notify(translateText('Показав FOMO-тригери для 9-го етапу')); }}><Sparkles size={16} />Сформувати тригери</button><button className="dark" onClick={generateLaunch}><Rocket size={16} />Сформувати запуск</button></>}
      />
      {generatedLaunch.length > 0 && (
        <div className="launch-generated-grid">
          {generatedLaunch.map((item) => (
            <article className="insight-card" key={`${item.day}-${item.title}`}>
              <small>День {item.day} · {item.format}</small>
              <h3>{item.title}</h3>
              <p>{item.note}</p>
            </article>
          ))}
        </div>
      )}
      <div className="launch-layout">
        <div className="launch-roadmap">
          {steps.map(([day, title, text]) => (
            <article
              className={activeStep === day ? 'launch-step active' : 'launch-step'}
              key={day}
              ref={(node) => { stepRefs.current[day] = node; }}
              onClick={() => setActiveStep(day)}
            >
              <span>{day}</span>
              <div>
                <strong>{title}</strong>
                {renderStepDetails(text)}
              </div>
            </article>
          ))}
        </div>
        <aside className="right-panel launch-panel">
          <div className="panel-title"><strong>План на день</strong><span>3 формати</span></div>
          <div className="checklist-status">
            <Badge>{launchChecklist.allChecked ? 'Done' : 'В роботі'}</Badge>
          </div>
          <div className="checklist-list">
            {launchChecklist.items.map((item) => (
              <label className="checklist-item" key={item.id}>
                <input type="checkbox" checked={item.checked} onChange={() => launchChecklist.toggleItem(item.id)} />
                <span>{item.label}</span>
              </label>
            ))}
          </div>
          {isFomoVisible && (
            <div className="mini-stack launch-fomo-panel">
              <strong>FOMO для 9-го етапу</strong>
              {fomo.map((item) => <span key={item}>{item}</span>)}
            </div>
          )}
          <p>Одна ідея розкладається у кілька форматів, щоб прогрів не жив окремо від контент-плану.</p>
        </aside>
      </div>
    </section>
  );
}

function ContentPlan({ plans, ideas = [], openModal, notify, setPage, workspaceId, onOpenPostInStudio }) {
  const { language, t, translateText } = useI18n();
  const today = new Date();
  const locale = language === 'en' ? 'en-US' : 'uk-UA';
  const formatSuggestions = CONTENT_FORMATS;
  const [calendarDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [modalDay, setModalDay] = useState(null);
  const [editingPostId, setEditingPostId] = useState('');
  const [isNotesOpen, setIsNotesOpen] = useState(true);
  const [isPlanQueueExpanded, setIsPlanQueueExpanded] = useState(false);
  const [draft, setDraft] = useState({ title: '', body: '', format: 'Reels', time: '10:00' });
  const notesStorageKey = `dzhero-content-notes-${workspaceId || 'default'}`;
  const deletedNotesStorageKey = `dzhero-content-notes-deleted-${workspaceId || 'default'}`;
  const [noteDraft, setNoteDraft] = useState({ title: '', body: '' });
  const [editingNoteId, setEditingNoteId] = useState('');
  const [noteEditDraft, setNoteEditDraft] = useState({ title: '', body: '' });
  const [contentNotes, setContentNotes] = useState(() => {
    if (!isBrowser) return [];
    try {
      const stored = window.localStorage.getItem(`dzhero-content-notes-${workspaceId || 'default'}`);
      const parsed = stored ? JSON.parse(stored) : [];
      return Array.isArray(parsed) ? parsed.map(buildEditableContentNote) : [];
    } catch {
      return [];
    }
  });
  const [deletedGeneratedNoteIds, setDeletedGeneratedNoteIds] = useState(() => {
    if (!isBrowser) return [];
    try {
      const stored = window.localStorage.getItem(`dzhero-content-notes-deleted-${workspaceId || 'default'}`);
      const parsed = stored ? JSON.parse(stored) : [];
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  });
  const [posts, setPosts] = useState(() => plans.map((plan, index) => ({
    id: `seed-${index}`,
    day: Math.min(index + 3, new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()),
    title: plan[0],
    format: index % 3 === 0 ? 'Reels' : index % 3 === 1 ? 'Stories' : 'Post',
    time: index % 2 === 0 ? '10:00' : '18:30',
    done: false,
  })));
  const postsRef = useRef(posts);
  const monthLabel = calendarDate.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  const modalDateLabel = modalDay
    ? new Date(calendarDate.getFullYear(), calendarDate.getMonth(), modalDay).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })
    : '';
  const daysInMonth = new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 0).getDate();
  const firstWeekday = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), 1).getDay();
  const days = useMemo(() => [
    ...Array.from({ length: firstWeekday }, (_, index) => ({ type: 'empty', id: `empty-${index}` })),
    ...Array.from({ length: daysInMonth }, (_, index) => ({ type: 'day', day: index + 1 })),
  ], [daysInMonth, firstWeekday]);
  const doneCount = posts.filter((post) => post.done).length;
  const pendingPosts = posts.filter((post) => !post.done);
  const allNotes = useMemo(() => {
    const deleted = new Set(deletedGeneratedNoteIds.map(String));
    return mergeEditableNotes(contentNotes, ideas).filter((note) => !deleted.has(String(note.id)));
  }, [contentNotes, ideas, deletedGeneratedNoteIds]);
  const weeklyActions = language === 'en'
    ? [
      ['Review scripts', pendingPosts.length, 'Review the hook, proof, and CTA before shooting.'],
      ['Shoot batch', Math.max(1, Math.ceil(pendingPosts.length / 2)), 'Shoot the Reels in one batch and close the week.'],
      ['Prepare Direct', 3, 'Prepare short replies for comments and Direct.'],
    ]
    : [
      ['Перевірити сценарії', pendingPosts.length, 'Перевірити хук, доказ і CTA перед зйомкою.'],
      ['Зняти batch', Math.max(1, Math.ceil(pendingPosts.length / 2)), 'Зняти Reels одним блоком і закрити тиждень.'],
      ['Підготувати Direct', 3, 'Підготувати короткі відповіді для коментарів і Direct.'],
    ];
  useEffect(() => {
    postsRef.current = posts;
  }, [posts]);
  useEffect(() => {
    if (!isBrowser) return;
    window.localStorage.setItem(notesStorageKey, JSON.stringify(contentNotes));
  }, [notesStorageKey, contentNotes]);
  useEffect(() => {
    if (!isBrowser) return;
    window.localStorage.setItem(deletedNotesStorageKey, JSON.stringify(deletedGeneratedNoteIds));
  }, [deletedNotesStorageKey, deletedGeneratedNoteIds]);
  useEffect(() => {
    let ignore = false;
    authFetch(`${API_BASE}/workspaces/${workspaceId}/content-plan`)
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (!ignore && payload?.posts?.length) {
          setPosts(payload.posts.map((post) => ({ ...post, format: normalizeContentFormat(post.format, 'Post') })));
        }
      })
      .catch(() => {});
    return () => {
      ignore = true;
    };
  }, [workspaceId]);
  const savePosts = async (nextPosts) => {
    try {
      await authFetch(`${API_BASE}/workspaces/${workspaceId}/content-plan`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ posts: nextPosts }),
      });
    } catch (error) {
      notify(localizeInterfaceError(error, t, 'errors.contentPlanSave'));
    }
  };
  const closePostModal = () => {
    setModalDay(null);
    setEditingPostId('');
  };
  const openPostModal = (day = today.getDate(), post = null) => {
    setModalDay(Math.min(Math.max(day, 1), daysInMonth));
    setEditingPostId(post?.id || '');
    setDraft(post
      ? {
        title: post.title || '',
        body: post.body || post.title || '',
        format: normalizeContentFormat(post.format, 'Post'),
        time: post.time || '10:00',
      }
      : { title: '', body: '', format: 'Reels', time: '10:00' });
  };
  const savePost = () => {
    if (!draft.title.trim()) return;
    const cleanDraft = {
      title: draft.title.trim(),
      body: draft.body.trim(),
      format: normalizeContentFormat(draft.format, 'Post'),
      time: draft.time,
    };
    const nextPosts = editingPostId
      ? postsRef.current.map((post) => (post.id === editingPostId ? { ...post, ...cleanDraft, day: modalDay } : post))
      : [...postsRef.current, {
        id: `post-${Date.now()}`,
        day: modalDay,
        ...cleanDraft,
        done: false,
      }];
    setPosts(nextPosts);
    savePosts(nextPosts);
    closePostModal();
    notify(translateText(editingPostId ? 'Подію оновлено в календарі' : 'Подію додано в календар'));
  };
  const deletePost = () => {
    if (!editingPostId) return;
    const nextPosts = postsRef.current.filter((post) => post.id !== editingPostId);
    setPosts(nextPosts);
    savePosts(nextPosts);
    closePostModal();
    notify(translateText('Подію видалено з календаря'));
  };
  const movePost = (postId, day) => {
    const nextPosts = postsRef.current.map((post) => (post.id === postId ? { ...post, day } : post));
    setPosts(nextPosts);
    savePosts(nextPosts);
    notify(translateText(`Пост перенесено на ${day} число`));
  };
  const toggleDone = (postId) => {
    const nextPosts = postsRef.current.map((post) => (post.id === postId ? { ...post, done: !post.done } : post));
    setPosts(nextPosts);
    savePosts(nextPosts);
  };
  const addIdeaToPlan = (idea, index) => {
    const title = String(idea?.title || idea?.hook || 'Ідея для контенту').trim();
    const nextPost = {
      id: `idea-note-${Date.now()}-${index}`,
      day: Math.min(today.getDate() + postsRef.current.length, daysInMonth),
      title,
      format: 'Post',
      time: '10:00',
      done: false,
      source: idea?.source || 'notes',
    };
    const nextPosts = [...postsRef.current, nextPost];
    setPosts(nextPosts);
    savePosts(nextPosts);
    notify(translateText('Ідею додано в контент-план'));
  };
  const addManualNote = (event) => {
    event.preventDefault();
    const title = noteDraft.title.trim();
    const body = noteDraft.body.trim();
    if (!title && !body) {
      notify(translateText('Напиши хоча б коротку note'));
      return;
    }
    const note = {
      id: `manual-note-${Date.now()}`,
      source: 'manual note',
      title: title || body.slice(0, 80),
      hook: body || title,
      status: 'saved',
      origin: 'manual',
    };
    setContentNotes((current) => [buildEditableContentNote(note), ...current]);
    setNoteDraft({ title: '', body: '' });
    notify(translateText('Note збережено'));
  };
  const startEditNote = (note) => {
    setEditingNoteId(note.id);
    setNoteEditDraft({ title: note.title || '', body: note.hook || note.body || '' });
  };
  const cancelEditNote = () => {
    setEditingNoteId('');
    setNoteEditDraft({ title: '', body: '' });
  };
  const saveEditedNote = (note) => {
    const title = noteEditDraft.title.trim();
    const body = noteEditDraft.body.trim();
    if (!title && !body) {
      notify(translateText('Note не може бути порожнім'));
      return;
    }
    const patch = {
      ...note,
      title: title || body.slice(0, 80),
      hook: body || title,
      origin: note.origin || 'generated',
      status: note.status || 'saved',
    };
    setContentNotes((current) => {
      const exists = current.some((item) => String(item.id) === String(note.id));
      return exists
        ? updateEditableNote(current, note.id, patch)
        : [buildEditableContentNote(patch), ...current];
    });
    setDeletedGeneratedNoteIds((current) => current.filter((id) => String(id) !== String(note.id)));
    cancelEditNote();
    notify(translateText('Note оновлено'));
  };
  const deleteContentNote = (note) => {
    setContentNotes((current) => current.filter((item) => String(item.id) !== String(note.id)));
    if (note.origin !== 'manual') {
      setDeletedGeneratedNoteIds((current) => (current.includes(String(note.id)) ? current : [...current, String(note.id)]));
    }
    if (editingNoteId === note.id) cancelEditNote();
    notify(translateText('Note видалено'));
  };
  const postFormatClass = (format) => {
    const normalized = String(format || '').toLowerCase();
    if (normalized.includes('story') || normalized.includes('стор')) return 'format-stories';
    if (normalized.includes('short')) return 'format-shorts';
    if (normalized.includes('tik')) return 'format-tiktok';
    if (normalized.includes('video')) return 'format-video';
    if (normalized.includes('post') || normalized.includes('пост')) return 'format-post';
    if (normalized.includes('reel')) return 'format-reels';
    return 'format-custom';
  };

  return (
    <section className="page page-content-plan">
      <PageTitle title={translateText('Контент-план')} subtitle={translateText('План, зйомки, публікації й результати в одному календарі.')} actions={<><button onClick={() => notify(translateText('Пакет сформовано з відібраних ідей'))}>{translateText('Сформувати пакет')}</button><button onClick={() => notify(translateText('Тижневий план сформовано'))}>{translateText('Тижневий план')}</button><button className="dark" onClick={() => openPostModal()}><Plus size={16} />{translateText('Новий пост')}</button></>} />
      <div className="stats">
        {[
          ['Усього', posts.length],
          ['Готово в batch', posts.length],
          ['Знято', doneCount],
          ['Опубліковано', doneCount],
          ['Потрібен розбір', posts.length - doneCount],
        ].map(([label, value]) => <div key={label}><span>{translateText(label)}</span><strong>{value}</strong></div>)}
      </div>
      <div className="calendar-layout">
        <div className="calendar-card">
          <div className="calendar-top"><CalendarDays size={16} /><strong>{monthLabel}</strong><button onClick={() => openPostModal(today.getDate())}>{translateText('Сьогодні')}</button><button onClick={() => openPostModal()}><Plus size={14} />{translateText('Пост')}</button></div>
          <div className="calendar-mobile-hint">{language === 'en' ? 'Swipe horizontally to see the whole month' : 'Гортай календар горизонтально, щоб побачити весь місяць'}</div>
          <div className="weekdays">{(language === 'en' ? ['SUN','MON','TUE','WED','THU','FRI','SAT'] : ['НД','ПН','ВТ','СР','ЧТ','ПТ','СБ']).map((d) => <b key={d}>{d}</b>)}</div>
          <div className="calendar-grid">
            {days.map((cell) => cell.type === 'empty' ? <div className="calendar-empty" key={cell.id} /> : (
              <div
                className="calendar-day"
                key={cell.day}
                onClick={() => openPostModal(cell.day)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const postId = event.dataTransfer.getData('text/plain');
                  if (postId) movePost(postId, cell.day);
                }}
              >
                <span>{cell.day}</span>
                <div className="calendar-posts">
                  {posts.filter((post) => post.day === cell.day).map((post) => (
                    <article
                      className={post.done ? 'calendar-post done' : 'calendar-post'}
                      key={post.id}
                      draggable
                      onClick={(event) => { event.stopPropagation(); openPostModal(cell.day, post); }}
                      onDragStart={(event) => event.dataTransfer.setData('text/plain', post.id)}
                    >
                      <div className="calendar-post-meta">
                        <label onClick={(event) => event.stopPropagation()}>
                          <input type="checkbox" checked={post.done} onChange={() => toggleDone(post.id)} />
                        </label>
                        <small>{post.time}</small>
                      </div>
                      <div className={`calendar-post-format ${postFormatClass(post.format)}`}>
                        <i />
                        <em>{post.format}</em>
                      </div>
                      <strong data-i18n-content>{post.title}</strong>
                    </article>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <aside className="right-panel plan-panel">
          <div className="panel-title"><strong>{language === 'en' ? 'Next production steps' : 'Наступні кроки продакшену'}</strong><span>{pendingPosts.length}</span></div>
          <div className="plan-action-stack">
            {weeklyActions.map(([title, value, text]) => (
              <article key={title}>
                <span>{value}</span>
                <div>
                  <strong>{title}</strong>
                  <p>{text}</p>
                </div>
              </article>
            ))}
          </div>
          <label className="direct-background-toggle">
            <input type="checkbox" />
            <span>
              <strong>{translateText('Автовідповідь в Direct')}</strong>
              <small>{translateText('Ключове слово: ХОЧУ. Працює фоном без CRM-дашборда.')}</small>
            </span>
          </label>
          <div className="panel-title"><strong>{translateText('Планові пости')}</strong><span>{posts.length}</span></div>
          {(isPlanQueueExpanded ? posts : posts.slice(0, 5)).map((post) => (
            <article className={post.done ? 'mini-card plan-task done' : 'mini-card plan-task'} key={post.id}>
              <label>
                <input type="checkbox" checked={post.done} onChange={() => toggleDone(post.id)} />
                <span />
              </label>
              <div>
                <strong data-i18n-content>{post.title}</strong>
                <small>{post.day} · {post.time} · {post.format}</small>
              </div>
              <button type="button" onClick={() => onOpenPostInStudio?.(post)}>
                <Wand2 size={14} />
              </button>
            </article>
          ))}
          {posts.length > 5 && (
            <button className="plan-queue-toggle" type="button" onClick={() => setIsPlanQueueExpanded((value) => !value)}>
              {isPlanQueueExpanded
                ? (language === 'en' ? 'Show fewer posts' : 'Показати менше')
                : (language === 'en' ? `Show all ${posts.length} posts` : `Показати всі ${posts.length} постів`)}
            </button>
          )}
        </aside>
      </div>
      <section className="content-notes-panel">
        <button className="content-notes-toggle" type="button" onClick={() => setIsNotesOpen((value) => !value)}>
          <span>Notes</span>
          <strong>{allNotes.length} {language === 'en' ? 'ideas' : 'ідей'}</strong>
          <ChevronDown size={16} />
        </button>
        {isNotesOpen && (
          <div className="content-notes-list">
            <form className="content-note-composer" onSubmit={addManualNote}>
              <input
                value={noteDraft.title}
                onChange={(event) => setNoteDraft((current) => ({ ...current, title: event.target.value }))}
                placeholder={translateText('Назва note')}
              />
              <textarea
                value={noteDraft.body}
                onChange={(event) => setNoteDraft((current) => ({ ...current, body: event.target.value }))}
                placeholder={translateText('Ідея, інсайт, гіпотеза або короткий сценарій...')}
              />
              <button type="submit"><Plus size={15} />{language === 'en' ? 'Add note' : 'Додати note'}</button>
            </form>
            {allNotes.length ? allNotes.map((idea, index) => {
              const isEditingNote = editingNoteId === idea.id;
              return (
              <article className={isEditingNote ? 'is-editing-note' : ''} key={idea.id || `${idea.title}-${index}`}>
                {isEditingNote ? (
                  <div className="content-note-editor">
                    <input
                      value={noteEditDraft.title}
                      onChange={(event) => setNoteEditDraft((current) => ({ ...current, title: event.target.value }))}
                      placeholder={translateText('Назва note')}
                    />
                    <textarea
                      value={noteEditDraft.body}
                      onChange={(event) => setNoteEditDraft((current) => ({ ...current, body: event.target.value }))}
                      placeholder={translateText('Текст note')}
                    />
                  </div>
                ) : (
                  <div>
                    <small data-i18n-content>{idea.source || idea.status || 'generated'}</small>
                    <strong data-i18n-content>{idea.title || idea.hook}</strong>
                    <p data-i18n-content>{idea.hook || idea.angle || 'Ідея готова до сценарію або календаря.'}</p>
                  </div>
                )}
                <div className="content-note-actions">
                  {isEditingNote ? (
                    <>
                      <button className="ghost" type="button" onClick={cancelEditNote}>{language === 'en' ? 'Cancel' : 'Скасувати'}</button>
                      <button className="dark" type="button" onClick={() => saveEditedNote(idea)}>{language === 'en' ? 'Save' : 'Зберегти'}</button>
                    </>
                  ) : (
                    <>
                      <button className="ghost icon" type="button" onClick={() => startEditNote(idea)} aria-label={translateText('Редагувати note')}>
                        <Pencil size={14} />
                      </button>
                      <button className="ghost danger icon" type="button" onClick={() => deleteContentNote(idea)} aria-label={translateText('Видалити note')}>
                        <X size={14} />
                      </button>
                      <button type="button" onClick={() => addIdeaToPlan(idea, index)}>
                        <CalendarDays size={15} />{language === 'en' ? 'Add to plan' : 'Додати в план'}
                      </button>
                    </>
                  )}
                </div>
              </article>
              );
            }) : (
              <article>
                <div>
                  <small>{language === 'en' ? 'Nothing here yet' : 'Поки порожньо'}</small>
                  <strong>{language === 'en' ? 'No saved notes yet' : 'Ще немає збережених нотаток'}</strong>
                  <p>{language === 'en' ? 'Save an idea, insight, hypothesis, or draft here for later.' : 'Зберігай тут ідеї, спостереження, гіпотези або чернетки на потім.'}</p>
                </div>
              </article>
            )}
          </div>
        )}
      </section>
      {modalDay && (
        <div className="modal-backdrop" onClick={closePostModal}>
          <div className="quick-modal calendar-post-modal" onClick={(event) => event.stopPropagation()}>
            <div className="calendar-post-modal-head">
              <div>
                <small>{editingPostId ? (language === 'en' ? 'Edit event' : 'Редагувати подію') : (language === 'en' ? 'New event' : 'Нова подія')}</small>
                <h2 data-i18n-content>{draft.title || (language === 'en' ? 'Calendar content' : 'Контент у календарі')}</h2>
              </div>
              <button className="ghost icon" type="button" onClick={closePostModal} aria-label={translateText('Закрити')}>
                <X size={16} />
              </button>
            </div>
            <p className="calendar-post-modal-subtitle">
              {modalDateLabel} · {draft.time} · {draft.format}
            </p>
            <div className="calendar-post-form">
              <label>
                <span>{language === 'en' ? 'Date' : 'Дата'}</span>
                <input value={modalDateLabel} readOnly />
              </label>
              <label>
                <span>{language === 'en' ? 'Time' : 'Час'}</span>
                <input type="time" value={draft.time} onChange={(event) => setDraft((current) => ({ ...current, time: event.target.value }))} />
              </label>
              <label>
                <span>{language === 'en' ? 'Format' : 'Формат'}</span>
                <select value={draft.format} onChange={(event) => setDraft((current) => ({ ...current, format: event.target.value }))}>
                  {formatSuggestions.map((format) => <option key={format} value={format} />)}
                </select>
              </label>
              <div className="calendar-format-memory wide">
                {formatSuggestions.slice(0, 8).map((format) => (
                  <button type="button" key={format} onClick={() => setDraft((current) => ({ ...current, format }))}>
                    {format}
                  </button>
                ))}
              </div>
              <label className="wide">
                <span>{language === 'en' ? 'Title' : 'Назва'}</span>
                <input autoFocus value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder={translateText('Коротка назва події')} />
              </label>
              <label className="wide">
                <span>{language === 'en' ? 'Script / copy' : 'Сценарій / текст'}</span>
                <textarea value={draft.body} onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value }))} placeholder={translateText('Хук, кадри, озвучка та CTA')} />
              </label>
            </div>
            {editingPostId && (
              <div className="calendar-post-danger-zone">
                <div>
                  <strong>{language === 'en' ? 'Delete event' : 'Видалити подію'}</strong>
                  <span>{language === 'en' ? 'Removes this item only from the calendar. Its source and Studio draft remain available.' : 'Прибере цей матеріал тільки з календаря. Джерело або Studio draft не видаляються.'}</span>
                </div>
                <button className="danger" type="button" onClick={deletePost}>{language === 'en' ? 'Delete' : 'Видалити'}</button>
              </div>
            )}
            <div className="modal-actions">
              <button onClick={closePostModal}>{language === 'en' ? 'Cancel' : 'Скасувати'}</button>
              <button className="dark" onClick={savePost}>
                {editingPostId
                  ? (language === 'en' ? 'Save changes' : 'Зберегти зміни')
                  : (language === 'en' ? 'Add to calendar' : 'Додати в календар')}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function Analytics() {
  const { translateText } = useI18n();
  const conversionRows = [
    ['Рілс про дорогий CGI', '147.3K', '42', '18%', '89%'],
    ['Кейс AI для кафе', '82.1K', '31', '22%', '76%'],
    ['Сторіс-прогрів оферу', '19.4K', '28', '34%', '68%'],
  ];

  return (
    <section className="page">
      <PageTitle title={translateText('Аналітика продюсера')} subtitle={translateText('Контент, продажі й фінансові показники в одному місці: охоплення, кваліфіковані ліди, ROI, CAC і прогноз ефективності.')} />
      <div className="analytics-grid">
        <div className="insight-card"><Gauge size={24} /><h2>82</h2><p>Середній скор відібраних рілсів</p></div>
        <div className="insight-card"><CircleCheck size={24} /><h2>312%</h2><p>ROI запуску з урахуванням продакшену й трафіку</p></div>
        <div className="insight-card"><ClipboardList size={24} /><h2>₴184</h2><p>CAC: середня вартість гарячого ліда</p></div>
        <div className="insight-card"><MessageSquareText size={24} /><h2>7.8%</h2><p>Конверсія з охоплення у Direct/лід</p></div>
      </div>
      <div className="analytics-layout">
        <article className="insight-card forecast-card">
          <small>Прогноз охоплення</small>
          <h2>89%</h2>
          <p>Ймовірність, що наступний рілс набере вище медіани акаунта. Сигнали: утримання уваги, коментарі в ніші, короткий CTA, схожий патерн у США та Європі.</p>
          <div className="meter"><span style={{ width: '89%' }} /></div>
        </article>
        <article className="insight-card">
          <small>Контент → продажі</small>
          <h3>Які одиниці контенту привели гарячих лідів</h3>
          <div className="metric-table">
            {conversionRows.map(([title, reach, leads, direct, chance]) => (
              <div key={title}>
                <strong>{title}</strong>
                <span>{reach} охоплення</span>
                <span>{leads} лідів</span>
                <span>{direct} Direct</span>
                <em>{chance} прогноз</em>
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}

function SalesDirect({ notify, setPage }) {
  const { translateText } = useI18n();
  const pipeline = [
    ['Нові ліди', 'New', [
      ['@olena_brand', 'теплий', 'консультація', 'потрібна консультація', '5m ago'],
      ['@new_lead1', 'гарячий', 'покупка', 'питає про пакет', '15m ago'],
    ]],
    ['Кваліфіковані', 'Qualified', [
      ['@max_ecom', 'гарячий', 'покупка', 'готовий купити', '1h ago'],
      ['@qualified2', 'теплий', 'демо', 'запит на демо', '2h ago'],
    ]],
    ['В обробці', 'In progress', [
      ['@studio_lviv', 'новий', 'підтримка', 'питання по бронюванню', '4h ago'],
      ['@inprogress2', 'скарга', 'проблема з доступом', 'передати людині', '6h ago'],
    ]],
    ['Закриті', 'Closed', [
      ['@ira_course', 'ризик', 'скарга', 'скаргу закрито', '1d ago'],
      ['@closed2', 'комплімент', 'подяка', 'відповісти коротко', '2d ago'],
    ]],
  ];
  const intents = [
    ['Покупка', ShoppingBag, 'ціна, оплата, “як записатись”, “хочу пакет”'],
    ['Підтримка', ShieldCheck, 'доставка, бронювання, доступ, технічне питання'],
    ['Скарга', Flame, 'негатив, повернення, помилка, публічний ризик'],
    ['Комплімент', Sparkles, 'лайк, реакція, коротка подяка без наміру купити'],
  ];

  return (
    <section className="page">
      <PageTitle
        title={translateText('Продажі / AI Direct')}
        subtitle={translateText('Слой конверсії: авто-відповіді в коментарях і Direct, кваліфікація лідів, CRM-теги й передача людині.')}
        actions={<button className="dark" onClick={() => { setPage('assistant'); notify(translateText('Відкрив Асистента для налаштування AI Direct')); }}><MessageSquareText size={16} />Увімкнути AI Direct</button>}
      />
      <div className="sales-layout">
        <div className="sales-stats">
          <div><span>Нові ліди</span><strong>38</strong></div>
          <div><span>Гарячі</span><strong>9</strong></div>
          <div><span>FAQ авто-закрито</span><strong>71%</strong></div>
          <div><span>Передано людині</span><strong>6</strong></div>
        </div>
        <div className="sales-insight-charts">
          <article>
            <div className="panel-title"><strong>Average response time</strong><span>Last 30 days</span></div>
            <div className="mini-line-chart">
              {[84, 62, 48, 28].map((value, index) => <i key={index} style={{ height: `${value}%` }} />)}
            </div>
            <p>2h → 45m після AI triage</p>
          </article>
          <article>
            <div className="panel-title"><strong>Conversion trend</strong><span>Weekly</span></div>
            <div className="mini-bar-chart">
              {[15, 18, 22, 25].map((value, index) => <i key={index} style={{ height: `${value * 3}%` }}><span>{value}%</span></i>)}
            </div>
            <p>+10% за 4 тижні</p>
          </article>
        </div>
      </div>
      <div className="intent-grid">
        {intents.map(([title, Icon, text]) => (
          <article className="insight-card intent-card" key={title}>
            <i><Icon size={18} /></i>
            <small>Intent Detection</small>
            <h3>{title}</h3>
            <p>{text}</p>
          </article>
        ))}
      </div>
      <div className="sales-pipeline-board">
        {pipeline.map(([title, subtitle, cards]) => (
          <article className="sales-pipeline-column" key={title}>
            <div className="panel-title"><strong>{title}</strong><span>{cards.length}</span></div>
            <small>{subtitle}</small>
            {cards.map(([handle, temp, intent, message, time]) => (
              <button type="button" key={handle} onClick={() => notify(translateText(`${handle}: ${message}`))}>
                <div>
                  <strong>{handle}</strong>
                  <MoreHorizontal size={16} />
                </div>
                <p>Intent: <Badge>{temp}</Badge> <Badge>{intent}</Badge></p>
                <span>{message}</span>
                <em>{time}</em>
              </button>
            ))}
          </article>
        ))}
      </div>
    </section>
  );
}

function AnalysisSetup({ notify, workspaceId }) {
  const { t, translateText } = useI18n();
  const [brandInput, setBrandInput] = useState('');
  const [status, setStatus] = useState('idle');

  const saveBrandInput = async () => {
    const clean = brandInput.trim();
    if (!clean) {
      notify(translateText('Встав Instagram-профіль або коротко опиши бізнес.'));
      return;
    }
    setStatus('saving');
    const isInstagramUrl = /instagram\.com\//i.test(clean);
    try {
      const response = await authFetch(`${API_BASE}/workspaces/${workspaceId}/agent/context`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessType: isInstagramUrl ? 'Instagram profile' : clean.slice(0, 80),
          product: clean,
          audience: 'Auto-detect from profile or description',
          toneOfVoice: 'Auto-detect',
          sourceProfileUrl: isInstagramUrl ? clean : '',
          rawBrandInput: clean,
        }),
      });
      if (!response.ok) throw new Error(await readApiError(response, 'brand_brain_save_failed'));
      setStatus('saved');
      notify(translateText('Brand Brain оновлено. Джеро використає це в сценаріях.'));
      window.setTimeout(() => setStatus('idle'), 1800);
    } catch (error) {
      setStatus('error');
      notify(localizeInterfaceError(error, t, 'errors.brandBrainSave'));
    }
  };

  return (
    <div className="analysis-setup">
      <div className="business-picker brand-intake-card">
        <div>
          <small>Brand Brain</small>
          <h3>Один вхід замість анкети</h3>
          <p>Встав Instagram-профіль або коротко опиши бізнес. Джеро збере портрет бренду під капотом і використає його в сценаріях.</p>
        </div>
        <div className="brand-intake-form">
          <textarea
            value={brandInput}
            onChange={(event) => setBrandInput(event.target.value)}
            placeholder={translateText('https://instagram.com/your_brand або: кавʼярня у Львові, продаємо сніданки і каву, аудиторія 20-35...')}
            rows={5}
          />
          <button className="dark" type="button" onClick={saveBrandInput} disabled={status === 'saving'}>
            <Sparkles size={16} />{status === 'saving' ? 'Аналізуємо...' : 'Зберегти Brand Brain'}
          </button>
          <span>{status === 'saved' ? 'Готово: портрет бренду оновлено.' : 'Без ручних 10 полів. Тільки профіль або короткий опис.'}</span>
        </div>
      </div>
    </div>
  );
}

function BillingSettings({ workspaceId, notify, language = 'uk' }) {
  const { t, translateText } = useI18n();
  const [plans, setPlans] = useState([]);
  const [billing, setBilling] = useState(null);
  const [checkout, setCheckout] = useState(null);
  const [status, setStatus] = useState('loading');

  const loadBilling = async () => {
    setStatus('loading');
    try {
      const [plansResponse, billingResponse] = await Promise.all([
        fetch(`${API_BASE}/billing/plans`),
        authFetch(`${API_BASE}/workspaces/${workspaceId}/billing`),
      ]);
      const plansPayload = await plansResponse.json();
      const billingPayload = await billingResponse.json();
      if (!plansResponse.ok) throw new Error(plansPayload.message || plansPayload.error || 'plans_failed');
      if (!billingResponse.ok) throw new Error(billingPayload.message || billingPayload.error || 'billing_failed');
      setPlans(plansPayload.plans || []);
      setBilling(billingPayload);
      setStatus('ready');
    } catch (err) {
      setStatus('error');
      notify(localizeInterfaceError(err, t, 'errors.generic'));
    }
  };

  useEffect(() => {
    loadBilling();
  }, [workspaceId]);

  const selectPlan = async (planId) => {
    const paymentWindow = window.open('', '_blank');
    if (paymentWindow) {
      paymentWindow.opener = null;
      paymentWindow.document.write('<title>Dzhero payment</title><body style="margin:0;background:#0b0f14;color:#fff;font-family:system-ui;display:grid;place-items:center;min-height:100vh">Відкриваємо оплату...</body>');
    }
    try {
      const response = await authFetch(`${API_BASE}/workspaces/${workspaceId}/billing/select-plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || payload.error || 'select_plan_failed');
      const checkoutResponse = await authFetch(`${API_BASE}/workspaces/${workspaceId}/billing/checkout?planId=${planId}`);
      const checkoutPayload = await checkoutResponse.json();
      if (!checkoutResponse.ok) throw new Error(checkoutPayload.message || checkoutPayload.error || 'checkout_failed');
      if (checkoutPayload.payment?.paymentUrl) {
        notify(translateText('Переходимо до безпечної оплати Monobank.'));
        if (paymentWindow) {
          paymentWindow.location.href = checkoutPayload.payment.paymentUrl;
        } else {
          window.open(checkoutPayload.payment.paymentUrl, '_blank', 'noopener,noreferrer');
        }
        return;
      }
      paymentWindow?.close();
      setCheckout(checkoutPayload);
      notify(translateText('Тариф зарезервовано. Перевір реквізити оплати нижче.'));
      await loadBilling();
    } catch (err) {
      paymentWindow?.close();
      notify(localizeInterfaceError(err, t, 'errors.selectPlan'));
    }
  };

  const copyPaymentText = async (value, label) => {
    await navigator.clipboard?.writeText(value || '');
    notify(translateText(`${label} скопійовано`));
  };

  const currentPlanId = billing?.plan?.id;
  const billingCopy = language === 'en'
    ? {
      currentPlan: 'Current plan',
      loading: 'Loading...',
      unknown: 'Not defined',
      demoAccess: 'Free demo access',
      trialEnded: 'Trial ended',
      trialDays: (days) => `Free Trial · ${days ?? 0} days left`,
      active: 'Active access',
      pending: 'Payment confirmation pending',
      trialing: 'Trial period',
      setup: 'Access is being configured',
      unlimited: 'Unlimited',
      usedUnlimited: (used) => `${used} used · unlimited`,
      usedLimit: (used, limit) => `${used} / ${limit} used`,
      dayShort: 'days',
      trialEyebrow: 'Trial without card',
      trialTitle: 'Try the product without risking the budget',
      trialText: 'Free Trial gives short access to Studio, Brand Brain, and Assistant. When the limit ends, more generations and extended analysis open through Starter or Pro.',
      currentButton: 'Your current plan',
      demoButton: 'Demo access',
      trialButton: 'Trial after login',
      payButton: 'Pay for plan',
      usageRows: [
        ['Paid AI operations', 'aiOperations'],
        ['AI messages', 'agentChat'],
        ['Reels imports', 'reelImports'],
        ['Brand Brain saves', 'brandBrainSaves'],
        ['Competitors', 'competitors'],
        ['Instagram accounts', 'instagramAccounts'],
      ],
      limitRows: [
        ['aiOperations', Bot, 'paid AI operations'],
        ['agentChat', MessageSquareText, 'AI messages'],
        ['reelImports', Video, 'Reels imports'],
        ['brandBrainSaves', Database, 'Brand Brain saves'],
        ['competitors', Target, 'competitors'],
        ['instagramAccounts', UsersRound, 'Instagram accounts'],
      ],
      features: {
        guest_preview: '1 guest preview before login',
        brand_scan_trial: '3 source scans / drafts',
        brand_brain_once: '1 Brand Brain save',
        studio_drafts_limited: 'Limited Studio access',
        brand_brain: 'Brand Brain and content plan',
        assistant: 'AI script assistant',
        remix_studio: 'Remix Studio',
        instagram_login: 'Instagram login ready',
        everything_starter: 'Everything in Starter',
        weekly_batches: 'Weekly production batch plans',
        deep_brand_memory: 'Extended brand memory',
        content_notes: 'Unlimited Notes, calendar, and scripts',
        ai_direct: 'AI Direct for CRM',
        exports: 'Client exports',
        sync_queue: 'Sync queue',
        everything_pro: 'Everything in Pro',
        ai_direct_unlimited: 'Unlimited AI Direct',
        multi_client_workspaces: 'Multiple brands / clients',
        approval_flow: 'Approval flow for production',
        priority_support: 'Priority support',
      },
    }
    : {
      currentPlan: 'Поточний тариф',
      loading: 'Завантаження...',
      unknown: 'Не визначено',
      demoAccess: 'Безкоштовний тестовий доступ',
      trialEnded: 'Тестовий період завершився',
      trialDays: (days) => `Тестовий період · ${days ?? 0} дн. залишилось`,
      active: 'Активний доступ',
      pending: 'Очікує підтвердження оплати',
      trialing: 'Тестовий період',
      setup: 'Доступ налаштовується',
      unlimited: 'Безліміт',
      usedUnlimited: (used) => `${used} використано · без ліміту`,
      usedLimit: (used, limit) => `${used} / ${limit} використано`,
      dayShort: 'дн.',
      trialEyebrow: 'Тест без карти',
      trialTitle: 'Можна спробувати продукт без ризику для бюджету',
      trialText: 'Тестовий період дає короткий доступ до Studio, Brand Brain і Асистента. Коли ліміт закінчиться, більше генерацій і розширений аналіз відкриваються через Starter або Pro.',
      currentButton: 'Ваш поточний тариф',
      demoButton: 'Демо доступ',
      trialButton: 'Trial після логіну',
      payButton: 'Оплатити тариф',
      usageRows: [
        ['Платні AI-операції', 'aiOperations'],
        ['AI повідомлення', 'agentChat'],
        ['Імпорти Reels', 'reelImports'],
        ['Збереження Brand Brain', 'brandBrainSaves'],
        ['Конкуренти', 'competitors'],
        ['Instagram акаунти', 'instagramAccounts'],
      ],
      limitRows: [
        ['aiOperations', Bot, 'платних AI-операцій'],
        ['agentChat', MessageSquareText, 'AI повідомлень'],
        ['reelImports', Video, 'імпортів Reels'],
        ['brandBrainSaves', Database, 'збережень Brand Brain'],
        ['competitors', Target, 'конкурентів'],
        ['instagramAccounts', UsersRound, 'Instagram акаунтів'],
      ],
      features: {
        guest_preview: '1 guest preview до логіну',
        brand_scan_trial: '3 скани джерел / чернетки',
        brand_brain_once: '1 збереження Brand Brain',
        studio_drafts_limited: 'Лімітований доступ до Studio',
        brand_brain: 'Brand Brain і контент-план',
        assistant: 'AI асистент для сценаріїв',
        remix_studio: 'Remix Studio',
        instagram_login: 'Instagram login готовий',
        everything_starter: 'Усе зі Starter',
        weekly_batches: 'Тижневі production-batch плани',
        deep_brand_memory: 'Розширена памʼять бренда',
        content_notes: 'Notes, календар і сценарії без ліміту',
        ai_direct: 'AI Direct для CRM',
        exports: 'Експорти для клієнтів',
        sync_queue: 'Sync queue',
        everything_pro: 'Усе з Pro',
        ai_direct_unlimited: 'Безлімітний AI Direct',
        multi_client_workspaces: 'Кілька брендів / клієнтів',
        approval_flow: 'Approval flow для продакшену',
        priority_support: 'Пріоритетна підтримка',
      },
    };
  const subscriptionStatusLabel = (() => {
    if (billing?.plan?.id === 'demo') return billingCopy.demoAccess;
    if (billing?.plan?.id === 'trial' && billing?.trial?.expired) return billingCopy.trialEnded;
    if (billing?.plan?.id === 'trial') return billingCopy.trialDays(billing?.trial?.daysRemaining);
    if (billing?.subscription?.status === 'active') return billingCopy.active;
    if (billing?.subscription?.status === 'pending_payment') return billingCopy.pending;
    if (billing?.subscription?.status === 'trialing') return billingCopy.trialing;
    return billingCopy.setup;
  })();
  const usageRows = billingCopy.usageRows;
  const planLimitRows = billingCopy.limitRows;
  const planFeatureLabels = billingCopy.features;

  return (
    <div className="billing-settings">
      <section className="billing-current">
        <div>
          <small>{billingCopy.currentPlan}</small>
          <h3 data-i18n-content>{billing?.plan?.name || (status === 'loading' ? billingCopy.loading : billingCopy.unknown)}</h3>
          <p>{subscriptionStatusLabel}</p>
        </div>
      </section>

      {billing?.plan?.id === 'trial' && (
        <section className="trial-note">
          <div>
            <small>{billingCopy.trialEyebrow}</small>
            <h3>{billingCopy.trialTitle}</h3>
            <p>{billingCopy.trialText}</p>
          </div>
          <strong>{billing?.trial?.daysRemaining ?? 0} {billingCopy.dayShort}</strong>
        </section>
      )}

      <div className="billing-usage-grid">
        {usageRows.map(([label, key]) => {
          const limit = billing?.plan?.limits?.[key];
          const used = billing?.usage?.[key] ?? 0;
          const isUnlimited = billing?.unlimited || limit == null;
          const remaining = isUnlimited ? billingCopy.unlimited : (billing?.remaining?.[key] ?? 0);
          const width = !isUnlimited && limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
          return (
            <article className="billing-usage-card" key={key}>
              <div>
                <small>{label}</small>
                <strong>{remaining}</strong>
              </div>
              <p>{isUnlimited ? billingCopy.usedUnlimited(used) : billingCopy.usedLimit(used, limit)}</p>
              <span><i style={{ width: `${width}%` }} /></span>
            </article>
          );
        })}
      </div>

      <div className="billing-plan-grid">
        {plans.map((plan) => {
          const isCurrent = plan.id === currentPlanId;
          const isDemo = plan.id === 'demo';
          const isTrial = plan.id === 'trial';
          return (
            <article className={isCurrent ? 'billing-plan active' : 'billing-plan'} key={plan.id}>
              <small>{plan.billingPeriod}</small>
              <h3 data-i18n-content>{plan.name}</h3>
              <div className="billing-price">{plan.priceUah ? `₴${plan.priceUah}` : (language === 'en' ? 'Free' : 'Безкоштовно')}</div>
              <ul>
                {planLimitRows.map(([key, Icon, label]) => (
                  <li key={key}>
                    <Icon size={15} />
                    <span>{plan.limits[key]} {label}</span>
                  </li>
                ))}
                {(plan.features || [])
                  .filter((feature) => planFeatureLabels[feature])
                  .slice(0, plan.id === 'pro' ? 5 : plan.id === 'agency' ? 4 : isTrial ? 4 : 2)
                  .map((feature) => (
                    <li className="billing-plan-feature" key={feature}>
                      <CircleCheck size={15} />
                      <span>{planFeatureLabels[feature]}</span>
                    </li>
                  ))}
              </ul>
              <button
                className={isCurrent ? 'billing-plan-button current' : 'billing-plan-button'}
                type="button"
                disabled={isCurrent || isDemo || isTrial}
                onClick={() => selectPlan(plan.id)}
              >
                {isCurrent ? billingCopy.currentButton : isDemo ? billingCopy.demoButton : isTrial ? billingCopy.trialButton : billingCopy.payButton}
              </button>
            </article>
          );
        })}
      </div>

      {checkout && (
        <section className="checkout-panel">
          <div className="checkout-head">
            <div>
              <small>Поповнення картки</small>
              <h3 data-i18n-content>{checkout.plan.name} · ₴{checkout.payment.amount}</h3>
              <p>Поповніть картку на суму тарифу. Після перевірки ми активуємо доступ вручну.</p>
            </div>
            <button type="button" onClick={() => setCheckout(null)}>Закрити</button>
          </div>
          <article className="checkout-card">
            <small>Номер картки для поповнення</small>
            <strong data-i18n-content>{checkout.payment.cardNumber || 'Реквізити скоро зʼявляться'}</strong>
            <button type="button" disabled={!checkout.payment.cardNumber} onClick={() => copyPaymentText(checkout.payment.cardNumber, 'Номер картки')}>
              <Copy size={16} />
              Скопіювати номер
            </button>
          </article>
          <div className="checkout-meta">
            <article>
              <small>Сума</small>
              <strong>₴{checkout.payment.amount}</strong>
            </article>
            <article>
              <small>Коментар до платежу</small>
              <strong data-i18n-content>{checkout.payment.note}</strong>
            </article>
          </div>
          <button className="checkout-paid-button" type="button" onClick={() => notify(translateText('Оплату треба перевірити вручну. Після підтвердження адміністратор активує тариф.'))}>
            Я оплатив
          </button>
        </section>
      )}
    </div>
  );
}

function DataSources({ sources, notify, workspaceId, currentUser, onOpenBrandScan, activeTab = 'sources', onTabChange, language = 'uk' }) {
  const { t, translateText } = useI18n();
  const tab = activeTab;
  const setTab = onTabChange || (() => {});
  const [sourceInput, setSourceInput] = useState('');
  const [sourcePreview, setSourcePreview] = useState(null);
  const [sourceError, setSourceError] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const settingsTabs = [
    ['sources', language === 'en' ? 'Sources Hub' : 'Джерела'],
    ['profile', language === 'en' ? 'Brand memory' : 'Памʼять бренду'],
    ['billing', language === 'en' ? 'Plan and limits' : 'Тариф і ліміти'],
    ...(currentUser?.canManageTesters && !currentUser?.isDemo
      ? [['testers', language === 'en' ? 'Testers' : 'Тестери']]
      : []),
  ];

  useEffect(() => {
    if (tab === 'testers' && (!currentUser?.canManageTesters || currentUser?.isDemo)) {
      setTab('sources');
      window.localStorage.setItem(SOURCES_TAB_KEY, 'sources');
    }
  }, [tab, currentUser?.canManageTesters, currentUser?.isDemo]);
  const sourceTypes = [
    ['Instagram', 'Можна додати', 'Встав профіль, щоб Джеро зрозумів нішу, мову бренду і перші теми.', 'instagram'],
    ['TikTok', 'Можна додати', 'Встав відео, профіль або короткий опис, якщо бренд живе в TikTok.', 'tiktok'],
    ['YouTube Shorts', 'Можна додати', 'Встав Shorts або канал, щоб зібрати контекст для контент-плану.', 'shorts'],
    ['Manual brief', 'Завжди доступно', 'Короткого опису бізнесу достатньо, якщо бренд тільки запускається.', 'text'],
  ];

  const buildSourcePreview = async () => {
    const cleanInput = sourceInput.trim();
    if (!cleanInput) {
      setSourceError('Встав Instagram, TikTok, YouTube Shorts або короткий опис бізнесу.');
      return;
    }
    setIsScanning(true);
    setSourceError('');
    let metadata = null;
    let capabilities = null;
    try {
      const response = await fetch(`${API_BASE}/brand-scan/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: cleanInput }),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok) {
        metadata = payload.metadata || null;
        capabilities = payload.capabilities || null;
      }
    } catch {
      metadata = null;
    } finally {
      setIsScanning(false);
    }
    const result = composeBrandScanResult(cleanInput, metadata, capabilities);
    setSourcePreview(result);
    notify(translateText(hasSourceMetadata(result.metadata)
      ? 'Джеро прочитав публічний профіль і зібрав production preview.'
      : 'Джеро зібрав preview з опису.'));
  };

  const connectInstagram = async () => {
    try {
      const response = await authFetch(`${API_BASE}/auth/meta/start?workspaceId=${workspaceId}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'meta_not_configured');
      window.location.href = payload.authUrl;
    } catch (error) {
      notify(localizeInterfaceError(error, t, 'errors.instagramNotConfigured'));
    }
  };

  return (
    <section className="page">
      <PageTitle
        title={language === 'en' ? 'Settings' : 'Налаштування'}
        subtitle={language === 'en'
          ? 'Manage sources, brand memory, account access, and plan limits.'
          : 'Керуй джерелами, пам’яттю бренду, доступом до акаунта й лімітами тарифу.'}
      />
      <Tabs
        active={tab}
        onChange={setTab}
        items={settingsTabs}
      />
      {tab === 'sources' && (
        <div className="sources-hub">
          <div className="sources-command">
            <div>
              <small>Quick source scan</small>
              <h2>Додай Instagram, TikTok, Shorts або brief</h2>
              <p>Джеро спробує прочитати відкритий контекст, визначить нішу, збере першу генерацію і відкриє це в Studio.</p>
            </div>
            <div className="source-scan-form">
              <textarea
                value={sourceInput}
                onChange={(event) => setSourceInput(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') buildSourcePreview();
                }}
                placeholder={translateText('https://www.instagram.com/wowbody_app/ або коротко: бʼюті-студія, манікюр, запис через Direct...')}
                rows={4}
              />
              <div>
                <button className="dark" type="button" onClick={buildSourcePreview} disabled={isScanning}>
                  <Sparkles size={16} /> {isScanning ? 'Скануємо...' : 'Проаналізувати джерело'}
                </button>
                <button className="dark source-connect-inline" type="button" onClick={connectInstagram}>
                  <Link2 size={16} /> Підключити Instagram
                </button>
                {sourceError && <span>{sourceError}</span>}
              </div>
            </div>
          </div>

          {isScanning && !sourcePreview && (
            <JerykLoading
              title={translateText('Джерик збирає Brand Scan preview')}
              text="Перевіряю відкрите джерело і готую перший production preview."
            />
          )}

          <div className="source-type-grid">
            {sourceTypes.map(([title, status, text, tone]) => (
              <article className="source-type-card" key={title}>
                <div>
                  <em data-source={tone}>{status}</em>
                  <h3>{title}</h3>
                </div>
                <p>{text}</p>
              </article>
            ))}
          </div>

          {sourcePreview && (
            <article className="source-preview-result">
              <div className="source-preview-head">
                <div>
                  <small>Brand Scan</small>
                  <h3 data-i18n-content>{sourcePreview.title}</h3>
                </div>
                <button className="dark" type="button" onClick={() => onOpenBrandScan?.(sourcePreview)}>
                  <Wand2 size={16} /> Відкрити в Studio
                </button>
              </div>
              <div className="scan-source">
                <span>Джерело</span>
                <strong data-i18n-content>{sourcePreview.source}</strong>
                <em data-i18n-content data-source={sourcePreview.sourceTone}>{sourcePreview.sourceType}</em>
              </div>
              {hasSourceMetadata(sourcePreview.metadata) && (
                <div className="scan-public-meta">
                  <span>Профіль</span>
                  <strong data-i18n-content>{sourcePreview.metadata.handle}</strong>
                  <p data-i18n-content>{sourcePreview.metadata.title || sourcePreview.metadata.description}</p>
                  <div>
                    {metadataStatChips(sourcePreview.metadata).map((chip) => <b key={chip}>{chip}</b>)}
                  </div>
                </div>
              )}
              <div className="scan-niche-row">
                <strong data-i18n-content>{sourcePreview.label}</strong>
                {sourcePreview.ideas.map((idea) => <span data-i18n-content key={idea}>{idea}</span>)}
              </div>
              {sourcePreview.example && (
                <div className="scan-example-block">
                  <div className="scan-example-head">
                    <small>Перша генерація</small>
                    <strong data-i18n-content>{sourcePreview.example.title}</strong>
                  </div>
                  <div className="scan-example-hook">
                    <span>Hook</span>
                    <p data-i18n-content>{sourcePreview.example.hook}</p>
                  </div>
                  <div className="scan-example-script">
                    {sourcePreview.example.script.map(([time, text]) => (
                      <span data-i18n-content key={time}><b>{time}</b>{text}</span>
                    ))}
                  </div>
                </div>
              )}
            </article>
          )}

          <div className="sources-instagram-only">
            <button className="dark source-connect-button" type="button" onClick={connectInstagram}>
              <Link2 size={16} /> Підключити Instagram
            </button>
          </div>
        </div>
      )}
      {tab === 'profile' && <BrandBrain notify={notify} workspaceId={workspaceId} language={language} />}
      {tab === 'billing' && <BillingSettings workspaceId={workspaceId} notify={notify} language={language} />}
      {tab === 'testers' && currentUser?.canManageTesters && !currentUser?.isDemo && (
        <TesterAccessPanel apiBase={API_BASE} authFetch={authFetch} language={language} notify={notify} />
      )}
    </section>
  );
}

function LegalSafe({ notify }) {
  const { translateText } = useI18n();
  const [editor, setEditor] = useState(null);
  const docs = [
    ['Партнерська угода', 'блогер + продюсер', 'частки, ролі, доступи, KPI, вихід із партнерства'],
    ['Договір підрядника', 'монтажер / дизайнер / таргетолог', 'дедлайни, правки, NDA, передача матеріалів'],
    ['Оферта продукту', 'курс / консультація / клуб', 'умови продажу, повернення, доступ, відповідальність'],
    ['Політика Direct', 'AI-асистент і менеджери', 'що можна обіцяти, коли передавати людині, стоп-теми'],
  ];
  const buildTemplate = (title, type, text) => [
    title,
    '',
    `Тип документа: ${type}`,
    '',
    '1. Сторони та предмет документа',
    'Опиши учасників, роль кожної сторони та результат, який має бути переданий.',
    '',
    '2. Обсяг робіт / умови',
    text,
    '',
    '3. Дедлайни, оплата, права на контент',
    'Зафіксуй строки, суму, порядок погодження правок і хто володіє матеріалами після оплати.',
    '',
    '4. Безпека та обмеження',
    'Додай стоп-теми, порядок передачі доступів, конфіденційність і ручне погодження ризикових рішень.',
  ].join('\n');
  const openTemplate = (doc) => {
    const [title, type, text] = doc;
    setEditor({ title, text: buildTemplate(title, type, text) });
  };
  const copyTemplate = async () => {
    await navigator.clipboard?.writeText(editor.text);
    notify(translateText('Шаблон скопійовано'));
  };
  const downloadTemplate = () => {
    const blob = new Blob([editor.text], { type: 'application/msword;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${editor.title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'dzhero-template'}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    notify(translateText('Шаблон завантажено'));
  };

  return (
    <section className="page">
      <PageTitle
        title={translateText('Юридичний сейф')}
        subtitle={translateText('Шаблони документів і правила безпеки для запусків, партнерств, підрядників та AI Direct.')}
        actions={<button className="dark" onClick={() => openTemplate(docs[0])}><ShieldCheck size={16} />Зібрати пакет</button>}
      />
      <div className="vault-grid">
        {docs.map(([title, type, text]) => (
          <article className="vault-card" key={title}>
            <ShieldCheck size={22} />
            <small>{type}</small>
            <h3>{title}</h3>
            <p>{text}</p>
            <button onClick={() => openTemplate([title, type, text])}>Створити шаблон</button>
          </article>
        ))}
      </div>
      <article className="insight-card">
        <small>Для ТЗ</small>
        <h3>AI не замінює юриста, але готує структуру документа</h3>
        <p>Система збирає дані проекту, ролі, бюджет, терміни, права на контент і формує чернетку, яку можна передати юристу або власнику бізнесу на перевірку.</p>
      </article>
      {editor && (
        <div className="modal-backdrop" onClick={() => setEditor(null)}>
          <div className="quick-modal legal-editor-modal" onClick={(event) => event.stopPropagation()}>
            <h2>{editor.title}</h2>
            <textarea value={editor.text} onChange={(event) => setEditor((current) => ({ ...current, text: event.target.value }))} />
            <div className="modal-actions">
              <button onClick={() => setEditor(null)}>Закрити</button>
              <button onClick={copyTemplate}>Копіювати</button>
              <button className="dark" onClick={downloadTemplate}>Скачати .doc</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function BudgetCalculator({ notify }) {
  const { translateText } = useI18n();
  const [inputs, setInputs] = useState({ profit: 300000, avgCheck: 8500, cac: 900, production: 18000 });
  const [model, setModel] = useState(() => calculateBudgetModel(inputs));

  useEffect(() => {
    const timer = window.setTimeout(() => setModel(calculateBudgetModel(inputs)), 250);
    return () => window.clearTimeout(timer);
  }, [inputs]);

  const updateInput = (key, value) => {
    setInputs((current) => ({ ...current, [key]: Math.max(0, Number(value || 0)) }));
  };
  const money = (value) => `₴${Math.round(value).toLocaleString('uk-UA')}`;
  const rows = [
    ['Бажаний чистий прибуток', 'profit', inputs.profit],
    ['Середній чек', 'avgCheck', inputs.avgCheck],
    ['Плановий CAC', 'cac', inputs.cac],
    ['Продакшен', 'production', inputs.production],
  ];

  return (
    <section className="page">
      <PageTitle
        title={translateText('Бюджетний калькулятор')}
        subtitle={translateText('Фінансова модель запуску: прибуток, CAC, трафік, продакшен, команда і точка окупності.')}
      />
      <div className="budget-layout">
        <article className="budget-hero">
          <small>План запуску</small>
          <h2>Щоб заробити {money(inputs.profit)} чистими, потрібно {model.salesNeeded} продажів і контроль CAC до {money(inputs.cac)}.</h2>
        </article>
        <div className="budget-table">
          {rows.map(([label, key, value]) => (
            <label className="budget-input-card" key={key}>
              <span>{label}</span>
              <input type="number" min="0" value={value} onChange={(event) => updateInput(key, event.target.value)} />
            </label>
          ))}
          <div><span>Потрібно продажів</span><strong>{model.salesNeeded}</strong></div>
          <div><span>Бюджет на трафік</span><strong>{money(model.trafficBudget)}</strong></div>
        </div>
      <div className="budget-scenarios">
        <article className="insight-card"><h3>Сценарій conservative</h3><p>{model.conservative.sales} продажів · {money(model.conservative.budget)} трафік · CAC {money(model.conservative.cac)}</p></article>
        <article className="insight-card"><h3>Сценарій aggressive</h3><p>{model.aggressive.sales} продажів · {money(model.aggressive.budget)} трафік · CAC {money(model.aggressive.cac)}</p></article>
      </div>
      </div>
    </section>
  );
}

function calculateBudgetModel(inputs) {
  const salesNeeded = Math.max(1, Math.ceil((inputs.profit + inputs.production) / Math.max(1, inputs.avgCheck)));
  const trafficBudget = salesNeeded * inputs.cac;
  return {
    salesNeeded,
    trafficBudget,
    conservative: {
      sales: Math.ceil(salesNeeded * 1.18),
      cac: Math.ceil(inputs.cac * 1.25),
      budget: Math.ceil(trafficBudget * 1.32),
    },
    aggressive: {
      sales: Math.max(1, Math.ceil(salesNeeded * 0.9)),
      cac: Math.ceil(inputs.cac * 0.82),
      budget: Math.ceil(trafficBudget * 0.78),
    },
  };
}

function TeamHub({ notify, workspaceId }) {
  const { translateText } = useI18n();
  const team = [
    ['Продюсер', 'стратегія, офер, запуск', 'затверджує'],
    ['SMM', 'календар, сторіс, публікації', 'в роботі'],
    ['Монтажер', 'Reels, субтитри, обкладинки', 'дедлайн сьогодні'],
    ['Менеджер Direct', 'гарячі ліди, скарги, оплати', 'черга 6'],
  ];
  const checklistLabels = useMemo(() => [
    'Хук у перші 2 секунди',
    'Є CTA',
    'Немає ризику копіювання',
    'Підходить Tone of Voice',
    'Передано в календар',
  ], []);
  const teamChecklist = useChecklistState('team', checklistLabels, notify, 'Затверджено', workspaceId);

  return (
    <section className="page">
      <PageTitle
        title={translateText('Команда')}
        subtitle={translateText('Контроль підрядників, дедлайнів і якості контенту перед публікацією.')}
        actions={<button className="dark" onClick={() => notify(translateText('Нову задачу для команди створено'))}><Plus size={16} />Додати задачу</button>}
      />
      <div className="team-board">
        {team.map(([role, work, status]) => (
          <article className="team-card" key={role}>
            <UsersRound size={22} />
            <h3>{role}</h3>
            <p>{work}</p>
            <Badge>{status}</Badge>
          </article>
        ))}
      </div>
      <div className="checklist-status team-checklist-status">
        <strong>Quality gate</strong>
        <Badge>{teamChecklist.allChecked ? 'Затверджено' : 'В роботі'}</Badge>
      </div>
      <div className="quality-board">
        {teamChecklist.items.map((item) => (
          <article className="insight-card checklist-card" key={item.id}>
            <label className="checklist-item">
              <input type="checkbox" checked={item.checked} onChange={() => teamChecklist.toggleItem(item.id)} />
              <strong>{item.label}</strong>
            </label>
          </article>
        ))}
      </div>
    </section>
  );
}

function PageTitle({ title, subtitle, actions }) {
  return (
    <div className="page-title">
      <div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>
      <div className="actions">{actions}</div>
    </div>
  );
}

function Tabs({ items, active, onChange }) {
  return <div className="tabs">{items.map(([id, label]) => <button className={active === id ? 'active' : ''} key={id} onClick={() => onChange(id)}>{label}</button>)}</div>;
}

function Score({ value, compact }) {
  return <div className={compact ? 'score compact' : 'score'}><strong>{value}</strong>{!compact && <small>{Number(value) > 84 ? 'Відмінно' : 'Добре'}</small>}</div>;
}

function marketLabel(market) {
  return {
    ua: 'Україна',
    us: 'США',
    eu: 'Європа',
    global: 'Global',
  }[market] ?? 'Усі ринки';
}

function filterByMarket(items, market) {
  if (market === 'all') return items;
  return items.filter((item) => item.market === market);
}

function formatMetricDisplay(value) {
  const number = parseMetric(value);
  if (!number) return '0';
  if (number >= 1_000_000_000) return `${(number / 1_000_000_000).toFixed(number >= 10_000_000_000 ? 0 : 1).replace(/\.0$/, '')}B`;
  if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(number >= 10_000_000 ? 0 : 1).replace(/\.0$/, '')}M`;
  if (number >= 1_000) return `${(number / 1_000).toFixed(number >= 10_000 ? 0 : 1).replace(/\.0$/, '')}K`;
  return String(Math.round(number));
}

function QuickModal({ type, onClose, onSubmit }) {
  useI18n();
  const labels = {
    competitor: ['Додати конкурента', 'Instagram handle, наприклад @brand.ua', '@'],
    idea: ['Нова ідея', 'Коротко опиши ідею або тему', ''],
    post: ['Новий пост', 'Назва поста або рілса', ''],
  };
  const [title, placeholder, prefix] = labels[type] ?? labels.idea;
  const [value, setValue] = useState(prefix);
  const submit = () => {
    const clean = value.trim();
    if (!clean || clean === '@') return;
    onSubmit(clean);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="quick-modal" onClick={(event) => event.stopPropagation()}>
        <h3>{title}</h3>
        <p>{placeholder}</p>
        <input autoFocus value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && submit()} />
        <div className="modal-actions">
          <button onClick={onClose}>Скасувати</button>
          <button className="dark" onClick={submit}>Додати</button>
        </div>
      </div>
    </div>
  );
}

function ManualReelModal({ onClose, onSubmit, defaultMarket, initialUrl = '' }) {
  const { translateText } = useI18n();
  const [form, setForm] = useState({
    url: initialUrl,
    handle: '@manual.source',
    market: defaultMarket || 'global',
    title: '',
    caption: '',
    transcript: '',
    views: '',
    likes: '',
    comments: '',
  });
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const submit = () => {
    if (!form.title.trim() && !form.caption.trim() && !form.transcript.trim() && !form.url.trim()) return;
    onSubmit(form);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="quick-modal manual-reel-modal" onClick={(event) => event.stopPropagation()}>
        <h3>Додати рілс вручну</h3>
        <p>Для тесту без Instagram встав посилання, caption або транскрипт. Система відкриє рілс у ремікс-студії.</p>
        <div className="manual-reel-grid">
          <label>
            <span>Посилання на Reels</span>
            <input autoFocus value={form.url} onChange={(event) => update('url', event.target.value)} placeholder="https://www.instagram.com/reel/..." />
          </label>
          <label>
            <span>Акаунт / джерело</span>
            <input value={form.handle} onChange={(event) => update('handle', event.target.value)} placeholder="@source" />
          </label>
          <label>
            <span>Ринок</span>
            <select value={form.market} onChange={(event) => update('market', event.target.value)}>
              <option value="ua">Україна</option>
              <option value="us">США</option>
              <option value="eu">Європа</option>
              <option value="global">Global</option>
            </select>
          </label>
          <label>
            <span>Перегляди</span>
            <input value={form.views} onChange={(event) => update('views', event.target.value)} placeholder="218K" />
          </label>
          <label className="wide">
            <span>Назва / хук</span>
            <input value={form.title} onChange={(event) => update('title', event.target.value)} placeholder={translateText('Наприклад: AI workflow з одного фото товару')} />
          </label>
          <label className="wide">
            <span>Caption або короткий опис</span>
            <textarea value={form.caption} onChange={(event) => update('caption', event.target.value)} placeholder={translateText('Що було в рілсі, який перший кадр, яка обіцянка, який CTA...')} />
          </label>
          <label className="wide">
            <span>Транскрипт, якщо є</span>
            <textarea value={form.transcript} onChange={(event) => update('transcript', event.target.value)} placeholder={translateText('Встав сюди текст з відео або свій приблизний переказ.')} />
          </label>
        </div>
        <div className="modal-actions">
          <button onClick={onClose}>Скасувати</button>
          <button className="dark" onClick={submit}>Додати і адаптувати</button>
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <I18nProvider>
    <App />
  </I18nProvider>,
);
