#!/usr/bin/env node
'use strict';
const path = require('path');
const fs   = require('fs');
const ROOT = __dirname;

const FILES = [
  'app.js','auth/helpers.js','auth/middleware.js','auth/rateLimits.js',
  'models/AuthUser.js','models/Plugin.js','notify/engine.js',
  'routes/auth.js','routes/plugins.js','routes/userSelf.js','routes/adminUsers.js',
  'public/login.html','public/admin-plugins.html','scripts/seed-admin.js',
];
const PKGS = [
  'express','ws','mongoose','dotenv','uuid','jsonwebtoken','bcryptjs',
  'speakeasy','qrcode','nodemailer','express-rate-limit','axios',
  'passport','passport-google-oauth20',
];

console.log('\n════════════════════════════════════════════');
console.log('  Attendix Cloud — Setup Check');
console.log(`  ${ROOT}`);
console.log('════════════════════════════════════════════\n');

let ok = true;

console.log('[ FILES ]');
for (const f of FILES) {
  const exists = fs.existsSync(path.join(ROOT, f));
  console.log(`  ${exists ? '✅' : '❌'}  ${f}`);
  if (!exists) ok = false;
}

console.log('\n[ PACKAGES ]');
const missing = [];
for (const p of PKGS) {
  const exists = fs.existsSync(path.join(ROOT, 'node_modules', p));
  console.log(`  ${exists ? '✅' : '❌'}  ${p}`);
  if (!exists) { missing.push(p); ok = false; }
}

console.log('\n[ .env ]');
if (fs.existsSync(path.join(ROOT, '.env'))) {
  const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
  for (const k of ['MONGO_URI','JWT_ACCESS_SECRET','JWT_REFRESH_SECRET','WS_SECRET']) {
    const set = env.includes(k + '=') && !env.match(new RegExp(k + '=\\s*$', 'm')) && !env.includes(k + '=REPLACE');
    console.log(`  ${set ? '✅' : '⚠️ '}  ${k}${set ? '' : '  ← needs a real value'}`);
    if (!set) ok = false;
  }
} else {
  console.log('  ❌  .env missing — copy .env.example to .env');
  ok = false;
}

console.log('\n════════════════════════════════════════════');
if (ok) {
  console.log('  ✅  Ready!  Run:  node app.js\n');
} else {
  if (missing.length) console.log(`  npm install ${missing.join(' ')}\n`);
  console.log('  Copy files from auth-system-v2/ into this folder.\n');
  console.log('  Required structure next to app.js:');
  console.log('    auth/helpers.js  auth/middleware.js  auth/rateLimits.js');
  console.log('    models/AuthUser.js  models/Plugin.js');
  console.log('    notify/engine.js');
  console.log('    routes/auth.js  routes/plugins.js  routes/userSelf.js  routes/adminUsers.js');
  console.log('    public/login.html  public/admin-plugins.html');
  console.log('    scripts/seed-admin.js\n');
}
console.log('════════════════════════════════════════════\n');
