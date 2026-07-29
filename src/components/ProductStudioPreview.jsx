import React, { useState } from 'react';
import {
  BarChart3,
  BrainCircuit,
  CalendarPlus,
  Check,
  Clock3,
  ExternalLink,
  FileText,
  Lightbulb,
  Pause,
  Play,
  RefreshCw,
  Sparkles,
  Target,
  Volume2,
  WandSparkles,
} from 'lucide-react';

import { useI18n } from '../i18nProvider.mjs';

const STUDIO_TABS = Object.freeze([
  { id: 'overview', label: 'product.studio.tabs.overview' },
  { id: 'transcript', label: 'product.studio.tabs.transcript' },
  { id: 'analysis', label: 'product.studio.tabs.analysis' },
  { id: 'adaptation', label: 'product.studio.tabs.adaptation' },
  { id: 'script', label: 'product.studio.tabs.script' },
]);

const TRANSCRIPT_SEGMENTS = Object.freeze([
  ['00:00', 'product.studio.transcript.first'],
  ['00:06', 'product.studio.transcript.second'],
  ['00:14', 'product.studio.transcript.third'],
  ['00:24', 'product.studio.transcript.fourth'],
]);

const ANALYSIS_CARDS = Object.freeze([
  ['hook', Target, 'product.studio.analysis.hook', 'product.studio.analysis.hookBody'],
  ['audience', BrainCircuit, 'product.studio.analysis.audience', 'product.studio.analysis.audienceBody'],
  ['production', BarChart3, 'product.studio.analysis.production', 'product.studio.analysis.productionBody'],
  ['audio', Volume2, 'product.studio.analysis.audio', 'product.studio.analysis.audioBody'],
]);

const SCRIPT_SCENES = Object.freeze([
  ['00–03', 'product.studio.script.sceneOne', 'product.studio.script.sceneOneDirection'],
  ['03–10', 'product.studio.script.sceneTwo', 'product.studio.script.sceneTwoDirection'],
  ['10–15', 'product.studio.script.sceneThree', 'product.studio.script.sceneThreeDirection'],
]);

function OverviewPanel() {
  const { t } = useI18n();

  return (
    <div className="studio-panel-content studio-overview">
      <article className="studio-verdict-card">
        <span><Sparkles size={25} /></span>
        <div>
          <h2>{t('product.studio.overview.verdict')}</h2>
          <p>{t('product.studio.overview.verdictBody')}</p>
        </div>
      </article>
      <div className="studio-overview-stats">
        <article>
          <small>{t('product.studio.overview.hook')}</small>
          <strong>{t('product.studio.overview.hookValue')}</strong>
          <i />
        </article>
        <article>
          <small>{t('product.studio.overview.emotion')}</small>
          <strong>{t('product.studio.overview.emotionValue')}</strong>
          <i />
        </article>
        <article>
          <small>{t('product.studio.overview.pacing')}</small>
          <strong>{t('product.studio.overview.pacingValue')}</strong>
          <i />
        </article>
      </div>
    </div>
  );
}

function TranscriptPanel() {
  const { t } = useI18n();

  return (
    <div className="studio-panel-content studio-transcript">
      <header>
        <div>
          <small>{t('product.studio.transcript.label')}</small>
          <h2>{t('product.studio.transcript.title')}</h2>
        </div>
        <span><Clock3 size={15} />{t('product.studio.transcript.duration')}</span>
      </header>
      <div>
        {TRANSCRIPT_SEGMENTS.map(([time, key]) => (
          <article key={time}>
            <time>{time}</time>
            <p>{t(key)}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

function AnalysisPanel() {
  const { t } = useI18n();

  return (
    <div className="studio-panel-content studio-deep-analysis">
      <div className="studio-analysis-intro">
        <span><BrainCircuit size={22} /></span>
        <div>
          <small>{t('product.studio.analysis.label')}</small>
          <h2>{t('product.studio.analysis.title')}</h2>
        </div>
      </div>
      <div className="studio-analysis-grid">
        {ANALYSIS_CARDS.map(([id, Icon, title, body]) => (
          <article key={id}>
            <span><Icon size={19} /></span>
            <h3>{t(title)}</h3>
            <p>{t(body)}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

function AdaptationPanel({ onGenerate }) {
  const { t } = useI18n();

  return (
    <div className="studio-panel-content studio-adaptation">
      <header>
        <div>
          <small>{t('product.studio.adaptation.label')}</small>
          <h2>{t('product.studio.adaptation.title')}</h2>
        </div>
        <span><Check size={15} />{t('product.studio.adaptation.brandReady')}</span>
      </header>
      <div className="studio-adaptation-comparison">
        <article>
          <small>{t('product.studio.adaptation.original')}</small>
          <h3>{t('product.studio.adaptation.originalTitle')}</h3>
          <p>{t('product.studio.adaptation.originalBody')}</p>
        </article>
        <article>
          <small>{t('product.studio.adaptation.adapted')}</small>
          <h3>{t('product.studio.adaptation.adaptedTitle')}</h3>
          <p>{t('product.studio.adaptation.adaptedBody')}</p>
        </article>
      </div>
      <aside>
        <Lightbulb size={19} />
        <p><strong>{t('product.studio.adaptation.logic')}</strong>{t('product.studio.adaptation.logicBody')}</p>
      </aside>
      <button type="button" onClick={onGenerate}><WandSparkles size={18} />{t('product.studio.adaptation.generate')}</button>
    </div>
  );
}

function ScriptPanel() {
  const { t } = useI18n();
  const [duration, setDuration] = useState('15');
  const [scheduled, setScheduled] = useState(false);

  return (
    <div className="studio-panel-content studio-script">
      <header>
        <div>
          <small>{t('product.studio.script.label')}</small>
          <h2>{t('product.studio.script.title')}</h2>
        </div>
        <div className="studio-duration-tabs">
          {['15', '30', '60'].map((value) => (
            <button key={value} className={duration === value ? 'active' : ''} type="button" onClick={() => setDuration(value)}>
              {value}s
            </button>
          ))}
        </div>
      </header>
      <div className="studio-scenes">
        {SCRIPT_SCENES.map(([time, copy, direction], index) => (
          <article key={time}>
            <span>{index + 1}</span>
            <div>
              <time>{time}</time>
              <strong>{t(copy)}</strong>
              <p>{t(direction)}</p>
            </div>
          </article>
        ))}
      </div>
      <button className="studio-schedule-button" type="button" onClick={() => setScheduled(true)}>
        {scheduled ? <Check size={18} /> : <CalendarPlus size={18} />}
        {t(scheduled ? 'product.studio.script.scheduled' : 'product.studio.script.schedule')}
      </button>
    </div>
  );
}

export default function ProductStudioPreview() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState('overview');
  const [playing, setPlaying] = useState(false);

  return (
    <section className="product-studio-page">
      <header className="studio-page-heading">
        <div>
          <p>{t('product.nav.discover')} <span>/</span> {t('product.nav.studio')}</p>
          <h1>{t('product.studio.title')}</h1>
        </div>
      </header>

      <div className="studio-workspace">
        <div className="studio-source-column">
          <article className={`studio-video-preview ${playing ? 'playing' : ''}`}>
            <div className="studio-video-grid" aria-hidden="true"><i /><i /><i /><i /></div>
            <span className="studio-video-kicker">{t('product.studio.video.kicker')}</span>
            <button type="button" aria-label={t(playing ? 'product.studio.video.pause' : 'product.studio.video.play')} onClick={() => setPlaying((current) => !current)}>
              {playing ? <Pause size={27} /> : <Play size={29} fill="currentColor" />}
            </button>
            <strong>{t('product.studio.video.caption')}</strong>
            <small>{playing ? t('product.studio.video.playing') : t('product.studio.video.ready')}</small>
          </article>

          <article className="studio-source-card">
            <header>
              <span>MK</span>
              <div>
                <strong>{t('product.studio.source.creator')}</strong>
                <small>{t('product.studio.source.platform')}</small>
              </div>
              <button type="button" aria-label={t('product.studio.source.external')}><ExternalLink size={18} /></button>
            </header>
            <div className="studio-source-metrics">
              <p><small>{t('product.studio.source.views')}</small><strong>1.2M</strong></p>
              <p><small>{t('product.studio.source.likes')}</small><strong>124K</strong></p>
              <p><small>{t('product.studio.source.match')}</small><strong>94%</strong></p>
            </div>
            <div className="studio-source-actions">
              <button type="button" onClick={() => setActiveTab('analysis')}><BarChart3 size={16} />{t('product.studio.source.analytics')}</button>
              <button type="button" onClick={() => setActiveTab('overview')}><RefreshCw size={16} />{t('product.studio.source.deconstruct')}</button>
            </div>
          </article>

          <div className="studio-strategy-tags">
            <span>{t('product.studio.tags.b2b')}</span>
            <span>{t('product.studio.tags.product')}</span>
            <span>{t('product.studio.tags.educational')}</span>
          </div>
        </div>

        <article className="studio-command-center">
          <nav aria-label={t('product.studio.tabs.label')}>
            {STUDIO_TABS.map((tab) => (
              <button key={tab.id} className={activeTab === tab.id ? 'active' : ''} type="button" onClick={() => setActiveTab(tab.id)}>
                {t(tab.label)}
              </button>
            ))}
          </nav>
          {activeTab === 'overview' && <OverviewPanel />}
          {activeTab === 'transcript' && <TranscriptPanel />}
          {activeTab === 'analysis' && <AnalysisPanel />}
          {activeTab === 'adaptation' && <AdaptationPanel onGenerate={() => setActiveTab('script')} />}
          {activeTab === 'script' && <ScriptPanel />}
        </article>
      </div>
    </section>
  );
}
