import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/main.jsx', 'utf8');
const functions = [...source.matchAll(/^function\s+([A-Za-z0-9_]+)\s*\(/gm)];

function functionSource(name) {
  const index = functions.findIndex((entry) => entry[1] === name);
  assert.notEqual(index, -1, `Missing component: ${name}`);
  const start = functions[index].index;
  const end = functions[index + 1]?.index ?? source.length;
  return source.slice(start, end);
}

const renderTimeLocalized = [
  'JerykLoading',
  'PublicLegalPage',
  'MobilePreviewFrame',
  'ProductTour',
  'LegacyProductTour',
  'BrandScanGate',
  'AuthGate',
  'Sidebar',
  'CleanSidebar',
  'Topbar',
  'MarketFilter',
  'WorkflowRail',
  'StudioEmptyState',
  'HomeDashboard',
  'ProductRoadmap',
  'TikTokSignalsDemo',
  'ViralBank',
  'ApifySignalImportModal',
  'BusinessPlaybooks',
  'StrategyBrain',
  'ReelsTable',
  'SignalsReelsTable',
  'Competitors',
  'AssistantDrawer',
  'BrandScanStudioPanel',
  'RemixStudio',
  'IdeasBoard',
  'AgentPipeline',
  'BrandBrain',
  'BrandBrainStartPage',
  'VideoTaskQueue',
  'CreatorAssistant',
  'LaunchRoadmap',
  'ContentPlan',
  'Analytics',
  'SalesDirect',
  'AnalysisSetup',
  'BillingSettings',
  'DataSources',
  'LegalSafe',
  'BudgetCalculator',
  'TeamHub',
  'QuickModal',
  'ManualReelModal',
];

for (const name of renderTimeLocalized) {
  const body = functionSource(name);
  assert.match(body, /\buseI18n\(\)/, `${name} must use render-time localization`);
}

const forbiddenDirectUi = [
  /notify\(\s*['"`]([^'"`]*[А-Яа-яІіЇїЄєҐґ][^'"`]*)['"`]\s*\)/,
  /(?:placeholder|title|aria-label)="[^"]*[А-Яа-яІіЇїЄєҐґ][^"]*"/,
  /<PageTitle[^>]+(?:title|subtitle)="[^"]*[А-Яа-яІіЇїЄєҐґ][^"]*"/,
];

for (const name of renderTimeLocalized) {
  const body = functionSource(name);
  for (const pattern of forbiddenDirectUi) {
    assert.doesNotMatch(body, pattern, `${name} still contains direct interface literal: ${pattern}`);
  }
}

console.log('i18n component coverage tests passed');
