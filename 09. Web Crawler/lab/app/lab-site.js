const http = require('node:http');

function page(title, links = [], extra = '') {
  const anchors = links.map(href => `<a href="${href}">${href}</a>`).join('\n');
  return `<!doctype html><html><head><title>${title}</title></head><body>\n${anchors}\n${extra}</body></html>`;
}

// A small local site that exercises every crawler rule. `hits` counts requests per path+query;
// `log` records start/end times so tests can check per-host politeness.
function createLabSite({ slowMs = 5000 } = {}) {
  const hits = new Map();
  const log = [];
  let flakyCalls = 0;

  const server = http.createServer((req, res) => {
    const start = Date.now();
    hits.set(req.url, (hits.get(req.url) ?? 0) + 1);
    res.on('close', () => log.push({ path: req.url, start, end: Date.now() }));
    const { pathname } = new URL(req.url, 'http://lab.local');
    const html = body => res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(body);

    if (pathname === '/robots.txt') return res.writeHead(200, { 'content-type': 'text/plain' }).end('User-agent: *\nDisallow: /private\n');
    if (pathname === '/') {
      return html(page('Home', [
        '/a', '/b', '/dup', '/redirect-same', '/redirect-out', '/loop-a', '/big', '/slow', '/not-html',
        '/missing', '/flaky', '/private/secret', '/trap/1',
      ]));
    }
    if (pathname === '/a') {
      return html(page('A', [
        '/b#section', '/a?x=1&y=2', '/a?y=2&x=1', 'http://outside.invalid/page', 'mailto:someone@example.com',
        'javascript:void(0)', '/c',
      ], '<a rel="nofollow" href="/nofollow">ignored</a>'));
    }
    if (pathname === '/b' || pathname === '/dup') return html(page('B', ['/c', '/']));
    if (pathname === '/c') return html(page('C', ['/a']));
    if (pathname === '/redirect-same') return res.writeHead(302, { location: '/b' }).end();
    if (pathname === '/redirect-out') return res.writeHead(302, { location: 'http://outside.invalid/' }).end();
    if (pathname === '/loop-a') return res.writeHead(302, { location: '/loop-b' }).end();
    if (pathname === '/loop-b') return res.writeHead(302, { location: '/loop-a' }).end();
    if (pathname === '/not-html') return res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}');
    if (pathname === '/flaky') return ++flakyCalls <= 2 ? res.writeHead(503).end() : html(page('Flaky'));
    if (pathname === '/private/secret') return html(page('Secret'));
    if (pathname.startsWith('/trap/')) return html(page('Trap', [`/trap/${Number(pathname.slice(6)) + 1}`]));
    if (pathname === '/huge-header') {
      res.writeHead(200, { 'content-type': 'text/html', 'content-length': '5000000' });
      return res.write('x');
    }
    if (pathname === '/big') {
      // Chunked, no content-length: only the streaming size limit can stop it.
      res.writeHead(200, { 'content-type': 'text/html' });
      const chunk = Buffer.alloc(64 * 1024, 'x');
      let sent = 0;
      const pump = () => {
        while (sent < 5_000_000 && !res.destroyed) {
          sent += chunk.length;
          if (!res.write(chunk)) return res.once('drain', pump);
        }
        res.end();
      };
      return pump();
    }
    if (pathname === '/slow') {
      const timer = setTimeout(() => html(page('Slow')), slowMs);
      return res.on('close', () => clearTimeout(timer));
    }
    return res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
  });
  server.hits = hits;
  server.log = log;
  return server;
}

if (require.main === module) {
  createLabSite().listen(8080, '127.0.0.1', () => process.stdout.write('Lab site on http://127.0.0.1:8080\n'));
}

module.exports = { createLabSite };
