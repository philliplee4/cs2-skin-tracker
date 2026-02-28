const http = require('http');
const https = require('https');
const url = require('url');
const zlib = require('zlib');

const PORT = 3000;

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const targetUrl = parsedUrl.query.url;

  if (!targetUrl) {
    res.writeHead(400);
    res.end('Missing url parameter');
    return;
  }

  console.log('Proxying:', targetUrl);

  // Request with Brotli support - this is what was missing
  const options = new URL(targetUrl);
  options.headers = { 'Accept-Encoding': 'br, gzip, deflate' };

  https.get(options, (apiRes) => {
    let chunks = [];

    apiRes.on('data', (chunk) => chunks.push(chunk));

    apiRes.on('end', () => {
      const buffer = Buffer.concat(chunks);
      const encoding = apiRes.headers['content-encoding'];

      // Decompress based on encoding
      if (encoding === 'br') {
        zlib.brotliDecompress(buffer, (err, result) => {
          if (err) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: 'Decompression failed' }));
            return;
          }
          res.setHeader('Content-Type', 'application/json');
          res.writeHead(200);
          res.end(result);
        });
      } else if (encoding === 'gzip') {
        zlib.gunzip(buffer, (err, result) => {
          if (err) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: 'Decompression failed' }));
            return;
          }
          res.setHeader('Content-Type', 'application/json');
          res.writeHead(200);
          res.end(result);
        });
      } else {
        res.setHeader('Content-Type', 'application/json');
        res.writeHead(200);
        res.end(buffer);
      }
    });
  }).on('error', (err) => {
    console.error('Error:', err.message);
    res.writeHead(500);
    res.end(JSON.stringify({ error: err.message }));
  });
});

server.listen(PORT, () => {
  console.log(`\nCORS Proxy running on http://localhost:${PORT}`);
});