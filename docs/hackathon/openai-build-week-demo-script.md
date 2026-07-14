# DZHERO Agent Studio — sub-three-minute demo

## Demo setup

- Language: English.
- Workspace: a neighborhood Kyiv coffee shop with a completed Brand Brain.
- Feature flag: `ENABLE_AGENT_STUDIO=true`.
- Prepare one public Instagram/TikTok Reel that Apify can resolve, or a public YouTube URL.
- Keep the deterministic coffee-shop fixture available only as a clearly labelled recovery path.
- Open the existing Content Plan in a second tab so the final write can be shown immediately.

## Narration and clicks

### 0:00–0:20 — Problem

**Say:** “A small business owner does not need another blank AI chat. They need to know what to post, why it is grounded, and what to shoot next.”

Show the normal DZHERO sidebar and open **Agent Studio · Beta**. Point out that the existing Signals and Studio are still present; this is an additive workflow.

### 0:20–0:40 — Two ways in

**Say:** “DZHERO can find a trend from our signal bank, or adapt a Reel the owner already found. Both paths converge on the same accountable production team.”

Briefly select **Find a trend for me**, then switch to **Adapt a Reel** for the full hybrid coffee-shop story.

### 0:40–1:00 — Start the hybrid run

Choose the existing Reel signal or paste its URL. Use this objective:

> Bring more weekday morning visits to a neighborhood coffee shop with a low-budget Reel anyone can shoot.

Click **Start agent team**.

**Say:** “Jeryk is the manager. The backend, not a cosmetic timer, moves the run through a bounded state machine.”

### 1:00–1:35 — Real orchestration and evidence

Show the live stage rail:

1. Trend Analyst;
2. Gemini video evidence;
3. Brand Strategist;
4. Creative Producer;
5. Critic;
6. Content Planner;
7. Jeryk review.

**Say:** “Each OpenAI specialist returns a strict structured artifact. For social URLs, Apify resolves the public video and DZHERO transfers it into Gemini Files API. Gemini has one narrow job: evidence. Observed frames, metadata, and user notes stay visibly separate.”

If the video cannot be accessed, show `needs_context`, add one or two factual sentences, and continue. Say explicitly that this is honest degradation, not an AI observation.

### 1:35–2:10 — The differentiator

Open **Grounded evidence** and the public agent trace.

**Say:** “The creative must cite evidence. The Critic gets one revision and can stop the run. In this demo it removes an unsupported ‘best coffee in Kyiv’ claim before anything reaches the owner.”

Show Jeryk’s manager review, the full hero Reel with shot-by-shot scenes, and the two meaningfully different alternatives.

### 2:10–2:35 — Human-directed hybrid

Click **Combine two directions**, select the hero and one alternative, then click **Create hybrid from selected ideas**. Show Hybrid Producer and Critic entering the trace; in an edited demo, cut to the completed hybrid package.

**Say:** “The owner is not forced to accept one AI answer. Two useful directions become a new production script through another bounded OpenAI pass, and Critic checks it again before Jeryk presents it.”

### 2:35–2:50 — From one signal to one week

Scroll to the seven-day plan.

**Say:** “The output is not seven paraphrases of one Reel. One strategic mechanic becomes a connected week across Reels, Stories, and posts.”

Select the final hybrid direction.

### 2:50–3:00 — Human approval and business value

Click **Approve and add 7 days to Content Plan**, then open the existing Content Plan.

**Say:** “Agents can research, adapt, produce, and critique. Only the human can approve the workspace write. One verified signal is now seven shootable days, inside the workflow the business already uses.”

Finish on the populated calendar.

## Recovery path

If a provider is unavailable during judging:

1. Show the classified provider/context error rather than hiding it.
2. Explain the pause/continue behavior.
3. Switch to the coffee-shop fixture and label it **deterministic demo recovery**.
4. Do not describe fixture output as a live provider result.

## Verified timing reference

- Bounded live OpenAI structured-output smoke call on `gpt-5.6`: about 10 seconds in the local verification run.
- Complete deterministic API journey, including Critic revision and approval of seven posts: about 2–3 seconds locally.
- Provider latency for the complete live multi-agent run varies, so the UI reports real stages and never promises a fake fixed duration.
