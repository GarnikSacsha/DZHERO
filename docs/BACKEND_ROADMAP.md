# Dzhero: backend roadmap

Цей документ описує, як перетворити поточний prototype backend на MVP backend. Він не замінює `docs/BACKEND.md`, а деталізує наступні інженерні кроки.

## Поточний стан

Зараз backend є skeleton API:

- Express server;
- local MVP auth;
- demo workspace;
- JSON storage у `backend/data/db.json`;
- базові endpoints для workspaces, brief, competitors, reels та ideas;
- Meta OAuth URL/callback skeleton;
- mock/demo дані для frontend.

Цього достатньо для прототипу, але недостатньо для реального користувача.

## Ціль backend MVP

Backend має забезпечити один стабільний сценарій:

`auth -> workspace -> brief -> sources -> competitors -> reels -> ideas -> remix -> content plan -> leads -> analytics`

## Архітектурні модулі

### Auth

Потрібно мати нормальні sessions, logout, middleware `requireAuth`, прив'язку user -> workspace і структуру, яка дозволить підключити Meta Login без переписування всього auth.

### Workspaces

Workspace є головною одиницею продукту.

Поля:

- owner user id;
- назва бізнесу;
- режим використання;
- тип бізнесу;
- ринки;
- мова;
- статус onboarding;
- активний business brief.

### Business brief

Brief є базою аналізу. Без нього система не має будувати стратегію.

Поля:

- businessType;
- niche;
- product;
- city;
- targetAudience;
- toneOfVoice;
- goals;
- stopTopics;
- markets;
- keywords;
- competitorsSeed;
- dataSourceMode.

### Sources

Джерела даних:

- `instagram_business_account` - основне дозволене джерело;
- `manual_competitors` - handles, які додав користувач;
- `ai_suggested_competitors` - кандидати від системи;
- `keyword_market_scan` - пошук трендів за нішою і ринком;
- `personal_feed_optional` - не базове джерело, тільки inspiration.

### Competitors

Потрібен CRUD: додати competitor, змінити ринок/нішу, вимкнути, позначити як пріоритетний, зберігати останні сигнали.

### Reels / posts

Для кожного content item:

- source account;
- market;
- format;
- caption;
- transcript;
- metrics;
- hook;
- score;
- qualityGate;
- copyRisk;
- status.

### Ideas

Ідея має бути окремою сутністю, а не просто текстом у frontend.

Поля:

- sourceContentId;
- angle;
- hook;
- summary;
- status;
- score;
- market;
- fitReason;
- rejectReason;
- linkedRemixId.

Статуси: `draft`, `needs_review`, `approved`, `rejected`, `in_remix`, `in_plan`.

### Remix

Remix має зберігати версії.

Поля:

- ideaId;
- scenario;
- caption;
- cta;
- storyVersion;
- postVersion;
- directReplyVersion;
- riskNotes;
- version;
- approvedByUser.

### Content plan

Поля:

- workspaceId;
- ideaId;
- remixId;
- date;
- format;
- status;
- owner;
- resultMetrics.

Статуси: `selected`, `batch`, `filmed`, `published`, `needs_review`.

### AI Direct / Leads

Lead:

- workspaceId;
- sourceContentId;
- instagramUserId або placeholder;
- message;
- intent;
- crmTag;
- temperature;
- status;
- handoffRequired;
- aiReplyDraft.

Intent: `purchase`, `support`, `complaint`, `compliment`, `unknown`.

Handoff обов'язковий для оплат, юридичних питань, скарг, повернень, нестандартних обіцянок і ризикових ніш.

### AI memory

AI має запам'ятовувати структуровані рішення: Tone of Voice, approved hooks, rejected topics, brand rules, user decisions, examples that worked і examples that failed.

## API milestones

### Milestone A: data model

- Перенести JSON storage на SQLite або Postgres.
- Додати migrations.
- Описати schema.
- Додати repository/service layer.

### Milestone B: workspace onboarding

```text
POST /api/workspaces
GET  /api/workspaces
GET  /api/workspaces/:id
PUT  /api/workspaces/:id/brief
POST /api/workspaces/:id/onboarding/complete
```

### Milestone C: sources and competitors

```text
GET    /api/workspaces/:id/sources
POST   /api/workspaces/:id/sources
GET    /api/workspaces/:id/competitors
POST   /api/workspaces/:id/competitors
PATCH  /api/workspaces/:id/competitors/:competitorId
DELETE /api/workspaces/:id/competitors/:competitorId
```

### Milestone D: content pipeline

```text
GET  /api/workspaces/:id/reels
POST /api/workspaces/:id/reels/import
POST /api/workspaces/:id/reels/:reelId/analyze
GET  /api/workspaces/:id/ideas
POST /api/workspaces/:id/ideas
PATCH /api/workspaces/:id/ideas/:ideaId
POST /api/workspaces/:id/ideas/:ideaId/remix
POST /api/workspaces/:id/content-plan
```

### Milestone E: AI Direct beta

```text
GET  /api/workspaces/:id/leads
POST /api/workspaces/:id/leads/classify
PATCH /api/workspaces/:id/leads/:leadId
POST /api/workspaces/:id/leads/:leadId/handoff
```

### Milestone F: Meta Login sandbox

Потрібно реалізувати:

- exchange code -> access token;
- debug token;
- отримання доступних pages;
- отримання linked Instagram Business/Creator accounts;
- збереження token metadata;
- sync status;
- token refresh/expiration handling;
- permission screen у frontend.

## Sync jobs

Таблиця або collection `sync_jobs`:

- id;
- workspaceId;
- sourceId;
- type;
- status;
- startedAt;
- finishedAt;
- error;
- nextRunAt;
- payload.

Типи:

- import_competitors;
- import_reels;
- import_comments;
- import_insights;
- analyze_content;
- generate_ideas;
- classify_leads.

## Safety and compliance

Backend має одразу закласти обмеження:

- не зберігати зайві персональні дані;
- не обіцяти доступ до даних, які Meta API не дозволяє;
- логувати AI-рішення;
- мати approve-before-send режим для Direct;
- мати rate limits;
- мати human delays для автоматичних відповідей;
- мати ручний handoff.

## Найближчі 3 технічні задачі

1. Замінити `backend/data/db.json` на реальне сховище або repository layer, щоб потім легко перейти на БД.
2. Доробити workspace onboarding: business brief, mode, markets, competitors seed.
3. Доробити Meta Login sandbox до етапу, де ми бачимо список доступних Instagram Business/Creator акаунтів.
