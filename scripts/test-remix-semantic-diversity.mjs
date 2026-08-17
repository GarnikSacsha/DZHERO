import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { SEMANTIC_ANGLES, assessRemixQuality, normalizeText } = require('../backend/services/remixQuality.cjs');
const {
  generateHighFidelityFallback,
  generateValidatedProviderResult,
} = require('../backend/services/remixEngine.js');

const benchmark = JSON.parse(await readFile(
  new URL('./fixtures/remix-semantic-diversity-benchmark.json', import.meta.url),
  'utf8',
));
const collapsedOutput = JSON.parse(await readFile(
  new URL('./fixtures/remix-semantic-collapse-output.json', import.meta.url),
  'utf8',
));

const ACTION = /(покаж\p{L}*|показ\p{L}*|відкри\p{L}*|закри\p{L}*|зніми\p{L}*|запиш\p{L}*|запис\p{L}*|поклади\p{L}*|переведи\p{L}*|вказ\p{L}*|порівн\p{L}*|виділ\p{L}*|розклади\p{L}*|розрив\p{L}*|натис\p{L}*|трима\p{L}*|кида\p{L}*)/u;
const LOW_BUDGET = /(телефон\p{L}*|один спікер|без студі\p{L}*|реальн\p{L}* простор\p{L}*|смартфон\p{L}*)/u;
const HIGH_COST = /(cgi|дрон\p{L}*|знімальн\p{L}* груп\p{L}*|оренд\p{L}* студі\p{L}*|масовк\p{L}*)/u;

function remixVisibleText(remix = {}) {
  return [
    remix.title,
    remix.hook,
    ...(Array.isArray(remix.visualFlow) ? remix.visualFlow.flatMap((step) => [
      step?.actionDescription,
      step?.onScreenText,
      step?.audioVoiceover,
    ]) : []),
    remix.cta,
  ].filter(Boolean).join(' ');
}

function packageVisibleText(result = {}) {
  return (Array.isArray(result.remixes) ? result.remixes : [])
    .map(remixVisibleText)
    .join(' ');
}

function matchesGroup(text, group) {
  const normalized = normalizeText(text);
  return group.some((term) => normalized.includes(normalizeText(term)));
}

function countMatchedGroups(text, groups = []) {
  return groups.filter((group) => matchesGroup(text, group)).length;
}

function inferAngle(remix = {}) {
  return SEMANTIC_ANGLES.includes(remix?.semanticAngle) ? remix.semanticAngle : 'unclassified';
}

function tokenSet(value) {
  return new Set(normalizeText(value).split(' ').filter((token) => token.length >= 4));
}

function jaccard(left, right) {
  const a = tokenSet(left);
  const b = tokenSet(right);
  const union = new Set([...a, ...b]);
  if (!union.size) return 1;
  return [...a].filter((token) => b.has(token)).length / union.size;
}

function maximumHeadlineSimilarity(remixes) {
  let maximum = 0;
  for (let left = 0; left < remixes.length; left += 1) {
    for (let right = left + 1; right < remixes.length; right += 1) {
      maximum = Math.max(
        maximum,
        jaccard(
          `${remixes[left]?.title || ''} ${remixes[left]?.hook || ''}`,
          `${remixes[right]?.title || ''} ${remixes[right]?.hook || ''}`,
        ),
      );
    }
  }
  return maximum;
}

function repeatsOverpoweringTopic(remixes, topicGroups) {
  return topicGroups.some((group) => remixes.filter((remix) => {
    const headline = remixVisibleText({ title: remix?.title, hook: remix?.hook });
    return countMatchedGroups(headline, [group]) > 0
      && group.filter((term) => normalizeText(headline).includes(normalizeText(term))).length >= 2;
  }).length >= 2);
}

function assessSemanticPackage(result, fixture) {
  const remixes = Array.isArray(result?.remixes) ? result.remixes : [];
  const exactThree = remixes.length === 3;
  const variantDetails = remixes.map((remix) => {
    const visible = remixVisibleText(remix);
    const conflictGroups = countMatchedGroups(visible, fixture.conflictAnchorGroups);
    const mechanicGroups = countMatchedGroups(visible, fixture.mechanicAnchorGroups);
    const brandGroups = countMatchedGroups(visible, benchmark.brandAnchorGroups);
    const flow = Array.isArray(remix.visualFlow) ? remix.visualFlow : [];
    const actionableScenes = flow.filter((step) => ACTION.test(normalizeText(step?.actionDescription))).length;
    return {
      angle: inferAngle(remix),
      conflictGroups,
      mechanicGroups,
      faithful: conflictGroups >= 1 && mechanicGroups >= 1,
      brandGroups,
      brandPresent: brandGroups >= 2,
      feasible: flow.length >= 3 && actionableScenes >= 2,
    };
  });
  const angles = variantDetails.map(({ angle }) => angle);
  const uniqueAngles = new Set(angles.filter((angle) => angle !== 'unclassified')).size;
  const maxHeadlineSimilarity = maximumHeadlineSimilarity(remixes);
  const repeatedOverpoweringTopic = repeatsOverpoweringTopic(remixes, benchmark.overpoweringTopicGroups);
  const feasibilityText = normalizeText(result?.viabilityFilter?.productionFeasibility);
  const feasibilityClaim = Boolean(
    result?.viabilityFilter?.isAdaptable === true
    && LOW_BUDGET.test(feasibilityText)
    && !HIGH_COST.test(feasibilityText)
  );
  const sourceFaithful = exactThree && variantDetails.every(({ faithful }) => faithful);
  const angleSeparated = exactThree && uniqueAngles === 3;
  const headlineUnique = exactThree
    && new Set(remixes.map((remix) => normalizeText(`${remix?.title || ''} ${remix?.hook || ''}`))).size === 3
    && maxHeadlineSimilarity <= 0.72
    && !repeatedOverpoweringTopic;
  const brandPresent = exactThree && variantDetails.every(({ brandPresent: present }) => present);
  const brandBalanced = brandPresent && sourceFaithful && !repeatedOverpoweringTopic;
  const productionFeasible = feasibilityClaim && variantDetails.every(({ feasible }) => feasible);

  return {
    exactThree,
    sourceFaithful,
    faithfulVariants: variantDetails.filter(({ faithful }) => faithful).length,
    angleSeparated,
    angles,
    headlineUnique,
    maxHeadlineSimilarity,
    repeatedOverpoweringTopic,
    brandPresent,
    brandBalanced,
    productionFeasible,
    ok: exactThree
      && sourceFaithful
      && angleSeparated
      && headlineUnique
      && brandBalanced
      && productionFeasible,
  };
}

function pass(value) {
  return value ? 'PASS' : 'FAIL';
}

function printCase(label, contract, semantic) {
  console.log([
    label,
    `validator=${pass(contract.ok)}`,
    `exact3=${pass(semantic.exactThree)}`,
    `source=${pass(semantic.sourceFaithful)}(${semantic.faithfulVariants}/3)`,
    `angles=${pass(semantic.angleSeparated)}(${semantic.angles.join(',')})`,
    `headline=${pass(semantic.headlineUnique)}`,
    `brand=${pass(semantic.brandPresent)}`,
    `balance=${pass(semantic.brandBalanced)}`,
    `feasible=${pass(semantic.productionFeasible)}`,
    `overall=${pass(semantic.ok)}`,
  ].join(' | '));
}

assert.equal(benchmark.cases.length, 5, 'benchmark must contain the five required source categories');
assert.deepEqual(
  new Set(benchmark.cases.map(({ category }) => category)),
  new Set(['AI/technology', 'business/process', 'education', 'emotional story', 'visual/minimal speech']),
);

console.log('Remix semantic-diversity offline benchmark');
console.log(`Evidence boundary: ${benchmark.evidenceBoundary}`);
console.log('');
console.log('CURRENT DETERMINISTIC FALLBACK PROBE');

const fallbackRuns = benchmark.cases.map((fixture) => {
  const result = generateHighFidelityFallback(fixture.globalInsight, benchmark.brandBrain);
  const contract = assessRemixQuality(result, {
    globalInsight: fixture.globalInsight,
    businessBrief: benchmark.brandBrain,
  });
  const semantic = assessSemanticPackage(result, fixture);
  printCase(`${fixture.id} [${fixture.category}]`, contract, semantic);
  return { fixture, result, contract, semantic };
});

const visibleFingerprints = new Set(fallbackRuns.map(({ result }) => normalizeText(packageVisibleText(result))));
const fallbackValidatorPasses = fallbackRuns.filter(({ contract }) => contract.ok).length;
const fallbackSemanticPasses = fallbackRuns.filter(({ semantic }) => semantic.ok).length;

console.log(`cross-source visible signatures=${pass(visibleFingerprints.size === benchmark.cases.length)}(${visibleFingerprints.size}/${benchmark.cases.length} unique)`);
console.log(`fallback contract acceptance=${fallbackValidatorPasses}/${benchmark.cases.length}`);
console.log(`fallback semantic acceptance=${fallbackSemanticPasses}/${benchmark.cases.length}`);

assert.equal(fallbackValidatorPasses, 5, 'all deterministic fallback packages must pass production validation');
assert.equal(visibleFingerprints.size, 5, 'fallback packages must visibly differ across all source contexts');
assert.equal(fallbackSemanticPasses, 5, 'all deterministic fallback packages must satisfy the semantic rubric');

console.log('');
console.log('PRODUCTION VALIDATOR BLIND-SPOT PROBE');

const collapsedRuns = [];
for (const fixture of benchmark.cases) {
  await assert.rejects(
    generateValidatedProviderResult({
      provider: 'offline-canned-provider',
      model: 'semantic-collapse-fixture-v1',
      globalInsight: fixture.globalInsight,
      businessBrief: benchmark.brandBrain,
      maxAttempts: 1,
      generate: async () => structuredClone(collapsedOutput),
    }),
    (error) => error.code === 'remix_quality_rejected',
  );
  const contract = assessRemixQuality(collapsedOutput, {
    globalInsight: fixture.globalInsight,
    businessBrief: benchmark.brandBrain,
  });
  const semantic = assessSemanticPackage(collapsedOutput, fixture);
  printCase(`${fixture.id} [${fixture.category}]`, contract, semantic);
  collapsedRuns.push({ fixture, contract, semantic });
}

const collapsedValidatorPasses = collapsedRuns.filter(({ contract }) => contract.ok).length;
const collapsedSemanticPasses = collapsedRuns.filter(({ semantic }) => semantic.ok).length;
console.log(`collapsed contract acceptance=${collapsedValidatorPasses}/${benchmark.cases.length}`);
console.log(`collapsed semantic acceptance=${collapsedSemanticPasses}/${benchmark.cases.length}`);

assert.equal(collapsedValidatorPasses, 0, 'production validator must reject the characterized collapse fixture');
assert.equal(collapsedSemanticPasses, 0, 'collapse fixture unexpectedly satisfies the semantic rubric');
assert.ok(collapsedRuns.every(({ semantic }) => !semantic.angleSeparated));
assert.ok(collapsedRuns.every(({ semantic }) => semantic.brandPresent && !semantic.brandBalanced));
assert.ok(collapsedRuns.every(({ semantic }) => semantic.productionFeasible));

console.log('');
console.log('BENCHMARK RESULT: FIX_PROVEN_OFFLINE');
console.log('LIVE PROVIDER RESULT: INCONCLUSIVE_NO_DIVERSE_PROVIDER_OUTPUTS');
console.log('PROCESS ASSERTIONS: PASS');
