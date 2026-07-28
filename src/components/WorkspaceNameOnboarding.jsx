import React, { useEffect, useRef, useState } from 'react';
import { Moon, Sparkles, Sun, X } from 'lucide-react';

import logoImg from '../logo-mark.svg';
import { normalizeWizardDraft } from '../brandBrainWizardState.mjs';
import { useI18n } from '../i18nProvider.mjs';

const rawApiUrl = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
const API_BASE = rawApiUrl.endsWith('/api') ? rawApiUrl : `${rawApiUrl}/api`;

function compactName(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, 80) : '';
}

export default function WorkspaceNameOnboarding({
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
  onExit,
}) {
  const { t } = useI18n();
  const [workspaceName, setWorkspaceName] = useState('');
  const [status, setStatus] = useState('ready');
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    setWorkspaceName(initialDraft?.workspaceName || '');
    setStatus('ready');
    setError('');
  }, [workspaceId, initialDraft?.workspaceName]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [workspaceId]);

  const submit = async (event) => {
    event.preventDefault();
    if (status === 'saving') return;
    const name = compactName(workspaceName);
    if (name.length < 2) {
      setError(t('onboarding.workspace.validation'));
      inputRef.current?.focus();
      return;
    }
    setStatus('saving');
    setError('');
    const nextDraft = {
      ...normalizeWizardDraft(initialDraft),
      workspaceName: name,
    };
    if (previewMode) {
      setWorkspaceName(name);
      onComplete?.({
        draft: nextDraft,
        workspaceName: name,
      });
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
      if (!response.ok) throw new Error(payload.error || 'workspace_name_save_failed');
      if (isWorkspaceCurrent?.() === false) return;
      onComplete?.({
        draft: normalizeWizardDraft(payload.draft),
        workspaceName: name,
      });
    } catch {
      if (isWorkspaceCurrent?.() === false) return;
      const message = t('onboarding.workspace.saveError');
      setStatus('error');
      setError(message);
      notify?.(message);
    } finally {
      if (isWorkspaceCurrent?.() !== false) setStatus('ready');
    }
  };

  const busy = status === 'saving';

  return (
    <main className="workspace-onboarding">
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

      <section className="workspace-onboarding-canvas">
        <i className="workspace-onboarding-glow left" aria-hidden="true" />
        <i className="workspace-onboarding-glow right" aria-hidden="true" />
        <form className="workspace-onboarding-form" onSubmit={submit}>
          <div className="workspace-onboarding-progress" aria-label={t('onboarding.workspace.progress')}>
            <i className="active" />
            <i />
            <i />
          </div>
          <div className="workspace-onboarding-heading">
            <h1>{t('onboarding.workspace.title')}</h1>
            <p>{t('onboarding.workspace.subtitle')}</p>
          </div>
          <label className="workspace-onboarding-field" htmlFor="workspace-onboarding-name">
            <span>{t('onboarding.workspace.label')}</span>
            <div>
              <input
                ref={inputRef}
                id="workspace-onboarding-name"
                name="workspaceName"
                type="text"
                value={workspaceName}
                maxLength={80}
                placeholder={t('onboarding.workspace.placeholder')}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? 'workspace-onboarding-error' : undefined}
                onChange={(event) => {
                  setWorkspaceName(event.target.value);
                  if (error) setError('');
                }}
              />
              <Sparkles size={19} aria-hidden="true" />
            </div>
          </label>
          {error && <p className="workspace-onboarding-error" id="workspace-onboarding-error" role="alert">{error}</p>}
          <button className="workspace-onboarding-submit" type="submit" disabled={busy}>
            {busy ? t('onboarding.workspace.saving') : t('onboarding.workspace.continue')} <span aria-hidden="true">→</span>
          </button>
          <p className="workspace-onboarding-legal">
            <span>{t('onboarding.workspace.legalPrefix')}</span>
            <a href="/terms" target="_blank" rel="noreferrer">{t('landing.footer.terms')}</a>
          </p>
        </form>
      </section>
    </main>
  );
}
