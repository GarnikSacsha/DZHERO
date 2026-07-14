import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  Check,
  CircleCheck,
  FileVideo,
  Film,
  Lightbulb,
  LoaderCircle,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Square,
  Upload,
} from 'lucide-react';

import {
  AGENT_STUDIO_STAGE_ORDER,
  buildAgentStudioCreatePayload,
  getAgentStudioCandidates,
  getAgentStudioCopy,
  getAgentStudioErrorMessage,
  getAgentStudioGroundingPercent,
  getAgentStudioStageState,
  getAgentStudioTraceEntries,
  shouldPollAgentStudioRun,
} from './agentStudioUi.mjs';

function buildIdempotencyKey() {
  const randomPart = globalThis.crypto?.randomUUID?.().replaceAll('-', '_')
    || Math.random().toString(36).slice(2);
  return `agent_ui_${Date.now()}_${randomPart}`;
}

async function readResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || payload.error || `HTTP ${response.status}`);
    Object.assign(error, payload, { status: response.status });
    throw error;
  }
  return payload;
}

async function uploadVideoSource(fetcher, url, file) {
  return readResponse(await fetcher(url, {
    method: 'POST',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
      'X-File-Name': encodeURIComponent(file.name || 'uploaded-video.mp4'),
    },
    body: file,
  }));
}

function AgentStageRail({ run, copy }) {
  return (
    <ol className="agent-studio-stage-rail" aria-label={copy.running}>
      {AGENT_STUDIO_STAGE_ORDER.map((stage) => {
        const state = getAgentStudioStageState(run.status, stage);
        return (
          <li className={state} key={stage}>
            <span>{state === 'complete' ? <Check size={13} /> : state === 'active' ? <LoaderCircle size={13} /> : null}</span>
            <div>
              <strong data-i18n-content>{copy.stages[stage]}</strong>
              <small data-i18n-content>{stage.replaceAll('_', ' ')}</small>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function AgentTrace({ trace, copy }) {
  if (!trace?.length) return null;
  const visibleTrace = getAgentStudioTraceEntries(trace);
  return (
    <section className="agent-studio-trace agent-studio-panel">
      <div className="agent-studio-section-head">
        <div>
          <small>TRANSPARENT ORCHESTRATION</small>
          <h3 data-i18n-content>{copy.trace}</h3>
        </div>
        <span>{visibleTrace.length}</span>
      </div>
      <div className="agent-studio-trace-list">
        {[...visibleTrace].reverse().map((entry) => (
          <article key={entry.id}>
            <span className={`agent-studio-trace-dot ${entry.status}`} />
            <div>
              <strong data-i18n-content>{entry.agent}</strong>
              <p data-i18n-content>{entry.summary}</p>
            </div>
            <small data-i18n-content>{entry.status.replaceAll('_', ' ')}</small>
          </article>
        ))}
      </div>
    </section>
  );
}

function EvidencePanel({ evidence, copy }) {
  if (!evidence) return null;
  return (
    <section className="agent-studio-panel agent-studio-evidence">
      <div className="agent-studio-section-head">
        <div>
          <small>GROUNDED, NOT GUESSED</small>
          <h3 data-i18n-content>{copy.evidence}</h3>
        </div>
        <span>{evidence.availability}</span>
      </div>
      <p data-i18n-content>{evidence.summary}</p>
      <div className="agent-studio-mechanic">
        <ShieldCheck size={17} />
        <div>
          <small data-i18n-content>{copy.mechanic}</small>
          <strong data-i18n-content>{evidence.transferableMechanic}</strong>
        </div>
      </div>
      <div className="agent-studio-evidence-list">
        {(evidence.items || []).slice(0, 6).map((item) => (
          <article key={item.id}>
            <small data-i18n-content>{item.sourceType.replaceAll('_', ' ')}{item.timestamp ? ` · ${item.timestamp}` : ''}</small>
            <p data-i18n-content>{item.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function CandidateCard({ candidate, selected, hybridSelected, hybridOrder, hybridMode, copy, onSelect }) {
  const isHero = candidate.kind === 'hero' || candidate.kind === 'hybrid';
  return (
    <button className={`agent-studio-candidate ${selected ? 'selected' : ''} ${hybridSelected ? 'hybrid-selected' : ''}`} type="button" onClick={onSelect}>
      <div className="agent-studio-candidate-top">
        <span>{isHero ? <Film size={16} /> : <Lightbulb size={16} />}</span>
        <small data-i18n-content>{candidate.kind === 'hybrid' ? copy.hybrid : isHero ? copy.hero : copy.alternative}</small>
        {hybridMode && hybridSelected
          ? <b className="agent-studio-hybrid-order">{hybridOrder}</b>
          : selected && <CircleCheck size={18} />}
      </div>
      <h4 data-i18n-content>{candidate.title}</h4>
      <p data-i18n-content>{candidate.concept}</p>
      <strong data-i18n-content>“{candidate.hook}”</strong>
      <small className="agent-studio-candidate-cta" data-i18n-content>CTA · {candidate.cta}</small>
    </button>
  );
}

function CreativeResult({ run, selectedCandidateId, setSelectedCandidateId, copy, onApprove, onHybrid, isApproving, isHybridizing }) {
  const { artifacts = {} } = run;
  const candidates = getAgentStudioCandidates(run);
  const selected = candidates.find((candidate) => candidate.id === selectedCandidateId) || candidates[0];
  const [hybridMode, setHybridMode] = useState(false);
  const [hybridCandidateIds, setHybridCandidateIds] = useState([]);
  if (!artifacts.creative || !selected) return null;
  const isApproved = run.status === 'completed' && Boolean(run.approval);
  const groundingPercent = getAgentStudioGroundingPercent(artifacts.evaluation?.scores?.grounding);
  const toggleHybridCandidate = (candidateId) => {
    setHybridCandidateIds((current) => current.includes(candidateId)
      ? current.filter((id) => id !== candidateId)
      : current.length < 2 ? [...current, candidateId] : [current[1], candidateId]);
  };
  const closeHybridMode = () => {
    setHybridMode(false);
    setHybridCandidateIds([]);
  };

  return (
    <div className="agent-studio-results">
      <section className="agent-studio-manager-review">
        <div className="agent-studio-manager-avatar"><Bot size={22} /></div>
        <div>
          <small data-i18n-content>{copy.resultEyebrow}</small>
          <h2 data-i18n-content>{artifacts.managerReview?.headline}</h2>
          <h4 data-i18n-content>{copy.why}</h4>
          <p data-i18n-content>{artifacts.managerReview?.whyItWorks}</p>
        </div>
      </section>

      <EvidencePanel evidence={artifacts.evidence} copy={copy} />

      <section className="agent-studio-panel">
        <div className="agent-studio-section-head">
          <div>
            <small>3 CREATIVE ROUTES</small>
            <h3 data-i18n-content>{copy.concepts}</h3>
          </div>
          {groundingPercent !== null && <span>{groundingPercent}% grounded</span>}
        </div>
        <div className={`agent-studio-hybrid-controls ${hybridMode ? 'active' : ''}`}>
          {!hybridMode ? (
            <button type="button" onClick={() => setHybridMode(true)} disabled={isApproved}>
              <Sparkles size={15} />
              <span data-i18n-content>{copy.hybridMode}</span>
            </button>
          ) : (
            <>
              <p data-i18n-content>{copy.hybridHint}</p>
              <div>
                <button className="ghost" type="button" onClick={closeHybridMode} disabled={isHybridizing}>
                  <span data-i18n-content>{copy.hybridCancel}</span>
                </button>
                <button className="dark" type="button" onClick={() => onHybrid(hybridCandidateIds)} disabled={hybridCandidateIds.length !== 2 || isHybridizing}>
                  {isHybridizing ? <LoaderCircle className="spin" size={15} /> : <Sparkles size={15} />}
                  <span data-i18n-content>{isHybridizing ? copy.hybridCreating : copy.hybridCreate}</span>
                </button>
              </div>
            </>
          )}
        </div>
        <div className="agent-studio-candidate-grid">
          {candidates.map((candidate) => (
            <CandidateCard
              candidate={candidate}
              copy={copy}
              key={candidate.id}
              selected={!hybridMode && selected.id === candidate.id}
              hybridMode={hybridMode}
              hybridSelected={hybridCandidateIds.includes(candidate.id)}
              hybridOrder={hybridCandidateIds.indexOf(candidate.id) + 1}
              onSelect={() => hybridMode ? toggleHybridCandidate(candidate.id) : setSelectedCandidateId(candidate.id)}
            />
          ))}
        </div>

        {selected.scenes?.length > 0 && (
          <div className="agent-studio-scenes">
            <h3 data-i18n-content>{copy.scenes}</h3>
            {selected.scenes.map((scene, index) => (
              <article key={`${scene.timeframe}-${index}`}>
                <span data-i18n-content>{scene.timeframe}</span>
                <div>
                  <strong data-i18n-content>{scene.action}</strong>
                  {scene.onScreenText && <p data-i18n-content>TEXT · {scene.onScreenText}</p>}
                  {scene.voiceover && <p data-i18n-content>VO · {scene.voiceover}</p>}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="agent-studio-panel">
        <div className="agent-studio-section-head">
          <div>
            <small>ONE SIGNAL → ONE WEEK</small>
            <h3 data-i18n-content>{copy.plan}</h3>
          </div>
          <span>7 days</span>
        </div>
        <p className="agent-studio-plan-strategy" data-i18n-content>{artifacts.contentPlan?.strategy}</p>
        <div className="agent-studio-plan-grid">
          {(artifacts.contentPlan?.days || []).map((day) => (
            <article key={day.day}>
              <span>{day.day}</span>
              <div>
                <small data-i18n-content>{day.format} · {day.objective}</small>
                <strong data-i18n-content>{day.title}</strong>
                <p data-i18n-content>{day.hook}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <div className="agent-studio-approval-bar">
        <div>
          <strong data-i18n-content>{selected.title}</strong>
          <small data-i18n-content>{artifacts.managerReview?.approvalPrompt}</small>
        </div>
        <button className="dark" type="button" onClick={() => onApprove(selected.id)} disabled={isApproving || isApproved}>
          {isApproved ? <CircleCheck size={17} /> : isApproving ? <LoaderCircle className="spin" size={17} /> : <Sparkles size={17} />}
          <span data-i18n-content>{isApproved ? copy.approved : isApproving ? copy.approving : copy.approve}</span>
        </button>
      </div>
    </div>
  );
}

export default function AgentStudioPage({ apiBase, fetcher, workspaceId, signals = [], language = 'uk', notify }) {
  const copy = getAgentStudioCopy(language);
  const [config, setConfig] = useState(null);
  const [configError, setConfigError] = useState('');
  const [form, setForm] = useState({ mode: 'find_trend', objective: '', sourceUrl: '', signalId: '', userNotes: '' });
  const [run, setRun] = useState(null);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isHybridizing, setIsHybridizing] = useState(false);
  const [isRetryingSource, setIsRetryingSource] = useState(false);
  const [isUploadingSource, setIsUploadingSource] = useState(false);
  const [sourceFile, setSourceFile] = useState(null);
  const [contextFile, setContextFile] = useState(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState('');
  const pollGenerationRef = useRef(0);
  const sourceFileRef = useRef(null);
  const contextFileRef = useRef(null);

  const baseUrl = `${apiBase}/workspaces/${encodeURIComponent(workspaceId)}/agent-studio`;
  const selectedSignal = useMemo(
    () => signals.find((signal) => signal.id === form.signalId),
    [signals, form.signalId],
  );

  const loadConfig = async () => {
    setConfigError('');
    try {
      const payload = await readResponse(await fetcher(`${baseUrl}/config`));
      setConfig(payload);
    } catch (nextError) {
      setConfigError(getAgentStudioErrorMessage(nextError, language));
    }
  };

  useEffect(() => {
    setRun(null);
    setSelectedCandidateId('');
    setError('');
    void loadConfig();
  }, [workspaceId, language]);

  useEffect(() => {
    if (!run || !shouldPollAgentStudioRun(run.status)) return undefined;
    const generation = ++pollGenerationRef.current;
    const controller = new AbortController();
    let timer;
    const poll = async () => {
      try {
        const payload = await readResponse(await fetcher(`${baseUrl}/runs/${encodeURIComponent(run.id)}`, { signal: controller.signal }));
        if (generation !== pollGenerationRef.current) return;
        setRun(payload.run);
        if (shouldPollAgentStudioRun(payload.run.status)) timer = window.setTimeout(poll, 900);
      } catch (nextError) {
        if (controller.signal.aborted || generation !== pollGenerationRef.current) return;
        setError(getAgentStudioErrorMessage(nextError, language));
      }
    };
    timer = window.setTimeout(poll, 500);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [run?.id, run?.status, baseUrl, fetcher, language]);

  useEffect(() => {
    const heroId = run?.artifacts?.creative?.heroReel?.id;
    if (heroId && !selectedCandidateId) setSelectedCandidateId(heroId);
  }, [run?.artifacts?.creative?.heroReel?.id, selectedCandidateId]);

  const updateForm = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const startRun = async (event) => {
    event.preventDefault();
    setError('');
    const effectiveForm = {
      ...form,
      sourceUrl: form.sourceUrl || selectedSignal?.sourceUrl || selectedSignal?.url || '',
    };
    if (effectiveForm.objective.trim().length < 3) {
      setError(language === 'en' ? 'Add a clear objective first.' : 'Спочатку додай чітку ціль.');
      return;
    }
    if (sourceFile && sourceFile.size > 100 * 1024 * 1024) {
      setError(language === 'en' ? 'The video file must be 100 MB or smaller.' : 'Відеофайл має бути не більшим за 100 МБ.');
      return;
    }
    if (effectiveForm.mode === 'adapt_reel' && !effectiveForm.signalId && !effectiveForm.sourceUrl.trim() && !sourceFile) {
      setError(language === 'en' ? 'Choose a signal, paste a video URL, or upload the video.' : 'Обери сигнал, встав URL відео або завантаж файл.');
      return;
    }
    setIsSubmitting(true);
    try {
      if (sourceFile) {
        setIsUploadingSource(true);
        const upload = await uploadVideoSource(fetcher, `${baseUrl}/uploads`, sourceFile);
        effectiveForm.uploadId = upload.uploadId;
      }
      const payload = buildAgentStudioCreatePayload(effectiveForm, buildIdempotencyKey());
      const result = await readResponse(await fetcher(`${baseUrl}/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }));
      setRun(result.run);
      setSelectedCandidateId('');
      notify?.(language === 'en' ? 'Jeryk started the specialist agent team.' : 'Джерик запустив команду агентів.');
    } catch (nextError) {
      setError(getAgentStudioErrorMessage(nextError, language));
    } finally {
      setIsUploadingSource(false);
      setIsSubmitting(false);
    }
  };

  const uploadBlockedSource = async (event) => {
    event.preventDefault();
    setError('');
    if (!contextFile) {
      setError(language === 'en' ? 'Choose the video file first.' : 'Спочатку обери відеофайл.');
      return;
    }
    if (contextFile.size > 100 * 1024 * 1024) {
      setError(language === 'en' ? 'The video file must be 100 MB or smaller.' : 'Відеофайл має бути не більшим за 100 МБ.');
      return;
    }
    setIsUploadingSource(true);
    try {
      const payload = await uploadVideoSource(fetcher, `${baseUrl}/runs/${encodeURIComponent(run.id)}/source-file`, contextFile);
      setRun(payload.run);
      setContextFile(null);
      if (contextFileRef.current) contextFileRef.current.value = '';
    } catch (nextError) {
      setError(getAgentStudioErrorMessage(nextError, language));
    } finally {
      setIsUploadingSource(false);
    }
  };

  const retrySource = async () => {
    setError('');
    setIsRetryingSource(true);
    try {
      const payload = await readResponse(await fetcher(`${baseUrl}/runs/${encodeURIComponent(run.id)}/retry-source`, {
        method: 'POST',
      }));
      setRun(payload.run);
      notify?.(language === 'en'
        ? 'Retrying the automatic Apify and Gemini video path.'
        : 'Повторюємо автоматичний шлях через Apify та Gemini.');
    } catch (nextError) {
      setError(getAgentStudioErrorMessage(nextError, language));
    } finally {
      setIsRetryingSource(false);
    }
  };

  const cancelRun = async () => {
    setError('');
    try {
      const payload = await readResponse(await fetcher(`${baseUrl}/runs/${encodeURIComponent(run.id)}/cancel`, { method: 'POST' }));
      setRun(payload.run);
      notify?.(language === 'en' ? 'Agent Studio run cancelled.' : 'Запуск Agent Studio скасовано.');
    } catch (nextError) {
      setError(getAgentStudioErrorMessage(nextError, language));
    }
  };

  const approveRun = async (candidateId) => {
    setError('');
    setIsApproving(true);
    try {
      const payload = await readResponse(await fetcher(`${baseUrl}/runs/${encodeURIComponent(run.id)}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateId, addToContentPlan: true }),
      }));
      setRun(payload.run);
      notify?.(language === 'en' ? `${payload.addedPosts} days added to Content Plan.` : `${payload.addedPosts} днів додано в контент-план.`);
    } catch (nextError) {
      setError(getAgentStudioErrorMessage(nextError, language));
    } finally {
      setIsApproving(false);
    }
  };

  const createHybrid = async (candidateIds) => {
    setError('');
    setIsHybridizing(true);
    try {
      const payload = await readResponse(await fetcher(`${baseUrl}/runs/${encodeURIComponent(run.id)}/hybrid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateIds }),
      }));
      setRun(payload.run);
      setSelectedCandidateId('');
      notify?.(language === 'en'
        ? 'Hybrid Producer is combining and re-checking the two directions.'
        : 'Hybrid Producer об’єднує та повторно перевіряє два напрями.');
    } catch (nextError) {
      setError(getAgentStudioErrorMessage(nextError, language));
    } finally {
      setIsHybridizing(false);
    }
  };

  const resetRun = () => {
    pollGenerationRef.current += 1;
    setRun(null);
    setError('');
    setSourceFile(null);
    setContextFile(null);
    if (sourceFileRef.current) sourceFileRef.current.value = '';
    if (contextFileRef.current) contextFileRef.current.value = '';
    setSelectedCandidateId('');
    setIsHybridizing(false);
    setIsRetryingSource(false);
  };

  if (configError && !config) {
    return (
      <section className="agent-studio-page agent-studio-centered-state">
        <Bot size={30} />
        <h2 data-i18n-content>{configError}</h2>
        <button type="button" onClick={loadConfig}><RefreshCw size={16} /><span data-i18n-content>{copy.retry}</span></button>
      </section>
    );
  }

  if (!config) {
    return <section className="agent-studio-page agent-studio-centered-state"><LoaderCircle className="spin" size={30} /></section>;
  }

  if (!config.enabled || !config.configured) {
    return (
      <section className="agent-studio-page agent-studio-centered-state">
        <Bot size={34} />
        <small>{copy.eyebrow}</small>
        <h2 data-i18n-content>{config.enabled ? copy.missingTitle : copy.disabledTitle}</h2>
        <p data-i18n-content>{config.enabled ? `${copy.missingTitle}: ${(config.missing || []).join(', ')}` : copy.disabledText}</p>
      </section>
    );
  }

  return (
    <section className="agent-studio-page">
      <header className="agent-studio-hero">
        <div>
          <span className="agent-studio-beta"><Sparkles size={13} />{copy.eyebrow}</span>
          <h1 data-i18n-content>{copy.title}</h1>
          <p data-i18n-content>{copy.subtitle}</p>
        </div>
        <div className="agent-studio-provider-strip">
          <span><Bot size={15} /> Jeryk Manager</span>
          <span>OpenAI Agents SDK</span>
          <span>Any URL / upload + Gemini evidence</span>
        </div>
        {run && ['completed', 'failed', 'cancelled'].includes(run.status) && <button className="ghost" type="button" onClick={resetRun}><RefreshCw size={15} /><span data-i18n-content>{copy.newRun}</span></button>}
      </header>

      {!run ? (
        <form className="agent-studio-builder" onSubmit={startRun}>
          <div className="agent-studio-mode-grid">
            {['find_trend', 'adapt_reel'].map((mode) => (
              <button className={form.mode === mode ? 'selected' : ''} type="button" key={mode} onClick={() => updateForm('mode', mode)}>
                <span>{mode === 'find_trend' ? <Search size={20} /> : <Film size={20} />}</span>
                <div>
                  <strong data-i18n-content>{copy.modes[mode].title}</strong>
                  <p data-i18n-content>{copy.modes[mode].description}</p>
                </div>
                {form.mode === mode && <CircleCheck size={18} />}
              </button>
            ))}
          </div>

          <label className="agent-studio-field">
            <span data-i18n-content>{copy.objective}</span>
            <textarea value={form.objective} onChange={(event) => updateForm('objective', event.target.value)} placeholder={copy.objectivePlaceholder} rows={3} maxLength={500} />
          </label>
          {!form.objective && (
            <button
              className="agent-studio-demo-chip"
              type="button"
              onClick={() => updateForm('objective', language === 'en'
                ? 'Bring more weekday morning visits to a neighborhood coffee shop with a low-budget Reel anyone can shoot.'
                : 'Привести більше гостей до локальної кавʼярні вранці у будні за допомогою бюджетного Reel, який легко зняти.')}
            >
              <Sparkles size={13} />
              <span data-i18n-content>{copy.demoObjective}</span>
            </button>
          )}

          {form.mode === 'adapt_reel' && (
            <div className="agent-studio-source-grid">
              <label className="agent-studio-field">
                <span data-i18n-content>{copy.source}</span>
                <input value={form.sourceUrl} onChange={(event) => updateForm('sourceUrl', event.target.value)} placeholder={copy.sourcePlaceholder} type="url" />
              </label>
              <label className="agent-studio-field">
                <span data-i18n-content>{copy.signal}</span>
                <select value={form.signalId} onChange={(event) => updateForm('signalId', event.target.value)}>
                  <option value="">{copy.noSignal}</option>
                  {signals.map((signal) => <option value={signal.id} key={signal.id}>{signal.title || signal.handle || signal.id}</option>)}
                </select>
              </label>
              <label className="agent-studio-field agent-studio-wide-field agent-studio-upload-field">
                <span data-i18n-content>{copy.upload}</span>
                <input
                  ref={sourceFileRef}
                  type="file"
                  accept="video/mp4,video/quicktime,video/webm,video/x-m4v,video/3gpp,video/*"
                  onChange={(event) => setSourceFile(event.target.files?.[0] || null)}
                />
                <small><FileVideo size={14} /> <span data-i18n-content>{sourceFile ? `${copy.uploadSelected}: ${sourceFile.name}` : copy.uploadHint}</span></small>
              </label>
            </div>
          )}

          {error && <div className="agent-studio-error" role="alert" data-i18n-content>{error}</div>}
          <button className="agent-studio-run-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? <LoaderCircle className="spin" size={18} /> : <Play size={18} />}
            <span data-i18n-content>{isUploadingSource ? copy.uploading : isSubmitting ? copy.running : copy.run}</span>
          </button>
        </form>
      ) : (
        <div className="agent-studio-run-layout">
          <aside className="agent-studio-run-sidebar">
            <div className="agent-studio-run-status">
              <span className={`agent-studio-status-dot ${run.status}`} />
              <div>
                <small>RUN STATUS</small>
                <strong data-i18n-content>{run.status.replaceAll('_', ' ')}</strong>
              </div>
            </div>
            <AgentStageRail run={run} copy={copy} />
            {(shouldPollAgentStudioRun(run.status) || ['needs_context', 'awaiting_approval'].includes(run.status)) && (
              <button className="ghost danger" type="button" onClick={cancelRun}><Square size={14} /><span data-i18n-content>{copy.cancel}</span></button>
            )}
          </aside>

          <div className="agent-studio-run-main">
            {error && <div className="agent-studio-error" role="alert" data-i18n-content>{error}</div>}
            {!error && run.status === 'awaiting_approval' && run.error && (
              <div className="agent-studio-error" role="alert" data-i18n-content>{getAgentStudioErrorMessage(run.error, language)}</div>
            )}

            {run.status === 'needs_context' && (
              <form className="agent-studio-context-card" onSubmit={uploadBlockedSource}>
                <Film size={23} />
                <div>
                  <h2 data-i18n-content>{copy.contextTitle}</h2>
                  <p data-i18n-content>{run.contextRequest?.message || copy.contextDescription}</p>
                  <label className="agent-studio-field agent-studio-upload-field">
                    <span data-i18n-content>{copy.upload}</span>
                    <input
                      ref={contextFileRef}
                      type="file"
                      accept="video/mp4,video/quicktime,video/webm,video/x-m4v,video/3gpp,video/*"
                      onChange={(event) => setContextFile(event.target.files?.[0] || null)}
                      required
                    />
                    <small><FileVideo size={14} /> <span data-i18n-content>{contextFile ? `${copy.uploadSelected}: ${contextFile.name}` : copy.uploadHint}</span></small>
                  </label>
                  <div className="agent-studio-context-actions">
                    <button type="button" onClick={retrySource} disabled={isRetryingSource}>
                      {isRetryingSource ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={16} />}
                      <span data-i18n-content>{isRetryingSource ? copy.retryingSource : copy.retrySource}</span>
                    </button>
                    <button className="dark" type="submit" disabled={isUploadingSource}>
                      {isUploadingSource ? <LoaderCircle className="spin" size={16} /> : <Upload size={16} />}
                      <span data-i18n-content>{isUploadingSource ? copy.uploading : copy.resume}</span>
                    </button>
                  </div>
                </div>
              </form>
            )}

            {shouldPollAgentStudioRun(run.status) && (
              <section className="agent-studio-working-card">
                <div className="agent-studio-orbit"><Bot size={25} /><i /><i /><i /></div>
                <div>
                  <small data-i18n-content>{copy.running}</small>
                  <h2 data-i18n-content>{copy.stages[run.currentStage] || run.currentStage}</h2>
                  <p data-i18n-content>{run.trace?.at(-1)?.summary}</p>
                </div>
              </section>
            )}

            {(run.status === 'awaiting_approval' || run.status === 'completed') && (
              <CreativeResult
                run={run}
                copy={copy}
                selectedCandidateId={selectedCandidateId}
                setSelectedCandidateId={setSelectedCandidateId}
                onApprove={approveRun}
                onHybrid={createHybrid}
                isApproving={isApproving}
                isHybridizing={isHybridizing}
              />
            )}

            {(run.status === 'failed' || run.status === 'cancelled') && (
              <section className="agent-studio-context-card">
                <Bot size={23} />
                <div>
                  <h2 data-i18n-content>{run.status === 'failed' ? getAgentStudioErrorMessage(run.error, language) : (language === 'en' ? 'Run cancelled' : 'Запуск скасовано')}</h2>
                  <button type="button" onClick={resetRun}><RefreshCw size={16} /><span data-i18n-content>{copy.newRun}</span></button>
                </div>
              </section>
            )}

            <AgentTrace trace={run.trace} copy={copy} />
          </div>
        </div>
      )}
    </section>
  );
}
