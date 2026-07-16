import React, { useMemo } from 'react';
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Plus,
} from 'lucide-react';

export function toLocalDateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function fromLocalDateKey(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day);
  return Number.isNaN(date.getTime())
    || date.getFullYear() !== year
    || date.getMonth() !== month
    || date.getDate() !== day
    ? null
    : date;
}

export function addCalendarDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

export function startOfCalendarWeek(date, weekStartsOn = 1) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offset = (next.getDay() - weekStartsOn + 7) % 7;
  next.setDate(next.getDate() - offset);
  return next;
}

export function resolveContentPostDate(post, fallbackMonth) {
  const stored = fromLocalDateKey(post?.date);
  if (stored) return stored;
  const fallback = fallbackMonth instanceof Date ? fallbackMonth : new Date();
  const daysInMonth = new Date(fallback.getFullYear(), fallback.getMonth() + 1, 0).getDate();
  return new Date(
    fallback.getFullYear(),
    fallback.getMonth(),
    Math.min(daysInMonth, Math.max(1, Number(post?.day) || 1)),
  );
}

function formatClassName(format) {
  const normalized = String(format || '').toLowerCase();
  if (normalized.includes('story')) return 'format-stories';
  if (normalized.includes('short')) return 'format-shorts';
  if (normalized.includes('tik')) return 'format-tiktok';
  if (normalized.includes('video')) return 'format-video';
  if (normalized.includes('post')) return 'format-post';
  if (normalized.includes('reel')) return 'format-reels';
  return 'format-custom';
}

function getWeekdayLabels(locale, weekStartsOn, narrow = false) {
  const sunday = new Date(2026, 0, 4);
  return Array.from({ length: 7 }, (_, index) => {
    const date = addCalendarDays(sunday, (weekStartsOn + index) % 7);
    return new Intl.DateTimeFormat(locale, { weekday: narrow ? 'narrow' : 'short' }).format(date);
  });
}

function CalendarEventChip({ post, compact = false, onEdit, onToggleDone }) {
  return (
    <button
      className={`gcal-event ${formatClassName(post.format)} ${post.done ? 'done' : ''}`}
      type="button"
      draggable
      onDragStart={(event) => {
        event.stopPropagation();
        event.dataTransfer.setData('text/plain', post.id);
      }}
      onClick={(event) => {
        event.stopPropagation();
        onEdit(post);
      }}
      title={`${post.time} · ${post.format} · ${post.title}`}
    >
      {!compact && (
        <span
          className="gcal-event-check"
          role="checkbox"
          aria-checked={post.done}
          tabIndex={0}
          onClick={(event) => {
            event.stopPropagation();
            onToggleDone(post.id);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              event.stopPropagation();
              onToggleDone(post.id);
            }
          }}
        >
          {post.done && <Check size={10} />}
        </span>
      )}
      <span>{post.time}</span>
      <strong>{post.title}</strong>
    </button>
  );
}

export default function ContentCalendar({
  language,
  locale,
  posts,
  formats,
  calendarDate,
  selectedDate,
  view,
  visibleFormats,
  onCalendarDateChange,
  onSelectedDateChange,
  onViewChange,
  onCreate,
  onEdit,
  onMove,
  onToggleDone,
  onToggleFormat,
}) {
  const today = new Date();
  const todayKey = toLocalDateKey(today);
  const selectedKey = toLocalDateKey(selectedDate);
  const weekStartsOn = language === 'en' ? 0 : 1;
  const weekdayLabels = getWeekdayLabels(locale, weekStartsOn);
  const miniWeekdayLabels = getWeekdayLabels(locale, weekStartsOn, true);
  const visibleFormatSet = useMemo(() => new Set(visibleFormats), [visibleFormats]);
  const visiblePosts = useMemo(() => posts.filter((post) => visibleFormatSet.has(post.format)), [posts, visibleFormatSet]);
  const postsByDate = useMemo(() => {
    const groups = new Map();
    visiblePosts.forEach((post) => {
      const key = post.date;
      groups.set(key, [...(groups.get(key) || []), post].sort((a, b) => String(a.time).localeCompare(String(b.time))));
    });
    return groups;
  }, [visiblePosts]);

  const monthCells = useMemo(() => {
    const first = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), 1);
    const start = startOfCalendarWeek(first, weekStartsOn);
    return Array.from({ length: 42 }, (_, index) => {
      const date = addCalendarDays(start, index);
      return {
        date,
        key: toLocalDateKey(date),
        inMonth: date.getMonth() === calendarDate.getMonth(),
      };
    });
  }, [calendarDate, weekStartsOn]);

  const weekDays = useMemo(() => {
    const start = startOfCalendarWeek(selectedDate, weekStartsOn);
    return Array.from({ length: 7 }, (_, index) => addCalendarDays(start, index));
  }, [selectedDate, weekStartsOn]);

  const scheduleGroups = useMemo(() => {
    const sorted = [...visiblePosts].sort((first, second) => (
      `${first.date} ${first.time}`.localeCompare(`${second.date} ${second.time}`)
    ));
    return sorted.reduce((groups, post) => {
      const last = groups.at(-1);
      if (last?.key === post.date) last.posts.push(post);
      else groups.push({ key: post.date, date: fromLocalDateKey(post.date), posts: [post] });
      return groups;
    }, []);
  }, [visiblePosts]);

  const monthLabel = calendarDate.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  const selectedMonthLabel = selectedDate.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  const timezoneOffset = -today.getTimezoneOffset() / 60;
  const timezoneLabel = `GMT${timezoneOffset >= 0 ? '+' : ''}${timezoneOffset}`;
  const viewLabels = language === 'en'
    ? { month: 'Month', week: 'Week', schedule: 'Schedule' }
    : { month: 'Місяць', week: 'Тиждень', schedule: 'Розклад' };
  const goToToday = () => {
    const next = new Date();
    onCalendarDateChange(new Date(next.getFullYear(), next.getMonth(), 1));
    onSelectedDateChange(next);
  };
  const changePeriod = (direction) => {
    if (view === 'month') {
      const next = new Date(calendarDate.getFullYear(), calendarDate.getMonth() + direction, 1);
      onCalendarDateChange(next);
      onSelectedDateChange(new Date(next.getFullYear(), next.getMonth(), 1));
      return;
    }
    const amount = view === 'week' ? 7 * direction : 30 * direction;
    const next = addCalendarDays(selectedDate, amount);
    onSelectedDateChange(next);
    onCalendarDateChange(new Date(next.getFullYear(), next.getMonth(), 1));
  };
  const changeMonth = (direction) => {
    const next = new Date(calendarDate.getFullYear(), calendarDate.getMonth() + direction, 1);
    onCalendarDateChange(next);
    onSelectedDateChange(new Date(next.getFullYear(), next.getMonth(), 1));
  };
  const selectDate = (date) => {
    onSelectedDateChange(date);
    if (date.getMonth() !== calendarDate.getMonth() || date.getFullYear() !== calendarDate.getFullYear()) {
      onCalendarDateChange(new Date(date.getFullYear(), date.getMonth(), 1));
    }
  };

  return (
    <div className="gcal-shell">
      <aside className="gcal-sidebar">
        <button className="gcal-create" type="button" onClick={() => onCreate(selectedDate)}>
          <Plus size={20} />
          <span>{language === 'en' ? 'Create' : 'Створити'}</span>
        </button>

        <section className="gcal-mini">
          <div className="gcal-mini-head">
            <strong>{selectedMonthLabel}</strong>
            <div>
              <button type="button" aria-label="Previous month" onClick={() => changeMonth(-1)}><ChevronLeft size={15} /></button>
              <button type="button" aria-label="Next month" onClick={() => changeMonth(1)}><ChevronRight size={15} /></button>
            </div>
          </div>
          <div className="gcal-mini-weekdays">
            {miniWeekdayLabels.map((label, index) => <span key={`${label}-${index}`}>{label}</span>)}
          </div>
          <div className="gcal-mini-grid">
            {monthCells.map((cell) => (
              <button
                className={[
                  !cell.inMonth ? 'outside' : '',
                  cell.key === todayKey ? 'today' : '',
                  cell.key === selectedKey ? 'selected' : '',
                ].filter(Boolean).join(' ')}
                type="button"
                key={cell.key}
                onClick={() => selectDate(cell.date)}
              >
                {cell.date.getDate()}
              </button>
            ))}
          </div>
        </section>

        <section className="gcal-calendars">
          <small>{language === 'en' ? 'Content formats' : 'Формати контенту'}</small>
          {formats.map((format) => (
            <label key={format}>
              <input
                type="checkbox"
                checked={visibleFormatSet.has(format)}
                onChange={() => onToggleFormat(format)}
              />
              <i className={formatClassName(format)} />
              <span>{format}</span>
            </label>
          ))}
        </section>
      </aside>

      <section className="gcal-main">
        <header className="gcal-toolbar">
          <div className="gcal-toolbar-nav">
            <button className="gcal-today" type="button" onClick={goToToday}>
              {language === 'en' ? 'Today' : 'Сьогодні'}
            </button>
            <button type="button" aria-label="Previous period" onClick={() => changePeriod(-1)}><ChevronLeft size={18} /></button>
            <button type="button" aria-label="Next period" onClick={() => changePeriod(1)}><ChevronRight size={18} /></button>
            <h2>{view === 'month' ? monthLabel : selectedMonthLabel}</h2>
          </div>
          <div className="gcal-view-switcher" role="tablist" aria-label={language === 'en' ? 'Calendar view' : 'Вигляд календаря'}>
            {Object.entries(viewLabels).map(([key, label]) => (
              <button
                className={view === key ? 'active' : ''}
                type="button"
                role="tab"
                aria-selected={view === key}
                key={key}
                onClick={() => onViewChange(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </header>

        {view === 'month' && (
          <div className="gcal-month-scroll">
            <div className="gcal-month calendar-grid">
              <div className="gcal-month-weekdays">
                {weekdayLabels.map((label, index) => <span key={`${label}-${index}`}>{label}</span>)}
              </div>
              <div className="gcal-month-days">
                {monthCells.map((cell) => {
                  const dayPosts = postsByDate.get(cell.key) || [];
                  return (
                    <div
                      className={[
                        'calendar-day',
                        'gcal-day',
                        !cell.inMonth ? 'outside' : '',
                        cell.key === todayKey ? 'today' : '',
                        cell.key === selectedKey ? 'selected' : '',
                      ].filter(Boolean).join(' ')}
                      key={cell.key}
                      onClick={() => {
                        selectDate(cell.date);
                        onCreate(cell.date);
                      }}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault();
                        const postId = event.dataTransfer.getData('text/plain');
                        if (postId) onMove(postId, cell.date);
                      }}
                    >
                      <button
                        className="gcal-day-number"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          selectDate(cell.date);
                        }}
                      >
                        {cell.date.getDate()}
                      </button>
                      <div className="calendar-posts gcal-day-events">
                        {dayPosts.slice(0, 3).map((post) => (
                          <CalendarEventChip
                            post={post}
                            compact
                            key={post.id}
                            onEdit={() => onEdit(post)}
                            onToggleDone={onToggleDone}
                          />
                        ))}
                        {dayPosts.length > 3 && (
                          <button
                            className="gcal-more"
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              selectDate(cell.date);
                              onViewChange('schedule');
                            }}
                          >
                            +{dayPosts.length - 3} {language === 'en' ? 'more' : 'ще'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {view === 'week' && (
          <div className="gcal-week-scroll">
            <div className="gcal-week">
              <div className="gcal-week-head">
                <span className="gcal-time-zone">{timezoneLabel}</span>
                {weekDays.map((date) => {
                  const key = toLocalDateKey(date);
                  return (
                    <button
                      className={`${key === todayKey ? 'today' : ''} ${key === selectedKey ? 'selected' : ''}`}
                      type="button"
                      key={key}
                      onClick={() => selectDate(date)}
                    >
                      <small>{new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(date)}</small>
                      <strong>{date.getDate()}</strong>
                    </button>
                  );
                })}
              </div>
              <div className="gcal-week-grid">
                <div className="gcal-time-axis">
                  {Array.from({ length: 14 }, (_, index) => (
                    <span style={{ top: `${index * 58}px` }} key={index}>{String(index + 8).padStart(2, '0')}:00</span>
                  ))}
                </div>
                {weekDays.map((date) => {
                  const key = toLocalDateKey(date);
                  const dayPosts = postsByDate.get(key) || [];
                  return (
                    <div
                      className="gcal-week-column"
                      key={key}
                      onClick={(event) => {
                        if (event.target.closest('.gcal-week-event')) return;
                        const rect = event.currentTarget.getBoundingClientRect();
                        const minutes = Math.max(0, Math.min(13 * 60, ((event.clientY - rect.top) / 58) * 60));
                        const rounded = Math.round(minutes / 30) * 30;
                        const hour = 8 + Math.floor(rounded / 60);
                        const minute = rounded % 60;
                        selectDate(date);
                        onCreate(date, `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
                      }}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault();
                        const postId = event.dataTransfer.getData('text/plain');
                        if (postId) onMove(postId, date);
                      }}
                    >
                      {Array.from({ length: 14 }, (_, index) => <i style={{ top: `${index * 58}px` }} key={index} />)}
                      {dayPosts.map((post) => {
                        const [hour, minute] = String(post.time || '10:00').split(':').map(Number);
                        const top = Math.max(0, Math.min(13 * 58, ((hour - 8) + (minute || 0) / 60) * 58));
                        return (
                          <div className="gcal-week-event" style={{ top: `${top}px` }} key={post.id}>
                            <CalendarEventChip post={post} onEdit={() => onEdit(post)} onToggleDone={onToggleDone} />
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {view === 'schedule' && (
          <div className="gcal-schedule">
            {scheduleGroups.length ? scheduleGroups.map((group) => (
              <section className={group.key === selectedKey ? 'selected' : ''} key={group.key}>
                <header>
                  <strong>{group.date?.getDate()}</strong>
                  <div>
                    <small>{group.date && new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(group.date)}</small>
                    <span>{group.date && new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(group.date)}</span>
                  </div>
                </header>
                <div>
                  {group.posts.map((post) => (
                    <CalendarEventChip post={post} key={post.id} onEdit={() => onEdit(post)} onToggleDone={onToggleDone} />
                  ))}
                </div>
              </section>
            )) : (
              <div className="gcal-empty-state">
                <CalendarDays size={28} />
                <strong>{language === 'en' ? 'No scheduled content' : 'Немає запланованого контенту'}</strong>
                <p>{language === 'en' ? 'Create a post or enable another content format.' : 'Створи пост або увімкни інший формат контенту.'}</p>
                <button type="button" onClick={() => onCreate(selectedDate)}><Plus size={16} />{language === 'en' ? 'Create' : 'Створити'}</button>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
