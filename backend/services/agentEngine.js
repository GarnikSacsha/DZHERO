const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

function compactText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function buildBusinessContext(workspace = {}, snapshot = {}) {
  const brief = workspace.brief || {};
  const reels = snapshot.reels || [];
  const ideas = snapshot.ideas || [];
  const sources = snapshot.sources || [];
  return {
    workspace: {
      name: workspace.name || 'Dzhero workspace',
      mode: workspace.mode || 'own_business',
      marketFocus: workspace.marketFocus || ['ua', 'us', 'eu', 'global'],
    },
    brand: {
      businessType: brief.businessType || brief.niche || 'expert_creator',
      location: brief.location || 'Ukraine',
      audience: brief.audience || 'Ukrainian Instagram audience',
      product: brief.product || 'consultations, launches, content production',
      toneOfVoice: brief.toneOfVoice || 'clear, useful, confident',
      goals: brief.goals || ['find market signals', 'create scripts', 'plan content'],
      stopTopics: brief.stopTopics || ['copying other creators directly', 'unverified promises'],
    },
    recentSignals: reels.slice(0, 5).map((reel) => ({
      title: reel.title || reel.caption || reel.hook,
      market: reel.market,
      score: reel.score,
      hook: reel.hook,
      status: reel.status,
    })),
    recentIdeas: ideas.slice(0, 5).map((idea) => ({
      title: idea.title,
      hook: idea.hook,
      status: idea.status,
      score: idea.score,
    })),
    sources: sources.slice(0, 5).map((source) => ({
      type: source.type,
      label: source.label,
      market: source.market,
      status: source.status,
    })),
  };
}

function buildAgentSystemInstruction(context) {
  return `
You are Dzhero AI Producer, a practical Ukrainian SMM/content producer.

Core rules:
- Do not copy reels directly. Extract the mechanism, adapt it for the user's brand and Ukrainian audience.
- Public users must never be asked for API keys. API keys belong only in the product backend.
- Personal Instagram accounts are not enough for official data access; Creator or Business accounts are required.
- Always keep a human approval step before publishing, replying in Direct on sensitive topics, or generating video.
- If Meta/Instagram API data is missing, clearly say the connection is pending and work from demo/manual context.
- Use Ukrainian by default unless the user asks otherwise.

Business context:
${JSON.stringify(context, null, 2)}

When answering, prefer this structure when useful:
1. Short decision.
2. What the agent would do next.
3. Concrete output: idea, script, shot-list, caption, CTA, or checklist.
4. Risks / what a human should approve.

Keep the first response compact: 600-900 words maximum. If the user asks for many items, give the best 3-5 items and offer to expand a chosen one.
`.trim();
}

function fallbackAgentReply(message, context) {
  const brand = context.brand || {};
  const text = compactText(message);
  return [
    `Ок, беру як AI-продюсер Dzhero: ${text || 'потрібен контентний крок'}.`,
    `Для ${brand.businessType || 'бренду'} я б почав з механіки: проблема аудиторії -> просте рішення -> доказ -> CTA в Direct.`,
    `Наступний вихід: 1 сценарій Reels, 1 shot-list, caption і CTA під ${brand.location || 'Україну'}.`,
    'Перед публікацією людина має перевірити обіцянки, юридичні формулювання і тон бренду.',
  ].join('\n\n');
}

async function generateAgentReply({ message, history = [], workspace, snapshot }) {
  const context = buildBusinessContext(workspace, snapshot);
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash';

  if (!apiKey) {
    return {
      provider: 'fallback',
      model: 'local-template',
      text: fallbackAgentReply(message, context),
      context,
    };
  }

  const contents = [
    ...history.slice(-8).map((item) => ({
      role: item.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: compactText(item.text) }],
    })),
    {
      role: 'user',
      parts: [{ text: compactText(message) }],
    },
  ].filter((item) => item.parts[0].text);

  const response = await fetch(`${GEMINI_API_BASE}/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      systemInstruction: {
        parts: [{ text: buildAgentSystemInstruction(context) }],
      },
      generationConfig: {
        temperature: 0.65,
        topP: 0.9,
        maxOutputTokens: 1600,
      },
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const messageText = payload?.error?.message || `Gemini API HTTP ${response.status}`;
    const error = new Error(messageText);
    error.payload = payload;
    throw error;
  }

  const text = payload.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || '')
    .join('')
    .trim();

  return {
    provider: 'gemini',
    model,
    text: text || fallbackAgentReply(message, context),
    context,
  };
}

module.exports = {
  buildBusinessContext,
  generateAgentReply,
};
