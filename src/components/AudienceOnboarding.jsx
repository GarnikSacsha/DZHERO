import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Lightbulb, Moon, Sun, X } from 'lucide-react';

import logoImg from '../logo-mark.svg';
import { normalizeWizardDraft } from '../brandBrainWizardState.mjs';
import { useI18n } from '../i18nProvider.mjs';

const rawApiUrl = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
const API_BASE = rawApiUrl.endsWith('/api') ? rawApiUrl : `${rawApiUrl}/api`;

const EXAMPLE_KEYS = Object.freeze([
  'onboarding.audience.examples.business',
  'onboarding.audience.examples.fitness',
  'onboarding.audience.examples.cars',
  'onboarding.audience.examples.students',
  'onboarding.audience.examples.parents',
  'onboarding.audience.examples.marketing',
]);

function compactAudience(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, 800) : '';
}

export default function AudienceOnboarding({
  workspaceId,
  initialDraft,
  language,
  setLanguage,
  theme,
  onToggleTheme,
  onComplete,
  notify,
  isWorkspaceCurrent,
  previewMode = false,
  onBack,
  onExit,
}) {
  const { t } = useI18n();
  const [audience, setAudience] = useState('');
  const [status, setStatus] = useState('ready');
  const [error, setError] = useState('');
  const textareaRef = useRef(null);

  useEffect(() => {
    setAudience(initialDraft?.answers?.audience || '');
    setStatus('ready');
    setError('');
  }, [workspaceId, initialDraft?.answers?.audience]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, [workspaceId]);

  const chooseExample = (value) => {
    setAudience(value);
    setError('');
    setStatus('ready');
    textareaRef.current?.focus();
  };

  const submit = async (event) => {
    event.preventDefault();
    if (status === 'saving') return;
    const audienceDescription = compactAudience(audience);
    if (audienceDescription.length < 3) {
      setError(t('onboarding.audience.validation'));
      textareaRef.current?.focus();
      return;
    }

    const currentDraft = normalizeWizardDraft(initialDraft);
    const nextDraft = normalizeWizardDraft({
      ...currentDraft,
      currentStep: 3,
      answers: {
        ...currentDraft.answers,
        audience: audienceDescription,
      },
    });

    setStatus('saving');
    setError('');
    if (previewMode) {
      setAudience(audienceDescription);
      onComplete?.({ draft: nextDraft });
      setStatus('ready');
      return;
    }

    try {
      const response = await fetch(
        `${API_BASE}/workspaces/${workspaceId}/agent/context/draft`,
        {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(nextDraft),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'audience_save_failed');
      if (isWorkspaceCurrent?.() === false) return;
      onComplete?.({ draft: normalizeWizardDraft(payload.draft) });
    } catch {
      if (isWorkspaceCurrent?.() === false) return;
      const message = t('onboarding.audience.saveError');
      setStatus('error');
      setError(message);
      notify?.(message);
    } finally {
      if (isWorkspaceCurrent?.() !== false) setStatus('ready');
    }
  };

  const busy = status === 'saving';

  return (
    <main className="workspace-onboarding audience-onboarding">
      <header className="workspace-onboarding-header">
        <div className="workspace-onboarding-brand">
          <span><img src={logoImg} alt="" /></span>
          <strong>{t('landing.brand.name')}</strong>
        </div>
        <div className="workspace-onboarding-controls">
          <div className="language-switch marketing-language-switch" aria-label={t('language.interface')}>
            <button type="button" className={language === 'uk' ? 'active' : ''} onClick={() => setLanguage('uk')}>UA</button>
            <button type="button" className={language === 'en' ? 'active' : ''} onClick={() => setLanguage('en')}>EN</button>
          </div>
          <button className="marketing-theme-toggle" type="button" title={t('landing.actions.theme')} aria-label={t('landing.actions.theme')} onClick={onToggleTheme}>
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          {onExit && (
            <button className="marketing-login-close" type="button" title={t('onboarding.workspace.exitPreview')} aria-label={t('onboarding.workspace.exitPreview')} onClick={onExit}>
              <X size={18} />
            </button>
          )}
        </div>
      </header>

      <section className="audience-onboarding-canvas">
        <form className="audience-onboarding-form" onSubmit={submit}>
          <div className="audience-onboarding-progress" aria-label={t('onboarding.audience.progress')}>
            <i className="complete" />
            <i className="active" />
            <i />
            <i />
          </div>

          <div className="audience-onboarding-heading">
            <h1>{t('onboarding.audience.title')}</h1>
            <p>{t('onboarding.audience.subtitle')}</p>
          </div>

          <textarea
            ref={textareaRef}
            id="audience-description"
            name="audience"
            value={audience}
            maxLength={800}
            placeholder={t('onboarding.audience.placeholder')}
            aria-label={t('onboarding.audience.label')}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'audience-description-error' : undefined}
            onChange={(event) => {
              setAudience(event.target.value);
              if (error) setError('');
              if (status === 'previewed') setStatus('ready');
            }}
          />

          <div className="audience-onboarding-examples">
            <div>
              <Lightbulb size={18} aria-hidden="true" />
              <span>{t('onboarding.audience.examplesTitle')}</span>
            </div>
            <div>
              {EXAMPLE_KEYS.map((key) => (
                <button type="button" key={key} onClick={() => chooseExample(t(key))}>
                  {t(key)}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="workspace-onboarding-error" id="audience-description-error" role="alert">{error}</p>}
          <div className="audience-onboarding-actions">
            {onBack ? (
              <button className="audience-onboarding-back" type="button" onClick={onBack}>
                <ArrowLeft size={18} />{t('onboarding.audience.back')}
              </button>
            ) : <span />}
            <button className="audience-onboarding-submit" type="submit" disabled={busy || compactAudience(audience).length < 3}>
              {busy ? t('onboarding.audience.saving') : t('onboarding.audience.continue')}
              <ArrowRight size={19} />
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
