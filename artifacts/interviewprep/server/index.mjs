import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import { createServer as createHttpServer } from 'node:http';
import express from 'express';
import { app } from './app.mjs';
import { pool } from './db.mjs';
import { seedQuestionTypes } from './question-types.mjs';
import { seedCaseSections } from './case-sections.mjs';
import { seedCaseBooks } from './case-books.mjs';
import { seedRubric } from './rubric.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await pool.query('SELECT 1');
// Runs in development AND production after schema provisioning, before traffic.
// Only missing reference rows are inserted; no startup-time schema changes.
await seedQuestionTypes();
await seedCaseSections();
await seedRubric();
await seedCaseBooks();
const port = Number(process.env.PORT || 5000);
const server = createHttpServer(app);
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(root, 'dist/public'), { index: false }));
  app.get('/{*path}', (_req, res) => res.sendFile(path.join(root, 'dist/public/index.html')));
} else {
  const { createServer } = await import('vite');
  process.env.PORT ||= String(port);
  process.env.BASE_PATH ||= '/';
  const vite = await createServer({
    configFile: path.join(root, 'vite.config.ts'),
    server: { middlewareMode: true, hmr: { server } },
    appType: 'custom',
  });
  app.use(vite.middlewares);
  app.get('/{*path}', async (req, res, next) => {
    try {
      const html = await fs.readFile(path.join(root, 'index.html'), 'utf8');
      res.type('html').send(await vite.transformIndexHtml(req.originalUrl, html));
    } catch (error) { next(error); }
  });
}
server.listen(port, '0.0.0.0', () => console.log(`InterviewPrep listening on port ${port}`));
