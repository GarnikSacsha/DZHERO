const dns = require('dns').promises;
const http = require('http');
const https = require('https');
const net = require('net');

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_BYTES = 1_000_000;
const DEFAULT_MAX_REDIRECTS = 4;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

const blockedIpv4Addresses = new net.BlockList();
const blockedIpv6Addresses = new net.BlockList();

for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
]) {
  blockedIpv4Addresses.addSubnet(address, prefix, 'ipv4');
}

for (const [address, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['::ffff:0:0', 96],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001::', 32],
  ['2001:2::', 48],
  ['2001:10::', 28],
  ['2001:20::', 28],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['3fff::', 20],
  ['5f00::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['fec0::', 10],
  ['ff00::', 8],
]) {
  blockedIpv6Addresses.addSubnet(address, prefix, 'ipv6');
}

function publicFetchError(code, message = code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function normalizeHostname(hostname) {
  const value = String(hostname || '').trim().toLowerCase();
  if (value.startsWith('[') && value.endsWith(']')) return value.slice(1, -1);
  return value.endsWith('.') ? value.slice(0, -1) : value;
}

function isBlockedPublicAddress(address) {
  const family = net.isIP(address);
  if (!family) return true;
  return family === 4
    ? blockedIpv4Addresses.check(address, 'ipv4')
    : blockedIpv6Addresses.check(address, 'ipv6');
}

function validatePublicUrl(input) {
  let parsed;
  try {
    parsed = input instanceof URL ? new URL(input.toString()) : new URL(String(input || ''));
  } catch {
    throw publicFetchError('public_url_invalid');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw publicFetchError('public_url_protocol_denied');
  }
  if (parsed.username || parsed.password) {
    throw publicFetchError('public_url_credentials_denied');
  }
  const allowedPort = parsed.protocol === 'https:' ? '443' : '80';
  if (parsed.port && parsed.port !== allowedPort) {
    throw publicFetchError('public_url_port_denied');
  }

  const hostname = normalizeHostname(parsed.hostname);
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    throw publicFetchError('public_url_hostname_denied');
  }
  return parsed;
}

async function resolvePublicAddress(hostname, options = {}) {
  const normalized = normalizeHostname(hostname);
  const literalFamily = net.isIP(normalized);
  let resolved;
  if (literalFamily) {
    resolved = [{ address: normalized, family: literalFamily }];
  } else {
    const timeoutMs = Math.max(1, Number(options.timeoutMs || DEFAULT_TIMEOUT_MS));
    const lookup = options.lookup || dns.lookup;
    let timeoutId;
    try {
      resolved = await Promise.race([
        Promise.resolve().then(() => lookup(normalized, { all: true, verbatim: true })),
        new Promise((resolve, reject) => {
          timeoutId = setTimeout(() => reject(publicFetchError('public_url_timeout')), timeoutMs);
        }),
      ]);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  if (!resolved.length) throw publicFetchError('public_url_dns_empty');
  if (resolved.some(({ address }) => isBlockedPublicAddress(address))) {
    throw publicFetchError('public_url_private_address_denied');
  }
  return resolved[0];
}

function requestPublicTextOnce(url, options) {
  const {
    address,
    headers,
    maxBytes,
    timeoutMs,
  } = options;
  const transport = url.protocol === 'https:' ? https : http;
  let activeResponse;

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback(value);
    };
    const fail = (error) => finish(reject, error);
    const timer = setTimeout(() => {
      request.destroy(publicFetchError('public_url_timeout'));
    }, timeoutMs);

    const request = transport.request(url, {
      method: 'GET',
      headers: {
        ...headers,
        'accept-encoding': 'identity',
      },
      lookup(_hostname, lookupOptions, callback) {
        if (lookupOptions?.all) {
          callback(null, [{ address: address.address, family: address.family }]);
          return;
        }
        callback(null, address.address, address.family);
      },
    }, (incoming) => {
      activeResponse = incoming;
      const status = Number(incoming.statusCode || 0);
      const location = incoming.headers.location || '';
      if (REDIRECT_STATUSES.has(status) && location) {
        incoming.resume();
        finish(resolve, { status, headers: incoming.headers, location, text: '' });
        return;
      }

      const contentLength = Number(incoming.headers['content-length'] || 0);
      if (contentLength > maxBytes) {
        incoming.destroy();
        fail(publicFetchError('public_url_response_too_large'));
        return;
      }
      const contentType = String(incoming.headers['content-type'] || '').toLowerCase();
      if (contentType && !/^(text\/|application\/(xhtml\+xml|json))/.test(contentType)) {
        incoming.destroy();
        fail(publicFetchError('public_url_content_type_denied'));
        return;
      }

      const chunks = [];
      let totalBytes = 0;
      incoming.on('data', (chunk) => {
        totalBytes += chunk.length;
        if (totalBytes > maxBytes) {
          incoming.destroy();
          fail(publicFetchError('public_url_response_too_large'));
          return;
        }
        chunks.push(chunk);
      });
      incoming.on('end', () => finish(resolve, {
        status,
        headers: incoming.headers,
        location: '',
        text: Buffer.concat(chunks).toString('utf8'),
      }));
      incoming.on('error', fail);
    });

    request.on('error', fail);
    request.end();
  }).finally(() => {
    if (activeResponse && !activeResponse.complete) activeResponse.destroy();
  });
}

async function safeFetchPublicText(input, options = {}) {
  const timeoutMs = Math.max(100, Number(options.timeoutMs || DEFAULT_TIMEOUT_MS));
  const maxBytes = Math.max(1_024, Number(options.maxBytes || DEFAULT_MAX_BYTES));
  const maxRedirects = Math.max(0, Number(options.maxRedirects ?? DEFAULT_MAX_REDIRECTS));
  const deadline = Date.now() + timeoutMs;
  let url = validatePublicUrl(input);

  for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) throw publicFetchError('public_url_timeout');
    const address = await resolvePublicAddress(url.hostname, {
      lookup: options.lookup,
      timeoutMs: remainingMs,
    });
    const requestRemainingMs = deadline - Date.now();
    if (requestRemainingMs <= 0) throw publicFetchError('public_url_timeout');
    const response = await requestPublicTextOnce(url, {
      address,
      headers: options.headers || {},
      maxBytes,
      timeoutMs: requestRemainingMs,
    });

    if (REDIRECT_STATUSES.has(response.status) && response.location) {
      if (redirects >= maxRedirects) throw publicFetchError('public_url_redirect_limit');
      url = validatePublicUrl(new URL(response.location, url));
      continue;
    }

    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      url: url.toString(),
      text: response.text,
    };
  }

  throw publicFetchError('public_url_redirect_limit');
}

module.exports = {
  isBlockedPublicAddress,
  safeFetchPublicText,
  validatePublicUrl,
};
