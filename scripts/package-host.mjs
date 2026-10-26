// Builds deploy/tarini-host.zip: the website + PHP backend + uploads + a SQL dump of your CURRENT database, ready to upload to any
// PHP + MySQL host (Hostinger, InfinityFree, cPanel hosting...). Usage: npm run package:host
import { spawnSync, execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'deploy', 'tarini-host');
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'chandan.giri@kiit.ac.in';
const ADMIN_NAME = process.env.ADMIN_NAME || 'Chandan Giri';

const find = (cands, args) => cands.filter(Boolean).find((c) => spawnSync(c, args, { stdio: 'ignore' }).status === 0);
const php = find([process.env.PHP_BIN, 'php', 'C:\\xampp\\php\\php.exe'], ['-v']);
const dump = find([process.env.MYSQLDUMP_BIN, 'mysqldump', 'C:\\xampp\\mysql\\bin\\mysqldump.exe'], ['--version']);
if (!php || !dump) { console.error('Need PHP and mysqldump (XAMPP). Set PHP_BIN / MYSQLDUMP_BIN if they are elsewhere.'); process.exit(1); }

const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' && cmd === 'npm', ...opts });
  if (r.status !== 0) { console.error(`Failed: ${cmd} ${args.join(' ')}`); process.exit(1); }
};
const copyDir = (from, to, skip = () => false) => {
  fs.cpSync(from, to, { recursive: true, filter: (src) => !skip(path.relative(from, src).replace(/\\/g, '/')) });
};

console.log('1/5 Building the website…');
run('npm', ['run', 'build']);

console.log('2/5 Assembling files…');
fs.rmSync(path.join(ROOT, 'deploy'), { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
// site (without the static snapshot: the PHP host serves the live API + uploads instead)
copyDir(path.join(ROOT, 'dist'), OUT, (r) => r === 'data' || r.startsWith('data/') || r === 'uploads' || r.startsWith('uploads/'));
// backend (never the local .env)
copyDir(path.join(ROOT, 'api'), path.join(OUT, 'api'), (r) => r === '.env' || r.startsWith('seed'));
// uploads with their current images + the .htaccess that blocks code execution
copyDir(path.join(ROOT, 'uploads'), path.join(OUT, 'uploads'), (r) => r === '.gitkeep');

console.log('3/5 Exporting your current data…');
const sh = (args) => execFileSync(dump, ['-u', 'root', '--skip-comments', '--skip-add-locks', '--skip-lock-tables', '--default-character-set=utf8mb4', ...args, ...[]], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const content = sh(['tarini', '--ignore-table=tarini.users', '--ignore-table=tarini.login_attempts']);
const emptyTables = sh(['--no-data', 'tarini', 'users', 'login_attempts']);
const tempPassword = `Tarini-${randomBytes(4).toString('hex')}-${randomBytes(2).toString('hex')}A7`;
const hash = execFileSync(php, ['-r', "require 'api/src/core.php'; require 'api/src/auth.php'; echo hash_password($argv[1]);", '--', tempPassword], { encoding: 'utf8' }).trim();
const esc = (v) => v.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
const admin = `\n-- First administrator (temporary password, stored hashed). Change it after signing in.\nINSERT INTO users (name, email, password, role, is_active, created_at, updated_at) VALUES ('${esc(ADMIN_NAME)}', '${esc(ADMIN_EMAIL)}', '${esc(hash)}', 'admin', 1, '${now}', '${now}');\n`;
fs.writeFileSync(path.join(OUT, 'tarini.sql'), `${content}\n${emptyTables}${admin}`);

console.log('4/5 Writing instructions…');
fs.writeFileSync(path.join(OUT, 'api', '.env.example'), `# Copy this file to .env (same folder) and fill in the database details from your hosting panel.
APP_ENV=production
APP_DEBUG=0
DB_HOST=localhost
DB_PORT=3306
DB_NAME=your_database_name
DB_USER=your_database_user
DB_PASS=your_database_password
UPLOADS_URL=/uploads
MAX_UPLOAD_MB=5
MIN_PASSWORD_LENGTH=10
ALLOW_PLAINTEXT_PASSWORDS=0
`);
fs.writeFileSync(path.join(OUT, 'HOSTING-STEPS.txt'), `TARINI - HOSTING ON A PHP + MYSQL HOST
=====================================

You need a hosting account with PHP 8+ and MySQL (Hostinger, cPanel hosting, InfinityFree ...).

1. In the hosting panel create a MySQL database + user. Write down: database name, user, password, host (often "localhost").
2. Open phpMyAdmin for that database > Import > choose tarini.sql > Go.
   (It creates all tables, your collections, offers, images list and the first administrator.)
3. Upload EVERYTHING in this folder (except tarini.sql and this file) into the site's web folder
   (public_html or htdocs) using the panel's File Manager or FTP. Keep the folder structure:
      index.html, assets/, img/, .htaccess, api/, uploads/
   Make sure the hidden files .htaccess (here, in api/ and in uploads/) are uploaded.
4. In the uploaded api/ folder copy .env.example to .env and fill in the database details from step 1.
   Keep APP_ENV=production and ALLOW_PLAINTEXT_PASSWORDS=0.
5. Open your domain. The collections and offer popup should appear.
   Admin: https://YOUR-DOMAIN/admin/login
   Email: ${ADMIN_EMAIL}
   Temporary password: ${tempPassword}
   Change it straight away: Website Settings > Team (or add your own administrator and delete this one).
6. Delete tarini.sql from the server if you uploaded it.

If /admin/login shows a blank page, check the .htaccess in the web folder was uploaded.
If the site says the database is not available, re-check api/.env.
`);

console.log('5/5 Creating the zip…');
const zip = path.join(ROOT, 'deploy', 'tarini-host.zip');
// bsdtar (built into Windows 10+) keeps hidden files such as .htaccess. Use the system one: Git Bash ships a GNU tar that cannot write zips.
const bsdtar = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
run(bsdtar, ['-a', '-c', '-f', zip, '-C', OUT, '.']);
console.log(`\nDone: ${zip}\nTemporary admin password (also written in HOSTING-STEPS.txt): ${tempPassword}`);
