import React, { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  BarChart3,
  Check,
  Eye,
  Heart,
  Lightbulb,
  Play,
  Plus,
  X,
} from 'lucide-react';

import { useI18n } from '../i18nProvider.mjs';

const CHANNEL_TABS = Object.freeze([
  { id: 'all', label: 'product.channels.tabs.all' },
  { id: 'following', label: 'product.channels.tabs.following' },
  { id: 'favorites', label: 'product.channels.tabs.favorites' },
  { id: 'recommended', label: 'product.channels.tabs.recommended' },
  { id: 'trending', label: 'product.channels.tabs.trending' },
]);

const CHANNEL_FILTERS = Object.freeze([
  'platform',
  'country',
  'category',
  'language',
  'aiMatch',
  'followers',
  'avgViews',
]);

const CHANNELS = Object.freeze([
  {
    id: 'alex',
    initials: 'AT',
    tone: 'blue',
    name: 'product.channels.cards.alex.name',
    handle: 'product.channels.cards.alex.handle',
    meta: 'product.channels.cards.alex.meta',
    followers: '1.2M',
    views: '450K',
    match: '98%',
    latest: 'product.channels.cards.alex.latest',
    time: 'product.channels.cards.alex.time',
    status: 'tracking',
    recommended: true,
    trending: true,
  },
  {
    id: 'sarah',
    initials: 'SN',
    tone: 'peach',
    name: 'product.channels.cards.sarah.name',
    handle: 'product.channels.cards.sarah.handle',
    meta: 'product.channels.cards.sarah.meta',
    followers: '840K',
    views: '210K',
    match: '84%',
    latest: 'product.channels.cards.sarah.latest',
    time: 'product.channels.cards.sarah.time',
    status: 'idle',
    recommended: true,
    trending: false,
  },
  {
    id: 'marcus',
    initials: 'FM',
    tone: 'violet',
    name: 'product.channels.cards.marcus.name',
    handle: 'product.channels.cards.marcus.handle',
    meta: 'product.channels.cards.marcus.meta',
    followers: '3.5M',
    views: '1.8M',
    match: '76%',
    latest: 'product.channels.cards.marcus.latest',
    time: 'product.channels.cards.marcus.time',
    status: 'tracking',
    recommended: false,
    trending: true,
  },
]);

function ChannelCard({ channel, favorite, onToggleFavorite, onAudit }) {
  const { t } = useI18n();

  return (
    <article className="product-channel-card">
      <header>
        <div className={`product-channel-avatar ${channel.tone}`}>{channel.initials}</div>
        <div>
          <h3>{t(channel.name)}</h3>
          <p>{t(channel.handle)}</p>
          <small>{t(channel.meta)}</small>
        </div>
        <button
          className={favorite ? 'favorite' : ''}
          type="button"
          aria-label={favorite ? t('product.channels.actions.removeFavorite') : t('product.channels.actions.addFavorite')}
          onClick={() => onToggleFavorite(channel.id)}
        >
          <Heart size={20} fill={favorite ? 'currentColor' : 'none'} />
        </button>
      </header>

      <div className="product-channel-stats">
        <div><span>{t('product.channels.labels.followers')}</span><strong>{channel.followers}</strong></div>
        <div><span>{t('product.channels.labels.avgViews')}</span><strong>{channel.views}</strong></div>
        <div><span>{t('product.channels.labels.aiMatch')}</span><strong>{channel.match}</strong></div>
      </div>

      <section className="product-channel-latest">
        <small>{t('product.channels.labels.latest')}</small>
        <strong>{t(channel.latest)}</strong>
        <span>{t(channel.time)}</span>
      </section>

      <footer>
        <span className={channel.status}>
          <i />{t(`product.channels.status.${channel.status}`)}
        </span>
        <div>
          <button type="button" aria-label={t('product.channels.actions.preview')}><Eye size={18} /></button>
          <button type="button" onClick={() => onAudit(channel)}>{t('product.channels.actions.audit')}</button>
        </div>
      </footer>
    </article>
  );
}

function ChannelAudit({ channel, onClose }) {
  const { t } = useI18n();

  if (!channel) return null;

  return (
    <div className="product-channel-audit-layer">
      <button className="product-channel-audit-backdrop" type="button" aria-label={t('product.channels.audit.close')} onClick={onClose} />
      <aside className="product-channel-audit" role="dialog" aria-modal="true" aria-label={t('product.channels.audit.title')}>
        <header>
          <div>
            <h2>{t('product.channels.audit.title')}</h2>
            <p>{t('product.channels.audit.subtitle')}</p>
          </div>
          <button type="button" aria-label={t('product.channels.audit.close')} onClick={onClose}><X size={20} /></button>
        </header>

        <div className="product-channel-audit-body">
          <section className="product-channel-audit-profile">
            <div className={`product-channel-avatar ${channel.tone}`}>{channel.initials}</div>
            <div>
              <h3>{t(channel.name)}</h3>
              <p>{t(channel.meta)}</p>
              <div><span>{t('product.channels.audit.tagFirst')}</span><span>{t('product.channels.audit.tagSecond')}</span></div>
            </div>
          </section>

          <section className="product-channel-audit-summary">
            <div><small>{t('product.channels.audit.niche')}</small><p>{t('product.channels.audit.nicheValue')}</p></div>
            <div><small>{t('product.channels.audit.audience')}</small><p>{t('product.channels.audit.audienceValue')}</p></div>
          </section>

          <section className="product-channel-audit-metrics">
            <h3>{t('product.channels.audit.performance')}</h3>
            <div>
              <p><small>{t('product.channels.audit.frequency')}</small><strong>3.2 / week</strong></p>
              <p><small>{t('product.channels.audit.avgPerformance')}</small><strong>+14%</strong></p>
              <p><small>{t('product.channels.audit.bestFormat')}</small><strong>{t('product.channels.audit.bestFormatValue')}</strong></p>
            </div>
          </section>

          <section className="product-channel-audit-strategy">
            <div><Lightbulb size={19} /><h3>{t('product.channels.audit.strategy')}</h3></div>
            <small>{t('product.channels.audit.hooks')}</small>
            <ul>
              <li><Check size={16} />{t('product.channels.audit.hookFirst')}</li>
              <li><Check size={16} />{t('product.channels.audit.hookSecond')}</li>
            </ul>
            <small>{t('product.channels.audit.topics')}</small>
            <div>
              <span>{t('product.channels.audit.topicFirst')}</span>
              <span>{t('product.channels.audit.topicSecond')}</span>
              <span>{t('product.channels.audit.topicThird')}</span>
            </div>
          </section>

          <section className="product-channel-audit-videos">
            <h3>{t('product.channels.audit.videos')}</h3>
            <article><span><Play size={18} /></span><div><strong>{t('product.channels.audit.videoFirst')}</strong><small>1.2M · 2 weeks ago</small></div><ArrowUpRight size={17} /></article>
            <article><span><Play size={18} /></span><div><strong>{t('product.channels.audit.videoSecond')}</strong><small>890K · 1 month ago</small></div><ArrowUpRight size={17} /></article>
          </section>
        </div>
      </aside>
    </div>
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
          if (!value.trim()) return;
          setValue('');
          onAdded();
        }}
      >
        <header>
          <span><Plus size={20} /></span>
          <div><h2>{t('product.channels.add.title')}</h2><p>{t('product.channels.add.subtitle')}</p></div>
          <button type="button" aria-label={t('product.channels.add.close')} onClick={onClose}><X size={19} /></button>
        </header>
        <label>
          <span>{t('product.channels.add.label')}</span>
          <input value={value} onChange={(event) => setValue(event.target.value)} placeholder={t('product.channels.add.placeholder')} autoFocus />
        </label>
        <footer>
          <button type="button" onClick={onClose}>{t('product.channels.add.cancel')}</button>
          <button type="submit" disabled={!value.trim()}>{t('product.channels.add.action')}</button>
        </footer>
      </form>
    </div>
  );
}

export default function ProductChannelsPreview({ addOpen, onCloseAdd }) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState('all');
  const [favorites, setFavorites] = useState(() => new Set(['alex']));
  const [auditChannel, setAuditChannel] = useState(null);
  const [addedNotice, setAddedNotice] = useState(false);

  const filteredChannels = useMemo(() => CHANNELS.filter((channel) => {
    if (activeTab === 'following') return channel.status === 'tracking';
    if (activeTab === 'favorites') return favorites.has(channel.id);
    if (activeTab === 'recommended') return channel.recommended;
    if (activeTab === 'trending') return channel.trending;
    return true;
  }), [activeTab, favorites]);

  const toggleFavorite = (channelId) => {
    setFavorites((current) => {
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

      <div className="product-channel-filters">
        {CHANNEL_FILTERS.map((filter) => (
          <button type="button" key={filter}>{t(`product.channels.filters.${filter}`)}<span>⌄</span></button>
        ))}
      </div>

      {addedNotice && (
        <div className="product-channel-added-notice" role="status">
          <Check size={17} />{t('product.channels.add.notice')}
          <button type="button" aria-label={t('product.channels.add.dismiss')} onClick={() => setAddedNotice(false)}><X size={15} /></button>
        </div>
      )}

      <div className="product-channel-grid">
        {filteredChannels.map((channel) => (
          <ChannelCard
            key={channel.id}
            channel={channel}
            favorite={favorites.has(channel.id)}
            onToggleFavorite={toggleFavorite}
            onAudit={setAuditChannel}
          />
        ))}
      </div>

      {filteredChannels.length === 0 && (
        <div className="product-channel-empty"><BarChart3 size={24} /><p>{t('product.channels.empty')}</p></div>
      )}

      <ChannelAudit channel={auditChannel} onClose={() => setAuditChannel(null)} />
      <AddChannelModal
        open={addOpen}
        onClose={onCloseAdd}
        onAdded={() => {
          onCloseAdd();
          setAddedNotice(true);
        }}
      />
    </section>
  );
}
