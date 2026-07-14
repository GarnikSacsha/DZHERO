function normalizeContentPlanBody(value) {
  return String(value || '').trim().slice(0, 12000);
}

module.exports = { normalizeContentPlanBody };
