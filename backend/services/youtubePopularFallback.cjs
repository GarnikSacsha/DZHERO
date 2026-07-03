function getYouTubeErrorReasons(error) {
  const errors = error?.payload?.error?.errors;
  return Array.isArray(errors) ? errors.map((item) => String(item.reason || '')).filter(Boolean) : [];
}

function shouldRetryPopularWithoutCategory(error, categoryId) {
  if (!categoryId) return false;
  const message = String(error?.message || error?.payload?.error?.message || '').toLowerCase();
  const reasons = getYouTubeErrorReasons(error);
  return Number(error?.status) === 404
    && (
      reasons.includes('videoChartNotFound')
      || reasons.includes('notFound')
      || message.includes('requested entity was not found')
    );
}

module.exports = {
  shouldRetryPopularWithoutCategory,
};
