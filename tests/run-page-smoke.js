const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const PORT = 8080;
const HOST = 'localhost';
const rootDir = path.resolve(__dirname, '..');

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function createStaticServer() {
  const server = http.createServer((req, res) => {
    const requestPath = decodeURIComponent(req.url.split('?')[0]);
    const safePath = requestPath === '/' ? '/turbine_3d_interactive.html' : requestPath;
    const resolved = path.join(rootDir, safePath);

    // Prevent directory traversal outside rootDir
    if (!resolved.startsWith(rootDir)) {
      res.writeHead(400);
      res.end('Bad request');
      return;
    }

    const ext = path.extname(resolved).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    fs.readFile(resolved, (err, data) => {
      if (err) {
        res.writeHead(err.code === 'ENOENT' ? 404 : 500);
        res.end();
        return;
      }
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    });
  });
  return server;
}

async function run() {
  const server = createStaticServer();
  await new Promise((resolve) => server.listen(PORT, HOST, resolve));
  console.log(`Static server running at http://${HOST}:${PORT}`);

  let browser;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  } catch (err) {
    console.warn('Skipping smoke test: unable to start bundled Chromium (likely missing system libraries).');
    console.warn(err.message);
    server.close();
    return;
  }

  try {
    const page = await browser.newPage();
    const consoleMessages = [];
    page.on('console', (msg) => consoleMessages.push(msg.text()));

    await page.goto(`http://${HOST}:${PORT}/turbine_3d_interactive.html`, {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });

    await page.waitForSelector('#blade-thrust-breakdown', { timeout: 15000 });
    const thrustEntries = await page.$$eval('#blade-thrust-breakdown div', (nodes) => nodes.length);
    console.log(`Blade thrust entries rendered: ${thrustEntries}`);

    const fourierSections = await page.$$eval('.fourier-summary', (nodes) => nodes.length);
    console.log(`Fourier summary sections detected: ${fourierSections}`);

    if (consoleMessages.length) {
      console.log('Browser console messages:');
      consoleMessages.forEach((line) => console.log(`  ${line}`));
    }
  } finally {
    await browser.close();
    server.close();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
