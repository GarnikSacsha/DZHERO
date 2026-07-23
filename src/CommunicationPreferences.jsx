import React, { useEffect, useState } from 'react';

const CONSENT_VERSION = '2026-07-23';
const EMPTY_VALUES = { product_updates: false, early_bird_offers: false, research_invites: false };

export default function CommunicationPreferences({ apiBase = '/api', fetcher = globalThis.fetch, language = 'uk', mode = 'settings', onClose = () => {} }) {
  const [values, setValues] = useState(EMPTY_VALUES);
  const [status, setStatus] = useState('loading');
  const [hidden, setHidden] = useState(false);
  const copy = language === 'en' ? {
    eyebrow: 'Communication preferences', promptTitle: 'What may Dzhero email you about?', settingsTitle: 'Emails from Dzhero',
    intro: 'All options are optional, off by default, and can be changed here at any time. Product access does not depend on them.',
    product: 'Product updates and educational materials', productHelp: 'New workflows, useful product tips, and important service updates.',
    offers: 'Early-bird offers, promotions, and plan news', offersHelp: 'Launch pricing and occasional commercial offers.',
    research: 'Research and interview invitations', researchHelp: 'Optional feedback calls and product research.',
    save: 'Save preferences', saving: 'Saving…', saved: 'Preferences saved.', skip: 'Skip for now', privacy: 'Privacy policy',
    error: 'Could not load or save preferences. Product access is unaffected.', retry: 'Retry',
  } : {
    eyebrow: 'Налаштування комунікації', promptTitle: 'Про що DZHERO може писати вам на пошту?', settingsTitle: 'Листи від DZHERO',
    intro: 'Усі опції добровільні, початково вимкнені й доступні для зміни будь-коли. Вони не впливають на доступ до продукту.',
    product: 'Оновлення продукту та навчальні матеріали', productHelp: 'Нові сценарії роботи, корисні поради й важливі оновлення сервісу.',
    offers: 'Early-bird пропозиції, акції та новини тарифів', offersHelp: 'Стартові ціни та рідкісні комерційні пропозиції.',
    research: 'Запрошення на дослідження та інтерв’ю', researchHelp: 'Необов’язкові розмови про досвід користування продуктом.',
    save: 'Зберегти налаштування', saving: 'Зберігаємо…', saved: 'Налаштування збережено.', skip: 'Не зараз', privacy: 'Політика конфіденційності',
    error: 'Не вдалося завантажити або зберегти налаштування. Доступ до продукту не змінено.', retry: 'Спробувати ще раз',
  };
  const endpoint = `${String(apiBase).replace(/\/$/, '')}/account/communication-preferences`;

  const load = async () => {
    setStatus('loading');
    try {
      const response = await fetcher(endpoint);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error('preferences_failed');
      setValues({ product_updates: payload.product_updates === true, early_bird_offers: payload.early_bird_offers === true, research_invites: payload.research_invites === true });
      if (mode === 'prompt' && payload.has_decisions) { setHidden(true); onClose(); }
      setStatus('ready');
    } catch {
      setStatus('error');
      if (mode === 'prompt') setHidden(true);
    }
  };

  useEffect(() => { void load(); }, [endpoint, mode]);

  const save = async () => {
    setStatus('saving');
    try {
      const response = await fetcher(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, locale: language === 'en' ? 'en' : 'uk', source: mode === 'prompt' ? 'first_login_prompt' : 'settings' }),
      });
      if (!response.ok) throw new Error('preferences_failed');
      setStatus('saved');
      if (mode === 'prompt') window.setTimeout(onClose, 500);
    } catch { setStatus('error'); }
  };

  if (hidden || (mode === 'prompt' && status === 'error')) return null;
  const content = (
    <section className={`communication-preferences ${mode === 'prompt' ? 'is-prompt' : ''}`} aria-label={copy.eyebrow}>
      <small>{copy.eyebrow}</small>
      <h2>{mode === 'prompt' ? copy.promptTitle : copy.settingsTitle}</h2>
      <p>{copy.intro}</p>
      {status === 'loading' ? <p className="communication-preferences-status">Loading…</p> : <>
        <div className="communication-preferences-options">
          {[
            ['product_updates', copy.product, copy.productHelp],
            ['early_bird_offers', copy.offers, copy.offersHelp],
            ['research_invites', copy.research, copy.researchHelp],
          ].map(([key, label, help]) => <label key={key}><input type="checkbox" checked={values[key]} onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.checked }))} /><span><strong>{label}</strong><em>{help}</em></span></label>)}
        </div>
        {status === 'error' && <p className="communication-preferences-error">{copy.error}</p>}
        {status === 'saved' && <p className="communication-preferences-saved">{copy.saved}</p>}
        <div className="communication-preferences-actions">
          <button className="dark" type="button" onClick={save} disabled={status === 'saving'}>{status === 'saving' ? copy.saving : copy.save}</button>
          {mode === 'prompt' && <button type="button" onClick={onClose}>{copy.skip}</button>}
          {status === 'error' && <button type="button" onClick={load}>{copy.retry}</button>}
          <a href="/privacy" target="_blank" rel="noreferrer">{copy.privacy}</a>
        </div>
        <small className="communication-preferences-version">Consent copy {CONSENT_VERSION}</small>
      </>}
    </section>
  );
  return mode === 'prompt' ? <div className="communication-preferences-backdrop">{content}</div> : content;
}
