import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpDown,
  BarChart3,
  Check,
  Clock3,
  Database,
  ExternalLink,
  Filter,
  Heart,
  Plus,
  Radio,
  Sparkles,
  X,
} from 'lucide-react';

import {
  DEFAULT_CHANNEL_FILTERS,
  buildChannelRecommendations,
  filterChannelRecords,
  isCollectedChannel,
  readStoredChannelIds,
  sortChannelRecords,
} from '../channelViewState.mjs';
import { useI18n } from '../i18nProvider.mjs';

const CHANNEL_TABS = Object.freeze([
  { id: 'all', label: 'product.channels.tabs.all' },
  { id: 'following', label: 'product.channels.tabs.following' },
  { id: 'favorites', label: 'product.channels.tabs.favorites' },
  { id: 'recommended', label: 'product.channels.tabs.recommended' },
  { id: 'trending', label: 'product.channels.tabs.trending' },
]);

const EMPTY_CHANNELS = Object.freeze([]);
const TRACKED_CHANNELS_STORAGE_KEY = 'dzhero-preview-tracked-channels-v1';
const FAVORITE_CHANNELS_STORAGE_KEY = 'dzhero-preview-favorite-channels-v1';
const PENDING_CHANNEL_URLS_STORAGE_KEY = 'dzhero-preview-pending-channel-urls-v1';

function readPendingChannelUrls() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PENDING_CHANNEL_URLS_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((value) => typeof value === 'string' && value.trim()) : [];
  } catch {
    return [];
  }
}

function ChannelCard({
  channel,
  tracked,
  favorite,
  recommendationReason,
  onToggleTracked,
  onToggleFavorite,
}) {
  const { t, formatNumber } = useI18n();
  const matchReason = recommendationReason
    ? t(`product.channels.recommendation.reason.${recommendationReason}`)
    : t('product.channels.recommendation.pending');

  return (
    <article className="product-channel-card product-channel-card-live">
      <header>
        <div className="product-channel-avatar blue">{channel.initials || channel.name?.slice(0, 2).toUpperCase()}</div>
        <div>
          <h3>{channel.name}</h3>
          <p>{channel.handle}</p>
          <small>{[channel.platform, channel.niche].filter(Boolean).join(' · ')}</small>
        </div>
        <button
          className={favorite ? 'favorite' : ''}
          type="button"
          aria-label={favorite ? t('product.channels.actions.removeFavorite') : t('product.channels.actions.addFavorite')}
          aria-pressed={favorite}
          onClick={() => onToggleFavorite(channel.id)}
        >
          <Heart size={20} fill={favorite ? 'currentColor' : 'none'} />
        </button>
      </header>

      <div className="product-channel-stats">
        <div>
          <span>{t('product.channels.labels.avgViews')}</span>
          <strong>{Number.isFinite(channel.avgViewsValue) ? formatNumber(channel.avgViewsValue, { notation: 'compact' }) : t('product.channels.values.unknown')}</strong>
        </div>
        <div>
          <span>{t('product.channels.labels.aiMatch')}</span>
          <strong>{Number.isFinite(channel.aiMatchValue) ? `${channel.aiMatchValue}%` : t('product.channels.values.pending')}</strong>
        </div>
      </div>

      <section className="product-channel-match-reason">
        <Sparkles size={15} />
        <div>
          <small>{t('product.channels.recommendation.why')}</small>
          <strong>{matchReason}</strong>
        </div>
      </section>

      <footer>
        <button
          className={tracked ? 'tracking' : ''}
          type="button"
          aria-pressed={tracked}
          onClick={() => onToggleTracked(channel.id)}
        >
          <Radio size={15} />{t(tracked ? 'product.channels.actions.tracking' : 'product.channels.actions.track')}
        </button>
        {channel.profileUrl && (
          <a href={channel.profileUrl} target="_blank" rel="noreferrer">
            {t('product.channels.actions.openProfile')}<ExternalLink size={15} />
          </a>
        )}
      </footer>
    </article>
  );
}

function AddChannelModal({ open, onClose, onAdded }) {
  const { t } = useI18n();
  const [value, setValue] = useState('');

  if (!open) return null;

  return (
    <div className="product-channel-modal-layer">
      <button className="product-channel-modal-backdrop" type="button" aria-label={t('product.channels.add.close')} onClick={onClose} />
      <form
        className="product-channel-modal"
        onSubmit={(event) => {
          event.preventDefault();
          const nextValue = value.trim();
          if (!nextValue) return;
          onAdded(nextValue);
          setValue('');
        }}
      >
        <header>
          <span><Plus size={20} /></span>
          <div><h2>{t('product.channels.add.title')}</h2><p>{t('product.channels.add.subtitle')}</p></div>
          <button type="button" aria-label={t('product.channels.add.close')} onClick={onClose}><X size={19} /></button>
        </header>
        <label>
          <span>{t('product.channels.add.label')}</span>
          <input
            type="url"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={t('product.channels.add.placeholder')}
            autoFocus
          />
        </label>
        <footer>
          <button type="button" onClick={onClose}>{t('product.channels.add.cancel')}</button>
          <button type="submit" disabled={!value.trim()}>{t('product.channels.add.action')}</button>
        </footer>
      </form>
    </div>
  );
}

function ChannelEmptyState({ activeTab, filtered, recommendationsReady }) {
  const { t } = useI18n();
  const state = filtered
    ? { icon: BarChart3, title: 'product.channels.empty.filteredTitle', body: 'product.channels.empty.filteredBody' }
    : activeTab === 'following'
      ? { icon: Radio, title: 'product.channels.empty.followingTitle', body: 'product.channels.empty.followingBody' }
      : activeTab === 'favorites'
        ? { icon: Heart, title: 'product.channels.empty.favoritesTitle', body: 'product.channels.empty.favoritesBody' }
        : activeTab === 'recommended'
          ? {
            icon: Sparkles,
            title: recommendationsReady ? 'product.channels.empty.recommendedNoMatchTitle' : 'product.channels.empty.recommendedTitle',
            body: recommendationsReady ? 'product.channels.empty.recommendedNoMatchBody' : 'product.channels.empty.recommendedBody',
          }
          : activeTab === 'trending'
            ? { icon: Clock3, title: 'product.channels.empty.trendingTitle', body: 'product.channels.empty.trendingBody' }
            : { icon: Database, title: 'product.channels.empty.allTitle', body: 'product.channels.empty.allBody' };
  const Icon = state.icon;

  return (
    <div className={`product-channel-empty product-channel-empty-${activeTab}`}>
      <Icon size={25} />
      <strong>{t(state.title)}</strong>
      <p>{t(state.body)}</p>
      {activeTab === 'recommended' && !recommendationsReady && (
        <ul>
          <li><Check size={14} />{t('product.channels.empty.recommendedRequirementChannels')}</li>
          <li><Check size={14} />{t('product.channels.empty.recommendedRequirementBrain')}</li>
        </ul>
      )}
    </div>
  );
}

export default function ProductChannelsPreview({
  addOpen,
  onCloseAdd,
  query = '',
  channels = EMPTY_CHANNELS,
  brandBrain = null,
}) {
  const { t } = useI18n();
  const collectedChannels = useMemo(() => channels.filter(isCollectedChannel), [channels]);
  const allowedIds = useMemo(() => collectedChannels.map(({ id }) => id), [collectedChannels]);
  const [activeTab, setActiveTab] = useState('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState(DEFAULT_CHANNEL_FILTERS);
  const [sort, setSort] = useState('newest');
  const [trackedIds, setTrackedIds] = useState(() => readStoredChannelIds(window.localStorage, TRACKED_CHANNELS_STORAGE_KEY, allowedIds));
  const [favoriteIds, setFavoriteIds] = useState(() => readStoredChannelIds(window.localStorage, FAVORITE_CHANNELS_STORAGE_KEY, allowedIds));
  const [pendingUrls, setPendingUrls] = useState(readPendingChannelUrls);
  const [addedNotice, setAddedNotice] = useState(false);

  useEffect(() => {
    setTrackedIds((current) => new Set([...current].filter((id) => allowedIds.includes(id))));
    setFavoriteIds((current) => new Set([...current].filter((id) => allowedIds.includes(id))));
  }, [allowedIds]);
  useEffect(() => {
    window.localStorage.setItem(TRACKED_CHANNELS_STORAGE_KEY, JSON.stringify([...trackedIds]));
  }, [trackedIds]);
  useEffect(() => {
    window.localStorage.setItem(FAVORITE_CHANNELS_STORAGE_KEY, JSON.stringify([...favoriteIds]));
  }, [favoriteIds]);
  useEffect(() => {
    window.localStorage.setItem(PENDING_CHANNEL_URLS_STORAGE_KEY, JSON.stringify(pendingUrls));
  }, [pendingUrls]);

  const recommendationState = useMemo(
    () => buildChannelRecommendations(collectedChannels, brandBrain),
    [brandBrain, collectedChannels],
  );
  const recommendationIds = useMemo(
    () => new Set(recommendationState.recommendations.map(({ channelId }) => channelId)),
    [recommendationState],
  );
  const recommendationReasons = useMemo(
    () => Object.fromEntries(recommendationState.recommendations.map(({ channelId, reason }) => [channelId, reason])),
    [recommendationState],
  );
  const visibleChannels = useMemo(
    () => sortChannelRecords(filterChannelRecords(collectedChannels, filters, {
      activeTab,
      query,
      trackedIds,
      favoriteIds,
      recommendedIds: recommendationIds,
    }), sort),
    [activeTab, collectedChannels, favoriteIds, filters, query, recommendationIds, sort, trackedIds],
  );
  const activeFilterCount = Object.values(filters).filter((value) => value !== 'all').length;
  const filtered = Boolean(query.trim() || activeFilterCount);
  const controlsDisabled = collectedChannels.length === 0;

  const updateFilter = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };
  const toggleId = (setter, channelId) => {
    setter((current) => {
      const next = new Set(current);
      if (next.has(channelId)) next.delete(channelId);
      else next.add(channelId);
      return next;
    });
  };

  return (
    <section className="product-channels-page">
      <header className="product-channels-heading">
        <h1>{t('product.channels.title')}</h1>
        <p>{t('product.channels.subtitle')}</p>
      </header>

      <div className="product-channel-tabs">
        {CHANNEL_TABS.map((tab) => (
          <button type="button" className={activeTab === tab.id ? 'active' : ''} key={tab.id} onClick={() => setActiveTab(tab.id)}>
            {t(tab.label)}
          </button>
        ))}
      </div>

      <div className="product-channel-toolbar">
        <button
          className={filtersOpen || activeFilterCount ? 'active' : ''}
          type="button"
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen((open) => !open)}
        >
          <Filter size={16} />{t('product.channels.actions.filters')}
          {activeFilterCount > 0 && <em>{activeFilterCount}</em>}
        </button>
        <label>
          <ArrowUpDown size={16} />
          <span>{t('product.channels.actions.sort')}</span>
          <select value={sort} disabled={controlsDisabled} onChange={(event) => setSort(event.target.value)}>
            <option value="newest">{t('product.channels.sort.newest')}</option>
            <option value="avgViews">{t('product.channels.sort.avgViews')}</option>
            <option value="aiMatch">{t('product.channels.sort.aiMatch')}</option>
            <option value="name">{t('product.channels.sort.name')}</option>
          </select>
        </label>
      </div>

      {filtersOpen && (
        <div className="product-channel-filter-panel">
          <label><span>{t('product.channels.filters.platform')}</span><select disabled={controlsDisabled} value={filters.platform} onChange={(event) => updateFilter('platform', event.target.value)}><option value="all">{t('product.channels.values.all')}</option><option value="youtube">YouTube</option><option value="instagram">Instagram</option><option value="tiktok">TikTok</option></select></label>
          <label><span>{t('product.channels.filters.niche')}</span><select disabled={controlsDisabled} value={filters.niche} onChange={(event) => updateFilter('niche', event.target.value)}><option value="all">{t('product.channels.values.all')}</option><option value="technology">{t('product.signals.values.technology')}</option><option value="lifestyle">{t('product.signals.values.lifestyle')}</option><option value="food">{t('product.signals.values.food')}</option><option value="fitness">{t('product.channels.values.fitness')}</option></select></label>
          <label><span>{t('product.channels.filters.aiMatch')}</span><select disabled={controlsDisabled} value={filters.aiMatch} onChange={(event) => updateFilter('aiMatch', event.target.value)}><option value="all">{t('product.channels.values.any')}</option><option value="match80">{t('product.signals.values.match80')}</option><option value="match90">{t('product.signals.values.match90')}</option></select></label>
          <label><span>{t('product.channels.filters.avgViews')}</span><select disabled={controlsDisabled} value={filters.avgViews} onChange={(event) => updateFilter('avgViews', event.target.value)}><option value="all">{t('product.channels.values.any')}</option><option value="views100k">{t('product.channels.values.views100k')}</option><option value="views500k">{t('product.channels.values.views500k')}</option></select></label>
          {controlsDisabled && <p>{t('product.channels.filters.disabled')}</p>}
          {activeFilterCount > 0 && <button type="button" onClick={() => setFilters(DEFAULT_CHANNEL_FILTERS)}>{t('product.signals.filters.clear')}</button>}
        </div>
      )}

      {addedNotice && (
        <div className="product-channel-added-notice" role="status">
          <Check size={17} />{t('product.channels.add.notice')}
          <button type="button" aria-label={t('product.channels.add.dismiss')} onClick={() => setAddedNotice(false)}><X size={15} /></button>
        </div>
      )}

      {pendingUrls.length > 0 && activeTab === 'all' && (
        <section className="product-channel-pending">
          <header><Clock3 size={16} /><strong>{t('product.channels.pending.title')}</strong></header>
          {pendingUrls.map((url) => (
            <div key={url}>
              <span>{url}</span>
              <small>{t('product.channels.pending.status')}</small>
              <button type="button" aria-label={t('product.channels.pending.remove')} onClick={() => setPendingUrls((current) => current.filter((value) => value !== url))}><X size={15} /></button>
            </div>
          ))}
        </section>
      )}

      {visibleChannels.length > 0 ? (
        <div className="product-channel-grid">
          {visibleChannels.map((channel) => (
            <ChannelCard
              key={channel.id}
              channel={channel}
              tracked={trackedIds.has(channel.id)}
              favorite={favoriteIds.has(channel.id)}
              recommendationReason={recommendationReasons[channel.id]}
              onToggleTracked={(channelId) => toggleId(setTrackedIds, channelId)}
              onToggleFavorite={(channelId) => toggleId(setFavoriteIds, channelId)}
            />
          ))}
        </div>
      ) : (
        <ChannelEmptyState
          activeTab={activeTab}
          filtered={filtered}
          recommendationsReady={recommendationState.status === 'ready'}
        />
      )}

      <AddChannelModal
        open={addOpen}
        onClose={onCloseAdd}
        onAdded={(url) => {
          setPendingUrls((current) => current.includes(url) ? current : [...current, url]);
          onCloseAdd();
          setAddedNotice(true);
        }}
      />
    </section>
  );
}
