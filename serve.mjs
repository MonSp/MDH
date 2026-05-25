import http from 'http';
import fs from 'fs';
import path from 'path';

const types = {
  'html': 'text/html',
  'js': 'application/javascript',
  'mjs': 'application/javascript',
  'css': 'text/css',
  'json': 'application/json',
  'svg': 'image/svg+xml',
};

http.createServer((req, res) => {
  let file = req.url === '/' ? 'index.html' : req.url.slice(1);

  let filePath = path.join('.', file);
  if (!fs.existsSync(filePath)) {
    filePath = path.join('.', 'dist', file);
  }

  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const ext = file.split('.').pop();
  res.writeHead(200, {
    'Content-Type': types[ext] || 'text/plain',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-cache',
  });
  fs.createReadStream(filePath).pipe(res);
}).listen(8080, '0.0.0.0', () => console.log('Server running at http://localhost:8080'));
