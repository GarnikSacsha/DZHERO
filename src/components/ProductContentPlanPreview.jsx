import React, { useMemo, useState } from 'react';
import {
  CalendarPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileText,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';

import { useI18n } from '../i18nProvider.mjs';

const WEEKDAY_KEYS = Object.freeze([
  'product.plan.weekdays.mon',
  'product.plan.weekdays.tue',
  'product.plan.weekdays.wed',
  'product.plan.weekdays.thu',
  'product.plan.weekdays.fri',
  'product.plan.weekdays.sat',
  'product.plan.weekdays.sun',
]);

const FORMAT_OPTIONS = Object.freeze(['Reels', 'Stories', 'Post', 'TikTok']);

const INITIAL_POSTS = Object.freeze([
  { id: 'post-1', day: 3, time: '10:00', format: 'Reels', title: 'product.plan.posts.aiContent', done: true },
  { id: 'post-2', day: 3, time: '14:30', format: 'Post', title: 'product.plan.posts.sellWithReels', done: false },
  { id: 'post-3', day: 4, time: '10:00', format: 'Stories', title: 'product.plan.posts.creatorEconomy', done: false },
  { id: 'post-4', day: 6, time: '18:30', format: 'TikTok', title: 'product.plan.posts.ecommerceHook', done: false },
  { id: 'post-5', day: 28, time: '18:00', format: 'Reels', title: 'product.plan.posts.signalToScript', done: true },
  { id: 'post-6', day: 30, time: '12:00', format: 'Post', title: 'product.plan.posts.brandBrain', done: false },
  { id: 'post-7', day: 31, time: '17:30', format: 'Stories', title: 'product.plan.posts.weeklyReview', done: false },
]);

function buildMonthCells(year, month) {
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const previousMonthDays = new Date(year, month, 0).getDate();
  const mondayOffset = (firstDay.getDay() + 6) % 7;

  return Array.from({ length: 42 }, (_, index) => {
    const rawDay = index - mondayOffset + 1;
    if (rawDay < 1) return { day: previousMonthDays + rawDay, outside: true, direction: -1 };
    if (rawDay > daysInMonth) return { day: rawDay - daysInMonth, outside: true, direction: 1 };
    return { day: rawDay, outside: false, direction: 0 };
  });
}

function formatMonthLabel(date, language) {
  return date.toLocaleDateString(language === 'en' ? 'en-US' : 'uk-UA', {
    month: 'long',
    year: 'numeric',
  });
}

function PostEditor({ post, selectedDay, onClose, onSave, onDelete }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(() => ({
    title: post?.customTitle || (post?.title ? t(post.title) : ''),
    format: post?.format || 'Reels',
    time: post?.time || '10:00',
    script: post?.script || '',
  }));

  return (
    <>
      <button className="plan-drawer-backdrop" type="button" aria-label={t('product.plan.editor.close')} onClick={onClose} />
      <aside className="plan-editor-drawer">
        <header>
          <div>
            <small>{post ? t('product.plan.editor.editLabel') : t('product.plan.editor.newLabel')}</small>
            <h2>{post ? t('product.plan.editor.editTitle') : t('product.plan.editor.newTitle')}</h2>
          </div>
          <button type="button" aria-label={t('product.plan.editor.close')} onClick={onClose}><X size={20} /></button>
        </header>
        <div className="plan-editor-body">
          <label>
            <span>{t('product.plan.editor.postName')}</span>
            <input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder={t('product.plan.editor.postPlaceholder')} />
          </label>
          <fieldset>
            <legend>{t('product.plan.editor.format')}</legend>
            <div>
              {FORMAT_OPTIONS.map((format) => (
                <button key={format} className={draft.format === format ? 'active' : ''} type="button" onClick={() => setDraft((current) => ({ ...current, format }))}>
                  {format}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="plan-editor-date-row">
            <label>
              <span>{t('product.plan.editor.date')}</span>
              <div><CalendarPlus size={17} /><input value={`${selectedDay} ${t('product.plan.month.july')}`} readOnly /></div>
            </label>
            <label>
              <span>{t('product.plan.editor.time')}</span>
              <div><Clock3 size={17} /><input type="time" value={draft.time} onChange={(event) => setDraft((current) => ({ ...current, time: event.target.value }))} /></div>
            </label>
          </div>
          <label>
            <span>{t('product.plan.editor.script')}</span>
            <textarea rows="7" value={draft.script} onChange={(event) => setDraft((current) => ({ ...current, script: event.target.value }))} placeholder={t('product.plan.editor.scriptPlaceholder')} />
          </label>
          <aside><Sparkles size={18} /><p>{t('product.plan.editor.reminder')}</p></aside>
        </div>
        <footer>
          {post && <button className="delete" type="button" aria-label={t('product.plan.editor.delete')} onClick={onDelete}><Trash2 size={18} /></button>}
          <button className="save" type="button" disabled={!draft.title.trim()} onClick={() => onSave(draft)}>
            <Check size={18} />{t('product.plan.editor.save')}
          </button>
        </footer>
      </aside>
    </>
  );
}

function MonthView({ cells, posts, visibleFormats, onSelectDay, onSelectPost }) {
  const { t } = useI18n();

  return (
    <>
      <div className="plan-weekdays">
        {WEEKDAY_KEYS.map((key) => <span key={key}>{t(key)}</span>)}
      </div>
      <div className="plan-month-grid">
        {cells.map((cell, index) => {
          const dayPosts = cell.outside ? [] : posts.filter((post) => post.day === cell.day && visibleFormats.includes(post.format));
          return (
            <div
              className={`plan-calendar-cell ${cell.outside ? 'outside' : ''} ${!cell.outside && cell.day === 28 ? 'today' : ''}`}
              key={`${cell.direction}-${cell.day}-${index}`}
              onClick={() => !cell.outside && onSelectDay(cell.day)}
              onKeyDown={(event) => {
                if (!cell.outside && (event.key === 'Enter' || event.key === ' ')) onSelectDay(cell.day);
              }}
              role={cell.outside ? undefined : 'button'}
              tabIndex={cell.outside ? -1 : 0}
            >
              <span>{cell.day}</span>
              <div>
                {dayPosts.slice(0, 3).map((post) => (
                  <button
                    className={`plan-calendar-event ${post.format.toLowerCase()} ${post.done ? 'done' : ''}`}
                    type="button"
                    key={post.id}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelectPost(post);
                    }}
                  >
                    {post.done && <Check size={11} />}
                    <strong>{post.time}</strong> {post.customTitle || t(post.title)}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function WeekView({ posts, visibleFormats, onSelectDay, onSelectPost }) {
  const { t } = useI18n();
  const weekDays = [27, 28, 29, 30, 31, 1, 2];
  const slots = ['09:00', '12:00', '15:00', '18:00'];

  return (
    <div className="plan-week-view">
      <header>
        <span />
        {weekDays.map((day, index) => (
          <button className={day === 28 ? 'today' : ''} type="button" key={`${day}-${index}`} onClick={() => index < 5 && onSelectDay(day)}>
            <small>{t(WEEKDAY_KEYS[index])}</small><strong>{day}</strong>
          </button>
        ))}
      </header>
      {slots.map((slot) => (
        <div className="plan-week-row" key={slot}>
          <time>{slot}</time>
          {weekDays.map((day, index) => {
            const matched = index < 5 ? posts.find((post) => post.day === day && post.time.slice(0, 2) === slot.slice(0, 2) && visibleFormats.includes(post.format)) : null;
            return (
              <button type="button" key={`${slot}-${day}-${index}`} onClick={() => index < 5 && (matched ? onSelectPost(matched) : onSelectDay(day))}>
                {matched && <span className={`plan-week-event ${matched.format.toLowerCase()}`}>{matched.customTitle || t(matched.title)}</span>}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function ScheduleView({ posts, visibleFormats, onSelectPost }) {
  const { t } = useI18n();
  const visiblePosts = posts.filter((post) => visibleFormats.includes(post.format)).sort((a, b) => a.day - b.day || a.time.localeCompare(b.time));

  return (
    <div className="plan-schedule-view">
      {visiblePosts.map((post) => (
        <button type="button" key={post.id} onClick={() => onSelectPost(post)}>
          <time><strong>{post.day}</strong><small>{t('product.plan.month.julyShort')}</small></time>
          <i className={post.format.toLowerCase()} />
          <div>
            <small>{post.time} · {post.format}</small>
            <strong>{post.customTitle || t(post.title)}</strong>
          </div>
          <span className={post.done ? 'done' : ''}>{t(post.done ? 'product.plan.status.completed' : 'product.plan.status.scheduled')}</span>
        </button>
      ))}
    </div>
  );
}

export default function ProductContentPlanPreview() {
  const { t, language } = useI18n();
  const [calendarDate, setCalendarDate] = useState(new Date(2026, 6, 1));
  const [view, setView] = useState('month');
  const [posts, setPosts] = useState(() => INITIAL_POSTS.map((post) => ({ ...post })));
  const [visibleFormats, setVisibleFormats] = useState(() => [...FORMAT_OPTIONS]);
  const [selectedDay, setSelectedDay] = useState(28);
  const [editingPost, setEditingPost] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const cells = useMemo(() => buildMonthCells(calendarDate.getFullYear(), calendarDate.getMonth()), [calendarDate]);
  const doneCount = posts.filter((post) => post.done).length;
  const pendingCount = posts.length - doneCount;

  const openEditor = (day, post = null) => {
    setSelectedDay(day);
    setEditingPost(post);
    setEditorOpen(true);
  };

  const savePost = (draft) => {
    if (editingPost) {
      setPosts((current) => current.map((post) => (post.id === editingPost.id ? {
        ...post,
        customTitle: draft.title,
        format: draft.format,
        time: draft.time,
        script: draft.script,
      } : post)));
    } else {
      setPosts((current) => [...current, {
        id: `mock-${Date.now()}`,
        day: selectedDay,
        customTitle: draft.title,
        format: draft.format,
        time: draft.time,
        script: draft.script,
        done: false,
      }]);
    }
    setEditorOpen(false);
  };

  const changeMonth = (direction) => {
    setCalendarDate((current) => new Date(current.getFullYear(), current.getMonth() + direction, 1));
  };

  return (
    <section className="product-content-plan-page">
      <header className="plan-page-heading">
        <div>
          <h1>{t('product.plan.title')}</h1>
          <p>{t('product.plan.subtitle')}</p>
        </div>
      </header>

      <div className="plan-stats">
        <article><small>{t('product.plan.stats.total')}</small><strong>{posts.length}</strong></article>
        <article><small>{t('product.plan.stats.scheduled')}</small><strong>{pendingCount}</strong></article>
        <article className="completed"><small>{t('product.plan.stats.completed')}</small><strong>{doneCount}</strong></article>
        <article><small>{t('product.plan.stats.review')}</small><strong>{Math.max(0, pendingCount - 1)}</strong></article>
      </div>

      <article className="plan-calendar-card">
        <header className="plan-calendar-toolbar">
          <div className="plan-date-navigation">
            <button className="today-button" type="button" onClick={() => setCalendarDate(new Date(2026, 6, 1))}>{t('product.plan.actions.today')}</button>
            <button type="button" aria-label={t('product.plan.actions.previous')} onClick={() => changeMonth(-1)}><ChevronLeft size={19} /></button>
            <strong>{formatMonthLabel(calendarDate, language)}</strong>
            <button type="button" aria-label={t('product.plan.actions.next')} onClick={() => changeMonth(1)}><ChevronRight size={19} /></button>
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
          {FORMAT_OPTIONS.map((format) => (
            <button
              className={visibleFormats.includes(format) ? `active ${format.toLowerCase()}` : ''}
              type="button"
              key={format}
              onClick={() => setVisibleFormats((current) => (
                current.includes(format) ? current.filter((item) => item !== format) : [...current, format]
              ))}
            >
              <i />{format}
            </button>
          ))}
          <button className="plan-add-post" type="button" onClick={() => openEditor(selectedDay)}><Plus size={16} />{t('product.plan.actions.newPost')}</button>
        </div>

        {view === 'month' && <MonthView cells={cells} posts={posts} visibleFormats={visibleFormats} onSelectDay={openEditor} onSelectPost={(post) => openEditor(post.day, post)} />}
        {view === 'week' && <WeekView posts={posts} visibleFormats={visibleFormats} onSelectDay={openEditor} onSelectPost={(post) => openEditor(post.day, post)} />}
        {view === 'schedule' && <ScheduleView posts={posts} visibleFormats={visibleFormats} onSelectPost={(post) => openEditor(post.day, post)} />}
      </article>

      <footer className="plan-workflow-note">
        <FileText size={18} />
        <p><strong>{t('product.plan.workflow.title')}</strong>{t('product.plan.workflow.body')}</p>
      </footer>

      {editorOpen && (
        <PostEditor
          key={editingPost?.id || `new-${selectedDay}`}
          post={editingPost}
          selectedDay={selectedDay}
          onClose={() => setEditorOpen(false)}
          onSave={savePost}
          onDelete={() => {
            setPosts((current) => current.filter((post) => post.id !== editingPost.id));
            setEditorOpen(false);
          }}
        />
      )}
    </section>
  );
}
