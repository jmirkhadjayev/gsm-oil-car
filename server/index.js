// GSM hisobi — HTTP server (API + tayyor frontend).
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { dbPath, run } from './db.js';
import { seed } from './seed.js';
import { attachUser } from './auth.js';
import { attachBranch } from './branch.js';
import { HttpError } from './util.js';

import { router as authRouter } from './routes/auth.js';
import { router as refsRouter } from './routes/refs.js';
import { router as waybillsRouter } from './routes/waybills.js';
import { router as fuelRouter } from './routes/fuel.js';
import { router as reportsRouter } from './routes/reports.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const PORT = Number(process.env.GSM_PORT) || 3000;
const HOST = process.env.GSM_HOST || '0.0.0.0';

seed({ demo: process.env.GSM_DEMO === '1', log: (m) => console.log(m) });
run("DELETE FROM sessions WHERE expires_at < datetime('now')");

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(attachUser);
app.use(attachBranch);

app.use('/api/auth', authRouter);
app.use('/api', refsRouter);
app.use('/api/waybills', waybillsRouter);
app.use('/api/fuel', fuelRouter);
app.use('/api/reports', reportsRouter);
app.get('/api/health', (_req, res) => res.json({ ok: true, db: path.basename(dbPath) }));

// ---------------------------- Frontend (build) ----------------------------
const dist = path.join(root, 'web', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
} else {
  app.get('/', (_req, res) =>
    res.status(200).type('html').send(
      `<h2>GSM hisobi — server ishlayapti</h2>
       <p>Frontend hali yig'ilmagan. Ishlab chiqish rejimi: <code>npm run dev</code>,
       yoki to'liq yig'ish: <code>npm run build</code> va <code>npm start</code>.</p>`
    ));
}

// ------------------------------ Xato ishlovchi ----------------------------
app.use((_req, res) => res.status(404).json({ error: 'not_found' }));
app.use((err, _req, res, _next) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  if (err && /UNIQUE constraint/i.test(err.message || '')) {
    return res.status(400).json({ error: 'Bunday yozuv allaqachon mavjud' });
  }
  console.error('[xato]', err);
  res.status(500).json({ error: 'Serverda ichki xatolik' });
});

app.listen(PORT, HOST, () => {
  console.log(`\n  GSM hisobi — http://localhost:${PORT}`);
  console.log(`  Baza: ${dbPath}\n`);
});
