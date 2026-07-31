'use strict';

const CREDENTIAL_KEY_PATTERN = /(?:authorization|proxy[_-]?authorization|cookie|set[_-]?cookie|token|api[_-]?key|secret|password|credential|database[_-]?url|connection[_-]?string|private[_-]?key)/i;
const URL_PATTERN = /https?:\/\/[^\s"'<>]+/gi;

function sanitizeUrl(value) {
  try {
    const url = new URL(value);
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return value;
  }
}

function sanitizeDiagnosticString(value, secrets = []) {
  let output = String(value || '')
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi, 'Bearer [REDACTED]')
    .replace(URL_PATTERN, (url) => sanitizeUrl(url));
  for (const secret of secrets) {
    if (secret) output = output.split(secret).join('[REDACTED]');
  }
  return output;
}

function sanitizeDiagnosticExport(value, { secrets = [] } = {}) {
  const secretValues = secrets.map((item) => String(item || '')).filter(Boolean);
  const visit = (item, key = '') => {
    if (CREDENTIAL_KEY_PATTERN.test(key)) return undefined;
    if (typeof item === 'string') return sanitizeDiagnosticString(item, secretValues);
    if (Array.isArray(item)) {
      return item.map((entry) => visit(entry)).filter((entry) => entry !== undefined);
    }
    if (item && typeof item === 'object') {
      return Object.fromEntries(Object.entries(item)
        .map(([nestedKey, nestedValue]) => [nestedKey, visit(nestedValue, nestedKey)])
        .filter(([, nestedValue]) => nestedValue !== undefined));
    }
    return item;
  };
  return visit(value);
}

module.exports = {
  CREDENTIAL_KEY_PATTERN,
  sanitizeDiagnosticExport,
  sanitizeDiagnosticString,
  sanitizeUrl,
};
