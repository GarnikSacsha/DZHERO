import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, LockKeyhole, Moon, Sun, X } from 'lucide-react';

import logoImg from '../logo-mark.svg';
import { normalizeWizardDraft } from '../brandBrainWizardState.mjs';
import { useI18n } from '../i18nProvider.mjs';

const rawApiUrl = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
const API_BASE = rawApiUrl.endsWith('/api') ? rawApiUrl : `${rawApiUrl}/api`;

const EXAMPLE_KEYS = Object.freeze([
  'onboarding.brand.examples.sports',
  'onboarding.brand.examples.travel',
  'onboarding.brand.examples.agency',
  'onboarding.brand.examples.coffee',
  'onboarding.brand.examples.education',
]);

function compactDescription(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, 800) : '';
}

export default function BrandDescriptionOnboarding({
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
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('ready');
  const [error, setError] = useState('');
  const textareaRef = useRef(null);

  useEffect(() => {
    setDescription(initialDraft?.answers?.profileDescription || '');
    setStatus('ready');
    setError('');
  }, [workspaceId, initialDraft?.answers?.profileDescription]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, [workspaceId]);

  const chooseExample = (value) => {
    setDescription(value);
    setError('');
    textareaRef.current?.focus();
  };

  const submit = async (event) => {
    event.preventDefault();
    if (status === 'saving') return;
    const profileDescription = compactDescription(description);
    if (profileDescription.length < 10) {
      setError(t('onboarding.brand.validation'));
      textareaRef.current?.focus();
      return;
    }

    const currentDraft = normalizeWizardDraft(initialDraft);
    const nextDraft = normalizeWizardDraft({
      ...currentDraft,
      currentStep: 2,
      answers: {
        ...currentDraft.answers,
        profileDescription,
      },
    });

    setStatus('saving');
    setError('');
    if (previewMode) {
      setDescription(profileDescription);
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
      if (!response.ok) throw new Error(payload.error || 'brand_description_save_failed');
      if (isWorkspaceCurrent?.() === false) return;
      onComplete?.({ draft: normalizeWizardDraft(payload.draft) });
    } catch {
      if (isWorkspaceCurrent?.() === false) return;
      const message = t('onboarding.brand.saveError');
      setStatus('error');
      setError(message);
      notify?.(message);
    } finally {
      if (isWorkspaceCurrent?.() !== false) setStatus('ready');
    }
  };

  const busy = status === 'saving';

  return (
    <main className="workspace-onboarding brand-description-onboarding">
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

      <section className="brand-description-canvas">
        <form className="brand-description-form" onSubmit={submit}>
          <div className="brand-description-progress" aria-label={t('onboarding.brand.progress')}>
            <i className="active" />
            <i />
            <i />
            <i />
          </div>

          <div className="brand-description-heading">
            <h1>{t('onboarding.brand.title')}</h1>
            <p>{t('onboarding.brand.subtitle')}</p>
          </div>

          <textarea
            ref={textareaRef}
            id="brand-description"
            name="profileDescription"
            value={description}
            maxLength={800}
            placeholder={t('onboarding.brand.placeholder')}
            aria-label={t('onboarding.brand.label')}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'brand-description-error' : undefined}
            onChange={(event) => {
              setDescription(event.target.value);
              if (error) setError('');
              if (status === 'previewed') setStatus('ready');
            }}
          />

          <div className="brand-description-examples">
            <span>{t('onboarding.brand.inspiration')}</span>
            <div>
              {EXAMPLE_KEYS.map((key) => (
                <button type="button" key={key} onClick={() => chooseExample(t(key))}>
                  {t(key)}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="workspace-onboarding-error" id="brand-description-error" role="alert">{error}</p>}
          <div className="brand-description-actions">
            <span><LockKeyhole size={14} />{t('onboarding.brand.private')}</span>
            <div>
              {onBack && (
                <button className="brand-description-back" type="button" onClick={onBack}>
                  <ArrowLeft size={17} />{t('onboarding.brand.back')}
                </button>
              )}
              <button className="brand-description-submit" type="submit" disabled={busy || compactDescription(description).length < 10}>
                {busy ? t('onboarding.brand.saving') : t('onboarding.brand.continue')}
                <ArrowRight size={19} />
              </button>
            </div>
          </div>
        </form>
      </section>
    </main>
  );
}
