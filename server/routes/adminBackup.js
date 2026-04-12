'use strict';
const express   = require('express');
const router    = express.Router();
const mongoose  = require('mongoose');
const zlib      = require('zlib');
const fs        = require('fs');
const path      = require('path');
const { v4: uuidv4 } = require('uuid');
const { EJSON }      = require('bson');

const { requireAuth, requireRole } = require('../auth/middleware');
const { adminApiLimiter, strictAdminLimiter } = require('../auth/rateLimits');
const BackupLog      = require('../models/BackupLog');
const BackupSettings = require('../models/BackupSettings');

// All routes require admin auth
router.use(requireAuth, requireRole('admin'), adminApiLimiter);

// ── Backup storage directory ───────────────────────────────────────────────────
const BACKUP_DIR = path.join(__dirname, '..', 'backups');
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

// Collections to skip on restore (system/auth critical — admin must re-seed manually)
const SKIP_ON_RESTORE = ['sessions'];

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtBytes(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}

function nowTag() {
  const d = new Date();
  return d.toISOString().replace('T', '_').replace(/:/g, '-').slice(0, 19);
}

/** Dump all MongoDB collections into a single gzipped JSON buffer. */
async function createBackupBuffer() {
  const db = mongoose.connection.db;
  const colInfos = await db.listCollections().toArray();
  const payload = {
    version:     '1.0',
    createdAt:   new Date().toISOString(),
    dbName:      db.databaseName,
    collections: {},
    meta:        { totalDocuments: 0, collectionCount: colInfos.length },
  };

  let totalDocs = 0;
  for (const info of colInfos) {
    const name = info.name;
    const docs = await db.collection(name).find({}).toArray();
    payload.collections[name] = docs;
    totalDocs += docs.length;
  }
  payload.meta.totalDocuments = totalDocs;

  const json   = EJSON.stringify(payload, { relaxed: false });
  const gzipped = await new Promise((resolve, reject) => {
    zlib.gzip(Buffer.from(json, 'utf8'), { level: 6 }, (err, buf) => {
      if (err) reject(err); else resolve(buf);
    });
  });
  return { buffer: gzipped, collectionCount: colInfos.length, totalDocs };
}

/** Send backup file as email attachment using existing SMTP engine. */
async function emailBackup(recipients, filename, buffer, logId) {
  const { sendEmailWithAttachment } = require('../notify/engine');
  const { getBrand } = require('../notify/engine');
  const brand = await getBrand();
  const sizeTxt = fmtBytes(buffer.length);
  const subject = `[${brand.appName}] Database Backup — ${new Date().toLocaleDateString('en-IN')}`;
  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#ffffff;color:#1a1a2e;padding:28px 24px;border-radius:12px;border:1px solid #dde0f0">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px">
        <span style="font-size:22px">🗄️</span>
        <strong style="font-size:1.15rem;color:#1a1a2e">${brand.appName}</strong>
      </div>
      <h2 style="margin:0 0 8px;font-size:1rem;color:#58a6ff">Database Backup Ready</h2>
      <p style="color:#4a4a80;font-size:0.875rem;line-height:1.6;margin:0 0 16px">
        Your database backup has been generated and is attached to this email.
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:0.8125rem;margin-bottom:20px">
        <tr><td style="padding:6px 0;color:#5050a0;width:120px">Filename</td><td style="color:#1a1a2e;font-family:monospace">${filename}</td></tr>
        <tr><td style="padding:6px 0;color:#5050a0">Size</td><td style="color:#1a1a2e;font-family:monospace">${sizeTxt}</td></tr>
        <tr><td style="padding:6px 0;color:#5050a0">Generated</td><td style="color:#1a1a2e">${new Date().toLocaleString('en-IN')}</td></tr>
      </table>
      <p style="color:#9090b0;font-size:0.75rem;margin:0">
        This is an automated backup from ${brand.appName}. Store this file securely.
      </p>
    </div>`;

  const errors = [];
  const sent = [];
  for (const email of recipients) {
    try {
      await sendEmailWithAttachment(email, subject, html, `${brand.appName} Database Backup — ${new Date().toDateString()}`, [
        { filename, content: buffer, contentType: 'application/gzip' },
      ]);
      sent.push(email);
    } catch (e) {
      errors.push(`${email}: ${e.message}`);
    }
  }
  return { sent, errors };
}

/** Prune old backup files — keep only the last N. */
async function pruneBackups(keepLast) {
  try {
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith('.json.gz'))
      .map(f => ({ name: f, mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtime }))
      .sort((a, b) => b.mtime - a.mtime);
    for (const f of files.slice(keepLast)) {
      fs.unlinkSync(path.join(BACKUP_DIR, f.name));
    }
  } catch { /* non-critical */ }
}

// ── GET /admin/backup/settings ─────────────────────────────────────────────────
router.get('/backup/settings', async (req, res) => {
  try {
    const s = await BackupSettings.findById('singleton').lean();
    res.json({ status: 'success', data: s || {} });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── PATCH /admin/backup/settings ──────────────────────────────────────────────
router.patch('/backup/settings', async (req, res) => {
  try {
    const allowed = ['scheduleEnabled','frequency','sendTime','timezone','recipients','keepLast','weekday','monthDay'];
    const update = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) update[k] = req.body[k];
    }
    const s = await BackupSettings.findByIdAndUpdate(
      'singleton',
      { $set: update },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json({ status: 'success', data: s });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST /admin/backup/create ──────────────────────────────────────────────────
// Body: { email: true|false }  — if email=true, also sends to configured recipients
router.post('/backup/create', strictAdminLimiter, async (req, res) => {
  const logId = `bkp-${uuidv4().split('-')[0]}`;
  const sendEmail = req.body?.email === true;
  try {
    const settings = await BackupSettings.findById('singleton').lean() || {};
    const { buffer, collectionCount, totalDocs } = await createBackupBuffer();
    const filename  = `backup_${nowTag()}.json.gz`;
    const filepath  = path.join(BACKUP_DIR, filename);
    fs.writeFileSync(filepath, buffer);

    // Prune old backups
    await pruneBackups(settings.keepLast || 7);

    // Update settings with last backup info
    await BackupSettings.findByIdAndUpdate('singleton', {
      $set: { lastBackupAt: new Date(), lastBackupFile: filename },
    }, { upsert: true });

    // Log create
    await BackupLog.create({
      logId, type: 'manual', action: 'create', status: 'success',
      filename, sizeBytes: buffer.length, collections: collectionCount,
      documents: totalDocs, createdBy: req.authUser.userId,
    });

    // Optionally email
    let emailResult = null;
    if (sendEmail && settings.recipients?.length) {
      const emailLogId = `bkp-${uuidv4().split('-')[0]}`;
      try {
        emailResult = await emailBackup(settings.recipients, filename, buffer, emailLogId);
        await BackupSettings.findByIdAndUpdate('singleton', { $set: { lastEmailAt: new Date() } }, { upsert: true });
        await BackupLog.create({
          logId: emailLogId, type: 'manual', action: 'email', status: emailResult.errors.length ? 'failed' : 'success',
          filename, sizeBytes: buffer.length, emailedTo: emailResult.sent,
          error: emailResult.errors.join('; ') || null, createdBy: req.authUser.userId,
        });
      } catch (e) {
        emailResult = { sent: [], errors: [e.message] };
      }
    }

    // Return file as download
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Backup-Filename', filename);
    res.setHeader('X-Backup-Size', buffer.length);
    res.send(buffer);

  } catch (e) {
    await BackupLog.create({
      logId, type: 'manual', action: 'create', status: 'failed',
      error: e.message, createdBy: req.authUser?.userId || 'admin',
    }).catch(() => {});
    res.status(500).json({ error: e.message });
  }
});

// ── POST /admin/backup/email ───────────────────────────────────────────────────
// Emails the latest backup on disk to configured recipients
router.post('/backup/email', strictAdminLimiter, async (req, res) => {
  const logId = `bkp-${uuidv4().split('-')[0]}`;
  try {
    const settings = await BackupSettings.findById('singleton').lean() || {};
    if (!settings.recipients?.length) return res.status(400).json({ error: 'No recipients configured in backup settings' });

    // Use latest file if available, otherwise create a fresh backup
    let buffer, filename;
    if (settings.lastBackupFile) {
      const fp = path.join(BACKUP_DIR, settings.lastBackupFile);
      if (fs.existsSync(fp)) {
        buffer   = fs.readFileSync(fp);
        filename = settings.lastBackupFile;
      }
    }
    if (!buffer) {
      const result = await createBackupBuffer();
      buffer   = result.buffer;
      filename = `backup_${nowTag()}.json.gz`;
      fs.writeFileSync(path.join(BACKUP_DIR, filename), buffer);
      await BackupSettings.findByIdAndUpdate('singleton', { $set: { lastBackupAt: new Date(), lastBackupFile: filename } }, { upsert: true });
    }

    const emailResult = await emailBackup(settings.recipients, filename, buffer, logId);
    await BackupSettings.findByIdAndUpdate('singleton', { $set: { lastEmailAt: new Date() } }, { upsert: true });

    await BackupLog.create({
      logId, type: 'manual', action: 'email',
      status: emailResult.errors.length && !emailResult.sent.length ? 'failed' : 'success',
      filename, sizeBytes: buffer.length, emailedTo: emailResult.sent,
      error: emailResult.errors.join('; ') || null, createdBy: req.authUser.userId,
    });

    res.json({ status: 'success', sent: emailResult.sent, errors: emailResult.errors });
  } catch (e) {
    await BackupLog.create({ logId, type: 'manual', action: 'email', status: 'failed', error: e.message, createdBy: req.authUser?.userId || 'admin' }).catch(() => {});
    res.status(500).json({ error: e.message });
  }
});

// ── GET /admin/backup/download/:filename ──────────────────────────────────────
router.get('/backup/download/:filename', async (req, res) => {
  try {
    const filename = path.basename(req.params.filename); // sanitize
    if (!filename.endsWith('.json.gz')) return res.status(400).json({ error: 'Invalid filename' });
    const filepath = path.join(BACKUP_DIR, filename);
    if (!fs.existsSync(filepath)) return res.status(404).json({ error: 'Backup file not found' });
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    fs.createReadStream(filepath).pipe(res);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /admin/backup/files ────────────────────────────────────────────────────
router.get('/backup/files', async (req, res) => {
  try {
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith('.json.gz'))
      .map(f => {
        const stat = fs.statSync(path.join(BACKUP_DIR, f));
        return { filename: f, sizeBytes: stat.size, size: fmtBytes(stat.size), createdAt: stat.mtime };
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ status: 'success', data: files });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST /admin/backup/restore ─────────────────────────────────────────────────
// Accepts raw gzip binary (Content-Type: application/octet-stream)
// filename passed as query param: ?filename=backup_xxx.json.gz
router.post('/backup/restore', strictAdminLimiter,
  require('express').raw({ type: 'application/octet-stream', limit: '500mb' }),
  async (req, res) => {
  const logId = `bkp-${uuidv4().split('-')[0]}`;
  try {
    const fname = req.query.filename || 'uploaded';
    const compressed = req.body;  // Buffer (raw binary)
    if (!compressed || !compressed.length) return res.status(400).json({ error: 'No backup data provided' });
    const raw = await new Promise((resolve, reject) => {
      zlib.gunzip(compressed, (err, buf) => { if (err) reject(new Error('Invalid backup file: ' + err.message)); else resolve(buf); });
    });

    let payload;
    try { payload = EJSON.parse(raw.toString('utf8')); }
    catch { return res.status(400).json({ error: 'Backup file is corrupted or not valid JSON' }); }

    if (!payload?.collections || typeof payload.collections !== 'object')
      return res.status(400).json({ error: 'Invalid backup format: missing collections' });

    const db = mongoose.connection.db;
    let restored = 0, skipped = 0;

    for (const [colName, docs] of Object.entries(payload.collections)) {
      if (SKIP_ON_RESTORE.includes(colName)) { skipped++; continue; }
      if (!Array.isArray(docs)) continue;
      const col = db.collection(colName);
      await col.deleteMany({});
      if (docs.length > 0) {
        await col.insertMany(docs, { ordered: false }).catch(() => {});
      }
      restored++;
    }

    await BackupLog.create({
      logId, type: 'manual', action: 'restore', status: 'success',
      filename: fname || 'uploaded', sizeBytes: compressed.length,
      collections: restored, documents: payload.meta?.totalDocuments || 0,
      createdBy: req.authUser.userId,
    });

    res.json({ status: 'success', restoredCollections: restored, skipped, dbName: payload.dbName, backedUpAt: payload.createdAt });
  } catch (e) {
    await BackupLog.create({ logId, type: 'manual', action: 'restore', status: 'failed', error: e.message, createdBy: req.authUser?.userId || 'admin' }).catch(() => {});
    res.status(500).json({ error: e.message });
  }
});

// ── GET /admin/backup/logs ─────────────────────────────────────────────────────
router.get('/backup/logs', async (req, res) => {
  try {
    const { page = 1, limit = 25, action } = req.query;
    const filter = action ? { action } : {};
    const [logs, total] = await Promise.all([
      BackupLog.find(filter).sort({ createdAt: -1 }).skip((+page - 1) * +limit).limit(+limit).lean(),
      BackupLog.countDocuments(filter),
    ]);
    res.json({ status: 'success', data: logs, total, page: +page, pages: Math.ceil(total / +limit) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── DELETE /admin/backup/logs ──────────────────────────────────────────────────
router.delete('/backup/logs', strictAdminLimiter, async (req, res) => {
  try {
    const { before } = req.query; // optional ISO date string
    const filter = before ? { createdAt: { $lt: new Date(before) } } : {};
    const { deletedCount } = await BackupLog.deleteMany(filter);
    res.json({ status: 'success', deletedCount });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── In-process lock — prevents re-entrant concurrent runs in same process ──────
let _scheduledLock = false;

// ── Scheduled backup runner (called from app.js cron) ─────────────────────────
async function runScheduledBackup() {
  if (_scheduledLock) return; // already running in this process
  _scheduledLock = true;
  try {
    const settings = await BackupSettings.findById('singleton').lean();
    if (!settings?.scheduleEnabled) return;

    const now  = new Date();
    const tz   = settings.timezone || 'Asia/Kolkata';
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: tz, year:'numeric', month:'2-digit', day:'2-digit',
        hour:'2-digit', minute:'2-digit', weekday:'short', hour12: false,
      }).formatToParts(now).map(p => [p.type, p.value])
    );
    const currentTime = `${parts.hour}:${parts.minute}`;
    const currentDate = `${parts.year}-${parts.month}-${parts.day}`;
    const currentDay  = now.getDay(); // 0=Sun
    const currentMDay = parseInt(parts.day, 10);

    if (currentTime !== (settings.sendTime || '02:00')) return;

    // Frequency check
    if (settings.frequency === 'weekly'  && currentDay !== (settings.weekday ?? 0)) return;
    if (settings.frequency === 'monthly' && currentMDay !== (settings.monthDay ?? 1)) return;

    // Atomic lock — only the first caller (across any parallel processes/intervals) wins.
    // findOneAndUpdate returns null if the filter doesn't match, meaning another instance
    // already claimed the lock for today.
    const locked = await BackupSettings.findOneAndUpdate(
      { _id: 'singleton', lastScheduledDate: { $ne: currentDate } },
      { $set: { lastScheduledDate: currentDate } }
    );
    if (!locked) return; // another instance already ran today

    const logId = `bkp-${uuidv4().split('-')[0]}`;
    const { buffer, collectionCount, totalDocs } = await createBackupBuffer();
    const filename = `backup_${nowTag()}.json.gz`;
    fs.writeFileSync(path.join(BACKUP_DIR, filename), buffer);
    await pruneBackups(settings.keepLast || 7);
    await BackupSettings.findByIdAndUpdate('singleton', { $set: { lastBackupAt: now, lastBackupFile: filename } }, { upsert: true });

    await BackupLog.create({
      logId, type: 'scheduled', action: 'create', status: 'success',
      filename, sizeBytes: buffer.length, collections: collectionCount,
      documents: totalDocs, createdBy: 'system',
    });

    console.log(`[backup-cron] Created: ${filename} (${fmtBytes(buffer.length)})`);

    // Email — deduplicate recipients to avoid sending twice to same address
    if (settings.recipients?.length) {
      const uniqueRecipients = [...new Set(settings.recipients.map(r => r.trim().toLowerCase()))];
      const emailLogId = `bkp-${uuidv4().split('-')[0]}`;
      try {
        const emailResult = await emailBackup(uniqueRecipients, filename, buffer, emailLogId);
        await BackupSettings.findByIdAndUpdate('singleton', { $set: { lastEmailAt: now } }, { upsert: true });
        await BackupLog.create({
          logId: emailLogId, type: 'scheduled', action: 'email',
          status: emailResult.errors.length && !emailResult.sent.length ? 'failed' : 'success',
          filename, sizeBytes: buffer.length, emailedTo: emailResult.sent,
          error: emailResult.errors.join('; ') || null, createdBy: 'system',
        });
        console.log(`[backup-cron] Emailed to: ${emailResult.sent.join(', ')}`);
      } catch (e) {
        console.error('[backup-cron] Email failed:', e.message);
        await BackupLog.create({ logId: emailLogId, type: 'scheduled', action: 'email', status: 'failed', error: e.message, createdBy: 'system' }).catch(() => {});
      }
    }
  } catch (e) {
    console.error('[backup-cron] error:', e.message);
  } finally {
    _scheduledLock = false;
  }
}

module.exports = router;
module.exports.runScheduledBackup = runScheduledBackup;
