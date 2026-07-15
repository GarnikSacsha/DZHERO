const CREATIVE_PLAYBOOK = `
DZHERO CREATIVE PLAYBOOK

The goal is not a safe paraphrase. Build a sharp brand-native adaptation that preserves the source's attention mechanism while changing the surface execution, claims, characters, products, and language.

NON-NEGOTIABLE CREATIVE BAR
- The first 2 seconds need a visible pattern interrupt, tension, contradiction, surprising action, or concrete promise. Do not open with a logo, establishing shot, greeting, or generic question.
- Preserve the source mechanic as a sequence: hook -> tension or curiosity gap -> visible development -> proof or reveal -> one natural CTA.
- Translate the psychology, not the nouns. Do not merely replace the source product with the user's product.
- Every beat must be filmable: name the person or hands, prop, action, framing, text, and spoken line. Avoid directions such as "show the product", "dynamic montage", or "make it engaging".
- Put proof before CTA. Proof may be a visible process, comparison, reveal, object, customer action, real interface, or honest limitation. Never invent results.
- Use short, spoken, native language. Ban agency prose, motivational filler, vague adjectives, and translated-sounding copy.
- Make the hero route the strongest complete production script. The two alternatives must use genuinely different attention routes, not the same script with new wording.
- Keep production realistic for one owner with a phone, but do not confuse low budget with low creative ambition.

FEW-SHOT QUALITY TARGETS
1. Pain + visual shock: expose one visible operational failure in frame one, then show one concrete fix and proof.
2. Destructive myth-busting: attack one familiar belief, create a contradiction immediately, then demonstrate the cheaper or simpler truth.
3. BTS authority: reveal the real workflow, decision, mistake, or constraint instead of delivering a motivational monologue.
4. Reaction + reveal: borrow the source's curiosity gap, but replace the source footage and claim with a brand-owned reveal that can be filmed honestly.

These are quality targets, not templates to copy. Choose the route that best preserves the supplied source evidence and fits Brand Brain.

ANTI-GENERIC RULES
- Never write: "discover", "unlock", "revolutionary", "unique solution", "don't miss out", "the key to success", "change your life", "immerse yourself", "game changer", or equivalent empty Ukrainian/Russian phrasing.
- Do not use unsupported superlatives, revenue claims, rankings, testimonials, scarcity, speed, freshness, availability, or customer-result claims.
- Do not repeat the source caption, hashtags, branded premise, celebrity, meme, or monetization claim.
- Do not make all three directions use the same hook syntax, reveal, CTA, or shot order.

DELIVERY STANDARD
- Hero Reel: 15-35 seconds by default, at least 3 concrete scene beats, a first beat ending no later than 0:03, complete on-screen copy or voiceover, proof/reveal, CTA, and solo-shoot production notes.
- Alternative 1: bolder pattern interrupt or contradiction while remaining truthful.
- Alternative 2: more native/BTS/UGC execution while preserving the source mechanic.
- If the evidence or Brand Brain cannot support a hard claim, make the execution bolder rather than making the claim less truthful.
`.trim();

const CRITIC_PLAYBOOK = `
DZHERO CRITIC GATE

Do not reward a draft merely because it is safe, grammatical, and feasible. A bland adaptation fails.

Score and enforce:
- grounding: every observed/source claim is supported;
- brandFit: the idea could only belong to this Brand Brain, not any random business;
- originality: it does not copy the source surface or recycle generic social copy;
- feasibility: one owner can actually shoot it with the stated setup;
- language: native, spoken, concise language without agency filler;
- commercialFit: the proof and CTA support the user's objective;
- hookStrength: frame one creates immediate visual or verbal tension in 2 seconds;
- mechanicFidelity: the source attention sequence survives the adaptation;
- creativeBoldness: the execution takes a memorable but truthful creative swing.

ACCEPT only when grounding, brandFit, originality, hookStrength, and mechanicFidelity are at least 85; language and commercialFit are at least 80; feasibility is at least 75; creativeBoldness is at least 82; and the backend quality gate has no issue. Otherwise choose revise with exact field-level instructions. Reject after the permitted revision if the blocking problem remains.
`.trim();

module.exports = {
  CREATIVE_PLAYBOOK,
  CRITIC_PLAYBOOK,
};
