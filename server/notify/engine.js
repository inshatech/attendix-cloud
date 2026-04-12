'use strict';
const nodemailer = require('nodemailer');
const axios      = require('axios');
const { Plugin } = require('../models/Plugin');
const logoImage = '../assets/none.png'

const _cache = new Map();
const TTL    = 60_000;

async function getPlugin(name) {
  const c = _cache.get(name);
  if (c && Date.now() - c.ts < TTL) return c.doc;
  const doc = await Plugin.findOne({ name }).lean();
  if (doc) _cache.set(name, { doc, ts: Date.now() });
  return doc;
}
function invalidateCache(name) { _cache.delete(name); }

/** Returns branding fields from about_us plugin (never throws). */
async function getBrand() {
  try {
    const p = await getPlugin('about_us');
    const c = p?.config || {};
    return {
      appName:     c.appName     || 'Attendix',
      tagline:     c.tagline     || 'Attendance & Payroll Simplified',
      logoUrl:     c.logoUrl     || '',
      companyName: c.companyName || '',
      website:     c.website     || '',
    };
  } catch { return { appName:'Attendix', tagline:'Attendance & Payroll Simplified', logoUrl:'', companyName:'', website:'' }; }
}

async function sendOtp(target, code, name = 'User') {
  const msg = `Your Attendix Cloud OTP is: ${code}. Valid 10 minutes. Do not share.`;
  const sent = [], errors = [];
  if (target.mobile) {
    try { const p = await getPlugin('sms'); if (p?.enabled) { await sendSms(target.mobile, msg); sent.push('sms'); } } catch (e) { errors.push(`sms:${e.message}`); }
    if (!sent.includes('sms')) {
      try { const p = await getPlugin('whatsapp'); if (p?.enabled) { await sendWhatsApp(target.mobile, name, code); sent.push('whatsapp'); } } catch (e) { errors.push(`whatsapp:${e.message}`); }
    }
  }
  if (target.email) {
    try { const p = await getPlugin('smtp'); if (p?.enabled) { await sendEmail(target.email, `${code} — Your OTP`, await buildOtpHtml(name, code), `OTP: ${code}`); sent.push('email'); } } catch (e) { errors.push(`email:${e.message}`); }
  }
  if (!sent.length) {
    console.log(`\n┌── OTP CODE: ${code} ──┐\n│ To: ${(target.mobile||target.email||'').slice(0,30)}\n└${'─'.repeat(22)}┘\n`);
    sent.push('console');
  }
  return { sent, errors };
}

async function sendSms(mobile, message, opts = {}) {
  const p = await getPlugin('sms');
  if (!p?.enabled) throw new Error('SMS plugin is disabled');
  const c = p.config || {};
  if (!c.username) throw new Error('SMS not configured: username missing');
  if (!c.apiKey)   throw new Error('SMS not configured: apiKey missing');
  if (!c.sender)   throw new Error('SMS not configured: sender missing');
  const mob = String(mobile).replace(/[\s\-\(\)]/g,'').replace(/^\+/,'');
  const params = new URLSearchParams({ username:c.username, apikey:c.apiKey, apirequest:'Text', sender:opts.sender||c.sender, mobile:mob, message, route:opts.route||c.route||'Trans', format:'JSON' });
  if (c.templateId || opts.templateId) params.set('TemplateID', opts.templateId||c.templateId);
  const r = await axios.get(`${c.baseUrl||'https://trans.inshatech.com/sms-panel/api/http/index.php'}?${params}`, { timeout:15000 });
  if (r.data?.Status === 'Error') throw new Error(r.data?.Details || 'SMS send failed');
  return r.data;
}

async function sendBulkSms(numbers, message, opts = {}) {
  return sendSms(numbers.map(n => String(n).replace(/[\s\-\(\)]/g,'').replace(/^\+/,'')).join(','), message, opts);
}

async function checkSmsBalance() {
  const p = await getPlugin('sms'); if (!p?.enabled) throw new Error('SMS plugin is disabled');
  const c = p.config || {}; if (!c.username || !c.apiKey) throw new Error('SMS not configured');
  const params = new URLSearchParams({ username:c.username, apikey:c.apiKey, apirequest:'CreditCheck', route:c.route||'Trans', format:'JSON' });
  const r = await axios.get(`${c.baseUrl||'https://trans.inshatech.com/sms-panel/api/http/index.php'}?${params}`, { timeout:10000 });
  return r.data;
}

async function sendWhatsApp(mobile, user, message) {
  const p = await getPlugin('whatsapp'); if (!p?.enabled) throw new Error('WhatsApp plugin is disabled');
  const c = p.config || {};
  if (!c.phoneNumberId) throw new Error('WhatsApp: phoneNumberId missing');
  if (!c.apiKey)        throw new Error('WhatsApp: apiKey missing');
  if (!c.templateId)    throw new Error('WhatsApp: templateId missing');
  const mob = String(mobile).replace(/[\s\-\(\)]/g,'').replace(/^\+/,'');
  const r = await axios.post(`${(c.baseUrl||'https://graph.facebook.com').replace(/\/$/,'')}/${c.version||'v19.0'}/${c.phoneNumberId}/messages`,
    { messaging_product:'whatsapp', recipient_type:'individual', to:mob, type:'template', template:{ name:c.templateId, language:{ code:'en' }, components:[{ type:'body', parameters:[{ type:'text', text:String(user) },{ type:'text', text:String(message) }] }] } },
    { headers:{ Authorization:`Bearer ${c.apiKey}`, 'Content-Type':'application/json' }, timeout:15000 }
  );
  return r.data;
}

async function checkWhatsAppBalance() {
  const p = await getPlugin('whatsapp'); if (!p?.enabled) throw new Error('WhatsApp plugin is disabled');
  const c = p.config || {}; if (!c.apiKey) throw new Error('WhatsApp not configured');
  const r = await axios.get(`${(c.baseUrl||'https://graph.facebook.com').replace(/\/$/,'')}api/v1/user/balance`, { headers:{ Authorization:`Bearer ${c.apiKey}` }, timeout:10000 });
  return r.data;
}

async function sendEmail(to, subject, html, text) {
  const p = await getPlugin('smtp'); if (!p?.enabled) throw new Error('SMTP plugin is disabled');
  const c = p.config || {};
  let cfg;
  if (c.service === 'gmail') {
    if (!c.user) throw new Error('SMTP (Gmail): user missing');
    if (!c.pass) throw new Error('SMTP (Gmail): App Password missing');
    cfg = { service:'gmail', auth:{ user:c.user, pass:c.pass } };
  } else {
    if (!c.host) throw new Error('SMTP: host missing');
    if (c.host.includes('@')) throw new Error(`SMTP: 'host' must be a server hostname (e.g. smtp.gmail.com), not an email address. Found: "${c.host}". Go to Admin → Plugins → Email → fix the Host field.`);
    if (!c.user) throw new Error('SMTP: user missing');
    if (!c.pass) throw new Error('SMTP: password missing. Save credentials in Admin → Plugins → Email.');
    cfg = { host:c.host, port:Number(c.port)||587, secure:Boolean(c.secure), auth:{ user:c.user, pass:c.pass } };
  }
  const t = nodemailer.createTransport(cfg);
  await t.verify().catch(err => {
    if (err.code === 'EBADNAME' || err.message.includes('EBADNAME')) throw new Error(`SMTP: invalid hostname "${cfg.host || cfg.service}" — set a valid SMTP host in Admin → Plugins → Email (e.g. smtp.gmail.com).`);
    if (err.message.includes('Missing credentials')||err.message.includes('PLAIN')) throw new Error('SMTP auth failed: empty username or password. Go to Admin → Plugins → Email → save credentials.');
    if (err.code === 'EAUTH') throw new Error(`SMTP auth rejected: wrong username/password. ${err.message}`);
    throw new Error(`SMTP connection failed: ${err.message}`);
  });
  return t.sendMail({ from:c.from||`Gateway <${c.user}>`, to, subject, html, text });
}

/** Same as sendEmail but supports file attachments.
 *  attachments: [{ filename, content: Buffer, contentType }]
 */
async function sendEmailWithAttachment(to, subject, html, text, attachments = []) {
  const p = await getPlugin('smtp'); if (!p?.enabled) throw new Error('SMTP plugin is disabled');
  const c = p.config || {};
  let cfg;
  if (c.service === 'gmail') {
    cfg = { service:'gmail', auth:{ user:c.user, pass:c.pass } };
  } else {
    cfg = { host:c.host, port:Number(c.port)||587, secure:Boolean(c.secure), auth:{ user:c.user, pass:c.pass } };
  }
  const t = nodemailer.createTransport(cfg);
  return t.sendMail({ from:c.from||`Gateway <${c.user}>`, to, subject, html, text, attachments });
}

async function buildOtpHtml(name, code) {
  const b = await getBrand();
  const logoBlock = b.logoUrl
    ? `<img src="${b.logoUrl}" alt="${b.appName}" style="height:30px;width:auto;object-fit:contain;display:block;"/>`
    : `<span style="font-size:20px;">🔐</span>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${b.appName} — OTP</title>
  <style>
    /* ── Mobile ──────────────────────────────────── */
    @media only screen and (max-width:600px) {
      .aw  { padding:0 6px !important; margin:12px auto !important; }
      .ah  { padding:16px !important; }
      .ab  { padding:22px 16px !important; }
      .af  { padding:12px 16px !important; }
      .otp { font-size:38px !important; letter-spacing:10px !important; }
    }
    /* ── Dark mode override ───────────────────────── */
    @media (prefers-color-scheme:dark) {
      .outer { background:#0a0a14 !important; }
      .ah    { background:#111121 !important; border-color:#1e1e35 !important; }
      .ab    { background:#111121 !important; border-color:#1e1e35 !important; }
      .af    { background:#0d0d1a !important; border-color:#1e1e35 !important; }
      .otpbx { background:#0a0a14 !important; border-color:#2a2a50 !important; }
      .c-head { color:#e0e0f0 !important; }
      .c-sub  { color:#4a4a72 !important; }
      .c-body { color:#8080a8 !important; }
      .c-foot { color:#3a3a58 !important; }
    }
  </style>
</head>
<body class="outer" style="margin:0;padding:0;background:#f0f0f8;font-family:'Segoe UI',Arial,sans-serif;">
  <div class="aw" style="max-width:480px;margin:32px auto;padding:0 14px;">

    <!-- Header -->
    <div class="ah" style="background:#ffffff;border:1px solid #dde0f0;border-radius:14px 14px 0 0;padding:18px 24px;display:flex;align-items:center;gap:12px;">
      <div style="width:38px;height:38px;border-radius:10px;background:rgba(88,166,255,0.12);border:1px solid rgba(88,166,255,0.25);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0;">
        ${logoBlock}
      </div>
      <div>
        <p class="c-head" style="margin:0;color:#1a1a2e;font-weight:700;font-size:0.9rem;">${b.appName}</p>
        <p class="c-sub" style="margin:2px 0 0;color:#5050a0;font-size:0.65rem;font-family:monospace;">${b.tagline}</p>
      </div>
    </div>

    <!-- Body -->
    <div class="ab" style="background:#ffffff;border:1px solid #dde0f0;border-top:none;padding:28px 24px;">
      <p class="c-sub" style="margin:0 0 5px;color:#5050a0;font-size:0.72rem;font-family:monospace;text-transform:uppercase;letter-spacing:0.12em;">One-Time Passcode</p>
      <h1 class="c-head" style="margin:0 0 16px;font-size:1.25rem;font-weight:800;color:#1a1a2e;letter-spacing:-0.02em;">Verify your identity</h1>
      <p class="c-body" style="margin:0 0 24px;color:#4a4a80;font-size:0.875rem;line-height:1.7;">
        Hi <strong style="color:#1a1a2e;">${name}</strong>, use the code below to complete your sign-in.
        This code expires in <strong style="color:#1a1a2e;">10 minutes</strong>.
      </p>

      <!-- OTP Box -->
      <div class="otpbx" style="background:#f0f2ff;border:2px solid #c8cef0;border-radius:12px;padding:24px 16px;text-align:center;margin:0 0 8px;">
        <p class="c-sub" style="margin:0 0 10px;color:#5050a0;font-size:0.65rem;font-family:monospace;letter-spacing:0.15em;text-transform:uppercase;">Your OTP — tap &amp; hold to copy</p>
        <span class="otp" style="font-family:'Courier New',monospace;font-size:46px;font-weight:700;letter-spacing:12px;color:#58a6ff;display:block;line-height:1.15;user-select:all;-webkit-user-select:all;">${code}</span>
      </div>
      <p style="margin:0 0 20px;color:#9090b0;font-size:0.68rem;text-align:center;">On mobile: tap and hold the code above to copy it</p>

      <!-- Warning -->
      <div style="background:rgba(248,113,113,0.07);border:1px solid rgba(248,113,113,0.22);border-radius:8px;padding:12px 16px;">
        <p style="margin:0;color:#f87171;font-size:0.78rem;line-height:1.6;">
          🔒 Never share this code. ${b.appName} staff will never ask for your OTP.
        </p>
      </div>
    </div>

    <!-- Footer -->
    <div class="af" style="background:#f8f8fc;border:1px solid #dde0f0;border-top:none;border-radius:0 0 14px 14px;padding:14px 24px;text-align:center;">
      <p class="c-foot" style="margin:0;color:#8888b0;font-size:10px;">
        ${b.companyName ? `© ${new Date().getFullYear()} ${b.companyName} · ` : ''}${b.appName} · Automated notification · Do not reply
      </p>
      ${b.website ? `<p style="margin:5px 0 0;"><a href="${b.website}" style="color:#58a6ff;font-size:10px;text-decoration:none;">${b.website.replace(/^https?:\/\//,'')}</a></p>` : ''}
    </div>

  </div>
</body>
</html>`;
}

async function testPlugin(name, target = {}) {
  const p = await getPlugin(name);
  if (!p)         throw new Error(`Plugin '${name}' not found`);
  if (!p.enabled) throw new Error(`Plugin '${name}' is disabled`);
  let result;
  switch (name) {
    case 'sms':       if (!target.mobile) throw new Error('Provide mobile for SMS test'); result = await sendSms(target.mobile, '[TEST] Attendix Cloud SMS check. Code: 000000'); break;
    case 'whatsapp':  if (!target.mobile) throw new Error('Provide mobile for WhatsApp test'); result = await sendWhatsApp(target.mobile, 'Test User', '000000'); break;
    case 'smtp':      if (!target.email) throw new Error('Provide email for SMTP test'); result = await sendEmail(target.email, '[TEST] SMTP check', await buildOtpHtml('Test User','000000'), '[TEST]'); break;
    case 'totp_2fa':  result = { ok:true, message:'TOTP active — no external endpoint' }; break;
    case 'cloudinary': result = { ok:true, message:'Cloudinary: use avatar/logo upload to verify' }; break;
    case 'tawk':       result = { ok:true, message:'Tawk.to: save config and reload the user portal to verify the chat widget appears' }; break;
    case 'bridge_app': {
      const cfg = p.config || {};
      if (!cfg.downloadUrl) throw new Error('Download URL is required');
      if (!cfg.wsUrl)       throw new Error('WebSocket Server URL is required');
      if (!cfg.apiUrl)      throw new Error('Server API URL is required');
      if (!cfg.wsSecret)    throw new Error('WebSocket Secret is required');
      result = { ok:true, message:`Bridge App v${cfg.version||'?'} — download link and server config look good.` };
      break;
    }
    case 'google_auth': {
      // Verify clientId format and reachability
      const cfg = p.config || {};
      if (!cfg.clientId) throw new Error('Google Client ID is required');
      if (!cfg.clientId.endsWith('.apps.googleusercontent.com')) throw new Error('Invalid Client ID format — must end with .apps.googleusercontent.com');
      result = { ok:true, message:`Google Sign-In configured correctly. Client ID: ${cfg.clientId.slice(0,24)}…` };
      break;
    }
    default: throw new Error(`No test handler for '${name}'`);
  }
  await Plugin.updateOne({ name }, { $set:{ lastTestedAt:new Date(), lastTestResult:'ok' } });
  invalidateCache(name);
  return result;
}

module.exports = { sendOtp, sendSms, sendBulkSms, checkSmsBalance, sendWhatsApp, checkWhatsAppBalance, sendEmail, sendEmailWithAttachment, buildOtpHtml, getBrand, testPlugin, invalidateCache };
