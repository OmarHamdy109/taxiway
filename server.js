// Tiny static server for Taxiway Alpha 3D. Serves /public on $PORT (default 8080). Gzips text assets (cached in memory).
const http = require('http'), fs = require('fs'), path = require('path'), zlib = require('zlib');
const ROOT = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const gz = new Map();
http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent(req.url.split('?')[0]); } catch (e) { res.writeHead(400); return res.end('Bad request'); }
  if (p.endsWith('/')) p += 'index.html';
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    const ext = path.extname(file);
    const h = { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': p.startsWith('/vendor/') ? 'public, max-age=86400' : 'no-cache' };
    if (/\.(js|css|html|json|svg)$/.test(ext) && /gzip/.test(req.headers['accept-encoding'] || '')) {
      const k = file + ':' + data.length + ':' + fs.statSync(file).mtimeMs; let z = gz.get(k);
      if (!z) { z = zlib.gzipSync(data, { level: 9 }); gz.set(k, z); }
      h['Content-Encoding'] = 'gzip'; h.Vary = 'Accept-Encoding'; res.writeHead(200, h); return res.end(z);
    }
    res.writeHead(200, h); res.end(data);
  });
}).listen(process.env.PORT || 8080, '0.0.0.0', () => console.log('Taxiway Alpha 3D on :' + (process.env.PORT || 8080)));
