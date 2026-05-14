# Requirements

## Functional requirements for MVP

### 1. Workspace

- User can create a workspace for own business or client.
- Workspace stores business brief.
- Workspace stores selected markets and source preferences.

### 2. Business brief

Must include:

- use case: own business, SMM client, competitor monitoring, niche trends;
- business type;
- location/geography;
- audience;
- product/service;
- Tone of Voice;
- goals;
- stop topics;
- competitor handles;
- markets for scouting.

### 3. Sources

MVP can start with manual/demo data, but architecture must support:

- Meta Graph API;
- Instagram Business/Creator account;
- competitors;
- reels/posts;
- comments;
- insights where allowed;
- stories signals where allowed;
- Direct where allowed.

### 4. Competitors

- Add competitor by handle.
- Store market, niche, score, status.
- Show latest signals and best performing content.

### 5. Viral reels bank

- Filter by market.
- Search by hook/account/niche.
- Sort by score/views.
- Show score, metrics, status tags.

### 6. Remix studio

- Show source reel.
- Show transcript/description.
- Generate Ukrainian adaptation.
- Produce hooks, CTA, remix logic.
- Avoid cloning original content.

### 7. Ideas

- Store idea title, source, hook, score, effort, status.
- Send idea to remix.
- Send idea to content plan.

### 8. Content plan

- Calendar/list view.
- Add planned posts.
- Store status: draft, selected, in batch, filmed, published.

### 9. AI Direct basics

Intent categories:

- purchase;
- support;
- complaint;
- compliment;
- unknown / human needed.

CRM tags:

- ready to buy;
- needs consultation;
- price question;
- technical question;
- risk/complaint.

Rules:

- FAQ can be automated.
- Payment, refund, legal, complaint and unusual promises must go to human.

### 10. Analytics

MVP can be simple, but future analytics should connect:

- content item;
- reach;
- leads;
- hot leads;
- Direct conversion;
- CAC;
- ROI.

## Non-functional requirements

- Ukrainian interface.
- Ukraine-first final output.
- No РФ as visible source/category.
- Responsive layout.
- Stable cards and icons.
- No overlapping text.
- Build must pass with `npm run build`.

