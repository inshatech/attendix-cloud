'use strict';
const express  = require('express');
const router   = express.Router();
const { v4: uuidv4 } = require('uuid');

const AuthUser = require('../models/AuthUser');
const { Plugin } = require('../models/Plugin');
const { sendOtp } = require('../notify/engine');

const {
  generateOtp, verifyOtpHash, hashPassword, verifyPassword,
  generateTotpSecret, verifyTotpToken, generateBackupCodes, verifyBackupCode,
  signAccessToken, signRefreshToken, verifyRefreshToken, hashToken,
} = require('../auth/helpers');
const { requireAuth } = require('../auth/middleware');
const { otpSendLimiter, otpVerifyLimiter, loginLimiter, refreshLimiter } = require('../auth/rateLimits');

const MAX_ATTEMPTS  = 5;
const LOCKOUT_MS    = 30 * 60 * 1000;

// ── Shared helpers ────────────────────────────────────────────────────────────
function tokenPayload(u) {
  return {
    userId: u.userId, role: u.role, name: u.name,
    allowedBridges: u.allowedBridges || [],
    modules: (u.modules || []).map(m => ({ name: m.name, enabled: m.enabled })),
  };
}
async function issueTokens(user, ua = '') {
  const access = signAccessToken(tokenPayload(user));
  const { token: refresh, hash, expiresAt } = signRefreshToken({ userId: user.userId });
  const now    = new Date();
  const tokens = (user.refreshTokens || []).filter(t => new Date(t.expiresAt) > now).slice(-9);
  tokens.push({ tokenHash: hash, device: ua.slice(0, 120), createdAt: now, expiresAt });
  await AuthUser.updateOne({ userId: user.userId }, {
    $set: { refreshTokens: tokens, lastLoginAt: now, loginAttempts: 0, lockedUntil: null },
  });
  return { accessToken: access, refreshToken: refresh, expiresIn: 900 };
}
function locked(u) { return u.lockedUntil && new Date() < new Date(u.lockedUntil); }
async function failAttempt(u) {
  const n = (u.loginAttempts || 0) + 1;
  const s = { loginAttempts: n };
  if (n >= MAX_ATTEMPTS) s.lockedUntil = new Date(Date.now() + LOCKOUT_MS);
  await AuthUser.updateOne({ userId: u.userId }, { $set: s });
  return n;
}
async function totpEnforced(role) {
  const p = await Plugin.findOne({ name: 'totp_2fa' }).lean();
  if (!p?.enabled) return false;
  const c = p.config || {};
  return (role === 'admin' && c.enforceForAdmins) ||
         (role === 'support' && c.enforceForSupport) ||
         (role === 'user'    && c.enforceForUsers);
}

// Pre-auth sessions for 2FA gate (5-min TTL, in-memory)
const preAuth = new Map();
function mkPreAuth(userId) {
  const t = uuidv4();
  preAuth.set(t, { userId, ts: Date.now() });
  setTimeout(() => preAuth.delete(t), 5 * 60 * 1000);
  return t;
}
function usePreAuth(t) {
  const s = preAuth.get(t);
  if (!s || Date.now() - s.ts > 5 * 60 * 1000) { preAuth.delete(t); return null; }
  preAuth.delete(t); return s.userId;
}

// Pending contact changes (in-memory, 10-min TTL)
const pendingMobile = new Map();
const pendingEmail  = new Map();

// ── REQUEST OTP ───────────────────────────────────────────────────────────────
router.post('/request-otp', otpSendLimiter, async (req, res) => {
  try {
    const { mobile, email } = req.body;
    if (!mobile && !email) return res.status(400).json({ error: 'Provide mobile or email' });

    const q = mobile ? { mobile: mobile.trim() } : { email: email.trim().toLowerCase() };
    const u = await AuthUser.findOne(q);
    if (!u || !u.isActive) {
      await new Promise(r => setTimeout(r, 300 + Math.random() * 200));
      return res.json({ status: 'success', message: 'OTP sent if account exists' });
    }
    if (locked(u)) {
      const mins = Math.ceil((new Date(u.lockedUntil) - Date.now()) / 60000);
      return res.status(423).json({ error: `Account locked. Try again in ${mins} min.` });
    }

    const { code, hash, expiresAt } = await generateOtp();
    const field = mobile ? 'mobileOtp' : 'emailOtp';
    await AuthUser.updateOne({ userId: u.userId }, {
      $set: { [field]: { code: hash, expiresAt, attempts: 0, lastSentAt: new Date() } },
    });
    const target = mobile ? { mobile: mobile.trim() } : { email: email.trim().toLowerCase() };
    const { errors } = await sendOtp({ ...target, name: u.name }, code, u.name);
    if (errors.length) console.warn('[auth] OTP send warnings:', errors);
    res.json({ status: 'success', message: 'OTP sent if account exists' });
  } catch (e) { console.error('[auth] request-otp:', e.message); res.status(500).json({ error: 'Failed to send OTP' }); }
});

// ── VERIFY OTP ────────────────────────────────────────────────────────────────
router.post('/verify-otp', otpVerifyLimiter, async (req, res) => {
  try {
    const { mobile, email, otp } = req.body;
    if (!otp || (!mobile && !email)) return res.status(400).json({ error: 'Provide mobile/email and otp' });
    const q = mobile ? { mobile: mobile.trim() } : { email: email.trim().toLowerCase() };
    const u = await AuthUser.findOne(q);
    if (!u || !u.isActive) return res.status(401).json({ error: 'Invalid OTP' });
    if (locked(u)) return res.status(423).json({ error: 'Account locked' });

    const doc   = mobile ? u.mobileOtp : u.emailOtp;
    const field = mobile ? 'mobileOtp'  : 'emailOtp';
    if (!doc?.code)                           return res.status(400).json({ error: 'No OTP sent. Request a new one.' });
    if (new Date() > new Date(doc.expiresAt)) return res.status(400).json({ error: 'OTP expired. Request a new one.' });
    if ((doc.attempts || 0) >= 5)             { await failAttempt(u); return res.status(429).json({ error: 'Too many attempts.' }); }

    if (!await verifyOtpHash(otp, doc.code)) {
      await AuthUser.updateOne({ userId: u.userId }, { $inc: { [`${field}.attempts`]: 1 } });
      await failAttempt(u);
      return res.status(401).json({ error: 'Invalid OTP' });
    }
    await AuthUser.updateOne({ userId: u.userId }, {
      $set: {
        [field]: { code: null, expiresAt: null, attempts: 0 },
        [mobile ? 'mobileVerified' : 'emailVerified']: true,
        loginAttempts: 0, lockedUntil: null,
      },
    });
    if ((u.totpEnabled || await totpEnforced(u.role)) && u.totpSecret)
      return res.json({ status: 'success', requires2FA: true, preAuthToken: mkPreAuth(u.userId) });

    const tokens = await issueTokens(u, req.headers['user-agent']);
    await AuthUser.updateOne({ userId: u.userId }, { $set: { lastLoginIp: req.ip } });
    res.json({ status: 'success', role: u.role, name: u.name, ...tokens });
  } catch (e) { console.error('[auth] verify-otp:', e.message); res.status(500).json({ error: 'Verification failed' }); }
});

// ── PASSWORD LOGIN ────────────────────────────────────────────────────────────
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { mobile, email, password } = req.body;
    if (!password || (!mobile && !email)) return res.status(400).json({ error: 'Provide mobile/email and password' });
    const q = mobile ? { mobile: mobile.trim() } : { email: email.trim().toLowerCase() };
    const u = await AuthUser.findOne(q);
    if (!u || !u.isActive || !u.passwordHash) return res.status(401).json({ error: 'Invalid credentials' });
    if (locked(u)) {
      const mins = Math.ceil((new Date(u.lockedUntil) - Date.now()) / 60000);
      return res.status(423).json({ error: `Account locked. Try again in ${mins} min.` });
    }
    if (!await verifyPassword(password, u.passwordHash)) {
      const n = await failAttempt(u);
      return res.status(401).json({ error: 'Invalid credentials', attemptsRemaining: Math.max(0, MAX_ATTEMPTS - n) });
    }
    if ((u.totpEnabled || await totpEnforced(u.role)) && u.totpSecret)
      return res.json({ status: 'success', requires2FA: true, preAuthToken: mkPreAuth(u.userId) });

    const tokens = await issueTokens(u, req.headers['user-agent']);
    await AuthUser.updateOne({ userId: u.userId }, { $set: { lastLoginIp: req.ip } });
    res.json({ status: 'success', role: u.role, name: u.name, ...tokens });
  } catch (e) { console.error('[auth] login:', e.message); res.status(500).json({ error: 'Login failed' }); }
});

// ── TOTP 2FA VERIFY ───────────────────────────────────────────────────────────
router.post('/totp/verify', loginLimiter, async (req, res) => {
  try {
    const { preAuthToken, totpToken, backupCode } = req.body;
    if (!preAuthToken) return res.status(400).json({ error: 'preAuthToken required' });
    const userId = usePreAuth(preAuthToken);
    if (!userId) return res.status(401).json({ error: 'Session expired. Log in again.' });
    const u = await AuthUser.findOne({ userId });
    if (!u || !u.isActive) return res.status(401).json({ error: 'Account not found' });

    let ok = false;
    if (totpToken) ok = verifyTotpToken(u.totpSecret, totpToken);
    if (!ok && backupCode) {
      const idx = await verifyBackupCode(backupCode, u.totpBackupCodes || []);
      if (idx >= 0) {
        ok = true;
        const codes = [...u.totpBackupCodes]; codes.splice(idx, 1);
        await AuthUser.updateOne({ userId }, { $set: { totpBackupCodes: codes } });
      }
    }
    if (!ok) { await failAttempt(u); return res.status(401).json({ error: 'Invalid 2FA code' }); }
    const tokens = await issueTokens(u, req.headers['user-agent']);
    await AuthUser.updateOne({ userId }, { $set: { lastLoginIp: req.ip } });
    res.json({ status: 'success', role: u.role, name: u.name, ...tokens });
  } catch (e) { res.status(500).json({ error: '2FA failed' }); }
});

// ── TOTP SETUP / ENABLE / DISABLE ────────────────────────────────────────────
router.post('/totp/setup', requireAuth, async (req, res) => {
  try {
    const plug = await Plugin.findOne({ name: 'totp_2fa' }).lean();
    if (!plug?.enabled) return res.status(403).json({ error: '2FA is not enabled on this platform' });
    const u = await AuthUser.findOne({ userId: req.authUser.userId });
    if (!u) return res.status(404).json({ error: 'User not found' });
    if (u.totpEnabled) return res.status(409).json({ error: '2FA already active. Disable first.' });
    const { base32, otpauthUrl, qrDataUrl } = await generateTotpSecret(u.email || u.mobile || u.name, plug.config?.issuer || 'AttendanceGateway');
    await AuthUser.updateOne({ userId: u.userId }, { $set: { totpSecret: base32, totpEnabled: false } });
    res.json({ status: 'success', secret: base32, otpauthUrl, qrDataUrl });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/totp/enable', requireAuth, async (req, res) => {
  try {
    const { totpToken } = req.body;
    if (!totpToken) return res.status(400).json({ error: 'totpToken required' });
    const u = await AuthUser.findOne({ userId: req.authUser.userId });
    if (!u?.totpSecret) return res.status(400).json({ error: 'Run /auth/totp/setup first' });
    if (!verifyTotpToken(u.totpSecret, totpToken)) return res.status(401).json({ error: 'Invalid code' });
    const { plain: backupCodes, hashed } = await generateBackupCodes();
    await AuthUser.updateOne({ userId: u.userId }, { $set: { totpEnabled: true, totpBackupCodes: hashed } });
    res.json({ status: 'success', message: '2FA enabled. Save backup codes — shown ONCE.', backupCodes });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/totp/disable', requireAuth, async (req, res) => {
  try {
    const { totpToken, password } = req.body;
    const u = await AuthUser.findOne({ userId: req.authUser.userId });
    if (!u) return res.status(404).json({ error: 'User not found' });
    // Prevent disabling if admin enforces it
    if (await totpEnforced(u.role)) return res.status(403).json({ error: '2FA is enforced for your role by administrator' });
    let ok = false;
    if (totpToken) ok = verifyTotpToken(u.totpSecret, totpToken);
    if (!ok && password && u.passwordHash) ok = await verifyPassword(password, u.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Provide valid TOTP token or password' });
    await AuthUser.updateOne({ userId: u.userId }, { $set: { totpEnabled: false, totpSecret: null, totpBackupCodes: [] } });
    res.json({ status: 'success', message: '2FA disabled' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── REFRESH / LOGOUT ──────────────────────────────────────────────────────────
router.post('/refresh', refreshLimiter, async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'refreshToken required' });
    const payload = verifyRefreshToken(refreshToken);
    if (!payload) return res.status(401).json({ error: 'Token invalid or expired' });
    const th = hashToken(refreshToken);
    const u  = await AuthUser.findOne({ userId: payload.userId, 'refreshTokens.tokenHash': th });
    if (!u || !u.isActive) return res.status(401).json({ error: 'Token revoked' });
    await AuthUser.updateOne({ userId: u.userId }, { $pull: { refreshTokens: { tokenHash: th } } });
    const tokens = await issueTokens(u, req.headers['user-agent']);
    res.json({ status: 'success', ...tokens });
  } catch (e) { res.status(500).json({ error: 'Refresh failed' }); }
});

router.post('/logout', requireAuth, async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      const th = hashToken(refreshToken);
      await AuthUser.updateOne({ userId: req.authUser.userId }, { $pull: { refreshTokens: { tokenHash: th } } });
    }
    res.json({ status: 'success', message: 'Logged out' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/logout-all', requireAuth, async (req, res) => {
  try {
    await AuthUser.updateOne({ userId: req.authUser.userId }, { $set: { refreshTokens: [] } });
    res.json({ status: 'success', message: 'All sessions revoked' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── FORGOT / RESET PASSWORD ───────────────────────────────────────────────────
router.post('/forgot-password', otpSendLimiter, async (req, res) => {
  try {
    const { mobile, email } = req.body;
    if (!mobile && !email) return res.status(400).json({ error: 'Provide mobile or email' });
    const q = mobile ? { mobile: mobile.trim() } : { email: email.trim().toLowerCase() };
    const u = await AuthUser.findOne(q);
    if (!u || !u.isActive) {
      await new Promise(r => setTimeout(r, 300 + Math.random() * 200));
      return res.json({ status: 'success', message: 'Reset OTP sent if account exists' });
    }
    const { code, hash, expiresAt } = await generateOtp(15 * 60 * 1000);
    const field = mobile ? 'mobileOtp' : 'emailOtp';
    await AuthUser.updateOne({ userId: u.userId }, { $set: { [field]: { code: hash, expiresAt, attempts: 0, lastSentAt: new Date() } } });
    const target = mobile ? { mobile: mobile.trim() } : { email: email.trim().toLowerCase() };
    await sendOtp({ ...target, name: u.name }, code, u.name).catch(e => console.error('[auth] forgot-pw OTP:', e.message));
    res.json({ status: 'success', message: 'Reset OTP sent if account exists' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/reset-password', otpVerifyLimiter, async (req, res) => {
  try {
    const { mobile, email, otp, newPassword } = req.body;
    if (!otp || !newPassword || (!mobile && !email)) return res.status(400).json({ error: 'mobile/email, otp, newPassword required' });
    if (newPassword.length < 8) return res.status(400).json({ error: 'Password min 8 characters' });
    const q = mobile ? { mobile: mobile.trim() } : { email: email.trim().toLowerCase() };
    const u = await AuthUser.findOne(q);
    if (!u || !u.isActive) return res.status(401).json({ error: 'Invalid OTP' });
    const doc = mobile ? u.mobileOtp : u.emailOtp;
    const field = mobile ? 'mobileOtp' : 'emailOtp';
    if (!doc?.code || new Date() > new Date(doc.expiresAt)) return res.status(400).json({ error: 'OTP expired' });
    if (!await verifyOtpHash(otp, doc.code)) return res.status(401).json({ error: 'Invalid OTP' });
    await AuthUser.updateOne({ userId: u.userId }, {
      $set: {
        passwordHash: await hashPassword(newPassword), passwordChangedAt: new Date(),
        refreshTokens: [], loginAttempts: 0, lockedUntil: null,
        [field]: { code: null, expiresAt: null, attempts: 0 },
      },
    });
    res.json({ status: 'success', message: 'Password reset. Please log in.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── CHANGE PASSWORD (authenticated) ───────────────────────────────────────────
router.post('/change-password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'currentPassword and newPassword required' });
    if (newPassword.length < 8) return res.status(400).json({ error: 'Min 8 characters' });
    const u = await AuthUser.findOne({ userId: req.authUser.userId });
    if (!u) return res.status(404).json({ error: 'User not found' });
    if (!u.passwordHash) return res.status(400).json({ error: 'Account uses OTP login — no password set' });
    if (!await verifyPassword(currentPassword, u.passwordHash)) return res.status(401).json({ error: 'Current password incorrect' });
    await AuthUser.updateOne({ userId: u.userId }, {
      $set: { passwordHash: await hashPassword(newPassword), passwordChangedAt: new Date(), refreshTokens: [] },
    });
    res.json({ status: 'success', message: 'Password changed. All devices logged out.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── CHANGE MOBILE (OTP-verified) ──────────────────────────────────────────────
router.post('/change-mobile/request', requireAuth, otpSendLimiter, async (req, res) => {
  try {
    const { newMobile } = req.body;
    if (!newMobile) return res.status(400).json({ error: 'newMobile required' });
    const mob = newMobile.trim();
    const ex  = await AuthUser.findOne({ mobile: mob });
    if (ex && ex.userId !== req.authUser.userId) return res.status(409).json({ error: 'Mobile already in use' });
    const { code, hash, expiresAt } = await generateOtp();
    pendingMobile.set(req.authUser.userId, { mobile: mob, hash, expiresAt });
    setTimeout(() => pendingMobile.delete(req.authUser.userId), 10 * 60 * 1000);
    await sendOtp({ mobile: mob, name: req.authUser.name }, code, req.authUser.name);
    res.json({ status: 'success', message: `OTP sent to ${mob}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/change-mobile/confirm', requireAuth, otpVerifyLimiter, async (req, res) => {
  try {
    const { otp } = req.body;
    if (!otp) return res.status(400).json({ error: 'otp required' });
    const p = pendingMobile.get(req.authUser.userId);
    if (!p) return res.status(400).json({ error: 'No pending change. Request OTP first.' });
    if (new Date() > new Date(p.expiresAt)) { pendingMobile.delete(req.authUser.userId); return res.status(400).json({ error: 'OTP expired' }); }
    if (!await verifyOtpHash(otp, p.hash)) return res.status(401).json({ error: 'Invalid OTP' });
    await AuthUser.updateOne({ userId: req.authUser.userId }, { $set: { mobile: p.mobile, mobileVerified: true } });
    pendingMobile.delete(req.authUser.userId);
    res.json({ status: 'success', message: 'Mobile updated', mobile: p.mobile });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── CHANGE EMAIL (OTP-verified) ───────────────────────────────────────────────
router.post('/change-email/request', requireAuth, otpSendLimiter, async (req, res) => {
  try {
    const { newEmail } = req.body;
    if (!newEmail) return res.status(400).json({ error: 'newEmail required' });
    const em = newEmail.trim().toLowerCase();
    const ex = await AuthUser.findOne({ email: em });
    if (ex && ex.userId !== req.authUser.userId) return res.status(409).json({ error: 'Email already in use' });
    const { code, hash, expiresAt } = await generateOtp();
    pendingEmail.set(req.authUser.userId, { email: em, hash, expiresAt });
    setTimeout(() => pendingEmail.delete(req.authUser.userId), 10 * 60 * 1000);
    await sendOtp({ email: em, name: req.authUser.name }, code, req.authUser.name);
    res.json({ status: 'success', message: `OTP sent to ${em}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/change-email/confirm', requireAuth, otpVerifyLimiter, async (req, res) => {
  try {
    const { otp } = req.body;
    if (!otp) return res.status(400).json({ error: 'otp required' });
    const p = pendingEmail.get(req.authUser.userId);
    if (!p) return res.status(400).json({ error: 'No pending change. Request OTP first.' });
    if (new Date() > new Date(p.expiresAt)) { pendingEmail.delete(req.authUser.userId); return res.status(400).json({ error: 'OTP expired' }); }
    if (!await verifyOtpHash(otp, p.hash)) return res.status(401).json({ error: 'Invalid OTP' });
    await AuthUser.updateOne({ userId: req.authUser.userId }, { $set: { email: p.email, emailVerified: true } });
    pendingEmail.delete(req.authUser.userId);
    res.json({ status: 'success', message: 'Email updated', email: p.email });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── ME ────────────────────────────────────────────────────────────────────────
router.get('/me', requireAuth, async (req, res) => {
  try {
    const u = await AuthUser.findOne({ userId: req.authUser.userId })
      .select('-passwordHash -totpSecret -totpBackupCodes -refreshTokens -mobileOtp -emailOtp').lean();
    if (!u) return res.status(404).json({ error: 'User not found' });
    res.json({ status: 'success', data: u });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GOOGLE OAUTH ──────────────────────────────────────────────────────────────
router.get('/google/status', async (req, res) => {
  try {
    const { Plugin } = require('../models/Plugin');
    const p = await Plugin.findOne({ name:'google_auth' }).lean();
    const clientId = p?.config?.clientId || process.env.GOOGLE_CLIENT_ID || '';
    const enabled  = !!(p?.enabled && clientId);
    res.json({ enabled, clientId: enabled ? clientId : '' });
  } catch(e) {
    const fallback = !!(process.env.GOOGLE_CLIENT_ID);
    res.json({ enabled: fallback, clientId: process.env.GOOGLE_CLIENT_ID || '' });
  }
});

router.get('/google/client-id', async (req, res) => {
  try {
    const { Plugin } = require('../models/Plugin');
    const p = await Plugin.findOne({ name:'google_auth' }).lean();
    const clientId = p?.config?.clientId || process.env.GOOGLE_CLIENT_ID || null;
    if (!clientId) return res.status(503).json({ error: 'Google Sign-In not configured. Please add your Google Client ID in Admin → Plugins → Google Sign-In.' });
    if (p && !p.enabled) return res.status(503).json({ error: 'Google Sign-In is disabled. Please enable it in Admin → Plugins.' });
    res.json({ clientId });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

// ── SELF REGISTER ─────────────────────────────────────────────────────────────
/**
 * POST /auth/register
 * Public endpoint — user registers themselves, gets 'user' role,
 * and automatically receives a free trial if a trial plan is defined.
 *
 * Body: { name, email?, mobile?, password }
 */
router.post('/register', async (req, res) => {
  try {
    const { name, email, mobile, password } = req.body;
    if (!name)     return res.status(400).json({ error: 'name required' });
    if (!email && !mobile) return res.status(400).json({ error: 'email or mobile required' });
    if (!password || password.length < 8)
      return res.status(400).json({ error: 'password required (min 8 characters)' });

    const em  = email  ? email.trim().toLowerCase() : null;
    const mob = mobile ? mobile.trim()              : null;

    // Duplicate checks
    if (em)  { const ex = await AuthUser.findOne({ email: em });   if (ex) return res.status(409).json({ error: 'Email already registered' }); }
    if (mob) { const ex = await AuthUser.findOne({ mobile: mob }); if (ex) return res.status(409).json({ error: 'Mobile already registered' }); }

    const u = await AuthUser.create({
      userId:       `usr-${uuidv4().split('-')[0]}`,
      name,
      email:        em,
      mobile:       mob,
      passwordHash: await hashPassword(password),
      role:         'user',
      isActive:     true,
      emailVerified: false,
      mobileVerified: false,
      allowedBridges: [],
      modules:        [],
      createdBy:      'self-register',
    });

    // Trial starts when user creates their first organization (not on signup)
    // Issue tokens immediately (auto-login after register)
    const payload = { userId: u.userId, role: u.role, name: u.name, allowedBridges: [], modules: [] };
    const accessToken = signAccessToken(payload);
    const { token: refreshToken, hash, expiresAt } = signRefreshToken({ userId: u.userId });
    await AuthUser.updateOne({ userId: u.userId }, {
      $set: { refreshTokens: [{ tokenHash: hash, device: 'register', createdAt: new Date(), expiresAt }] },
    });

    res.status(201).json({
      status:  'success',
      message: 'Account created! Create your first organization to start your free trial.',
      role:    u.role,
      name:    u.name,
      accessToken,
      refreshToken,
      expiresIn: 900,
    });
  } catch (e) {
    console.error('[auth] register:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── GOOGLE SIGN-IN (ID Token flow) ───────────────────────────────────────────
const { OAuth2Client } = require('google-auth-library');

router.post('/google', async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ error: 'Google credential required' });

    const { Plugin } = require('../models/Plugin');
    const gPlugin  = await Plugin.findOne({ name:'google_auth' }).lean();
    const clientId = gPlugin?.config?.clientId || process.env.GOOGLE_CLIENT_ID;
    if (!clientId) return res.status(503).json({ error: 'Google Sign-In not configured. Add credentials in Admin → Plugins.' });
    if (gPlugin && !gPlugin.enabled) return res.status(503).json({ error: 'Google Sign-In is disabled in Admin → Plugins.' });

    // Verify the ID token
    const client = new OAuth2Client(clientId);
    let payload;
    try {
      const ticket = await client.verifyIdToken({ idToken: credential, audience: clientId });
      payload = ticket.getPayload();
    } catch {
      return res.status(401).json({ error: 'Invalid Google credential' });
    }

    const { sub: googleId, email, name, picture } = payload;
    if (!email) return res.status(400).json({ error: 'Google account has no email' });

    let user = await AuthUser.findOne({ $or: [{ googleId }, { email: email.toLowerCase() }] });

    if (!user) {
      // Auto-register via Google
      user = new AuthUser({
        userId:   uuidv4(),
        name,
        email:    email.toLowerCase(),
        googleId,
        role:     'user',
        isActive: true,
        photoUrl: picture || null,
      });
      await user.save();
      // Trial starts on first org creation
    } else {
      // Link googleId if signing in with matching email
      if (!user.googleId) {
        await AuthUser.updateOne({ userId: user.userId }, { $set: { googleId, photoUrl: picture || user.photoUrl } });
        user.googleId = googleId;
      }
      if (!user.isActive) return res.status(403).json({ error: 'Account suspended' });
    }

    // 2FA check
    if (await totpEnforced(user.role) && user.totpEnabled) {
      const pre = uuidv4();
      await AuthUser.updateOne({ userId: user.userId }, { $set: { preAuthToken: pre, preAuthExpires: new Date(Date.now() + 300000) } });
      return res.json({ requires2FA: true, preAuthToken: pre });
    }

    const ua = req.headers['user-agent'] || '';
    const { accessToken, refreshToken, expiresIn } = await issueTokens(user, ua);
    const tp = tokenPayload(user);
    res.json({ status:'success', ...tp, accessToken, refreshToken, expiresIn });
  } catch (e) {
    console.error('Google auth error:', e);
    res.status(500).json({ error: e.message });
  }
});
