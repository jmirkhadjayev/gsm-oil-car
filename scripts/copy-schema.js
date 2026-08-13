// Server tomonidagi ma'lumot fayllarini brauzer versiyasi uchun web/src/local/ ga nusxalaydi.
// Shu tufayli sxema, migratsiya va texnika katalogi bitta manbadan boshqariladi.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const destDir = path.join(root, 'web', 'src', 'local');
fs.mkdirSync(destDir, { recursive: true });

const HEADER = '-- AVTOMATIK YARATILGAN FAYL — tahrirlamang.\n-- Manba: server/%s (scripts/copy-schema.js)\n\n';

const files = [
  { src: 'schema.sql', dest: 'schema.generated.sql', header: true },
  { src: 'migrations.json', dest: 'migrations.generated.json' },
  { src: 'catalog.json', dest: 'catalog.generated.json' },
];

for (const f of files) {
  const body = fs.readFileSync(path.join(root, 'server', f.src), 'utf8');
  const out = f.header ? HEADER.replace('%s', f.src) + body : body;
  fs.writeFileSync(path.join(destDir, f.dest), out);
  console.log(`server/${f.src} → web/src/local/${f.dest} (${Buffer.byteLength(out)} bayt)`);
}
