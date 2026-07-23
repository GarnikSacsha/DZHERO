import React, { useEffect, useRef, useState } from 'react';
import {
  getMissingWizardAnswers,
  normalizeWizardAnswers,
  normalizeWizardDraft,
  validateWizardStep,
} from '../brandBrainWizardState.mjs';

const rawApiUrl = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
const API_BASE = rawApiUrl.endsWith('/api') ? rawApiUrl : `${rawApiUrl}/api`;

function authFetch(url, options = {}) {
  return fetch(url, {
    credentials: 'include',
    ...options,
  });
}

function getCopy(language) {
  return language === 'en'
    ? {
      title: 'Brand Brain',
      step: (current) => `${current} of 4`,
      profileTitle: 'Describe your profile and product',
      audienceTitle: 'Who is your target audience?',
      nicheTitle: 'Your niche and market',
      instagramTitle: 'Add Instagram (optional)',
      profileLabel: 'Profile and product',
      audienceLabel: 'Target audience',
      nicheLabel: 'Niche',
      marketLabel: 'Market',
      instagramLabel: 'Instagram URL (optional)',
      profileHint: 'What do you sell or create?',
      audienceHint: 'Who should this content reach?',
      nicheHint: 'Your category or specialty',
      marketHint: 'City, country, or customer market',
      instagramHint: 'https://instagram.com/yourprofile',
      continue: 'Continue',
      back: 'Back',
      finish: 'Finish',
      finishing: 'Finishing...',
      skipInstagram: 'Skip Instagram',
      validation: 'Complete the highlighted field to continue.',
      saveError: 'We could not save your draft. Please try again.',
      finalizeError: 'We could not finish Brand Brain. Please try again.',
    }
    : {
      title: 'Brand Brain',
      step: (current) => `${current} з 4`,
      profileTitle: 'Опиши профіль та продукт',
      audienceTitle: 'Хто твоя цільова аудиторія?',
      nicheTitle: 'Твоя ніша та ринок',
      instagramTitle: 'Додай Instagram (необов’язково)',
      profileLabel: 'Профіль та продукт',
      audienceLabel: 'Цільова аудиторія',
      nicheLabel: 'Ніша',
      marketLabel: 'Ринок',
      instagramLabel: 'Instagram URL (необов’язково)',
      profileHint: 'Що ти продаєш або створюєш?',
      audienceHint: 'Кого має знайти цей контент?',
      nicheHint: 'Твоя категорія або спеціалізація',
      marketHint: 'Місто, країна або ринок клієнтів',
      instagramHint: 'https://instagram.com/yourprofile',
      continue: 'Продовжити',
      back: 'Назад',
      finish: 'Завершити',
      finishing: 'Завершуємо...',
      skipInstagram: 'Пропустити Instagram',
      validation: 'Заповни виділене поле, щоб продовжити.',
      saveError: 'Не вдалося зберегти чернетку. Спробуй ще раз.',
      finalizeError: 'Не вдалося завершити Brand Brain. Спробуй ще раз.',
    };
}

function rewindIncompleteDraft(value) {
  const draft = normalizeWizardDraft(value);
  const missing = getMissingWizardAnswers(draft.answers);
  const firstRequiredStep = {
    profileDescription: 1,
    audience: 2,
    niche: 3,
    market: 3,
  }[missing[0]];
  const rewound = Boolean(firstRequiredStep && firstRequiredStep < draft.currentStep);
  return {
    draft: rewound ? { ...draft, currentStep: firstRequiredStep } : draft,
    missing: rewound ? [missing[0]] : [],
  };
}

export default function BrandBrainWizard({ workspaceId, language, initialDraft, onComplete, notify, isWorkspaceCurrent }) {
  const copy = getCopy(language);
  const [draft, setDraft] = useState(() => rewindIncompleteDraft(initialDraft).draft);
  const [errors, setErrors] = useState(() => rewindIncompleteDraft(initialDraft).missing);
  const [status, setStatus] = useState('ready');
  const inputRefs = useRef({});
  const finalizingRef = useRef(false);

  useEffect(() => {
    const resumed = rewindIncompleteDraft(initialDraft);
    setDraft(resumed.draft);
    setErrors(resumed.missing);
    setStatus('ready');
  }, [initialDraft]);

  useEffect(() => {
    const firstInvalid = errors[0];
    if (firstInvalid) inputRefs.current[firstInvalid]?.focus();
  }, [errors]);

  const putDraft = async (nextDraft) => {
    const response = await authFetch(
      `${API_BASE}/workspaces/${workspaceId}/agent/context/draft`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextDraft),
      },
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'brand_brain_draft_save_failed');
    return normalizeWizardDraft(payload.draft);
  };

  const finalize = async (answerOverride = draft.answers) => {
    if (finalizingRef.current) return;
    const normalizedAnswers = normalizeWizardAnswers(answerOverride);
    const missing = getMissingWizardAnswers(normalizedAnswers);
    if (missing.length) {
      setErrors(missing);
      return;
    }
    setErrors([]);
    finalizingRef.current = true;
    setStatus('finalizing');
    try {
      const response = await authFetch(
        `${API_BASE}/workspaces/${workspaceId}/agent/context/finalize`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ answers: normalizedAnswers }),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrors(payload.missingFields || []);
        setStatus('error');
        notify?.(copy.finalizeError);
        return;
      }
      if (payload.complete && isWorkspaceCurrent?.() !== false) onComplete?.(payload);
      setStatus('ready');
    } catch {
      setStatus('error');
      notify?.(copy.finalizeError);
    } finally {
      finalizingRef.current = false;
    }
  };

  const updateAnswer = (field, value) => {
    setDraft((current) => ({
      ...current,
      answers: { ...current.answers, [field]: value },
    }));
    setErrors((current) => current.filter((item) => item !== field));
  };

  const continueStep = async () => {
    if (status === 'saving' || status === 'finalizing') return;
    const invalid = validateWizardStep(draft.currentStep, draft.answers);
    if (invalid.length) {
      setErrors(invalid);
      return;
    }
    if (draft.currentStep === 4) {
      await finalize();
      return;
    }
    const nextDraft = normalizeWizardDraft({
      ...draft,
      currentStep: draft.currentStep + 1,
      answers: draft.answers,
    });
    setStatus('saving');
    setErrors([]);
    try {
      const savedDraft = await putDraft(nextDraft);
      setDraft(savedDraft);
      setStatus('ready');
    } catch {
      setStatus('error');
      notify?.(copy.saveError);
    }
  };

  const goBack = () => {
    if (status === 'saving' || status === 'finalizing' || draft.currentStep === 1) return;
    setDraft((current) => ({ ...current, currentStep: current.currentStep - 1 }));
    setErrors([]);
  };

  const field = (name, label, hint, multiline = false) => {
    const Component = multiline ? 'textarea' : 'input';
    return (
      <label className="brand-field" htmlFor={`brand-wizard-${name}`}>
        <span>{label}</span>
        <Component
          ref={(element) => { inputRefs.current[name] = element; }}
          id={`brand-wizard-${name}`}
          name={name}
          type={multiline ? undefined : 'text'}
          value={draft.answers[name] || ''}
          onChange={(event) => updateAnswer(name, event.target.value)}
          aria-invalid={errors.includes(name)}
          aria-describedby={errors.includes(name) ? 'brand-wizard-error' : undefined}
          placeholder={hint}
        />
      </label>
    );
  };

  const currentTitle = [copy.profileTitle, copy.audienceTitle, copy.nicheTitle, copy.instagramTitle][draft.currentStep - 1];
  const busy = status === 'saving' || status === 'finalizing';

  return (
    <section className="page page-brand-brain-start">
      <div className="brand-wizard">
        <div className="brand-wizard-progress">
          <small>{copy.step(draft.currentStep)}</small>
          <div className="brand-wizard-progress-track" aria-hidden="true">
            <div className="brand-wizard-progress-value" style={{ width: `${draft.currentStep * 25}%` }} />
          </div>
        </div>
        <div>
          <small>{copy.title}</small>
          <h1 id="brand-wizard-title">{currentTitle}</h1>
        </div>
        {errors.length > 0 && <p id="brand-wizard-error" className="form-error" role="alert">{copy.validation}</p>}
        {status === 'error' && errors.length === 0 && <p className="form-error" role="alert">{copy.saveError}</p>}
        <div className="brand-wizard-fields">
          {draft.currentStep === 1 && field('profileDescription', copy.profileLabel, copy.profileHint, true)}
          {draft.currentStep === 2 && field('audience', copy.audienceLabel, copy.audienceHint, true)}
          {draft.currentStep === 3 && (
            <div className="brand-wizard-grid">
              {field('niche', copy.nicheLabel, copy.nicheHint)}
              {field('market', copy.marketLabel, copy.marketHint)}
            </div>
          )}
          {draft.currentStep === 4 && field('instagramUrl', copy.instagramLabel, copy.instagramHint)}
        </div>
        <div className="brand-wizard-actions">
          {draft.currentStep > 1 ? <button type="button" onClick={goBack} disabled={busy}>{copy.back}</button> : <span />}
          {draft.currentStep === 4 ? (
            <div className="brand-wizard-actions-end">
              <button type="button" onClick={() => void continueStep()} disabled={busy}>{status === 'finalizing' ? copy.finishing : copy.finish}</button>
              <button
                type="button"
                onClick={() => {
                  const skippedAnswers = { ...draft.answers, instagramUrl: '' };
                  setDraft((current) => ({ ...current, answers: skippedAnswers }));
                  void finalize(skippedAnswers);
                }}
                disabled={status === 'finalizing'}
              >
                {copy.skipInstagram}
              </button>
            </div>
          ) : <button type="button" onClick={() => void continueStep()} disabled={busy}>{copy.continue}</button>}
        </div>
      </div>
    </section>
  );
}
