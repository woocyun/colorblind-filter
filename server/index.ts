import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.use(express.json());

// --- API routes -----------------------------------------------------------
// All API endpoints live under /api so the SPA fallback below can skip them.
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// --- Static client ---------------------------------------------------------
// In production the Vite build lands in ../dist (relative to this file, which
// runs from dist-server/ when compiled and from server/ under tsx in dev).
// In dev the client is served by Vite, so we only mount this when the build
// actually exists.
const clientDir = path.resolve(__dirname, '../dist');
if (fs.existsSync(clientDir)) {
  app.use(express.static(clientDir));
  // SPA fallback: hand any non-API, non-asset route to index.html.
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(clientDir, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
