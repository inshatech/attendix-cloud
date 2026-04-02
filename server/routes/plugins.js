'use strict';
const express  = require('express');
const router   = express.Router();
const { Plugin, PLUGIN_NAMES } = require('../models/Plugin');
const {
  testPlugin, invalidateCache,
  sendSms, sendBulkSms, checkSmsBalance,
  sendWhatsApp, checkWhatsAppBalance,
} = require('../notify/engine');
const { requireAuth, requireRole } = require('../auth/middleware');
const { adminApiLimiter, strictAdminLimiter } = require('../auth/rateLimits');
const { uploadBase64, uploadRaw, deleteImage, deleteFile, publicIdFromUrl } = require('../services/uploadService');

router.use(requireAuth, requireRole('admin'), adminApiLimiter);

// Fields that must never be stored as empty string — keep existing value if blank/sentinel
const SENSITIVE = ['apiKey', 'pass', 'password', 'apikey'];
const SENTINEL  = '••••••••';

function redact(cfg = {}) {
  const o = { ...cfg };
  for (const k of SENSITIVE) {
    if (o[k] != null && String(o[k]).length > 0) o[k] = SENTINEL;
  }
  return o;
}

// ── LIST / GET ────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const plugins = await Plugin.find().sort({ name: 1 }).lean();
    res.json({ status: 'success', data: plugins.map(p => ({ ...p, config: redact(p.config) })) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:name', async (req, res) => {
  try {
    if (!PLUGIN_NAMES.includes(req.params.name)) return res.status(404).json({ error: 'Unknown plugin' });
    const p = await Plugin.findOne({ name: req.params.name }).lean();
    if (!p) return res.status(404).json({ error: 'Plugin not found' });
    res.json({ status: 'success', data: { ...p, config: redact(p.config) } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── TOGGLE ────────────────────────────────────────────────────────────────────
router.patch('/:name/toggle', async (req, res) => {
  try {
    if (!PLUGIN_NAMES.includes(req.params.name)) return res.status(404).json({ error: 'Unknown plugin' });
    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') return res.status(400).json({ error: '"enabled" must be boolean' });

    const p = await Plugin.findOne({ name: req.params.name });
    if (!p) return res.status(404).json({ error: 'Plugin not found' });

    // Validate config before enabling
    if (enabled) {
      const missing = getMissingFields(req.params.name, p.config || {});
      if (missing.length) {
        return res.status(400).json({
          error: `Cannot enable — missing required config: ${missing.join(', ')}. Save config first.`,
        });
      }
    }

    const update = {
      enabled,
      lastModifiedBy: req.authUser.userId,
      ...(enabled ? { enabledAt: new Date() } : { disabledAt: new Date() }),
    };
    const updated = await Plugin.findOneAndUpdate(
      { name: req.params.name }, { $set: update }, { new: true }
    );
    invalidateCache(req.params.name);
    res.json({
      status: 'success',
      message: `${req.params.name} ${enabled ? 'enabled' : 'disabled'}`,
      data: { ...updated.toObject(), config: redact(updated.config) },
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── SAVE CONFIG ───────────────────────────────────────────────────────────────
/**
 * PATCH /admin/plugins/:name/config
 *
 * Merge rules:
 *   - Incoming value = SENTINEL (••••••••)  → keep existing DB value (user didn't change it)
 *   - Incoming value = '' (empty string)    → keep existing DB value (don't overwrite with blank)
 *   - Incoming value is a real value        → overwrite
 *
 * This means the frontend can always send all fields; blank/sentinel = "unchanged".
 */
router.patch('/:name/config', async (req, res) => {
  try {
    if (!PLUGIN_NAMES.includes(req.params.name)) return res.status(404).json({ error: 'Unknown plugin' });
    const p = await Plugin.findOne({ name: req.params.name });
    if (!p) return res.status(404).json({ error: 'Plugin not found' });

    const current  = p.config || {};
    const incoming = req.body.config || req.body;  // support both { config: {...} } and flat body
    const merged   = { ...current };

    for (const [k, v] of Object.entries(incoming)) {
      if (k === 'config') continue;          // don't nest config inside config
      const str = String(v ?? '').trim();

      // Skip sentinel and empty values for sensitive fields — keep existing
      if (SENSITIVE.includes(k) && (str === SENTINEL || str === '')) continue;

      // Skip empty values for all fields — don't overwrite real values with blanks
      if (str === '' && current[k]) continue;

      // Coerce booleans that come as strings from form checkboxes
      if (typeof v === 'string' && (v === 'true' || v === 'false')) {
        merged[k] = v === 'true';
      } else if (typeof v === 'boolean') {
        merged[k] = v;
      } else if (k === 'port' && str !== '') {
        merged[k] = Number(str) || current[k] || 587;
      } else {
        merged[k] = str !== '' ? v : current[k];
      }
    }

    const updated = await Plugin.findOneAndUpdate(
      { name: req.params.name },
      { $set: { config: merged, lastModifiedBy: req.authUser.userId } },
      { new: true }
    );
    invalidateCache(req.params.name);

    res.json({
      status: 'success',
      message: 'Configuration saved',
      data: { ...updated.toObject(), config: redact(updated.config) },
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── TEST ──────────────────────────────────────────────────────────────────────
router.post('/:name/test', async (req, res) => {
  try {
    if (!PLUGIN_NAMES.includes(req.params.name)) return res.status(404).json({ error: 'Unknown plugin' });

    // Validate config before testing
    const p = await Plugin.findOne({ name: req.params.name }).lean();
    if (!p) return res.status(404).json({ error: 'Plugin not found' });

    const missing = getMissingFields(req.params.name, p.config || {});
    if (missing.length) {
      return res.status(400).json({
        error: `Plugin not fully configured. Missing: ${missing.join(', ')}`,
      });
    }

    const result = await testPlugin(req.params.name, {
      mobile: req.body.mobile,
      email:  req.body.email,
    });
    res.json({ status: 'success', result });
  } catch (e) {
    await Plugin.updateOne(
      { name: req.params.name },
      { $set: { lastTestedAt: new Date(), lastTestResult: e.message } }
    ).catch(() => {});
    invalidateCache(req.params.name);
    res.status(400).json({ error: e.message });
  }
});

// ── CLOUDINARY UPLOADS ────────────────────────────────────────────────────────

// POST /admin/plugins/about_us/upload-logo
// Uploads logo image to Cloudinary, deletes old one, saves URL to plugin config
router.post('/about_us/upload-logo', strictAdminLimiter, async (req, res) => {
  try {
    const { image, oldUrl } = req.body;
    if (!image) return res.status(400).json({ error: 'image (base64 data-URI) required' });

    if (oldUrl) {
      const oldId = publicIdFromUrl(oldUrl);
      if (oldId) await deleteImage(oldId);
    }

    const result = await uploadBase64(image, 'logo', 'about_logo');

    await Plugin.findOneAndUpdate(
      { name: 'about_us' },
      { $set: { 'config.logoUrl': result.url, lastModifiedBy: req.authUser.userId } }
    );
    invalidateCache('about_us');

    res.json({ status: 'success', url: result.url, publicId: result.publicId });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// DELETE /admin/plugins/about_us/logo
// Removes logo from Cloudinary and clears logoUrl in config
router.delete('/about_us/logo', async (req, res) => {
  try {
    const p = await Plugin.findOne({ name: 'about_us' }).lean()
    const url = p?.config?.logoUrl
    if (url) {
      const publicId = publicIdFromUrl(url)
      if (publicId) await deleteImage(publicId)
    }
    await Plugin.findOneAndUpdate(
      { name: 'about_us' },
      { $set: { 'config.logoUrl': '', lastModifiedBy: req.authUser.userId } }
    )
    invalidateCache('about_us')
    res.json({ status: 'success' })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// POST /admin/plugins/bridge_app/upload-file
// Uploads .exe / installer to Cloudinary raw, deletes old one, saves URL + file size to plugin config
router.post('/bridge_app/upload-file', strictAdminLimiter, async (req, res) => {
  try {
    const { file, filename, oldUrl } = req.body;
    if (!file) return res.status(400).json({ error: 'file (base64 data-URI) required' });

    if (oldUrl) {
      const oldId = publicIdFromUrl(oldUrl);
      if (oldId) await deleteFile(oldId);
    }

    const identifier = (filename || 'bridge-setup').replace(/[^a-zA-Z0-9._-]/g, '_');
    const result = await uploadRaw(file, identifier);

    const fileSizeMb = result.bytes ? `${(result.bytes / 1048576).toFixed(1)} MB` : undefined;
    const update = { 'config.downloadUrl': result.url, lastModifiedBy: req.authUser.userId };
    if (fileSizeMb) update['config.fileSizeMb'] = fileSizeMb;

    await Plugin.findOneAndUpdate({ name: 'bridge_app' }, { $set: update });
    invalidateCache('bridge_app');

    res.json({ status: 'success', url: result.url, publicId: result.publicId, bytes: result.bytes, fileSizeMb });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ── BALANCES ──────────────────────────────────────────────────────────────────
router.get('/sms/balance',      async (req, res) => { try { res.json({ status:'success', data: await checkSmsBalance() }); }      catch(e){ res.status(400).json({ error: e.message }); } });
router.get('/whatsapp/balance', async (req, res) => { try { res.json({ status:'success', data: await checkWhatsAppBalance() }); } catch(e){ res.status(400).json({ error: e.message }); } });

// ── SEND TOOLS ────────────────────────────────────────────────────────────────
router.post('/sms/send', strictAdminLimiter, async (req, res) => {
  try {
    const { mobile, message, sender, route, templateId } = req.body;
    if (!mobile || !message) return res.status(400).json({ error: 'mobile and message required' });
    res.json({ status: 'success', result: await sendSms(mobile, message, { sender, route, templateId }) });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/sms/bulk', strictAdminLimiter, async (req, res) => {
  try {
    const { numbers, message, sender, route, templateId } = req.body;
    if (!Array.isArray(numbers) || !numbers.length || !message)
      return res.status(400).json({ error: 'numbers[] and message required' });
    if (numbers.length > 500) return res.status(400).json({ error: 'Max 500 numbers per request' });
    res.json({ status: 'success', count: numbers.length, result: await sendBulkSms(numbers, message, { sender, route, templateId }) });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/whatsapp/send', strictAdminLimiter, async (req, res) => {
  try {
    const { mobile, user, message } = req.body;
    if (!mobile || !message) return res.status(400).json({ error: 'mobile and message required' });
    res.json({ status: 'success', result: await sendWhatsApp(mobile, user || 'User', message) });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ── CONFIG VALIDATOR ──────────────────────────────────────────────────────────
function getMissingFields(name, cfg) {
  const missing = [];
  switch (name) {
    case 'sms':
      if (!cfg.username)  missing.push('username');
      if (!cfg.apiKey)    missing.push('apiKey');
      if (!cfg.sender)    missing.push('sender');
      break;
    case 'whatsapp':
      if (!cfg.phoneNumberId) missing.push('phoneNumberId');
      if (!cfg.apiKey)        missing.push('apiKey (Bearer token)');
      if (!cfg.templateId)    missing.push('templateId');
      break;
    case 'smtp':
      // Gmail shortcut only needs user + pass
      if (cfg.service === 'gmail') {
        if (!cfg.user) missing.push('user (Gmail address)');
        if (!cfg.pass) missing.push('pass (App Password)');
      } else {
        if (!cfg.host) missing.push('host');
        if (!cfg.user) missing.push('user');
        if (!cfg.pass) missing.push('pass');
      }
      break;
    case 'totp_2fa':
      // No credentials required — just config options
      break;
    case 'google_auth':
      if (!cfg.clientId)     missing.push('clientId');
      if (!cfg.clientSecret) missing.push('clientSecret');
      break;
    case 'bridge_app':
      if (!cfg.downloadUrl) missing.push('downloadUrl');
      if (!cfg.wsUrl)       missing.push('wsUrl (WebSocket Server URL)');
      if (!cfg.apiUrl)      missing.push('apiUrl (Server API URL)');
      if (!cfg.wsSecret)    missing.push('wsSecret (WebSocket Secret)');
      break;
    case 'tawk':
      if (!cfg.propertyId) missing.push('propertyId');
      if (!cfg.widgetId)   missing.push('widgetId');
      break;
  }
  return missing;
}

module.exports = router;
