const dns = require('node:dns');
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');

class FetchError extends Error {
  constructor(code, message, retryable = false) {
    super(message);
    this.code = code;
    this.retryable = retryable;
  }
}

// Loopback, private, link-local, CGNAT, documentation, multicast and reserved ranges.
const blocked = new net.BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
]) blocked.addSubnet(network, prefix, 'ipv4');
for (const [network, prefix] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8], ['2001:db8::', 32]]) {
  blocked.addSubnet(network, prefix, 'ipv6');
}

// IPv4-mapped IPv6 addresses (::ffff:a.b.c.d) are checked against the IPv4 rules by BlockList.
function isBlockedAddress(address) {
  const family = net.isIP(address);
  if (family === 0) return true;
  return blocked.check(address, family === 6 ? 'ipv6' : 'ipv4');
}

// Resolves once and hands the validated addresses to the socket, so the address that was
// checked is the address that is connected to (no second lookup for DNS rebinding to exploit).
function guardedLookup(allowPrivateNetwork) {
  return (hostname, options, callback) => {
    const lookupOptions = typeof options === 'object' ? options : { family: options };
    dns.lookup(hostname, { ...lookupOptions, all: true }, (error, addresses) => {
      if (error) return callback(error);
      if (!allowPrivateNetwork && addresses.some(entry => isBlockedAddress(entry.address))) {
        return callback(new FetchError('SSRF_BLOCKED', `${hostname} resolves to a non-public address`));
      }
      if (lookupOptions.all) return callback(null, addresses);
      callback(null, addresses[0].address, addresses[0].family);
    });
  };
}

// One GET, no redirect following, no decompression. Redirects are returned to the caller,
// which re-applies allowlist, SSRF and politeness rules to the target.
function fetchOnce(rawUrl, {
  timeoutMs = 5000,
  maxBytes = 512 * 1024,
  userAgent = 'LabCrawler/1.0',
  allowPrivateNetwork = false,
  types = ['text/html', 'application/xhtml+xml'],
} = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(rawUrl);
    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    // IP literals skip DNS lookup entirely, so they must be checked here.
    if (!allowPrivateNetwork && net.isIP(hostname) && isBlockedAddress(hostname)) {
      return reject(new FetchError('SSRF_BLOCKED', `${hostname} is a non-public address`));
    }

    let settled = false;
    let timer;
    // Settle before destroying a stream: destroy() emits 'aborted'/'error' synchronously, and the
    // first outcome wins, so the specific error must be recorded first.
    const settle = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };
    const client = url.protocol === 'https:' ? https : http;
    const request = client.request(url, {
      method: 'GET',
      agent: false,
      headers: { 'user-agent': userAgent, accept: types.join(','), 'accept-encoding': 'identity' },
      lookup: guardedLookup(allowPrivateNetwork),
    }, response => {
      const { statusCode: status, headers } = response;
      const contentType = (headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
      if (status < 200 || status >= 300) {
        response.resume();
        return settle(resolve, { status, headers, contentType, location: headers.location, body: '' });
      }
      if (!types.includes(contentType)) {
        settle(reject, new FetchError('NOT_HTML', `unsupported content type "${contentType}"`));
        return response.destroy();
      }
      if (Number(headers['content-length']) > maxBytes) {
        settle(reject, new FetchError('TOO_LARGE', `content-length exceeds ${maxBytes} bytes`));
        return response.destroy();
      }
      const chunks = [];
      let total = 0;
      response.on('data', chunk => {
        total += chunk.length;
        if (total > maxBytes) {
          settle(reject, new FetchError('TOO_LARGE', `response exceeds ${maxBytes} bytes`));
          return response.destroy();
        }
        chunks.push(chunk);
      });
      response.on('end', () => settle(resolve, { status, headers, contentType, body: Buffer.concat(chunks).toString('utf8') }));
      response.on('error', error => settle(reject, new FetchError('NETWORK_ERROR', error.message, true)));
      response.on('aborted', () => settle(reject, new FetchError('NETWORK_ERROR', 'connection aborted', true)));
    });

    // One deadline for the whole exchange, so a server that trickles bytes cannot hold a worker.
    timer = setTimeout(() => {
      settle(reject, new FetchError('TIMEOUT', `no complete response within ${timeoutMs} ms`, true));
      request.destroy();
    }, timeoutMs);
    request.on('error', error => {
      settle(reject, error instanceof FetchError ? error : new FetchError('NETWORK_ERROR', error.message, true));
    });
    request.end();
  });
}

module.exports = { FetchError, fetchOnce, isBlockedAddress };
