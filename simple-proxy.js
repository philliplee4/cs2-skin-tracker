// Simple CORS proxy server
const http = require('http');
const https = require('https');
const url = require('url');

const PORT = 3000;

const server = http.createServer((req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Parse the target URL from query parameter
  const parsedUrl = url.parse(req.url, true);
  const targetUrl = parsedUrl.query.url;

  if (!targetUrl) {
    res.writeHead(400);
    res.end('Missing url parameter');
    return;
  }

  console.log('Proxying request to:', targetUrl);

  // Make request to Skinport API
  https.get(targetUrl, (apiRes) => {
    let data = '';

    apiRes.on('data', (chunk) => {
      data += chunk;
    });

    apiRes.on('end', () => {
      res.setHeader('Content-Type', 'application/json');
      res.writeHead(200);
      res.end(data);
    });
  }).on('error', (err) => {
    console.error('Error:', err.message);
    res.writeHead(500);
    res.end(JSON.stringify({ error: err.message }));
  });
});

server.listen(PORT, () => {
  console.log(`\n✓ CORS Proxy running on http://localhost:${PORT}`);
  console.log(`\nUpdate skinport-api.js to use:\n  CORS_PROXY: 'http://localhost:${PORT}/?url='\n`);
});
