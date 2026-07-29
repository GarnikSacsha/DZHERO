import React, { useState } from 'react';
import {
  ArrowUpDown,
  Bell,
  Bookmark,
  Bot,
  CalendarDays,
  ChevronDown,
  Compass,
  Eye,
  Filter,
  FolderKanban,
  Globe2,
  Grid2X2,
  Heart,
  List,
  Menu,
  Moon,
  Plus,
  Search,
  Settings,
  Sparkles,
  Sun,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react';

import logoImg from '../logo-mark.svg';
import { useI18n } from '../i18nProvider.mjs';
import ProductChannelsPreview from './ProductChannelsPreview.jsx';
import ProductContentPlanPreview from './ProductContentPlanPreview.jsx';
import ProductSettingsPreview from './ProductSettingsPreview.jsx';
import ProductStudioPreview from './ProductStudioPreview.jsx';

const NAV_ITEMS = Object.freeze([
  { id: 'discover', label: 'product.nav.discover', icon: Compass },
  { id: 'channels', label: 'product.nav.channels', icon: Globe2 },
  { id: 'studio', label: 'product.nav.studio', icon: FolderKanban },
  { id: 'agent', label: 'product.nav.agentStudio', icon: Bot, disabled: true, badge: 'product.nav.soon' },
  { id: 'plan', label: 'product.nav.contentPlan', icon: CalendarDays },
  { id: 'settings', label: 'product.nav.settings', icon: Settings, divider: true },
]);

const SIGNAL_CARDS = Object.freeze([
  {
    id: 'agents',
    visual: 'agents',
    match: '98%',
    country: 'USA',
    platform: 'YouTube',
    creator: 'product.cards.agents.creator',
    handle: 'product.cards.agents.handle',
    title: 'product.cards.agents.title',
    views: '1.2M',
    likes: '45K',
    trend: '9.8',
    initials: 'TA',
  },
  {
    id: 'minimalism',
    visual: 'minimalism',
    match: '89%',
    country: 'UK',
    platform: 'Instagram',
    creator: 'product.cards.minimalism.creator',
    handle: 'product.cards.minimalism.handle',
    title: 'product.cards.minimalism.title',
    views: '850K',
    likes: '120K',
    trend: '8.4',
    initials: 'LL',
  },
  {
    id: 'markets',
    visual: 'markets',
    match: '74%',
    country: 'JP',
    platform: 'TikTok',
    creator: 'product.cards.markets.creator',
    handle: 'product.cards.markets.handle',
    title: 'product.cards.markets.title',
    views: '4.1M',
    likes: '890K',
    trend: '7.2',
    initials: 'TE',
  },
]);

function ProductSidebar({
  activeTab,
  setActiveTab,
  language,
  setLanguage,
  theme,
  onToggleTheme,
  mobileOpen,
  setMobileOpen,
}) {
  const { t } = useI18n();

  return (
    <>
      <aside className={`product-sidebar ${mobileOpen ? 'open' : ''}`}>
        <div className="product-sidebar-brand">
          <span><img src={logoImg} alt="" /></span>
          <div>
            <strong>{t('landing.brand.name')}</strong>
            <small>{t('product.brand.subtitle')}</small>
          </div>
          <button className="product-sidebar-mobile-close" type="button" aria-label={t('product.actions.closeMenu')} onClick={() => setMobileOpen(false)}>
            <X size={19} />
          </button>
        </div>

        <nav className="product-sidebar-nav" aria-label={t('product.nav.label')}>
          {NAV_ITEMS.map((item, index) => {
            const Icon = item.icon;
            return (
              <React.Fragment key={item.id}>
                {index === 3 && <span className="product-sidebar-section">{t('product.nav.tools')}</span>}
                {item.divider && <span className="product-sidebar-divider" />}
                <button
                  type="button"
                  className={activeTab === item.id ? 'active' : ''}
                  disabled={item.disabled}
                  onClick={() => {
                    setActiveTab(item.id);
                    setMobileOpen(false);
                  }}
                >
                  <Icon size={19} />
                  <span>{t(item.label)}</span>
                  {item.badge && <em>{t(item.badge)}</em>}
                </button>
              </React.Fragment>
            );
          })}
        </nav>

        <div className="product-sidebar-footer">
          <button className="product-upgrade-button" type="button">
            <Zap size={17} />{t('product.actions.upgrade')}
          </button>
          <div className="product-sidebar-preferences">
            <div className="language-switch marketing-language-switch" aria-label={t('language.interface')}>
              <button type="button" className={language === 'uk' ? 'active' : ''} onClick={() => setLanguage('uk')}>UA</button>
              <button type="button" className={language === 'en' ? 'active' : ''} onClick={() => setLanguage('en')}>EN</button>
            </div>
            <button type="button" title={t('landing.actions.theme')} aria-label={t('landing.actions.theme')} onClick={onToggleTheme}>
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
          <div className="product-user-card">
            <span>AR</span>
            <div>
              <strong>{t('product.mock.userName')}</strong>
              <small>{t('product.mock.userRole')}</small>
            </div>
          </div>
        </div>
      </aside>
      {mobileOpen && <button className="product-sidebar-backdrop" type="button" aria-label={t('product.actions.closeMenu')} onClick={() => setMobileOpen(false)} />}
    </>
  );
}

function ProductTopbar({ activeTab, setMobileOpen, onAddChannel }) {
  const { t } = useI18n();
  const isChannels = activeTab === 'channels';
  const isStudio = activeTab === 'studio';
  const isPlan = activeTab === 'plan';
  const isSettings = activeTab === 'settings';

  return (
    <header className="product-topbar">
      <button className="product-mobile-menu" type="button" aria-label={t('product.actions.openMenu')} onClick={() => setMobileOpen(true)}>
        <Menu size={20} />
      </button>
      {!isPlan && !isSettings && (
        <label className="product-search">
          <Search size={18} />
          <input type="search" placeholder={t(isChannels ? 'product.channels.search' : isStudio ? 'product.studio.search' : 'product.search.placeholder')} />
        </label>
      )}
      {isChannels ? (
        <div className="product-topbar-actions product-channel-topbar-actions">
          <button className="secondary" type="button"><Filter size={16} />{t('product.channels.actions.filters')}</button>
          <button className="secondary" type="button"><ArrowUpDown size={16} />{t('product.channels.actions.sort')}</button>
          <button className="create" type="button" onClick={onAddChannel}><Plus size={17} />{t('product.channels.actions.add')}</button>
        </div>
      ) : (isStudio || isPlan || isSettings) ? (
        <div className="product-topbar-actions studio-topbar-actions">
          <button className="icon" type="button" aria-label={t('product.actions.notifications')}><Bell size={18} /><i /></button>
          {isPlan && <button className="secondary studio-export-button" type="button">{t('product.studio.export')}</button>}
        </div>
      ) : (
        <>
          <div className="product-filters">
            <button type="button">{t('product.filters.platform')}<ChevronDown size={15} /></button>
            <button type="button">{t('product.filters.country')}<ChevronDown size={15} /></button>
            <button className="active" type="button">{t('product.filters.aiMatch')}<Sparkles size={14} /></button>
          </div>
          <div className="product-topbar-actions">
            <button className="icon" type="button" aria-label={t('product.actions.notifications')}><Bell size={18} /><i /></button>
          </div>
        </>
      )}
    </header>
  );
}

function SignalCard({ card, onOpenStudio }) {
  const { t } = useI18n();

  return (
    <article className="product-signal-card">
      <div className={`product-signal-visual ${card.visual}`}>
        <div className="product-signal-art" aria-hidden="true"><i /><i /><i /></div>
        <span className="product-match-badge"><Sparkles size={14} />{card.match} {t('product.cards.match')}</span>
        <div className="product-signal-tags">
          <span>{card.country}</span>
          <span>{card.platform}</span>
        </div>
      </div>
      <div className="product-signal-body">
        <div className="product-signal-author">
          <span>{card.initials}</span>
          <div>
            <strong>{t(card.creator)}</strong>
            <small>{t(card.handle)}</small>
          </div>
        </div>
        <h3>{t(card.title)}</h3>
        <div className="product-signal-metrics">
          <span><Eye size={16} />{card.views}</span>
          <span><Heart size={16} />{card.likes}</span>
          <span><TrendingUp size={16} />{card.trend}</span>
        </div>
        <div className="product-signal-actions">
          <button type="button" onClick={onOpenStudio}>{t('product.actions.openStudio')}</button>
          <button type="button" aria-label={t('product.actions.save')}><Bookmark size={17} /></button>
        </div>
      </div>
    </article>
  );
}

function ProductUtilityRail() {
  const { t } = useI18n();

  return (
    <aside className="product-utility-rail">
      <section className="product-rail-section">
        <header><strong>{t('product.creators.title')}</strong><button type="button">{t('product.actions.seeAll')}</button></header>
        <div className="product-creators-list">
          <div><span>MB</span><p><strong>{t('product.creators.first')}</strong><small>{t('product.creators.firstRole')}</small></p><TrendingUp size={16} /></div>
          <div><span>SC</span><p><strong>{t('product.creators.second')}</strong><small>{t('product.creators.secondRole')}</small></p><TrendingUp size={16} /></div>
        </div>
      </section>

      <section className="product-rail-section">
        <header><strong>{t('product.trends.title')}</strong></header>
        <div className="product-trends-list">
          <button type="button"><strong>#GenerativeVideo</strong><small>{t('product.trends.first')}</small></button>
          <button type="button"><strong>#SaaSMarketing</strong><small>{t('product.trends.second')}</small></button>
          <button type="button"><strong>#CreatorEconomy</strong><small>{t('product.trends.third')}</small></button>
        </div>
      </section>

    </aside>
  );
}

function DiscoverHome({ onOpenStudio }) {
  const { t } = useI18n();

  return (
    <div className="product-discover-layout">
      <section className="product-discover-content">
        <header className="product-page-heading">
          <div>
            <h1>{t('product.discover.title')}</h1>
            <p>{t('product.discover.subtitle')}</p>
          </div>
          <div>
            <button className="active" type="button" aria-label={t('product.actions.gridView')}><Grid2X2 size={18} /></button>
            <button type="button" aria-label={t('product.actions.listView')}><List size={18} /></button>
          </div>
        </header>
        <div className="product-signals-grid">
          {SIGNAL_CARDS.map((card) => <SignalCard key={card.id} card={card} onOpenStudio={onOpenStudio} />)}
        </div>
      </section>
      <ProductUtilityRail />
    </div>
  );
}

function EmptyProductTab({ activeTab }) {
  const { t } = useI18n();
  const item = NAV_ITEMS.find((candidate) => candidate.id === activeTab) || NAV_ITEMS[0];
  const Icon = item.icon;

  return (
    <section className="product-tab-placeholder">
      <span><Icon size={28} /></span>
      <small>{t('product.placeholder.eyebrow')}</small>
      <h1>{t(item.label)}</h1>
      <p>{t('product.placeholder.body')}</p>
    </section>
  );
}

export default function ProductHomePreview({
  language,
  setLanguage,
  theme,
  onToggleTheme,
}) {
  const [activeTab, setActiveTab] = useState(() => {
    const requestedTab = new URLSearchParams(window.location.search).get('tab');
    return NAV_ITEMS.some((item) => item.id === requestedTab && !item.disabled) ? requestedTab : 'discover';
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [addChannelOpen, setAddChannelOpen] = useState(false);

  return (
    <main className="product-shell-preview">
      <ProductSidebar
        activeTab={activeTab}
        setActiveTab={(nextTab) => {
          setActiveTab(nextTab);
          if (nextTab !== 'channels') setAddChannelOpen(false);
        }}
        language={language}
        setLanguage={setLanguage}
        theme={theme}
        onToggleTheme={onToggleTheme}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
      />
      <section className="product-shell-main">
        <ProductTopbar activeTab={activeTab} setMobileOpen={setMobileOpen} onAddChannel={() => setAddChannelOpen(true)} />
        {activeTab === 'discover' && <DiscoverHome onOpenStudio={() => setActiveTab('studio')} />}
        {activeTab === 'channels' && <ProductChannelsPreview addOpen={addChannelOpen} onCloseAdd={() => setAddChannelOpen(false)} />}
        {activeTab === 'studio' && <ProductStudioPreview />}
        {activeTab === 'plan' && <ProductContentPlanPreview />}
        {activeTab === 'settings' && <ProductSettingsPreview language={language} setLanguage={setLanguage} theme={theme} onToggleTheme={onToggleTheme} />}
        {!['discover', 'channels', 'studio', 'plan', 'settings'].includes(activeTab) && <EmptyProductTab activeTab={activeTab} />}
      </section>
    </main>
  );
}
