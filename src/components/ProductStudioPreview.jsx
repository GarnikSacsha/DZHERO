import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  BrainCircuit,
  CalendarPlus,
  Captions,
  Check,
  Clock3,
  ExternalLink,
  FileQuestion,
  FileText,
  Image,
  Lightbulb,
  LoaderCircle,
  MessageSquareText,
  MonitorUp,
  RefreshCw,
  Sparkles,
  Target,
} from 'lucide-react';

import { buildStudioContentPlanDraft } from '../contentPlanUtils.mjs';
import { useI18n } from '../i18nProvider.mjs';
import {
  deriveStudioAnalysis,
  deriveStudioTranscript,
  getStudioRemix,
  getStudioSourceLinks,
  normalizeStudioScriptScenes,
} from '../studioViewState.mjs';

const STUDIO_TABS = Object.freeze([
  { id: 'overview', label: 'product.studio.tabs.overview' },
  { id: 'transcript', label: 'product.studio.tabs.transcript' },
  { id: 'analysis', label: 'product.studio.tabs.analysis' },
  { id: 'adaptation', label: 'product.studio.tabs.adaptation' },
  { id: 'script', label: 'product.studio.tabs.script' },
]);

const ANALYSIS_ICONS = Object.freeze({
  recommendation: Sparkles,
  notes: MessageSquareText,
  summary: BrainCircuit,
  hook: Target,
  mechanic: RefreshCw,
  signal: BarChart3,
  scene: Image,
});

function resolveCopy(value, t) {
  const text = String(value || '').trim();
  return text.startsWith('product.') ? t(text) : text;
}

function getSignalImage(signal) {
  return signal?.image
    || signal?.thumbnail
    || signal?.importedMetadata?.thumbnail
    || signal?.importedMetadata?.youtube?.thumbnail
    || '';
}

function StudioDataState({ status, area }) {
  const { t } = useI18n();
  const generating = status === 'generating';
  const Icon = generating ? LoaderCircle : FileQuestion;

  return (
    <div className={`studio-data-state ${generating ? 'generating' : ''}`}>
      <span><Icon className={generating ? 'is-spinning' : ''} size={25} /></span>
      <strong>{t(`product.studio.states.${area}.${generating ? 'generatingTitle' : 'unavailableTitle'}`)}</strong>
      <p>{t(`product.studio.states.${area}.${generating ? 'generatingBody' : 'unavailableBody'}`)}</p>
    </div>
  );
}

function OverviewPanel({ signal, analysis }) {
  const { t } = useI18n();
  if (analysis.status !== 'available') return <StudioDataState status={analysis.status} area="analysis" />;

  const [primary, ...supporting] = analysis.items;
  return (
    <div className="studio-panel-content studio-overview">
      <article className="studio-verdict-card">
        <span><Sparkles size={25} /></span>
        <div>
          <small>{t(`product.studio.analysis.types.${primary.label}`)}</small>
          <h2>{resolveCopy(signal.title, t) || t('product.studio.overview.realTitle')}</h2>
          <p>{primary.text}</p>
        </div>
      </article>
      {!!supporting.length && (
        <div className="studio-overview-evidence">
          {supporting.slice(0, 3).map((item) => (
            <article key={item.id}>
              <small>{t(`product.studio.analysis.types.${item.label}`)}</small>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function TranscriptPanel({ transcript }) {
  const { t } = useI18n();
  if (transcript.status !== 'available') return <StudioDataState status={transcript.status} area="transcript" />;

  return (
    <div className="studio-panel-content studio-transcript">
      <header>
        <div>
          <small>{t('product.studio.transcript.label')}</small>
          <h2>{t('product.studio.transcript.title')}</h2>
        </div>
        <span>
          <Check size={15} />
          {transcript.language
            ? t('product.studio.transcript.availableLanguage', { language: transcript.language })
            : t('product.studio.transcript.available')}
        </span>
      </header>

      {!!transcript.segments.length && (
        <section className="studio-transcript-group">
          <h3><Captions size={17} />{t('product.studio.transcript.spoken')}</h3>
          <div>
            {transcript.segments.map((segment) => (
              <article key={segment.id}>
                <time>{segment.time || '—'}</time>
                <p>{segment.text}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      {transcript.spokenText && (
        <section className="studio-transcript-text">
          <h3><MessageSquareText size={17} />{t('product.studio.transcript.spoken')}</h3>
          <p>{transcript.spokenText}</p>
        </section>
      )}

      {transcript.onScreenText && (
        <section className="studio-transcript-text on-screen">
          <h3><MonitorUp size={17} />{t('product.studio.transcript.onScreen')}</h3>
          <p>{transcript.onScreenText}</p>
        </section>
      )}
    </div>
  );
}

function AnalysisPanel({ analysis }) {
  const { t } = useI18n();
  if (analysis.status !== 'available') return <StudioDataState status={analysis.status} area="analysis" />;

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
        {analysis.items.map((item) => {
          const Icon = ANALYSIS_ICONS[item.label] || BrainCircuit;
          return (
            <article key={item.id}>
              <span><Icon size={19} /></span>
              <h3>{t(`product.studio.analysis.types.${item.label}`)}</h3>
              <p>{item.text}</p>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function AdaptationPanel({ signal, remix, scenes, onOpenScript }) {
  const { t } = useI18n();
  if (!remix) return <StudioDataState status="unavailable" area="adaptation" />;

  const sourceTitle = resolveCopy(signal.title, t);
  const adaptedTitle = String(remix.title || '').trim();
  const adaptedHook = String(remix.hook || '').trim();
  const logic = String(remix.adaptationLogic || remix.strategy || remix.rationale || '').trim();

  return (
    <div className="studio-panel-content studio-adaptation">
      <header>
        <div>
          <small>{t('product.studio.adaptation.label')}</small>
          <h2>{t('product.studio.adaptation.title')}</h2>
        </div>
        <span><Check size={15} />{t('product.studio.adaptation.available')}</span>
      </header>
      <div className="studio-adaptation-comparison">
        <article>
          <small>{t('product.studio.adaptation.original')}</small>
          <h3>{sourceTitle || t('product.studio.values.unknownSource')}</h3>
        </article>
        <article>
          <small>{t('product.studio.adaptation.adapted')}</small>
          <h3>{adaptedTitle || adaptedHook || t('product.studio.adaptation.untitled')}</h3>
          {adaptedTitle && adaptedHook && <p>{adaptedHook}</p>}
        </article>
      </div>
      {logic && (
        <aside>
          <Lightbulb size={19} />
          <p><strong>{t('product.studio.adaptation.logic')}</strong>{logic}</p>
        </aside>
      )}
      {!!scenes.length && (
        <button type="button" onClick={onOpenScript}>
          <FileText size={18} />{t('product.studio.adaptation.openScript')}
        </button>
      )}
    </div>
  );
}

function ScriptPanel({ signal, scenes, onAddToPlan }) {
  const { t } = useI18n();
  const planDraft = useMemo(() => buildStudioContentPlanDraft(signal), [signal]);
  if (!scenes.length || !planDraft) return <StudioDataState status="unavailable" area="script" />;

  return (
    <div className="studio-panel-content studio-script">
      <header>
        <div>
          <small>{t('product.studio.script.label')}</small>
          <h2>{planDraft.title}</h2>
        </div>
        <span className="studio-script-source"><Check size={15} />{t('product.studio.script.realDraft')}</span>
      </header>
      <div className="studio-scenes">
        {scenes.map((scene, index) => (
          <article key={scene.id}>
            <span>{index + 1}</span>
            <div>
              {scene.time && <time>{scene.time}</time>}
              {scene.direction && <strong>{scene.direction}</strong>}
              {scene.onScreenText && <p><b>{t('product.studio.script.onScreen')}</b>{scene.onScreenText}</p>}
              {scene.voiceover && <p><b>{t('product.studio.script.voiceover')}</b>{scene.voiceover}</p>}
            </div>
          </article>
        ))}
      </div>
      <button className="studio-schedule-button" type="button" onClick={() => onAddToPlan(planDraft)}>
        <CalendarPlus size={18} />
        {t('product.studio.script.schedule')}
      </button>
    </div>
  );
}

export default function ProductStudioPreview({
  signal = null,
  onChooseSignal,
  onAddToPlan,
}) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState('overview');
  const transcript = useMemo(() => deriveStudioTranscript(signal || {}), [signal]);
  const analysis = useMemo(() => deriveStudioAnalysis(signal || {}), [signal]);
  const links = useMemo(() => getStudioSourceLinks(signal || {}), [signal]);
  const remix = useMemo(() => getStudioRemix(signal || {}), [signal]);
  const scenes = useMemo(() => normalizeStudioScriptScenes(signal || {}), [signal]);

  useEffect(() => {
    setActiveTab('overview');
  }, [signal?.id, signal?.sourceUrl]);

  if (!signal) {
    return (
      <section className="product-studio-page">
        <header className="studio-page-heading">
          <div>
            <p>{t('product.nav.discover')} <span>/</span> {t('product.nav.studio')}</p>
            <h1>{t('product.studio.title')}</h1>
          </div>
        </header>
        <div className="studio-empty-selection">
          <span><FileText size={28} /></span>
          <strong>{t('product.studio.empty.title')}</strong>
          <p>{t('product.studio.empty.body')}</p>
          <button type="button" onClick={onChooseSignal}>{t('product.studio.empty.action')}</button>
        </div>
      </section>
    );
  }

  const creator = resolveCopy(signal.creator || signal.handle || signal.sourceHandle, t)
    || t('product.studio.values.unknownCreator');
  const handle = resolveCopy(signal.handle || signal.sourceHandle, t);
  const platform = resolveCopy(signal.platform || signal.importedMetadata?.source?.label, t)
    || t('product.studio.values.unknownPlatform');
  const title = resolveCopy(signal.title, t) || t('product.studio.values.untitledSignal');
  const image = getSignalImage(signal);
  const initials = String(signal.initials || creator)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
  const metrics = [
    ['product.studio.source.views', signal.views],
    ['product.studio.source.likes', signal.likes],
    ['product.studio.source.match', signal.aiMatch],
  ].filter(([, value]) => value !== undefined && value !== null && String(value).trim() && String(value).trim() !== '-');
  const strategyTags = [signal.niche, ...(Array.isArray(signal.tags) ? signal.tags : [])]
    .map((value) => resolveCopy(value, t))
    .filter(Boolean);

  return (
    <section className="product-studio-page">
      <header className="studio-page-heading">
        <div>
          <p>{t('product.nav.discover')} <span>/</span> {t('product.nav.studio')}</p>
          <h1>{t('product.studio.title')}</h1>
        </div>
        <button type="button" onClick={onChooseSignal}>{t('product.studio.actions.changeSignal')}</button>
      </header>

      <div className="studio-workspace">
        <div className="studio-source-column">
          <article
            className={`studio-video-preview ${image ? 'has-source-image' : 'no-source-image'}`}
            style={image ? { backgroundImage: `linear-gradient(180deg, rgba(4, 11, 20, .12), rgba(4, 11, 20, .86)), url("${image}")` } : undefined}
          >
            {!image && <FileText size={42} aria-hidden="true" />}
            <span className="studio-video-kicker">{t('product.studio.video.kicker')}</span>
            <strong>{title}</strong>
            <small>{image ? t('product.studio.video.sourcePreview') : t('product.studio.video.noPreview')}</small>
          </article>

          <article className="studio-source-card">
            <header>
              <span>{initials || '—'}</span>
              <div>
                <strong>{creator}</strong>
                <small>{[platform, handle].filter(Boolean).join(' · ')}</small>
              </div>
            </header>

            {!!metrics.length && (
              <div className="studio-source-metrics">
                {metrics.map(([label, value]) => (
                  <p key={label}><small>{t(label)}</small><strong>{value}</strong></p>
                ))}
              </div>
            )}

            <div className="studio-external-actions">
              {links.profileUrl && (
                <a href={links.profileUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={16} />{t('product.studio.source.openProfile')}
                </a>
              )}
              {links.originalUrl && (
                <a href={links.originalUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={16} />{t('product.studio.source.openOriginal')}
                </a>
              )}
            </div>
            {(!links.profileUrl || !links.originalUrl) && (
              <div className="studio-link-availability">
                {!links.profileUrl && <small>{t('product.studio.source.profileUnavailable')}</small>}
                {!links.originalUrl && <small>{t('product.studio.source.originalUnavailable')}</small>}
              </div>
            )}

            <div className="studio-source-actions">
              <button type="button" onClick={() => setActiveTab('analysis')}><BarChart3 size={16} />{t('product.studio.source.analytics')}</button>
              <button type="button" onClick={() => setActiveTab('overview')}><RefreshCw size={16} />{t('product.studio.source.deconstruct')}</button>
            </div>
          </article>

          {!!strategyTags.length && (
            <div className="studio-strategy-tags">
              {strategyTags.map((tag) => <span key={tag}>{tag}</span>)}
            </div>
          )}
        </div>

        <article className="studio-command-center">
          <nav aria-label={t('product.studio.tabs.label')}>
            {STUDIO_TABS.map((tab) => (
              <button key={tab.id} className={activeTab === tab.id ? 'active' : ''} type="button" onClick={() => setActiveTab(tab.id)}>
                {t(tab.label)}
              </button>
            ))}
          </nav>
          {activeTab === 'overview' && <OverviewPanel signal={signal} analysis={analysis} />}
          {activeTab === 'transcript' && <TranscriptPanel transcript={transcript} />}
          {activeTab === 'analysis' && <AnalysisPanel analysis={analysis} />}
          {activeTab === 'adaptation' && <AdaptationPanel signal={signal} remix={remix} scenes={scenes} onOpenScript={() => setActiveTab('script')} />}
          {activeTab === 'script' && <ScriptPanel signal={signal} scenes={scenes} onAddToPlan={onAddToPlan} />}
        </article>
      </div>
    </section>
  );
}
