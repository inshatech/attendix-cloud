'use strict';
const crypto    = require('crypto');
const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const qrcode    = require('qrcode');

const ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);
const ACCESS_SECRET  = () => process.env.JWT_ACCESS_SECRET  || 'fallback-access-secret-change-in-production';
const REFRESH_SECRET = () => process.env.JWT_REFRESH_SECRET || 'fallback-refresh-secret-change-in-production';
const ACCESS_EXP  = () => process.env.JWT_ACCESS_EXPIRES  || '15m';
const REFRESH_EXP = () => process.env.JWT_REFRESH_EXPIRES || '7d';

async function generateOtp(ttlMs = 10 * 60 * 1000) {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const hash = await bcrypt.hash(code, ROUNDS);
  return { code, hash, expiresAt: new Date(Date.now() + ttlMs) };
}
async function verifyOtpHash(plain, hash) {
  if (!plain || !hash) return false;
  try { return await bcrypt.compare(String(plain), hash); } catch { return false; }
}
async function hashPassword(plain)           { return bcrypt.hash(plain, ROUNDS); }
async function verifyPassword(plain, hash) {
  if (!plain || !hash) return false;
  try { return await bcrypt.compare(plain, hash); } catch { return false; }
}

async function generateTotpSecret(accountName, issuer = 'AttendanceGateway') {
  const secret = speakeasy.generateSecret({ length: 20, name: `${issuer}:${accountName}` });
  const qrDataUrl = await qrcode.toDataURL(secret.otpauth_url);
  return { base32: secret.base32, otpauthUrl: secret.otpauth_url, qrDataUrl };
}
function verifyTotpToken(base32Secret, token) {
  if (!base32Secret || !token) return false;
  return speakeasy.totp.verify({
    secret: base32Secret, encoding: 'base32',
    token: String(token).replace(/\s/g, ''), window: 1,
  });
}

async function generateBackupCodes() {
  const plain  = Array.from({ length: 8 }, () => crypto.randomBytes(4).toString('hex').toUpperCase());
  const hashed = await Promise.all(plain.map(c => bcrypt.hash(c, ROUNDS)));
  return { plain, hashed };
}
async function verifyBackupCode(input, hashedCodes) {
  for (let i = 0; i < hashedCodes.length; i++) {
    if (await bcrypt.compare(String(input).toUpperCase(), hashedCodes[i])) return i;
  }
  return -1;
}

function signAccessToken(payload)  { return jwt.sign(payload, ACCESS_SECRET(),  { expiresIn: ACCESS_EXP() }); }
function verifyAccessToken(token)  { try { return jwt.verify(token, ACCESS_SECRET());  } catch { return null; } }
function signRefreshToken(payload) {
  const token = jwt.sign(payload, REFRESH_SECRET(), { expiresIn: REFRESH_EXP() });
  const hash  = hashToken(token);
  const exp   = jwt.decode(token).exp;
  return { token, hash, expiresAt: new Date(exp * 1000) };
}
function verifyRefreshToken(token) { try { return jwt.verify(token, REFRESH_SECRET()); } catch { return null; } }
function hashToken(token)          { return crypto.createHash('sha256').update(token).digest('hex'); }

module.exports = {
  generateOtp, verifyOtpHash, hashPassword, verifyPassword,
  generateTotpSecret, verifyTotpToken, generateBackupCodes, verifyBackupCode,
  signAccessToken, verifyAccessToken, signRefreshToken, verifyRefreshToken, hashToken,
};
