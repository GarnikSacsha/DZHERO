import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BrainCircuit,
  Check,
  CircleOff,
  Coins,
  History,
  Languages,
  Lightbulb,
  LockKeyhole,
  Palette,
  Pencil,
  Plus,
  Sun,
  Moon,
  Users,
  X,
} from 'lucide-react';

import {
  normalizeWizardAnswers,
} from '../brandBrainWizardState.mjs';
import { useI18n } from '../i18nProvider.mjs';
import {
  CREDIT_OPERATIONS,
  normalizeCreditState,
} from '../productSettingsState.mjs';

const SETTINGS_TABS = Object.freeze([
  ['interface', 'product.settings.tabs.interface'],
  ['brands', 'product.settings.tabs.brands'],
  ['credits', 'product.settings.tabs.credits'],
]);

const EMPTY_BRAIN = Object.freeze({
  profileDescription: '',
  audience: '',
  niche: '',
  market: '',
  instagramUrl: '',
});

const BRAND_DESCRIPTION_EXAMPLE_KEYS = Object.freeze([
  'onboarding.brand.examples.sports',
  'onboarding.brand.examples.travel',
  'onboarding.brand.examples.agency',
  'onboarding.brand.examples.coffee',
  'onboarding.brand.examples.education',
]);

const AUDIENCE_EXAMPLE_KEYS = Object.freeze([
  'onboarding.audience.examples.business',
  'onboarding.audience.examples.fitness',
  'onboarding.audience.examples.cars',
  'onboarding.audience.examples.students',
  'onboarding.audience.examples.parents',
  'onboarding.audience.examples.marketing',
]);

function getCreditCostKey(credits) {
  if (credits === 1) return 'product.settings.credits.costOne';
  if (credits >= 2 && credits <= 4) return 'product.settings.credits.costFew';
  return 'product.settings.credits.costMany';
}

function InterfaceSettings({ language, setLanguage, theme, onToggleTheme }) {
  const { t } = useI18n();

  return (
    <section className="settings-interface-panel">
      <article className="settings-option-row">
        <span><Languages size={23} /></span>
        <div><h2>{t('product.settings.interface.language')}</h2><p>{t('product.settings.interface.languageBody')}</p></div>
        <select value={language} onChange={(event) => setLanguage(event.target.value)}>
          <option value="en">{t('product.settings.interface.english')}</option>
          <option value="uk">{t('product.settings.interface.ukrainian')}</option>
        </select>
      </article>
      <article className="settings-option-row">
        <span><Palette size={23} /></span>
        <div><h2>{t('product.settings.interface.theme')}</h2><p>{t('product.settings.interface.themeBody')}</p></div>
        <div className="settings-theme-switch">
          <button className={theme === 'light' ? 'active' : ''} type="button" onClick={() => theme !== 'light' && onToggleTheme()}><Sun size={17} />{t('product.settings.interface.light')}</button>
          <button className={theme === 'dark' ? 'active' : ''} type="button" onClick={() => theme !== 'dark' && onToggleTheme()}><Moon size={17} />{t('product.settings.interface.dark')}</button>
        </div>
      </article>
    </section>
  );
}

function BrandBrainEditor({ brand, onCancel, onSave }) {
  const { t } = useI18n();
  const [step, setStep] = useState(1);
  const [errors, setErrors] = useState([]);
  const [draft, setDraft] = useState(() => ({
    id: brand?.id || '',
    name: brand?.name || '',
    brain: { ...EMPTY_BRAIN, ...(brand?.brain || {}) },
    createdAt: brand?.createdAt || '',
  }));

  useEffect(() => {
    if (step > 4) {
      setStep(4);
      setErrors([]);
    }
  }, [step]);

  const updateName = (value) => {
    setDraft((current) => ({ ...current, name: value }));
    setErrors((current) => current.filter((item) => item !== 'name'));
  };

  const updateBrain = (field, value) => {
    setDraft((current) => ({
      ...current,
      brain: { ...current.brain, [field]: value },
    }));
    setErrors((current) => current.filter((item) => item !== field));
  };

  const validate = (brain = draft.brain) => {
    let nextErrors = [];
    if (step === 1 && brain.profileDescription.trim().length < 10) nextErrors = ['profileDescription'];
    if (step === 2 && brain.audience.trim().length < 3) nextErrors = ['audience'];
    if (step === 3) {
      if (!brain.niche.trim()) nextErrors.push('niche');
      if (!brain.market.trim()) nextErrors.push('market');
    }
    if (step === 4 && brain.instagramUrl.trim() && !normalizeWizardAnswers(brain).instagramUrl) {
      nextErrors = ['instagramUrl'];
    }
    if (!draft.name.trim()) nextErrors.unshift('name');
    setErrors(nextErrors);
    return nextErrors.length === 0;
  };

  const continueWizard = () => {
    if (!validate()) return;
    if (step === 4) {
      finishWizard();
      return;
    }
    setStep(2);
  };

  const finishWizard = (brain = draft.brain) => {
    if (!validate(brain)) return;
    onSave({
      ...draft,
      name: draft.name.trim(),
      brain: normalizeWizardAnswers(brain),
    });
  };

  const titleKey = {
    1: 'onboarding.brand.title',
    2: 'onboarding.audience.title',
    3: 'product.settings.brands.editor.contextTitle',
    4: 'product.settings.brands.editor.instagramTitle',
  }[step];
  const subtitleKey = {
    1: 'onboarding.brand.subtitle',
    2: 'onboarding.audience.subtitle',
    3: 'product.settings.brands.editor.contextSubtitle',
    4: 'product.settings.brands.editor.instagramSubtitle',
  }[step];
  const validationKey = step === 1 ? 'onboarding.brand.validation' : 'product.settings.brands.editor.validation';
  const currentStepValid = draft.name.trim().length >= 2 && (
    (step === 1 && draft.brain.profileDescription.trim().length >= 10)
    || (step === 2 && draft.brain.audience.trim().length >= 3)
    || (step === 3 && draft.brain.niche.trim() && draft.brain.market.trim())
    || (step === 4 && (!draft.brain.instagramUrl.trim() || Boolean(normalizeWizardAnswers(draft.brain).instagramUrl)))
  );

  return (
    <section className={`settings-brand-brain-editor settings-brand-onboarding step-${step}`} role="dialog" aria-modal="true" aria-label={t(brand ? 'product.settings.brands.editor.editTitle' : 'product.settings.brands.editor.createTitle')}>
      <header>
        <div>
          <h2>{t(brand ? 'product.settings.brands.editor.editTitle' : 'product.settings.brands.editor.createTitle')}</h2>
        </div>
        <button type="button" aria-label={t('common.close')} onClick={onCancel}><X size={19} /></button>
      </header>

      <label className={`settings-brand-name-context ${errors.includes('name') ? 'error' : ''}`} htmlFor="settings-brand-name">
        <span>{t('product.settings.brands.editor.name')}</span>
        <input
          id="settings-brand-name"
          value={draft.name}
          placeholder={t('product.settings.brands.editor.nameHint')}
          onChange={(event) => updateName(event.target.value)}
        />
      </label>

      <div className="settings-brand-onboarding-progress" aria-label={t('product.settings.brands.editor.progress', { current: step })}>
        {[1, 2, 3, 4].map((number) => (
          <i className={number < step ? 'complete' : number === step ? 'active' : ''} key={number} />
        ))}
      </div>

      <div className="settings-brand-onboarding-heading">
        <h3>{t(titleKey)}</h3>
        <p>{t(subtitleKey)}</p>
      </div>

      <div className={`settings-brand-onboarding-fields step-${step}`}>
        {step === 1 && (
          <>
            <textarea
              id="settings-brand-profileDescription"
              value={draft.brain.profileDescription}
              maxLength={800}
              placeholder={t('onboarding.brand.placeholder')}
              aria-label={t('onboarding.brand.label')}
              aria-invalid={errors.includes('profileDescription')}
              onChange={(event) => updateBrain('profileDescription', event.target.value)}
            />
            <div className="settings-brand-onboarding-examples brand">
              <span>{t('onboarding.brand.inspiration')}</span>
              <div>
                {BRAND_DESCRIPTION_EXAMPLE_KEYS.map((key) => (
                  <button type="button" key={key} onClick={() => updateBrain('profileDescription', t(key))}>{t(key)}</button>
                ))}
              </div>
            </div>
          </>
        )}
        {step === 2 && (
          <>
            <textarea
              id="settings-brand-audience"
              value={draft.brain.audience}
              maxLength={800}
              placeholder={t('onboarding.audience.placeholder')}
              aria-label={t('onboarding.audience.label')}
              aria-invalid={errors.includes('audience')}
              onChange={(event) => updateBrain('audience', event.target.value)}
            />
            <div className="settings-brand-onboarding-examples audience">
              <span><Lightbulb size={17} />{t('onboarding.audience.examplesTitle')}</span>
              <div>
                {AUDIENCE_EXAMPLE_KEYS.map((key) => (
                  <button type="button" key={key} onClick={() => updateBrain('audience', t(key))}>{t(key)}</button>
                ))}
              </div>
            </div>
          </>
        )}
        {step === 3 && (
          <div className="settings-brand-context-fields">
            <label>
              <span>{t('product.settings.brands.editor.niche')}</span>
              <input
                value={draft.brain.niche}
                maxLength={160}
                placeholder={t('product.settings.brands.editor.nicheHint')}
                aria-invalid={errors.includes('niche')}
                onChange={(event) => updateBrain('niche', event.target.value)}
              />
            </label>
            <label>
              <span>{t('product.settings.brands.editor.market')}</span>
              <input
                value={draft.brain.market}
                maxLength={160}
                placeholder={t('product.settings.brands.editor.marketHint')}
                aria-invalid={errors.includes('market')}
                onChange={(event) => updateBrain('market', event.target.value)}
              />
            </label>
          </div>
        )}
        {step === 4 && (
          <label className="settings-brand-instagram-field">
            <span>{t('product.settings.brands.editor.instagram')}</span>
            <input
              type="url"
              value={draft.brain.instagramUrl}
              maxLength={500}
              placeholder="https://instagram.com/yourprofile"
              aria-invalid={errors.includes('instagramUrl')}
              onChange={(event) => updateBrain('instagramUrl', event.target.value)}
            />
          </label>
        )}
        {errors.length > 0 && <p className="settings-brand-brain-error">{t(validationKey)}</p>}
      </div>

      <footer className="settings-brand-onboarding-actions">
        {step > 1 ? (
          <button type="button" onClick={() => { setErrors([]); setStep((current) => current - 1); }}>
            <ArrowLeft size={16} />{t('product.settings.brands.editor.back')}
          </button>
        ) : (
          <span className="settings-brand-onboarding-private"><LockKeyhole size={14} />{t('onboarding.brand.private')}</span>
        )}
        <button className="primary" type="button" disabled={!currentStepValid} onClick={continueWizard}>
          {t(step === 4 ? 'product.settings.brands.editor.finish' : 'onboarding.brand.continue')}<ArrowRight size={18} />
        </button>
      </footer>
    </section>
  );
}

function BrandsSettings({
  brands,
  activeBrandId,
  onSelectBrand,
  onSaveBrand,
  persistenceStatus,
}) {
  const { t } = useI18n();
  const [editorBrand, setEditorBrand] = useState(undefined);
  const [notice, setNotice] = useState('');

  const saveBrand = (draft) => {
    const editing = Boolean(draft.id);
    onSaveBrand(draft);
    setEditorBrand(undefined);
    setNotice(t(editing ? 'product.settings.brands.updated' : 'product.settings.brands.created'));
  };

  if (editorBrand !== undefined) {
    return <BrandBrainEditor brand={editorBrand || null} onCancel={() => setEditorBrand(undefined)} onSave={saveBrand} />;
  }

  return (
    <section className="settings-brands-panel">
      {notice && (
        <div className="settings-inline-notice">
          <Check size={16} /><span>{notice}</span>
          <button type="button" aria-label={t('common.close')} onClick={() => setNotice('')}><X size={15} /></button>
        </div>
      )}
      {['loading', 'saving', 'error'].includes(persistenceStatus) && (
        <div className={`settings-inline-notice ${persistenceStatus}`} role={persistenceStatus === 'error' ? 'alert' : 'status'}>
          <span>{t(`product.settings.brands.persistence.${persistenceStatus}`)}</span>
        </div>
      )}
      <header>
        <div><h2>{t('product.settings.brands.title')}</h2><p>{t('product.settings.brands.subtitle')}</p></div>
        <button type="button" onClick={() => setEditorBrand(null)}><Plus size={18} />{t('product.settings.brands.create')}</button>
      </header>

      {brands.length === 0 ? (
        <div className="settings-brands-empty">
          <span><BrainCircuit size={25} /></span>
          <strong>{t('product.settings.brands.emptyTitle')}</strong>
          <p>{t('product.settings.brands.emptyBody')}</p>
          <button type="button" onClick={() => setEditorBrand(null)}><Plus size={17} />{t('product.settings.brands.create')}</button>
        </div>
      ) : (
        <div className="settings-brand-list">
          {brands.map((brand) => (
            <article className={brand.id === activeBrandId ? 'active' : ''} key={brand.id}>
              <span>{brand.name.slice(0, 2).toLocaleUpperCase()}</span>
              <div className="settings-brand-details">
                <header>
                  <strong>{brand.name}</strong>
                  {brand.id === activeBrandId && <em><Check size={12} />{t('product.settings.brands.active')}</em>}
                </header>
                <dl>
                  <div><dt><BrainCircuit size={13} />{t('onboarding.brand.label')}</dt><dd>{brand.brain.profileDescription}</dd></div>
                  <div><dt><Users size={13} />{t('product.settings.brands.audience')}</dt><dd>{brand.brain.audience}</dd></div>
                </dl>
              </div>
              <div className="settings-brand-actions">
                {brand.id !== activeBrandId && <button className="select" type="button" onClick={() => onSelectBrand(brand.id)}>{t('product.settings.brands.makeActive')}</button>}
                <button type="button" aria-label={t('product.settings.brands.edit')} onClick={() => setEditorBrand(brand)}><Pencil size={18} /></button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function CreditsSettings({ brands, creditState }) {
  const { t, formatDate } = useI18n();
  const state = useMemo(() => normalizeCreditState(creditState), [creditState]);
  const brandNames = useMemo(() => new Map(brands.map((brand) => [brand.id, brand.name])), [brands]);

  return (
    <section className="settings-credits-panel">
      <header>
        <div>
          <h2>{t('product.settings.credits.title')}</h2>
          <p>{t('product.settings.credits.subtitle')}</p>
        </div>
        <article className="settings-credit-balance">
          <span><Coins size={20} /></span>
          <div>
            <small>{t('product.settings.credits.balance')}</small>
            <strong>{state.balance === null ? t('product.settings.credits.unavailable') : state.balance}</strong>
          </div>
        </article>
      </header>

      <div className="settings-credit-layout">
        <article className="settings-credit-costs">
          <header><Coins size={19} /><div><h3>{t('product.settings.credits.costsTitle')}</h3><p>{t('product.settings.credits.costsBody')}</p></div></header>
          <div>
            {CREDIT_OPERATIONS.map((operation) => (
              <div key={operation.id}>
                <span>{t(`product.settings.credits.operations.${operation.id}`)}</span>
                <strong>{t(getCreditCostKey(operation.credits), { count: operation.credits })}</strong>
              </div>
            ))}
          </div>
        </article>

        <article className="settings-credit-history">
          <header><History size={19} /><div><h3>{t('product.settings.credits.historyTitle')}</h3><p>{t('product.settings.credits.historyBody')}</p></div></header>
          {state.entries.length === 0 ? (
            <div className="settings-credit-empty">
              <History size={22} />
              <strong>{t('product.settings.credits.emptyTitle')}</strong>
              <p>{t('product.settings.credits.emptyBody')}</p>
            </div>
          ) : (
            <div className="settings-credit-ledger">
              {state.entries.map((entry) => (
                <div key={entry.id}>
                  <span>
                    <strong>{t(`product.settings.credits.operations.${entry.operationId}`)}</strong>
                    <small>{brandNames.get(entry.brandId) || t('product.settings.credits.unknownBrand')} · {formatDate(new Date(entry.occurredAt), { dateStyle: 'medium', timeStyle: 'short' })}</small>
                  </span>
                  <b>−{entry.credits}</b>
                </div>
              ))}
            </div>
          )}
        </article>
      </div>

      <aside className="settings-referrals-inactive">
        <span><CircleOff size={20} /></span>
        <div><strong>{t('product.settings.referrals.inactiveTitle')}</strong><p>{t('product.settings.referrals.inactiveBody')}</p></div>
      </aside>
    </section>
  );
}

export default function ProductSettingsPreview({
  language,
  setLanguage,
  theme,
  onToggleTheme,
  brands = [],
  activeBrandId = '',
  onSelectBrand = () => {},
  onSaveBrand = () => {},
  creditState = {},
  persistenceStatus = 'idle',
}) {
  const { t } = useI18n();
  const [activeSection, setActiveSection] = useState(() => {
    const requested = new URLSearchParams(window.location.search).get('section');
    if (requested === 'plan' || requested === 'referrals') return 'credits';
    return SETTINGS_TABS.some(([id]) => id === requested) ? requested : 'interface';
  });

  return (
    <section className="product-settings-page">
      <header className="settings-page-heading">
        <h1>{t('product.settings.title')}</h1>
        <p>{t('product.settings.subtitle')}</p>
      </header>
      <nav className="settings-section-tabs" aria-label={t('product.settings.tabs.label')}>
        {SETTINGS_TABS.map(([id, key]) => (
          <button className={activeSection === id ? 'active' : ''} type="button" key={id} onClick={() => setActiveSection(id)}>{t(key)}</button>
        ))}
      </nav>
      <div className="settings-section-content">
        {activeSection === 'interface' && <InterfaceSettings language={language} setLanguage={setLanguage} theme={theme} onToggleTheme={onToggleTheme} />}
        {activeSection === 'brands' && (
          <BrandsSettings
            brands={brands}
            activeBrandId={activeBrandId}
            onSelectBrand={onSelectBrand}
            onSaveBrand={onSaveBrand}
            persistenceStatus={persistenceStatus}
          />
        )}
        {activeSection === 'credits' && <CreditsSettings brands={brands} creditState={creditState} />}
      </div>
    </section>
  );
}
