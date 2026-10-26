// Exports published collections/offers/settings + their images into public/ so the site can run on static hosting (Vercel).
// Needs XAMPP MySQL running. Usage: npm run export:static
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const candidates = [process.env.PHP_BIN, 'php', 'C:\\xampp\\php\\php.exe', '/opt/lampp/bin/php'].filter(Boolean);
const php = candidates.find((c) => spawnSync(c, ['-v'], { stdio: 'ignore' }).status === 0);
if (!php) {
  console.error('PHP was not found. Install XAMPP or set PHP_BIN to the php executable.');
  process.exit(1);
}
const res = spawnSync(php, ['api/bin/export-static.php'], { stdio: 'inherit' });
if (res.status === 0 && !fs.existsSync('public/data/collections.json')) process.exit(1);
process.exit(res.status ?? 1);
