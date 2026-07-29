import React, { useState } from 'react';
import {
  Check,
  CircleDollarSign,
  Copy,
  CreditCard,
  Download,
  Gauge,
  Globe2,
  Languages,
  Laptop,
  Link2Off,
  LogOut,
  Moon,
  Palette,
  Pencil,
  Plus,
  ShieldCheck,
  Smartphone,
  Sun,
  Trash2,
  Users,
  X,
  Zap,
} from 'lucide-react';

import { useI18n } from '../i18nProvider.mjs';

const SETTINGS_TABS = Object.freeze([
  ['interface', 'product.settings.tabs.interface'],
  ['brands', 'product.settings.tabs.brands'],
  ['plan', 'product.settings.tabs.plan'],
  ['referrals', 'product.settings.tabs.referrals'],
  ['security', 'product.settings.tabs.security'],
]);

const INITIAL_BRANDS = Object.freeze([
  {
    id: 'luminal',
    initials: 'LT',
    name: 'Luminal Tech',
    industry: 'SaaS / AI',
    audience: 'product.settings.brands.luminalAudience',
    platforms: 'Instagram · YouTube',
  },
  {
    id: 'verdant',
    initials: 'VL',
    name: 'Verdant Living',
    industry: 'Lifestyle / Eco',
    audience: 'product.settings.brands.verdantAudience',
    platforms: 'Instagram · TikTok',
  },
]);

const INVOICES = Object.freeze([
  ['#DZH-2026-003', 'product.settings.plan.invoiceJul', '$49.00'],
  ['#DZH-2026-002', 'product.settings.plan.invoiceJun', '$49.00'],
  ['#DZH-2026-001', 'product.settings.plan.invoiceMay', '$49.00'],
]);

const REFERRALS = Object.freeze([
  ['SM', 'Sarah Miller', 'sarah.m@studio.com', 'product.settings.referrals.dateOne', 'Pro Yearly', 'product.settings.referrals.active', '$192.00'],
  ['RK', 'Ryan K.', 'ryan.k@freelance.ai', 'product.settings.referrals.dateTwo', 'Starter', 'product.settings.referrals.active', '$45.00'],
  ['JB', 'John B.', 'jb@agency.co', 'product.settings.referrals.dateThree', 'Trial', 'product.settings.referrals.expired', '$0.00'],
]);

function Toggle({ checked, onChange, label }) {
  return (
    <button className={`settings-toggle ${checked ? 'active' : ''}`} type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}>
      <span />
    </button>
  );
}

function SettingsNotice({ children, onClose }) {
  return (
    <div className="settings-inline-notice">
      <Check size={16} />
      <span>{children}</span>
      <button type="button" onClick={onClose}><X size={15} /></button>
    </div>
  );
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

function BrandsSettings() {
  const { t } = useI18n();
  const [brands, setBrands] = useState(() => INITIAL_BRANDS.map((brand) => ({ ...brand })));
  const [editorOpen, setEditorOpen] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [notice, setNotice] = useState('');

  const addBrand = () => {
    if (!draftName.trim()) return;
    setBrands((current) => [...current, {
      id: `brand-${Date.now()}`,
      initials: draftName.trim().slice(0, 2).toUpperCase(),
      name: draftName.trim(),
      industry: 'SaaS / AI',
      customAudience: t('product.settings.brands.newAudience'),
      platforms: 'Instagram',
    }]);
    setDraftName('');
    setEditorOpen(false);
    setNotice(t('product.settings.brands.created'));
  };

  return (
    <section className="settings-brands-panel">
      {notice && <SettingsNotice onClose={() => setNotice('')}>{notice}</SettingsNotice>}
      <header>
        <div><h2>{t('product.settings.brands.title')}</h2><p>{t('product.settings.brands.subtitle')}</p></div>
        <button type="button" onClick={() => setEditorOpen(true)}><Plus size={18} />{t('product.settings.brands.create')}</button>
      </header>
      <div className="settings-brand-list">
        {brands.map((brand) => (
          <article key={brand.id}>
            <span>{brand.initials}</span>
            <dl>
              <div><dt>{t('product.settings.brands.name')}</dt><dd>{brand.name}</dd></div>
              <div><dt>{t('product.settings.brands.industry')}</dt><dd>{brand.industry}</dd></div>
              <div><dt>{t('product.settings.brands.audience')}</dt><dd>{brand.customAudience || t(brand.audience)}</dd></div>
              <div><dt>{t('product.settings.brands.platforms')}</dt><dd>{brand.platforms}</dd></div>
            </dl>
            <div>
              <button type="button" aria-label={t('product.settings.brands.edit')} onClick={() => setNotice(t('product.settings.brands.editMock'))}><Pencil size={18} /></button>
              <button type="button" aria-label={t('product.settings.brands.delete')} onClick={() => setBrands((current) => current.filter((item) => item.id !== brand.id))}><Trash2 size={18} /></button>
            </div>
          </article>
        ))}
      </div>
      {editorOpen && (
        <div className="settings-small-editor">
          <label><span>{t('product.settings.brands.newName')}</span><input autoFocus value={draftName} onChange={(event) => setDraftName(event.target.value)} placeholder={t('product.settings.brands.newPlaceholder')} /></label>
          <button type="button" onClick={() => setEditorOpen(false)}>{t('common.cancel')}</button>
          <button className="primary" type="button" disabled={!draftName.trim()} onClick={addBrand}>{t('product.settings.brands.add')}</button>
        </div>
      )}
    </section>
  );
}

function PlanSettings() {
  const { t } = useI18n();
  const [notice, setNotice] = useState('');

  return (
    <section className="settings-plan-panel">
      {notice && <SettingsNotice onClose={() => setNotice('')}>{notice}</SettingsNotice>}
      <div className="settings-plan-summary">
        <article className="settings-current-plan">
          <header><span>{t('product.settings.plan.active')}</span><ShieldCheck size={22} /></header>
          <h2>{t('product.settings.plan.pro')}</h2>
          <p>{t('product.settings.plan.price')}</p>
          <button type="button" onClick={() => setNotice(t('product.settings.plan.upgradeMock'))}><Zap size={17} />{t('product.settings.plan.upgrade')}</button>
        </article>
        <article className="settings-credit-card">
          <h3>{t('product.settings.plan.credits')}</h3>
          <div><strong>850</strong><small>{t('product.settings.plan.creditsLeft')}</small></div>
          <p>{t('product.settings.plan.reset')}</p>
        </article>
        <article className="settings-limits-card">
          <h3>{t('product.settings.plan.limits')}</h3>
          <div><p><span>{t('product.settings.plan.seats')}</span><strong>3/5</strong></p><i><span style={{ width: '60%' }} /></i></div>
        </article>
      </div>
      <article className="settings-table-card">
        <header><h2>{t('product.settings.plan.history')}</h2><button type="button">{t('product.settings.plan.receipts')}</button></header>
        <div className="settings-table settings-invoice-table">
          <div className="head"><span>{t('product.settings.plan.invoiceId')}</span><span>{t('product.settings.plan.date')}</span><span>{t('product.settings.plan.amount')}</span><span>{t('product.settings.plan.status')}</span><span>{t('product.settings.plan.actions')}</span></div>
          {INVOICES.map(([id, date, amount]) => (
            <div key={id}><span>{id}</span><span>{t(date)}</span><strong>{amount}</strong><em>{t('product.settings.plan.paid')}</em><button type="button" aria-label={t('product.settings.plan.download')}><Download size={17} /></button></div>
          ))}
        </div>
      </article>
      <aside className="settings-sales-banner">
        <div><h2>{t('product.settings.plan.salesTitle')}</h2><p>{t('product.settings.plan.salesBody')}</p></div>
        <button type="button" onClick={() => setNotice(t('product.settings.plan.salesMock'))}>{t('product.settings.plan.salesAction')}</button>
      </aside>
    </section>
  );
}

function ReferralsSettings() {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    try {
      await navigator.clipboard?.writeText('dzhero.ai/ref/alex_design_2026');
    } catch {
      // The preview still confirms the mock action when clipboard permission is unavailable.
    }
    setCopied(true);
  };

  return (
    <section className="settings-referrals-panel">
      <div className="settings-referral-hero">
        <article><span>{t('product.settings.referrals.activeProgram')}</span><h2>{t('product.settings.referrals.title')}</h2><p>{t('product.settings.referrals.subtitle')}</p></article>
        <aside><h3>{t('product.settings.referrals.linkTitle')}</h3><p>{t('product.settings.referrals.linkBody')}</p><code>dzhero.ai/ref/alex_design_2026</code><button type="button" onClick={copyLink}>{copied ? <Check size={18} /> : <Copy size={18} />}{t(copied ? 'product.settings.referrals.copied' : 'product.settings.referrals.copy')}</button></aside>
      </div>
      <div className="settings-referral-stats">
        <article><Users size={20} /><small>{t('product.settings.referrals.successful')}</small><strong>24</strong><p>{t('product.settings.referrals.monthGrowth')}</p></article>
        <article><CircleDollarSign size={20} /><small>{t('product.settings.referrals.earned')}</small><strong>$1,240.50</strong><p>{t('product.settings.referrals.growth')}</p></article>
        <article><CreditCard size={20} /><small>{t('product.settings.referrals.pending')}</small><strong>$450.00</strong><p>{t('product.settings.referrals.estimate')}</p></article>
        <article><Gauge size={20} /><small>{t('product.settings.referrals.conversion')}</small><strong>8.4%</strong><p>{t('product.settings.referrals.average')}</p></article>
      </div>
      <article className="settings-table-card settings-referral-history">
        <header><h2>{t('product.settings.referrals.history')}</h2><button type="button"><Download size={15} />CSV</button></header>
        <div className="settings-table settings-referral-table">
          <div className="head"><span>{t('product.settings.referrals.user')}</span><span>{t('product.settings.referrals.joined')}</span><span>{t('product.settings.referrals.plan')}</span><span>{t('product.settings.referrals.status')}</span><span>{t('product.settings.referrals.revenue')}</span></div>
          {REFERRALS.map(([initials, name, email, date, plan, status, revenue]) => (
            <div key={email}>
              <span className="referral-user"><i>{initials}</i><b>{name}<small>{email}</small></b></span>
              <span>{t(date)}</span><span>{plan}</span><em>{t(status)}</em><strong>{revenue}</strong>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}

function SecuritySettings() {
  const { t } = useI18n();
  const [connected, setConnected] = useState(true);
  const [twoFactor, setTwoFactor] = useState(true);
  const [phoneVisible, setPhoneVisible] = useState(true);
  const [notice, setNotice] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <section className="settings-security-panel">
      {notice && <SettingsNotice onClose={() => setNotice('')}>{notice}</SettingsNotice>}
      <header><h2>{t('product.settings.security.title')}</h2><p>{t('product.settings.security.subtitle')}</p></header>
      <div className="settings-security-group">
        <h3>{t('product.settings.security.connected')}</h3>
        <article className="settings-connected-account">
          <span><Globe2 size={22} /></span><div><strong>{t('product.settings.security.google')}</strong><small>alex.rivera@work.dzhero.ai</small></div>
          <em>{t(connected ? 'product.settings.security.connectedStatus' : 'product.settings.security.disconnected')}</em>
          <button type="button" aria-label={t('product.settings.security.disconnect')} onClick={() => setConnected((current) => !current)}><Link2Off size={19} /></button>
        </article>
      </div>
      <div className="settings-security-group">
        <h3>{t('product.settings.security.twoFactor')}</h3>
        <article className="settings-two-factor">
          <header><span><Smartphone size={21} /></span><div><strong>{t('product.settings.security.authenticator')}</strong><small>{t('product.settings.security.authenticatorBody')}</small></div><Toggle checked={twoFactor} onChange={setTwoFactor} label={t('product.settings.security.twoFactorToggle')} /></header>
          <p><ShieldCheck size={17} />{t(twoFactor ? 'product.settings.security.twoFactorOn' : 'product.settings.security.twoFactorOff')}</p>
        </article>
      </div>
      <div className="settings-security-group">
        <header><h3>{t('product.settings.security.sessions')}</h3><button type="button" onClick={() => { setPhoneVisible(false); setNotice(t('product.settings.security.loggedOut')); }}>{t('product.settings.security.logoutAll')}</button></header>
        <div className="settings-session-list">
          <article><Laptop size={22} /><div><strong>MacBook Pro 16&quot; <em>{t('product.settings.security.current')}</em></strong><small>{t('product.settings.security.macDetails')}</small></div><span>{t('product.settings.security.activeNow')}</span></article>
          {phoneVisible && <article><Smartphone size={22} /><div><strong>iPhone 15 Pro</strong><small>{t('product.settings.security.phoneDetails')}</small></div><span>{t('product.settings.security.twoHours')}</span><button type="button" aria-label={t('product.settings.security.logoutDevice')} onClick={() => setPhoneVisible(false)}><LogOut size={18} /></button></article>}
        </div>
      </div>
      <article className="settings-danger-zone">
        <div><h3>{t('product.settings.security.danger')}</h3><p>{t('product.settings.security.dangerBody')}</p></div>
        <button type="button" onClick={() => setConfirmDelete(true)}><Trash2 size={17} />{t('product.settings.security.delete')}</button>
      </article>
      {confirmDelete && (
        <div className="settings-confirm-card">
          <h3>{t('product.settings.security.confirmTitle')}</h3>
          <p>{t('product.settings.security.confirmBody')}</p>
          <button type="button" onClick={() => setConfirmDelete(false)}>{t('common.cancel')}</button>
          <button className="danger" type="button" onClick={() => { setConfirmDelete(false); setNotice(t('product.settings.security.deleteMock')); }}>{t('product.settings.security.confirmDelete')}</button>
        </div>
      )}
    </section>
  );
}

export default function ProductSettingsPreview({ language, setLanguage, theme, onToggleTheme }) {
  const { t } = useI18n();
  const [activeSection, setActiveSection] = useState(() => {
    const requested = new URLSearchParams(window.location.search).get('section');
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
        {activeSection === 'brands' && <BrandsSettings />}
        {activeSection === 'plan' && <PlanSettings />}
        {activeSection === 'referrals' && <ReferralsSettings />}
        {activeSection === 'security' && <SecuritySettings />}
      </div>
    </section>
  );
}
