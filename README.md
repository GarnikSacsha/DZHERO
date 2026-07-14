# Dzhero

AI-продюсер для Instagram: прототип SaaS-платформы, которая помогает блогерам, SMM и локальным бизнесам находить рыночные сигналы, адоптировать рилсы под Украину и доводить контент до продаж.

## OpenAI Build Week: DZHERO Agent Studio Beta

Agent Studio is an isolated multi-agent path that turns one real short-form signal into a brand-safe, shoot-ready Reel and a seven-day content package. It does not replace the existing Signals, Studio, Jeryk, Gemini remix, Brand Brain, or Content Plan flows.

The user starts in one of two ways:

- **Find a trend for me** — the Trend Analyst selects the best existing signal for the business objective.
- **Adapt a Reel** — the user supplies an existing DZHERO signal, a public URL, or a labelled description of what happens in the Reel.

The backend then runs a bounded workflow:

`Trend Analyst → Gemini video evidence → Brand Strategist → Creative Producer → Critic → Content Planner → Jeryk Manager → human approval`

OpenAI Agents SDK runs the manager and specialist agents with strict Zod outputs. A deterministic backend state machine limits turns, output repair, and Critic revision. Gemini is retained as a narrow video-evidence specialist; observations, metadata, and user notes are kept as different evidence types. If video evidence is unavailable, the run pauses and asks the user for context instead of inventing scenes.

The result contains one complete hero Reel, two distinct alternatives, a public-safe agent trace, an evaluation, and exactly seven content-plan days. Nothing is written to the existing Content Plan until the user approves a candidate.

### Local Build Week setup

Create a server-only `.env` from `.env.example` and provide:

```text
OPENAI_API_KEY=...
GEMINI_API_KEY=...
OPENAI_AGENT_MODEL=gpt-5.6
ENABLE_AGENT_STUDIO=true
AGENT_STUDIO_MAX_TURNS=12
AGENT_STUDIO_TIMEOUT_MS=90000
```

Never use a `VITE_` prefix for provider keys and never commit `.env`.

Run the backend and frontend in separate terminals:

```bash
npm run dev:backend
npm run dev
```

Open DZHERO, enter the authenticated workspace, and choose **Agent Studio · Beta** in the sidebar.

Focused verification:

```bash
node scripts/test-agent-studio-schemas.cjs
node scripts/test-agent-studio-run.cjs
node scripts/test-agent-studio-orchestrator.cjs
node scripts/test-agent-studio-video-tool.cjs
node scripts/test-agent-studio-api.mjs
npm run test:agent-studio-ui
npm run build
```

The following command makes one bounded live OpenAI request and therefore consumes API credits. It prints configuration status only, never the key:

```bash
npm run smoke:agent-studio-openai
```

Demo and submission material:

- `docs/hackathon/openai-build-week-demo-script.md`
- `docs/hackathon/openai-build-week-submission.md`

## Что это

Это рабочий MVP с React-интерфейсом и Express backend. Часть интеграций всё ещё работает в preview/demo-режиме, а основная продуктовая логика показывает:

- выбор цели и типа бизнеса;
- глобальный scouting рилсов без РФ;
- база конкурентов;
- банк вирусных рилсов;
- ремикс-студия;
- идеи;
- AI-ассистент;
- запуски;
- контент-план;
- AI Direct / продажи;
- аналитика;
- источники данных;
- MVP / ТЗ экран;
- юридический сейф, бюджет и команда как Phase 2 модули.

## Для кого

- блогер или эксперт, который продает услуги, консультации, курсы, клубы;
- SMM кафе, салона, магазина одежды, e-commerce или локального бизнеса;
- продюсер, который ведет несколько Instagram-аккаунтов;
- команда, которая хочет заменить ручной ресерч, сценаристику и часть SMM-операционки.

## Главная идея

Сервис не должен анализировать личную мемную ленту пользователя как основной источник. Анализ начинается с business brief:

1. цель использования;
2. тип бизнеса;
3. география;
4. ЦА;
5. продукт;
6. Tone of Voice;
7. конкуренты;
8. рынки для анализа;
9. разрешенные источники данных.

## Текущий стек

- React
- Vite
- lucide-react
- CSS без UI-фреймворка
- Express и workspace-scoped API
- OpenAI Agents SDK + Zod для Agent Studio
- Gemini для анализа видео
- JSON/Postgres state abstraction

## Как запустить

```bash
npm install
npm run dev -- --port 5173
```

Открыть:

```text
http://127.0.0.1:5173/
```

## Как запустить backend

```bash
npm run dev:backend
```

API:

```text
http://127.0.0.1:3000
```

Local MVP auth is available for testing:

```text
POST /api/auth/register
POST /api/auth/login
POST /api/auth/demo
GET  /api/auth/me
POST /api/auth/logout
GET  /api/auth/meta/start
GET  /api/auth/meta/callback
```

Проверка API:

```text
GET http://127.0.0.1:3000/api/health
```

## Проверка

```bash
npm run build
```

## Важные файлы

- `src/main.jsx` — вся логика экранов прототипа.
- `src/styles.css` — весь дизайн.
- `src/data/uaMarket.js` — моковые данные.
- `docs/MVP_TZ.md` — подробное MVP / ТЗ.
- `docs/BACKEND.md` — описание первого backend-скелета.
- `docs/PRODUCT_FLOW.md` — наскрізний MVP-flow: від brief до контент-плану і Direct.
- `docs/BACKEND_ROADMAP.md` — покроковий backend-план: моделі, API, Meta Login, sync jobs.
- `backend/server.js` — Express API.
- `backend/data/db.json` — временная JSON-база для MVP.
- `CONTEXT.md` — продуктовый контекст.
- `REQ.md` — требования к будущей разработке.
- `STATUS.md` — текущее состояние.
- `STATE.md` — техническое состояние и решения.

## Что делать дальше

Ближайший правильный шаг — превратить прототип в MVP с реальным хранением данных:

1. заменить JSON storage на настоящую базу;
2. разнести backend routes по модулям;
3. подключить auth/workspaces;
4. проверить Meta Login и реальные permissions;
5. сделать первый sync одного Instagram Business/Creator аккаунта;
6. добавить AI scoring и генерацию идей.
