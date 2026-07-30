import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  ArrowUpDown,
  Bell,
  Bookmark,
  Bot,
  CalendarDays,
  Clock3,
  Compass,
  Eye,
  Filter,
  FolderKanban,
  Gauge,
  Globe2,
  Grid2X2,
  Heart,
  Info,
  List,
  Menu,
  Moon,
  Plus,
  Radio,
  Search,
  Settings,
  Sparkles,
  Sun,
  X,
  Zap,
} from 'lucide-react';

import logoImg from '../logo-mark.svg';
import { useI18n } from '../i18nProvider.mjs';
import {
  DEFAULT_SIGNAL_FILTERS,
  filterSignalCards,
  findSignalBySourceUrl,
  getSupportedSignalPlatform,
  sortSignalCards,
} from '../productSignalsViewState.mjs';
import {
  PRODUCT_UNASSIGNED_BRAND_ID,
  createProductBrandId,
  readActiveBrandId,
  readCreditState,
  readProductBrands,
  resolveActiveBrandId,
  upsertProductBrand,
  writeActiveBrandId,
  writeProductBrands,
} from '../productSettingsState.mjs';
import { buildSignalStrengthEvidence } from '../signalIntelligenceState.mjs';
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

const SAVED_SIGNALS_STORAGE_KEY = 'dzhero-preview-product-saved-signals-v1';

const SIGNAL_CARDS = Object.freeze([
  {
    id: 'agents',
    visual: 'agents',
    creatorId: 'techinsights-ai',
    country: 'USA',
    platform: 'YouTube',
    platformId: 'youtube',
    niche: 'technology',
    creator: 'product.cards.agents.creator',
    handle: 'product.cards.agents.handle',
    title: 'product.cards.agents.title',
    views: '1.2M',
    viewsValue: 1_200_000,
    likes: '45K',
    likesValue: 45_000,
    ageHours: 2,
    publishedOrder: 3,
    sourceUrl: 'https://youtube.com/shorts/dzhero-agents',
    initials: 'TA',
  },
  {
    id: 'minimalism',
    visual: 'minimalism',
    creatorId: 'luxeliving',
    country: 'UK',
    platform: 'Instagram',
    platformId: 'instagram',
    niche: 'lifestyle',
    creator: 'product.cards.minimalism.creator',
    handle: 'product.cards.minimalism.handle',
    title: 'product.cards.minimalism.title',
    views: '850K',
    viewsValue: 850_000,
    likes: '120K',
    likesValue: 120_000,
    ageHours: 5,
    publishedOrder: 2,
    sourceUrl: 'https://instagram.com/reel/dzhero-minimalism',
    initials: 'LL',
  },
  {
    id: 'markets',
    visual: 'markets',
    creatorId: 'tokyoeat',
    country: 'JP',
    platform: 'TikTok',
    platformId: 'tiktok',
    niche: 'food',
    creator: 'product.cards.markets.creator',
    handle: 'product.cards.markets.handle',
    title: 'product.cards.markets.title',
    views: '4.1M',
    viewsValue: 4_100_000,
    likes: '890K',
    likesValue: 890_000,
    ageHours: 28,
    publishedOrder: 1,
    sourceUrl: 'https://tiktok.com/@dzhero/video/7400000000000000000',
    initials: 'TE',
  },
]);

function readSavedSignals() {
  try {
    const value = JSON.parse(window.localStorage.getItem(SAVED_SIGNALS_STORAGE_KEY) || '[]');
    return new Set(Array.isArray(value) ? value.filter((id) => SIGNAL_CARDS.some((card) => card.id === id)) : []);
  } catch {
    return new Set();
  }
}

function ProductSidebar({
  activeTab,
  setActiveTab,
  language,
  setLanguage,
  theme,
  onToggleTheme,
  mobileOpen,
  setMobileOpen,
  brands,
  activeBrandId,
  onSelectBrand,
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
          <label className="product-active-brand">
            <span><FolderKanban size={16} /></span>
            <div>
              <small>{t('product.brandContext.label')}</small>
              <select
                value={activeBrandId}
                disabled={brands.length === 0}
                aria-label={t('product.brandContext.label')}
                onChange={(event) => onSelectBrand(event.target.value)}
              >
                {brands.length === 0 && <option value="">{t('product.brandContext.empty')}</option>}
                {brands.map((brand) => <option value={brand.id} key={brand.id}>{brand.name}</option>)}
              </select>
            </div>
          </label>
          <div className="product-sidebar-preferences">
            <div className="language-switch marketing-language-switch" aria-label={t('language.interface')}>
              <button type="button" className={language === 'uk' ? 'active' : ''} onClick={() => setLanguage('uk')}>UA</button>
              <button type="button" className={language === 'en' ? 'active' : ''} onClick={() => setLanguage('en')}>EN</button>
            </div>
            <button type="button" title={t('landing.actions.theme')} aria-label={t('landing.actions.theme')} onClick={onToggleTheme}>
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </div>
      </aside>
      {mobileOpen && <button className="product-sidebar-backdrop" type="button" aria-label={t('product.actions.closeMenu')} onClick={() => setMobileOpen(false)} />}
    </>
  );
}

function ProductTopbar({
  activeTab,
  setMobileOpen,
  onAddChannel,
  signalUrl,
  signalSearchStatus,
  onSignalUrlChange,
  onSignalUrlSubmit,
  channelQuery,
  onChannelQueryChange,
  notificationsOpen,
  onToggleNotifications,
  onCloseNotifications,
  onExportPlan,
}) {
  const { t } = useI18n();
  const isChannels = activeTab === 'channels';
  const isStudio = activeTab === 'studio';
  const isPlan = activeTab === 'plan';
  const isSettings = activeTab === 'settings';
  const notifications = (
    <div className="product-notifications-anchor">
      <button
        className="icon"
        type="button"
        aria-label={t('product.actions.notifications')}
        aria-expanded={notificationsOpen}
        onClick={onToggleNotifications}
      >
        <Bell size={18} />
      </button>
      {notificationsOpen && (
        <section className="product-notifications-popover" role="dialog" aria-label={t('product.notifications.title')}>
          <header>
            <strong>{t('product.notifications.title')}</strong>
            <button type="button" aria-label={t('product.notifications.close')} onClick={onCloseNotifications}><X size={17} /></button>
          </header>
          <div>
            <Bell size={22} />
            <strong>{t('product.notifications.emptyTitle')}</strong>
            <p>{t('product.notifications.emptyBody')}</p>
          </div>
        </section>
      )}
    </div>
  );

  return (
    <header className="product-topbar">
      <button className="product-mobile-menu" type="button" aria-label={t('product.actions.openMenu')} onClick={() => setMobileOpen(true)}>
        <Menu size={20} />
      </button>
      {activeTab === 'discover' ? (
        <form className="product-search product-direct-search" onSubmit={onSignalUrlSubmit}>
          <Search size={18} />
          <input
            type="url"
            inputMode="url"
            value={signalUrl}
            aria-label={t('product.search.label')}
            placeholder={t('product.search.placeholder')}
            onChange={(event) => onSignalUrlChange(event.target.value)}
          />
          <button type="submit" aria-label={t('product.search.submit')} title={t('product.search.submit')} disabled={signalSearchStatus === 'loading'}>
            <ArrowRight size={16} />
          </button>
        </form>
      ) : isChannels && (
        <label className="product-search">
          <Search size={18} />
          <input
            type="search"
            value={channelQuery}
            aria-label={t('product.channels.searchLabel')}
            placeholder={t('product.channels.search')}
            onChange={(event) => onChannelQueryChange(event.target.value)}
          />
        </label>
      )}
      {isChannels ? (
        <div className="product-topbar-actions product-channel-topbar-actions">
          {notifications}
          <button className="create" type="button" onClick={onAddChannel}><Plus size={17} />{t('product.channels.actions.add')}</button>
        </div>
      ) : (isStudio || isPlan || isSettings) ? (
        <div className="product-topbar-actions studio-topbar-actions">
          {notifications}
          {isPlan && <button className="secondary studio-export-button" type="button" onClick={onExportPlan}>{t('product.plan.actions.export')}</button>}
        </div>
      ) : (
        <div className="product-topbar-actions">
          {notifications}
        </div>
      )}
    </header>
  );
}

function SignalCard({ card, onOpenStudio, saved, onToggleSaved }) {
  const { t } = useI18n();
  const [strengthOpen, setStrengthOpen] = useState(false);
  const strengthEvidence = useMemo(() => buildSignalStrengthEvidence(card, []), [card]);
  const strengthDetailsId = `signal-strength-${card.id}`;

  return (
    <article className="product-signal-card">
      <div className={`product-signal-visual ${card.visual}`}>
        <div className="product-signal-art" aria-hidden="true"><i /><i /><i /></div>
        <span className="product-match-badge pending" title={t('product.intelligence.aiMatch.pendingBody')}>
          <Sparkles size={14} />{t('product.intelligence.aiMatch.label')}{' · '}{t('product.intelligence.aiMatch.pending')}
        </span>
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
        </div>
        <button
          className="product-signal-strength"
          type="button"
          aria-expanded={strengthOpen}
          aria-controls={strengthDetailsId}
          onClick={() => setStrengthOpen((open) => !open)}
        >
          <Gauge size={17} />
          <span>
            <small>{t('product.intelligence.strength.label')}</small>
            <strong>{t('product.intelligence.strength.needsBaseline')}</strong>
          </span>
          <Info size={15} />
        </button>
        {strengthOpen && (
          <div className="product-signal-strength-details" id={strengthDetailsId}>
            <p>{t('product.intelligence.strength.body')}</p>
            <div>
              <span className="available">{t('product.intelligence.strength.viewsAvailable')}</span>
              <span className="available">{t('product.intelligence.strength.likesAvailable')}</span>
              <span>{t('product.intelligence.strength.velocityMissing')}</span>
            </div>
            <strong>{t('product.intelligence.strength.comparableProgress', {
              count: strengthEvidence.comparableCount,
              required: strengthEvidence.requiredComparables,
            })}</strong>
            <small>{t('product.intelligence.strength.confidenceUnavailable')}</small>
            <small>{t('product.intelligence.strength.normalization')}</small>
          </div>
        )}
        <div className="product-signal-actions">
          <button type="button" onClick={() => onOpenStudio(card)}>{t('product.actions.openStudio')}</button>
          <button
            className={saved ? 'saved' : ''}
            type="button"
            aria-pressed={saved}
            aria-label={t(saved ? 'product.actions.removeSaved' : 'product.actions.save')}
            onClick={() => onToggleSaved(card.id)}
          >
            <Bookmark size={17} fill={saved ? 'currentColor' : 'none'} />
            <span>{t(saved ? 'product.actions.saved' : 'product.actions.saveShort')}</span>
          </button>
        </div>
      </div>
    </article>
  );
}

function ProductUtilityRail({ onOpenChannels }) {
  const { t } = useI18n();

  return (
    <aside className="product-utility-rail">
      <section className="product-rail-section">
        <header><strong>{t('product.intelligence.tracked.title')}</strong></header>
        <div className="product-rail-empty">
          <Radio size={20} />
          <strong>{t('product.intelligence.tracked.emptyTitle')}</strong>
          <p>{t('product.intelligence.tracked.emptyBody')}</p>
          <button type="button" onClick={onOpenChannels}>{t('product.intelligence.tracked.action')}</button>
        </div>
      </section>

      <section className="product-rail-section">
        <header><strong>{t('product.intelligence.rising.title')}</strong></header>
        <div className="product-rail-empty">
          <Clock3 size={20} />
          <strong>{t('product.intelligence.rising.emptyTitle')}</strong>
          <p>{t('product.intelligence.rising.emptyBody')}</p>
          <span>{t('product.intelligence.rising.requirement')}</span>
        </div>
      </section>

    </aside>
  );
}

function DiscoverHome({
  onOpenStudio,
  onOpenChannels,
  directSearch,
  onClearDirectSearch,
}) {
  const { t } = useI18n();
  const [filters, setFilters] = useState(DEFAULT_SIGNAL_FILTERS);
  const [sort, setSort] = useState('newest');
  const [view, setView] = useState('grid');
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
  const [savedIds, setSavedIds] = useState(readSavedSignals);

  useEffect(() => {
    window.localStorage.setItem(SAVED_SIGNALS_STORAGE_KEY, JSON.stringify([...savedIds]));
  }, [savedIds]);

  const visibleCards = useMemo(
    () => sortSignalCards(
      filterSignalCards(SIGNAL_CARDS, filters, {
        savedIds,
        directSignalId: directSearch.directSignalId,
      }),
      sort,
    ),
    [directSearch.directSignalId, filters, savedIds, sort],
  );

  const updateFilter = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const filterValues = {
    platform: {
      youtube: t('product.signals.values.youtube'),
      instagram: t('product.signals.values.instagram'),
      tiktok: t('product.signals.values.tiktok'),
    },
    niche: {
      technology: t('product.signals.values.technology'),
      lifestyle: t('product.signals.values.lifestyle'),
      food: t('product.signals.values.food'),
    },
    views: {
      views1m: t('product.signals.values.views1m'),
      views2m: t('product.signals.values.views2m'),
    },
    likes: {
      likes100k: t('product.signals.values.likes100k'),
      likes500k: t('product.signals.values.likes500k'),
    },
    date: {
      last6h: t('product.signals.values.last6h'),
      last24h: t('product.signals.values.last24h'),
    },
    creator: Object.fromEntries(SIGNAL_CARDS.map((card) => [card.id, t(card.creator)])),
    status: {
      saved: t('product.signals.values.saved'),
    },
  };
  const filterLabels = {
    platform: t('product.signals.filters.platform'),
    niche: t('product.signals.filters.niche'),
    views: t('product.signals.filters.views'),
    likes: t('product.signals.filters.likes'),
    date: t('product.signals.filters.date'),
    creator: t('product.signals.filters.creator'),
    status: t('product.signals.filters.status'),
  };
  const activeFilters = Object.entries(filters)
    .filter(([, value]) => value !== 'all')
    .map(([key, value]) => ({
      key,
      label: `${filterLabels[key]}: ${filterValues[key][value]}`,
    }));

  const clearFilters = () => setFilters(DEFAULT_SIGNAL_FILTERS);
  const toggleSaved = (cardId) => {
    setSavedIds((current) => {
      const next = new Set(current);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  };

  return (
    <div className="product-discover-layout">
      <section className="product-discover-content">
        <header className="product-page-heading">
          <div>
            <h1>{t('product.discover.title')}</h1>
            <p>{t('product.discover.subtitle')}</p>
          </div>
        </header>

        {directSearch.status !== 'idle' && (
          <div className={`product-signal-search-state ${directSearch.status}`} role={directSearch.status === 'error' ? 'alert' : 'status'}>
            <div>
              <strong>{t(`product.search.state.${directSearch.status}.title`)}</strong>
              <span>{t(directSearch.messageKey)}</span>
            </div>
            {directSearch.status !== 'loading' && (
              <button type="button" onClick={onClearDirectSearch}>{t('product.search.clear')}</button>
            )}
          </div>
        )}

        <div className="product-signals-toolbar">
          <div className="product-signals-quick-filters">
            <label>
              <span>{t('product.signals.filters.platform')}</span>
              <select value={filters.platform} onChange={(event) => updateFilter('platform', event.target.value)}>
                <option value="all">{t('product.signals.values.all')}</option>
                <option value="youtube">{t('product.signals.values.youtube')}</option>
                <option value="instagram">{t('product.signals.values.instagram')}</option>
                <option value="tiktok">{t('product.signals.values.tiktok')}</option>
              </select>
            </label>
            <label>
              <span>{t('product.signals.filters.niche')}</span>
              <select value={filters.niche} onChange={(event) => updateFilter('niche', event.target.value)}>
                <option value="all">{t('product.signals.values.all')}</option>
                <option value="technology">{t('product.signals.values.technology')}</option>
                <option value="lifestyle">{t('product.signals.values.lifestyle')}</option>
                <option value="food">{t('product.signals.values.food')}</option>
              </select>
            </label>
            <button
              className={moreFiltersOpen || activeFilters.some(({ key }) => ['views', 'likes', 'date', 'creator', 'status'].includes(key)) ? 'active' : ''}
              type="button"
              aria-expanded={moreFiltersOpen}
              onClick={() => setMoreFiltersOpen((open) => !open)}
            >
              <Filter size={16} />
              {t('product.signals.filters.open')}
              {activeFilters.length > 0 && <em>{activeFilters.length}</em>}
            </button>
          </div>
          <div className="product-signals-toolbar-actions">
            <label className="product-signals-sort">
              <ArrowUpDown size={16} />
              <span>{t('product.signals.sort.label')}</span>
              <select value={sort} onChange={(event) => setSort(event.target.value)}>
                <option value="views">{t('product.signals.sort.views')}</option>
                <option value="likes">{t('product.signals.sort.likes')}</option>
                <option value="newest">{t('product.signals.sort.newest')}</option>
              </select>
            </label>
            <div className="product-signals-view-switch" aria-label={t('product.signals.view.label')}>
              <button className={view === 'grid' ? 'active' : ''} type="button" aria-label={t('product.actions.gridView')} aria-pressed={view === 'grid'} onClick={() => setView('grid')}><Grid2X2 size={18} /></button>
              <button className={view === 'list' ? 'active' : ''} type="button" aria-label={t('product.actions.listView')} aria-pressed={view === 'list'} onClick={() => setView('list')}><List size={18} /></button>
            </div>
          </div>
        </div>

        {moreFiltersOpen && (
          <div className="product-signals-filter-panel">
            <header>
              <div>
                <strong>{t('product.signals.filters.title')}</strong>
                <span>{t('product.signals.filters.subtitle')}</span>
              </div>
              <button type="button" aria-label={t('product.signals.filters.close')} onClick={() => setMoreFiltersOpen(false)}><X size={18} /></button>
            </header>
            <div>
              <label><span>{filterLabels.views}</span><select value={filters.views} onChange={(event) => updateFilter('views', event.target.value)}><option value="all">{t('product.signals.values.any')}</option><option value="views1m">{t('product.signals.values.views1m')}</option><option value="views2m">{t('product.signals.values.views2m')}</option></select></label>
              <label><span>{filterLabels.likes}</span><select value={filters.likes} onChange={(event) => updateFilter('likes', event.target.value)}><option value="all">{t('product.signals.values.any')}</option><option value="likes100k">{t('product.signals.values.likes100k')}</option><option value="likes500k">{t('product.signals.values.likes500k')}</option></select></label>
              <label><span>{filterLabels.date}</span><select value={filters.date} onChange={(event) => updateFilter('date', event.target.value)}><option value="all">{t('product.signals.values.any')}</option><option value="last6h">{t('product.signals.values.last6h')}</option><option value="last24h">{t('product.signals.values.last24h')}</option></select></label>
              <label><span>{filterLabels.creator}</span><select value={filters.creator} onChange={(event) => updateFilter('creator', event.target.value)}><option value="all">{t('product.signals.values.all')}</option>{SIGNAL_CARDS.map((card) => <option key={card.id} value={card.id}>{t(card.creator)}</option>)}</select></label>
              <label><span>{filterLabels.status}</span><select value={filters.status} onChange={(event) => updateFilter('status', event.target.value)}><option value="all">{t('product.signals.values.all')}</option><option value="saved">{t('product.signals.values.saved')}</option></select></label>
            </div>
          </div>
        )}

        <div className="product-signals-result-row">
          <span>{t('product.signals.results', { count: visibleCards.length })}</span>
          {activeFilters.length > 0 && (
            <div className="product-signals-chips">
              {activeFilters.map((filter) => (
                <button key={filter.key} type="button" aria-label={t('product.signals.filters.remove', { filter: filter.label })} onClick={() => updateFilter(filter.key, 'all')}>
                  {filter.label}<X size={13} />
                </button>
              ))}
              <button className="clear" type="button" onClick={clearFilters}>{t('product.signals.filters.clear')}</button>
            </div>
          )}
        </div>

        {directSearch.status === 'loading' ? (
          <div className="product-signals-state loading" role="status">
            <span />
            <strong>{t('product.signals.loading.title')}</strong>
            <p>{t('product.signals.loading.body')}</p>
          </div>
        ) : visibleCards.length > 0 ? (
          <div className={`product-signals-grid ${view === 'list' ? 'product-signals-list' : ''}`} data-view={view}>
            {visibleCards.map((card) => (
              <SignalCard
                key={card.id}
                card={card}
                onOpenStudio={onOpenStudio}
                saved={savedIds.has(card.id)}
                onToggleSaved={toggleSaved}
              />
            ))}
          </div>
        ) : (
          <div className="product-signals-state empty">
            <Search size={26} />
            <strong>{t('product.signals.empty.title')}</strong>
            <p>{t('product.signals.empty.body')}</p>
            <button type="button" onClick={() => {
              clearFilters();
              onClearDirectSearch();
            }}>{t('product.signals.empty.clear')}</button>
          </div>
        )}
      </section>
      <ProductUtilityRail onOpenChannels={onOpenChannels} />
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
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [signalUrl, setSignalUrl] = useState('');
  const [channelQuery, setChannelQuery] = useState('');
  const [studioSignal, setStudioSignal] = useState(null);
  const [studioPlanDraft, setStudioPlanDraft] = useState(null);
  const [brands, setBrands] = useState(() => readProductBrands(window.localStorage));
  const [activeBrandId, setActiveBrandId] = useState(() => readActiveBrandId(window.localStorage, brands));
  const [creditState] = useState(() => readCreditState(window.localStorage));
  const [directSearch, setDirectSearch] = useState({
    status: 'idle',
    messageKey: '',
    directSignalId: '',
  });
  const directSearchTimer = useRef(null);
  const planExportRef = useRef(null);
  const activeBrand = useMemo(
    () => brands.find((brand) => brand.id === activeBrandId) || null,
    [activeBrandId, brands],
  );
  const contentPlanBrandId = activeBrandId || PRODUCT_UNASSIGNED_BRAND_ID;

  useEffect(() => () => window.clearTimeout(directSearchTimer.current), []);
  useEffect(() => {
    writeProductBrands(window.localStorage, brands);
    const resolved = writeActiveBrandId(window.localStorage, brands, activeBrandId);
    if (resolved !== activeBrandId) setActiveBrandId(resolved);
  }, [activeBrandId, brands]);

  const saveBrand = (draft) => {
    const timestamp = new Date().toISOString();
    const id = draft.id || createProductBrandId(draft.name);
    const brand = {
      ...draft,
      id,
      createdAt: draft.createdAt || timestamp,
      updatedAt: timestamp,
    };
    setBrands((current) => upsertProductBrand(current, brand));
    setActiveBrandId(id);
  };

  const selectBrand = (brandId) => {
    setActiveBrandId(resolveActiveBrandId(brands, brandId));
    setStudioPlanDraft(null);
  };

  const clearDirectSearch = () => {
    window.clearTimeout(directSearchTimer.current);
    setSignalUrl('');
    setDirectSearch({ status: 'idle', messageKey: '', directSignalId: '' });
  };

  const changeSignalUrl = (value) => {
    window.clearTimeout(directSearchTimer.current);
    setSignalUrl(value);
    if (directSearch.status !== 'idle') {
      setDirectSearch({ status: 'idle', messageKey: '', directSignalId: '' });
    }
  };

  const submitDirectSearch = (event) => {
    event.preventDefault();
    window.clearTimeout(directSearchTimer.current);

    if (!getSupportedSignalPlatform(signalUrl)) {
      setDirectSearch({
        status: 'error',
        messageKey: 'product.search.invalid',
        directSignalId: '',
      });
      return;
    }

    setDirectSearch({
      status: 'loading',
      messageKey: 'product.search.checking',
      directSignalId: '',
    });
    directSearchTimer.current = window.setTimeout(() => {
      const signal = findSignalBySourceUrl(SIGNAL_CARDS, signalUrl);
      setDirectSearch(signal ? {
        status: 'matched',
        messageKey: 'product.search.matched',
        directSignalId: signal.id,
      } : {
        status: 'error',
        messageKey: 'product.search.notFound',
        directSignalId: '',
      });
    }, 350);
  };

  return (
    <main className="product-shell-preview">
      <ProductSidebar
        activeTab={activeTab}
        setActiveTab={(nextTab) => {
          setActiveTab(nextTab);
          setNotificationsOpen(false);
          if (nextTab !== 'channels') setAddChannelOpen(false);
        }}
        language={language}
        setLanguage={setLanguage}
        theme={theme}
        onToggleTheme={onToggleTheme}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
        brands={brands}
        activeBrandId={activeBrandId}
        onSelectBrand={selectBrand}
      />
      <section className="product-shell-main">
        <ProductTopbar
          activeTab={activeTab}
          setMobileOpen={setMobileOpen}
          onAddChannel={() => setAddChannelOpen(true)}
          signalUrl={signalUrl}
          signalSearchStatus={directSearch.status}
          onSignalUrlChange={changeSignalUrl}
          onSignalUrlSubmit={submitDirectSearch}
          channelQuery={channelQuery}
          onChannelQueryChange={setChannelQuery}
          notificationsOpen={notificationsOpen}
          onToggleNotifications={() => setNotificationsOpen((open) => !open)}
          onCloseNotifications={() => setNotificationsOpen(false)}
          onExportPlan={() => planExportRef.current?.()}
        />
        {activeTab === 'discover' && (
          <DiscoverHome
            onOpenStudio={(signal) => {
              setStudioSignal(signal);
              setActiveTab('studio');
            }}
            onOpenChannels={() => setActiveTab('channels')}
            directSearch={directSearch}
            onClearDirectSearch={clearDirectSearch}
          />
        )}
        {activeTab === 'channels' && (
          <ProductChannelsPreview
            addOpen={addChannelOpen}
            onCloseAdd={() => setAddChannelOpen(false)}
            query={channelQuery}
            brandBrain={activeBrand?.brain || null}
          />
        )}
        {activeTab === 'studio' && (
          <ProductStudioPreview
            signal={studioSignal}
            onChooseSignal={() => setActiveTab('discover')}
            onAddToPlan={(draft) => {
              setStudioPlanDraft({
                ...draft,
                targetBrandId: contentPlanBrandId,
                sourceSignalId: studioSignal?.id || '',
                sourceTitle: studioSignal?.title || '',
                sourceUrl: studioSignal?.sourceUrl || '',
              });
              setActiveTab('plan');
            }}
          />
        )}
        {activeTab === 'plan' && (
          <ProductContentPlanPreview
            incomingPost={studioPlanDraft?.targetBrandId === contentPlanBrandId ? studioPlanDraft : null}
            activeBrandId={contentPlanBrandId}
            onRegisterExport={(handler) => {
              planExportRef.current = handler;
            }}
          />
        )}
        {activeTab === 'settings' && (
          <ProductSettingsPreview
            language={language}
            setLanguage={setLanguage}
            theme={theme}
            onToggleTheme={onToggleTheme}
            brands={brands}
            activeBrandId={activeBrandId}
            onSelectBrand={selectBrand}
            onSaveBrand={saveBrand}
            creditState={creditState}
          />
        )}
        {!['discover', 'channels', 'studio', 'plan', 'settings'].includes(activeTab) && <EmptyProductTab activeTab={activeTab} />}
      </section>
    </main>
  );
}
