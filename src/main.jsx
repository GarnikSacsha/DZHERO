import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  BarChart3,
  Bot,
  BriefcaseBusiness,
  Calculator,
  CalendarDays,
  ChevronLeft,
  CircleCheck,
  ClipboardList,
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
  Wand2,
  X,
} from 'lucide-react';
import './styles.css';
import logoImg from './logo.png';
import { fetchProducerSnapshot } from './data/uaMarket';
import { applyInterfaceLanguage } from './i18n';

const API_URL = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
const API_BASE = API_URL.endsWith('/api') ? API_URL : `${API_URL}/api`;
const AUTH_TOKEN_KEY = 'insta-producer-auth-token';

function getPublicPage() {
  const path = window.location.pathname.replace(/\/$/, '');
  return {
    '/privacy': 'privacy',
    '/terms': 'terms',
    '/data-deletion': 'dataDeletion',
  }[path] || null;
}

function PublicLegalPage({ page }) {
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
      </article>
    </main>
  );
}

function App() {
  const [page, setPage] = useState('home');
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
  const publicPage = getPublicPage();

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
    const timer = window.setTimeout(() => applyInterfaceLanguage(language), 0);
    return () => window.clearTimeout(timer);
  }, [language, page, market, data, modal, toast, currentUser, authStatus, theme, remixDraft]);

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
  const pushIdeaToPlan = (idea) => {
    setData((current) => ({ ...current, plans: [[idea.title, idea.source, 'Відібрано'], ...current.plans] }));
    notify('Ідею перенесено в контент-план');
  };
  const pushIdeaToRemix = (idea) => {
    setRemixDraft({ market: idea.market, title: idea.hook, handle: idea.source, score: idea.score, views: '-', likes: '-', comments: '-', status: [idea.status, 'UA-ремікс'], tag: idea.title[0] ?? 'I' });
    setPage('remix');
    notify('Ідею відкрито в ремікс-студії');
  };

  return (
    <div className="app" data-theme={theme}>
      <Sidebar
        key={`sidebar-${language}`}
        page={page}
        setPage={setPage}
        currentUser={currentUser}
        onLogout={handleLogout}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />
      {isSidebarOpen && <button className="mobile-menu-backdrop" type="button" aria-label="Закрити меню" onClick={() => setIsSidebarOpen(false)} />}
      <main className="shell" key={`shell-${language}`}>
        <Topbar notify={notify} theme={theme} setTheme={setTheme} language={language} setLanguage={setLanguage} onOpenMenu={() => setIsSidebarOpen(true)} />
        {page === 'home' && <HomeDashboard data={data} market={market} notify={notify} language={language} />}
        {page === 'roadmap' && <ProductRoadmap notify={notify} />}
        {page === 'businesses' && <BusinessPlaybooks notify={notify} />}
        {page === 'strategy' && <StrategyBrain notify={notify} />}
        {page === 'viral' && <ViralBank reels={filtered.reels} selectedReel={selectedReel} market={market} notify={notify} />}
        {page === 'competitors' && <Competitors competitors={filtered.competitors} openModal={setModal} />}
        {page === 'remix' && <RemixStudio reel={selectedReel} notify={notify} />}
        {page === 'ideas' && <IdeasBoard ideas={filterByMarket(data.ideas, market)} openModal={setModal} onToRemix={pushIdeaToRemix} onToPlan={pushIdeaToPlan} />}
        {page === 'assistant' && <CreatorAssistant notify={notify} />}
        {page === 'launches' && <LaunchRoadmap notify={notify} />}
        {page === 'plan' && <ContentPlan plans={data.plans} openModal={setModal} notify={notify} />}
        {page === 'sales' && <SalesDirect notify={notify} />}
        {page === 'analytics' && <Analytics />}
        {page === 'legal' && <LegalSafe notify={notify} />}
        {page === 'budget' && <BudgetCalculator notify={notify} />}
        {page === 'team' && <TeamHub notify={notify} />}
        {page === 'settings' && <DataSources sources={data.sources} notify={notify} />}
      </main>
      {modal && <QuickModal type={modal} onClose={() => setModal(null)} onSubmit={{ competitor: addCompetitor, idea: addIdea, post: addPost }[modal]} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function AuthGate({ onAuth, notify, theme, setTheme, language, setLanguage }) {
  const [devLoginOpen, setDevLoginOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [instagramConfig, setInstagramConfig] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const submitAuth = async (event) => {
    event.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'auth_error');
      onAuth(payload);
    } catch (authError) {
      setError(authError.message === 'invalid_credentials' ? 'Невірний email або пароль' : 'Не вдалося увійти. Перевір бекенд і дані.');
    } finally {
      setIsLoading(false);
    }
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
      setError('Instagram Login ще налаштовується. Для реального підключення потрібні ключі Meta App у backend.');
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
              <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
                <circle cx="50" cy="50" r="45" stroke="currentColor" strokeWidth="4" />
                <path d="M50 20 C50 20 66 42 66 54 C66 63 59 70 50 70 C41 70 34 63 34 54 C34 42 50 20 50 20 Z" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="4" strokeLinejoin="round" />
                <path d="M18 64 C28 60, 38 68, 50 64 C62 60, 72 68, 82 64" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                <path d="M14 74 C26 70, 38 78, 50 74 C62 70, 74 78, 86 74" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
              </svg>
            </div>
            {/*
              <img src={logoImg} alt="Dzhero Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            */}
            <div>
              <strong>Dzhero</strong>
              <span>AI-продюсер для України і глобальних трендів</span>
            </div>
          </div>
          <small>Закритий робочий простір</small>
          <h1>Увійди через Instagram, щоб підключити Creator або Business акаунт.</h1>
          <div className="auth-points">
            <span>Instagram Login</span>
            <span>Creator або Business</span>
            <span>Insights</span>
            <span>AI Direct</span>
          </div>
        </div>
        <form className="auth-panel" onSubmit={submitAuth}>
          <div className="auth-panel-head">
            <div>
              <small>Instagram Professional Login</small>
              <h2>Вхід</h2>
            </div>
            <div className="language-switch" aria-label="Interface language">
              <button className={language === 'uk' ? 'active' : ''} type="button" onClick={() => setLanguage('uk')}>UA</button>
              <button className={language === 'en' ? 'active' : ''} type="button" onClick={() => setLanguage('en')}>EN</button>
            </div>
            <button className="icon" type="button" title="Тема" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
          <button className="auth-submit auth-meta-button" type="button" onClick={startInstagramLogin} disabled={isLoading}>
            {isLoading ? 'Готуємо Instagram Login...' : 'Увійти через Instagram'}
          </button>
          {instagramConfig && (
            <div className="instagram-pending">
              <strong>Instagram connection pending</strong>
              <p>Підключення готове в інтерфейсі, але backend ще чекає Meta App keys. Користувачам не треба вводити ключі: вони просто логіняться через Instagram після App Review.</p>
              <div>
                <span>Creator або Business</span>
                <span>Personal не підходить</span>
                <span>{instagramConfig.redirectUri}</span>
              </div>
            </div>
          )}
          {error && <div className="auth-error">{error}</div>}
          <button className="auth-demo" type="button" onClick={enterDemo} disabled={isLoading}>
            Демо-вхід для перегляду
          </button>
          <button className="auth-dev-toggle" type="button" onClick={() => setDevLoginOpen((value) => !value)}>
            Dev email login
          </button>
          {devLoginOpen && (
            <div className="auth-dev-panel">
              <label className="auth-field">
                <span>Email</span>
                <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@brand.ua" type="email" />
              </label>
              <label className="auth-field">
                <span>Пароль</span>
                <input value={password} onChange={(event) => setPassword(event.target.value)} placeholder="мінімум 6 символів" type="password" />
              </label>
              <button className="auth-demo" type="submit" disabled={isLoading}>
                Увійти email
              </button>
            </div>
          )}
        </form>
      </section>
    </main>
  );
}

function Sidebar({ page, setPage, currentUser, onLogout, isOpen, onClose }) {
  const items = [
    ['home', Home, 'Головна', 'core'],
    ['roadmap', ClipboardList, 'MVP / ТЗ', 'core'],
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
          <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
            <circle cx="50" cy="50" r="45" stroke="currentColor" strokeWidth="4" />
            <path d="M50 20 C50 20 66 42 66 54 C66 63 59 70 50 70 C41 70 34 63 34 54 C34 42 50 20 50 20 Z" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="4" strokeLinejoin="round" />
            <path d="M18 64 C28 60, 38 68, 50 64 C62 60, 72 68, 82 64" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
            <path d="M14 74 C26 70, 38 78, 50 74 C62 70, 74 78, 86 74" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
          </svg>
        </div>
        {/*
          <img src={logoImg} alt="Dzhero Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        */}
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
          <button className={page === id ? 'active' : ''} key={id} onClick={() => {
            setPage(id);
            onClose?.();
          }}>
            <Icon size={16} />
            <span className="nav-label">{label}</span>
          </button>
        ))}
      </nav>
      <div className="account">
        <div className="avatar">{currentUser?.name?.[0]?.toUpperCase() || 'A'}</div>
        <div>
          <strong>{currentUser?.name || 'Адмін'}</strong>
          <span>{currentUser?.email || 'робочий простір'}</span>
        </div>
        <button className="logout-button" type="button" title="Вийти" onClick={onLogout}>
          <LogOut size={14} />
        </button>
      </div>
    </aside>
  );
}

function Topbar({ notify, theme, setTheme, language, setLanguage, onOpenMenu }) {
  return (
    <header className="topbar">
      <div className="topbar-title">
        <button className="mobile-menu-trigger" type="button" aria-label="Відкрити меню" onClick={onOpenMenu}>
          <Menu size={18} />
        </button>
        <span>INSTAGRAM REELS · GLOBAL SCOUTING · UA ADAPTATION</span>
      </div>
      <div className="top-actions">
        <div className="language-switch" aria-label="Interface language">
          <button className={language === 'uk' ? 'active' : ''} type="button" onClick={() => setLanguage('uk')}>UA</button>
          <button className={language === 'en' ? 'active' : ''} type="button" onClick={() => setLanguage('en')}>EN</button>
        </div>
        <span className="pill">Київ</span>
        <span>глобальний scouting для UA</span>
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

function HomeDashboard({ data, market, notify }) {
  const topReel = data.reels[0];
  const activeMarket = data.marketSegments.find((segment) => segment.id === market);

  return (
    <section className="page page-home">
      <PageTitle
        title="Головна"
        subtitle="Операційний центр Instagram-продюсера: глобальний scouting і адаптація ідей під українську аудиторію."
        actions={<button className="dark" onClick={() => notify('Асистент підготував batch-чернетку на тиждень')}><Sparkles size={16} />Зібрати ідеї на тиждень</button>}
      />
      <div className="home-grid">
        <article className="home-hero">
          <small>Поточний фокус</small>
          <h2>{activeMarket?.label ?? 'Усі ринки'} → український сценарій</h2>
          <p>Система аналізує рілси в Україні, США, Європі та global-нішах, після чого адаптує механіку під український вступ, текст і контент-план.</p>
          <div className="home-badges"><span>Global scouting</span><span>UA-first output</span><span>Kyiv time</span></div>
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
      <div className="ops-strip">
        {[
          ['01', 'Підключити Instagram', 'Meta Login, права доступу, профіль бізнесу.'],
          ['02', 'Навчити бренд', 'Ніша, Tone of Voice, місто, продукти, цілі.'],
          ['03', 'Зібрати сигнали', 'Рілси, конкуренти, коментарі, тренди та ідеї.'],
          ['04', 'Випустити batch', 'План на тиждень, сторіс, рілси, Direct-відповіді.'],
        ].map(([step, title, text]) => (
          <article key={step}>
            <span>{step}</span>
            <strong>{title}</strong>
            <p>{text}</p>
          </article>
        ))}
      </div>
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

function ProductRoadmap({ notify }) {
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
        actions={<button className="dark" onClick={() => notify('MVP scope зафіксовано як базу для ТЗ')}><ClipboardList size={16} />Зафіксувати MVP</button>}
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

function ViralBank({ reels, selectedReel, market, notify }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('score');
  const [tab, setTab] = useState('all');
  const filteredReels = reels
    .filter((reel) => `${reel.title} ${reel.handle} ${reel.status.join(' ')}`.toLowerCase().includes(query.toLowerCase()))
    .filter((reel) => tab === 'all' || (tab === 'review' ? reel.status.some((status) => status.includes('розбір') || status.includes('огляд')) : reel.status.some((status) => status.toLowerCase().includes(tab))))
    .sort((a, b) => sort === 'views' ? parseMetric(b.views) - parseMetric(a.views) : b.score - a.score);

  return (
    <section className="page">
      <PageTitle
        title="Банк віральних рілсів"
        subtitle="Скаутимо Україну, США, Європу та global-ніші, але адаптуємо ідеї під українську аудиторію."
        actions={<><button onClick={() => notify('Експорт підготовлено як CSV-макет')}><Download size={16} />Експорт</button><button onClick={() => setTab('review')}><Filter size={16} />Фільтри</button></>}
      />
      <div className="search-row">
        <label><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Пошук: рілс, акаунт, сигнал, ніша, ринок..." /></label>
        <select value={market} readOnly><option>{market === 'all' ? 'Усі ринки' : 'Обраний ринок'}</option></select>
        <select value={sort} onChange={(event) => setSort(event.target.value)}><option value="score">За скором</option><option value="views">За переглядами</option></select>
      </div>
      <Tabs active={tab} onChange={setTab} items={[['all', `Для тебе ${filteredReels.length}`], ['trend', 'Тренди'], ['кейс', 'Кейси'], ['адапт', 'Адаптації'], ['review', 'Потрібен огляд']]} />
      <div className="split">
        <ReelsTable reels={filteredReels} />
        <TopTen reels={filteredReels} selectedReel={selectedReel} />
      </div>
    </section>
  );
}

function BusinessPlaybooks({ notify }) {
  const playbooks = [
    ['Кафе / ресторан', 'Меню, сезонні позиції, бронювання, відгуки, UGC, локальні події.', ['сторіс-меню', 'акції дня', 'відгуки гостей']],
    ['Магазин одягу', 'Дропи, наявність, образи, примірки, size guide, Direct-продажі.', ['лукбуки', 'новинки', 'залишки розмірів']],
    ['Салон / beauty', 'Вільні вікна, роботи майстрів, до/після, записи, довіра.', ['до/після', 'вікна на тиждень', 'поради']],
    ['Фітнес / студія', 'Розклад, абонементи, трансформації, пробні заняття, ком’юніті.', ['розклад', 'кейси клієнтів', 'пробне заняття']],
    ['Експерт / консультант', 'Контент довіри, кейси, розбір помилок, прогрів, заявки.', ['експертні Reels', 'FAQ', 'міні-запуск']],
    ['E-commerce', 'Каталог, bundles, огляди, UGC, retargeting-креативи, промо.', ['товарні рілси', 'порівняння', 'пакети']],
  ];

  return (
    <section className="page page-businesses">
      <PageTitle
        title="Бізнеси"
        subtitle="Сервіс має працювати не тільки для блогерів: кафе, магазини, салони, студії й e-commerce отримують свої сценарії контенту та продажів."
        actions={<button className="dark" onClick={() => notify('Оберіть playbook нижче, щоб зібрати контент-систему')}><BriefcaseBusiness size={16} />Обрати тип бізнесу</button>}
      />
      <div className="business-grid">
        {playbooks.map(([title, text, tags]) => (
          <article className="business-card" key={title} onClick={() => notify(`Playbook "${title}" обрано`)}>
            <div className="panel-title"><strong>{title}</strong> <span className="playbook-tag">playbook</span></div>
            <p>{text}</p>
            <div className="business-tags">{tags.map((tag) => <em key={tag}>{tag}</em>)}</div>
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

function StrategyBrain({ notify }) {
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
        actions={<button className="dark" onClick={() => notify('Позиціонування сформовано')}><Sparkles size={16} />Сформувати позиціонування</button>}
      />
      <div className="strategy-layout">
        <article className="strategy-hero">
          <small>Позиціонування</small>
          <h2>Система для SMM і продюсерів, яка веде акаунт від ніші до продажу.</h2>
          <p>Система має розуміти, кому продає блогер, який офер, які болі аудиторії, як говорити і які формати даватимуть не тільки охоплення, а й заявки.</p>
          <div className="home-badges">{voice.map((item) => <span key={item}>{item}</span>)}</div>
        </article>
        <div className="strategy-cards">
          {pillars.map(([title, text, score]) => (
            <article className="insight-card" key={title}>
              <div className="panel-title"><strong>{title}</strong><span className="metric-badge">{score}</span></div>
              <p>{text}</p>
            </article>
          ))}
        </div>
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

function ReelsTable({ reels }) {
  return (
    <div className="table-card">
      <div className="table-head reels-grid">
        <span>Рілс</span><span>Конкурент</span><span>Скор</span><span>Перегляди</span><span>Лайки</span><span>Ком.</span><span>Статус</span>
      </div>
      {reels.map((reel) => (
        <div className="reel-row reels-grid" key={`${reel.handle}-${reel.title}`}>
          <div className="reel-info">
            <div className={`thumb market-${reel.market}`}><span>{reel.views}</span></div>
            <div><strong>{reel.title}</strong><small>{marketLabel(reel.market)} · 52с · 06 тра 13:42</small></div>
          </div>
          <div className="handle"><b>{reel.tag}</b><span>{reel.handle}</span><small>Instagram</small></div>
          <Score value={reel.score} />
          <strong>{reel.views}</strong>
          <span>{reel.likes}</span>
          <span>{reel.comments}</span>
          <div className="status-list">{reel.status.map((s) => <em key={s}>{s}</em>)}</div>
        </div>
      ))}
    </div>
  );
}

function TopTen({ reels }) {
  return (
    <aside className="right-panel">
      <div className="panel-title"><strong>Топ-10</strong><span>середній скор: 76</span></div>
      {reels.slice(0, 5).map((reel, index) => (
        <article className="mini-card" key={`${reel.handle}-${reel.title}`}>
          <div><small>#{index + 1} · {marketLabel(reel.market)} · {reel.handle}</small><strong>{reel.title}</strong></div>
          <Score value={reel.score} compact />
        </article>
      ))}
    </aside>
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
            <div className="handle competitor-handle"><b>{row.handle[1].toUpperCase()}</b><span>{row.handle}</span><small>{marketLabel(row.market)} · instagram.com/{row.handle.slice(1)}</small></div>
            <span className="niche-text">{row.niche}</span>
            <strong>{row.reels}</strong>
            <div className="hit-stack"><i /><i /><i /></div>
            <Score value={row.score} compact />
            <span>{row.bestViews}</span>
            <em>{row.status}</em>
          </div>
        ))}
      </div>
    </section>
  );
}

function RemixStudio({ reel, notify }) {
  const [adaptationState, setAdaptationState] = useState('idle');
  const scenarioVariants = [
    ['Варіант 1', 'Перший кадр: локальний біль бізнесу. Далі - короткий доказ, приклад з ніші та CTA на консультацію.'],
    ['Варіант 2', 'Перший кадр: порівняння до/після. Далі - три кроки адаптації механіки під український ринок.'],
    ['Варіант 3', 'Перший кадр: заперечення клієнта. Далі - відповідь через кейс, цифру і прямий CTA в Direct.'],
  ];
  const adaptScenario = () => {
    setAdaptationState('loading');
    notify('Адаптація сценарію запущена');
    window.setTimeout(() => {
      setAdaptationState('ready');
      notify('Підготовлено 3 варіанти адаптації');
    }, 1200);
  };

  return (
    <section className="page">
      <PageTitle title="Рілс → транскрипт → UA-адаптація" subtitle={`${reel.handle} · ${marketLabel(reel.market)} · 06 травня 2026, 13:42`} actions={<><button onClick={() => notify('Відкриття Instagram буде доступне після підключення джерела')} >Instagram</button><button className="dark" onClick={adaptScenario}><Sparkles size={16} />Адаптувати сценарій</button></>} />
      <div className="remix-layout">
        <div>
          <div className="phone-card">
            <div className="phone-head"><b>{reel.handle.slice(1)}</b><span>⋮</span></div>
            <div className={`phone-video market-${reel.market}`}><button onClick={() => notify('Превʼю відео буде доступне після підключення медіа')}>▶</button><strong>GLOBAL<br />TO UA</strong></div>
            <div className="phone-stats"><span>{reel.views}<br /><small>Перегл.</small></span><span>{reel.likes}<br /><small>Лайки</small></span><span>{reel.comments}<br /><small>Ком.</small></span><span>{reel.score}<br /><small>Скор</small></span></div>
          </div>
          <div className="gate-card">
            <h3>Детектор ринку <span>{marketLabel(reel.market)}</span></h3>
            <p>Джерела модеруються перед потраплянням в аналіз</p>
            <h3>Quality gate <span className="green">Проходить gate</span></h3>
            <p>Механіку можна адаптувати для української аудиторії</p>
          </div>
        </div>
        <div className="analysis-stack">
          <div className="insight-card hero-card">
            <div className="chips"><span>Є сигнал</span><span>ринок: {marketLabel(reel.market)}</span><span>адаптація: UA</span></div>
            <small>Про що рілс</small>
            <h2>{reel.title.replace('...', '')}</h2>
            <p>Ідея має чіткий вступний сигнал і зрозумілу механіку. Завдання продюсера - не копіювати, а переформатувати під український контекст, мову, болі бізнесу і локальні CTA.</p>
          </div>
          <div className="insight-card">
            <small>Логіка адаптації</small>
            <h3>Global insight → український сценарій</h3>
            <p>Беремо структуру: перший кадр, обіцянка, доказ, CTA. Потім замінюємо приклади на український бізнес, прибираємо чужий культурний контекст і пишемо текст українською.</p>
          </div>
          <div className="remix-bottom">
            <div className="insight-card">
              <small>Потенційний ремікс</small>
              <h3>Як українському бізнесу використати цю механіку без великого бюджету на продакшн...</h3>
              <ol>
                <li>Залишити чіткий callout у перші 1-2 секунди.</li>
                <li>Показати локальний біль: продажі, команда, час, контент без студії.</li>
                <li>Закрити CTA під Україну: коментар, консультація, Telegram або профіль.</li>
              </ol>
            </div>
            <div className="insight-card empty">
              <h3>3 UA-ремікси</h3>
              {adaptationState === 'idle' && <p>Тут з’являться українські варіанти після адаптації сценарію.</p>}
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
                  {scenarioVariants.map(([title, text]) => (
                    <article className="remix-variant-card" key={title}>
                      <strong>{title}</strong>
                      <p>{text}</p>
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
                <button onClick={() => onToRemix(idea)}>У ремікс</button>
                <button onClick={() => onToPlan(idea)}>У контент-план</button>
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

function AgentPipeline() {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    let isMounted = true;
    fetch(`${API_BASE}/workspaces/ws_demo_ua/ai/status`)
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
  }, []);

  const providers = status?.providers || {};
  const steps = [
    ['01', 'Instagram data', providers.instagram?.status || 'configuration_required', 'Reels, captions, insights and comments arrive only after Meta permissions.'],
    ['02', 'Reel understanding', providers.textAgent?.status || 'fallback_mode', 'The agent scores hooks, topic, audience fit, copy risk and UA adaptation potential.'],
    ['03', 'Script engine', providers.textAgent?.provider || 'fallback', 'Ideas become Ukrainian scripts, shot lists, captions and Direct CTA.'],
    ['04', 'Video job', providers.videoGeneration?.status || 'queued_for_later', 'A future video provider receives approved scenes only after human review.'],
  ];
  const contracts = [
    'POST /reels/:reelId/analyze-ai',
    'POST /ideas/:ideaId/generate-script',
    'POST /video-jobs',
    'GET /ai/status',
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
      <div className="agent-contracts">
        {contracts.map((contract) => <code key={contract}>{contract}</code>)}
      </div>
    </div>
  );
}

function BrandBrain({ notify }) {
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
    fetch(`${API_BASE}/workspaces/ws_demo_ua/agent/context`)
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
  }, []);

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
      const response = await fetch(`${API_BASE}/workspaces/ws_demo_ua/agent/context`, {
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
    ['businessType', 'Ніша', 'AI expert, SMM, cafe, beauty, e-commerce'],
    ['product', 'Продукт', 'consultations, course, launch, service'],
    ['audience', 'ЦА', 'Ukrainian founders, creators, small businesses'],
    ['location', 'Ринок', 'Ukraine, Kyiv, Europe, global UA'],
    ['toneOfVoice', 'Tone of Voice', 'clear, useful, confident'],
    ['offer', 'Офер', 'what exactly the person sells'],
    ['cta', 'CTA', 'write AI in Direct, book a call'],
    ['stopTopics', 'Стоп-теми', 'comma-separated promises or topics to avoid'],
    ['proof', 'Докази', 'cases, numbers, testimonials, before/after'],
  ];

  return (
    <section className="brand-brain">
      <div className="brand-brain-head">
        <div>
          <small>Brand Brain</small>
          <h3>Памʼять агента про бізнес</h3>
          <p>Це контекст, який Gemini отримує перед відповіддю: що продаємо, кому, яким тоном, що не можна обіцяти і який CTA вести.</p>
        </div>
        <button className="dark" type="button" onClick={saveBrief} disabled={status === 'saving'}>
          <Database size={16} />{status === 'saving' ? 'Зберігаю...' : 'Зберегти памʼять'}
        </button>
      </div>
      <div className="brand-brain-grid">
        {fields.map(([field, label, placeholder]) => (
          <label className={field === 'proof' || field === 'stopTopics' ? 'brand-field wide' : 'brand-field'} key={field}>
            <span>{label}</span>
            <textarea
              value={brief[field] || ''}
              onChange={(event) => updateField(field, event.target.value)}
              placeholder={placeholder}
              rows={field === 'proof' || field === 'stopTopics' ? 3 : 2}
            />
          </label>
        ))}
      </div>
    </section>
  );
}

function CreatorAssistant({ notify }) {
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
  const [messages, setMessages] = useState(seedMessages);
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
    setMessages((current) => [...current, ['user', clean], ['assistant', 'Думаю як продюсер: звіряю brief, тренди, ризики й наступний крок...']]);
    setInput('');
    setIsThinking(true);
    try {
      const response = await fetch(`${API_BASE}/workspaces/ws_demo_ua/agent/chat`, {
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
          ? ['assistant', `Не зміг дістатися до AI-провайдера: ${agentError.message}. Але логіка готова: додай/перевір GEMINI_API_KEY у Railway Variables і зроби redeploy.`]
          : item
      )));
    } finally {
      setIsThinking(false);
    }
  };

  const latestAssistantText = [...messages].reverse().find(([role]) => role === 'assistant')?.[1] || '';
  const extractIdeaTitle = (text) => {
    const line = String(text || '').split('\n').map((item) => item.trim()).find((item) => item && !item.startsWith('Ок.') && !item.startsWith('Привіт'));
    return (line || 'AI assistant idea').replace(/^[0-9.)\s-]+/, '').slice(0, 120);
  };

  const saveAssistantIdea = async () => {
    return runAgentAction('save_idea');
    try {
      const response = await fetch(`${API_BASE}/workspaces/ws_demo_ua/ideas`, {
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
      const response = await fetch(`${API_BASE}/workspaces/ws_demo_ua/ideas/${lastIdeaId}/generate-script`, { method: 'POST' });
      if (!response.ok) throw new Error('script_failed');
      notify('Сценарій створено з ідеї.');
    } catch {
      notify('Не вдалося створити сценарій.');
    }
  };

  const createVideoTask = async () => {
    return runAgentAction('create_video_job');
    try {
      const response = await fetch(`${API_BASE}/workspaces/ws_demo_ua/video-jobs`, {
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
      const response = await fetch(`${API_BASE}/workspaces/ws_demo_ua/agent/actions`, {
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
    <section className="page">
      <PageTitle
        title="Асистент блогера"
        subtitle="Допомагає з ідеями, сценаріями, зйомкою, монтажним ТЗ, контент-планом, коментарями й адаптацією трендів під Україну."
        actions={<button className="dark" onClick={() => sendMessage('Збери мені повний контент-план на тиждень')} disabled={isThinking}><Sparkles size={16} />Сформувати контент-план</button>}
      />
      <AgentPipeline />
      <BrandBrain notify={notify} />
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
            <button type="button" onClick={generateScriptFromSavedIdea} disabled={isThinking || actionStatus || !latestAssistantText}>Зробити сценарій</button>
            <button type="button" onClick={createVideoTask} disabled={isThinking || actionStatus || !latestAssistantText}>Створити video task</button>
            {lastIdeaId && <small>Остання ідея: {lastIdeaId}</small>}
          </div>
        </div>
        <aside className="assistant-tools">
          <div className="panel-title"><strong>Може зробити</strong><span>{agentMeta.provider} · {agentMeta.model}</span></div>
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

function LaunchRoadmap({ notify }) {
  const steps = [
    ['1', 'Точка Б', 'Говоряща голова: покажи результат після запуску. Наклейка: “хочу так само?”. Візуал: скрін результату або до/після.'],
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

  return (
    <section className="page">
      <PageTitle
        title="Запуски"
        subtitle="Конструктор прогріву на 11 кроків: конкретні сценарії для сторіс, Reels, постів, тригерів, CTA і дедлайнів."
        actions={<><button onClick={() => notify('Підготовлено тригери попиту для 9-го етапу')}><Sparkles size={16} />Сформувати тригери</button><button className="dark" onClick={() => notify('План запуску зібрано в чернетку')}><Rocket size={16} />Сформувати запуск</button></>}
      />
      <div className="launch-layout">
        <div className="launch-roadmap">
          {steps.map(([day, title, text]) => (
            <article className="launch-step" key={day}>
              <span>{day}</span>
              <div>
                <strong>{title}</strong>
                <p>{text}</p>
              </div>
            </article>
          ))}
        </div>
        <aside className="right-panel launch-panel">
          <div className="panel-title"><strong>План на день</strong><span>3 формати</span></div>
          <div className="status-list">
            <em>Сторіс-прогрів</em>
            <em>Reels для охоплення</em>
            <em>Пост або карусель</em>
            <em>CTA і тригери</em>
            <em>FAQ для Direct</em>
          </div>
          <div className="mini-stack">
            <strong>FOMO для 9-го етапу</strong>
            {fomo.map((item) => <span key={item}>{item}</span>)}
          </div>
          <p>Одна ідея розкладається у кілька форматів, щоб прогрів не жив окремо від контент-плану.</p>
        </aside>
      </div>
    </section>
  );
}

function ContentPlan({ plans, openModal, notify }) {
  const days = useMemo(() => Array.from({ length: 35 }, (_, i) => i + 1), []);
  return (
    <section className="page page-content-plan">
      <PageTitle title="Контент-план" subtitle="План, зйомки, публікації й результати в одному календарі за київським часом." actions={<><button onClick={() => notify('Пакет сформовано з відібраних ідей')}>Сформувати пакет</button><button onClick={() => notify('Тижневий план сформовано')}>Тижневий план</button><button className="dark" onClick={() => openModal('post')}><Plus size={16} />Новий пост</button></>} />
      <div className="stats">
        {['Усього 4', 'Готово в batch 4', 'Знято 0', 'Опубліковано 0', 'Потрібен розбір 0'].map((item) => <div key={item}><span>{item.split(' ').slice(0, -1).join(' ')}</span><strong>{item.split(' ').at(-1)}</strong></div>)}
      </div>
      <div className="calendar-layout">
        <div className="calendar-card">
          <div className="calendar-top"><ChevronLeft size={16} /><strong>Травень 2026</strong><button onClick={() => notify('Повернулись до сьогодні')}>Сьогодні</button><div className="legend"><span>Відібрано</span><span>У batch</span><span>Знято</span><span>Залито</span></div></div>
          <div className="weekdays">{['НД','ПН','ВТ','СР','ЧТ','ПТ','СБ'].map((d) => <b key={d}>{d}</b>)}</div>
          <div className="calendar-grid">{days.map((day) => <div key={day}><span>{day}</span>{day === 9 && <em>1</em>}</div>)}</div>
        </div>
        <aside className="right-panel plan-panel">
          <div className="panel-title"><strong>Планові пости</strong><span>1</span></div>
          {plans.map((plan) => <article className="mini-card" key={plan[0]}><div className="mini-thumb" /><div><strong>{plan[0]}</strong><small>{plan[1]} · {plan[2]}</small></div></article>)}
        </aside>
      </div>
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

function SalesDirect({ notify }) {
  const leads = [
    ['@olena_brand', 'теплий', 'консультація', 'потрібна консультація', 'відповісти протягом 10 хв'],
    ['@max_ecom', 'гарячий', 'покупка', 'готовий купити', 'дати пакет і лінк'],
    ['@studio_lviv', 'новий', 'підтримка', 'питання по бронюванню', 'авто-FAQ без алерту'],
    ['@ira_course', 'ризик', 'скарга', 'потрібна людина', 'передати менеджеру'],
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
        actions={<button className="dark" onClick={() => notify('AI Direct увімкнено в тестовому режимі')}><MessageSquareText size={16} />Увімкнути AI Direct</button>}
      />
      <div className="sales-layout">
        <article className="sales-card">
          <small>Правило безпеки</small>
          <h2>AI допомагає продавати 24/7, але критичні відповіді й оплати мають проходити через правила бренду.</h2>
          <p>Асистент відповідає у Tone of Voice, збирає намір, тегує ліда і пропонує наступний крок: консультація, вебінар, оплата або ручний менеджер.</p>
        </article>
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
            <span>{temp}</span>
            <p>{intent}</p>
            <em>{tag}</em>
            <em>{action}</em>
          </article>
        ))}
      </div>
      <article className="insight-card sales-rules">
        <small>Автоматизація без шуму</small>
        <h3>Прості FAQ не створюють задачі продюсеру</h3>
        <p>AI відповідає на часті питання одразу, але гарячі покупки, скарги, повернення, нестандартні умови й ризикові повідомлення передає людині з CRM-тегом і контекстом.</p>
      </article>
    </section>
  );
}

function AnalysisSetup({ notify }) {
  const modes = [
    ['Свій бізнес', 'Ніша, гео, продукт, сезонність, конкуренти.'],
    ['SMM-клієнт', 'Окремий workspace, ринки й джерела сигналів.'],
    ['Конкуренти', 'Handles, аномалії, вступні сигнали і механіки для адаптації.'],
    ['Тренди ніші', 'Пошук релевантних форматів за нішею і ринком.'],
  ];
  const businessTypes = [
    ['Кафе / ресторан', 'меню, бронювання, відгуки, локальні події'],
    ['Магазин одягу', 'дропи, образи, залишки розмірів, Direct-продажі'],
    ['Салон / beauty', 'вільні вікна, до/після, майстри, довіра'],
    ['Експерт / блогер', 'прогрів, кейси, консультації, освітній контент'],
    ['E-commerce', 'каталог, bundles, UGC, retargeting-креативи'],
    ['Локальна послуга', 'географія, сезонність, записи, рекомендації'],
  ];
  const sourceRules = [
    ['Особистий feed', 'не база', 'Може бути inspiration, але не керує бізнес-стратегією.'],
    ['Бізнес-профіль', 'основа', 'Пости, рілси, insights, коментарі, сторіс і Direct після дозволу.'],
    ['Конкуренти', 'сигнали', 'Handles, ніші, ринки, аномалії, вступні сигнали і механіки.'],
    ['Brief', 'фільтр', 'Тип бізнесу, ЦА, продукт, Tone of Voice, цілі й стоп-теми.'],
  ];

  return (
    <div className="analysis-setup">
      <article className="analysis-hero">
        <small>Як тулза аналізує акаунти</small>
        <h2>Аналіз стартує з brief, а не з мемної стрічки.</h2>
        <p>Користувач задає ціль, бізнес, нішу, ринки й джерела. Система підбирає релевантні рілси, конкурентів і вступні сигнали під конкретну роль.</p>
      </article>
      <div className="analysis-grid">
        {modes.map(([title, text]) => (
          <button key={title} onClick={() => notify(`${title}: режим аналізу обрано`)}>
            <strong>{title}</strong>
            <span>{text}</span>
          </button>
        ))}
      </div>
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
      <div className="source-rules">
        {sourceRules.map(([title, tag, text]) => (
          <article key={title}>
            <em>{tag}</em>
            <h3>{title}</h3>
            <p>{text}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

function DataSources({ sources, notify }) {
  const pipeline = [
    ['1. Авторизація', 'Бізнес або блогер підключає професійний Instagram-акаунт через Meta Login і дає потрібні дозволи.'],
    ['2. Авто-sync', 'Система за розкладом тягне дозволені Reels, insights, captions, коментарі, mentions і статуси публікацій.'],
    ['3. Розбір AI', 'Модель аналізує метрики, перші секунди, caption, коментарі, транскрипт, мову, ринок і тему.'],
    ['4. Людський вибір', 'Продюсер відмічає: approve, reject, remix, в контент-план, потрібен розбір.'],
    ['5. Навчання', 'Система враховує рішення людини, стиль бренду, сильні сигнали й краще ранжує наступні рілси.'],
  ];
  const authSteps = [
    ['Підключення акаунта', 'Клієнт логіниться через Instagram, обирає Creator або Business акаунт і підтверджує permissions.'],
    ['Фоновий збір', 'Бекенд запускає sync job: нові рілси, доступні insights, коментарі, captions, mentions, статуси.'],
    ['AI-обробка', 'Черга аналізу створює транскрипт, scoring, ідеї, ризики копіювання і UA-адаптації.'],
    ['Дії користувача', 'Людина сортує, а система навчається на approve/reject/remix/plan.'],
  ];
  const syncDepth = [
    ['Reels і пости', 'caption, insights, коментарі, обкладинки, статуси публікацій'],
    ['Сторіс', 'перегляди, відповіді, кліки, sticker taps, прогрів перед продажем'],
    ['Прямі ефіри', 'транскрипти, питання глядачів, моменти для нарізки'],
    ['Direct і коментарі', 'намір, FAQ, CRM-теги, передача менеджеру'],
  ];
  const safetyRules = [
    ['Людські затримки', 'відповіді не летять миттєво однаковим патерном, темп залежить від типу діалогу'],
    ['Ліміти дій', 'добові обмеження на відповіді, коментарі, sync jobs і повторні звернення'],
    ['Ручний контроль', 'скарги, оплати, юридичні питання й нестандартні кейси йдуть людині'],
  ];

  return (
    <section className="page">
      <PageTitle
        title="Джерела даних"
        subtitle="Продюсер бере акаунти, рілси, метрики й транскрипти з дозволених ринків: Україна, США, Європа, global."
        actions={<button className="dark" onClick={() => notify('Майстер підключення джерела відкриється після backend-інтеграції')}><Plus size={16} />Підключити джерело</button>}
      />
      <AnalysisSetup notify={notify} />
      <div className="source-grid">
        {sources.map(([title, description, status]) => (
          <article className="insight-card source-card" key={title}>
            <Database size={22} />
            <h3>{title}</h3>
            <p>{description}</p>
            <em>{status}</em>
          </article>
        ))}
      </div>
      <div className="source-grid">
        {syncDepth.map(([title, text]) => (
          <article className="insight-card source-card" key={title}>
            <CircleCheck size={22} />
            <h3>{title}</h3>
            <p>{text}</p>
            <em>глибина sync</em>
          </article>
        ))}
      </div>
      <div className="insight-card pipeline-card">
        <small>Правило продукту</small>
        <h3>Скаутимо глобальні тренди, але фінальний сценарій завжди українською і для української аудиторії.</h3>
        <p>Ринки США та Європи потрібні як джерело механік, форматів і вступних сигналів. У список потрапляють тільки релевантні та модеровані джерела.</p>
      </div>
      <div className="safety-grid">
        {safetyRules.map(([title, text]) => (
          <article className="insight-card" key={title}>
            <ShieldCheck size={22} />
            <h3>{title}</h3>
            <p>{text}</p>
          </article>
        ))}
      </div>
      <div className="auth-flow">
        <div>
          <small>Ідеальний автоматичний режим</small>
          <h3>Користувач авторизує професійний Instagram-акаунт, далі система працює сама в межах дозволів Meta.</h3>
        </div>
        <div className="auth-steps">
          {authSteps.map(([title, text]) => (
            <article key={title}>
              <strong>{title}</strong>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </div>
      <div className="pipeline-board">
        {pipeline.map(([title, text]) => (
          <article className="pipeline-step" key={title}>
            <strong>{title}</strong>
            <p>{text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function LegalSafe({ notify }) {
  const docs = [
    ['Партнерська угода', 'блогер + продюсер', 'частки, ролі, доступи, KPI, вихід із партнерства'],
    ['Договір підрядника', 'монтажер / дизайнер / таргетолог', 'дедлайни, правки, NDA, передача матеріалів'],
    ['Оферта продукту', 'курс / консультація / клуб', 'умови продажу, повернення, доступ, відповідальність'],
    ['Політика Direct', 'AI-асистент і менеджери', 'що можна обіцяти, коли передавати людині, стоп-теми'],
  ];

  return (
    <section className="page">
      <PageTitle
        title="Юридичний сейф"
        subtitle="Шаблони документів і правила безпеки для запусків, партнерств, підрядників та AI Direct."
        actions={<button className="dark" onClick={() => notify('Чернетку юридичного пакета зібрано')}><ShieldCheck size={16} />Зібрати пакет</button>}
      />
      <div className="vault-grid">
        {docs.map(([title, type, text]) => (
          <article className="vault-card" key={title}>
            <ShieldCheck size={22} />
            <small>{type}</small>
            <h3>{title}</h3>
            <p>{text}</p>
            <button onClick={() => notify(`${title}: шаблон додано в чернетки`)}>Створити шаблон</button>
          </article>
        ))}
      </div>
      <article className="insight-card">
        <small>Для ТЗ</small>
        <h3>AI не замінює юриста, але готує структуру документа</h3>
        <p>Система збирає дані проекту, ролі, бюджет, терміни, права на контент і формує чернетку, яку можна передати юристу або власнику бізнесу на перевірку.</p>
      </article>
    </section>
  );
}

function BudgetCalculator({ notify }) {
  const rows = [
    ['Бажаний чистий прибуток', '₴300 000'],
    ['Середній чек', '₴8 500'],
    ['Потрібно продажів', '36'],
    ['Плановий CAC', '₴900'],
    ['Бюджет на трафік', '₴32 400'],
    ['Продакшен', '₴18 000'],
  ];

  return (
    <section className="page">
      <PageTitle
        title="Бюджетний калькулятор"
        subtitle="Фінансова модель запуску: прибуток, CAC, трафік, продакшен, команда і точка окупності."
        actions={<button className="dark" onClick={() => notify('Фінансову модель запуску перераховано')}><Calculator size={16} />Перерахувати</button>}
      />
      <div className="budget-layout">
        <article className="budget-hero">
          <small>План запуску</small>
          <h2>Щоб заробити ₴300 000 чистими, потрібно 36 продажів і контроль CAC до ₴900.</h2>
          <p>Калькулятор пов'язує контент і продажі: скільки охоплень треба, яка конверсія в Direct, скільки гарячих лідів потрібно менеджеру і який бюджет можна витратити без просадки ROI.</p>
        </article>
        <div className="budget-table">
          {rows.map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
      <div className="budget-scenarios">
        <article className="insight-card"><h3>Сценарій conservative</h3><p>Нижчий reach, CAC вище плану, потрібен довший прогрів і більше proof-контенту.</p></article>
        <article className="insight-card"><h3>Сценарій aggressive</h3><p>Більше трафіку, швидший Direct, частина ризиків передається менеджеру й юридичному сейфу.</p></article>
      </div>
      </div>
    </section>
  );
}

function TeamHub({ notify }) {
  const team = [
    ['Продюсер', 'стратегія, офер, запуск', 'затверджує'],
    ['SMM', 'календар, сторіс, публікації', 'в роботі'],
    ['Монтажер', 'Reels, субтитри, обкладинки', 'дедлайн сьогодні'],
    ['Менеджер Direct', 'гарячі ліди, скарги, оплати', 'черга 6'],
  ];

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
            <em>{status}</em>
          </article>
        ))}
      </div>
      <div className="quality-board">
        {['Хук у перші 2 секунди', 'Є CTA', 'Немає ризику копіювання', 'Підходить Tone of Voice', 'Передано в календар'].map((item) => (
          <article className="insight-card" key={item}>
            <CircleCheck size={20} />
            <strong>{item}</strong>
          </article>
        ))}
      </div>
    </section>
  );
}

function PageTitle({ title, subtitle, actions }) {
  return (
    <div className="page-title">
      <div><h1>{title}</h1><p>{subtitle}</p></div>
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

createRoot(document.getElementById('root')).render(<App />);
