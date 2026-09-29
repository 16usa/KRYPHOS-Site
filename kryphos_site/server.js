const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const port = Number(process.env.PORT || 3000);
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function safePath(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  const target = path.normalize(path.join(root, clean === '/' ? 'index.html' : clean));
  return target.startsWith(root) ? target : null;
}

const server = http.createServer((req, res) => {
  const target = safePath(req.url || '/');
  if (!target) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.stat(target, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, {'Content-Type': 'text/plain; charset=utf-8'});
      res.end('Not found');
      return;
    }

    const ext = path.extname(target).toLowerCase();
    res.writeHead(200, {
      'Content-Type': mime[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' || ext === '.js' || ext === '.css' ? 'no-cache' : 'public, max-age=86400'
    });
    fs.createReadStream(target).pipe(res);
  });
});


// KRYPHOS BOOST ENGINE LOOP
// Runs inside the existing web process. It is read-only by default.
// Trading actions remain separately gated in kryphos_boost/sell-reserve.mjs.
if (process.env.BOOST_ENGINE_ENABLED === '1') {
  import('../kryphos_boost/engine.mjs')
    .then(({ startEngine }) => startEngine({
      intervalMs: Math.max(30000, Number(process.env.BOOST_ENGINE_INTERVAL_MS || 60000))
    }))
    .catch(err => console.error('[boost-engine]', err?.message || err));
}

server.listen(port, '0.0.0.0', () => {
  console.log(`KRYPHOS site running on http://0.0.0.0:${port}`);
});
