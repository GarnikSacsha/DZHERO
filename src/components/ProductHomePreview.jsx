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
  ExternalLink,
  Filter,
  FolderKanban,
  Gauge,
  Globe2,
  Grid2X2,
  Heart,
  Info,
  List,
  LogOut,
  Menu,
  MoreHorizontal,
  Moon,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  Sun,
  Trash2,
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
  mapQualityAcceptedSignalsToProductCards,
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
import {
  createProductDiscoveryClient,
  getActiveProductBrand,
  getProductRefreshMessageStatus,
  mergeRestoredProductBrand,
} from '../productDiscoveryIntegration.mjs';
import {
  buildPersonalUrlAdaptationFailureState,
  getSavedUrlPlatformLabel,
  getSavedUrlIdentity,
  getPersonalUrlAdaptationIdentity,
  isCurrentSavedUrlResponse,
  isCurrentPersonalUrlAdaptationResponse,
  mapSavedUrlToProductSignal,
  upsertSavedUrl,
} from '../productSavedUrlState.mjs';
import { buildSignalStrengthEvidence } from '../signalIntelligenceState.mjs';
import {
  getProductAdaptationRequestIdentity,
  isCurrentProductAdaptationRequest,
} from '../productAdaptationLifecycle.mjs';
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

const OWNER_SIGNAL_EXCLUSION_REASONS = Object.freeze([
  { code: 'no_useful_mechanic_or_outcome', label: 'product.moderation.reasons.noUsefulMechanic' },
  { code: 'manipulative_or_spam', label: 'product.moderation.reasons.manipulative' },
  { code: 'duplicate_or_broken_signal', label: 'product.moderation.reasons.duplicate' },
  { code: 'unsafe_or_inappropriate', label: 'product.moderation.reasons.unsafe' },
  { code: 'other', label: 'product.moderation.reasons.other' },
]);

function renderCardText(value, t) {
  return String(value || '').startsWith('product.') ? t(value) : String(value || '');
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
  onLogout,
  logoutPending = false,
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
          {onLogout && (
            <button
              className="product-logout-button"
              type="button"
              disabled={logoutPending}
              aria-busy={logoutPending}
              onClick={onLogout}
            >
              <LogOut size={16} />{t(logoutPending ? 'product.actions.logoutLoading' : 'product.actions.logout')}
            </button>
          )}
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
            aria-label={t('product.savedUrls.inputLabel')}
            placeholder={t('product.savedUrls.inputPlaceholder')}
            onChange={(event) => onSignalUrlChange(event.target.value)}
          />
          <button type="submit" aria-label={t('product.savedUrls.save')} title={t('product.savedUrls.save')} disabled={signalSearchStatus === 'saving'}>
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

function SignalCard({
  card,
  onOpenStudio,
  saved,
  onToggleSaved,
  savedPending = false,
  canManageSharedSignals = false,
  onExcludeSignal,
}) {
  const { t } = useI18n();
  const [strengthOpen, setStrengthOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [moderationOpen, setModerationOpen] = useState(false);
  const [reasonCode, setReasonCode] = useState('');
  const [moderationPending, setModerationPending] = useState(false);
  const [moderationError, setModerationError] = useState('');
  const strengthEvidence = useMemo(() => buildSignalStrengthEvidence(card, []), [card]);
  const strengthDetailsId = `signal-strength-${card.id}`;
  const moderationDialogId = `signal-moderation-${card.id}`;
  const sourceSignalId = card.rawSignal?.sharedSourceId || card.rawSignal?.id || card.id;

  const confirmExclusion = async () => {
    if (!reasonCode || moderationPending || typeof onExcludeSignal !== 'function') return;
    setModerationPending(true);
    setModerationError('');
    try {
      await onExcludeSignal(sourceSignalId, reasonCode);
    } catch (error) {
      setModerationError(error?.message || 'owner_signal_exclusion_failed');
    } finally {
      setModerationPending(false);
    }
  };

  return (
    <article className="product-signal-card">
      <div className={`product-signal-visual ${card.visual}`}>
        {card.image
          ? <img className="product-signal-image" src={card.image} alt="" />
          : <div className="product-signal-art" aria-hidden="true"><i /><i /><i /></div>}
        {Number.isFinite(card.qualityValue) && (
          <span className="product-quality-badge" title={card.qualitySummary || t('product.intelligence.quality.verifiedBody')}>
            <Zap size={14} />{t('product.intelligence.quality.label')}{' · '}{Math.round(card.qualityValue)}
          </span>
        )}
        <span
          className={`product-match-badge ${Number.isFinite(card.matchValue) ? '' : 'pending'}`}
          title={Number.isFinite(card.matchValue) ? t('product.intelligence.aiMatch.scoredBody') : t('product.intelligence.aiMatch.pendingBody')}
        >
          <Sparkles size={14} />{t('product.intelligence.aiMatch.label')}{' · '}{Number.isFinite(card.matchValue) ? Math.round(card.matchValue) : t('product.intelligence.aiMatch.pending')}
        </span>
        <div className="product-signal-tags">
          <span>{card.country}</span>
          <span>{card.platform}</span>
        </div>
      </div>
      <div className="product-signal-body">
        {canManageSharedSignals && (
          <div className="product-signal-moderation">
            <button
              className="product-signal-more"
              type="button"
              aria-label={t('product.actions.more')}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <MoreHorizontal size={18} />
            </button>
            {menuOpen && (
              <div className="product-signal-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setModerationOpen(true);
                  }}
                >
                  {t('product.moderation.exclude')}
                </button>
              </div>
            )}
          </div>
        )}
        <div className="product-signal-author">
          <span>{card.initials}</span>
          <div>
            <strong>{renderCardText(card.creator, t)}</strong>
            <small>{renderCardText(card.handle, t)}</small>
          </div>
        </div>
        <h3>{renderCardText(card.title, t)}</h3>
        {card.insight && <p className="product-signal-insight">{card.insight}</p>}
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
        {moderationOpen && (
          <div className="product-signal-moderation-dialog" id={moderationDialogId} role="dialog" aria-label={t('product.moderation.title')}>
            <strong>{t('product.moderation.title')}</strong>
            <p>{t('product.moderation.body')}</p>
            <label>
              <span>{t('product.moderation.reasonLabel')}</span>
              <select value={reasonCode} onChange={(event) => setReasonCode(event.target.value)}>
                <option value="">{t('product.moderation.reasonPlaceholder')}</option>
                {OWNER_SIGNAL_EXCLUSION_REASONS.map((reason) => (
                  <option value={reason.code} key={reason.code}>{t(reason.label)}</option>
                ))}
              </select>
            </label>
            {moderationError && <small role="alert">{moderationError}</small>}
            <div>
              <button type="button" onClick={() => setModerationOpen(false)} disabled={moderationPending}>
                {t('product.moderation.cancel')}
              </button>
              <button type="button" onClick={confirmExclusion} disabled={!reasonCode || moderationPending}>
                {t(moderationPending ? 'product.moderation.pending' : 'product.moderation.confirm')}
              </button>
            </div>
          </div>
        )}
        <div className="product-signal-actions">
          <button type="button" onClick={() => onOpenStudio(card)}>{t('product.actions.openStudio')}</button>
          <button
            className={saved ? 'saved' : ''}
            type="button"
            disabled={savedPending}
            aria-busy={savedPending}
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
  cards,
  onOpenStudio,
  onOpenChannels,
  directSearch,
  onClearDirectSearch,
  refreshState,
  onRefreshBank,
  canManageSharedSignals,
  onExcludeSignal,
  savedIds = new Set(),
  savedSignalState = { status: 'idle', pendingId: '', error: '' },
  onToggleSaved,
  onReloadSavedSignals,
  savedUrls = [],
  savedUrlState = { status: 'idle', pendingId: '', error: '' },
  savedUrlAdaptationStates = {},
  onAnalyzeSavedUrl,
  onOpenSavedUrlStudio,
  onDeleteSavedUrl,
  onReloadSavedUrls,
  authenticated = false,
  language = 'en',
}) {
  const { t } = useI18n();
  const [filters, setFilters] = useState(DEFAULT_SIGNAL_FILTERS);
  const [sort, setSort] = useState('match');
  const [view, setView] = useState('grid');
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);

  const visibleCards = useMemo(
    () => sortSignalCards(
      filterSignalCards(cards, filters, {
        savedIds,
        directSignalId: directSearch.directSignalId,
      }),
      sort,
    ),
    [cards, directSearch.directSignalId, filters, savedIds, sort],
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
    creator: Object.fromEntries(cards.map((card) => [card.id, renderCardText(card.creator, t)])),
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
  const refreshMessageStatus = getProductRefreshMessageStatus(refreshState.status, refreshState.code);

  return (
    <div className="product-discover-layout">
      <section className="product-discover-content">
        <header className="product-page-heading">
          <div>
            <h1>{t('product.discover.title')}</h1>
            <p>{t('product.discover.subtitle')}</p>
          </div>
          <button
            className="product-refresh-bank"
            type="button"
            disabled={refreshState.status === 'running'}
            onClick={onRefreshBank}
          >
            <RefreshCw size={17} className={refreshState.status === 'running' ? 'spin' : ''} />
            {t(refreshState.status === 'running' ? 'product.discovery.refresh.running' : 'product.discovery.refresh.action')}
          </button>
        </header>

        {refreshState.status !== 'idle' && (
          <div
            className={`product-refresh-result ${refreshState.status}`}
            role={refreshState.status === 'error' ? 'alert' : 'status'}
          >
            <strong>{t(`product.discovery.refresh.${refreshMessageStatus}.title`)}</strong>
            <span>{t(`product.discovery.refresh.${refreshMessageStatus}.body`)}</span>
          </div>
        )}

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

        {savedSignalState.status === 'loading' && (
          <div className="product-saved-signals-state" role="status">
            {t('product.savedSignals.loading')}
          </div>
        )}
        {savedSignalState.status === 'error' && (
          <div className="product-saved-signals-state error" role="alert">
            <span>{t('product.savedSignals.error')}</span>
            <button type="button" onClick={onReloadSavedSignals}>{t('product.savedSignals.retry')}</button>
          </div>
        )}

        {authenticated && (
          <section className="product-saved-urls" aria-labelledby="product-saved-urls-title">
            <header className="product-saved-urls-heading">
              <div>
                <h2 id="product-saved-urls-title">{t('product.savedUrls.title')}</h2>
                <p>{t('product.savedUrls.subtitle')}</p>
              </div>
              {savedUrlState.status === 'loading' && <span role="status">{t('product.savedUrls.loading')}</span>}
            </header>
            {savedUrlState.status === 'saved' && <div className="product-saved-url-feedback" role="status">{t('product.savedUrls.saved')}</div>}
            {savedUrlState.status === 'alreadySaved' && <div className="product-saved-url-feedback" role="status">{t('product.savedUrls.alreadySaved')}</div>}
            {savedUrlState.status === 'error' && (
              <div className="product-saved-url-feedback error" role="alert">
                <span>{savedUrlState.error === 'saved_url_invalid'
                  ? t('product.savedUrls.invalid')
                  : savedUrlState.error === 'saved_url_adaptation_in_flight'
                    ? t('product.savedUrls.adaptationInFlight')
                    : t('product.savedUrls.error')}</span>
                <button type="button" onClick={onReloadSavedUrls}>{t('product.savedUrls.retry')}</button>
              </div>
            )}
            {savedUrls.length > 0 ? (
              <div className="product-saved-url-grid">
                {savedUrls.map((savedUrl) => (
                  <article className="product-saved-url-card" key={savedUrl.id}>
                    {(() => {
                      const adaptationState = savedUrlAdaptationStates[savedUrl.id] || { status: 'absent' };
                      const isReady = adaptationState.status === 'ready' && adaptationState.adaptation;
                      const isBusy = adaptationState.status === 'loading' || adaptationState.status === 'generating';
                      const diagnostic = adaptationState.diagnostic || null;
                      const isUnsupportedPublicUrl = diagnostic?.reasonCode === 'public_url_analysis_unsupported'
                        || diagnostic?.reasonCode === 'unsupported_platform';
                      const adaptationError = adaptationState.errorCode === 'saved_url_adaptation_in_flight'
                        ? t('product.savedUrls.adaptationInFlight')
                        : adaptationState.errorCode === 'saved_url_source_unavailable'
                          ? t(isUnsupportedPublicUrl
                            ? 'product.savedUrls.sourceUnsupported'
                            : 'product.savedUrls.sourceUnavailable')
                          : adaptationState.errorCode
                            ? t('product.savedUrls.adaptationError')
                            : '';
                      const canRetryAnalysis = diagnostic?.retryable !== false;
                      const canRetryReadyAdaptation = Boolean(isReady && adaptationState.errorCode && canRetryAnalysis);
                      return (
                        <>
                    <div className="product-saved-url-card-topline">
                      <span className={`product-platform-badge ${savedUrl.platform || ''}`}>{getSavedUrlPlatformLabel(savedUrl.platform)}</span>
                      <span>{isReady ? t('product.savedUrls.analyzed') : isBusy ? t('product.savedUrls.analyzing') : t('product.savedUrls.notAnalyzed')}</span>
                    </div>
                    <a className="product-saved-url-link" href={savedUrl.canonicalUrl} target="_blank" rel="noreferrer">{savedUrl.canonicalUrl}<ExternalLink size={14} /></a>
                    <small>{new Date(savedUrl.createdAt).toLocaleDateString(language === 'uk' ? 'uk-UA' : 'en-US')}</small>
                    {adaptationError && <div className="product-saved-url-feedback error" role="alert">{adaptationError}</div>}
                    <div className="product-saved-url-actions">
                      <a href={savedUrl.canonicalUrl} target="_blank" rel="noreferrer">{t('product.savedUrls.open')}</a>
                      {isReady ? (
                        <>
                          <button type="button" onClick={() => onOpenSavedUrlStudio?.(savedUrl)}>{t('product.savedUrls.openStudio')}</button>
                          {canRetryReadyAdaptation && (
                            <button type="button" onClick={() => onAnalyzeSavedUrl?.(savedUrl.id)}>
                              <Sparkles size={14} />{t('product.savedUrls.retryAnalyze')}
                            </button>
                          )}
                        </>
                      ) : (
                        <>
                          {adaptationState.status === 'error' && (
                            <button type="button" onClick={() => onOpenSavedUrlStudio?.(savedUrl)}>{t('product.savedUrls.openStudio')}</button>
                          )}
                          {(canRetryAnalysis || isBusy) && (
                            <button type="button" disabled={isBusy} onClick={() => onAnalyzeSavedUrl?.(savedUrl.id)}>
                              <Sparkles size={14} />{t(isBusy ? 'product.savedUrls.analyzing' : adaptationState.status === 'error' ? 'product.savedUrls.retryAnalyze' : 'product.savedUrls.analyze')}
                            </button>
                          )}
                        </>
                      )}
                      <button type="button" disabled={savedUrlState.status === 'deleting'} onClick={() => onDeleteSavedUrl(savedUrl.id)}>
                        <Trash2 size={14} />{t('product.savedUrls.delete')}
                      </button>
                    </div>
                        </>
                      );
                    })()}
                  </article>
                ))}
              </div>
            ) : savedUrlState.status !== 'loading' ? (
              <p className="product-saved-url-empty">{t('product.savedUrls.empty')}</p>
            ) : null}
          </section>
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
                <option value="match">{t('product.signals.sort.match')}</option>
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
              <label><span>{filterLabels.creator}</span><select value={filters.creator} onChange={(event) => updateFilter('creator', event.target.value)}><option value="all">{t('product.signals.values.all')}</option>{cards.map((card) => <option key={card.id} value={card.id}>{renderCardText(card.creator, t)}</option>)}</select></label>
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
                onToggleSaved={onToggleSaved}
                savedPending={savedSignalState.status === 'saving' && savedSignalState.pendingId === card.id}
                canManageSharedSignals={canManageSharedSignals}
                onExcludeSignal={onExcludeSignal}
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
  signals = [],
  signalsReady = false,
  apiBase = '/api',
  workspaceId = '',
  fetcher = globalThis.fetch,
  authenticated = false,
  onLogout,
  canManageSharedSignals = false,
  notify = () => {},
}) {
  const { t } = useI18n();
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
  const [studioPlanState, setStudioPlanState] = useState({ status: 'idle', errorCode: '' });
  const [brands, setBrands] = useState(() => readProductBrands(window.localStorage));
  const [activeBrandId, setActiveBrandId] = useState(() => readActiveBrandId(window.localStorage, brands));
  const [creditState] = useState(() => readCreditState(window.localStorage));
  const [collectionSignals, setCollectionSignals] = useState(signals);
  const [savedSignalIds, setSavedSignalIds] = useState(() => new Set());
  const [savedSignalState, setSavedSignalState] = useState({ status: 'idle', pendingId: '', error: '' });
  const [savedUrls, setSavedUrls] = useState([]);
  const [savedUrlState, setSavedUrlState] = useState({ status: 'idle', pendingId: '', error: '' });
  const [savedUrlAdaptations, setSavedUrlAdaptations] = useState(() => new Map());
  const [savedUrlAdaptationStates, setSavedUrlAdaptationStates] = useState({});
  const [adaptationState, setAdaptationState] = useState({ status: 'absent', adaptation: null, errorCode: '' });
  const [brandPersistenceStatus, setBrandPersistenceStatus] = useState('idle');
  const [logoutPending, setLogoutPending] = useState(false);
  const [refreshState, setRefreshState] = useState({ status: 'idle', code: '' });
  const [directSearch, setDirectSearch] = useState({
    status: 'idle',
    messageKey: '',
    directSignalId: '',
  });
  const directSearchTimer = useRef(null);
  const planExportRef = useRef(null);
  const brandSyncPromiseRef = useRef(Promise.resolve());
  const brandSyncRevisionRef = useRef(0);
  const adaptationRequestRevisionRef = useRef(0);
  const savedUrlAdaptationRevisionRef = useRef(0);
  const studioPlanRequestRevisionRef = useRef(0);
  const savedUrlRequestRevisionRef = useRef(0);
  const productClient = useMemo(
    () => createProductDiscoveryClient({ apiBase, workspaceId, fetcher }),
    [apiBase, fetcher, workspaceId],
  );
  const reloadSavedSignals = async () => {
    if (!authenticated || !workspaceId) {
      setSavedSignalIds(new Set());
      setSavedSignalState({ status: 'idle', pendingId: '', error: '' });
      return;
    }
    setSavedSignalState({ status: 'loading', pendingId: '', error: '' });
    try {
      const payload = await productClient.loadSavedSignals();
      const ids = Array.isArray(payload.savedSignals)
        ? payload.savedSignals.map((record) => record.cardId || record.sharedSignalId || record.signalId).filter(Boolean)
        : [];
      setSavedSignalIds(new Set(ids));
      setSavedSignalState({ status: 'ready', pendingId: '', error: '' });
    } catch (error) {
      setSavedSignalState({ status: 'error', pendingId: '', error: error?.message || 'saved_signals_load_failed' });
      throw error;
    }
  };
  const reloadSavedUrls = async () => {
    if (!authenticated || !workspaceId) {
      setSavedUrls([]);
      setSavedUrlState({ status: 'idle', pendingId: '', error: '' });
      return;
    }
    const requestRevision = ++savedUrlRequestRevisionRef.current;
    const requestWorkspaceId = getSavedUrlIdentity({ workspaceId });
    setSavedUrlState({ status: 'loading', pendingId: '', error: '' });
    try {
      const payload = await productClient.loadSavedUrls();
      if (!isCurrentSavedUrlResponse({
        requestRevision,
        currentRevision: savedUrlRequestRevisionRef.current,
        requestWorkspaceId,
        currentWorkspaceId: getSavedUrlIdentity({ workspaceId }),
      })) return;
      setSavedUrls(Array.isArray(payload.savedUrls) ? payload.savedUrls : []);
      setSavedUrlState({ status: 'ready', pendingId: '', error: '' });
    } catch (error) {
      if (!isCurrentSavedUrlResponse({
        requestRevision,
        currentRevision: savedUrlRequestRevisionRef.current,
        requestWorkspaceId,
        currentWorkspaceId: getSavedUrlIdentity({ workspaceId }),
      })) return;
      setSavedUrlState({ status: 'error', pendingId: '', error: error?.code || error?.message || 'saved_urls_load_failed' });
      throw error;
    }
  };
  const handleProductLogout = async () => {
    if (logoutPending || typeof onLogout !== 'function') return;
    setLogoutPending(true);
    try {
      await onLogout();
    } finally {
      setLogoutPending(false);
    }
  };
  const activeBrand = useMemo(
    () => brands.find((brand) => brand.id === activeBrandId) || null,
    [activeBrandId, brands],
  );
  const activeBrandRevision = useMemo(() => activeBrand
    ? [
      activeBrand.id,
      activeBrand.version || '',
      activeBrand.updatedAt || activeBrand.createdAt || '',
    ].join(':')
    : 'none', [activeBrand]);
  const contentPlanBrandId = activeBrandId || PRODUCT_UNASSIGNED_BRAND_ID;
  const signalCards = useMemo(
    () => (signalsReady ? mapQualityAcceptedSignalsToProductCards(collectionSignals) : []),
    [collectionSignals, signalsReady],
  );

  useEffect(() => () => window.clearTimeout(directSearchTimer.current), []);
  useEffect(() => {
    setCollectionSignals(signals);
  }, [signals, workspaceId]);
  useEffect(() => {
    adaptationRequestRevisionRef.current += 1;
    studioPlanRequestRevisionRef.current += 1;
    setAdaptationState({ status: 'absent', adaptation: null, errorCode: '' });
  }, [activeBrandRevision]);
  useEffect(() => {
    let cancelled = false;
    if (!authenticated || !workspaceId) {
      setSavedSignalIds(new Set());
      setSavedSignalState({ status: 'idle', pendingId: '', error: '' });
      return undefined;
    }
    setSavedSignalState({ status: 'loading', pendingId: '', error: '' });
    productClient.loadSavedSignals()
      .then((payload) => {
        if (cancelled) return;
        const ids = Array.isArray(payload.savedSignals)
          ? payload.savedSignals.map((record) => record.cardId || record.sharedSignalId || record.signalId).filter(Boolean)
          : [];
        setSavedSignalIds(new Set(ids));
        setSavedSignalState({ status: 'ready', pendingId: '', error: '' });
      })
      .catch((error) => {
        if (cancelled) return;
        setSavedSignalState({ status: 'error', pendingId: '', error: error?.message || 'saved_signals_load_failed' });
      });
    return () => {
      cancelled = true;
    };
  }, [authenticated, productClient, workspaceId]);
  useEffect(() => {
    savedUrlRequestRevisionRef.current += 1;
    if (!authenticated || !workspaceId) {
      setSavedUrls([]);
      setSavedUrlState({ status: 'idle', pendingId: '', error: '' });
      return undefined;
    }
    const requestRevision = savedUrlRequestRevisionRef.current;
    const requestWorkspaceId = getSavedUrlIdentity({ workspaceId });
    setSavedUrlState({ status: 'loading', pendingId: '', error: '' });
    productClient.loadSavedUrls()
      .then((payload) => {
        if (!isCurrentSavedUrlResponse({
          requestRevision,
          currentRevision: savedUrlRequestRevisionRef.current,
          requestWorkspaceId,
          currentWorkspaceId: getSavedUrlIdentity({ workspaceId }),
        })) return;
        setSavedUrls(Array.isArray(payload.savedUrls) ? payload.savedUrls : []);
        setSavedUrlState({ status: 'ready', pendingId: '', error: '' });
      })
      .catch((error) => {
        if (!isCurrentSavedUrlResponse({
          requestRevision,
          currentRevision: savedUrlRequestRevisionRef.current,
          requestWorkspaceId,
          currentWorkspaceId: getSavedUrlIdentity({ workspaceId }),
        })) return;
        setSavedUrlState({ status: 'error', pendingId: '', error: error?.code || error?.message || 'saved_urls_load_failed' });
      });
    return () => {
      savedUrlRequestRevisionRef.current += 1;
    };
  }, [authenticated, productClient, workspaceId]);
  useEffect(() => {
    savedUrlAdaptationRevisionRef.current += 1;
    if (!authenticated || !workspaceId || brandPersistenceStatus !== 'ready' || !savedUrls.length) {
      if (!savedUrls.length) {
        setSavedUrlAdaptations(new Map());
        setSavedUrlAdaptationStates({});
      }
      return undefined;
    }
    const requestRevision = savedUrlAdaptationRevisionRef.current;
    const requestIdentity = getPersonalUrlAdaptationIdentity({
      workspaceId,
      savedUrlId: savedUrls.map((savedUrl) => savedUrl.id).join(','),
      brandRevision: activeBrandRevision,
    });
    setSavedUrlAdaptationStates((current) => Object.fromEntries(
      savedUrls.map((savedUrl) => [savedUrl.id, { ...(current[savedUrl.id] || {}), status: 'loading', errorCode: '' }]),
    ));
    Promise.allSettled(savedUrls.map(async (savedUrl) => ({
      savedUrl,
      payload: await productClient.loadSavedUrlAdaptation(savedUrl.id),
    }))).then((results) => {
      if (!isCurrentPersonalUrlAdaptationResponse({
        requestRevision,
        currentRevision: savedUrlAdaptationRevisionRef.current,
        requestIdentity,
        currentIdentity: getPersonalUrlAdaptationIdentity({
          workspaceId,
          savedUrlId: savedUrls.map((savedUrl) => savedUrl.id).join(','),
          brandRevision: activeBrandRevision,
        }),
      })) return;
      const nextAdaptations = new Map();
      const nextStates = {};
      results.forEach((result, index) => {
        const savedUrl = savedUrls[index];
        if (result.status === 'fulfilled') {
          const adaptation = result.value.payload.adaptation || null;
          if (adaptation) nextAdaptations.set(savedUrl.id, adaptation);
          nextStates[savedUrl.id] = {
            status: adaptation ? 'ready' : 'absent',
            adaptation,
            errorCode: '',
          };
        } else {
          nextStates[savedUrl.id] = {
            status: 'error',
            adaptation: null,
            errorCode: result.reason?.code || result.reason?.message || 'saved_url_adaptation_load_failed',
          };
        }
      });
      setSavedUrlAdaptations(nextAdaptations);
      setSavedUrlAdaptationStates(nextStates);
    });
    return () => {
      savedUrlAdaptationRevisionRef.current += 1;
    };
  }, [activeBrandRevision, authenticated, brandPersistenceStatus, productClient, savedUrls, workspaceId]);
  useEffect(() => {
    if (!authenticated || !workspaceId || !studioSignal?.id || activeTab !== 'studio') {
      if (!studioSignal?.id) setAdaptationState({ status: 'absent', adaptation: null, errorCode: '' });
      return undefined;
    }
    if (brandPersistenceStatus !== 'ready') {
      setAdaptationState({
        status: brandPersistenceStatus === 'error' ? 'error' : 'loading',
        adaptation: null,
        errorCode: brandPersistenceStatus === 'error' ? 'product_brand_brain_save_failed' : '',
      });
      return undefined;
    }
    let cancelled = false;
    const requestRevision = ++adaptationRequestRevisionRef.current;
    const isPersonalUrl = studioSignal.sourceType === 'personal_url' && studioSignal.savedUrlId;
    const requestIdentity = isPersonalUrl
      ? getPersonalUrlAdaptationIdentity({ workspaceId, savedUrlId: studioSignal.savedUrlId, brandRevision: activeBrandRevision })
      : getProductAdaptationRequestIdentity({ workspaceId, signalId: studioSignal.id, brandRevision: activeBrandRevision });
    setAdaptationState({ status: 'loading', adaptation: null, errorCode: '' });
    const loadAdaptation = isPersonalUrl
      ? productClient.loadSavedUrlAdaptation(studioSignal.savedUrlId)
      : productClient.loadAdaptation(studioSignal.id);
    loadAdaptation
      .then((payload) => {
        const currentIdentity = isPersonalUrl
          ? getPersonalUrlAdaptationIdentity({ workspaceId, savedUrlId: studioSignal.savedUrlId, brandRevision: activeBrandRevision })
          : getProductAdaptationRequestIdentity({ workspaceId, signalId: studioSignal.id, brandRevision: activeBrandRevision });
        if (cancelled || (isPersonalUrl
          ? !isCurrentPersonalUrlAdaptationResponse({ requestRevision, currentRevision: adaptationRequestRevisionRef.current, requestIdentity, currentIdentity })
          : !isCurrentProductAdaptationRequest({ requestRevision, currentRevision: adaptationRequestRevisionRef.current, requestIdentity, currentIdentity }))) return;
        if (isPersonalUrl) {
          const savedUrl = savedUrls.find((item) => item.id === studioSignal.savedUrlId);
          if (savedUrl) {
            setSavedUrlAdaptations((current) => {
              const next = new Map(current);
              if (payload.adaptation) next.set(savedUrl.id, payload.adaptation);
              else next.delete(savedUrl.id);
              return next;
            });
            setSavedUrlAdaptationStates((current) => ({
              ...current,
              [savedUrl.id]: { status: payload.adaptation ? 'ready' : 'absent', adaptation: payload.adaptation || null, errorCode: '' },
            }));
          }
        }
        setAdaptationState({
          status: payload.adaptation ? 'ready' : 'absent',
          adaptation: payload.adaptation || null,
          errorCode: '',
        });
      })
      .catch((error) => {
        const currentIdentity = isPersonalUrl
          ? getPersonalUrlAdaptationIdentity({ workspaceId, savedUrlId: studioSignal.savedUrlId, brandRevision: activeBrandRevision })
          : getProductAdaptationRequestIdentity({ workspaceId, signalId: studioSignal.id, brandRevision: activeBrandRevision });
        if (cancelled || (isPersonalUrl
          ? !isCurrentPersonalUrlAdaptationResponse({ requestRevision, currentRevision: adaptationRequestRevisionRef.current, requestIdentity, currentIdentity })
          : !isCurrentProductAdaptationRequest({ requestRevision, currentRevision: adaptationRequestRevisionRef.current, requestIdentity, currentIdentity }))) return;
        setAdaptationState({
          status: 'error',
          adaptation: null,
          errorCode: error?.code || error?.message || 'workspace_adaptation_load_failed',
        });
      });
    return () => {
      cancelled = true;
    };
  }, [activeBrandRevision, activeTab, authenticated, brandPersistenceStatus, productClient, savedUrls, studioSignal?.id, studioSignal?.savedUrlId, studioSignal?.sourceType, workspaceId]);
  useEffect(() => {
    writeProductBrands(window.localStorage, brands);
    const resolved = writeActiveBrandId(window.localStorage, brands, activeBrandId);
    if (resolved !== activeBrandId) setActiveBrandId(resolved);
  }, [activeBrandId, brands]);

  useEffect(() => {
    if (!authenticated || !workspaceId) return undefined;
    let cancelled = false;
    const localBrands = readProductBrands(window.localStorage);
    const localActiveBrandId = readActiveBrandId(window.localStorage, localBrands);
    const localActiveBrand = getActiveProductBrand(localBrands, localActiveBrandId);
    setBrandPersistenceStatus('loading');
    productClient.loadBrand()
      .then(async (backendBrand) => {
        if (cancelled) return;
        if (backendBrand) {
          const restored = mergeRestoredProductBrand(localBrands, backendBrand);
          setBrands(restored.brands);
          setActiveBrandId(restored.activeBrandId);
        } else if (localActiveBrand) {
          await productClient.saveBrand(localActiveBrand);
          const refreshed = await productClient.loadSignals();
          if (Array.isArray(refreshed.reels)) setCollectionSignals(refreshed.reels);
        }
        if (!cancelled) setBrandPersistenceStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setBrandPersistenceStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [authenticated, productClient, workspaceId]);

  const persistBrand = (brand) => {
    const revision = ++brandSyncRevisionRef.current;
    setBrandPersistenceStatus('saving');
    const operation = brandSyncPromiseRef.current
      .catch(() => null)
      .then(() => productClient.saveBrand(brand));
    brandSyncPromiseRef.current = operation;
    operation
      .then(() => {
        if (brandSyncRevisionRef.current === revision) setBrandPersistenceStatus('ready');
      })
      .catch(() => {
        if (brandSyncRevisionRef.current === revision) setBrandPersistenceStatus('error');
      });
    return operation;
  };

  const persistBrandAndReloadSignals = (brand) => {
    const revision = brandSyncRevisionRef.current + 1;
    return persistBrand(brand).then(async () => {
      if (brandSyncRevisionRef.current !== revision) return;
      const payload = await productClient.loadSignals();
      if (brandSyncRevisionRef.current !== revision) return;
      if (Array.isArray(payload.reels)) setCollectionSignals(payload.reels);
    });
  };

  const saveBrand = (draft) => {
    const timestamp = new Date().toISOString();
    const id = draft.id || createProductBrandId(draft.name);
    const brand = {
      ...draft,
      id,
      createdAt: draft.createdAt || timestamp,
      updatedAt: timestamp,
    };
    adaptationRequestRevisionRef.current += 1;
    studioPlanRequestRevisionRef.current += 1;
    setAdaptationState({ status: 'absent', adaptation: null, errorCode: '' });
    setBrands((current) => upsertProductBrand(current, brand));
    setActiveBrandId(id);
    if (authenticated && workspaceId) void persistBrandAndReloadSignals(brand).catch(() => {});
  };

  const selectBrand = (brandId) => {
    const nextActiveBrandId = resolveActiveBrandId(brands, brandId);
    adaptationRequestRevisionRef.current += 1;
    studioPlanRequestRevisionRef.current += 1;
    setAdaptationState({ status: 'absent', adaptation: null, errorCode: '' });
    setActiveBrandId(nextActiveBrandId);
    setStudioPlanDraft(null);
    setStudioPlanState({ status: 'idle', errorCode: '' });
    const brand = getActiveProductBrand(brands, nextActiveBrandId);
    if (brand && authenticated && workspaceId) void persistBrandAndReloadSignals(brand).catch(() => {});
  };

  const addStudioDraftToPlan = async (draft) => {
    if (!draft?.title || studioPlanState.status === 'saving') return;
    if (!authenticated || !workspaceId) {
      setStudioPlanDraft({
        ...draft,
        targetBrandId: contentPlanBrandId,
      });
      setStudioPlanState({ status: 'idle', errorCode: '' });
      setActiveTab('plan');
      return;
    }
    const requestRevision = ++studioPlanRequestRevisionRef.current;
    setStudioPlanState({ status: 'saving', errorCode: '' });
    try {
      await productClient.createContentPlanPost(draft);
      if (studioPlanRequestRevisionRef.current !== requestRevision) return;
      setStudioPlanState({ status: 'ready', errorCode: '' });
      setStudioPlanDraft(null);
      setActiveTab('plan');
    } catch (error) {
      if (studioPlanRequestRevisionRef.current !== requestRevision) return;
      setStudioPlanState({
        status: 'error',
        errorCode: error?.code || error?.message || 'content_plan_post_create_failed',
      });
    }
  };

  const refreshBank = async () => {
    if (refreshState.status === 'running') return;
    const brand = getActiveProductBrand(brands, activeBrandId);
    setRefreshState({ status: 'running', code: '' });
    if (!authenticated || !workspaceId || !brand) {
      setRefreshState({ status: 'blocked', code: 'automatic_discovery_brand_brain_incomplete' });
      return;
    }
    try {
      await persistBrand(brand);
    } catch {
      setRefreshState({ status: 'error', code: 'product_brand_brain_save_failed' });
      return;
    }
    const result = await productClient.refreshBank({ activeBrandId: brand.id });
    if (Array.isArray(result.reels)) setCollectionSignals(result.reels);
    setRefreshState({ status: result.status, code: result.code });
  };

  const excludeSignal = async (signalId, reasonCode) => {
    await productClient.excludeSignal({ signalId, reasonCode });
    setCollectionSignals((current) => current.filter((reel) => (
      reel.id !== signalId && reel.sharedSourceId !== signalId
    )));
    notify(t('product.moderation.success'));
  };

  const toggleSavedSignal = async (cardId) => {
    if (!cardId || savedSignalState.status === 'saving') return;
    const shouldSave = !savedSignalIds.has(cardId);
    setSavedSignalState({ status: 'saving', pendingId: cardId, error: '' });
    try {
      const payload = shouldSave
        ? await productClient.saveSignal(cardId)
        : await productClient.unsaveSignal(cardId);
      const resolvedCardId = payload.savedSignal?.cardId || cardId;
      setSavedSignalIds((current) => {
        const next = new Set(current);
        if (shouldSave) next.add(resolvedCardId);
        else next.delete(cardId);
        return next;
      });
      setSavedSignalState({ status: 'ready', pendingId: '', error: '' });
    } catch (error) {
      setSavedSignalState({ status: 'error', pendingId: cardId, error: error?.message || 'saved_signal_failed' });
    }
  };

  const analyzeSavedUrl = async (savedUrlId) => {
    const savedUrl = savedUrls.find((item) => item.id === savedUrlId);
    if (!savedUrl || !authenticated || !workspaceId) return;
    const requestRevision = ++savedUrlAdaptationRevisionRef.current;
    const requestIdentity = getPersonalUrlAdaptationIdentity({
      workspaceId,
      savedUrlId,
      brandRevision: activeBrandRevision,
    });
    setSavedUrlAdaptationStates((current) => ({
      ...current,
      [savedUrlId]: { status: 'generating', adaptation: null, errorCode: '' },
    }));
    if (studioSignal?.savedUrlId === savedUrlId) {
      adaptationRequestRevisionRef.current += 1;
      setAdaptationState({ status: 'generating', adaptation: null, errorCode: '' });
    }
    try {
      await brandSyncPromiseRef.current;
      if (!isCurrentPersonalUrlAdaptationResponse({
        requestRevision,
        currentRevision: savedUrlAdaptationRevisionRef.current,
        requestIdentity,
        currentIdentity: getPersonalUrlAdaptationIdentity({ workspaceId, savedUrlId, brandRevision: activeBrandRevision }),
      })) return;
      const payload = await productClient.analyzeAdaptSavedUrl(savedUrlId);
      if (!isCurrentPersonalUrlAdaptationResponse({
        requestRevision,
        currentRevision: savedUrlAdaptationRevisionRef.current,
        requestIdentity,
        currentIdentity: getPersonalUrlAdaptationIdentity({ workspaceId, savedUrlId, brandRevision: activeBrandRevision }),
      })) return;
      const adaptation = payload.adaptation || null;
      setSavedUrlAdaptations((current) => {
        const next = new Map(current);
        if (adaptation) next.set(savedUrlId, adaptation);
        return next;
      });
      setSavedUrlAdaptationStates((current) => ({
        ...current,
        [savedUrlId]: { status: adaptation ? 'ready' : 'absent', adaptation, errorCode: '' },
      }));
      if (adaptation && payload.activeBrandChanged) {
        setAdaptationState({ status: 'error', adaptation: null, errorCode: 'workspace_adaptation_brand_changed' });
        return;
      }
      if (adaptation && (studioSignal?.savedUrlId === savedUrlId || !studioSignal)) {
        setStudioSignal(mapSavedUrlToProductSignal(savedUrl, adaptation));
        setAdaptationState({ status: 'ready', adaptation, errorCode: '' });
        setActiveTab('studio');
      }
    } catch (error) {
      if (!isCurrentPersonalUrlAdaptationResponse({
        requestRevision,
        currentRevision: savedUrlAdaptationRevisionRef.current,
        requestIdentity,
        currentIdentity: getPersonalUrlAdaptationIdentity({ workspaceId, savedUrlId, brandRevision: activeBrandRevision }),
      })) return;
      const errorCode = error?.code || error?.message || 'saved_url_adaptation_generate_failed';
      const retainedAdaptation = savedUrlAdaptations.get(savedUrlId)
        || savedUrlAdaptationStates[savedUrlId]?.adaptation
        || (studioSignal?.savedUrlId === savedUrlId ? studioSignal.personalUrlAdaptation : null)
        || null;
      const failureState = buildPersonalUrlAdaptationFailureState(
        errorCode,
        retainedAdaptation,
        error?.payload?.diagnostic || null,
      );
      setSavedUrlAdaptationStates((current) => ({
        ...current,
        [savedUrlId]: failureState,
      }));
      if (studioSignal?.savedUrlId === savedUrlId) {
        setAdaptationState(failureState);
      }
    }
  };

  const openSavedUrlStudio = (savedUrl) => {
    const savedState = savedUrlAdaptationStates[savedUrl?.id] || null;
    const adaptation = savedUrlAdaptations.get(savedUrl?.id) || savedState?.adaptation;
    if (!savedUrl) return;
    setStudioSignal(mapSavedUrlToProductSignal(savedUrl, adaptation));
    setAdaptationState(savedState?.errorCode
      ? { ...savedState, status: adaptation ? 'ready' : 'error', adaptation: adaptation || null }
      : { status: adaptation ? 'ready' : 'absent', adaptation: adaptation || null, errorCode: '' });
    setActiveTab('studio');
  };

  const generateStudioAdaptation = async () => {
    if (!studioSignal?.id || adaptationState.status === 'generating') return;
    if (studioSignal.sourceType === 'personal_url' && studioSignal.savedUrlId) {
      await analyzeSavedUrl(studioSignal.savedUrlId);
      return;
    }
    const requestRevision = ++adaptationRequestRevisionRef.current;
    const requestIdentity = getProductAdaptationRequestIdentity({
      workspaceId,
      signalId: studioSignal.id,
      brandRevision: activeBrandRevision,
    });
    setAdaptationState({ status: 'generating', adaptation: null, errorCode: '' });
    try {
      await brandSyncPromiseRef.current;
      if (!isCurrentProductAdaptationRequest({
        requestRevision,
        currentRevision: adaptationRequestRevisionRef.current,
        requestIdentity,
        currentIdentity: getProductAdaptationRequestIdentity({
          workspaceId,
          signalId: studioSignal.id,
          brandRevision: activeBrandRevision,
        }),
      })) return;
      const payload = await productClient.generateAdaptation(studioSignal.id);
      if (!isCurrentProductAdaptationRequest({
        requestRevision,
        currentRevision: adaptationRequestRevisionRef.current,
        requestIdentity,
        currentIdentity: getProductAdaptationRequestIdentity({
          workspaceId,
          signalId: studioSignal.id,
          brandRevision: activeBrandRevision,
        }),
      })) return;
      if (payload.activeBrandChanged) {
        setAdaptationState({ status: 'error', adaptation: null, errorCode: 'workspace_adaptation_brand_changed' });
        return;
      }
      setAdaptationState({
        status: 'ready',
        adaptation: payload.adaptation || null,
        errorCode: '',
      });
    } catch (error) {
      if (!isCurrentProductAdaptationRequest({
        requestRevision,
        currentRevision: adaptationRequestRevisionRef.current,
        requestIdentity,
        currentIdentity: getProductAdaptationRequestIdentity({
          workspaceId,
          signalId: studioSignal.id,
          brandRevision: activeBrandRevision,
        }),
      })) return;
      setAdaptationState({
        status: 'error',
        adaptation: null,
        errorCode: error?.code || error?.message || 'workspace_adaptation_generate_failed',
      });
    }
  };

  const clearDirectSearch = () => {
    window.clearTimeout(directSearchTimer.current);
    setSignalUrl('');
    setDirectSearch({ status: 'idle', messageKey: '', directSignalId: '' });
  };

  const changeSignalUrl = (value) => {
    window.clearTimeout(directSearchTimer.current);
    setSignalUrl(value);
    if (!['saving', 'deleting'].includes(savedUrlState.status)) {
      setSavedUrlState({ status: 'idle', pendingId: '', error: '' });
    }
    if (directSearch.status !== 'idle') {
      setDirectSearch({ status: 'idle', messageKey: '', directSignalId: '' });
    }
  };

  const submitSavedUrl = async (event) => {
    event.preventDefault();
    const value = signalUrl.trim();
    if (!value || !authenticated || !workspaceId || savedUrlState.status === 'saving') return;
    const requestRevision = ++savedUrlRequestRevisionRef.current;
    const requestWorkspaceId = getSavedUrlIdentity({ workspaceId });
    setSavedUrlState({ status: 'saving', pendingId: value, error: '' });
    try {
      const payload = await productClient.saveUrl(value);
      if (!isCurrentSavedUrlResponse({
        requestRevision,
        currentRevision: savedUrlRequestRevisionRef.current,
        requestWorkspaceId,
        currentWorkspaceId: getSavedUrlIdentity({ workspaceId }),
      })) return;
      if (payload.savedUrl) setSavedUrls((current) => upsertSavedUrl(current, payload.savedUrl));
      setSignalUrl('');
      setSavedUrlState({ status: payload.alreadySaved ? 'alreadySaved' : 'saved', pendingId: '', error: '' });
    } catch (error) {
      if (!isCurrentSavedUrlResponse({
        requestRevision,
        currentRevision: savedUrlRequestRevisionRef.current,
        requestWorkspaceId,
        currentWorkspaceId: getSavedUrlIdentity({ workspaceId }),
      })) return;
      setSavedUrlState({ status: 'error', pendingId: '', error: error?.code || error?.message || 'saved_url_failed' });
    }
  };

  const deleteSavedUrl = async (savedUrlId) => {
    if (!savedUrlId || savedUrlState.status === 'deleting') return;
    const requestRevision = ++savedUrlRequestRevisionRef.current;
    const requestWorkspaceId = getSavedUrlIdentity({ workspaceId });
    setSavedUrlState({ status: 'deleting', pendingId: savedUrlId, error: '' });
    try {
      await productClient.deleteSavedUrl(savedUrlId);
      if (!isCurrentSavedUrlResponse({
        requestRevision,
        currentRevision: savedUrlRequestRevisionRef.current,
        requestWorkspaceId,
        currentWorkspaceId: getSavedUrlIdentity({ workspaceId }),
      })) return;
      setSavedUrls((current) => current.filter((item) => item.id !== savedUrlId));
      setSavedUrlAdaptations((current) => {
        const next = new Map(current);
        next.delete(savedUrlId);
        return next;
      });
      setSavedUrlAdaptationStates((current) => {
        const next = { ...current };
        delete next[savedUrlId];
        return next;
      });
      if (studioSignal?.savedUrlId === savedUrlId) {
        setStudioSignal(null);
        setAdaptationState({ status: 'absent', adaptation: null, errorCode: '' });
      }
      setSavedUrlState({ status: 'ready', pendingId: '', error: '' });
    } catch (error) {
      if (!isCurrentSavedUrlResponse({
        requestRevision,
        currentRevision: savedUrlRequestRevisionRef.current,
        requestWorkspaceId,
        currentWorkspaceId: getSavedUrlIdentity({ workspaceId }),
      })) return;
      setSavedUrlState({ status: 'error', pendingId: savedUrlId, error: error?.code || error?.message || 'saved_url_delete_failed' });
    }
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
        onLogout={onLogout ? handleProductLogout : undefined}
        logoutPending={logoutPending}
      />
      <section className="product-shell-main">
        <ProductTopbar
          activeTab={activeTab}
          setMobileOpen={setMobileOpen}
          onAddChannel={() => setAddChannelOpen(true)}
          signalUrl={signalUrl}
          signalSearchStatus={savedUrlState.status}
          onSignalUrlChange={changeSignalUrl}
          onSignalUrlSubmit={submitSavedUrl}
          channelQuery={channelQuery}
          onChannelQueryChange={setChannelQuery}
          notificationsOpen={notificationsOpen}
          onToggleNotifications={() => setNotificationsOpen((open) => !open)}
          onCloseNotifications={() => setNotificationsOpen(false)}
          onExportPlan={() => planExportRef.current?.()}
        />
        {activeTab === 'discover' && (
          <DiscoverHome
            cards={signalCards}
            onOpenStudio={(signal) => {
              setStudioSignal(signal);
              setActiveTab('studio');
            }}
            onOpenChannels={() => setActiveTab('channels')}
            directSearch={directSearch}
            onClearDirectSearch={clearDirectSearch}
            refreshState={refreshState}
            onRefreshBank={refreshBank}
            canManageSharedSignals={canManageSharedSignals}
            onExcludeSignal={excludeSignal}
            savedIds={savedSignalIds}
            savedSignalState={savedSignalState}
            onToggleSaved={toggleSavedSignal}
            onReloadSavedSignals={() => void reloadSavedSignals().catch(() => {})}
            savedUrls={savedUrls}
            savedUrlState={savedUrlState}
            savedUrlAdaptationStates={savedUrlAdaptationStates}
            onAnalyzeSavedUrl={analyzeSavedUrl}
            onOpenSavedUrlStudio={openSavedUrlStudio}
            onDeleteSavedUrl={deleteSavedUrl}
            onReloadSavedUrls={() => void reloadSavedUrls().catch(() => {})}
            authenticated={authenticated}
            language={language}
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
            adaptationState={adaptationState}
            onGenerateAdaptation={generateStudioAdaptation}
            onRetryAdaptation={generateStudioAdaptation}
            onChooseSignal={() => setActiveTab('discover')}
            addToPlanState={studioPlanState}
            onAddToPlan={(draft) => addStudioDraftToPlan({
              ...draft,
              targetBrandId: contentPlanBrandId,
              sourceSignalId: draft.sourceSignalId || studioSignal?.id || '',
              sourceTitle: draft.sourceTitle || studioSignal?.title || '',
              sourceUrl: draft.sourceUrl || studioSignal?.sourceUrl || '',
              sourceType: draft.sourceType || studioSignal?.sourceType || '',
              savedUrlId: draft.savedUrlId || studioSignal?.savedUrlId || '',
            })}
          />
        )}
        {activeTab === 'plan' && (
          <ProductContentPlanPreview
            incomingPost={studioPlanDraft?.targetBrandId === contentPlanBrandId ? studioPlanDraft : null}
            activeBrandId={contentPlanBrandId}
            workspaceId={workspaceId}
            authenticated={authenticated}
            productClient={productClient}
            brandPersistenceStatus={brandPersistenceStatus}
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
            persistenceStatus={brandPersistenceStatus}
          />
        )}
        {!['discover', 'channels', 'studio', 'plan', 'settings'].includes(activeTab) && <EmptyProductTab activeTab={activeTab} />}
      </section>
    </main>
  );
}
