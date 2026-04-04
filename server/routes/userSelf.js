'use strict';
const express  = require('express');
const router   = express.Router();

const AuthUser = require('../models/AuthUser');
const { Plugin } = require('../models/Plugin');
const { requireAuth } = require('../auth/middleware');
const { generalApiLimiter, otpSendLimiter, otpVerifyLimiter } = require('../auth/rateLimits');
const {
  generateOtp, verifyOtpHash,
  generateTotpSecret, verifyTotpToken,
  generateBackupCodes, verifyBackupCode,
} = require('../auth/helpers');
const { sendOtp } = require('../notify/engine');
const { uploadBase64, deleteImage, publicIdFromUrl } = require('../services/uploadService');

router.use(requireAuth, generalApiLimiter);

// Pending mobile/email changes (in-memory, 10-min TTL)
const pendingMobile = new Map();
const pendingEmail  = new Map();

// ── GET PROFILE ───────────────────────────────────────────────────────────────
router.get('/profile', async (req, res) => {
  try {
    const u = await AuthUser.findOne({ userId: req.authUser.userId })
      .select('-passwordHash -totpSecret -totpBackupCodes -refreshTokens -mobileOtp -emailOtp')
      .lean();
    if (!u) return res.status(404).json({ error: 'User not found' });
    res.json({ status: 'success', data: u });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── UPDATE PROFILE (name, bio, designation, department) ──────────────────────
router.patch('/profile', async (req, res) => {
  try {
    const allowed = ['name', 'bio', 'designation', 'department'];
    const update  = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) update[k] = req.body[k];
    }
    if (!Object.keys(update).length) return res.status(400).json({ error: 'Nothing to update' });
    if (update.name !== undefined && !String(update.name).trim())
      return res.status(400).json({ error: 'Name cannot be empty' });

    const u = await AuthUser.findOneAndUpdate(
      { userId: req.authUser.userId },
      { $set: update },
      { new: true }
    ).select('-passwordHash -totpSecret -totpBackupCodes -refreshTokens -mobileOtp -emailOtp');
    if (!u) return res.status(404).json({ error: 'User not found' });
    res.json({ status: 'success', data: u });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── AVATAR UPLOAD ─────────────────────────────────────────────────────────────
// POST /user/profile/avatar
// Body: { image: "data:image/jpeg;base64,..." }
router.post('/profile/avatar', async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) return res.status(400).json({ error: 'image field (base64 data URI) is required' });
    if (!image.startsWith('data:image/'))
      return res.status(400).json({ error: 'Invalid format. Send a base64 data URI like: data:image/jpeg;base64,...' });

    // Cloudinary must be enabled
    const cloudPlugin = await Plugin.findOne({ name: 'cloudinary' }).lean();
    if (!cloudPlugin?.enabled)
      return res.status(503).json({ error: 'Image upload is not enabled. Ask admin to configure Cloudinary in Admin → Plugins.' });

    const u = await AuthUser.findOne({ userId: req.authUser.userId }).lean();
    if (!u) return res.status(404).json({ error: 'User not found' });

    // Delete old avatar from Cloudinary
    if (u.avatarUrl) {
      const pid = publicIdFromUrl(u.avatarUrl);
      if (pid) await deleteImage(pid).catch(() => {});
    }

    // Upload compressed 200×200 WebP
    const result = await uploadBase64(image, 'avatar', `user_${req.authUser.userId}`);

    await AuthUser.updateOne({ userId: req.authUser.userId }, { $set: { avatarUrl: result.url } });

    res.json({
      status:     'success',
      message:    'Avatar updated',
      avatarUrl:  result.url,
      size:       `${Math.round(result.bytes / 1024)}KB`,
      dimensions: `${result.width}×${result.height}`,
    });
  } catch (e) {
    console.error('[avatar]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── REMOVE AVATAR ─────────────────────────────────────────────────────────────
router.delete('/profile/avatar', async (req, res) => {
  try {
    const u = await AuthUser.findOne({ userId: req.authUser.userId }).lean();
    if (!u) return res.status(404).json({ error: 'User not found' });
    if (u.avatarUrl) {
      const pid = publicIdFromUrl(u.avatarUrl);
      if (pid) await deleteImage(pid).catch(() => {});
    }
    await AuthUser.updateOne({ userId: req.authUser.userId }, { $set: { avatarUrl: null } });
    res.json({ status: 'success', message: 'Avatar removed' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── VERIFY MOBILE — request OTP ───────────────────────────────────────────────
// POST /user/verify-mobile/request
// Sends OTP to the user's current mobile number for verification
router.post('/verify-mobile/request', otpSendLimiter, async (req, res) => {
  try {
    const u = await AuthUser.findOne({ userId: req.authUser.userId }).lean();
    if (!u) return res.status(404).json({ error: 'User not found' });
    if (!u.mobile) return res.status(400).json({ error: 'No mobile number on your account. Ask admin to add one.' });
    if (u.mobileVerified) return res.status(409).json({ error: 'Mobile is already verified' });

    const { code, hash, expiresAt } = await generateOtp();
    await AuthUser.updateOne(
      { userId: u.userId },
      { $set: { mobileOtp: { code: hash, expiresAt, attempts: 0, lastSentAt: new Date() } } }
    );
    await sendOtp({ mobile: u.mobile, name: u.name }, code, u.name)
      .catch(e => console.error('[verify-mobile] OTP send:', e.message));

    res.json({ status: 'success', message: `OTP sent to ${u.mobile}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── VERIFY MOBILE — confirm OTP ───────────────────────────────────────────────
// POST /user/verify-mobile/confirm
// Body: { otp: "123456" }
router.post('/verify-mobile/confirm', otpVerifyLimiter, async (req, res) => {
  try {
    const { otp } = req.body;
    if (!otp) return res.status(400).json({ error: 'otp is required' });

    const u = await AuthUser.findOne({ userId: req.authUser.userId }).lean();
    if (!u) return res.status(404).json({ error: 'User not found' });
    if (u.mobileVerified) return res.status(409).json({ error: 'Mobile already verified' });

    const doc = u.mobileOtp;
    if (!doc?.code)
      return res.status(400).json({ error: 'No OTP sent. Request one first via POST /user/verify-mobile/request' });
    if (new Date() > new Date(doc.expiresAt))
      return res.status(400).json({ error: 'OTP has expired. Request a new one.' });
    if ((doc.attempts || 0) >= 5)
      return res.status(429).json({ error: 'Too many incorrect attempts. Request a new OTP.' });

    if (!await verifyOtpHash(otp, doc.code)) {
      await AuthUser.updateOne({ userId: u.userId }, { $inc: { 'mobileOtp.attempts': 1 } });
      return res.status(401).json({ error: 'Invalid OTP' });
    }

    await AuthUser.updateOne({ userId: u.userId }, {
      $set: {
        mobileVerified: true,
        mobileOtp: { code: null, expiresAt: null, attempts: 0 },
      },
    });
    res.json({ status: 'success', message: 'Mobile number verified successfully' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── VERIFY EMAIL — request OTP ────────────────────────────────────────────────
router.post('/verify-email/request', otpSendLimiter, async (req, res) => {
  try {
    const u = await AuthUser.findOne({ userId: req.authUser.userId }).lean();
    if (!u) return res.status(404).json({ error: 'User not found' });
    if (!u.email) return res.status(400).json({ error: 'No email address on your account.' });
    if (u.emailVerified) return res.status(409).json({ error: 'Email is already verified' });

    const { code, hash, expiresAt } = await generateOtp();
    await AuthUser.updateOne(
      { userId: u.userId },
      { $set: { emailOtp: { code: hash, expiresAt, attempts: 0, lastSentAt: new Date() } } }
    );
    await sendOtp({ email: u.email, name: u.name }, code, u.name)
      .catch(e => console.error('[verify-email] OTP send:', e.message));

    res.json({ status: 'success', message: `OTP sent to ${u.email}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── VERIFY EMAIL — confirm OTP ────────────────────────────────────────────────
router.post('/verify-email/confirm', otpVerifyLimiter, async (req, res) => {
  try {
    const { otp } = req.body;
    if (!otp) return res.status(400).json({ error: 'otp is required' });

    const u = await AuthUser.findOne({ userId: req.authUser.userId }).lean();
    if (!u) return res.status(404).json({ error: 'User not found' });
    if (u.emailVerified) return res.status(409).json({ error: 'Email already verified' });

    const doc = u.emailOtp;
    if (!doc?.code) return res.status(400).json({ error: 'No OTP sent. Request one first.' });
    if (new Date() > new Date(doc.expiresAt)) return res.status(400).json({ error: 'OTP expired. Request a new one.' });
    if ((doc.attempts || 0) >= 5) return res.status(429).json({ error: 'Too many attempts. Request a new OTP.' });

    if (!await verifyOtpHash(otp, doc.code)) {
      await AuthUser.updateOne({ userId: u.userId }, { $inc: { 'emailOtp.attempts': 1 } });
      return res.status(401).json({ error: 'Invalid OTP' });
    }

    await AuthUser.updateOne({ userId: u.userId }, {
      $set: { emailVerified: true, emailOtp: { code: null, expiresAt: null, attempts: 0 } },
    });
    res.json({ status: 'success', message: 'Email address verified successfully' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── 2FA STATUS ────────────────────────────────────────────────────────────────
// GET /user/2fa/status
router.get('/2fa/status', async (req, res) => {
  try {
    const [u, plug] = await Promise.all([
      AuthUser.findOne({ userId: req.authUser.userId }).select('totpEnabled role').lean(),
      Plugin.findOne({ name: 'totp_2fa' }).lean(),
    ]);
    if (!u) return res.status(404).json({ error: 'User not found' });
    const c        = plug?.config || {};
    const enforced = plug?.enabled && (
      (u.role === 'admin'   && c.enforceForAdmins)  ||
      (u.role === 'support' && c.enforceForSupport) ||
      (u.role === 'user'    && c.enforceForUsers)
    );
    res.json({
      status: 'success',
      data: {
        platformEnabled: !!plug?.enabled,
        userEnabled:     !!u.totpEnabled,
        enforced:        !!enforced,
        issuer:          c.issuer || 'AttendanceGateway',
      },
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── 2FA SETUP — generate QR code ─────────────────────────────────────────────
// POST /user/2fa/setup
// Returns: { secret, qrDataUrl, otpauthUrl }
// User scans QR in authenticator app, then calls /2fa/enable with first code to confirm
router.post('/2fa/setup', async (req, res) => {
  try {
    const plug = await Plugin.findOne({ name: 'totp_2fa' }).lean();
    if (!plug?.enabled) return res.status(403).json({ error: '2FA is not enabled on this platform. Ask admin to enable it in Admin → Plugins.' });

    const u = await AuthUser.findOne({ userId: req.authUser.userId }).lean();
    if (!u) return res.status(404).json({ error: 'User not found' });
    if (u.totpEnabled) return res.status(409).json({ error: '2FA is already active. Disable it first if you want to reset.' });

    const issuer   = plug.config?.issuer || 'AttendanceGateway';
    const account  = u.email || u.mobile || u.name;
    const { base32, otpauthUrl, qrDataUrl } = await generateTotpSecret(account, issuer);

    // Save secret (not enabled yet — user must confirm with a code)
    await AuthUser.updateOne({ userId: u.userId }, { $set: { totpSecret: base32, totpEnabled: false } });

    res.json({
      status:     'success',
      secret:     base32,
      otpauthUrl,
      qrDataUrl,
      message:    'Scan the QR code in your authenticator app, then call POST /user/2fa/enable with the 6-digit code to activate.',
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── 2FA ENABLE — confirm with first code ─────────────────────────────────────
// POST /user/2fa/enable
// Body: { totpToken: "123456" }
// Returns: { backupCodes } — shown ONCE, store securely
router.post('/2fa/enable', async (req, res) => {
  try {
    const { totpToken } = req.body;
    if (!totpToken) return res.status(400).json({ error: 'totpToken (6-digit code from authenticator) is required' });

    const u = await AuthUser.findOne({ userId: req.authUser.userId }).lean();
    if (!u) return res.status(404).json({ error: 'User not found' });
    if (!u.totpSecret) return res.status(400).json({ error: 'Run POST /user/2fa/setup first to generate a QR code' });
    if (u.totpEnabled) return res.status(409).json({ error: '2FA is already enabled' });

    if (!verifyTotpToken(u.totpSecret, totpToken))
      return res.status(401).json({ error: 'Invalid code. Make sure your authenticator is synced to the correct time.' });

    const { plain: backupCodes, hashed } = await generateBackupCodes();
    await AuthUser.updateOne({ userId: u.userId }, {
      $set: { totpEnabled: true, totpBackupCodes: hashed },
    });

    res.json({
      status:      'success',
      message:     '2FA enabled successfully. Save your backup codes — they are shown only once.',
      backupCodes, // 8 codes, each usable once
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── 2FA DISABLE ───────────────────────────────────────────────────────────────
// POST /user/2fa/disable
// Body: { totpToken: "123456" }  OR  { backupCode: "ABCD1234" }
router.post('/2fa/disable', async (req, res) => {
  try {
    const { totpToken, backupCode } = req.body;
    if (!totpToken && !backupCode)
      return res.status(400).json({ error: 'Provide totpToken (authenticator code) or backupCode to disable 2FA' });

    const u = await AuthUser.findOne({ userId: req.authUser.userId }).lean();
    if (!u) return res.status(404).json({ error: 'User not found' });
    if (!u.totpEnabled) return res.status(400).json({ error: '2FA is not currently enabled' });


    let ok = false;
    if (totpToken) {
      ok = verifyTotpToken(u.totpSecret, totpToken);
    } else if (backupCode) {
      const idx = await verifyBackupCode(backupCode, u.totpBackupCodes || []);
      if (idx >= 0) {
        ok = true;
        const codes = [...u.totpBackupCodes];
        codes.splice(idx, 1);
        await AuthUser.updateOne({ userId: u.userId }, { $set: { totpBackupCodes: codes } });
      }
    }

    if (!ok) return res.status(401).json({ error: 'Invalid code. Provide your authenticator code or a backup code.' });

    await AuthUser.updateOne({ userId: u.userId }, {
      $set: { totpEnabled: false, totpSecret: null, totpBackupCodes: [] },
    });
    res.json({ status: 'success', message: '2FA has been disabled.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── SESSIONS ──────────────────────────────────────────────────────────────────
router.get('/sessions', async (req, res) => {
  try {
    const u = await AuthUser.findOne({ userId: req.authUser.userId }).select('refreshTokens').lean();
    if (!u) return res.status(404).json({ error: 'User not found' });
    const sessions = (u.refreshTokens || []).map(t => ({
      device: t.device, createdAt: t.createdAt, expiresAt: t.expiresAt,
    }));
    res.json({ status: 'success', count: sessions.length, data: sessions });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/sessions', async (req, res) => {
  try {
    await AuthUser.updateOne({ userId: req.authUser.userId }, { $set: { refreshTokens: [] } });
    res.json({ status: 'success', message: 'All sessions revoked' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── MODULES ───────────────────────────────────────────────────────────────────
router.get('/modules', async (req, res) => {
  try {
    const u = await AuthUser.findOne({ userId: req.authUser.userId }).select('modules').lean();
    if (!u) return res.status(404).json({ error: 'User not found' });
    res.json({
      status: 'success',
      data: (u.modules || []).filter(m => m.enabled).map(m => ({
        name: m.name, enabled: m.enabled, apiEndpoint: m.apiEndpoint,
        config: m.config, hasApiKey: !!m.apiKey, enabledAt: m.enabledAt,
      })),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

// ── USER TICKET NOTIFICATIONS ─────────────────────────────────────────────────
router.get('/ticket-notifications', requireAuth, async (req, res) => {
  try {
    const mongoose = require('mongoose');
    let Ticket;
    try { Ticket = mongoose.model('Ticket'); } catch { return res.json({ status: 'success', count: 0, data: [] }); }
    const tickets = await Ticket.find({
      userId: req.authUser.userId,
      status: { $in: ['open', 'pending', 'replied'] }
    }).sort({ updatedAt: -1 }).limit(10).lean();
    res.json({ status: 'success', count: tickets.length, data: tickets });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
