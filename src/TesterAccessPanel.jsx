import React, { useEffect, useState } from 'react';
import { formatTesterStatus, getTesterUsageRows } from './testerAccessUi.mjs';

const ERROR_COPY = {
  valid_email_required: {
    en: 'Enter a valid Google account email.',
    uk: 'Введи коректну пошту Google-акаунта.',
  },
  owner_access_required: {
    en: 'Only the owner can manage tester access.',
    uk: 'Керувати доступами може лише власник.',
  },
};

function formatDate(value, language) {
  if (!value) return '';
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return '';
  return new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : 'uk-UA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(timestamp));
}

export default function TesterAccessPanel({ apiBase, authFetch, language = 'uk', notify }) {
  const [testers, setTesters] = useState([]);
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [status, setStatus] = useState('loading');
  const [pendingId, setPendingId] = useState('');
  const copy = language === 'en'
    ? {
        eyebrow: 'Owner access control',
        title: 'Tester Pro access',
        intro: 'Add a Google email before or after the first sign-in. Access has no expiry and stays active until you revoke it.',
        email: 'Google account email',
        note: 'Note (optional)',
        notePlaceholder: 'July feedback group',
        grant: 'Grant Tester Pro',
        granting: 'Granting...',
        loading: 'Loading tester access...',
        empty: 'No tester emails yet.',
        retry: 'Try again',
        workspace: 'Workspace',
        lastLogin: 'Last sign-in',
        revoke: 'Revoke access',
        revoking: 'Revoking...',
        confirm: 'Revoke Tester Pro access for this email?',
        granted: 'Tester Pro access updated.',
        revoked: 'Tester Pro access revoked.',
        invalid: 'Enter a valid email address.',
        loadFailed: 'Could not load tester access.',
        actionFailed: 'Could not update tester access.',
        usage: {
          aiOperations: 'Paid AI operations this month',
          reelImports: 'Manual imports this month',
          apifyDailyUsd: "Today's Apify budget",
        },
      }
    : {
        eyebrow: 'Керування власника',
        title: 'Доступи Tester Pro',
        intro: 'Додай Google-пошту до або після першого входу. Доступ без строку й працює, доки ти не відкличеш його вручну.',
        email: 'Пошта Google-акаунта',
        note: 'Нотатка (необовʼязково)',
        notePlaceholder: 'Група фідбеку за липень',
        grant: 'Видати Tester Pro',
        granting: 'Видаємо...',
        loading: 'Завантажуємо доступи...',
        empty: 'Тестових пошт ще немає.',
        retry: 'Спробувати ще раз',
        workspace: 'Робочий простір',
        lastLogin: 'Останній вхід',
        revoke: 'Відкликати доступ',
        revoking: 'Відкликаємо...',
        confirm: 'Відкликати Tester Pro для цієї пошти?',
        granted: 'Доступ Tester Pro оновлено.',
        revoked: 'Доступ Tester Pro відкликано.',
        invalid: 'Введи коректну пошту.',
        loadFailed: 'Не вдалося завантажити доступи.',
        actionFailed: 'Не вдалося оновити доступ.',
        usage: {
          aiOperations: 'Платні AI-операції за місяць',
          reelImports: 'Ручні імпорти за місяць',
          apifyDailyUsd: 'Бюджет Apify сьогодні',
        },
      };

  const getErrorMessage = (payload, fallback) => (
    ERROR_COPY[payload?.error]?.[language] || payload?.message || fallback
  );

  const loadTesters = async () => {
    setStatus('loading');
    try {
      const response = await authFetch(`${apiBase}/owner/testers`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(getErrorMessage(payload, copy.loadFailed));
      setTesters(payload.testers || []);
      setStatus('ready');
    } catch (error) {
      setStatus('error');
      notify?.(error.message || copy.loadFailed);
    }
  };

  useEffect(() => {
    void loadTesters();
  }, []);

  const grantAccess = async (event) => {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      notify?.(copy.invalid);
      return;
    }
    setPendingId('grant');
    try {
      const response = await authFetch(`${apiBase}/owner/testers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail, note: note.trim() }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(getErrorMessage(payload, copy.actionFailed));
      setEmail('');
      setNote('');
      notify?.(copy.granted);
      await loadTesters();
    } catch (error) {
      notify?.(error.message || copy.actionFailed);
    } finally {
      setPendingId('');
    }
  };

  const revokeAccess = async (tester) => {
    if (!window.confirm(copy.confirm)) return;
    setPendingId(tester.id);
    try {
      const response = await authFetch(`${apiBase}/owner/testers/${tester.id}`, { method: 'DELETE' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(getErrorMessage(payload, copy.actionFailed));
      notify?.(copy.revoked);
      await loadTesters();
    } catch (error) {
      notify?.(error.message || copy.actionFailed);
    } finally {
      setPendingId('');
    }
  };

  return (
    <div className="tester-access-panel">
      <header className="tester-access-header">
        <div>
          <small>{copy.eyebrow}</small>
          <h2>{copy.title}</h2>
          <p>{copy.intro}</p>
        </div>
      </header>

      <form className="tester-access-form" onSubmit={grantAccess}>
        <label>
          <span>{copy.email}</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="tester@gmail.com"
            autoComplete="email"
          />
        </label>
        <label>
          <span>{copy.note}</span>
          <input value={note} onChange={(event) => setNote(event.target.value)} placeholder={copy.notePlaceholder} />
        </label>
        <button className="dark" type="submit" disabled={Boolean(pendingId)}>
          {pendingId === 'grant' ? copy.granting : copy.grant}
        </button>
      </form>

      {status === 'loading' && <p className="tester-access-state">{copy.loading}</p>}
      {status === 'error' && (
        <div className="tester-access-state error">
          <span>{copy.loadFailed}</span>
          <button type="button" onClick={loadTesters}>{copy.retry}</button>
        </div>
      )}
      {status === 'ready' && !testers.length && <p className="tester-access-state">{copy.empty}</p>}

      {status === 'ready' && testers.length > 0 && (
        <div className="tester-access-list">
          {testers.map((tester) => (
            <article className={`tester-access-card status-${tester.status}`} key={tester.id}>
              <div className="tester-access-card-head">
                <div>
                  <strong>{tester.email}</strong>
                  {tester.note && <p>{tester.note}</p>}
                </div>
                <span className={`tester-access-badge ${tester.status}`}>{formatTesterStatus(tester.status, language)}</span>
              </div>

              {(tester.workspaceName || tester.lastLoginAt) && (
                <div className="tester-access-meta">
                  {tester.workspaceName && <span><small>{copy.workspace}</small><strong>{tester.workspaceName}</strong></span>}
                  {tester.lastLoginAt && <span><small>{copy.lastLogin}</small><strong>{formatDate(tester.lastLoginAt, language)}</strong></span>}
                </div>
              )}

              {tester.billing && (
                <div className="tester-access-usage">
                  {getTesterUsageRows(tester).map((row) => {
                    const percent = row.limit > 0 ? Math.min(100, Math.round((row.used / row.limit) * 100)) : 0;
                    const isUsd = row.key === 'apifyDailyUsd';
                    return (
                      <div key={row.key}>
                        <p><span>{copy.usage[row.key]}</span><strong>{isUsd ? `$${row.used} / $${row.limit}` : `${row.used} / ${row.limit}`}</strong></p>
                        <span className="tester-access-progress"><i style={{ width: `${percent}%` }} /></span>
                      </div>
                    );
                  })}
                </div>
              )}

              {tester.status !== 'revoked' && (
                <button
                  className="tester-access-revoke"
                  type="button"
                  onClick={() => revokeAccess(tester)}
                  disabled={Boolean(pendingId)}
                >
                  {pendingId === tester.id ? copy.revoking : copy.revoke}
                </button>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
