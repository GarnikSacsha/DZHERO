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
  Lightbulb,
  LogOut,
  Menu,
  MessageSquareText,
  Moon,
  MoreHorizontal,
  Pencil,
  Plus,
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
import { fetchProducerSnapshot } from './data/uaMarket';
import { applyInterfaceLanguage } from './i18n';

const rawApiUrl = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
const isBrowser = typeof window !== 'undefined';
const isLocalPage = isBrowser && ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
const isLocalApiUrl = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?/i.test(rawApiUrl);
const API_URL = isLocalApiUrl && !isLocalPage ? '/api' : rawApiUrl;
const API_BASE = API_URL.endsWith('/api') ? API_URL : `${API_URL}/api`;
const AUTH_TOKEN_KEY = 'insta-producer-auth-token';
const WORKSPACE_KEY = 'dzhero-active-workspace';
const PRODUCT_TOUR_KEY = 'jero_tour_completed';
const PRODUCT_TOUR_VERSION = 'v5';
const DEMO_WORKSPACES = [
  { id: 'ws_demo_ua', name: 'Demo Brand', handle: '@demo_brand', type: 'Базовий' },
  { id: 'ws_demo_cafe', name: 'Кафе Central', handle: '@central.cafe', type: 'Кафе' },
  { id: 'ws_demo_shop', name: 'Odessa Drop', handle: '@odessa.drop', type: 'Одяг' },
  { id: 'ws_demo_beauty', name: 'Beauty Room', handle: '@beauty.room', type: 'Beauty' },
  { id: 'ws_demo_expert', name: 'Expert Lab', handle: '@expert.lab', type: 'Експерт' },
];

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
      setDeletionResult({ error: err.message });
      setDeletionStatus('error');
    }
  };
  const pages = {
    privacy: {
      title: 'Privacy Policy',
      subtitle: 'How Dzhero handles Instagram and business data.',
      sections: [
        ['Data we process', 'Dzhero may process account profile data, authorized Instagram content metadata, insights, comments, business brief data, content ideas and AI-generated drafts after the user grants permissions.'],
        ['How we use data', 'Data is used to analyze content performance, generate ideas, prepare scripts, plan posts and help the user manage their Instagram production workflow.'],
        ['API keys', 'Public users are never asked to provide API keys. Product API keys are stored only in backend or deployment environment variables.'],
        ['Retention', 'Demo JSON storage is temporary for MVP testing. Production storage should support deletion, export and retention controls.'],
        ['Contact', 'For privacy requests, contact the Dzhero product owner through the support channel provided in the app.'],
      ],
    },
    terms: {
      title: 'Terms of Service',
      subtitle: 'Rules for using Dzhero.',
      sections: [
        ['Use of service', 'Dzhero helps creators, businesses and SMM teams analyze content signals and prepare drafts. Users remain responsible for what they publish.'],
        ['Instagram requirements', 'Official Instagram access requires a Creator or Business account and permissions approved through Meta where required.'],
        ['AI output', 'AI drafts are suggestions, not final legal, financial or professional advice. Human review is required before publishing or messaging customers.'],
        ['Content ownership', 'Dzhero should adapt content mechanics, not copy third-party videos, audio, branding or protected creative assets.'],
      ],
    },
    dataDeletion: {
      title: 'Data Deletion Instructions',
      subtitle: 'How users can request deletion of Dzhero data.',
      sections: [
        ['Request deletion', 'A user can request deletion of their workspace, connected account data, AI memory and generated drafts by contacting Dzhero support.'],
        ['Instagram disconnect', 'Users can also remove Dzhero permissions from their Meta or Instagram account settings.'],
        ['Processing', 'After a verified deletion request, Dzhero should remove account tokens, workspace records, AI memory, generated drafts and stored sync jobs associated with that user, unless retention is required by law.'],
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
        <small>Meta review document</small>
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

function App() {
  const [page, setPage] = useState(getInitialAppPage);
  const [market, setMarket] = useState('all');
  const [data, setData] = useState(null);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState('');
  const [remixDraft, setRemixDraft] = useState(null);
  const [theme, setTheme] = useState(() => window.localStorage.getItem('insta-producer-theme-v2') || 'dark');
  const [language, setLanguage] = useState(() => window.localStorage.getItem('insta-producer-language') || 'uk');
  const [authToken, setAuthToken] = useState(() => window.localStorage.getItem(AUTH_TOKEN_KEY) || '');
  const [currentUser, setCurrentUser] = useState(null);
  const [authStatus, setAuthStatus] = useState('checking');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [assistantAutoPrompt, setAssistantAutoPrompt] = useState(null);
  const [workspaceId, setWorkspaceId] = useState(() => window.localStorage.getItem(WORKSPACE_KEY) || DEMO_WORKSPACES[0].id);
  const publicPage = getPublicPage();
  const activeWorkspace = DEMO_WORKSPACES.find((workspace) => workspace.id === workspaceId) || DEMO_WORKSPACES[0];

  useEffect(() => {
    let isMounted = true;
    fetchProducerSnapshot().then((snapshot) => {
      if (isMounted) setData(snapshot);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem('insta-producer-theme-v2', theme);
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem('insta-producer-language', language);
  }, [language]);

  useEffect(() => {
    window.localStorage.setItem(WORKSPACE_KEY, workspaceId);
  }, [workspaceId]);

  useEffect(() => {
    const timers = [0, 80, 250].map((delay) => window.setTimeout(() => applyInterfaceLanguage(language), delay));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [language, page, market, data, modal, toast, currentUser, authStatus, theme, remixDraft, workspaceId]);

  useEffect(() => {
    let isMounted = true;
    if (!authToken) {
      setAuthStatus('guest');
      return () => {
        isMounted = false;
      };
    }
    fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('auth_failed');
        return response.json();
      })
      .then((payload) => {
        if (!isMounted) return;
        setCurrentUser(payload.user);
        setAuthStatus('ready');
      })
      .catch(() => {
        if (!isMounted) return;
        window.localStorage.removeItem(AUTH_TOKEN_KEY);
        setAuthToken('');
        setCurrentUser(null);
        setAuthStatus('guest');
      });
    return () => {
      isMounted = false;
    };
  }, [authToken]);

  const filtered = useMemo(() => {
    if (!data) return null;
    if (market === 'all') return data;
    return {
      ...data,
      reels: data.reels.filter((reel) => reel.market === market),
      competitors: data.competitors.filter((competitor) => competitor.market === market),
    };
  }, [data, market]);

  const notify = (message) => {
    setToast(message);
    window.clearTimeout(window.__toastTimer);
    window.__toastTimer = window.setTimeout(() => setToast(''), 2600);
  };

  const handleAuthSuccess = (payload) => {
    window.localStorage.setItem(AUTH_TOKEN_KEY, payload.token);
    setAuthToken(payload.token);
    setCurrentUser(payload.user);
    setAuthStatus('ready');
    notify('Вхід виконано. Можна працювати з продюсером.');
  };

  const handleLogout = async () => {
    if (authToken) {
      fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
      }).catch(() => {});
    }
    window.localStorage.removeItem(AUTH_TOKEN_KEY);
    setAuthToken('');
    setCurrentUser(null);
    setAuthStatus('guest');
    notify('Ви вийшли з акаунта');
  };

  if (publicPage) {
    return <PublicLegalPage page={publicPage} />;
  }

  if (authStatus === 'checking') {
    return <div className="loading-screen">Перевіряємо сесію...</div>;
  }

  if (!currentUser) {
    return (
      <div className="app auth-app" data-theme={theme}>
        <AuthGate key={language} onAuth={handleAuthSuccess} notify={notify} theme={theme} setTheme={setTheme} language={language} setLanguage={setLanguage} />
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
    notify('Імпортуємо Reels і готуємо UA-адаптацію...');
    try {
      const response = await fetch(`${API_BASE}/workspaces/${workspaceId}/reels/import-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: cleanUrl,
          market: market === 'all' ? 'global' : market,
        }),
      });
      if (!response.ok) throw new Error('import_failed');
      const payload = await response.json();
      const importedReel = {
        ...payload.reel,
        handle: payload.reel?.handle || payload.reel?.sourceHandle || '@instagram.reel',
      };
      setData((current) => ({ ...current, reels: [importedReel, ...current.reels.filter((reel) => reel.id !== importedReel.id)] }));
      setRemixDraft(importedReel);
      setPage('remix');
      notify(importedReel.sourceStatus === 'public_metadata'
        ? 'Reels імпортовано: адаптація готова'
        : 'Instagram дав мінімум даних, але базову UA-адаптацію підготовлено');
      return true;
    } catch {
      notify('Автоімпорт не вдався. Відкриваю ручний режим як запасний варіант.');
      setModal({ type: 'reel', url: cleanUrl });
      return false;
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
        setPage={setPage}
        currentUser={currentUser}
        workspaces={DEMO_WORKSPACES}
        activeWorkspace={activeWorkspace}
        language={language}
        onWorkspaceChange={switchWorkspace}
        onLogout={handleLogout}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />
      {isSidebarOpen && <button className="mobile-menu-backdrop" type="button" aria-label="Закрити меню" onClick={() => setIsSidebarOpen(false)} />}
      <main className="shell" key={`shell-${language}`}>
        <Topbar theme={theme} setTheme={setTheme} language={language} setLanguage={setLanguage} setPage={setPage} page={page} onOpenMenu={() => setIsSidebarOpen(true)} onCloseMenu={() => setIsSidebarOpen(false)} />
        {page === 'home' && <HomeDashboard data={data} market={market} notify={notify} onFreshIdea={generateFreshIdea} setPage={setPage} workspaceId={workspaceId} language={language} />}
        {page === 'roadmap' && <ProductRoadmap notify={notify} setPage={setPage} />}
        {page === 'businesses' && <BusinessPlaybooks notify={notify} setPage={setPage} workspaceId={workspaceId} />}
        {page === 'strategy' && <StrategyBrain notify={notify} setPage={setPage} />}
        {page === 'viral' && <ViralBank reels={filtered.reels} market={market} notify={notify} openModal={setModal} onImportUrl={autoImportReelUrl} />}
        {page === 'competitors' && <Competitors competitors={filtered.competitors} openModal={setModal} />}
        {page === 'remix' && <RemixStudio reel={selectedReel} notify={notify} setPage={setPage} />}
        {page === 'ideas' && <IdeasBoard ideas={filterByMarket(data.ideas, market)} openModal={setModal} onToRemix={pushIdeaToRemix} onToPlan={pushIdeaToPlan} />}
        {page === 'assistant' && <CreatorAssistant notify={notify} workspaceId={workspaceId} activeWorkspace={activeWorkspace} autoPrompt={assistantAutoPrompt} onAutoPromptUsed={() => setAssistantAutoPrompt(null)} />}
        {page === 'launches' && <LaunchRoadmap notify={notify} setPage={setPage} workspaceId={workspaceId} />}
        {page === 'plan' && <ContentPlan plans={data.plans} openModal={setModal} notify={notify} />}
        {page === 'sales' && <SalesDirect notify={notify} setPage={setPage} />}
        {page === 'analytics' && <Analytics />}
        {page === 'legal' && <LegalSafe notify={notify} />}
        {page === 'budget' && <BudgetCalculator notify={notify} />}
        {page === 'team' && <TeamHub notify={notify} workspaceId={workspaceId} />}
        {page === 'settings' && <DataSources sources={data.sources} notify={notify} workspaceId={workspaceId} />}
      </main>
      {modal?.type === 'reel' || modal === 'reel'
        ? <ManualReelModal onClose={() => setModal(null)} onSubmit={addManualReel} defaultMarket={market === 'all' ? 'global' : market} initialUrl={typeof modal === 'object' ? modal.url : ''} />
        : modal && <QuickModal type={modal} onClose={() => setModal(null)} onSubmit={{ competitor: addCompetitor, idea: addIdea, post: addPost }[modal]} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function ProductTour({ page, setPage, currentUser, dataReady, language, onOpenSidebar, onCloseSidebar }) {
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

    const commonButtons = (includeBack = true, last = false) => [
      ...(includeBack ? [{
        text: 'Назад',
        classes: 'tour-btn tour-btn-muted',
        action() {
          return this.back();
        },
      }] : [{
        text: 'Пропустить тур',
        classes: 'tour-btn tour-btn-link',
        action() {
          completeTour();
          return this.cancel();
        },
      }]),
      {
        text: last ? 'Завершить тур' : 'Далее ->',
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
        title: 'Шаг 1: Поиск мировых трендов',
        text: 'Здесь ИИ собирает виральные зарубежные Reels и автоматически адаптирует их смыслы под украинский контекст и менталитет. Начни отсюда.',
        buttons: commonButtons(false),
      },
      {
        id: 'script',
        selector: '[data-tour="generate-script-btn"]',
        page: 'assistant',
        attachTo: 'bottom',
        title: 'Шаг 2: Генерация сценария',
        text: 'На основе выбранного тренда ИИ за минуту пропишет цепляющий хук, структуру видео и готовый призыв к действию (CTA) под твою нишу.',
        buttons: commonButtons(true),
      },
      {
        id: 'calendar',
        selector: '[data-tour="sidebar-calendar"]',
        page: null,
        attachTo: 'right',
        title: 'Шаг 3: Календарь и планирование',
        text: 'Готовый сценарий можно в один клик запланировать на любую дату. Система сама сформирует понятную сетку публикаций на неделю вперед.',
        buttons: commonButtons(true),
      },
      {
        id: 'direct',
        selector: '[data-tour="sidebar-direct"]',
        page: null,
        attachTo: 'right',
        title: 'Шаг 4: Автоматизация продаж',
        text: 'Пока ты снимаешь контент, встроенный ИИ-менеджер обрабатывает Директ: распознает намерения клиентов, отвечает на вопросы 24/7 и закрывает их на покупку.',
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

function AuthGate({ onAuth, notify, theme, setTheme, language, setLanguage }) {
  const [error, setError] = useState('');
  const [instagramConfig, setInstagramConfig] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const authCopy = language === 'en'
    ? {
      brandSub: 'AI producer for Ukraine and global trends',
      eyebrow: 'Private workspace',
      headline: 'Sign in through Instagram to connect a Creator or Business account.',
      creator: 'Creator or Business',
      panelTitle: 'Sign in',
      themeTitle: 'Theme',
      instagramLoading: 'Preparing Instagram Login...',
      instagramButton: 'Sign in through Instagram',
      pendingTitle: 'Instagram connection pending',
      pendingText: 'The connection is ready in the interface, but the backend is still waiting for Meta App keys. Users do not enter keys: they simply log in through Instagram after App Review.',
      personalRejected: 'Personal accounts are not supported',
      demoButton: 'Demo access',
    }
    : {
      brandSub: 'AI-продюсер для України і глобальних трендів',
      eyebrow: 'Закритий робочий простір',
      headline: 'Увійди через Instagram, щоб підключити Creator або Business акаунт.',
      creator: 'Creator або Business',
      panelTitle: 'Вхід',
      themeTitle: 'Тема',
      instagramLoading: 'Готуємо Instagram Login...',
      instagramButton: 'Увійти через Instagram',
      pendingTitle: 'Instagram connection pending',
      pendingText: 'Підключення готове в інтерфейсі, але backend ще чекає Meta App keys. Користувачам не треба вводити ключі: вони просто логіняться через Instagram після App Review.',
      personalRejected: 'Personal не підходить',
      demoButton: 'Демо-вхід для перегляду',
    };

  const startInstagramLogin = async () => {
    setError('');
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/auth/instagram/start`);
      const payload = await response.json();
      if (!response.ok) {
        if (payload.error === 'instagram_not_configured') {
          setInstagramConfig(payload);
        }
        throw new Error(payload.error || 'instagram_not_configured');
      }
      window.location.href = payload.authUrl;
    } catch (authError) {
      if (authError.message !== 'instagram_not_configured') {
        setError('Instagram Login ще налаштовується. Для реального підключення потрібні ключі Meta App у backend.');
      }
      notify('Instagram Login готовий у UI, але потрібні ключі Meta App');
    } finally {
      setIsLoading(false);
    }
  };

  const enterDemo = async () => {
    setError('');
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/auth/demo`, { method: 'POST' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'demo_error');
      onAuth(payload);
    } catch (authError) {
      setError('Демо-вхід не спрацював. Перевір підключення до сервера.');
      notify('Сервер не відповідає. Перевір Railway deploy або локальний backend.');
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
          <div className="auth-points">
            <span>Instagram Login</span>
            <span>{authCopy.creator}</span>
            <span>Insights</span>
            <span>AI Direct</span>
          </div>
        </div>
        <form className="auth-panel" onSubmit={(event) => event.preventDefault()}>
          <div className="auth-panel-head">
            <div>
              <small>Instagram Professional Login</small>
              <h2>{authCopy.panelTitle}</h2>
            </div>
            <button className="icon" type="button" title={authCopy.themeTitle} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
          <button className="auth-submit auth-meta-button" type="button" onClick={startInstagramLogin} disabled={isLoading}>
            {isLoading ? authCopy.instagramLoading : authCopy.instagramButton}
          </button>
          {instagramConfig && (
            <div className="instagram-pending">
              <strong>{authCopy.pendingTitle}</strong>
              <p>{authCopy.pendingText}</p>
            </div>
          )}
          {error && <div className="auth-error">{error}</div>}
          <button className="auth-demo" type="button" onClick={enterDemo} disabled={isLoading}>
            {authCopy.demoButton}
          </button>
        </form>
      </section>
    </main>
  );
}

function Sidebar({ page, setPage, currentUser, workspaces, activeWorkspace, onWorkspaceChange, onLogout, isOpen, onClose }) {
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
      <button className="mobile-menu-close" type="button" aria-label="Закрити меню" onClick={onClose}>
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
                <span>{workspace.name}</span>
                <small>{workspace.handle} · {workspace.type}</small>
              </button>
            ))}
            <button type="button" onClick={() => { setPage('settings'); setIsSwitcherOpen(false); }}>
              <span>+ Підключити Instagram</span>
              <small>реальні акаунти додамо через Meta API</small>
            </button>
          </div>
        )}
        <button className="account" type="button" onClick={() => setIsSwitcherOpen((value) => !value)} aria-expanded={isSwitcherOpen}>
          <div className="avatar">{activeWorkspace?.name?.[0]?.toUpperCase() || currentUser?.name?.[0]?.toUpperCase() || 'A'}</div>
          <div>
            <strong>{activeWorkspace?.name || currentUser?.name || 'Адмін'}</strong>
            <span>{activeWorkspace?.handle || currentUser?.email || 'робочий простір'}</span>
          </div>
          <ChevronDown size={14} />
        </button>
        <button className="logout-button" type="button" title="Вийти" onClick={onLogout}>
          <LogOut size={14} />
        </button>
      </div>
    </aside>
  );
}

function CleanSidebar({ page, setPage, currentUser, workspaces, activeWorkspace, language, onWorkspaceChange, onLogout, isOpen, onClose }) {
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);
  const [isToolsOpen, setIsToolsOpen] = useState(false);
  const tourTargets = {
    home: 'sidebar-home',
    businesses: 'sidebar-businesses',
    strategy: 'sidebar-strategy',
    viral: 'sidebar-transcript',
    competitors: 'sidebar-competitors',
    remix: 'sidebar-remix',
    ideas: 'sidebar-ideas',
    assistant: 'sidebar-assistant',
    plan: 'sidebar-calendar',
    sales: 'sidebar-direct',
    team: 'sidebar-team',
    tools: 'sidebar-tools',
    launches: 'sidebar-launches',
    analytics: 'sidebar-analytics',
    legal: 'sidebar-legal',
    budget: 'sidebar-budget',
  };
  const labels = language === 'en'
    ? {
      home: 'Home',
      businesses: 'Businesses',
      strategy: 'Strategy',
      viral: 'Trend analytics',
      competitors: 'Competitors',
      remix: 'Remix studio',
      ideas: 'Ideas',
      assistant: 'Assistant',
      plan: 'Content plan',
      sales: 'Sales',
      team: 'Team',
      tools: 'More / Tools',
      launches: 'Launches',
      analytics: 'Analytics',
      legal: 'Legal safe',
      budget: 'Budget',
      settings: 'Settings',
    }
    : {
      home: 'Головна',
      businesses: 'Бізнеси',
      strategy: 'Стратегія',
      viral: 'Аналітика трендів',
      competitors: 'Конкуренти',
      remix: 'Ремікс-студія',
      ideas: 'Ідеї',
      assistant: 'Асистент',
      plan: 'Контент-план',
      sales: 'Продажі',
      team: 'Команда',
      tools: 'Ще / Інструменти',
      launches: 'Запуски',
      analytics: 'Аналітика',
      legal: 'Юридичний сейф',
      budget: 'Бюджет',
      settings: 'Налаштування',
    };
  const primaryItems = [
    ['home', Home],
    ['businesses', BriefcaseBusiness],
    ['strategy', Target],
    ['viral', Flame],
    ['competitors', Database],
    ['remix', Wand2],
    ['ideas', Lightbulb],
    ['assistant', Bot],
    ['plan', CalendarDays],
    ['sales', ShoppingBag],
    ['team', UsersRound],
  ];
  const toolItems = [
    ['launches', Rocket],
    ['analytics', BarChart3],
    ['legal', ShieldCheck],
    ['budget', Calculator],
  ];
  const isToolPage = toolItems.some(([id]) => id === page);
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
        <div className={isToolsOpen ? 'nav-tools open' : 'nav-tools'}>
          <button
            className={isToolPage ? 'active nav-tools-toggle' : 'nav-tools-toggle'}
            data-tour={tourTargets.tools}
            type="button"
            onClick={() => setIsToolsOpen((value) => !value)}
            aria-expanded={isToolsOpen}
          >
            <MoreHorizontal size={16} />
            <span className="nav-label">{labels.tools}</span>
            <ChevronDown className="nav-tools-chevron" size={14} />
          </button>
          {isToolsOpen && (
            <div className="nav-tools-menu">
              {toolItems.map(renderNavButton)}
            </div>
          )}
        </div>
      </nav>
      <div className="account-switcher compact">
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
                <span>{workspace.name}</span>
                <small>{workspace.handle} · {workspace.type}</small>
              </button>
            ))}
            <button type="button" onClick={() => { selectPage('settings'); setIsSwitcherOpen(false); }}>
              <span>{language === 'en' ? '+ Connect Instagram' : '+ Підключити Instagram'}</span>
              <small>{language === 'en' ? 'Real accounts through Meta API' : 'Реальні акаунти через Meta API'}</small>
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
        <button className="account" type="button" onClick={() => setIsSwitcherOpen((value) => !value)} aria-expanded={isSwitcherOpen}>
          <div className="avatar">{activeWorkspace?.name?.[0]?.toUpperCase() || currentUser?.name?.[0]?.toUpperCase() || 'A'}</div>
          <div>
            <strong>{activeWorkspace?.name || currentUser?.name || 'Admin'}</strong>
            <span>{activeWorkspace?.handle || currentUser?.email || 'workspace'}</span>
          </div>
          <ChevronDown size={14} />
        </button>
        <button className="logout-button" type="button" title={language === 'en' ? 'Log out' : 'Вийти'} onClick={onLogout}>
          <LogOut size={14} />
        </button>
      </div>
    </aside>
  );
}

function Topbar({ theme, setTheme, language, setLanguage, setPage, page, onOpenMenu, onCloseMenu }) {
  const ctaLabel = page === 'settings'
    ? (language === 'en' ? 'Back to hub' : 'До хабу')
    : (language === 'en' ? 'Generate ideas' : 'Зібрати ідеї');
  const ctaTarget = page === 'settings' ? 'home' : 'assistant';

  return (
    <header className="topbar">
      <div className="topbar-title">
        <button className="mobile-menu-trigger" type="button" aria-label="Відкрити меню" onClick={onOpenMenu}>
          <Menu size={18} />
        </button>
      </div>
      <div className="top-actions">
        <button className="topbar-quick-action" type="button" onClick={() => { onCloseMenu?.(); setPage(ctaTarget); }}>
          <Sparkles size={15} />
          <span>{ctaLabel}</span>
        </button>
        <button className={page === 'settings' ? 'icon active' : 'icon'} data-tour="topbar-settings" title={language === 'en' ? 'Settings' : 'Налаштування'} onClick={() => { onCloseMenu?.(); setPage('settings'); }}><Settings size={16} /></button>
        <button className="icon" title="Тема" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}</button>
      </div>
    </header>
  );
}

function MarketFilter({ segments, market, setMarket }) {
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

function HomeDashboard({ data, market, notify, onFreshIdea, setPage, workspaceId }) {
  const topReel = data.reels[0];
  const activeMarket = data.marketSegments.find((segment) => segment.id === market);
  const [onboarding, setOnboarding] = useState({
    instagramConnected: false,
    brandReady: false,
  });

  useEffect(() => {
    let isMounted = true;
    Promise.all([
      fetch(`${API_BASE}/auth/meta/status?workspaceId=${workspaceId}`).then((response) => (response.ok ? response.json() : null)).catch(() => null),
      fetch(`${API_BASE}/workspaces/${workspaceId}/agent/context`).then((response) => (response.ok ? response.json() : null)).catch(() => null),
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
    ['01', 'Підключити Instagram', 'Meta Login, права доступу, профіль бізнесу.', onboarding.instagramConnected, 'settings'],
    ['02', 'Навчити бренд', 'Ніша, Tone of Voice, місто, продукти, цілі.', onboarding.brandReady, 'assistant'],
    ['03', 'Зібрати сигнали', 'Рілси, конкуренти, коментарі, тренди та ідеї.', data.reels.length > 0 && data.competitors.length > 0, 'viral'],
    ['04', 'Випустити batch', 'План на тиждень, сторіс, рілси, Direct-відповіді.', data.plans.length > 0, 'plan'],
  ];

  return (
    <section className="page page-home">
      <PageTitle
        title="Головна"
        subtitle="Операційний центр Instagram-продюсера: глобальний scouting і адаптація ідей під українську аудиторію."
      />
      <div className="home-grid">
        <article className="home-hero">
          <small>Поточний фокус</small>
          <h2>{activeMarket?.label ?? 'Усі ринки'} → український сценарій</h2>
          <button className="dark home-primary-cta" onClick={onFreshIdea}><Sparkles size={18} />Зібрати ідеї на тиждень</button>
        </article>
        <div className="home-stats">
          {[
            ['Ринки', '4', 'UA, США, Європа, Global'],
            ['Конкуренти', data.competitors.length, 'у базі для scouting'],
            ['Рілси', data.reels.length, 'відібрано для аналізу'],
            ['У плані', data.plans.length, 'готові ідеї контенту'],
          ].map(([label, value, note]) => (
            <article key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
              <small>{note}</small>
            </article>
          ))}
        </div>
      </div>
      {!onboarding.instagramConnected && (
        <div className="ops-strip">
          {onboardingSteps.map(([step, title, text, done, target]) => (
            <article className={done ? 'completed' : ''} key={step} onClick={() => { setPage(target); notify(done ? `${title}: виконано` : `${title}: відкрив наступний крок`); }}>
              <span className="step-progress">{done ? '✓' : step}</span>
              <strong>{title}</strong>
              <p>{text}</p>
            </article>
          ))}
        </div>
      )}
      <div className="home-columns">
        <article className="insight-card">
          <small>Пріоритетний сигнал</small>
          <h3>{topReel.title}</h3>
          <p>{marketLabel(topReel.market)} · {topReel.handle} · скор {topReel.score} · {topReel.views} переглядів</p>
        </article>
        <article className="insight-card">
          <small>Що робимо далі</small>
          <ul className="task-list">
            <li>Додати 20-30 релевантних акаунтів з США та Європи.</li>
            <li>Позначити, які механіки можна адаптувати під український бізнес.</li>
            <li>Зібрати batch з 7 українських сценаріїв на тиждень.</li>
          </ul>
        </article>
      </div>
    </section>
  );
}

function ProductRoadmap({ notify, setPage }) {
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
        title="MVP / ТЗ"
        subtitle="Робоча карта продукту: що будуємо першим, які дані потрібні, як виглядає backend і як показувати demo-flow."
        actions={<button className="dark" onClick={() => { setPage('settings'); notify('MVP scope зафіксовано. Відкрив налаштування продукту.'); }}><ClipboardList size={16} />Зафіксувати MVP</button>}
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

function ViralBank({ reels, market, notify, openModal, onImportUrl }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('score');
  const [scoreSortDirection, setScoreSortDirection] = useState('desc');
  const [tab, setTab] = useState('all');
  const [previewReel, setPreviewReel] = useState(null);
  const [isImportingUrl, setIsImportingUrl] = useState(false);
  const pastedReelUrl = /instagram\.com\/(reel|reels|p)\//i.test(query.trim()) ? query.trim() : '';
  const filteredReels = reels
    .filter((reel) => pastedReelUrl ? true : `${reel.title} ${reel.handle} ${reel.status.join(' ')}`.toLowerCase().includes(query.toLowerCase()))
    .filter((reel) => tab === 'all' || (tab === 'review' ? reel.status.some((status) => status.includes('розбір') || status.includes('огляд')) : reel.status.some((status) => status.toLowerCase().includes(tab))))
    .sort((a, b) => {
      if (sort === 'views') return parseMetric(b.views) - parseMetric(a.views);
      return scoreSortDirection === 'asc' ? a.score - b.score : b.score - a.score;
    });
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
      reel.status.join('; '),
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'dzhero-reels.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    notify('CSV експорт завантажено');
  };

  return (
    <section className="page">
      <PageTitle
        title="Банк віральних рілсів"
        subtitle="Скаутимо Україну, США, Європу та global-ніші, але адаптуємо ідеї під українську аудиторію."
        actions={<><button onClick={exportCsv}><Download size={16} />Експорт</button><button onClick={() => setTab('review')}><Filter size={16} />Фільтри</button><button className="dark" onClick={() => openModal('reel')}><Plus size={16} />Додати рілс вручну</button></>}
      />
      <div className="search-row">
        <label><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && pastedReelUrl && importPastedReel()} placeholder="Пошук або встав Reels-посилання..." /></label>
        <select value={market} readOnly><option>{market === 'all' ? 'Усі ринки' : 'Обраний ринок'}</option></select>
        <select value={sort} onChange={(event) => setSort(event.target.value)}><option value="score">За скором</option><option value="views">За переглядами</option></select>
      </div>
      {pastedReelUrl && (
        <div className="reel-link-import">
          <div>
            <strong>Знайшов Reels-посилання</strong>
            <span>Джеро спробує сам витягнути публічні дані з Instagram і одразу підготує UA-адаптацію. Якщо Instagram нічого не віддасть, відкриється запасний ручний режим.</span>
          </div>
          <button className="dark" type="button" onClick={importPastedReel} disabled={isImportingUrl}>
            <Wand2 size={16} />{isImportingUrl ? 'Адаптуємо...' : 'Адаптувати автоматично'}
          </button>
        </div>
      )}
      <Tabs active={tab} onChange={setTab} items={[['all', `Для тебе ${filteredReels.length}`], ['trend', 'Тренди'], ['кейс', 'Кейси'], ['адапт', 'Адаптації'], ['review', 'Потрібен огляд']]} />
      <div className="trends-table-wrap">
        <ReelsTable reels={filteredReels} scoreSortDirection={scoreSortDirection} onToggleScoreSort={toggleScoreSort} onOpenPreview={setPreviewReel} />
      </div>
      {previewReel && (
        <div className="video-preview-backdrop" onClick={() => setPreviewReel(null)}>
          <article className="video-preview-modal" onClick={(event) => event.stopPropagation()}>
            <button className="icon video-preview-close" type="button" onClick={() => setPreviewReel(null)} aria-label="Закрити прев'ю">
              <X size={16} />
            </button>
            <div className={`video-preview-frame market-${previewReel.market}`}>
              <span className="video-preview-play" aria-hidden="true" />
              <strong>{previewReel.handle}</strong>
            </div>
            <div>
              <small>{marketLabel(previewReel.market)} · {previewReel.views} переглядів</small>
              <h3>{previewReel.title}</h3>
              <p>Прев'ю рілса для швидкого відбору. Оригінальний пост відкриємо після підключення Instagram-джерела.</p>
            </div>
            <button className="dark" type="button" onClick={() => notify('Оригінальний пост буде доступний після підключення Instagram джерела')}>Відкрити оригінал</button>
          </article>
        </div>
      )}
    </section>
  );
}

function BusinessPlaybooks({ notify, setPage, workspaceId }) {
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
    fetch(`${API_BASE}/workspaces/${workspaceId}/agent/context`)
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
      const response = await fetch(`${API_BASE}/workspaces/${workspaceId}/agent/context`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessType: title,
          contentFocus: focus || selectedFocus || tags[0],
          contentRubrics: tags,
        }),
      });
      if (!response.ok) throw new Error('save_failed');
      setSaveStatus('saved');
      notify(`Playbook "${title}" збережено в Brand Brain`);
      window.setTimeout(() => {
        setSaveStatus('idle');
        setPage('assistant');
      }, 450);
    } catch {
      setSaveStatus('error');
      notify('Не вдалося зберегти playbook. Перевір backend.');
    }
  };

  return (
    <section className="page page-businesses">
      <PageTitle
        title="Бізнеси"
        actions={<button className="dark" onClick={() => { selectedPlaybook ? setPage('assistant') : setPage('settings'); notify(selectedPlaybook ? 'Відкрив Асистента з обраним playbook' : 'Відкрив профіль бізнесу для вибору ніші'); }}><BriefcaseBusiness size={16} />{selectedPlaybook ? 'До Асистента' : 'Обрати тип бізнесу'}</button>}
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
  const pillars = [
    ['Візуальний аудит', 'Профіль виглядає як експертний, але бракує повторюваної системи обкладинок і кольорової дисципліни.', '72%'],
    ['Профіль ЦА', 'Власники малого бізнесу, експерти, консультанти й команди, яким потрібен контент без великого продакшну.', 'готово'],
    ['Позиціонування', 'Платформа, яка перетворює глобальні тренди на українські сценарії, запуски й продажі.', 'draft'],
  ];
  const voice = ['прямо', 'без інфоциганства', 'практично', 'українською', 'з доказами'];
  const frameworkItems = [
    ['Болі аудиторії', ['нестача системного контенту', 'низька конверсія з охоплення', 'немає стабільного позиціонування']],
    ['Контент-рубрики', ['експертні розбори', 'кейси клієнтів', 'порівняння підходів']],
    ['Офер', ['цінність продукту', 'умови входу', 'ключовий CTA']],
    ['Довіра', ['соціальний доказ', 'процес роботи', 'публічні результати']],
    ['Продажі', ['lead magnet', 'Direct-сценарій', 'кваліфікація заявки']],
    ['Заперечення', ['ціна', 'час', 'ризики впровадження']],
  ];

  return (
    <section className="page page-strategy">
      <PageTitle
        title="Аудит та позиціонування"
        subtitle="Заміна ручного стратегічного аналізу: аудит профілю, ЦА, позиціонування, Tone of Voice і контент-рубрики."
        actions={<button className="dark" onClick={() => { setPage('assistant'); notify('Відкрив Асистента для формування позиціонування'); }}><Sparkles size={16} />Сформувати позиціонування</button>}
      />
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
        {frameworkItems.map(([item, rows]) => (
          <article className="framework-card" key={item}>
            <strong>{item}</strong>
            <ul className="data-list">
              {rows.map((row) => <li key={row}>{row}</li>)}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}

function compactStatusLabel(status) {
  const normalized = String(status || '').toLowerCase();
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
  return String(status || '').slice(0, 12);
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
  const initialItems = useMemo(() => initialLabels.map((label, index) => ({
    id: `${scope}_${index + 1}`,
    label,
    checked: false,
  })), [scope, initialLabels]);
  const [items, setItems] = useState(initialItems);

  useEffect(() => {
    let isMounted = true;
    fetch(`${API_BASE}/workspaces/${workspaceId}/checklists/${scope}`)
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
    const response = await fetch(`${API_BASE}/workspaces/${workspaceId}/checklists/${scope}`, {
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
      saveItems(nextItems).catch((err) => notify?.(`Чеклист не збережено: ${err.message}`));
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

function ReelsTable({ reels, scoreSortDirection, onToggleScoreSort, onOpenPreview }) {
  return (
    <div className="table-card">
      <div className="table-head reels-grid">
        <span>Рілс</span><span>Конкурент</span><button className="score-sort-button" type="button" onClick={onToggleScoreSort}>Скор <span>{scoreSortDirection === 'desc' ? '↓' : '↑'}</span></button><span>Перегляди</span><span>Лайки</span><span>Ком.</span><span>Статус</span>
      </div>
      {reels.map((reel) => (
        <div className="reel-row reels-grid" key={`${reel.handle}-${reel.title}`}>
          <div className="reel-info">
            <button className={`thumb market-${reel.market}`} type="button" onClick={() => onOpenPreview(reel)} aria-label={`Відкрити прев'ю ${reel.title}`}>
              <span>{reel.views}</span>
              <i className="thumb-play" aria-hidden="true" />
            </button>
            <div><strong>{reel.title}</strong><small>{marketLabel(reel.market)} · 52с · 06 тра 13:42</small></div>
          </div>
          <div className="handle"><b>{reel.tag}</b><span>{reel.handle}</span><small>Instagram</small></div>
          <Score value={reel.score} />
          <strong>{reel.views}</strong>
          <span>{reel.likes}</span>
          <span>{reel.comments}</span>
          <div className="status-list status-badges">{reel.status.map((s) => <em title={s} key={s}>{compactStatusLabel(s)}</em>)}</div>
        </div>
      ))}
    </div>
  );
}

function Competitors({ competitors, openModal }) {
  const [query, setQuery] = useState('');
  const filteredCompetitors = competitors.filter((row) => `${row.handle} ${row.niche} ${row.status}`.toLowerCase().includes(query.toLowerCase()));

  return (
    <section className="page">
      <PageTitle title="База конкурентів" subtitle="Глобальний список акаунтів для аналізу: Україна, США, Європа та англомовний global." actions={<button className="dark" onClick={() => openModal('competitor')}><Plus size={16} />Додати конкурента</button>} />
      <div className="table-card">
        <div className="search-row inside"><label><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Пошук конкурентів..." /></label><span>{filteredCompetitors.length} акаунтів у вибірці</span></div>
        <div className="table-head comp-grid"><span>Конкурент</span><span>Ніша</span><span>Рілсів</span><span>Останні хіти</span><span>Ср. скор</span><span>Найкращий охоп</span><span>Статус</span></div>
        {filteredCompetitors.map((row) => (
          <div className="comp-row comp-grid" key={row.handle}>
            <div className="handle competitor-handle">
              <b>{row.handle[1].toUpperCase()}</b>
              <a href={`https://instagram.com/${row.handle.slice(1)}`} target="_blank" rel="noreferrer">{row.handle}</a>
              <small>{getCompetitorMeta(row)}</small>
            </div>
            <span className="niche-text">{row.niche}</span>
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

function buildRemixScenario(reel) {
  if (reel.remixResult?.remixes?.length) {
    const firstRemix = reel.remixResult.remixes[0];
    const script = (firstRemix.visualFlow || []).map((step) => ({
      time: step.timeframe || '',
      frame: step.actionDescription || 'Кадр для зйомки',
      voice: [step.onScreenText, step.audioVoiceover].filter(Boolean).join(' — '),
    }));
    return {
      quality: reel.sourceStatus === 'public_metadata'
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

  const sourceText = [reel.caption, reel.transcript, reel.angle, reel.title].filter(Boolean).join(' ').trim();
  const hasSourceText = sourceText.length > 80;
  const cleanTitle = (reel.title || 'Рілс для адаптації').replace('...', '').trim();
  const sourceSentences = sourceText
    .split(/[.!?\n]+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 14)
    .slice(0, 4);
  const coreSignal = sourceSentences[0] || cleanTitle;
  const proofSignal = sourceSentences[1] || 'покажи реальний приклад, цифру або міні-кейс';
  const frictionSignal = sourceSentences[2] || 'зніми заперечення: дорого, складно, немає часу або команди';
  const cta = 'Напиши "ХОЧУ" в Direct або залиш коментар, і я надішлю шаблон під твою нішу.';

  return {
    quality: hasSourceText ? 'Є достатньо контексту для першого сценарію' : 'Потрібен caption або транскрипт, щоб сценарій став точнішим',
    insight: hasSourceText
      ? `Головна механіка: ${coreSignal}. Її треба перенести не дослівно, а через український біль, доказ і простий CTA.`
      : 'Зараз є тільки загальна ідея/посилання, тому Джеро може зібрати структуру, але для сильного сценарію треба додати, що саме відбувається у відео.',
    checklist: [
      'Перший кадр: чіткий біль або несподіване твердження за 1-2 секунди.',
      'Середина: 2-3 кадри з доказом, процесом або помилкою, яку глядач впізнає.',
      'Фінал: локальний CTA без абстрактного "підписуйся" - коментар, Direct, чеклист, консультація.',
    ],
    script: [
      {
        time: '0-2 c',
        frame: 'Крупний план / екран з проблемою',
        voice: `Хук: "${coreSignal.length > 90 ? coreSignal.slice(0, 90) + '...' : coreSignal}"`,
      },
      {
        time: '2-6 c',
        frame: 'Покажи контраст "як роблять зараз" vs "як треба"',
        voice: `Пояснення: ${proofSignal}. Дай один конкретний приклад з українського бізнесу.`,
      },
      {
        time: '6-11 c',
        frame: '3 швидкі кроки / чеклист на екрані',
        voice: `Структура: проблема -> рішення -> доказ. ${frictionSignal}.`,
      },
      {
        time: '11-15 c',
        frame: 'Результат, скрін, відгук або короткий підсумок',
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

function RemixStudio({ reel, notify, setPage }) {
  const [adaptationState, setAdaptationState] = useState('idle');
  const reelHandle = reel.handle || reel.sourceHandle || '@instagram.reel';
  const scenario = buildRemixScenario(reel);
  const scenarioVariants = scenario.variants;
  const adaptScenario = () => {
    setAdaptationState('loading');
    notify('Адаптація сценарію запущена');
    window.setTimeout(() => {
      setAdaptationState('ready');
      notify('Підготовлено 3 варіанти адаптації');
    }, 1200);
  };
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
        notify('Сценарій скопійовано!');
        return;
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(scenarioText);
        notify('Сценарій скопійовано!');
        return;
      }
      notify('Сценарій скопійовано!');
    } catch {
      notify('Сценарій скопійовано!');
    }
  };

  return (
    <section className="page">
      <PageTitle title="Рілс → транскрипт → UA-адаптація" subtitle={`${reelHandle} · ${marketLabel(reel.market)} · 06 травня 2026, 13:42`} actions={<><button onClick={() => { setPage('settings'); notify('Відкрив інтеграції для підключення Instagram'); }} >Instagram</button><button className="dark" onClick={adaptScenario}><Sparkles size={16} />Адаптувати сценарій</button></>} />
      <div className="remix-layout">
        <div className="remix-side-panel">
          <div className="phone-card">
            <div className="phone-head"><b>{reelHandle.replace(/^@/, '')}</b><span>⋮</span></div>
            <div className={`phone-video market-${reel.market}`}><button onClick={() => notify('Превʼю відео буде доступне після підключення медіа')}>▶</button><strong>GLOBAL<br />TO UA</strong></div>
            <div className="phone-stats"><span>{reel.views}<br /><small>Перегл.</small></span><span>{reel.likes}<br /><small>Лайки</small></span><span>{reel.comments}<br /><small>Ком.</small></span><span>{reel.score}<br /><small>Скор</small></span></div>
          </div>
          <div className="gate-card">
            <h3>Детектор ринку <span>{marketLabel(reel.market)}</span></h3>
            <p>Джерела модеруються перед потраплянням в аналіз</p>
            <h3>Quality gate <Badge>Проходить gate</Badge></h3>
            <p>Механіку можна адаптувати для української аудиторії</p>
          </div>
        </div>
        <div className="analysis-stack">
          <div className="insight-card hero-card">
            <div className="chips"><span>Є сигнал</span><span>ринок: {marketLabel(reel.market)}</span><span>адаптація: UA</span></div>
            <small>Про що рілс</small>
            <h2 className="remix-idea-title">{reel.title.replace('...', '')}</h2>
            <p>{scenario.insight}</p>
          </div>
          <div className="insight-card">
            <small>Якість вхідних даних</small>
            <h3>{scenario.quality}</h3>
            <p>{reel.transcript || reel.caption || 'Щоб отримати не загальний, а точний сценарій, встав сюди транскрипт, caption або короткий переказ: що у першому кадрі, яка обіцянка, який доказ і чим закінчується відео.'}</p>
          </div>
          <div className="remix-bottom">
            <div className="insight-card">
              <small>Сценарій для зйомки</small>
              <h3>Готова структура на 15 секунд</h3>
              <div className="remix-script-timeline">
                {scenario.script.map((step) => (
                  <article key={step.time}>
                    <span>{step.time}</span>
                    <strong>{step.frame}</strong>
                    <p>{step.voice}</p>
                  </article>
                ))}
              </div>
              <div className="remix-checklist">
                {scenario.checklist.map((item) => <span key={item}>{item}</span>)}
              </div>
            </div>
            <div className="insight-card empty remix-script-ready-card">
              {adaptationState === 'ready' && (
                <button className="remix-copy-button" type="button" onClick={copyScenario} aria-label="Copy to Clipboard">
                  <Copy size={15} />
                </button>
              )}
              <h3>3 UA-ремікси</h3>
              {adaptationState === 'idle' && (
                <button className="remix-empty-cta" type="button" onClick={adaptScenario}>
                  <Sparkles size={16} />Згенерувати перший ремікс
                </button>
              )}
              {adaptationState === 'loading' && (
                <div className="remix-skeleton-list" aria-label="Підготовка сценаріїв">
                  {[1, 2, 3].map((item) => (
                    <div className="remix-skeleton-card" key={item}>
                      <span />
                      <em />
                      <em />
                    </div>
                  ))}
                </div>
              )}
              {adaptationState === 'ready' && (
                <div className="remix-variant-list">
                  {scenarioVariants.map((variant) => (
                    <article className="remix-variant-card" key={variant.title}>
                      <strong>{variant.title}</strong>
                      <p>{variant.hook}</p>
                      <ol>
                        {variant.structure.map((item) => <li key={item}>{item}</li>)}
                      </ol>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function IdeasBoard({ ideas, openModal, onToRemix, onToPlan }) {
  const [status, setStatus] = useState('all');
  const visibleIdeas = ideas.filter((idea) => status === 'all' || idea.status === status);

  return (
    <section className="page">
      <PageTitle
        title="Ідеї"
        subtitle="Чернетки, які народилися з глобальних рілсів і мають бути адаптовані під український контекст."
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
                <Score value={idea.score} compact />
              </div>
              <h3>{idea.title}</h3>
              <p>{idea.angle}</p>
              <div className="idea-hook">
                <small>Хук</small>
                <strong>{idea.hook}</strong>
              </div>
              <div className="idea-meta">
                <span>{idea.source}</span>
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

function AgentPipeline({ workspaceId }) {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    let isMounted = true;
    fetch(`${API_BASE}/workspaces/${workspaceId}/ai/status`)
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
  const steps = [
    ['01', 'Instagram data', providers.instagram?.status || 'configuration_required', 'Reels, captions, insights and comments arrive only after Meta permissions.'],
    ['02', 'Reel understanding', providers.textAgent?.status || 'fallback_mode', 'The agent scores hooks, topic, audience fit, copy risk and UA adaptation potential.'],
    ['03', 'Script engine', providers.textAgent?.provider || 'fallback', 'Ideas become Ukrainian scripts, shot lists, captions and Direct CTA.'],
    ['04', 'Video job', providers.videoGeneration?.status || 'queued_for_later', 'A future video provider receives approved scenes only after human review.'],
  ];
  return (
    <div className="agent-pipeline">
      <div className="agent-pipeline-head">
        <div>
          <small>AI Producer Pipeline</small>
          <h3>Reels to analysis to script to video task</h3>
          <p>Meta will bring the real Instagram data. The agent layer is already shaped to process it without asking public users for API keys.</p>
        </div>
        <div className="agent-status-cards">
          <span>{providers.instagram?.configured ? 'Instagram ready' : 'Meta keys pending'}</span>
          <span>{providers.textAgent?.provider === 'fallback' ? 'Fallback text agent' : `${providers.textAgent?.provider || 'agent'} ready`}</span>
          <span>{providers.videoGeneration?.configured ? 'Video ready' : 'Video API later'}</span>
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

function BrandBrain({ notify, workspaceId }) {
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

  useEffect(() => {
    let isMounted = true;
    fetch(`${API_BASE}/workspaces/${workspaceId}/agent/context`)
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (!isMounted || !payload?.brief) return;
        setBrief((current) => ({
          ...current,
          ...payload.brief,
          stopTopics: Array.isArray(payload.brief.stopTopics) ? payload.brief.stopTopics.join(', ') : payload.brief.stopTopics || '',
        }));
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
      const response = await fetch(`${API_BASE}/workspaces/${workspaceId}/agent/context`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error('save_failed');
      setStatus('saved');
      notify?.('Brand Brain збережено. Асистент уже використовує цей контекст.');
      window.setTimeout(() => setStatus('ready'), 1800);
    } catch {
      setStatus('error');
      notify?.('Не вдалося зберегти Brand Brain. Перевір backend.');
    }
  };

  const fields = [
    ['businessType', 'Ніша', 'Магазин одягу, кафе, салон краси, фітнес-студія', 'Що це за бізнес простими словами. Наприклад: “кавʼярня в Києві”, “магазин жіночого одягу”, “експерт з таргету”.'],
    ['product', 'Продукт', 'сукні, ланчі, манікюр, консультації, курс, абонемент', 'Що саме продаєте. Не “якість і сервіс”, а конкретно: товар, послуга, курс, запис, консультація.'],
    ['audience', 'ЦА', 'дівчата 20-35, власники малого бізнесу, мами, підприємці', 'Кому продаєте. Хто ця людина, що їй болить і чому вона має купити саме зараз.'],
    ['location', 'Ринок', 'Україна, Київ, Львів, онлайн, Європа', 'Де працює бізнес: місто, країна або “онлайн”. Це допомагає не радити чужі тренди не в тему.'],
    ['toneOfVoice', 'Tone of Voice', 'простими словами, дружньо, експертно, без пафосу', 'Як бренд має звучати: спокійно, смішно, преміально, по-дружньому, жорстко, експертно.'],
    ['offer', 'Офер', 'запис на манікюр зі знижкою 15%, консультація, дроп нової колекції', 'Головна пропозиція для клієнта. Що він отримує і чому це вигідно.'],
    ['cta', 'CTA', 'написати в Direct “хочу”, забронювати, перейти за лінком', 'Що людина має зробити після контенту: написати, купити, записатися, залишити заявку.'],
    ['stopTopics', 'Стоп-теми', 'не обіцяти гарантований заробіток, не копіювати конкурентів', 'Що не можна писати або обіцяти. Через кому: заборонені теми, ризикові фрази, табу бренду.'],
    ['proof', 'Докази', 'відгуки, кейси, цифри, фото до/після, 5 років досвіду', 'Чим доводимо, що вам можна вірити: кейси, цифри, відгуки, фото, результати клієнтів.'],
  ];

  return (
    <section className="brand-brain">
      <div className="brand-brain-head">
        <div>
          <small>Brand Brain</small>
          <h3>Памʼять агента про бізнес</h3>
          <p>Це контекст, який Асистент отримує перед відповіддю: що продаємо, кому, яким тоном, що не можна обіцяти і який CTA вести.</p>
        </div>
        <button className="dark" type="button" onClick={saveBrief} disabled={status === 'saving'}>
          <Database size={16} />{status === 'saving' ? 'Зберігаю...' : 'Зберегти памʼять'}
        </button>
      </div>
      <div className="brand-help">
        <strong>Як заповнювати</strong>
        <p>Пиши як людині, не як маркетологу. Одне поле = одна проста відповідь. Якщо не знаєш точно, напиши приблизно: асистент все одно використає це як напрямок.</p>
        <div>
          <span>Добре: “салон манікюру у Львові, записи через Direct”</span>
          <span>Погано: “якісний сервіс для всіх”</span>
        </div>
      </div>
      <div className="brand-brain-grid">
        {fields.map(([field, label, placeholder, help]) => (
          <label className={field === 'proof' || field === 'stopTopics' ? 'brand-field wide' : 'brand-field'} key={field}>
            <span>{label}</span>
            <textarea
              value={brief[field] || ''}
              onChange={(event) => updateField(field, event.target.value)}
              placeholder={placeholder}
              rows={field === 'proof' || field === 'stopTopics' ? 3 : 2}
            />
            <small>{help}</small>
          </label>
        ))}
      </div>
    </section>
  );
}

function VideoTaskQueue({ notify, workspaceId }) {
  const [jobs, setJobs] = useState([]);
  const [status, setStatus] = useState('loading');

  const loadJobs = async () => {
    setStatus('loading');
    try {
      const response = await fetch(`${API_BASE}/workspaces/${workspaceId}/video-jobs`);
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
      const response = await fetch(`${API_BASE}/workspaces/${workspaceId}/video-jobs`, {
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
      notify('Video task додано в чергу.');
    } catch (err) {
      setStatus('error');
      notify(`Не вдалося створити video task: ${err.message}`);
    }
  };

  return (
    <section className="video-queue">
      <div className="video-queue-head">
        <div>
          <small>Video generation queue</small>
          <h3>Задачі на відео після сценарію</h3>
          <p>Тут видно, куди потрапляє результат агента. Реальна генерація буде ввімкнена після підключення video provider API, а поки задача зберігає prompt, сцени, CTA і статус approval.</p>
        </div>
        <button className="dark" type="button" onClick={createDemoJob} disabled={status === 'saving'}>
          <Rocket size={16} />{status === 'saving' ? 'Створюю...' : 'Додати test task'}
        </button>
      </div>
      <div className="video-job-grid">
        {(jobs.length ? jobs : [{
          id: 'empty-video-job',
          status: 'configuration_required',
          provider: 'not_configured',
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
            <h4>{job.prompt?.title || 'Untitled video task'}</h4>
            <p>{job.prompt?.caption || 'Prompt буде збережено тут після створення задачі.'}</p>
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

function CreatorAssistant({ notify, workspaceId, activeWorkspace, autoPrompt, onAutoPromptUsed }) {
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
    .map((block, index) => <p key={`${block.slice(0, 24)}-${index}`}>{block}</p>);

  const sendMessage = async (text = input) => {
    const clean = text.trim();
    if (!clean || isThinking) return;
    const history = messages.map(([role, messageText]) => ({
      role: role === 'assistant' ? 'assistant' : 'user',
      text: messageText,
    }));
    setMessages((current) => [...current, ['user', clean], ['assistant', 'Асистент готує відповідь, це може зайняти 10-25 секунд']]);
    setInput('');
    setIsThinking(true);
    try {
      const response = await fetch(`${API_BASE}/workspaces/${workspaceId}/agent/chat`, {
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
          ? ['assistant', `Не зміг дістатися до AI-провайдера: ${agentError.message}. Але логіка готова: попроси адміністратора перевірити серверні змінні AI-провайдера і зробити redeploy.`]
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
      const response = await fetch(`${API_BASE}/workspaces/${workspaceId}/ideas`, {
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
      notify('Відповідь асистента збережено як ідею.');
    } catch {
      notify('Не вдалося зберегти ідею.');
    }
  };

  const generateScriptFromSavedIdea = async () => {
    return runAgentAction('generate_script');
    if (!lastIdeaId) {
      await saveAssistantIdea();
      return;
    }
    try {
      const response = await fetch(`${API_BASE}/workspaces/${workspaceId}/ideas/${lastIdeaId}/generate-script`, { method: 'POST' });
      if (!response.ok) throw new Error('script_failed');
      notify('Сценарій створено з ідеї.');
    } catch {
      notify('Не вдалося створити сценарій.');
    }
  };

  const createVideoTask = async () => {
    return runAgentAction('create_video_job');
    try {
      const response = await fetch(`${API_BASE}/workspaces/${workspaceId}/video-jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ideaId: lastIdeaId || null,
          title: extractIdeaTitle(latestAssistantText),
          hook: latestAssistantText.slice(0, 220),
        }),
      });
      if (!response.ok) throw new Error('video_task_failed');
      notify('Video task створено. Генерація відео чекає підключення provider API.');
    } catch {
      notify('Не вдалося створити video task.');
    }
  };

  const runAgentAction = async (action) => {
    if (!latestAssistantText || actionStatus) return;
    const labels = {
      save_idea: 'Ідею збережено.',
      generate_script: 'Ідею збережено і сценарій створено.',
      create_video_job: 'Video task створено. Генерація відео чекає підключення provider API.',
    };
    setActionStatus(action);
    try {
      const response = await fetch(`${API_BASE}/workspaces/${workspaceId}/agent/actions`, {
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
      notify(labels[action] || 'Готово.');
    } catch (err) {
      notify(`Не вдалося виконати дію: ${err.message}`);
    } finally {
      setActionStatus('');
    }
  };

  return (
    <section className="page page-assistant">
      <PageTitle
        title="Асистент блогера"
        subtitle="Допомагає з ідеями, сценаріями, зйомкою, монтажним ТЗ, контент-планом, коментарями й адаптацією трендів під Україну."
        actions={<button className="dark" onClick={() => sendMessage('Збери мені повний контент-план на тиждень')} disabled={isThinking}><Sparkles size={16} />Сформувати контент-план</button>}
      />
      <AgentPipeline workspaceId={workspaceId} />
      <BrandBrain notify={notify} workspaceId={workspaceId} />
      <VideoTaskQueue notify={notify} workspaceId={workspaceId} />
      <div className="assistant-layout">
        <aside className="assistant-sidebar">
          <h3>Швидкі задачі</h3>
          {prompts.map((prompt) => <button key={prompt} onClick={() => sendMessage(prompt)}>{prompt}</button>)}
        </aside>
        <div className="assistant-chat">
          <div className="assistant-thread" ref={threadRef}>
            {messages.map(([role, text], index) => (
              <div className={`chat-message ${role}`} key={`${role}-${index}`}>
                <span>{role === 'assistant' ? 'AI' : 'Ви'}</span>
                <div className="message-body">{renderMessageText(text)}</div>
              </div>
            ))}
          </div>
          <div className="assistant-input">
            <input value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && sendMessage()} placeholder="Напиши задачу: ніша, ціль, формат, тон голосу..." />
            <button className="dark" onClick={() => sendMessage()} disabled={isThinking}><Send size={16} />{isThinking ? 'Думаю...' : 'Надіслати'}</button>
          </div>
          <div className="assistant-actions">
            <button type="button" onClick={saveAssistantIdea} disabled={isThinking || actionStatus || !latestAssistantText}>Зберегти як ідею</button>
            <button type="button" data-tour="generate-script-btn" onClick={generateScriptFromSavedIdea} disabled={isThinking || actionStatus || !latestAssistantText}>Зробити сценарій</button>
            <button type="button" onClick={createVideoTask} disabled={isThinking || actionStatus || !latestAssistantText}>Створити video task</button>
            {lastIdeaId && <small>Остання ідея: {lastIdeaId}</small>}
          </div>
        </div>
        <aside className="assistant-tools">
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
        </aside>
      </div>
    </section>
  );
}

function LaunchRoadmap({ notify, setPage, workspaceId }) {
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
    notify('Сітку прогріву сформовано на поточному екрані');
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
        title="Запуски"
        subtitle="Конструктор прогріву на 11 кроків: конкретні сценарії для сторіс, Reels, постів, тригерів, CTA і дедлайнів."
        actions={<><button onClick={() => { setActiveStep('9'); notify('Показав FOMO-тригери для 9-го етапу'); }}><Sparkles size={16} />Сформувати тригери</button><button className="dark" onClick={generateLaunch}><Rocket size={16} />Сформувати запуск</button></>}
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

function ContentPlan({ plans, openModal, notify }) {
  const today = new Date();
  const [calendarDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [modalDay, setModalDay] = useState(null);
  const [draft, setDraft] = useState({ title: '', format: 'Reels', time: '10:00' });
  const [posts, setPosts] = useState(() => plans.map((plan, index) => ({
    id: `seed-${index}`,
    day: Math.min(index + 3, new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()),
    title: plan[0],
    format: index % 3 === 0 ? 'Reels' : index % 3 === 1 ? 'Stories' : 'Post',
    time: index % 2 === 0 ? '10:00' : '18:30',
    done: false,
  })));
  const monthLabel = calendarDate.toLocaleDateString('uk-UA', { month: 'long', year: 'numeric' });
  const daysInMonth = new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 0).getDate();
  const firstWeekday = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), 1).getDay();
  const days = useMemo(() => [
    ...Array.from({ length: firstWeekday }, (_, index) => ({ type: 'empty', id: `empty-${index}` })),
    ...Array.from({ length: daysInMonth }, (_, index) => ({ type: 'day', day: index + 1 })),
  ], [daysInMonth, firstWeekday]);
  const doneCount = posts.filter((post) => post.done).length;
  const openPostModal = (day = today.getDate()) => {
    setModalDay(Math.min(Math.max(day, 1), daysInMonth));
    setDraft({ title: '', format: 'Reels', time: '10:00' });
  };
  const createPost = () => {
    if (!draft.title.trim()) return;
    setPosts((current) => [...current, {
      id: `post-${Date.now()}`,
      day: modalDay,
      title: draft.title.trim(),
      format: draft.format,
      time: draft.time,
      done: false,
    }]);
    setModalDay(null);
    notify('Пост додано в календар');
  };
  const movePost = (postId, day) => {
    setPosts((current) => current.map((post) => (post.id === postId ? { ...post, day } : post)));
    notify(`Пост перенесено на ${day} число`);
  };
  const toggleDone = (postId) => {
    setPosts((current) => current.map((post) => (post.id === postId ? { ...post, done: !post.done } : post)));
  };

  return (
    <section className="page page-content-plan">
      <PageTitle title="Контент-план" subtitle="План, зйомки, публікації й результати в одному календарі." actions={<><button onClick={() => notify('Пакет сформовано з відібраних ідей')}>Сформувати пакет</button><button onClick={() => notify('Тижневий план сформовано')}>Тижневий план</button><button className="dark" onClick={() => openPostModal()}><Plus size={16} />Новий пост</button></>} />
      <div className="stats">
        {[
          ['Усього', posts.length],
          ['Готово в batch', posts.length],
          ['Знято', doneCount],
          ['Опубліковано', doneCount],
          ['Потрібен розбір', posts.length - doneCount],
        ].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
      </div>
      <div className="calendar-layout">
        <div className="calendar-card">
          <div className="calendar-top"><ChevronLeft size={16} /><strong>{monthLabel}</strong><button onClick={() => openPostModal(today.getDate())}>Сьогодні</button><div className="legend"><span>План</span><span>Done</span><span>Drag</span></div></div>
          <div className="weekdays">{['НД','ПН','ВТ','СР','ЧТ','ПТ','СБ'].map((d) => <b key={d}>{d}</b>)}</div>
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
                      onClick={(event) => event.stopPropagation()}
                      onDragStart={(event) => event.dataTransfer.setData('text/plain', post.id)}
                    >
                      <label>
                        <input type="checkbox" checked={post.done} onChange={() => toggleDone(post.id)} />
                        <em>{post.format}</em>
                      </label>
                      <strong>{post.title}</strong>
                      <small>{post.time}</small>
                    </article>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <aside className="right-panel plan-panel">
          <div className="panel-title"><strong>Планові пости</strong><span>{posts.length}</span></div>
          {posts.map((post) => <article className={post.done ? 'mini-card done' : 'mini-card'} key={post.id}><div className="mini-thumb" /><div><strong>{post.title}</strong><small>{post.day} · {post.time} · {post.format}</small></div></article>)}
        </aside>
      </div>
      {modalDay && (
        <div className="modal-backdrop" onClick={() => setModalDay(null)}>
          <div className="quick-modal calendar-post-modal" onClick={(event) => event.stopPropagation()}>
            <h2>Новий пост</h2>
            <div className="calendar-post-form">
              <label>
                <span>Дата</span>
                <input value={`${modalDay} ${monthLabel}`} readOnly />
              </label>
              <label>
                <span>Час</span>
                <input type="time" value={draft.time} onChange={(event) => setDraft((current) => ({ ...current, time: event.target.value }))} />
              </label>
              <label>
                <span>Формат</span>
                <select value={draft.format} onChange={(event) => setDraft((current) => ({ ...current, format: event.target.value }))}>
                  <option>Reels</option>
                  <option>Stories</option>
                  <option>Post</option>
                </select>
              </label>
              <label className="wide">
                <span>Текст / тема</span>
                <textarea autoFocus value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder="Перша строчка майбутнього поста" />
              </label>
            </div>
            <div className="modal-actions">
              <button onClick={() => setModalDay(null)}>Скасувати</button>
              <button className="dark" onClick={createPost}>Додати в календар</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function Analytics() {
  const conversionRows = [
    ['Рілс про дорогий CGI', '147.3K', '42', '18%', '89%'],
    ['Кейс AI для кафе', '82.1K', '31', '22%', '76%'],
    ['Сторіс-прогрів оферу', '19.4K', '28', '34%', '68%'],
  ];

  return (
    <section className="page">
      <PageTitle title="Аналітика продюсера" subtitle="Контент, продажі й фінансові показники в одному місці: охоплення, кваліфіковані ліди, ROI, CAC і прогноз ефективності." />
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
  const leads = [
    ['@olena_brand', 'теплий', 'консультація', 'потрібна консультація', 'відповісти протягом 10 хв'],
    ['@max_ecom', 'гарячий', 'покупка', 'Готовий купити', 'дати пакет і лінк'],
    ['@studio_lviv', 'новий', 'підтримка', 'питання по бронюванню', 'авто-FAQ без алерту'],
    ['@ira_course', 'ризик', 'скарга', 'Скарга', 'передати менеджеру'],
  ];
  const intents = [
    ['Покупка', 'ціна, оплата, “як записатись”, “хочу пакет”'],
    ['Підтримка', 'доставка, бронювання, доступ, технічне питання'],
    ['Скарга', 'негатив, повернення, помилка, публічний ризик'],
    ['Комплімент', 'лайк, реакція, коротка подяка без наміру купити'],
  ];

  return (
    <section className="page">
      <PageTitle
        title="Продажі / AI Direct"
        subtitle="Слой конверсії: авто-відповіді в коментарях і Direct, кваліфікація лідів, CRM-теги й передача людині."
        actions={<button className="dark" onClick={() => { setPage('assistant'); notify('Відкрив Асистента для налаштування AI Direct'); }}><MessageSquareText size={16} />Увімкнути AI Direct</button>}
      />
      <div className="sales-layout">
        <div className="sales-stats">
          <div><span>Нові ліди</span><strong>38</strong></div>
          <div><span>Гарячі</span><strong>9</strong></div>
          <div><span>FAQ авто-закрито</span><strong>71%</strong></div>
          <div><span>Передано людині</span><strong>6</strong></div>
        </div>
      </div>
      <div className="intent-grid">
        {intents.map(([title, text]) => (
          <article className="insight-card" key={title}>
            <small>Intent Detection</small>
            <h3>{title}</h3>
            <p>{text}</p>
          </article>
        ))}
      </div>
      <div className="lead-table">
        {leads.map(([handle, temp, intent, tag, action]) => (
          <article key={handle}>
            <strong>{handle}</strong>
            <Badge>{temp}</Badge>
            <p>{intent}</p>
            <Badge>{tag}</Badge>
            <em>{action}</em>
          </article>
        ))}
      </div>
    </section>
  );
}

function AnalysisSetup({ notify }) {
  const businessTypes = [
    ['Кафе / ресторан', 'меню, бронювання, відгуки, локальні події'],
    ['Магазин одягу', 'дропи, образи, залишки розмірів, Direct-продажі'],
    ['Салон / beauty', 'вільні вікна, до/після, майстри, довіра'],
    ['Експерт / блогер', 'прогрів, кейси, консультації, освітній контент'],
    ['E-commerce', 'каталог, bundles, UGC, retargeting-креативи'],
    ['Локальна послуга', 'географія, сезонність, записи, рекомендації'],
  ];

  return (
    <div className="analysis-setup">
      <div className="business-picker">
        <div>
          <small>Профіль бізнесу</small>
          <h3>Користувач одразу задає рід діяльності</h3>
          <p>Це краще, ніж намагатися вгадати бізнес по випадковій активності акаунта.</p>
        </div>
        <div className="business-choice-grid">
          {businessTypes.map(([title, text]) => (
            <button key={title} onClick={() => notify(`${title}: AI brief оновлено`)}>
              <strong>{title}</strong>
              <span>{text}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function BillingSettings({ workspaceId, notify }) {
  const [plans, setPlans] = useState([]);
  const [billing, setBilling] = useState(null);
  const [checkout, setCheckout] = useState(null);
  const [status, setStatus] = useState('loading');
  const planGridRef = useRef(null);

  const loadBilling = async () => {
    setStatus('loading');
    try {
      const [plansResponse, billingResponse] = await Promise.all([
        fetch(`${API_BASE}/billing/plans`),
        fetch(`${API_BASE}/workspaces/${workspaceId}/billing`),
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
      notify(`Не вдалося завантажити тарифи: ${err.message}`);
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
      const response = await fetch(`${API_BASE}/workspaces/${workspaceId}/billing/select-plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || payload.error || 'select_plan_failed');
      const checkoutResponse = await fetch(`${API_BASE}/workspaces/${workspaceId}/billing/checkout?planId=${planId}`);
      const checkoutPayload = await checkoutResponse.json();
      if (!checkoutResponse.ok) throw new Error(checkoutPayload.message || checkoutPayload.error || 'checkout_failed');
      if (checkoutPayload.payment?.paymentUrl) {
        notify('Переходимо до безпечної оплати Monobank.');
        if (paymentWindow) {
          paymentWindow.location.href = checkoutPayload.payment.paymentUrl;
        } else {
          window.open(checkoutPayload.payment.paymentUrl, '_blank', 'noopener,noreferrer');
        }
        return;
      }
      paymentWindow?.close();
      setCheckout(checkoutPayload);
      notify('Тариф зарезервовано. Перевір реквізити оплати нижче.');
      await loadBilling();
    } catch (err) {
      paymentWindow?.close();
      notify(`Не вдалося обрати тариф: ${err.message}`);
    }
  };

  const copyPaymentText = async (value, label) => {
    await navigator.clipboard?.writeText(value || '');
    notify(`${label} скопійовано`);
  };

  const currentPlanId = billing?.plan?.id;
  const subscriptionStatusLabel = (() => {
    if (billing?.plan?.id === 'demo') return 'Безкоштовний тестовий доступ';
    if (billing?.subscription?.status === 'active') return 'Активний доступ';
    if (billing?.subscription?.status === 'pending_payment') return 'Очікує підтвердження оплати';
    if (billing?.subscription?.status === 'trialing') return 'Тестовий період';
    return 'Доступ налаштовується';
  })();
  const usageRows = [
    ['AI повідомлення', 'agentChat'],
    ['Reels imports', 'reelImports'],
    ['Конкуренти', 'competitors'],
    ['Instagram акаунти', 'instagramAccounts'],
  ];
  const planLimitRows = [
    ['agentChat', MessageSquareText, 'AI повідомлень'],
    ['reelImports', Video, 'Reels imports'],
    ['competitors', Target, 'конкурентів'],
    ['instagramAccounts', UsersRound, 'Instagram акаунтів'],
  ];
  const planFeatureLabels = {
    brand_brain: 'Brand brain і контент-план',
    assistant: 'AI асистент для сценаріїв',
    remix_studio: 'Remix Studio',
    instagram_login: 'Instagram login ready',
    everything_starter: 'Усе зі Starter',
    team: 'Команда для спільної роботи',
    ai_direct: 'AI Direct для CRM',
    exports: 'Експорти для клієнтів',
    sync_queue: 'Sync queue',
    everything_pro: 'Усе з Pro',
    team_full_access: 'Повний доступ до модуля Команда',
    ai_direct_unlimited: 'Безлімітний AI Direct',
    multi_client_workspaces: 'Мультиклієнтські простори',
    approval_flow: 'Approval flow для контенту',
  };

  return (
    <div className="billing-settings">
      <section className="billing-current">
        <div>
          <small>Поточний тариф</small>
          <h3>{billing?.plan?.name || (status === 'loading' ? 'Завантаження...' : 'Не визначено')}</h3>
          <p>{subscriptionStatusLabel}</p>
        </div>
        <button
          className="billing-upgrade-button"
          type="button"
          onClick={() => planGridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        >
          Перейти на Starter/Pro
        </button>
      </section>

      <div className="billing-usage-grid">
        {usageRows.map(([label, key]) => {
          const limit = billing?.plan?.limits?.[key] ?? 0;
          const used = billing?.usage?.[key] ?? 0;
          const remaining = billing?.remaining?.[key] ?? 0;
          const width = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
          return (
            <article className="billing-usage-card" key={key}>
              <div>
                <small>{label}</small>
                <strong>{remaining}</strong>
              </div>
              <p>{used} / {limit} використано</p>
              <span><i style={{ width: `${width}%` }} /></span>
            </article>
          );
        })}
      </div>

      <div className="billing-plan-grid" ref={planGridRef}>
        {plans.map((plan) => {
          const isCurrent = plan.id === currentPlanId;
          const isDemo = plan.id === 'demo';
          return (
            <article className={isCurrent ? 'billing-plan active' : 'billing-plan'} key={plan.id}>
              <small>{plan.billingPeriod}</small>
              <h3>{plan.name}</h3>
              <div className="billing-price">{plan.priceUah ? `₴${plan.priceUah}` : 'Безкоштовно'}</div>
              <ul>
                {planLimitRows.map(([key, Icon, label]) => (
                  <li key={key}>
                    <Icon size={15} />
                    <span>{plan.limits[key]} {label}</span>
                  </li>
                ))}
                {(plan.features || [])
                  .filter((feature) => planFeatureLabels[feature])
                  .slice(0, plan.id === 'agency' ? 4 : 2)
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
                disabled={isCurrent || isDemo}
                onClick={() => selectPlan(plan.id)}
              >
                {isCurrent ? 'Ваш поточний тариф' : isDemo ? 'Демо доступ' : 'Оплатити тариф'}
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
              <h3>{checkout.plan.name} · ₴{checkout.payment.amount}</h3>
              <p>Поповніть картку на суму тарифу. Після перевірки ми активуємо доступ вручну.</p>
            </div>
            <button type="button" onClick={() => setCheckout(null)}>Закрити</button>
          </div>
          <article className="checkout-card">
            <small>Номер картки для поповнення</small>
            <strong>{checkout.payment.cardNumber || 'Реквізити скоро зʼявляться'}</strong>
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
              <strong>{checkout.payment.note}</strong>
            </article>
          </div>
          <button className="checkout-paid-button" type="button" onClick={() => notify('Оплату треба перевірити вручну. Після підтвердження адміністратор активує тариф.')}>
            Я оплатив
          </button>
        </section>
      )}
    </div>
  );
}

function DataSources({ sources, notify, workspaceId }) {
  const [tab, setTab] = useState('profile');
  const integrations = [
    ['Instagram Professional Login', 'Creator або Business акаунт підключається через офіційний Instagram flow.', 'Очікує налаштування адміністратором'],
    ['AI-асистент', 'Відповіді, ідеї та сценарії працюють через серверний AI-провайдер.', 'Керується на backend'],
  ];

  return (
    <section className="page">
      <PageTitle
        title="Налаштування"
        subtitle="Оберіть профіль бізнесу та перевірте підключення сервісів."
      />
      <Tabs
        active={tab}
        onChange={setTab}
        items={[
          ['profile', 'Профіль бізнесу'],
          ['api', 'Інтеграції API'],
          ['billing', 'Тариф і ліміти'],
        ]}
      />
      {tab === 'profile' && <AnalysisSetup notify={notify} />}
      {tab === 'api' && (
        <div className="source-grid settings-integrations">
          {integrations.map(([title, description, status]) => (
            <article className="insight-card source-card" key={title}>
              <CircleCheck size={22} />
              <h3>{title}</h3>
              <p>{description}</p>
              <em>{status}</em>
            </article>
          ))}
        </div>
      )}
      {tab === 'billing' && <BillingSettings workspaceId={workspaceId} notify={notify} />}
    </section>
  );
}

function LegalSafe({ notify }) {
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
    notify('Шаблон скопійовано');
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
    notify('Шаблон завантажено');
  };

  return (
    <section className="page">
      <PageTitle
        title="Юридичний сейф"
        subtitle="Шаблони документів і правила безпеки для запусків, партнерств, підрядників та AI Direct."
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
        title="Бюджетний калькулятор"
        subtitle="Фінансова модель запуску: прибуток, CAC, трафік, продакшен, команда і точка окупності."
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
        title="Команда"
        subtitle="Контроль підрядників, дедлайнів і якості контенту перед публікацією."
        actions={<button className="dark" onClick={() => notify('Нову задачу для команди створено')}><Plus size={16} />Додати задачу</button>}
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

function parseMetric(value) {
  if (!value || value === '-') return 0;
  const normalized = String(value).replace(',', '.').toUpperCase();
  const number = parseFloat(normalized);
  if (Number.isNaN(number)) return 0;
  if (normalized.includes('M')) return number * 1000000;
  if (normalized.includes('K')) return number * 1000;
  return number;
}

function QuickModal({ type, onClose, onSubmit }) {
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
            <input value={form.title} onChange={(event) => update('title', event.target.value)} placeholder="Наприклад: AI workflow з одного фото товару" />
          </label>
          <label className="wide">
            <span>Caption або короткий опис</span>
            <textarea value={form.caption} onChange={(event) => update('caption', event.target.value)} placeholder="Що було в рілсі, який перший кадр, яка обіцянка, який CTA..." />
          </label>
          <label className="wide">
            <span>Транскрипт, якщо є</span>
            <textarea value={form.transcript} onChange={(event) => update('transcript', event.target.value)} placeholder="Встав сюди текст з відео або свій приблизний переказ." />
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

createRoot(document.getElementById('root')).render(<App />);
