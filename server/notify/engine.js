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

async function buildOtpHtml(name, code) {
  const b = await getBrand();
  const logoBlock = b.logoUrl
    ? `<img src="${b.logoUrl}" alt="${b.appName}" style="height:32px;width:auto;object-fit:contain;"/>`
    : `<span style="font-size:22px;">🔐</span>`;
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${b.appName} — OTP</title></head>
<body style="margin:0;padding:0;background:#0a0a14;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:480px;margin:40px auto;padding:0 16px;">

    <!-- Header -->
    <div style="background:#111121;border:1px solid #1e1e35;border-radius:14px 14px 0 0;padding:22px 28px;display:flex;align-items:center;gap:14px;border-bottom:1px solid #1e1e35;">
      <div style="width:40px;height:40px;border-radius:10px;background:rgba(88,166,255,0.12);border:1px solid rgba(88,166,255,0.25);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0;">
        ${logoBlock}
      </div>
      <div>
        <p style="margin:0;color:#e0e0f0;font-weight:700;font-size:0.95rem;letter-spacing:-0.01em;">${b.appName}</p>
        <p style="margin:2px 0 0;color:#4a4a72;font-size:0.7rem;font-family:monospace;">${b.tagline}</p>
      </div>
    </div>

    <!-- Body -->
    <div style="background:#111121;border:1px solid #1e1e35;border-top:none;padding:32px 28px;">
      <p style="margin:0 0 6px;color:#7070a0;font-size:0.8rem;font-family:monospace;text-transform:uppercase;letter-spacing:0.1em;">One-Time Passcode</p>
      <h1 style="margin:0 0 20px;font-size:1.4rem;font-weight:800;color:#e0e0f0;letter-spacing:-0.02em;">Verify your identity</h1>
      <p style="margin:0 0 28px;color:#8080a8;font-size:0.9rem;line-height:1.6;">
        Hi <strong style="color:#d0d0ec;">${name}</strong>, use the code below to complete your sign-in.
        This code expires in <strong style="color:#d0d0ec;">10 minutes</strong>.
      </p>

      <!-- OTP Box -->
      <div style="background:#0a0a14;border:1px solid #2a2a45;border-radius:12px;padding:28px 20px;text-align:center;margin:0 0 28px;">
        <p style="margin:0 0 8px;color:#4a4a72;font-size:0.7rem;font-family:monospace;letter-spacing:0.15em;text-transform:uppercase;">Your OTP</p>
        <span style="font-family:'Courier New',monospace;font-size:48px;font-weight:700;letter-spacing:14px;color:#58a6ff;display:block;line-height:1.1;">${code}</span>
      </div>

      <!-- Warning -->
      <div style="background:rgba(248,113,113,0.07);border:1px solid rgba(248,113,113,0.2);border-radius:8px;padding:12px 16px;display:flex;gap:10px;align-items:flex-start;">
        <span style="font-size:14px;flex-shrink:0;margin-top:1px;">🔒</span>
        <p style="margin:0;color:#f87171;font-size:0.78rem;line-height:1.5;">Never share this code with anyone. ${b.appName} staff will never ask for your OTP.</p>
      </div>
    </div>

    <!-- Footer -->
    <div style="background:#0d0d1a;border:1px solid #1e1e35;border-top:none;border-radius:0 0 14px 14px;padding:16px 28px;text-align:center;">
      <p style="margin:0;color:#3a3a58;font-size:0.7rem;">
        ${b.companyName ? `© ${new Date().getFullYear()} ${b.companyName} · ` : ''}${b.appName} · Automated notification · Do not reply
      </p>
      ${b.website ? `<p style="margin:6px 0 0;"><a href="${b.website}" style="color:#58a6ff;font-size:0.7rem;text-decoration:none;">${b.website.replace(/^https?:\/\//,'')}</a></p>` : ''}
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

module.exports = { sendOtp, sendSms, sendBulkSms, checkSmsBalance, sendWhatsApp, checkWhatsAppBalance, sendEmail, buildOtpHtml, getBrand, testPlugin, invalidateCache };
