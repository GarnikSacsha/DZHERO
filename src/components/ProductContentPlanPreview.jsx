import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  FileText,
  Plus,
  Trash2,
  X,
} from 'lucide-react';

import {
  buildContentPlanCsv,
  buildMonthCells,
  buildWeekDays,
  CONTENT_PLAN_FORMATS,
  mergeStudioDraftIntoPlan,
  normalizeContentPlanEntry,
  parseLocalIsoDate,
  readContentPlanEntries,
  sortContentPlanEntries,
  toLocalIsoDate,
  upsertContentPlanEntry,
  writeContentPlanEntries,
} from '../contentPlanViewState.mjs';
import { useI18n } from '../i18nProvider.mjs';
import {
  getProductContentPlanIdentity,
  isCurrentProductContentPlanResponse,
} from '../productContentPlanLifecycle.mjs';

const WEEKDAY_KEYS = Object.freeze([
  'product.plan.weekdays.mon',
  'product.plan.weekdays.tue',
  'product.plan.weekdays.wed',
  'product.plan.weekdays.thu',
  'product.plan.weekdays.fri',
  'product.plan.weekdays.sat',
  'product.plan.weekdays.sun',
]);
const TIME_OPTIONS = Object.freeze(Array.from({ length: 96 }, (_, index) => {
  const minutes = index * 15;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}));

function formatMonthLabel(date, language) {
  return date.toLocaleDateString(language === 'en' ? 'en-US' : 'uk-UA', {
    month: 'long',
    year: 'numeric',
  });
}

function formatWeekLabel(days, language) {
  const locale = language === 'en' ? 'en-US' : 'uk-UA';
  const first = days[0].date;
  const last = days[days.length - 1].date;
  const firstLabel = first.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  const lastLabel = last.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return `${firstLabel} – ${lastLabel}`;
}

function formatScheduleDate(date, language) {
  return date.toLocaleDateString(language === 'en' ? 'en-US' : 'uk-UA', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function formatEditorDate(value, language) {
  const date = parseLocalIsoDate(value);
  if (!date) return '';
  return date.toLocaleDateString(language === 'en' ? 'en-US' : 'uk-UA', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  });
}

function formatEditorTime(value, language) {
  const [hour, minute] = String(value || '').split(':').map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return value;
  return new Date(2000, 0, 1, hour, minute).toLocaleTimeString(
    language === 'en' ? 'en-US' : 'uk-UA',
    { hour: 'numeric', minute: '2-digit' },
  );
}

function normalizePlanPayload(payload, fallback = []) {
  const source = Array.isArray(payload?.posts) ? payload.posts : fallback;
  return sortContentPlanEntries(source.map(normalizeContentPlanEntry).filter(Boolean));
}

function getIncomingPostIdentity(post) {
  if (!post?.title) return '';
  return [
    post.sourceAdaptationId || '',
    Number.isInteger(post.sourceVariantIndex) ? post.sourceVariantIndex : '',
    post.sourceSignalId || '',
    post.title || '',
    post.date || '',
  ].join('|');
}

function EmptyCalendarState({ onAdd }) {
  const { t } = useI18n();
  return (
    <div className="plan-empty-state">
      <span><CalendarPlus size={23} /></span>
      <strong>{t('product.plan.empty.title')}</strong>
      <p>{t('product.plan.empty.body')}</p>
      <button type="button" onClick={onAdd}><Plus size={15} />{t('product.plan.actions.newPost')}</button>
    </div>
  );
}

function PostEditor({
  post,
  selectedDate,
  onClose,
  onSave,
  onDelete,
  saving = false,
}) {
  const { t, language } = useI18n();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [draft, setDraft] = useState(() => ({
    title: post?.title || '',
    format: post?.format || 'Reels',
    date: post?.date || selectedDate,
    time: post?.time || '10:00',
    body: post?.body || '',
    status: post?.status || 'scheduled',
    source: post?.source || '',
    sourceTitle: post?.sourceTitle || '',
    sourceUrl: post?.sourceUrl || '',
    sourceSignalId: post?.sourceSignalId || '',
    createdAt: post?.createdAt || '',
  }));
  const timeOptions = TIME_OPTIONS.includes(draft.time)
    ? TIME_OPTIONS
    : [...TIME_OPTIONS, draft.time].sort();

  return (
    <>
      <button className="plan-drawer-backdrop" type="button" aria-label={t('product.plan.editor.close')} onClick={onClose} />
      <aside className="plan-editor-drawer">
        <header>
          <div>
            <small>
              {post ? t('product.plan.editor.editLabel') : t('product.plan.editor.newLabel')}
              <span> · {formatEditorDate(draft.date, language)}</span>
            </small>
            <h2>{post ? t('product.plan.editor.editTitle') : t('product.plan.editor.newTitle')}</h2>
          </div>
          <button type="button" aria-label={t('product.plan.editor.close')} onClick={onClose}><X size={20} /></button>
        </header>

        <div className="plan-editor-body">
          <label>
            <span>{t('product.plan.editor.postName')}</span>
            <input
              value={draft.title}
              onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
              placeholder={t('product.plan.editor.postPlaceholder')}
            />
          </label>

          <fieldset>
            <legend>{t('product.plan.editor.format')}</legend>
            <div>
              {CONTENT_PLAN_FORMATS.map((format) => (
                <button
                  key={format}
                  className={draft.format === format ? 'active' : ''}
                  type="button"
                  onClick={() => setDraft((current) => ({ ...current, format }))}
                >
                  {format}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="plan-status-fieldset">
            <legend>{t('product.plan.editor.status')}</legend>
            <div>
              {['scheduled', 'completed'].map((status) => (
                <button
                  key={status}
                  className={draft.status === status ? 'active' : ''}
                  type="button"
                  onClick={() => setDraft((current) => ({ ...current, status }))}
                >
                  {status === 'completed' && <Check size={14} />}
                  {t(`product.plan.status.${status}`)}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="plan-event-timing">
            <legend>{t('product.plan.editor.time')}</legend>
            <div className="plan-event-time-line">
              <Clock3 size={17} />
              <select
                aria-label={t('product.plan.editor.startTime')}
                value={draft.time}
                onChange={(event) => setDraft((current) => ({ ...current, time: event.target.value }))}
              >
                {timeOptions.map((option) => (
                  <option value={option} key={option}>{formatEditorTime(option, language)}</option>
                ))}
              </select>
            </div>
            {post && (
              <label className="plan-event-date-line">
                <CalendarPlus size={17} />
                <span>
                  {t('product.plan.editor.reschedule')}
                  <small>{formatEditorDate(draft.date, language)}</small>
                </span>
                <input
                  type="date"
                  aria-label={t('product.plan.editor.date')}
                  value={draft.date}
                  onChange={(event) => setDraft((current) => ({ ...current, date: event.target.value }))}
                />
              </label>
            )}
          </fieldset>

          <label>
            <span>{t('product.plan.editor.script')}</span>
            <textarea
              rows="7"
              value={draft.body}
              onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value }))}
              placeholder={t('product.plan.editor.scriptPlaceholder')}
            />
          </label>

          {(draft.source || draft.sourceTitle) && (
            <aside className="plan-source-note">
              <FileText size={18} />
              <p>
                <strong>{t('product.plan.editor.source')}</strong>
                {[draft.source, draft.sourceTitle].filter(Boolean).join(' · ')}
                <small>{t('product.plan.editor.sourcePreserved')}</small>
              </p>
            </aside>
          )}
        </div>

        <footer>
          {confirmDelete ? (
            <div className="plan-delete-confirm">
              <p>{t('product.plan.editor.deleteConfirm')}</p>
              <button type="button" onClick={() => setConfirmDelete(false)}>{t('product.plan.editor.deleteCancel')}</button>
              <button className="confirm" type="button" onClick={onDelete}>{t('product.plan.editor.deleteAction')}</button>
            </div>
          ) : (
            <>
              {post && (
                <button
                  className="delete"
                  type="button"
                  aria-label={t('product.plan.editor.delete')}
                  disabled={saving}
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 size={18} />
                </button>
              )}
              <button
                className="save"
                type="button"
                disabled={saving || !draft.title.trim() || !parseLocalIsoDate(draft.date)}
                onClick={() => onSave(draft)}
              >
                <Check size={18} />{t('product.plan.editor.save')}
              </button>
            </>
          )}
        </footer>
      </aside>
    </>
  );
}

function MonthView({
  anchorDate,
  posts,
  visibleFormats,
  todayIso,
  onSelectDate,
  onSelectPost,
}) {
  const { t } = useI18n();
  const cells = useMemo(() => buildMonthCells(anchorDate), [anchorDate]);
  const monthPosts = posts.filter((post) => {
    const date = parseLocalIsoDate(post.date);
    return date
      && date.getFullYear() === anchorDate.getFullYear()
      && date.getMonth() === anchorDate.getMonth()
      && visibleFormats.includes(post.format);
  });

  return (
    <>
      {!monthPosts.length && <EmptyCalendarState onAdd={() => onSelectDate(toLocalIsoDate(anchorDate))} />}
      <div className="plan-calendar-scroll">
        <div className="plan-weekdays">
          {WEEKDAY_KEYS.map((key) => <span key={key}>{t(key)}</span>)}
        </div>
        <div className="plan-month-grid">
          {cells.map((cell) => {
            const dayPosts = posts.filter((post) => post.date === cell.iso && visibleFormats.includes(post.format));
            return (
              <div
                className={`plan-calendar-cell ${cell.outside ? 'outside' : ''} ${cell.iso === todayIso ? 'today' : ''}`}
                key={cell.iso}
                onClick={() => onSelectDate(cell.iso)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') onSelectDate(cell.iso);
                }}
                role="button"
                tabIndex={0}
              >
                <span>{cell.day}</span>
                <div>
                  {dayPosts.slice(0, 3).map((post) => (
                    <button
                      className={`plan-calendar-event ${post.format.toLowerCase()} ${post.status === 'completed' ? 'done' : ''}`}
                      type="button"
                      key={post.id}
                      onClick={(event) => {
                        event.stopPropagation();
                        onSelectPost(post);
                      }}
                    >
                      {post.status === 'completed' && <Check size={11} />}
                      <strong>{post.time}</strong> {post.title}
                    </button>
                  ))}
                  {dayPosts.length > 3 && <small className="plan-more-count">+{dayPosts.length - 3}</small>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function WeekView({
  days,
  posts,
  visibleFormats,
  todayIso,
  onSelectDate,
  onSelectPost,
}) {
  const { t } = useI18n();
  const weekPosts = posts.filter((post) => (
    days.some((day) => day.iso === post.date)
    && visibleFormats.includes(post.format)
  ));

  if (!weekPosts.length) {
    return <EmptyCalendarState onAdd={() => onSelectDate(days[0].iso)} />;
  }

  return (
    <div className="plan-week-view">
      <div className="plan-week-columns">
        {days.map((day, index) => {
          const dayPosts = sortContentPlanEntries(posts.filter((post) => (
            post.date === day.iso && visibleFormats.includes(post.format)
          )));
          return (
            <section className={day.iso === todayIso ? 'today' : ''} key={day.iso}>
              <button className="plan-week-day" type="button" onClick={() => onSelectDate(day.iso)}>
                <small>{t(WEEKDAY_KEYS[index])}</small>
                <strong>{day.day}</strong>
              </button>
              <div>
                {dayPosts.map((post) => (
                  <button
                    className={`plan-week-event ${post.format.toLowerCase()} ${post.status === 'completed' ? 'done' : ''}`}
                    type="button"
                    key={post.id}
                    onClick={() => onSelectPost(post)}
                  >
                    <time>{post.time}</time>
                    <strong>{post.title}</strong>
                    <small>{t(`product.plan.status.${post.status}`)}</small>
                  </button>
                ))}
                <button className="plan-week-add" type="button" aria-label={t('product.plan.actions.newPost')} onClick={() => onSelectDate(day.iso)}>
                  <Plus size={15} />
                </button>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function ScheduleView({
  anchorDate,
  posts,
  visibleFormats,
  language,
  onSelectDate,
  onSelectPost,
}) {
  const { t } = useI18n();
  const visiblePosts = sortContentPlanEntries(posts.filter((post) => {
    const date = parseLocalIsoDate(post.date);
    return date
      && date.getFullYear() === anchorDate.getFullYear()
      && date.getMonth() === anchorDate.getMonth()
      && visibleFormats.includes(post.format);
  }));

  if (!visiblePosts.length) {
    return <EmptyCalendarState onAdd={() => onSelectDate(toLocalIsoDate(anchorDate))} />;
  }

  return (
    <div className="plan-schedule-view">
      {visiblePosts.map((post) => {
        const date = parseLocalIsoDate(post.date);
        return (
          <button type="button" key={post.id} onClick={() => onSelectPost(post)}>
            <time>
              <strong>{date.getDate()}</strong>
              <small>{date.toLocaleDateString(language === 'en' ? 'en-US' : 'uk-UA', { month: 'short' })}</small>
            </time>
            <i className={post.format.toLowerCase()} />
            <div>
              <small>{formatScheduleDate(date, language)} · {post.time} · {post.format}</small>
              <strong>{post.title}</strong>
              {(post.source || post.sourceTitle) && <em>{[post.source, post.sourceTitle].filter(Boolean).join(' · ')}</em>}
            </div>
            <span className={post.status === 'completed' ? 'done' : ''}>{t(`product.plan.status.${post.status}`)}</span>
          </button>
        );
      })}
    </div>
  );
}

export default function ProductContentPlanPreview({
  incomingPost = null,
  activeBrandId = 'primary-brand',
  workspaceId = '',
  onRegisterExport,
  authenticated = false,
  productClient = null,
  brandPersistenceStatus = 'ready',
}) {
  const { t, language } = useI18n();
  const today = useMemo(() => new Date(), []);
  const todayIso = useMemo(() => toLocalIsoDate(today), [today]);
  const [anchorDate, setAnchorDate] = useState(() => new Date(today));
  const [view, setView] = useState(() => (
    window.matchMedia?.('(max-width: 620px)').matches ? 'schedule' : 'month'
  ));
  const [posts, setPosts] = useState(() => authenticated
    ? []
    : readContentPlanEntries(window.localStorage, activeBrandId));
  const [visibleFormats, setVisibleFormats] = useState(() => [...CONTENT_PLAN_FORMATS]);
  const [selectedDate, setSelectedDate] = useState(todayIso);
  const [editingPost, setEditingPost] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [exportNotice, setExportNotice] = useState(false);
  const [planState, setPlanState] = useState({
    status: authenticated ? 'loading' : 'ready',
    errorCode: '',
  });
  const [reloadToken, setReloadToken] = useState(0);
  const planLoadPromiseRef = useRef(Promise.resolve());
  const incomingPostRef = useRef('');
  const planIdentity = useMemo(
    () => getProductContentPlanIdentity({ workspaceId, brandId: activeBrandId }),
    [activeBrandId, workspaceId],
  );
  const currentPlanIdentityRef = useRef(planIdentity);
  const weekDays = useMemo(() => buildWeekDays(anchorDate), [anchorDate]);

  useEffect(() => {
    currentPlanIdentityRef.current = planIdentity;
  }, [planIdentity]);

  useEffect(() => {
    if (authenticated) return;
    writeContentPlanEntries(window.localStorage, activeBrandId, posts);
  }, [activeBrandId, authenticated, posts]);

  useEffect(() => {
    if (!authenticated || !productClient) {
      setPosts(readContentPlanEntries(window.localStorage, activeBrandId));
      setPlanState({ status: 'ready', errorCode: '' });
      planLoadPromiseRef.current = Promise.resolve();
      return undefined;
    }
    if (brandPersistenceStatus !== 'ready') {
      setPlanState({
        status: brandPersistenceStatus === 'error' ? 'error' : 'loading',
        errorCode: brandPersistenceStatus === 'error' ? 'product_brand_brain_save_failed' : '',
      });
      planLoadPromiseRef.current = Promise.resolve();
      return undefined;
    }

    let cancelled = false;
    const requestIdentity = planIdentity;
    setPlanState({ status: 'loading', errorCode: '' });
    const load = productClient.loadContentPlan()
      .then((payload) => {
        if (!isCurrentProductContentPlanResponse({
          requestIdentity,
          currentIdentity: currentPlanIdentityRef.current,
          cancelled,
        })) return payload;
        setPosts(normalizePlanPayload(payload));
        setPlanState({ status: 'ready', errorCode: '' });
        return payload;
      })
      .catch((error) => {
        if (isCurrentProductContentPlanResponse({
          requestIdentity,
          currentIdentity: currentPlanIdentityRef.current,
          cancelled,
        })) setPlanState({ status: 'error', errorCode: error?.code || error?.message || 'content_plan_load_failed' });
        throw error;
      });
    planLoadPromiseRef.current = load;
    load.catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [activeBrandId, authenticated, brandPersistenceStatus, productClient, reloadToken]);

  useEffect(() => {
    if (!incomingPost?.title) return;
    const targetDate = parseLocalIsoDate(incomingPost.date) ? incomingPost.date : todayIso;
    const identity = getIncomingPostIdentity({ ...incomingPost, date: targetDate });
    if (!identity || incomingPostRef.current === identity) return;
    if (!authenticated || !productClient) {
      incomingPostRef.current = identity;
      setPosts((current) => mergeStudioDraftIntoPlan(current, incomingPost, targetDate));
      setAnchorDate(parseLocalIsoDate(targetDate) || new Date(today));
      setSelectedDate(targetDate);
      return;
    }
    if (brandPersistenceStatus !== 'ready') return;

    let cancelled = false;
    const requestIdentity = planIdentity;
    setPlanState({ status: 'saving', errorCode: '' });
    planLoadPromiseRef.current
      .then(() => productClient.createContentPlanPost({ ...incomingPost, date: targetDate }))
      .then((payload) => {
        if (!isCurrentProductContentPlanResponse({
          requestIdentity,
          currentIdentity: currentPlanIdentityRef.current,
          cancelled,
        })) return;
        incomingPostRef.current = identity;
        setPosts(normalizePlanPayload(payload, [...posts, payload?.post].filter(Boolean)));
        setPlanState({ status: 'ready', errorCode: '' });
        setAnchorDate(parseLocalIsoDate(targetDate) || new Date(today));
        setSelectedDate(targetDate);
      })
      .catch((error) => {
        if (isCurrentProductContentPlanResponse({
          requestIdentity,
          currentIdentity: currentPlanIdentityRef.current,
          cancelled,
        })) setPlanState({ status: 'error', errorCode: error?.code || error?.message || 'content_plan_post_create_failed' });
      });
    return () => {
      cancelled = true;
    };
  // `posts` is intentionally not a dependency: the backend idempotency key is
  // the adaptation/variant identity, and adding posts here would re-submit.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, brandPersistenceStatus, incomingPost, planIdentity, productClient, today, todayIso]);

  const exportPlan = useCallback(() => {
    const csv = buildContentPlanCsv(posts, {
      scheduledLabel: t('product.plan.status.scheduled'),
      completedLabel: t('product.plan.status.completed'),
      headers: [
        t('product.plan.export.columns.title'),
        t('product.plan.export.columns.date'),
        t('product.plan.export.columns.time'),
        t('product.plan.export.columns.format'),
        t('product.plan.export.columns.status'),
        t('product.plan.export.columns.source'),
        t('product.plan.export.columns.sourceUrl'),
        t('product.plan.export.columns.script'),
      ],
    });
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `dzhero-content-plan-${activeBrandId}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
    setExportNotice(true);
    window.setTimeout(() => setExportNotice(false), 2200);
  }, [activeBrandId, posts, t]);

  useEffect(() => {
    onRegisterExport?.(exportPlan);
    return () => onRegisterExport?.(null);
  }, [exportPlan, onRegisterExport]);

  const openEditor = (date, post = null) => {
    setSelectedDate(date);
    setEditingPost(post);
    setEditorOpen(true);
  };

  const savePost = async (draft) => {
    if (planState.status === 'saving') return;
    const nextDate = parseLocalIsoDate(draft.date);
    if (authenticated && productClient) {
      const requestIdentity = planIdentity;
      setPlanState({ status: 'saving', errorCode: '' });
      try {
        const payload = editingPost?.id
          ? await productClient.updateContentPlanPost(editingPost.id, draft)
          : await productClient.createContentPlanPost(draft);
        if (!isCurrentProductContentPlanResponse({
          requestIdentity,
          currentIdentity: currentPlanIdentityRef.current,
        })) return;
        setPosts(normalizePlanPayload(payload, posts));
        setPlanState({ status: 'ready', errorCode: '' });
      } catch (error) {
        if (!isCurrentProductContentPlanResponse({
          requestIdentity,
          currentIdentity: currentPlanIdentityRef.current,
        })) return;
        setPlanState({ status: 'error', errorCode: error?.code || error?.message || 'content_plan_post_save_failed' });
        return;
      }
    } else {
      setPosts((current) => upsertContentPlanEntry(current, draft, editingPost?.id || ''));
    }
    if (nextDate) setAnchorDate(nextDate);
    setSelectedDate(draft.date);
    setEditorOpen(false);
  };

  const deletePost = async () => {
    if (!editingPost?.id || planState.status === 'saving') return;
    if (authenticated && productClient) {
      const requestIdentity = planIdentity;
      setPlanState({ status: 'saving', errorCode: '' });
      try {
        const payload = await productClient.deleteContentPlanPost(editingPost.id);
        if (!isCurrentProductContentPlanResponse({
          requestIdentity,
          currentIdentity: currentPlanIdentityRef.current,
        })) return;
        setPosts(normalizePlanPayload(payload, posts.filter((post) => post.id !== editingPost.id)));
        setPlanState({ status: 'ready', errorCode: '' });
      } catch (error) {
        if (!isCurrentProductContentPlanResponse({
          requestIdentity,
          currentIdentity: currentPlanIdentityRef.current,
        })) return;
        setPlanState({ status: 'error', errorCode: error?.code || error?.message || 'content_plan_post_delete_failed' });
        return;
      }
    } else {
      setPosts((current) => current.filter((post) => post.id !== editingPost.id));
    }
    setEditorOpen(false);
  };

  const changePeriod = (direction) => {
    setAnchorDate((current) => {
      const next = new Date(current);
      if (view === 'week') next.setDate(next.getDate() + (direction * 7));
      else next.setMonth(next.getMonth() + direction, 1);
      return next;
    });
  };

  const goToday = () => {
    setAnchorDate(new Date(today));
    setSelectedDate(todayIso);
  };

  const periodLabel = view === 'week'
    ? formatWeekLabel(weekDays, language)
    : formatMonthLabel(anchorDate, language);
  const completedCount = posts.filter((post) => post.status === 'completed').length;
  const scheduledCount = posts.length - completedCount;

  return (
    <section className="product-content-plan-page">
      <header className="plan-page-heading">
        <div>
          <h1>{t('product.plan.title')}</h1>
          <p>{t('product.plan.subtitle')}</p>
        </div>
      </header>

      {exportNotice && (
        <div className="plan-export-notice" role="status">
          <Download size={16} />{t(posts.length ? 'product.plan.export.ready' : 'product.plan.export.empty')}
        </div>
      )}

      {planState.status === 'loading' && (
        <div className="plan-sync-notice" role="status">{t('product.plan.sync.loading')}</div>
      )}
      {planState.status === 'saving' && (
        <div className="plan-sync-notice" role="status">{t('product.plan.sync.saving')}</div>
      )}
      {planState.status === 'error' && (
        <div className="plan-sync-notice error" role="alert">
          <span>{t('product.plan.sync.error')}</span>
          <button type="button" onClick={() => setReloadToken((current) => current + 1)}>{t('common.retry')}</button>
        </div>
      )}

      <div className="plan-stats">
        <article><small>{t('product.plan.stats.total')}</small><strong>{posts.length}</strong></article>
        <article><small>{t('product.plan.stats.scheduled')}</small><strong>{scheduledCount}</strong></article>
        <article className="completed"><small>{t('product.plan.stats.completed')}</small><strong>{completedCount}</strong></article>
      </div>

      <article className="plan-calendar-card">
        <header className="plan-calendar-toolbar">
          <div className="plan-date-navigation">
            <button className="today-button" type="button" onClick={goToday}>{t('product.plan.actions.today')}</button>
            <button type="button" aria-label={t('product.plan.actions.previous')} onClick={() => changePeriod(-1)}><ChevronLeft size={19} /></button>
            <strong>{periodLabel}</strong>
            <button type="button" aria-label={t('product.plan.actions.next')} onClick={() => changePeriod(1)}><ChevronRight size={19} /></button>
          </div>
          <div className="plan-view-switcher">
            {['month', 'week', 'schedule'].map((option) => (
              <button className={view === option ? 'active' : ''} type="button" key={option} onClick={() => setView(option)}>
                {t(`product.plan.views.${option}`)}
              </button>
            ))}
          </div>
        </header>

        <div className="plan-format-bar">
          <span>{t('product.plan.formats.label')}</span>
          {CONTENT_PLAN_FORMATS.map((format) => (
            <button
              className={visibleFormats.includes(format) ? `active ${format.toLowerCase()}` : ''}
              type="button"
              key={format}
              aria-pressed={visibleFormats.includes(format)}
              onClick={() => setVisibleFormats((current) => (
                current.includes(format) ? current.filter((item) => item !== format) : [...current, format]
              ))}
            >
              <i />{format}
            </button>
          ))}
          <button className="plan-add-post" type="button" onClick={() => openEditor(selectedDate)}><Plus size={16} />{t('product.plan.actions.newPost')}</button>
        </div>

        {view === 'month' && (
          <MonthView
            anchorDate={anchorDate}
            posts={posts}
            visibleFormats={visibleFormats}
            todayIso={todayIso}
            onSelectDate={openEditor}
            onSelectPost={(post) => openEditor(post.date, post)}
          />
        )}
        {view === 'week' && (
          <WeekView
            days={weekDays}
            posts={posts}
            visibleFormats={visibleFormats}
            todayIso={todayIso}
            onSelectDate={openEditor}
            onSelectPost={(post) => openEditor(post.date, post)}
          />
        )}
        {view === 'schedule' && (
          <ScheduleView
            anchorDate={anchorDate}
            posts={posts}
            visibleFormats={visibleFormats}
            language={language}
            onSelectDate={openEditor}
            onSelectPost={(post) => openEditor(post.date, post)}
          />
        )}
      </article>

      <footer className="plan-workflow-note">
        <FileText size={18} />
        <p><strong>{t('product.plan.workflow.title')}</strong>{t('product.plan.workflow.body')}</p>
      </footer>

      {editorOpen && (
        <PostEditor
          key={editingPost?.id || `new-${selectedDate}`}
          post={editingPost}
          selectedDate={selectedDate}
          onClose={() => setEditorOpen(false)}
          onSave={savePost}
          onDelete={deletePost}
          saving={planState.status === 'saving'}
        />
      )}
    </section>
  );
}
