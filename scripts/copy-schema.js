// server/schema.sql ni brauzer versiyasi uchun web/src/local/ ga nusxalaydi.
// Shu tufayli baza sxemasi bitta manbadan boshqariladi — nusxa qo'lda tahrirlanmaydi.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'server', 'schema.sql');
const destDir = path.join(root, 'web', 'src', 'local');
const dest = path.join(destDir, 'schema.generated.sql');

fs.mkdirSync(destDir, { recursive: true });
fs.writeFileSync(
  dest,
  `-- AVTOMATIK YARATILGAN FAYL — tahrirlamang.\n-- Manba: server/schema.sql (scripts/copy-schema.js)\n\n${fs.readFileSync(src, 'utf8')}`
);
console.log(`schema.sql → web/src/local/schema.generated.sql (${fs.statSync(dest).size} bayt)`);
