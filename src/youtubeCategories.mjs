export const YOUTUBE_POPULAR_CATEGORIES = [
  { id: 'all', labelKey: 'signals.youtube.category.all', categoryId: '' },
  { id: 'memes', labelKey: 'signals.youtube.category.memes', categoryId: '24' },
  { id: 'comedy', labelKey: 'signals.youtube.category.comedy', categoryId: '23' },
  { id: 'entertainment', labelKey: 'signals.youtube.category.entertainment', categoryId: '24' },
  { id: 'sports', labelKey: 'signals.youtube.category.sports', categoryId: '17' },
  { id: 'fitness-wellness', labelKey: 'signals.youtube.category.fitnessWellness', categoryId: '17' },
  { id: 'style', labelKey: 'signals.youtube.category.style', categoryId: '26' },
  { id: 'education', labelKey: 'signals.youtube.category.education', categoryId: '27' },
  { id: 'technology', labelKey: 'signals.youtube.category.technology', categoryId: '28' },
  { id: 'business', labelKey: 'signals.youtube.category.business', categoryId: '27' },
  { id: 'beauty', labelKey: 'signals.youtube.category.beauty', categoryId: '26' },
  { id: 'food', labelKey: 'signals.youtube.category.food', categoryId: '26' },
  { id: 'people-blogs', labelKey: 'signals.youtube.category.peopleBlogs', categoryId: '22' },
];

export function getYouTubeCategoryId(categoryIdOrUiId = '') {
  const selected = YOUTUBE_POPULAR_CATEGORIES.find((category) => category.id === categoryIdOrUiId);
  return selected?.categoryId ?? categoryIdOrUiId;
}
