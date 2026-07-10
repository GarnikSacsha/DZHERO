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

function getYouTubeShortsSearchQueries(categoryId = '') {
  const normalizedCategoryId = String(categoryId || '').trim();
  const categoryQueries = {
    17: ['sports shorts', 'fitness shorts', 'workout shorts'],
    22: ['daily vlog shorts', 'storytime shorts', 'people shorts'],
    23: ['funny shorts', 'comedy shorts', 'viral funny shorts'],
    24: ['viral shorts', 'entertainment shorts', 'funny shorts'],
    26: ['lifestyle shorts', 'food shorts', 'beauty shorts'],
    27: ['educational shorts', 'business shorts', 'tips shorts'],
    28: ['tech shorts', 'ai tools shorts', 'productivity shorts'],
  };
  const queries = categoryQueries[normalizedCategoryId] || ['viral shorts', 'trending shorts', 'youtube shorts'];
  return [...new Set(queries)];
}

module.exports = {
  getYouTubeShortsSearchQueries,
  shouldRetryPopularWithoutCategory,
};
