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
  getStudioRemixes,
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

const SOURCE_DIAGNOSTIC_COPY = Object.freeze({
  public_url_analysis_unsupported: 'unsupported',
  unsupported_platform: 'unsupported',
  source_private_or_login_required: 'restricted',
  source_age_restricted: 'restricted',
  source_region_restricted: 'restricted',
  captions_unavailable: 'captions',
  provider_rate_limited: 'temporary',
  provider_unavailable: 'temporary',
  provider_budget_exceeded: 'temporary',
  provider_response_invalid: 'invalidResponse',
  provider_source_inaccessible: 'inaccessible',
  grounded_observations_unavailable: 'inaccessible',
  provider_not_configured: 'configuration',
  provider_rejected: 'inaccessible',
  source_url_invalid: 'inaccessible',
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

function getSourceGrounding(signal) {
  return signal?.importedMetadata?.grounding
    || signal?.importedMetadata?.sourceGrounding
    || signal?.personalUrlAdaptation?.sourceContext?.grounding
    || null;
}

function StudioDataState({ status, area, onRetry, retrying = false }) {
  const { t } = useI18n();
  const busy = status === 'generating' || status === 'loading';
  const stateKey = status === 'loading'
    ? 'loading'
    : busy
      ? 'generating'
      : status === 'not_applicable'
        ? 'notApplicable'
        : 'unavailable';
  const Icon = busy ? LoaderCircle : FileQuestion;

  return (
    <div className={`studio-data-state ${busy ? 'generating' : ''}`} role={busy ? 'status' : undefined}>
      <span><Icon className={busy ? 'is-spinning' : ''} size={25} /></span>
      <strong>{t(`product.studio.states.${area}.${stateKey}Title`)}</strong>
      <p>{t(`product.studio.states.${area}.${stateKey}Body`)}</p>
      {onRetry && !busy && (
        <button className="studio-data-retry" type="button" disabled={retrying} onClick={onRetry}>
          <RefreshCw className={retrying ? 'is-spinning' : ''} size={16} />
          {t(retrying ? 'product.studio.source.retryingAnalysis' : 'product.studio.source.retryAnalysis')}
        </button>
      )}
    </div>
  );
}

function SourceDiagnosticBanner({ diagnostic }) {
  const { t } = useI18n();
  if (!diagnostic?.reasonCode) return null;
  const copyKey = SOURCE_DIAGNOSTIC_COPY[diagnostic.reasonCode] || 'generic';
  const ownerAuthorizedCaptions = diagnostic.fallback === 'user_owned_upload_or_owner_authorized_captions';
  return (
    <div className="studio-source-diagnostic" role="alert" data-reason={diagnostic.reasonCode}>
      <span><FileQuestion size={20} /></span>
      <div>
        <strong>{t(`product.studio.source.diagnostics.${copyKey}Title`)}</strong>
        <p>{t(`product.studio.source.diagnostics.${copyKey}Body`)}</p>
        <small>{t(ownerAuthorizedCaptions
          ? 'product.studio.source.diagnostics.fallbackOwnedOrCaptions'
          : 'product.studio.source.diagnostics.fallbackOwned')}</small>
      </div>
    </div>
  );
}

function OverviewPanel({ signal, analysis, onRetryAnalysis, retryingAnalysis }) {
  const { t } = useI18n();
  const grounding = getSourceGrounding(signal);
  const readinessStatus = grounding?.status === 'full' ? 'full' : 'unavailable';
  const readinessMode = grounding?.mode === 'video' ? 'video' : grounding?.mode === 'transcript' ? 'transcript' : 'unavailable';

  return (
    <div className="studio-panel-content studio-overview">
      {grounding && (
        <article className="studio-source-readiness">
          <div>
            <small>{t('product.studio.source.readinessLabel')}</small>
            <strong>{t(`product.studio.source.readiness.${readinessStatus}`)}</strong>
          </div>
          <p>{t(`product.studio.source.readinessBody.${readinessMode}`)}</p>
        </article>
      )}
      {analysis.status !== 'available' && (
        <StudioDataState
          status={analysis.status}
          area="analysis"
          onRetry={onRetryAnalysis}
          retrying={retryingAnalysis}
        />
      )}
      {analysis.status === 'available' && (() => {
        const [primary, ...supporting] = analysis.items;
        return (
          <>
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
          </>
        );
      })()}
    </div>
  );
}

function TranscriptPanel({ transcript, onRetryAnalysis, retryingAnalysis }) {
  const { t } = useI18n();
  if (transcript.status !== 'available') {
    return (
      <StudioDataState
        status={transcript.status}
        area="transcript"
        onRetry={onRetryAnalysis}
        retrying={retryingAnalysis}
      />
    );
  }

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

function AnalysisPanel({ analysis, onRetryAnalysis, retryingAnalysis }) {
  const { t } = useI18n();
  if (analysis.status !== 'available') {
    return (
      <StudioDataState
        status={analysis.status}
        area="analysis"
        onRetry={onRetryAnalysis}
        retrying={retryingAnalysis}
      />
    );
  }

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

function AdaptationPanel({ signal, adaptation, remix, scenes, variantIndex, variantCount, onSelectVariant, onOpenScript }) {
  const { t } = useI18n();
  if (!remix) return <StudioDataState status="unavailable" area="adaptation" />;

  const sourceTitle = resolveCopy(signal.title, t);
  const adaptedTitle = String(remix.title || '').trim();
  const adaptedHook = String(remix.hook || '').trim();
  const cta = String(remix.cta || '').trim();
  const sourceMechanic = String(
    adaptation?.result?.deconstruction?.coreMechanics
      || signal?.importedMetadata?.qualityGate?.contentMechanic
      || signal?.importedMetadata?.videoIntelligence?.video?.contentMechanic
      || '',
  ).trim();
  const transferableMechanic = String(signal?.importedMetadata?.qualityGate?.transferableMechanic || '').trim();
  const productionConstraints = String(adaptation?.result?.viabilityFilter?.productionFeasibility || '').trim();
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
      {variantCount > 1 && (
        <div className="studio-adaptation-variants" role="group" aria-label={t('product.studio.adaptation.variants')}>
          {Array.from({ length: variantCount }, (_, index) => (
            <button
              key={`variant-${index + 1}`}
              className={variantIndex === index ? 'active' : ''}
              type="button"
              onClick={() => onSelectVariant(index)}
            >
              {t('product.studio.adaptation.variant', { count: index + 1 })}
            </button>
          ))}
        </div>
      )}
      {logic && (
        <aside>
          <Lightbulb size={19} />
          <p><strong>{t('product.studio.adaptation.logic')}</strong>{logic}</p>
        </aside>
      )}
      {(sourceMechanic || transferableMechanic || productionConstraints || cta) && (
        <div className="studio-adaptation-package">
          {sourceMechanic && <p><strong>{t('product.studio.adaptation.sourceMechanic')}</strong>{sourceMechanic}</p>}
          {transferableMechanic && <p><strong>{t('product.studio.adaptation.transferableMechanic')}</strong>{transferableMechanic}</p>}
          {productionConstraints && <p><strong>{t('product.studio.adaptation.constraints')}</strong>{productionConstraints}</p>}
          {cta && <p><strong>{t('product.studio.adaptation.cta')}</strong>{cta}</p>}
        </div>
      )}
      {!!scenes.length && (
        <button type="button" onClick={onOpenScript}>
          <FileText size={18} />{t('product.studio.adaptation.openScript')}
        </button>
      )}
    </div>
  );
}

function AdaptationStatePanel({ signal, remix, scenes, adaptationState, variantIndex, variantCount, onSelectVariant, onGenerate, onRetry, onOpenScript }) {
  const { t } = useI18n();
  const status = adaptationState?.status || 'absent';
  if (status === 'ready' && remix) {
    return <AdaptationPanel
      signal={signal}
      adaptation={adaptationState?.adaptation}
      remix={remix}
      scenes={scenes}
      variantIndex={variantIndex}
      variantCount={variantCount}
      onSelectVariant={onSelectVariant}
      onOpenScript={onOpenScript}
    />;
  }
  if (status === 'loading' || status === 'generating') {
    return <StudioDataState status={status} area="adaptation" />;
  }

  const isError = status === 'error';
  const isBrandIncomplete = adaptationState?.errorCode === 'product_brand_brain_incomplete';
  const isBrandChanged = adaptationState?.errorCode === 'workspace_adaptation_brand_changed';
  return (
    <div className="studio-data-state studio-adaptation-state" role={isError ? 'alert' : undefined}>
      <span><FileQuestion size={25} /></span>
      <strong>{t(isError
        ? (isBrandIncomplete
          ? 'product.studio.adaptation.brandRequiredTitle'
          : isBrandChanged
            ? 'product.studio.adaptation.brandChangedTitle'
          : 'product.studio.adaptation.errorTitle')
        : 'product.studio.adaptation.absentTitle')}</strong>
      <p>{t(isError
        ? (isBrandIncomplete
          ? 'product.studio.adaptation.brandRequiredBody'
          : isBrandChanged
            ? 'product.studio.adaptation.brandChangedBody'
          : 'product.studio.adaptation.errorBody')
        : 'product.studio.adaptation.absentBody')}</p>
      <button type="button" onClick={isError ? onRetry : onGenerate}>
        {t(isError ? 'product.studio.adaptation.retry' : 'product.studio.adaptation.generate')}
      </button>
    </div>
  );
}

function ScriptPanel({ signal, adaptation, remix, variantIndex, scenes, onAddToPlan, addToPlanState }) {
  const { t } = useI18n();
  const planDraft = useMemo(() => buildStudioContentPlanDraft(signal, adaptation, remix), [adaptation, remix, signal]);
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
      {addToPlanState?.status === 'error' && (
        <div className="studio-action-error" role="alert">{t('product.studio.script.scheduleError')}</div>
      )}
      <button
        className="studio-schedule-button"
        type="button"
        disabled={addToPlanState?.status === 'saving'}
        onClick={() => onAddToPlan(planDraft)}
      >
        <CalendarPlus size={18} />
        {t(addToPlanState?.status === 'saving' ? 'product.studio.script.scheduleSaving' : 'product.studio.script.schedule')}
      </button>
    </div>
  );
}

export default function ProductStudioPreview({
  signal = null,
  onChooseSignal,
  onAddToPlan,
  adaptationState = { status: 'absent', adaptation: null, errorCode: '' },
  onGenerateAdaptation = () => {},
  onRetryAdaptation = () => {},
  addToPlanState = { status: 'idle', errorCode: '' },
}) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState('overview');
  const [variantIndex, setVariantIndex] = useState(0);
  const transcript = useMemo(() => deriveStudioTranscript(signal || {}), [signal]);
  const analysis = useMemo(() => deriveStudioAnalysis(signal || {}), [signal]);
  const sourceGrounding = getSourceGrounding(signal);
  const sourceDiagnostic = adaptationState?.diagnostic
    || signal?.personalUrlAdaptation?.sourceContext?.diagnostic
    || null;
  const needsGroundedAnalysis = signal?.sourceType === 'personal_url' && sourceGrounding?.status !== 'full';
  const retryingGroundedAnalysis = adaptationState?.status === 'generating' || adaptationState?.status === 'loading';
  const retryGroundedAnalysis = needsGroundedAnalysis && sourceDiagnostic?.retryable !== false
    ? onRetryAdaptation
    : undefined;
  const links = useMemo(() => getStudioSourceLinks(signal || {}), [signal]);
  const remixes = useMemo(
    () => getStudioRemixes(signal || {}, adaptationState?.adaptation),
    [adaptationState?.adaptation, signal],
  );
  const selectedVariantIndex = Math.min(variantIndex, Math.max(0, remixes.length - 1));
  const remix = remixes[selectedVariantIndex] || null;
  const scenes = useMemo(
    () => normalizeStudioScriptScenes(signal || {}, adaptationState?.adaptation, remix),
    [adaptationState?.adaptation, remix, signal],
  );

  useEffect(() => {
    setActiveTab('overview');
    setVariantIndex(0);
  }, [signal?.id, signal?.sourceUrl, adaptationState?.adaptation?.id]);

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
          {signal?.sourceType === 'personal_url' && <SourceDiagnosticBanner diagnostic={sourceDiagnostic} />}
          {activeTab === 'overview' && (
            <OverviewPanel
              signal={signal}
              analysis={analysis}
              onRetryAnalysis={retryGroundedAnalysis}
              retryingAnalysis={retryingGroundedAnalysis}
            />
          )}
          {activeTab === 'transcript' && (
            <TranscriptPanel
              transcript={transcript}
              onRetryAnalysis={retryGroundedAnalysis}
              retryingAnalysis={retryingGroundedAnalysis}
            />
          )}
          {activeTab === 'analysis' && (
            <AnalysisPanel
              analysis={analysis}
              onRetryAnalysis={retryGroundedAnalysis}
              retryingAnalysis={retryingGroundedAnalysis}
            />
          )}
          {activeTab === 'adaptation' && (
            <AdaptationStatePanel
              signal={signal}
              remix={remix}
              scenes={scenes}
              adaptationState={adaptationState}
              variantIndex={selectedVariantIndex}
              variantCount={remixes.length}
              onSelectVariant={setVariantIndex}
              onGenerate={onGenerateAdaptation}
              onRetry={onRetryAdaptation}
              onOpenScript={() => setActiveTab('script')}
            />
          )}
          {activeTab === 'script' && (
            <ScriptPanel
              signal={signal}
              adaptation={adaptationState?.adaptation}
              remix={remix}
              variantIndex={selectedVariantIndex}
              scenes={scenes}
              addToPlanState={addToPlanState}
              onAddToPlan={(draft) => onAddToPlan?.({
                ...draft,
                origin: adaptationState?.adaptation ? 'studio_adaptation' : 'product_redesign',
                sourceAdaptationId: adaptationState?.adaptation?.id || '',
                sourceGenerationId: adaptationState?.adaptation?.generationId || '',
                sourceSignalId: signal.id || '',
                sourceType: signal.sourceType || '',
                savedUrlId: signal.savedUrlId || '',
                sourceVariantIndex: adaptationState?.adaptation ? selectedVariantIndex : null,
                sourceTitle: signal.title || '',
                sourceUrl: signal.sourceUrl || '',
                hook: remix?.hook || '',
                cta: remix?.cta || '',
                scenes: remix?.visualFlow || [],
              })}
            />
          )}
        </article>
      </div>
    </section>
  );
}
