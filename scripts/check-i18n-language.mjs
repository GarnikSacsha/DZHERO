import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const files = [
  'src/main.jsx',
  'src/i18n.js',
  'src/brandBrain.mjs',
];

const forbiddenUiFragments = [
  'Шаг ',
  'Пропустить тур',
  'Завершить тур',
  'Далее ->',
  'Готовый сценарий',
  'Здесь ИИ',
  'Поиск мировых',
  'Генерация сценария',
  'Календарь и планирование',
  'Автоматизация продаж',
  'распознает намерения',
  'EMAIL ADDRESS',
];

for (const file of files) {
  const source = readFileSync(file, 'utf8');
  for (const fragment of forbiddenUiFragments) {
    assert.equal(
      source.includes(fragment),
      false,
      `${file} still contains mixed-language UI fragment: ${fragment}`,
    );
  }
}
