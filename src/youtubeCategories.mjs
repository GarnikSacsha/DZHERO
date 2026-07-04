export const YOUTUBE_POPULAR_CATEGORIES = [
  { id: 'all', label: 'Усі', categoryId: '' },
  { id: 'memes', label: 'Меми', categoryId: '24' },
  { id: 'comedy', label: 'Гумор', categoryId: '23' },
  { id: 'entertainment', label: 'Розваги', categoryId: '24' },
  { id: 'sports', label: 'Спорт', categoryId: '17' },
  { id: 'fitness-wellness', label: 'Фітнес / wellness', categoryId: '17' },
  { id: 'style', label: 'Стиль і побут', categoryId: '26' },
  { id: 'education', label: 'Освіта', categoryId: '27' },
  { id: 'technology', label: 'Технології', categoryId: '28' },
  { id: 'business', label: 'Бізнес', categoryId: '27' },
  { id: 'beauty', label: 'Краса', categoryId: '26' },
  { id: 'food', label: 'Їжа', categoryId: '26' },
  { id: 'people-blogs', label: 'Люди й блоги', categoryId: '22' },
];

export function getYouTubeCategoryId(categoryIdOrUiId = '') {
  const selected = YOUTUBE_POPULAR_CATEGORIES.find((category) => category.id === categoryIdOrUiId);
  return selected?.categoryId ?? categoryIdOrUiId;
}
