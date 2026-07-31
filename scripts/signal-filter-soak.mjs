import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const {
  analyzeSignalQualityVideo,
  applySignalQualityPolicy,
  evaluateSignalQuality,
  loadSignalQualityGateConfig,
} = require('../backend/services/signalQualityGate.cjs');
const {
  parseGeminiInteractionText,
} = require('../backend/services/agentStudioVideoTool.cjs');
const {
  executeAutomaticDiscovery,
} = require('../backend/services/automaticSignalDiscovery.js');
const {
  fetchApifySignals,
} = require('../backend/services/apifySignalProvider.js');

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');
const DEFAULT_MANIFEST = path.join(REPO_ROOT, 'scripts', 'fixtures', 'signal-filter-benchmark.json');
const RUNTIME_DB_PATH = path.join(REPO_ROOT, 'backend', 'data', 'db.json');
const SIGNAL_POLICY_PATH = path.join(REPO_ROOT, 'backend', 'services', 'signalQualityGate.cjs');
const SIGNAL_CONFIG_PATH = path.join(REPO_ROOT, 'backend', 'config', 'signal-quality-gate.json');
const DEFAULT_GEMINI_CEILING_USD = 0.12;
const DEFAULT_APIFY_CEILING_USD = 0.05;

function parseBoolean(value) {
  if (typeof value === 'boolean') return value;
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function parseNumber(value, fallback, { min = Number.NEGATIVE_INFINITY, integer = false } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min) return fallback;
  return integer ? Math.trunc(number) : number;
}

function parseList(value, fallback = []) {
  if (Array.isArray(value)) return value;
  const parsed = String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return parsed.length ? parsed : fallback;
}

export function parseCliArgs(argv = []) {
  const [mode = 'help', ...tokens] = argv;
  const options = {};
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith('--')) continue;
    const raw = token.slice(2);
    const separator = raw.indexOf('=');
    if (separator >= 0) {
      options[raw.slice(0, separator)] = raw.slice(separator + 1);
      continue;
    }
    const next = tokens[index + 1];
    if (next && !next.startsWith('--')) {
      options[raw] = next;
      index += 1;
    } else {
      options[raw] = true;
    }
  }
  return { mode, options };
}

function createSeededRandom(seed = 42) {
  let state = Math.trunc(Number(seed) || 0) >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function round(value, digits = 3) {
  if (!Number.isFinite(Number(value))) return null;
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
}

function percentile(values, quantile) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(quantile * sorted.length) - 1));
  return round(sorted[index], 3);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function hashFileIfPresent(filePath) {
  try {
    return sha256(fs.readFileSync(filePath));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

const VIDEO_EXTENSION_BY_MIME = new Map([
  ['video/mp4', '.mp4'],
  ['video/webm', '.webm'],
  ['video/quicktime', '.mov'],
  ['video/x-matroska', '.mkv'],
]);

function safeArtifactSegment(value, fallback = 'artifact') {
  const sanitized = String(value || '')
    .trim()
    .replace(/[^a-z0-9._-]+/gi, '_')
    .replace(/^\.+/, '')
    .slice(0, 120);
  return sanitized || fallback;
}

function normalizeMediaMimeType(value) {
  return String(value || 'application/octet-stream').split(';')[0].trim().toLowerCase();
}

function detectMediaExtension(mimeType, bytes) {
  const normalizedMimeType = normalizeMediaMimeType(mimeType);
  if (VIDEO_EXTENSION_BY_MIME.has(normalizedMimeType)) {
    return VIDEO_EXTENSION_BY_MIME.get(normalizedMimeType);
  }
  if (Buffer.isBuffer(bytes) && bytes.length >= 12) {
    if (bytes.subarray(4, 8).toString('ascii') === 'ftyp') return '.mp4';
    if (bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return '.webm';
  }
  return '.bin';
}

function relativeArtifactPath(outputDirectory, artifactPath) {
  const resolvedOutputDirectory = path.resolve(outputDirectory);
  const resolvedArtifactPath = path.resolve(artifactPath);
  const relativePath = path.relative(resolvedOutputDirectory, resolvedArtifactPath);
  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error('artifact_path_outside_output_directory');
  }
  return relativePath.split(path.sep).join('/');
}

function mediaEvaluationLinks(value = []) {
  return (Array.isArray(value) ? value : []).map((item) => ({
    interactionNumber: Number(item?.interactionNumber) || null,
    repeat: Number(item?.repeat) || null,
  }));
}

export function persistBenchmarkMedia({
  outputDirectory,
  benchmarkId,
  bytes,
  mimeType,
  downloadCount = 1,
  evaluationLinks = [],
}) {
  const resolvedOutputDirectory = path.resolve(String(outputDirectory || ''));
  const normalizedMimeType = normalizeMediaMimeType(mimeType);
  const mediaBytes = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes || []);
  const extension = detectMediaExtension(normalizedMimeType, mediaBytes);
  const safeBenchmarkId = safeArtifactSegment(benchmarkId, 'benchmark');
  const mediaPath = path.join(resolvedOutputDirectory, 'media', `${safeBenchmarkId}${extension}`);
  const baseRecord = {
    benchmarkId: String(benchmarkId || ''),
    relativePath: relativeArtifactPath(resolvedOutputDirectory, mediaPath),
    mimeType: normalizedMimeType,
    byteLength: mediaBytes.length,
    sha256: mediaBytes.length ? sha256(mediaBytes) : null,
    downloadCount: Number(downloadCount) || 0,
    evaluationLinks: mediaEvaluationLinks(evaluationLinks),
    mediaPersisted: false,
    persistenceError: null,
    persistedByThisCall: false,
  };
  try {
    if (!mediaBytes.length) throw new Error('media_bytes_empty');
    fs.mkdirSync(path.dirname(mediaPath), { recursive: true });
    if (fs.existsSync(mediaPath)) {
      const existingBytes = fs.readFileSync(mediaPath);
      if (existingBytes.length !== mediaBytes.length || sha256(existingBytes) !== baseRecord.sha256) {
        throw new Error('existing_media_bytes_mismatch');
      }
    } else {
      fs.writeFileSync(mediaPath, mediaBytes);
      baseRecord.persistedByThisCall = true;
    }
    const persistedBytes = fs.readFileSync(mediaPath);
    if (persistedBytes.length !== mediaBytes.length || sha256(persistedBytes) !== baseRecord.sha256) {
      throw new Error('persisted_media_verification_failed');
    }
    baseRecord.mediaPersisted = true;
  } catch (error) {
    baseRecord.persistenceError = String(error?.message || 'media_persistence_failed');
  }
  return baseRecord;
}

export function buildMediaPersistenceReport({
  outputDirectory,
  expectedBenchmarkIds = [],
  records = [],
  outputDirectoryWritable = true,
}) {
  const recordsByBenchmarkId = new Map(
    records.map((record) => [String(record?.benchmarkId || ''), record]),
  );
  const normalizedRecords = expectedBenchmarkIds.map((benchmarkId) => (
    recordsByBenchmarkId.get(String(benchmarkId)) || {
      benchmarkId: String(benchmarkId),
      relativePath: null,
      mimeType: null,
      byteLength: null,
      sha256: null,
      downloadCount: 0,
      evaluationLinks: [],
      mediaPersisted: false,
      persistenceError: 'media_not_persisted',
      persistedByThisCall: false,
    }
  ));
  return {
    enabled: true,
    exactBytes: true,
    transcodeApplied: false,
    mediaDirectory: 'media',
    outputDirectoryWritable: Boolean(outputDirectoryWritable),
    mediaPersisted: normalizedRecords.length > 0
      ? normalizedRecords.every((record) => record.mediaPersisted === true)
      : null,
    records: normalizedRecords,
    outputDirectory: path.resolve(String(outputDirectory || '')),
  };
}

export function validatePersistedBenchmarkMedia(records = [], expectedBenchmarkIds = []) {
  const recordsByBenchmarkId = new Map(
    records.map((record) => [String(record?.benchmarkId || ''), record]),
  );
  for (const benchmarkId of expectedBenchmarkIds) {
    const record = recordsByBenchmarkId.get(String(benchmarkId));
    const validRelativePath = record?.relativePath
      && !path.isAbsolute(record.relativePath)
      && String(record.relativePath).replace(/\\/g, '/').startsWith('media/');
    const validSha256 = /^[a-f0-9]{64}$/i.test(String(record?.sha256 || ''));
    if (
      record?.mediaPersisted !== true
      || record?.downloadCount !== 1
      || !validRelativePath
      || !validSha256
    ) {
      throw new Error(`live_media_persistence_required_${safeArtifactSegment(benchmarkId)}`);
    }
  }
  return true;
}

function probeOutputDirectoryWritable(outputDirectory) {
  const resolvedOutputDirectory = path.resolve(outputDirectory);
  const probePath = path.join(
    resolvedOutputDirectory,
    `.media-persistence-write-probe-${crypto.randomUUID()}`,
  );
  try {
    fs.mkdirSync(resolvedOutputDirectory, { recursive: true });
    const probeBytes = Buffer.from('dzhero-media-persistence-probe', 'utf8');
    fs.writeFileSync(probePath, probeBytes);
    const persisted = fs.readFileSync(probePath);
    if (!persisted.equals(probeBytes)) throw new Error('output_directory_probe_mismatch');
    return { writable: true, error: null };
  } catch (error) {
    return {
      writable: false,
      error: String(error?.message || 'output_directory_not_writable'),
    };
  } finally {
    if (fs.existsSync(probePath)) fs.rmSync(probePath);
  }
}

async function probeEvidenceFrameExtractor() {
  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      const codecSupport = await page.evaluate(() => ({
        mp4: document.createElement('video').canPlayType('video/mp4'),
        webm: document.createElement('video').canPlayType('video/webm'),
      }));
      return {
        available: Boolean(codecSupport.mp4 || codecSupport.webm),
        method: 'playwright_chromium_local_video',
        codecSupport,
        error: null,
      };
    } finally {
      await browser.close();
    }
  } catch (error) {
    return {
      available: false,
      method: 'playwright_chromium_local_video',
      codecSupport: {},
      error: String(error?.message || 'evidence_frame_extractor_unavailable'),
    };
  }
}

function timestampTokenToSeconds(token) {
  const parts = String(token || '').split(':').map(Number);
  if (!parts.length || parts.some((part) => !Number.isFinite(part))) return null;
  if (parts.length === 3) return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
  if (parts.length === 2) return (parts[0] * 60) + parts[1];
  return parts[0];
}

function timestampSamples(value) {
  const rawTimestamp = String(value || '').trim();
  if (!rawTimestamp) return [];
  const colonTokens = rawTimestamp.match(/(?:\d{1,2}:)?\d{1,2}:\d{2}(?:\.\d+)?/g) || [];
  let seconds = colonTokens
    .map(timestampTokenToSeconds)
    .filter((item) => Number.isFinite(item) && item >= 0);
  if (!seconds.length) {
    seconds = [...rawTimestamp.matchAll(/(\d+(?:\.\d+)?)\s*s\b/gi)]
      .map((match) => Number(match[1]))
      .filter((item) => Number.isFinite(item) && item >= 0);
  }
  if (!seconds.length && /^\d+(?:\.\d+)?$/.test(rawTimestamp)) {
    seconds = [Number(rawTimestamp)];
  }
  seconds = [...new Set(seconds.map((item) => round(item, 3)))];
  if (seconds.length >= 2) {
    const start = seconds[0];
    const end = seconds.at(-1);
    const midpoint = round((start + end) / 2, 3);
    return [
      { label: 'start', seconds: start },
      ...(midpoint !== start && midpoint !== end ? [{ label: 'mid', seconds: midpoint }] : []),
      { label: 'end', seconds: end },
    ];
  }
  return seconds.map((item) => ({ label: 'exact', seconds: item }));
}

function frameRecordBase({
  evaluation,
  observation,
  observationIndex,
  sample = null,
}) {
  return {
    benchmarkId: evaluation.caseId,
    repeat: evaluation.repeatIndex + 1,
    interactionNumber: evaluation.interactionNumber,
    observationId: String(observation?.id || `observation-${observationIndex + 1}`),
    observationIndex,
    observationTimestamp: String(observation?.timestamp || ''),
    timestamp: sample ? sample.seconds : null,
    timestampLabel: sample?.label || null,
    source: observation?.source || observation?.sourceType || null,
    kind: observation?.kind || null,
    relativePath: null,
    sha256: null,
    framePersisted: false,
    extractionError: null,
  };
}

async function seekLocalVideo(page, timestampSeconds) {
  return page.evaluate(async (requestedTimestamp) => {
    const video = document.querySelector('video');
    if (!video) throw new Error('local_video_element_missing');
    if (video.readyState < 1) {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('local_video_metadata_timeout')), 15000);
        video.addEventListener('loadedmetadata', () => {
          clearTimeout(timer);
          resolve();
        }, { once: true });
        video.addEventListener('error', () => {
          clearTimeout(timer);
          reject(new Error('local_video_metadata_error'));
        }, { once: true });
      });
    }
    if (!Number.isFinite(video.duration) || video.duration <= 0) {
      throw new Error('local_video_duration_unavailable');
    }
    if (requestedTimestamp > video.duration + 0.25) {
      throw new Error(`observation_timestamp_out_of_range_${requestedTimestamp}_gt_${video.duration}`);
    }
    const targetTimestamp = Math.min(requestedTimestamp, Math.max(0, video.duration - 0.001));
    if (Math.abs(video.currentTime - targetTimestamp) > 0.01) {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('local_video_seek_timeout')), 15000);
        video.addEventListener('seeked', () => {
          clearTimeout(timer);
          resolve();
        }, { once: true });
        video.addEventListener('error', () => {
          clearTimeout(timer);
          reject(new Error('local_video_seek_error'));
        }, { once: true });
        video.currentTime = targetTimestamp;
      });
    }
    video.pause();
    video.controls = false;
    video.style.display = 'block';
    video.style.maxWidth = '1200px';
    video.style.maxHeight = '900px';
    video.style.width = 'auto';
    video.style.height = 'auto';
    document.body.style.margin = '0';
    document.body.style.background = '#000';
    return {
      duration: video.duration,
      currentTime: video.currentTime,
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
    };
  }, timestampSeconds);
}

export async function extractEvidenceFrames({
  outputDirectory,
  mediaRecords = [],
  evaluations = [],
}) {
  const resolvedOutputDirectory = path.resolve(outputDirectory);
  const mediaByBenchmarkId = new Map(
    mediaRecords.map((record) => [String(record?.benchmarkId || ''), record]),
  );
  const records = [];
  let browser;
  try {
    const { chromium } = await import('playwright');
    browser = await chromium.launch({ headless: true });
    for (const evaluation of evaluations) {
      const mediaRecord = mediaByBenchmarkId.get(String(evaluation.caseId || ''));
      const observations = Array.isArray(evaluation.observations) ? evaluation.observations : [];
      const mediaPath = mediaRecord?.relativePath
        ? path.resolve(resolvedOutputDirectory, ...mediaRecord.relativePath.split('/'))
        : null;
      let page;
      let mediaOpenError = null;
      if (!mediaRecord?.mediaPersisted || !mediaPath || !fs.existsSync(mediaPath)) {
        mediaOpenError = 'persisted_media_missing';
      } else {
        try {
          page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
          await page.goto(pathToFileURL(mediaPath).href, {
            waitUntil: 'domcontentloaded',
            timeout: 30000,
          });
          await page.locator('video').waitFor({ state: 'attached', timeout: 15000 });
        } catch (error) {
          mediaOpenError = String(error?.message || 'persisted_media_open_failed');
        }
      }
      for (let observationIndex = 0; observationIndex < observations.length; observationIndex += 1) {
        const observation = observations[observationIndex];
        const samples = timestampSamples(observation?.timestamp);
        if (!samples.length) {
          records.push({
            ...frameRecordBase({ evaluation, observation, observationIndex }),
            extractionError: 'observation_timestamp_missing_or_unparseable',
          });
          continue;
        }
        for (const sample of samples) {
          const frameRecord = frameRecordBase({
            evaluation,
            observation,
            observationIndex,
            sample,
          });
          if (mediaOpenError || !page) {
            frameRecord.extractionError = mediaOpenError || 'persisted_media_open_failed';
            records.push(frameRecord);
            continue;
          }
          const frameDirectory = path.join(
            resolvedOutputDirectory,
            'evidence-frames',
            safeArtifactSegment(evaluation.caseId, 'benchmark'),
            String(evaluation.repeatIndex + 1),
            safeArtifactSegment(frameRecord.observationId, `observation-${observationIndex + 1}`),
          );
          const timestampMilliseconds = Math.round(sample.seconds * 1000);
          const framePath = path.join(
            frameDirectory,
            `frame-${observationIndex + 1}-${sample.label}-${timestampMilliseconds}ms.png`,
          );
          try {
            fs.mkdirSync(frameDirectory, { recursive: true });
            await seekLocalVideo(page, sample.seconds);
            await page.locator('video').screenshot({
              path: framePath,
              type: 'png',
              timeout: 30000,
            });
            frameRecord.relativePath = relativeArtifactPath(resolvedOutputDirectory, framePath);
            frameRecord.sha256 = hashFileIfPresent(framePath);
            frameRecord.framePersisted = Boolean(frameRecord.sha256);
            if (!frameRecord.framePersisted) {
              frameRecord.extractionError = 'frame_hash_unavailable';
            }
          } catch (error) {
            frameRecord.extractionError = String(error?.message || 'frame_extraction_failed');
          }
          records.push(frameRecord);
        }
      }
      if (page) await page.close();
    }
  } catch (error) {
    const extractionError = String(error?.message || 'evidence_frame_extractor_unavailable');
    for (const evaluation of evaluations) {
      const observations = Array.isArray(evaluation.observations) ? evaluation.observations : [];
      for (let observationIndex = 0; observationIndex < observations.length; observationIndex += 1) {
        const observation = observations[observationIndex];
        const samples = timestampSamples(observation?.timestamp);
        if (!samples.length) {
          records.push({
            ...frameRecordBase({ evaluation, observation, observationIndex }),
            extractionError,
          });
          continue;
        }
        for (const sample of samples) {
          records.push({
            ...frameRecordBase({ evaluation, observation, observationIndex, sample }),
            extractionError,
          });
        }
      }
    }
  } finally {
    if (browser) await browser.close();
  }
  for (const evaluation of evaluations) {
    evaluation.evidenceFrames = records.filter((record) => (
      record.benchmarkId === evaluation.caseId
      && record.repeat === evaluation.repeatIndex + 1
      && record.interactionNumber === evaluation.interactionNumber
    ));
  }
  return {
    enabled: true,
    method: 'playwright_chromium_local_video',
    fullVideoIsSourceOfTruth: true,
    frameCount: records.filter((record) => record.framePersisted).length,
    extractionErrors: records.filter((record) => !record.framePersisted).length,
    records,
  };
}

function safeTimestamp(now = new Date()) {
  return now.toISOString().replace(/[:.]/g, '-');
}

function resolveOutputDirectory(outputDirectory) {
  if (outputDirectory) return path.resolve(String(outputDirectory));
  return path.join(os.tmpdir(), 'dzhero-signal-filter-soak', safeTimestamp());
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(value) {
  return new Set(normalizeText(value).split(' ').filter((token) => token.length > 2));
}

function jaccardSimilarity(left, right) {
  const leftTokens = tokens(left);
  const rightTokens = tokens(right);
  if (!leftTokens.size && !rightTokens.size) return 1;
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union ? intersection / union : 0;
}

function createSyntheticSignal(index, seed) {
  const random = createSeededRandom((seed * 1000003) + index);
  const bucket = index % 100;
  const scenario = bucket < 45
    ? 'accept'
    : bucket < 80
      ? 'reject'
      : bucket < 90
        ? 'uncertain'
        : bucket < 95
          ? 'schema_failure'
          : bucket < 98
            ? 'transient'
            : 'persistent_error';
  const platform = index % 2 === 0 ? 'tiktok' : 'instagram';
  const externalId = `${seed}${String(index).padStart(7, '0')}`;
  const scoreJitter = Math.floor(random() * 8);
  return {
    id: `synthetic_${seed}_${index}`,
    workspaceId: `ws_soak_${seed}`,
    sourceHandle: `@synthetic_${index}`,
    handle: `@synthetic_${index}`,
    sourceUrl: `https://example.invalid/${platform}/video/${externalId}`,
    videoUrl: `https://media.example.invalid/${externalId}.mp4`,
    title: `Synthetic ${scenario} signal ${index}`,
    caption: `Seed ${seed}, unique candidate ${index}`,
    sourceType: platform === 'tiktok' ? 'TikTok' : 'Instagram',
    sourceStatus: 'synthetic_video',
    scanLabel: platform,
    score: 80 + scoreJitter,
    views: 1000 + index * 17,
    likes: 100 + index,
    comments: index % 31,
    shares: index % 19,
    saves: index % 23,
    importedMetadata: {
      provider: 'synthetic',
      platform,
      externalId,
      url: `https://example.invalid/${platform}/video/${externalId}`,
      videoUrl: `https://media.example.invalid/${externalId}.mp4`,
      mediaUrls: [`https://media.example.invalid/${externalId}.mp4`],
    },
    synthetic: {
      index,
      scenario,
      expectedDecision: ['accept', 'transient'].includes(scenario)
        ? 'accept'
        : scenario === 'reject'
          ? 'reject'
          : scenario === 'uncertain'
            ? 'uncertain'
            : 'error',
      scoreJitter,
    },
  };
}

function createSyntheticAssessment(signal) {
  const { scenario, scoreJitter } = signal.synthetic;
  const claim = (text, evidenceIds, supportLevel = 'demonstrated') => ({
    text,
    evidenceIds,
    supportLevel,
  });
  const emptyClaims = () => ({
    centralIdea: claim('', [], 'inferred'),
    contentMechanic: claim('', [], 'inferred'),
    visualExecution: claim('', [], 'inferred'),
    adaptationTemplate: claim('', [], 'inferred'),
  });
  if (scenario === 'schema_failure') {
    return {
      accessible: true,
      summary: 'Deliberately malformed mock assessment.',
      scores: {},
    };
  }
  if (scenario === 'uncertain') {
    return {
      accessible: false,
      summary: 'The synthetic video cannot be accessed.',
      derivedClaims: emptyClaims(),
      scores: {
        contentValue: 0,
        adaptability: 0,
        topicClarity: 0,
        hookStrength: 0,
        payoffStrength: 0,
        brandRelevance: 0,
      },
      evidenceConfidence: 0,
      slopIndicators: [],
      observations: [],
      evidenceChains: [],
      unknowns: ['Synthetic inaccessible-video case.'],
    };
  }
  if (scenario === 'reject') {
    return {
      accessible: true,
      summary: 'A decorative teaser provides no useful explanation, progression, or payoff.',
      derivedClaims: {
        centralIdea: claim('A decorative interface is shown.', ['obs_1']),
        contentMechanic: claim(
          'The interface explains a reusable workflow.',
          ['obs_1'],
          'inferred',
        ),
        visualExecution: claim('A sequence of interface screens.', ['obs_1']),
        adaptationTemplate: claim('', [], 'inferred'),
      },
      scores: {
        contentValue: 18 + scoreJitter,
        adaptability: 12 + scoreJitter,
        topicClarity: 72 + scoreJitter,
        hookStrength: 52 + scoreJitter,
        payoffStrength: 15 + scoreJitter,
        brandRelevance: 90 + (scoreJitter % 6),
      },
      evidenceConfidence: 0.91,
      slopIndicators: ['decorative_product_tease'],
      observations: [{
        id: 'obs_1',
        timestamp: '00:00-00:12',
        source: 'visual',
        kind: 'visual_device',
        description: 'The interface changes, but no workflow or result is demonstrated.',
        confidence: 0.93,
      }],
      evidenceChains: [],
      unknowns: [],
    };
  }
  return {
    accessible: true,
    summary: 'A concrete workflow is explained from setup to a visible result.',
    derivedClaims: {
      centralIdea: claim(
        'Replace a repeated manual task with a supervised workflow.',
        ['obs_setup', 'obs_process', 'obs_result'],
      ),
      contentMechanic: claim(
        'Show the task, demonstrate three steps, and reveal the result.',
        ['obs_setup', 'obs_process', 'obs_result'],
      ),
      visualExecution: claim(
        'A narrated workflow demonstration.',
        ['obs_setup', 'obs_process', 'obs_result'],
      ),
      adaptationTemplate: claim(
        '[repeated task] to [three steps] to [visible result]',
        ['obs_setup', 'obs_process', 'obs_result'],
        'inferred',
      ),
    },
    scores: {
      contentValue: 78 + scoreJitter,
      adaptability: 76 + scoreJitter,
      topicClarity: 82 + scoreJitter,
      hookStrength: 72 + scoreJitter,
      payoffStrength: 75 + scoreJitter,
      brandRelevance: 70 + scoreJitter,
    },
    evidenceConfidence: 0.9,
    slopIndicators: [],
    observations: [
      {
        id: 'obs_setup',
        timestamp: '00:01',
        source: 'visual',
        kind: 'setup',
        description: 'The original pending task is visible.',
        confidence: 0.94,
      },
      {
        id: 'obs_process',
        timestamp: '00:02-00:18',
        source: 'visual',
        kind: 'process',
        description: 'The creator demonstrates the workflow steps.',
        confidence: 0.94,
      },
      {
        id: 'obs_result',
        timestamp: '00:19-00:23',
        source: 'visual',
        kind: 'result',
        description: 'The creator shows the completed output.',
        confidence: 0.94,
      },
    ],
    evidenceChains: [{
      mode: 'process_demo',
      beforeEvidenceId: 'obs_setup',
      actionEvidenceId: 'obs_process',
      afterEvidenceId: 'obs_result',
      subject: 'synthetic workflow task',
      beforeState: 'The task is pending.',
      afterState: 'The completed output is visible.',
      supportLevel: 'demonstrated',
      directlyObserved: true,
      ambiguityReasons: [],
    }],
    unknowns: [],
  };
}

function isSchemaFailure(error) {
  return error?.name === 'ZodError'
    || Array.isArray(error?.issues)
    || /invalid_response|schema/i.test(String(error?.message || ''));
}

async function runWorkerPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  let active = 0;
  let peakActive = 0;
  async function consume() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      active += 1;
      peakActive = Math.max(peakActive, active);
      try {
        results[index] = await worker(items[index], index);
      } finally {
        active -= 1;
      }
    }
  }
  const workerCount = Math.min(items.length || 1, Math.max(1, concurrency));
  await Promise.all(Array.from({ length: workerCount }, () => consume()));
  return { results, peakActive };
}

async function evaluateSyntheticSignal(signal, { config, maxRetries }) {
  const startedAt = performance.now();
  let attempts = 0;
  let retries = 0;
  while (attempts <= maxRetries) {
    attempts += 1;
    try {
      const quality = await evaluateSignalQuality({
        signal,
        config,
        analyzeVideo: async () => {
          if (signal.synthetic.scenario === 'transient' && attempts === 1) {
            throw new Error('mock_transient_failure');
          }
          if (signal.synthetic.scenario === 'persistent_error') {
            throw new Error('mock_persistent_failure');
          }
          return createSyntheticAssessment(signal);
        },
      });
      return {
        id: signal.id,
        expectedDecision: signal.synthetic.expectedDecision,
        decision: quality.decision,
        qualityScore: quality.qualityScore,
        attempts,
        retries,
        schemaFailure: false,
        error: null,
        latencyMs: performance.now() - startedAt,
      };
    } catch (error) {
      const schemaFailure = isSchemaFailure(error);
      if (!schemaFailure && attempts <= maxRetries) {
        retries += 1;
        continue;
      }
      return {
        id: signal.id,
        expectedDecision: signal.synthetic.expectedDecision,
        decision: 'error',
        qualityScore: null,
        attempts,
        retries,
        schemaFailure,
        error: String(error?.message || error),
        latencyMs: performance.now() - startedAt,
      };
    }
  }
  throw new Error('synthetic_retry_loop_unreachable');
}

function buildRunDigest(results) {
  return sha256(JSON.stringify(results.map((result) => ({
    id: result.id,
    expectedDecision: result.expectedDecision,
    decision: result.decision,
    qualityScore: result.qualityScore,
    attempts: result.attempts,
    retries: result.retries,
    schemaFailure: result.schemaFailure,
    error: result.error,
  }))));
}

function summarizeSyntheticPass({ results, elapsedMs, peakActive }) {
  const decisions = { accept: 0, reject: 0, uncertain: 0, error: 0 };
  let attempts = 0;
  let retries = 0;
  let schemaFailures = 0;
  let falseAccepts = 0;
  let falseRejects = 0;
  for (const result of results) {
    decisions[result.decision] = (decisions[result.decision] || 0) + 1;
    attempts += result.attempts;
    retries += result.retries;
    if (result.schemaFailure) schemaFailures += 1;
    if (result.expectedDecision === 'reject' && result.decision === 'accept') falseAccepts += 1;
    if (result.expectedDecision === 'accept' && result.decision !== 'accept') falseRejects += 1;
  }
  const expectedRejects = results.filter((result) => result.expectedDecision === 'reject').length;
  const expectedAccepts = results.filter((result) => result.expectedDecision === 'accept').length;
  const latencies = results.map((result) => result.latencyMs);
  return {
    signalCount: results.length,
    completedCount: results.length,
    decisions,
    attempts,
    retries,
    schemaFailures,
    schemaFailureRate: results.length ? schemaFailures / results.length : 0,
    falseAcceptRate: expectedRejects ? falseAccepts / expectedRejects : 0,
    falseRejectRate: expectedAccepts ? falseRejects / expectedAccepts : 0,
    elapsedMs: round(elapsedMs, 3),
    throughputPerSecond: elapsedMs > 0 ? round(results.length / (elapsedMs / 1000), 3) : null,
    latencyMs: {
      p50: percentile(latencies, 0.5),
      p95: percentile(latencies, 0.95),
      max: latencies.length ? round(Math.max(...latencies), 3) : null,
    },
    peakConcurrency: peakActive,
    isolatedErrorCount: decisions.error,
    digest: buildRunDigest(results),
  };
}

async function runSyntheticPass({ count, seed, concurrency, maxRetries, config }) {
  const signals = Array.from({ length: count }, (_, index) => createSyntheticSignal(index, seed));
  const startedAt = performance.now();
  const pool = await runWorkerPool(
    signals,
    concurrency,
    (signal) => evaluateSyntheticSignal(signal, { config, maxRetries }),
  );
  const elapsedMs = performance.now() - startedAt;
  return summarizeSyntheticPass({ results: pool.results, elapsedMs, peakActive: pool.peakActive });
}

function attachZeroCost(array) {
  Object.defineProperty(array, 'actualCostUsd', {
    configurable: true,
    enumerable: false,
    value: 0,
  });
  return array;
}

function createDiscoveryCandidate(index, workspaceId, { downloaded = false } = {}) {
  const externalId = `900000000${String(index).padStart(5, '0')}`;
  const sourceUrl = `https://www.tiktok.com/@synthetic.discovery/video/${externalId}`;
  const videoUrl = downloaded ? `https://media.example.invalid/${externalId}.mp4` : '';
  return {
    id: `discovery_candidate_${index}`,
    workspaceId,
    sourceHandle: '@synthetic.discovery',
    handle: '@synthetic.discovery',
    sourceUrl,
    sourceStatus: downloaded ? 'synthetic_video' : 'synthetic_metadata',
    scanLabel: 'TikTok',
    sourceType: 'TikTok',
    market: 'global',
    title: `Synthetic discovery candidate ${index}`,
    caption: `Unique metadata candidate ${index}`,
    image: `https://images.example.invalid/${externalId}.jpg`,
    videoUrl,
    views: 1_000_000 - index,
    likes: 10_000 - (index % 1000),
    comments: 100 + (index % 50),
    shares: 500 + (index % 100),
    saves: 700 + (index % 100),
    score: 95 - (index % 10),
    importedMetadata: {
      provider: 'synthetic',
      platform: 'tiktok',
      externalId,
      tiktokVideoId: externalId,
      url: sourceUrl,
      videoUrl,
      mediaUrls: videoUrl ? [videoUrl] : [],
      handle: '@synthetic.discovery',
      publishedAt: '2026-07-30T00:00:00.000Z',
      sourceStatus: downloaded ? 'synthetic_video' : 'synthetic_metadata',
    },
  };
}

async function runAutomaticDiscoveryLoad({
  candidateCount = 500,
  maxQualityEvaluations,
  config,
}) {
  const workspaceId = 'ws_signal_filter_soak_discovery';
  const candidates = Array.from(
    { length: candidateCount },
    (_, index) => createDiscoveryCandidate(index, workspaceId),
  );
  const candidatesByUrl = new Map(candidates.map((candidate, index) => [candidate.sourceUrl, index]));
  const state = {
    workspaces: [{
      id: workspaceId,
      brief: {
        businessType: 'AI tools',
        niche: 'vibe coding',
        product: 'DZHERO',
        audience: 'builders using AI coding agents',
        location: 'global',
        contentFocus: 'agent workflows',
      },
      discoverySettings: {
        enabled: true,
        dailyBudgetUsd: 0.8,
        viralScoreThreshold: 70,
        platforms: ['tiktok'],
      },
    }],
    sources: [],
    competitors: [],
    reels: [],
    discoveryRuns: [],
  };
  let mockProviderCalls = 0;
  let metadataCalls = 0;
  let downloadCalls = 0;
  let qualityAttempts = 0;
  const result = await executeAutomaticDiscovery({
    state,
    workspaceId,
    token: 'mock-token-never-sent',
    now: new Date('2026-07-30T12:00:00.000Z'),
    force: true,
    policy: {
      dailyBudgetUsd: 0.8,
      dailyTarget: candidateCount,
      maxBudgetedRunsPerDay: 1,
      // The injected metadata provider deliberately returns the requested
      // candidateCount regardless of this planning estimate. Keeping the
      // estimate at one proves the 500-candidate path without tripping the
      // production discovery budget guard or making a provider call.
      resultLimitPerPlatform: 1,
      maxPlannedCalls: 1,
    },
    maxQualityEvaluations,
    qualityGateConfig: config,
    fetchSignals: async (call) => {
      mockProviderCalls += 1;
      if (Boolean(call.downloadVideos ?? call.downloadVideo)) {
        downloadCalls += 1;
        const candidateIndex = candidatesByUrl.get(call.inputValue);
        if (candidateIndex === undefined) return attachZeroCost([]);
        return attachZeroCost([
          createDiscoveryCandidate(candidateIndex, workspaceId, { downloaded: true }),
        ]);
      }
      metadataCalls += 1;
      return attachZeroCost(candidates.map((candidate) => structuredClone(candidate)));
    },
    evaluateSignalQuality: async ({ signal }) => {
      qualityAttempts += 1;
      const candidateIndex = candidatesByUrl.get(signal.sourceUrl) ?? 0;
      const synthetic = createSyntheticSignal(candidateIndex, 77);
      const raw = createSyntheticAssessment(synthetic);
      return applySignalQualityPolicy(raw, config);
    },
  });
  const withinLimit = qualityAttempts <= maxQualityEvaluations;
  if (!withinLimit) {
    throw new Error(`maxQualityEvaluations exceeded: ${qualityAttempts} > ${maxQualityEvaluations}`);
  }
  return {
    metadataCandidateCount: candidateCount,
    maxQualityEvaluations,
    qualityAttempts,
    withinLimit,
    runQualityEvaluatedCount: result.run?.qualityEvaluatedCount || 0,
    runQualityErrorCount: result.run?.qualityErrorCount || 0,
    acceptedCount: result.acceptedSignals.length,
    inMemoryBankCount: state.reels.length,
    mockProviderCalls,
    metadataCalls,
    downloadCalls,
    realProviderCalls: 0,
  };
}

function buildLoadSummary(report) {
  const lines = [
    '# DZHERO Signal Filter Soak — mock load',
    '',
    `Generated: ${report.generatedAt}`,
    `Seed: ${report.seed}`,
    `Paid provider calls: ${report.providerCalls.paid}`,
    `Runtime DB unchanged: ${report.runtimeDb.unchanged}`,
    `Unexpected network attempts: ${report.providerCalls.unexpectedNetworkAttempts}`,
    '',
    '| Signals | Throughput/s | Accept | Reject | Uncertain | Errors | Schema failures | Retries | p50 ms | p95 ms | Deterministic |',
    '| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | :---: |',
  ];
  for (const run of report.runs) {
    lines.push(`| ${run.count} | ${run.primary.throughputPerSecond} | ${run.primary.decisions.accept} | ${run.primary.decisions.reject} | ${run.primary.decisions.uncertain} | ${run.primary.decisions.error} | ${run.primary.schemaFailures} | ${run.primary.retries} | ${run.primary.latencyMs.p50} | ${run.primary.latencyMs.p95} | ${run.deterministic ? 'yes' : 'no'} |`);
  }
  lines.push(
    '',
    '## Automatic discovery',
    '',
    `500-metadata scenario candidates: ${report.automaticDiscovery.metadataCandidateCount}`,
    `Quality attempts: ${report.automaticDiscovery.qualityAttempts}/${report.automaticDiscovery.maxQualityEvaluations}`,
    `Limit respected: ${report.automaticDiscovery.withinLimit}`,
    `Real provider calls: ${report.automaticDiscovery.realProviderCalls}`,
    '',
    'Synthetic false-accept/false-reject rates validate harness and policy boundaries only. Real accuracy requires independently labelled benchmark videos.',
  );
  return `${lines.join('\n')}\n`;
}

function writeReportArtifacts(report, summary, outputDirectory) {
  fs.mkdirSync(outputDirectory, { recursive: true });
  const reportPath = path.join(outputDirectory, 'report.json');
  const summaryPath = path.join(outputDirectory, 'summary.md');
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.writeFileSync(summaryPath, summary, 'utf8');
  return { outputDirectory, reportPath, summaryPath };
}

export async function runLoadMode(options = {}) {
  const counts = parseList(options.counts, ['100', '200', '500'])
    .map((value) => parseNumber(value, null, { min: 1, integer: true }))
    .filter(Number.isFinite);
  if (!counts.length) throw new Error('load_counts_required');
  const seed = parseNumber(options.seed, 42, { integer: true });
  const concurrency = parseNumber(options.concurrency, 8, { min: 1, integer: true });
  const maxRetries = parseNumber(options['max-retries'], 2, { min: 0, integer: true });
  const determinismRuns = parseNumber(options['determinism-runs'], 2, { min: 2, integer: true });
  const discoveryCandidateCount = parseNumber(
    options['discovery-candidates'],
    500,
    { min: 1, integer: true },
  );
  const config = loadSignalQualityGateConfig();
  const maxQualityEvaluations = parseNumber(
    options['max-quality-evaluations'],
    Number(config.maxVideoAnalysesPerRun || 1),
    { min: 1, integer: true },
  );
  const outputDirectory = resolveOutputDirectory(options['output-dir']);
  const runtimeDbHashBefore = hashFileIfPresent(RUNTIME_DB_PATH);
  const originalFetch = globalThis.fetch;
  let unexpectedNetworkAttempts = 0;
  globalThis.fetch = async () => {
    unexpectedNetworkAttempts += 1;
    throw new Error('unexpected_network_call_in_mock_load');
  };
  try {
    const runs = [];
    for (const count of counts) {
      const passes = [];
      for (let pass = 0; pass < determinismRuns; pass += 1) {
        passes.push(await runSyntheticPass({
          count,
          seed,
          concurrency,
          maxRetries,
          config,
        }));
      }
      const deterministic = passes.every((pass) => pass.digest === passes[0].digest);
      if (!deterministic) throw new Error(`non_deterministic_result_for_count_${count}`);
      runs.push({
        count,
        primary: passes[0],
        replayDigests: passes.slice(1).map((pass) => pass.digest),
        deterministic,
      });
    }
    const automaticDiscovery = await runAutomaticDiscoveryLoad({
      candidateCount: discoveryCandidateCount,
      maxQualityEvaluations,
      config,
    });
    const runtimeDbHashAfter = hashFileIfPresent(RUNTIME_DB_PATH);
    const report = {
      reportVersion: 1,
      mode: 'load',
      generatedAt: new Date().toISOString(),
      seed,
      counts,
      concurrency,
      maxRetries,
      determinismRuns,
      policy: {
        version: config.version,
        name: config.policy,
        maxVideoAnalysesPerRun: config.maxVideoAnalysesPerRun,
      },
      providerCalls: {
        paid: 0,
        gemini: 0,
        apify: 0,
        unexpectedNetworkAttempts,
      },
      runtimeDb: {
        path: RUNTIME_DB_PATH,
        sha256Before: runtimeDbHashBefore,
        sha256After: runtimeDbHashAfter,
        unchanged: runtimeDbHashBefore === runtimeDbHashAfter,
      },
      runs,
      automaticDiscovery,
    };
    if (unexpectedNetworkAttempts !== 0) throw new Error('mock_load_attempted_network_access');
    if (!report.runtimeDb.unchanged) throw new Error('runtime_db_changed_during_mock_load');
    const summary = buildLoadSummary(report);
    const artifacts = writeReportArtifacts(report, summary, outputDirectory);
    return { report, summary, artifacts };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function readManifest(manifestPath) {
  const resolvedPath = path.resolve(manifestPath || DEFAULT_MANIFEST);
  const manifest = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
  if (!manifest || !Array.isArray(manifest.cases) || !manifest.cases.length) {
    throw new Error('benchmark_manifest_cases_required');
  }
  const ids = new Set();
  for (const item of manifest.cases) {
    if (!item?.id || !item?.url || !['accept', 'reject'].includes(item.expectedDecision)) {
      throw new Error('benchmark_manifest_case_invalid');
    }
    if (ids.has(item.id)) throw new Error(`benchmark_manifest_duplicate_id_${item.id}`);
    ids.add(item.id);
    if (item.labelSource !== 'product_owner') {
      throw new Error(`benchmark_manifest_label_source_invalid_${item.id}`);
    }
    if (!Array.isArray(item.expectedFacts) || !Array.isArray(item.forbiddenClaims)) {
      throw new Error(`benchmark_manifest_evidence_invalid_${item.id}`);
    }
  }
  return { resolvedPath, manifest };
}

function normalizeUsage(rawUsage = {}) {
  const usage = rawUsage?.usageMetadata || rawUsage || {};
  const inputTokens = Number(
    usage.input_tokens
    ?? usage.inputTokens
    ?? usage.prompt_token_count
    ?? usage.promptTokenCount,
  );
  const outputTokens = Number(
    usage.output_tokens
    ?? usage.outputTokens
    ?? usage.candidates_token_count
    ?? usage.candidatesTokenCount,
  );
  const totalTokens = Number(
    usage.total_tokens
    ?? usage.totalTokens
    ?? usage.total_token_count
    ?? usage.totalTokenCount,
  );
  return {
    inputTokens: Number.isFinite(inputTokens) ? inputTokens : null,
    outputTokens: Number.isFinite(outputTokens) ? outputTokens : null,
    totalTokens: Number.isFinite(totalTokens)
      ? totalTokens
      : Number.isFinite(inputTokens) && Number.isFinite(outputTokens)
        ? inputTokens + outputTokens
        : null,
  };
}

function estimateGeminiCost(usage, inputRatePerMillion, outputRatePerMillion) {
  if (!Number.isFinite(inputRatePerMillion) || !Number.isFinite(outputRatePerMillion)) {
    return { estimatedUsd: null, method: 'token_rates_unavailable' };
  }
  if (Number.isFinite(usage.inputTokens) && Number.isFinite(usage.outputTokens)) {
    return {
      estimatedUsd: round(
        (usage.inputTokens / 1_000_000) * inputRatePerMillion
          + (usage.outputTokens / 1_000_000) * outputRatePerMillion,
        8,
      ),
      method: 'reported_input_output_tokens',
    };
  }
  if (Number.isFinite(usage.totalTokens)) {
    return {
      estimatedUsd: round(
        (usage.totalTokens / 1_000_000) * Math.max(inputRatePerMillion, outputRatePerMillion),
        8,
      ),
      method: 'conservative_total_tokens_at_higher_rate',
    };
  }
  return { estimatedUsd: null, method: 'token_usage_unavailable' };
}

const SENSITIVE_QUERY_KEY = /key|token|secret|credential|authorization/i;

function isSensitiveArtifactKey(key) {
  const normalized = String(key || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
  return [
    'authorization',
    'proxyauthorization',
    'apikey',
    'xapikey',
    'token',
    'accesstoken',
    'refreshtoken',
    'authtoken',
    'bearertoken',
    'secret',
    'clientsecret',
    'apisecret',
    'credential',
    'credentials',
    'cookie',
    'setcookie',
  ].includes(normalized);
}

function sanitizeArtifactString(value, secrets = []) {
  let sanitized = String(value);
  for (const secret of secrets) {
    if (!secret) continue;
    sanitized = sanitized.split(String(secret)).join('[REDACTED]');
  }
  try {
    const parsed = new URL(sanitized);
    for (const key of [...parsed.searchParams.keys()]) {
      if (SENSITIVE_QUERY_KEY.test(key)) parsed.searchParams.set(key, '[REDACTED]');
    }
    return parsed.toString();
  } catch {
    return sanitized;
  }
}

export function sanitizeArtifactValue(value, { secrets = [] } = {}) {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeArtifactValue(item, { secrets }));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !isSensitiveArtifactKey(key))
        .map(([key, nested]) => [
          key,
          sanitizeArtifactValue(nested, { secrets }),
        ]),
    );
  }
  if (typeof value === 'string') return sanitizeArtifactString(value, secrets);
  return value;
}

function getProviderFinishReason(payload = {}) {
  return String(
    payload?.finishReason
    || payload?.finish_reason
    || payload?.candidates?.[0]?.finishReason
    || payload?.candidates?.[0]?.finish_reason
    || payload?.outputs?.[0]?.finishReason
    || payload?.outputs?.[0]?.finish_reason
    || '',
  ) || null;
}

export function createUsageTrackingFetch({
  fetchImpl,
  records,
  inputRatePerMillion,
  outputRatePerMillion,
  requestedModel,
  interactionCapture = null,
  interactionMetadata = {},
  secrets = [],
}) {
  return async (url, init) => {
    const startedAt = performance.now();
    const response = await fetchImpl(url, init);
    if (String(url).includes('/interactions')) {
      const responseText = await response.clone().text().catch(() => '');
      let payload;
      try {
        payload = responseText ? JSON.parse(responseText) : {};
      } catch {
        payload = { rawText: responseText };
      }
      const usage = normalizeUsage(payload?.usage || payload?.usageMetadata || {});
      const cost = estimateGeminiCost(usage, inputRatePerMillion, outputRatePerMillion);
      const sanitizedPayload = sanitizeArtifactValue(payload, { secrets });
      const record = {
        interactionNumber: interactionMetadata.interactionNumber ?? null,
        attemptNumber: interactionMetadata.attemptNumber ?? 1,
        retryCount: interactionMetadata.retryCount ?? 0,
        model: String(payload?.model || requestedModel || ''),
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalTokens: usage.totalTokens,
        durationMs: round(performance.now() - startedAt, 3),
        estimatedUsd: cost.estimatedUsd,
        estimatedUsdMethod: cost.method,
        status: response.ok ? 'completed' : 'failed',
      };
      records.push(record);
      if (interactionCapture) {
        interactionCapture.responseBody = sanitizedPayload;
        interactionCapture.generatedText = sanitizeArtifactString(
          parseGeminiInteractionText(payload),
          secrets,
        );
        interactionCapture.usageMetadata = sanitizeArtifactValue(
          payload?.usage || payload?.usageMetadata || {},
          { secrets },
        );
        interactionCapture.finishReason = getProviderFinishReason(payload);
        interactionCapture.providerError = response.ok
          ? null
          : sanitizeArtifactValue(
            payload?.error || { status: response.status, message: response.statusText },
            { secrets },
          );
      }
    }
    return response;
  };
}

export async function runObservedQualityInteraction({
  benchmarkId,
  repeatIndex,
  interactionNumber,
  signal,
  workspace = { brief: {} },
  config,
  model,
  apiKey = '',
  mediaApiToken = '',
  fetchImpl = globalThis.fetch,
  usageRecords = [],
  inputRatePerMillion = null,
  outputRatePerMillion = null,
  analyzeVideo = analyzeSignalQualityVideo,
}) {
  const attemptNumber = 1;
  const retryCount = 0;
  const usageRecordStart = usageRecords.length;
  const startedAt = new Date().toISOString();
  const startedPerformance = performance.now();
  const rawProviderResponse = {
    responseBody: null,
    generatedText: '',
    usageMetadata: {},
    finishReason: null,
    providerError: null,
  };
  const interactionMetadata = {
    benchmarkId,
    repeat: repeatIndex + 1,
    repeatIndex,
    interactionNumber,
    effectiveGeminiModel: model,
    attemptNumber,
    retryCount,
  };
  const trackedFetch = createUsageTrackingFetch({
    fetchImpl,
    records: usageRecords,
    inputRatePerMillion,
    outputRatePerMillion,
    requestedModel: model,
    interactionCapture: rawProviderResponse,
    interactionMetadata,
    secrets: [apiKey, mediaApiToken],
  });
  try {
    const parsedGeminiOutput = await analyzeVideo({
      signal,
      workspace,
      config,
      apiKey,
      mediaApiToken,
      model,
      fetchImpl: trackedFetch,
    });
    const deterministicPolicyResult = applySignalQualityPolicy(parsedGeminiOutput, config);
    const completedAt = new Date().toISOString();
    const latencyMs = performance.now() - startedPerformance;
    return {
      parsedGeminiOutput,
      deterministicPolicyResult,
      usage: usageRecords.slice(usageRecordStart).at(-1) || null,
      latencyMs,
      trace: {
        traceVersion: 1,
        interaction: {
          ...interactionMetadata,
          startedAt,
          completedAt,
          latencyMs: round(latencyMs, 3),
        },
        rawProviderResponse,
        parsedGeminiOutput: sanitizeArtifactValue(parsedGeminiOutput, {
          secrets: [apiKey, mediaApiToken],
        }),
        deterministicPolicyResult: sanitizeArtifactValue(deterministicPolicyResult, {
          secrets: [apiKey, mediaApiToken],
        }),
        linkage: {
          rawToParsed: 'same_interaction_response',
          parsedToPolicy: 'applySignalQualityPolicy(parsedGeminiOutput, productionConfig)',
        },
      },
    };
  } catch (error) {
    const completedAt = new Date().toISOString();
    const latencyMs = performance.now() - startedPerformance;
    if (!rawProviderResponse.providerError) {
      rawProviderResponse.providerError = sanitizeArtifactValue({
        name: error?.name || 'Error',
        message: error?.message || 'unknown_provider_error',
      }, { secrets: [apiKey, mediaApiToken] });
    }
    error.observabilityTrace = {
      traceVersion: 1,
      interaction: {
        ...interactionMetadata,
        startedAt,
        completedAt,
        latencyMs: round(latencyMs, 3),
      },
      rawProviderResponse,
      parsedGeminiOutput: null,
      deterministicPolicyResult: null,
      linkage: {
        rawToParsed: 'failed_before_or_during_schema_parse',
        parsedToPolicy: 'not_run',
      },
    };
    throw error;
  }
}

function loadLocalEnvironmentForLiveRun() {
  const envPath = path.join(REPO_ROOT, '.env');
  if (
    fs.existsSync(envPath)
    && typeof process.loadEnvFile === 'function'
    && (!process.env.GEMINI_API_KEY || !process.env.APIFY_TOKEN)
  ) {
    process.loadEnvFile(envPath);
  }
}

function getLiveSignalVideoUrl(signal = {}) {
  return String(
    signal.videoUrl
    || signal.importedMetadata?.videoUrl
    || signal.importedMetadata?.mediaUrls?.[0]
    || signal.importedMetadata?.apify?.mediaUrls?.[0]
    || '',
  ).trim();
}

function isProtectedApifyUrl(value = '') {
  try {
    const host = new URL(String(value)).hostname.toLowerCase();
    return host === 'api.apify.com' || host.endsWith('.api.apify.com');
  } catch {
    return false;
  }
}

async function downloadLiveMediaOnce({ signal, mediaApiToken, cacheKey }) {
  const sourceUrl = getLiveSignalVideoUrl(signal);
  if (!sourceUrl) throw new Error('live_resolved_video_url_missing');
  const response = await globalThis.fetch(sourceUrl, {
    headers: {
      Accept: 'video/*,*/*;q=0.8',
      ...(isProtectedApifyUrl(sourceUrl) && mediaApiToken
        ? { Authorization: `Bearer ${mediaApiToken}` }
        : {}),
    },
    redirect: 'follow',
  });
  if (!response.ok) throw new Error(`live_media_download_failed_${response.status}`);
  const declaredLength = Number(response.headers.get('content-length') || 0);
  const maxBytes = 100 * 1024 * 1024;
  if (declaredLength > maxBytes) throw new Error('live_media_download_too_large');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length) throw new Error('live_media_download_empty');
  if (bytes.length > maxBytes) throw new Error('live_media_download_too_large');
  return {
    localUrl: `https://signal-filter-soak.local/media/${encodeURIComponent(cacheKey)}`,
    bytes,
    byteLength: bytes.length,
    mimeType: String(response.headers.get('content-type') || 'video/mp4').split(';')[0].trim(),
  };
}

function createMediaCacheFetch(mediaCache) {
  return async (url, init) => {
    const cached = mediaCache.get(String(url));
    if (cached) {
      return new Response(cached.bytes, {
        status: 200,
        headers: {
          'content-type': cached.mimeType,
          'content-length': String(cached.byteLength),
          'x-dzhero-soak-cache': 'hit',
        },
      });
    }
    return globalThis.fetch(url, init);
  };
}

function buildLivePreflight({ mode, cases, repeats, options }) {
  const plannedEvaluations = cases.length * repeats;
  const automaticRetries = parseNumber(options['max-retries'], 0, { min: 0, integer: true });
  const maxVideos = parseNumber(options['max-videos'], null, { min: 1, integer: true });
  const maxPaidUsd = parseNumber(options['max-paid-usd'], null, { min: 0.000001 });
  const maxGeminiAttempts = parseNumber(
    options['max-gemini-attempts'],
    plannedEvaluations,
    { min: 1, integer: true },
  );
  const maxApifyRuns = parseNumber(
    options['max-apify-runs'],
    cases.length,
    { min: 1, integer: true },
  );
  const geminiCeilingUsd = parseNumber(
    options['gemini-ceiling-usd'],
    DEFAULT_GEMINI_CEILING_USD,
    { min: 0.000001 },
  );
  const apifyCeilingUsd = parseNumber(
    options['apify-ceiling-usd'],
    DEFAULT_APIFY_CEILING_USD,
    { min: 0.000001 },
  );
  if (!maxVideos) throw new Error('live_max_videos_required');
  if (!maxPaidUsd) throw new Error('live_max_paid_usd_required');
  if (automaticRetries !== 0) throw new Error('live_automatic_retries_must_be_0');
  if (plannedEvaluations > maxGeminiAttempts) throw new Error('planned_evaluations_exceed_gemini_attempt_cap');
  if (cases.length > maxApifyRuns) throw new Error('planned_resolutions_exceed_apify_run_cap');
  const upperBoundUsd = round(
    plannedEvaluations * geminiCeilingUsd + cases.length * apifyCeilingUsd,
    6,
  );
  if (upperBoundUsd > maxPaidUsd) {
    throw new Error(`live_upper_bound_exceeds_budget_${upperBoundUsd}_gt_${maxPaidUsd}`);
  }
  return {
    mode,
    videoCount: cases.length,
    repeats,
    plannedEvaluations,
    plannedApifyRuns: cases.length,
    maxVideos,
    maxGeminiAttempts,
    maxApifyRuns,
    concurrency: parseNumber(options.concurrency, 1, { min: 1, integer: true }),
    automaticRetries,
    maxPaidUsd,
    geminiCeilingUsd,
    apifyCeilingUsd,
    upperBoundUsd,
    confirmPaid: parseBoolean(options['confirm-paid']),
  };
}

function claimTexts(quality) {
  return [
    quality?.centralIdea,
    quality?.contentMechanic || quality?.transferableMechanic,
    quality?.visualExecution,
    quality?.adaptationTemplate,
    ...(Array.isArray(quality?.observations)
      ? quality.observations.map((item) => item?.description || item?.text)
      : []),
  ].map((value) => String(value || '').trim()).filter(Boolean);
}

function auditClaims(testCase, quality) {
  const texts = claimTexts(quality);
  const combined = normalizeText(texts.join(' '));
  const expectedTerms = (testCase.expectedFacts || [])
    .flatMap((fact) => Array.isArray(fact?.matchTerms) ? fact.matchTerms : [])
    .map(normalizeText)
    .filter(Boolean);
  const forbiddenMatches = [];
  for (const forbidden of testCase.forbiddenClaims || []) {
    for (const pattern of forbidden?.patterns || []) {
      if (combined.includes(normalizeText(pattern))) {
        forbiddenMatches.push({ id: forbidden.id, pattern });
      }
    }
  }
  const unsupportedClaimCandidates = texts
    .filter((text) => {
      if (!expectedTerms.length) return true;
      const normalized = normalizeText(text);
      return !expectedTerms.some((term) => normalized.includes(term))
        && Math.max(...expectedTerms.map((term) => jaccardSimilarity(normalized, term))) < 0.2;
    })
    .map((text) => ({ text, reason: 'low_overlap_with_owner_labelled_facts' }));
  const observations = Array.isArray(quality?.observations) ? quality.observations : [];
  const timestamped = observations.filter((item) => String(item?.timestamp || '').trim()).length;
  return {
    forbiddenMatches,
    unsupportedClaimCandidates,
    timestampedObservations: timestamped,
    observationCount: observations.length,
    timestampCoverage: observations.length ? timestamped / observations.length : 0,
    evidenceAuditRequired: observations.some((item) => !String(item?.timestamp || '').trim())
      || unsupportedClaimCandidates.length > 0,
  };
}

function summarizeLiveEvaluations(evaluations, testCases) {
  const byCase = new Map(testCases.map((item) => [item.id, []]));
  for (const evaluation of evaluations) {
    if (byCase.has(evaluation.caseId)) byCase.get(evaluation.caseId).push(evaluation);
  }
  const cases = [];
  let falseAccepts = 0;
  let falseRejects = 0;
  let expectedRejects = 0;
  let expectedAccepts = 0;
  let schemaFailures = 0;
  let inaccessible = 0;
  let flipComparisons = 0;
  let flips = 0;
  let bankFlipComparisons = 0;
  let bankFlips = 0;
  let uncertainDecisions = 0;
  let timestamped = 0;
  let observations = 0;
  let unsupportedClaimCandidates = 0;
  let missingEvidenceReferences = 0;
  let duplicateEvidenceReferences = 0;
  const latencies = [];
  for (const testCase of testCases) {
    const results = byCase.get(testCase.id) || [];
    const decisions = results.filter((item) => item.decision !== 'error').map((item) => item.decision);
    const bankAdmissions = results
      .filter((item) => item.decision !== 'error')
      .map((item) => item.admittedToBank === true);
    const baseline = decisions[0] || 'error';
    const bankBaseline = bankAdmissions[0] || false;
    for (const decision of decisions.slice(1)) {
      flipComparisons += 1;
      if (decision !== baseline) flips += 1;
    }
    for (const admitted of bankAdmissions.slice(1)) {
      bankFlipComparisons += 1;
      if (admitted !== bankBaseline) bankFlips += 1;
    }
    uncertainDecisions += results.filter((item) => item.decision === 'uncertain').length;
    if (testCase.expectedDecision === 'reject') {
      expectedRejects += results.length;
      falseAccepts += results.filter((item) => item.admittedToBank === true).length;
    } else {
      expectedAccepts += results.length;
      falseRejects += results.filter((item) => item.admittedToBank !== true).length;
    }
    schemaFailures += results.filter((item) => item.schemaFailure).length;
    inaccessible += results.filter((item) => item.inaccessible).length;
    timestamped += results.reduce((total, item) => total + item.audit.timestampedObservations, 0);
    observations += results.reduce((total, item) => total + item.audit.observationCount, 0);
    unsupportedClaimCandidates += results.reduce(
      (total, item) => total + item.audit.unsupportedClaimCandidates.length,
      0,
    );
    missingEvidenceReferences += results.reduce(
      (total, item) => total + (item.missingEvidenceIds?.length || 0),
      0,
    );
    duplicateEvidenceReferences += results.reduce(
      (total, item) => total + (item.duplicateEvidenceIds?.length || 0),
      0,
    );
    latencies.push(...results.map((item) => item.latencyMs).filter(Number.isFinite));
    const dimensions = ['contentValue', 'adaptability', 'topicClarity', 'hookStrength', 'payoffStrength', 'brandRelevance'];
    const scoreSpread = {};
    for (const dimension of dimensions) {
      const values = results
        .map((item) => Number(item.scores?.[dimension]))
        .filter(Number.isFinite);
      scoreSpread[dimension] = values.length ? {
        min: Math.min(...values),
        max: Math.max(...values),
        range: Math.max(...values) - Math.min(...values),
      } : null;
    }
    cases.push({
      id: testCase.id,
      expectedDecision: testCase.expectedDecision,
      decisions,
      bankAdmissions,
      admissionModes: results.map((item) => item.admissionMode || null),
      decisionFlipRate: decisions.length > 1
        ? decisions.slice(1).filter((decision) => decision !== baseline).length / (decisions.length - 1)
        : 0,
      bankAdmissionFlipRate: bankAdmissions.length > 1
        ? bankAdmissions.slice(1)
          .filter((admitted) => admitted !== bankBaseline).length / (bankAdmissions.length - 1)
        : 0,
      scoreSpread,
      centralIdeaSimilarityToFirst: results.slice(1).map((item) => (
        jaccardSimilarity(results[0]?.centralIdea, item.centralIdea)
      )),
      transferableMechanicSimilarityToFirst: results.slice(1).map((item) => (
        jaccardSimilarity(results[0]?.transferableMechanic, item.transferableMechanic)
      )),
      contentMechanicSimilarityToFirst: results.slice(1).map((item) => (
        jaccardSimilarity(results[0]?.contentMechanic, item.contentMechanic)
      )),
      visualExecutionSimilarityToFirst: results.slice(1).map((item) => (
        jaccardSimilarity(results[0]?.visualExecution, item.visualExecution)
      )),
      adaptationTemplateSimilarityToFirst: results.slice(1).map((item) => (
        jaccardSimilarity(results[0]?.adaptationTemplate, item.adaptationTemplate)
      )),
      rejectionReasonSets: results.map((item) => item.rejectionReasons),
    });
  }
  const geminiCosts = evaluations.map((item) => item.geminiEstimatedCostUsd).filter(Number.isFinite);
  const acceptedCount = evaluations.filter((item) => item.decision === 'accept').length;
  const totalGeminiEstimatedCost = geminiCosts.length
    ? geminiCosts.reduce((total, value) => total + value, 0)
    : null;
  return {
    falseAcceptRate: expectedRejects ? falseAccepts / expectedRejects : 0,
    falseRejectRate: expectedAccepts ? falseRejects / expectedAccepts : 0,
    decisionFlipRate: flipComparisons ? flips / flipComparisons : 0,
    bankAdmissionFlipRate: bankFlipComparisons ? bankFlips / bankFlipComparisons : 0,
    uncertainRate: evaluations.length ? uncertainDecisions / evaluations.length : 0,
    schemaFailureRate: evaluations.length ? schemaFailures / evaluations.length : 0,
    inaccessibleVideoRate: evaluations.length ? inaccessible / evaluations.length : 0,
    timestampCoverage: observations ? timestamped / observations : 0,
    unsupportedClaimCandidates,
    missingEvidenceReferences,
    duplicateEvidenceReferences,
    averageCostPerEvaluation: Number.isFinite(totalGeminiEstimatedCost) && evaluations.length
      ? totalGeminiEstimatedCost / evaluations.length
      : null,
    averageCostPerAcceptedSignal: Number.isFinite(totalGeminiEstimatedCost) && acceptedCount
      ? totalGeminiEstimatedCost / acceptedCount
      : null,
    totalGeminiEstimatedCost,
    latencyMs: {
      p50: percentile(latencies, 0.5),
      p95: percentile(latencies, 0.95),
    },
    cases,
  };
}

function compactMarkdownCell(value, maxLength = 180) {
  const text = String(value || '')
    .replace(/\|/g, '\\|')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

export function resolveContentMechanicEvidence(evaluation = {}) {
  const observations = Array.isArray(evaluation.observations) ? evaluation.observations : [];
  const observationsById = new Map(
    observations
      .filter((observation) => String(observation?.id || '').trim())
      .map((observation) => [String(observation.id).trim(), observation]),
  );
  const ids = [...new Set(
    (Array.isArray(evaluation.contentMechanicEvidenceIds)
      ? evaluation.contentMechanicEvidenceIds
      : [])
      .map((id) => String(id || '').trim())
      .filter(Boolean),
  )];
  return ids.map((id) => ({
    id,
    observation: observationsById.get(id) || null,
    matched: observationsById.has(id),
  }));
}

function buildLiveSummary({ mode, report }) {
  const metrics = report.metrics;
  const lines = [
    `# DZHERO Signal Filter ${mode}`,
    '',
    `Status: ${report.status}`,
    `Effective Gemini model: ${report.effectiveGeminiModel}`,
    `Policy: ${report.preflight.policy} v${report.preflight.policyVersion}`,
    `maxVideoAnalysesPerRun: ${report.preflight.maxVideoAnalysesPerRun}`,
    `Concurrency: ${report.preflight.concurrency}`,
    `Automatic retries: ${report.providerCalls.retries}`,
    `Evaluations completed: ${report.evaluations.length}`,
    `Decision flip rate: ${round(metrics.decisionFlipRate, 4)}`,
    `Bank-admission flip rate: ${round(metrics.bankAdmissionFlipRate, 4)}`,
    `Uncertain rate: ${round(metrics.uncertainRate, 4)}`,
    `False accept rate: ${round(metrics.falseAcceptRate, 4)}`,
    `False reject rate: ${round(metrics.falseRejectRate, 4)}`,
    `Missing evidence references: ${metrics.missingEvidenceReferences}`,
    `Duplicate evidence references: ${metrics.duplicateEvidenceReferences}`,
    `Total Apify cost: $${round(metrics.totalApifyCost, 8)}`,
    `Total Gemini estimated cost: ${Number.isFinite(metrics.totalGeminiEstimatedCost) ? `$${round(metrics.totalGeminiEstimatedCost, 8)}` : 'unknown'}`,
    `Budget accounted: $${round(report.budget.accountedUsd, 8)} / $${report.budget.limitUsd}`,
    `Apify actor runs: ${report.providerCalls.apify}`,
    `Media downloads: ${report.providerCalls.mediaDownloads}`,
    `Benchmark media persisted: ${report.mediaPersistence?.mediaPersisted === true}`,
    `Evidence frames persisted: ${report.evidenceFrames?.frameCount ?? 0}`,
    `Evidence frame extraction errors: ${report.evidenceFrames?.extractionErrors ?? 0}`,
    `Gemini interactions: ${report.providerCalls.gemini}`,
    `Gemini attempts: ${report.providerCalls.geminiAttempts}`,
    `Total tokens: ${report.usageTotals?.totalTokens ?? 'unknown'}`,
    `Runtime DB unchanged: ${report.runtimeDb.unchanged}`,
    `Production policy unchanged: ${report.integrity.signalPolicyUnchanged}`,
    `Production config unchanged: ${report.integrity.signalConfigUnchanged}`,
    '',
  ];
  for (const caseMetrics of metrics.cases) {
    const evaluations = report.evaluations.filter((item) => item.caseId === caseMetrics.id);
    const mediaRecord = report.mediaPersistence?.records?.find(
      (item) => item.benchmarkId === caseMetrics.id,
    );
    lines.push(
      `## ${caseMetrics.id}`,
      '',
      `Expected: ${caseMetrics.expectedDecision}; decision flip rate: ${round(caseMetrics.decisionFlipRate, 4)}; bank-admission flip rate: ${round(caseMetrics.bankAdmissionFlipRate, 4)}`,
      `Media: ${mediaRecord?.relativePath || '(missing)'}; persisted=${mediaRecord?.mediaPersisted === true}; SHA-256=${mediaRecord?.sha256 || '(missing)'}; downloads=${mediaRecord?.downloadCount ?? 0}`,
      '',
      '| Interaction | Repeat | Decision | Admitted | Mode | Reasons | Scores C/A/T/H/P | Observations | Claims E/D/I | Missing refs | Tokens in/out/total | Latency ms | Cost USD |',
      '| ---: | ---: | :---: | :---: | --- | --- | :---: | ---: | :---: | ---: | :---: | ---: | ---: |',
    );
    for (const evaluation of evaluations) {
      const usage = evaluation.usage || {};
      const claims = Object.values(evaluation.derivedClaims || {});
      const claimCounts = {
        explicit: claims.filter((claim) => claim?.supportLevel === 'explicit').length,
        demonstrated: claims.filter((claim) => claim?.supportLevel === 'demonstrated').length,
        inferred: claims.filter((claim) => claim?.supportLevel === 'inferred').length,
      };
      lines.push(`| ${evaluation.interactionNumber} | ${evaluation.repeatIndex + 1} | ${evaluation.decision} | ${evaluation.admittedToBank === true} | ${evaluation.admissionMode || '(none)'} | ${compactMarkdownCell([...(evaluation.rejectionReasons || []), ...(evaluation.uncertaintyReasons || [])].join(', '))} | ${evaluation.scores?.contentValue ?? ''}/${evaluation.scores?.adaptability ?? ''}/${evaluation.scores?.topicClarity ?? ''}/${evaluation.scores?.hookStrength ?? ''}/${evaluation.scores?.payoffStrength ?? ''} | ${evaluation.observations?.length ?? 0} | ${claimCounts.explicit}/${claimCounts.demonstrated}/${claimCounts.inferred} | ${evaluation.missingEvidenceIds?.length ?? 0} | ${usage.inputTokens ?? '?'}/${usage.outputTokens ?? '?'}/${usage.totalTokens ?? '?'} | ${round(evaluation.latencyMs, 1)} | ${evaluation.geminiEstimatedCostUsd ?? '?'} |`);
    }
    lines.push('', '### Observations and evidence audit', '');
    for (const evaluation of evaluations) {
      lines.push(`Repeat ${evaluation.repeatIndex + 1}:`);
      lines.push(`- Trace: interaction ${evaluation.interactionNumber}, attempt ${evaluation.attemptNumber}, retries ${evaluation.retryCount}, raw captured ${Boolean(evaluation.trace?.rawProviderResponse?.responseBody)}, finish reason ${evaluation.trace?.rawProviderResponse?.finishReason || '(none)'}`);
      lines.push(`- Provider pass: ${evaluation.providerPass ?? '(not supplied)'}; final decision: ${evaluation.decision}; admitted to bank: ${evaluation.admittedToBank === true}; qualifying mode: ${evaluation.admissionMode || '(none)'}`);
      lines.push(`- Uncertainty reasons: ${evaluation.uncertaintyReasons?.join(', ') || '(none)'}`);
      lines.push(`- Provider-proposed mode: ${evaluation.providerMode || '(not supplied)'}`);
      lines.push(`- Missing evidence IDs: ${evaluation.missingEvidenceIds?.join(', ') || '(none)'}`);
      lines.push(`- Duplicate evidence IDs: ${evaluation.duplicateEvidenceIds?.join(', ') || '(none)'}`);
      lines.push(`- Evidence frames: ${evaluation.evidenceFrames?.filter((frame) => frame.framePersisted).length || 0} persisted; ${evaluation.evidenceFrames?.filter((frame) => !frame.framePersisted).length || 0} errors`);
      for (const frame of evaluation.evidenceFrames || []) {
        lines.push(`  - ${frame.observationId} @ ${frame.timestamp ?? frame.observationTimestamp}: ${frame.relativePath || '(not persisted)'}; SHA-256=${frame.sha256 || '(none)'}; error=${compactMarkdownCell(frame.extractionError, 300) || '(none)'}`);
      }
      for (const [claimName, claim] of Object.entries(evaluation.derivedClaims || {})) {
        lines.push(`- ${claimName} [${claim.supportLevel}]: ${compactMarkdownCell(claim.text, 500) || '(empty)'}`);
        lines.push(`  - evidenceIds: ${claim.evidenceIds?.join(', ') || '(none)'}`);
        for (const evidenceId of claim.evidenceIds || []) {
          const observation = evaluation.observations?.find((item) => item.id === evidenceId);
          if (!observation) {
            lines.push(`  - ${evidenceId} → MISSING OBSERVATION`);
          } else {
            lines.push(`  - ${evidenceId} → ${observation.timestamp ? `[${observation.timestamp}] ` : '[no timestamp] '}${compactMarkdownCell(observation.description, 500)} (${observation.source}, ${observation.kind}, confidence ${observation.confidence})`);
          }
        }
      }
      lines.push(`- Evidence chains: ${evaluation.evidenceChains?.length || 0}`);
      for (const chain of evaluation.causalChainValidation || []) {
        lines.push(`  - ${chain.mode}: valid=${chain.valid}; ids=${chain.evidenceIds?.join(', ') || '(none)'}; subject=${compactMarkdownCell(chain.subject, 300)}; before=${compactMarkdownCell(chain.beforeState, 300)}; after=${compactMarkdownCell(chain.afterState, 300)}; issues=${chain.issues?.join(', ') || '(none)'}`);
      }
      const mechanicEvidence = resolveContentMechanicEvidence(evaluation);
      lines.push(`- contentMechanicEvidenceIds: ${mechanicEvidence.length ? mechanicEvidence.map((item) => item.id).join(', ') : '(none)'}`);
      for (const evidence of mechanicEvidence) {
        if (!evidence.observation) {
          lines.push(`  - ${evidence.id} → MISSING OBSERVATION`);
          continue;
        }
        const observation = evidence.observation;
        lines.push(`  - ${evidence.id} → ${observation.timestamp ? `[${observation.timestamp}] ` : '[no timestamp] '}${compactMarkdownCell(observation.description || observation.text, 500)} (${observation.source || observation.sourceType}, ${observation.kind || 'legacy_kind'}, confidence ${observation.confidence})`);
      }
      const observations = Array.isArray(evaluation.observations) ? evaluation.observations : [];
      if (!observations.length) {
        lines.push('- No observations returned.');
      } else {
        for (const observation of observations) {
          lines.push(`- ${observation.timestamp ? `[${observation.timestamp}] ` : '[no timestamp] '}${compactMarkdownCell(observation.description || observation.text, 500)} (${observation.source || observation.sourceType}, ${observation.kind || 'legacy_kind'}, confidence ${observation.confidence})`);
        }
      }
      const unsupported = evaluation.audit?.unsupportedClaimCandidates || [];
      lines.push(`- Unsupported-claim candidates for human audit: ${unsupported.length}`);
      for (const candidate of unsupported) {
        lines.push(`  - ${compactMarkdownCell(candidate.text, 500)}`);
      }
      lines.push(`- Raw slopIndicators: ${evaluation.rawSlopIndicators?.join(', ') || '(none)'}`);
      lines.push(`- Unknowns: ${evaluation.unknowns?.join(' | ') || '(none)'}`);
    }
    lines.push('', '### Score spread', '');
    for (const [dimension, spread] of Object.entries(caseMetrics.scoreSpread || {})) {
      lines.push(`- ${dimension}: min ${spread?.min ?? 'n/a'}, max ${spread?.max ?? 'n/a'}, range ${spread?.range ?? 'n/a'}`);
    }
    lines.push('');
  }
  lines.push(
    'Missing timestamps are evidence-audit flags, not proven hallucinations. Unsupported-claim candidates use owner-labelled facts and lexical overlap; Gemini is not used to judge its own claims.',
    '',
  );
  return lines.join('\n');
}

async function runLiveMode(mode, options = {}) {
  const runtimeDbHashBefore = hashFileIfPresent(RUNTIME_DB_PATH);
  const policyHashBefore = hashFileIfPresent(SIGNAL_POLICY_PATH);
  const configHashBefore = hashFileIfPresent(SIGNAL_CONFIG_PATH);
  const outputDirectory = resolveOutputDirectory(options['output-dir']);
  const outputDirectoryProbe = probeOutputDirectoryWritable(outputDirectory);
  const frameExtractorProbe = await probeEvidenceFrameExtractor();
  if (!outputDirectoryProbe.writable) throw new Error('live_output_directory_not_writable');
  if (!frameExtractorProbe.available) throw new Error('live_evidence_frame_extractor_unavailable');
  const { resolvedPath, manifest } = readManifest(options.manifest || DEFAULT_MANIFEST);
  const maxVideos = parseNumber(options['max-videos'], null, { min: 1, integer: true });
  if (!maxVideos) throw new Error('live_max_videos_required');
  const selectedCases = manifest.cases.slice(0, maxVideos);
  const repeats = parseNumber(options.repeats, mode === 'consistency' ? 3 : 1, { min: 1, integer: true });
  loadLocalEnvironmentForLiveRun();
  const apiKey = process.env.GEMINI_API_KEY || '';
  const apifyToken = process.env.APIFY_TOKEN || '';
  const config = loadSignalQualityGateConfig();
  const requestedModel = process.env.GEMINI_VIDEO_MODEL
    || process.env.GEMINI_VISION_MODEL
    || 'gemini-3.5-flash';
  const preflight = {
    ...buildLivePreflight({ mode, cases: selectedCases, repeats, options }),
    effectiveGeminiModel: requestedModel,
    policyVersion: Number(config.version),
    policy: String(config.policy || ''),
    maxVideoAnalysesPerRun: Number(config.maxVideoAnalysesPerRun),
    manifest: resolvedPath,
    benchmarkIds: selectedCases.map((item) => item.id),
    credentialsPresent: {
      gemini: Boolean(apiKey),
      apify: Boolean(apifyToken),
    },
    mediaPersistence: {
      enabled: true,
      exactBytes: true,
      transcodeApplied: false,
      mediaDirectory: 'media',
      outputDirectoryWritable: outputDirectoryProbe.writable,
      downloadOncePerBenchmark: true,
    },
    evidenceFrameExtraction: frameExtractorProbe,
    runtimeDbSha256: runtimeDbHashBefore,
  };
  const baseReport = {
    reportVersion: 2,
    mode,
    generatedAt: new Date().toISOString(),
    manifest: resolvedPath,
    suite: manifest.suite,
    benchmarkIds: selectedCases.map((item) => item.id),
    effectiveGeminiModel: requestedModel,
    preflight,
    observability: {
      traceVersion: 1,
      rawProviderResponseCaptured: true,
      parsedGeminiOutputCaptured: true,
      deterministicPolicyResultCaptured: true,
      threeStateDecisionCaptured: true,
      bankAdmissionCaptured: true,
      providerDecisionCaptured: true,
      uncertaintyCaptured: true,
      evidenceChainsCaptured: true,
      causalChainValidationCaptured: true,
      mediaPersistenceCaptured: true,
      evidenceFramesCaptured: true,
      requestHeadersCaptured: false,
      requestUrlsCaptured: false,
      ownerAnnotationsUsed: false,
      secretRedactionEnabled: true,
    },
    providerCalls: {
      apify: 0,
      gemini: 0,
      mediaDownloads: 0,
      retries: 0,
    },
    runtimeDb: {
      path: RUNTIME_DB_PATH,
      sha256Before: runtimeDbHashBefore,
      sha256After: null,
      unchanged: null,
    },
    integrity: {
      signalPolicySha256Before: policyHashBefore,
      signalPolicySha256After: null,
      signalPolicyUnchanged: null,
      signalConfigSha256Before: configHashBefore,
      signalConfigSha256After: null,
      signalConfigUnchanged: null,
    },
    mediaPersistence: {
      enabled: true,
      exactBytes: true,
      transcodeApplied: false,
      mediaDirectory: 'media',
      outputDirectoryWritable: outputDirectoryProbe.writable,
      mediaPersisted: null,
      records: [],
    },
    evidenceFrames: {
      enabled: true,
      method: frameExtractorProbe.method,
      fullVideoIsSourceOfTruth: true,
      frameCount: 0,
      extractionErrors: 0,
      records: [],
    },
  };
  console.log(JSON.stringify({ paidPreflight: preflight }, null, 2));
  if (!preflight.confirmPaid) {
    const report = {
      ...baseReport,
      status: 'preflight_passed',
      runtimeDb: {
        ...baseReport.runtimeDb,
        sha256After: runtimeDbHashBefore,
        unchanged: true,
      },
      integrity: {
        ...baseReport.integrity,
        signalPolicySha256After: policyHashBefore,
        signalPolicyUnchanged: true,
        signalConfigSha256After: configHashBefore,
        signalConfigUnchanged: true,
      },
      evaluations: [],
    };
    const summary = [
      '# Paid signal-filter preflight',
      '',
      'Status: passed; no provider calls were made.',
      `Effective Gemini model: ${requestedModel}`,
      `Policy: ${config.policy} v${config.version}`,
      `maxVideoAnalysesPerRun: ${config.maxVideoAnalysesPerRun}`,
      `Concurrency: ${preflight.concurrency}`,
      `Automatic retries: ${preflight.automaticRetries}`,
      `Planned Gemini interactions: ${preflight.plannedEvaluations}`,
      `Planned Apify runs: ${preflight.plannedApifyRuns}`,
      `Budget ceiling: $${preflight.upperBoundUsd} / $${preflight.maxPaidUsd}`,
      `Benchmark IDs: ${preflight.benchmarkIds.join(', ')}`,
      `Runtime DB SHA-256: ${runtimeDbHashBefore}`,
      `Credentials: Gemini ${preflight.credentialsPresent.gemini ? 'available' : 'missing'}; Apify ${preflight.credentialsPresent.apify ? 'available' : 'missing'} (values omitted).`,
      `Media persistence: enabled; exact bytes; output writable=${outputDirectoryProbe.writable}; directory=media/.`,
      `Evidence frames: enabled; method=${frameExtractorProbe.method}; MP4 support=${frameExtractorProbe.codecSupport.mp4 || 'none'}.`,
      'Observability: raw provider response → parsed Gemini output → deterministic policy result.',
      '',
      'Re-run only with explicit owner approval and `--confirm-paid`.',
      '',
    ].join('\n');
    const artifacts = writeReportArtifacts(report, summary, outputDirectory);
    return {
      report,
      summary,
      artifacts,
    };
  }
  if (!apiKey || !apifyToken) throw new Error('live_provider_credentials_missing');
  const inputRatePerMillion = parseNumber(options['gemini-input-usd-per-million'], null, { min: 0 });
  const outputRatePerMillion = parseNumber(options['gemini-output-usd-per-million'], null, { min: 0 });
  if (!Number.isFinite(inputRatePerMillion) || !Number.isFinite(outputRatePerMillion)) {
    throw new Error('live_gemini_token_rates_required');
  }
  if (preflight.concurrency !== 1) {
    throw new Error('live_paid_concurrency_must_be_1');
  }
  const resolved = [];
  let apifyCost = 0;
  let accountedApifyCost = 0;
  const mediaCache = new Map();
  const mediaPersistenceRecords = [];
  for (const [caseIndex, testCase] of selectedCases.entries()) {
    if (resolved.length >= preflight.maxApifyRuns) break;
    if (accountedApifyCost + preflight.apifyCeilingUsd > preflight.maxPaidUsd) {
      throw new Error('live_budget_would_be_reached_before_apify');
    }
    const signals = await fetchApifySignals({
      token: apifyToken,
      platform: testCase.platform,
      mode: 'url',
      input: testCase.url,
      inputType: 'url',
      inputValue: testCase.url,
      limit: 1,
      downloadVideo: true,
      downloadVideos: true,
      workspaceId: 'ws_signal_filter_live_benchmark',
      market: 'global',
    });
    baseReport.providerCalls.apify += 1;
    const actualCost = Number(signals.actualCostUsd);
    const accountedCost = Number.isFinite(actualCost) ? actualCost : preflight.apifyCeilingUsd;
    if (Number.isFinite(actualCost)) apifyCost += actualCost;
    accountedApifyCost += accountedCost;
    if (accountedApifyCost >= preflight.maxPaidUsd) {
      throw new Error('live_budget_reached_after_apify');
    }
    const signal = signals[0];
    if (!signal) {
      resolved.push({ testCase, signal: null, resolutionError: 'video_unavailable' });
      continue;
    }
    const cachedMedia = await downloadLiveMediaOnce({
      signal,
      mediaApiToken: apifyToken,
      cacheKey: testCase.id,
    });
    baseReport.providerCalls.mediaDownloads += 1;
    const mediaPersistenceRecord = persistBenchmarkMedia({
      outputDirectory,
      benchmarkId: testCase.id,
      bytes: cachedMedia.bytes,
      mimeType: cachedMedia.mimeType,
      downloadCount: 1,
      evaluationLinks: Array.from({ length: repeats }, (_, repeatIndex) => ({
        interactionNumber: (caseIndex * repeats) + repeatIndex + 1,
        repeat: repeatIndex + 1,
      })),
    });
    mediaPersistenceRecords.push(mediaPersistenceRecord);
    if (!mediaPersistenceRecord.mediaPersisted) {
      resolved.push({
        testCase,
        signal: null,
        resolutionError: 'media_persistence_failed',
        media: {
          byteLength: cachedMedia.byteLength,
          mimeType: cachedMedia.mimeType,
        },
      });
      break;
    }
    mediaCache.set(cachedMedia.localUrl, cachedMedia);
    const cachedSignal = {
      ...signal,
      videoUrl: cachedMedia.localUrl,
      importedMetadata: {
        ...(signal.importedMetadata || {}),
        videoUrl: cachedMedia.localUrl,
        mediaUrls: [cachedMedia.localUrl],
      },
    };
    resolved.push({
      testCase,
      signal: cachedSignal,
      resolutionError: null,
      media: {
        byteLength: cachedMedia.byteLength,
        mimeType: cachedMedia.mimeType,
      },
    });
  }
  const mediaPersistence = buildMediaPersistenceReport({
    outputDirectory,
    expectedBenchmarkIds: selectedCases.map((item) => item.id),
    records: mediaPersistenceRecords,
    outputDirectoryWritable: outputDirectoryProbe.writable,
  });
  baseReport.mediaPersistence = mediaPersistence;
  try {
    validatePersistedBenchmarkMedia(
      mediaPersistence.records,
      selectedCases.map((item) => item.id),
    );
  } catch (error) {
    const runtimeDbHashAfter = hashFileIfPresent(RUNTIME_DB_PATH);
    const policyHashAfter = hashFileIfPresent(SIGNAL_POLICY_PATH);
    const configHashAfter = hashFileIfPresent(SIGNAL_CONFIG_PATH);
    const report = {
      ...baseReport,
      status: 'media_persistence_failed',
      apifyActualCostUsd: round(apifyCost, 8),
      resolvedMedia: resolved.map((item) => ({
        caseId: item.testCase.id,
        resolutionError: item.resolutionError,
        byteLength: item.media?.byteLength ?? null,
        mimeType: item.media?.mimeType ?? null,
      })),
      budget: {
        limitUsd: preflight.maxPaidUsd,
        accountedApifyUsd: round(accountedApifyCost, 8),
        accountedGeminiUsd: 0,
        accountedUsd: round(accountedApifyCost, 8),
        stopped: true,
        skippedEvaluations: preflight.plannedEvaluations,
      },
      runtimeDb: {
        ...baseReport.runtimeDb,
        sha256After: runtimeDbHashAfter,
        unchanged: runtimeDbHashBefore === runtimeDbHashAfter,
      },
      integrity: {
        ...baseReport.integrity,
        signalPolicySha256After: policyHashAfter,
        signalPolicyUnchanged: policyHashBefore === policyHashAfter,
        signalConfigSha256After: configHashAfter,
        signalConfigUnchanged: configHashBefore === configHashAfter,
      },
      usage: [],
      usageTotals: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      evaluations: [],
      skippedEvaluations: [],
    };
    const summary = [
      '# DZHERO Signal Filter media persistence failure',
      '',
      'Status: failed closed before Gemini interactions.',
      `Reason: ${error.message}`,
      `Apify actor runs: ${baseReport.providerCalls.apify}`,
      `Media downloads: ${baseReport.providerCalls.mediaDownloads}`,
      '',
    ].join('\n');
    const artifacts = writeReportArtifacts(report, summary, outputDirectory);
    error.message = `${error.message}; report=${artifacts.reportPath}`;
    throw error;
  }
  const evaluationJobs = resolved
    .flatMap((item) => (
      Array.from({ length: repeats }, (_, repeatIndex) => ({ ...item, repeatIndex }))
    ))
    .map((job, index) => ({ ...job, interactionNumber: index + 1 }));
  const usageRecords = [];
  let geminiAttempts = 0;
  let accountedGeminiCost = 0;
  let budgetStopped = false;
  const mediaCacheFetch = createMediaCacheFetch(mediaCache);
  const pool = await runWorkerPool(evaluationJobs, preflight.concurrency, async (job) => {
    const startedAt = performance.now();
    if (!job.signal) {
      return {
        caseId: job.testCase.id,
        repeatIndex: job.repeatIndex,
        interactionNumber: job.interactionNumber,
        attemptNumber: 1,
        retryCount: 0,
        decision: 'error',
        admittedToBank: false,
        schemaFailure: false,
        inaccessible: true,
        scores: {},
        centralIdea: '',
        contentMechanic: '',
        visualExecution: '',
        adaptationTemplate: '',
        transferableMechanic: '',
        rejectionReasons: ['video_unavailable'],
        observations: [],
        contentMechanicEvidenceIds: [],
        providerPass: null,
        providerMode: null,
        derivedClaims: {},
        rawSlopIndicators: [],
        unknowns: [],
        evidenceChains: [],
        causalChainValidation: [],
        uncertaintyReasons: ['video_unavailable'],
        missingEvidenceIds: [],
        duplicateEvidenceIds: [],
        qualityScore: null,
        evidenceConfidence: 0,
        usage: null,
        latencyMs: performance.now() - startedAt,
        geminiEstimatedCostUsd: null,
        trace: {
          traceVersion: 1,
          interaction: {
            benchmarkId: job.testCase.id,
            repeat: job.repeatIndex + 1,
            repeatIndex: job.repeatIndex,
            interactionNumber: job.interactionNumber,
            effectiveGeminiModel: requestedModel,
            attemptNumber: 1,
            retryCount: 0,
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            latencyMs: round(performance.now() - startedAt, 3),
          },
          rawProviderResponse: {
            responseBody: null,
            generatedText: '',
            usageMetadata: {},
            finishReason: null,
            providerError: { message: 'video_unavailable' },
          },
          parsedGeminiOutput: null,
          deterministicPolicyResult: null,
          linkage: {
            rawToParsed: 'not_run',
            parsedToPolicy: 'not_run',
          },
        },
        audit: {
          forbiddenMatches: [],
          unsupportedClaimCandidates: [],
          timestampedObservations: 0,
          observationCount: 0,
          timestampCoverage: 0,
          evidenceAuditRequired: true,
        },
      };
    }
    if (
      budgetStopped
      || accountedApifyCost + accountedGeminiCost + preflight.geminiCeilingUsd > preflight.maxPaidUsd
    ) {
      budgetStopped = true;
      return {
        caseId: job.testCase.id,
        repeatIndex: job.repeatIndex,
        skipped: true,
        skipReason: 'paid_budget_would_be_reached',
      };
    }
    if (geminiAttempts >= preflight.maxGeminiAttempts) {
      throw new Error('live_gemini_attempt_cap_reached');
    }
    geminiAttempts += 1;
    baseReport.providerCalls.gemini += 1;
    const recordStart = usageRecords.length;
    try {
      const observed = await runObservedQualityInteraction({
        benchmarkId: job.testCase.id,
        repeatIndex: job.repeatIndex,
        interactionNumber: job.interactionNumber,
        signal: job.signal,
        workspace: { brief: {} },
        config,
        model: requestedModel,
        apiKey,
        mediaApiToken: apifyToken,
        fetchImpl: mediaCacheFetch,
        usageRecords,
        inputRatePerMillion,
        outputRatePerMillion,
      });
      const quality = observed.deterministicPolicyResult;
      const parsed = observed.parsedGeminiOutput;
      const usage = observed.usage;
      accountedGeminiCost += Number.isFinite(usage?.estimatedUsd)
        ? usage.estimatedUsd
        : preflight.geminiCeilingUsd;
      if (accountedApifyCost + accountedGeminiCost >= preflight.maxPaidUsd) {
        budgetStopped = true;
      }
      return {
        caseId: job.testCase.id,
        repeatIndex: job.repeatIndex,
        interactionNumber: job.interactionNumber,
        attemptNumber: 1,
        retryCount: 0,
        decision: quality.decision,
        admittedToBank: quality.admittedToBank === true,
        admissionMode: quality.admissionMode,
        passedModes: quality.passedModes,
        modeResults: quality.modeResults,
        schemaFailure: false,
        inaccessible: quality.rejectionReasons.includes('video_unavailable'),
        qualityScore: quality.qualityScore,
        brandRelevance: quality.brandRelevance,
        scores: quality.scores,
        summary: quality.summary,
        centralIdea: quality.centralIdea,
        contentMechanic: quality.contentMechanic,
        visualExecution: quality.visualExecution,
        adaptationTemplate: quality.adaptationTemplate,
        derivedClaims: quality.derivedClaims,
        providerPass: parsed.pass ?? null,
        providerMode: parsed.proposedMode
          || parsed.providerMode
          || parsed.selectedEvidenceMode
          || null,
        rawSlopIndicators: [...parsed.slopIndicators],
        unknowns: [...parsed.unknowns],
        evidenceChains: Array.isArray(quality.evidenceChains)
          ? quality.evidenceChains.map((chain) => ({
            ...chain,
            ambiguityReasons: [...chain.ambiguityReasons],
          }))
          : [],
        causalChainValidation: Array.isArray(quality.causalChainValidation)
          ? quality.causalChainValidation.map((chain) => ({
            ...chain,
            evidenceIds: [...chain.evidenceIds],
            ambiguityReasons: [...chain.ambiguityReasons],
            issues: [...chain.issues],
          }))
          : [],
        uncertaintyReasons: [...quality.uncertaintyReasons],
        transferableMechanic: quality.transferableMechanic,
        contentMechanicEvidenceIds: Array.isArray(quality.contentMechanicEvidenceIds)
          ? [...quality.contentMechanicEvidenceIds]
          : [],
        rejectionReasons: quality.rejectionReasons,
        missingEvidenceIds: [...quality.missingEvidenceIds],
        duplicateEvidenceIds: [...quality.duplicateEvidenceIds],
        observations: quality.observations,
        evidenceConfidence: quality.evidenceConfidence,
        latencyMs: observed.latencyMs,
        geminiEstimatedCostUsd: usage?.estimatedUsd ?? null,
        usage: usage || null,
        trace: observed.trace,
        audit: auditClaims(job.testCase, quality),
      };
    } catch (error) {
      const usage = usageRecords.slice(recordStart).at(-1);
      accountedGeminiCost += Number.isFinite(usage?.estimatedUsd)
        ? usage.estimatedUsd
        : preflight.geminiCeilingUsd;
      if (accountedApifyCost + accountedGeminiCost >= preflight.maxPaidUsd) {
        budgetStopped = true;
      }
      return {
        caseId: job.testCase.id,
        repeatIndex: job.repeatIndex,
        interactionNumber: job.interactionNumber,
        attemptNumber: 1,
        retryCount: 0,
        decision: 'error',
        admittedToBank: false,
        schemaFailure: isSchemaFailure(error),
        inaccessible: /unavailable|download/i.test(String(error?.message || '')),
        qualityScore: null,
        brandRelevance: null,
        scores: {},
        summary: '',
        centralIdea: '',
        contentMechanic: '',
        visualExecution: '',
        adaptationTemplate: '',
        transferableMechanic: '',
        contentMechanicEvidenceIds: [],
        providerPass: null,
        providerMode: null,
        derivedClaims: {},
        rawSlopIndicators: [],
        unknowns: [],
        evidenceChains: [],
        causalChainValidation: [],
        uncertaintyReasons: ['evaluation_error'],
        missingEvidenceIds: [],
        duplicateEvidenceIds: [],
        rejectionReasons: [],
        observations: [],
        evidenceConfidence: 0,
        latencyMs: performance.now() - startedAt,
        geminiEstimatedCostUsd: usage?.estimatedUsd ?? null,
        usage: usage || null,
        trace: error.observabilityTrace || null,
        audit: {
          forbiddenMatches: [],
          unsupportedClaimCandidates: [],
          timestampedObservations: 0,
          observationCount: 0,
          timestampCoverage: 0,
          evidenceAuditRequired: true,
        },
      };
    }
  });
  const completedEvaluations = pool.results.filter((item) => !item.skipped);
  const skippedEvaluations = pool.results.filter((item) => item.skipped);
  const evidenceFrames = await extractEvidenceFrames({
    outputDirectory,
    mediaRecords: mediaPersistence.records,
    evaluations: completedEvaluations,
  });
  const metrics = summarizeLiveEvaluations(completedEvaluations, selectedCases);
  const acceptedCount = completedEvaluations.filter((item) => item.decision === 'accept').length;
  const totalKnownProviderCost = Number.isFinite(metrics.totalGeminiEstimatedCost)
    ? apifyCost + metrics.totalGeminiEstimatedCost
    : null;
  metrics.averageCostPerEvaluation = Number.isFinite(totalKnownProviderCost) && completedEvaluations.length
    ? totalKnownProviderCost / completedEvaluations.length
    : null;
  metrics.averageCostPerAcceptedSignal = Number.isFinite(totalKnownProviderCost) && acceptedCount
    ? totalKnownProviderCost / acceptedCount
    : null;
  baseReport.providerCalls.geminiAttempts = geminiAttempts;
  const usageTotals = usageRecords.reduce((totals, usage) => ({
    inputTokens: totals.inputTokens + (Number(usage.inputTokens) || 0),
    outputTokens: totals.outputTokens + (Number(usage.outputTokens) || 0),
    totalTokens: totals.totalTokens + (Number(usage.totalTokens) || 0),
  }), { inputTokens: 0, outputTokens: 0, totalTokens: 0 });
  const report = {
    ...baseReport,
    status: skippedEvaluations.length ? 'stopped_budget' : 'completed',
    apifyActualCostUsd: round(apifyCost, 8),
    resolvedMedia: resolved.map((item) => ({
      caseId: item.testCase.id,
      resolutionError: item.resolutionError,
      byteLength: item.media?.byteLength ?? null,
      mimeType: item.media?.mimeType ?? null,
    })),
    usage: usageRecords,
    usageTotals,
    evidenceFrames,
    budget: {
      limitUsd: preflight.maxPaidUsd,
      accountedApifyUsd: round(accountedApifyCost, 8),
      accountedGeminiUsd: round(accountedGeminiCost, 8),
      accountedUsd: round(accountedApifyCost + accountedGeminiCost, 8),
      stopped: budgetStopped,
      skippedEvaluations: skippedEvaluations.length,
    },
    metrics: {
      ...metrics,
      totalApifyCost: round(apifyCost, 8),
      totalGeminiEstimatedCost: metrics.totalGeminiEstimatedCost,
    },
    evaluations: completedEvaluations,
    skippedEvaluations,
  };
  const runtimeDbHashAfter = hashFileIfPresent(RUNTIME_DB_PATH);
  const policyHashAfter = hashFileIfPresent(SIGNAL_POLICY_PATH);
  const configHashAfter = hashFileIfPresent(SIGNAL_CONFIG_PATH);
  report.runtimeDb.sha256After = runtimeDbHashAfter;
  report.runtimeDb.unchanged = runtimeDbHashBefore === runtimeDbHashAfter;
  report.integrity.signalPolicySha256After = policyHashAfter;
  report.integrity.signalPolicyUnchanged = policyHashBefore === policyHashAfter;
  report.integrity.signalConfigSha256After = configHashAfter;
  report.integrity.signalConfigUnchanged = configHashBefore === configHashAfter;
  if (!report.runtimeDb.unchanged) {
    throw new Error('runtime_db_changed_during_live_soak');
  }
  if (!report.integrity.signalPolicyUnchanged || !report.integrity.signalConfigUnchanged) {
    throw new Error('signal_quality_production_files_changed_during_live_soak');
  }
  const summary = buildLiveSummary({ mode, report });
  const artifacts = writeReportArtifacts(report, summary, outputDirectory);
  return { report, summary, artifacts };
}

function finalizeExistingLiveReport(options = {}) {
  const reportPath = path.resolve(String(options.report || ''));
  if (!reportPath || !fs.existsSync(reportPath)) throw new Error('finalize_report_path_required');
  const inputRatePerMillion = parseNumber(options['gemini-input-usd-per-million'], null, { min: 0 });
  const outputRatePerMillion = parseNumber(options['gemini-output-usd-per-million'], null, { min: 0 });
  if (!Number.isFinite(inputRatePerMillion) || !Number.isFinite(outputRatePerMillion)) {
    throw new Error('finalize_report_token_rates_required');
  }
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  for (const usage of Array.isArray(report.usage) ? report.usage : []) {
    const cost = estimateGeminiCost(usage, inputRatePerMillion, outputRatePerMillion);
    usage.estimatedUsd = cost.estimatedUsd;
    usage.estimatedUsdMethod = cost.method;
  }
  for (const evaluation of Array.isArray(report.evaluations) ? report.evaluations : []) {
    if (!evaluation.usage) continue;
    const cost = estimateGeminiCost(evaluation.usage, inputRatePerMillion, outputRatePerMillion);
    evaluation.usage.estimatedUsd = cost.estimatedUsd;
    evaluation.usage.estimatedUsdMethod = cost.method;
    evaluation.geminiEstimatedCostUsd = cost.estimatedUsd;
  }
  const evaluations = Array.isArray(report.evaluations) ? report.evaluations : [];
  const costs = evaluations.map((item) => item.geminiEstimatedCostUsd).filter(Number.isFinite);
  const totalGeminiEstimatedCost = costs.length === evaluations.length
    ? costs.reduce((total, value) => total + value, 0)
    : null;
  const totalApifyCost = Number(report.metrics?.totalApifyCost || report.apifyActualCostUsd || 0);
  const totalProviderEstimatedCost = Number.isFinite(totalGeminiEstimatedCost)
    ? totalApifyCost + totalGeminiEstimatedCost
    : null;
  const acceptedCaseCount = new Set(
    evaluations.filter((item) => item.decision === 'accept').map((item) => item.caseId),
  ).size;
  report.metrics.totalGeminiEstimatedCost = totalGeminiEstimatedCost;
  report.metrics.averageCostPerEvaluation = Number.isFinite(totalProviderEstimatedCost) && evaluations.length
    ? totalProviderEstimatedCost / evaluations.length
    : null;
  report.metrics.averageCostPerAcceptedSignal = Number.isFinite(totalProviderEstimatedCost) && acceptedCaseCount
    ? totalProviderEstimatedCost / acceptedCaseCount
    : null;
  report.budget.tokenEstimatedGeminiUsd = round(totalGeminiEstimatedCost, 8);
  report.budget.tokenEstimatedTotalUsd = round(totalProviderEstimatedCost, 8);
  report.costEstimate = {
    inputUsdPerMillionTokens: inputRatePerMillion,
    outputUsdPerMillionTokens: outputRatePerMillion,
    fallbackMethod: 'conservative_total_tokens_at_higher_rate',
    note: 'Interactions API returned total_tokens without an input/output split; the higher output rate is applied to every token as a conservative upper estimate.',
  };
  const summary = buildLiveSummary({ mode: report.mode, report });
  const summaryPath = path.join(path.dirname(reportPath), 'summary.md');
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.writeFileSync(summaryPath, `${summary}\n`, 'utf8');
  return {
    report,
    summary,
    artifacts: {
      outputDirectory: path.dirname(reportPath),
      reportPath,
      summaryPath,
    },
  };
}

function runEvidenceLinkSelfTest() {
  const evaluation = {
    contentMechanicEvidenceIds: ['obs_audio', 'obs_visual', 'obs_missing', 'obs_audio'],
    observations: [
      {
        id: 'obs_visual',
        timestamp: '00:08',
        source: 'visual',
        kind: 'result',
        description: 'The creator demonstrates the workflow result.',
        confidence: 0.94,
      },
      {
        id: 'obs_audio',
        timestamp: '00:03',
        source: 'spoken',
        kind: 'process',
        description: 'The speaker explains the reusable sequence.',
        confidence: 0.95,
      },
    ],
  };
  const resolved = resolveContentMechanicEvidence(evaluation);
  if (resolved.length !== 3) throw new Error('evidence_link_self_test_deduplication_failed');
  if (resolved[0].observation?.id !== 'obs_audio') {
    throw new Error('evidence_link_self_test_audio_mapping_failed');
  }
  if (resolved[1].observation?.id !== 'obs_visual') {
    throw new Error('evidence_link_self_test_visual_mapping_failed');
  }
  if (resolved[2].matched !== false || resolved[2].observation !== null) {
    throw new Error('evidence_link_self_test_missing_mapping_failed');
  }
  const report = {
    status: 'self_test',
    evaluations: [{
      ...evaluation,
      caseId: 'self-test',
      repeatIndex: 0,
      decision: 'accept',
      qualityScore: 80,
      scores: {},
      evidenceConfidence: 0.95,
      usage: {},
      latencyMs: 1,
      centralIdea: 'A test idea.',
      contentMechanic: 'A test mechanic.',
      visualExecution: 'A test visual.',
      adaptationTemplate: '[input] → [result]',
      rejectionReasons: [],
      audit: { unsupportedClaimCandidates: [] },
    }],
    metrics: {
      decisionFlipRate: 0,
      falseAcceptRate: 0,
      falseRejectRate: 0,
      totalApifyCost: 0,
      totalGeminiEstimatedCost: 0,
      cases: [{
        id: 'self-test',
        expectedDecision: 'accept',
        decisionFlipRate: 0,
        scoreSpread: {},
      }],
    },
    budget: { accountedUsd: 0, limitUsd: 0 },
    providerCalls: { apify: 0, mediaDownloads: 0, gemini: 0 },
  };
  const summary = buildLiveSummary({ mode: 'evidence-link-self-test', report });
  if (!summary.includes('obs_audio → [00:03]')) {
    throw new Error('evidence_link_self_test_summary_mapping_failed');
  }
  if (!summary.includes('obs_missing → MISSING OBSERVATION')) {
    throw new Error('evidence_link_self_test_summary_missing_failed');
  }
  return {
    report: {
      status: 'passed',
      providerCalls: { apify: 0, gemini: 0 },
      resolvedEvidenceIds: resolved.map((item) => ({
        id: item.id,
        matched: item.matched,
      })),
    },
    summary: 'contentMechanicEvidenceIds mapping self-test passed',
    artifacts: null,
  };
}

function printHelp() {
  console.log([
    'DZHERO Signal Quality Gate soak harness',
    '',
    'Free mock load:',
    '  node scripts/signal-filter-soak.mjs load --counts=100,200,500 --seed=42',
    '',
    'Paid preflight only (no provider calls without --confirm-paid):',
    '  node scripts/signal-filter-soak.mjs consistency --manifest=scripts/fixtures/signal-filter-benchmark.json --repeats=3 --concurrency=1 --max-videos=2 --max-paid-usd=1',
    '',
    'Live execution additionally requires explicit owner approval, --confirm-paid, provider credentials, and explicit Gemini token rates.',
  ].join('\n'));
}

export async function main(argv = process.argv.slice(2)) {
  const { mode, options } = parseCliArgs(argv);
  if (mode === 'help' || mode === '--help' || mode === '-h') {
    printHelp();
    return null;
  }
  let result;
  if (mode === 'load') {
    result = await runLoadMode(options);
  } else if (mode === 'self-test-evidence-links') {
    result = runEvidenceLinkSelfTest();
  } else if (mode === 'finalize-report') {
    result = finalizeExistingLiveReport(options);
  } else if (mode === 'consistency' || mode === 'benchmark') {
    result = await runLiveMode(mode, options);
  } else {
    throw new Error(`unknown_mode_${mode}`);
  }
  if (result?.artifacts) {
    console.log(`Report: ${result.artifacts.reportPath}`);
    console.log(`Summary: ${result.artifacts.summaryPath}`);
  }
  return result;
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(SCRIPT_PATH);
if (isDirectRun) {
  main().catch((error) => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  });
}
