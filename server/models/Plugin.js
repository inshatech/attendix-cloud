'use strict';
const mongoose = require('mongoose');

const PLUGIN_NAMES = [
  'sms', 'whatsapp', 'smtp', 'totp_2fa', 'cloudinary', 'google_auth', 'bridge_app',
  'tawk', 'razorpay', 'phonepe', 'paytm', 'ccavenue', 'cashfree', 'about_us',
];

const PLUGIN_DEFAULTS = {
  sms:        { username:'', apiKey:'', sender:'', route:'Trans', templateId:'', baseUrl:'https://trans.inshatech.com/sms-panel/api/http/index.php' },
  whatsapp:   { phoneNumberId:'', apiKey:'', version:'v19.0', templateId:'', baseUrl:'https://graph.facebook.com' },
  smtp:       { service:'', host:'', port:587, secure:false, user:'', pass:'', from:'Attendix Cloud <no-reply@example.com>' },
  totp_2fa:   { issuer:'AttendanceGateway', enforceForAdmins:false, enforceForSupport:false, enforceForUsers:false },
  cloudinary: { cloudName:'', apiKey:'', apiSecret:'', uploadPreset:'attendance_gateway', folder:'attendance' },
  google_auth:{ clientId:'', clientSecret:'' },
  bridge_app: { downloadUrl:'', version:'1.0.0', fileSizeMb:'', wsUrl:'', apiUrl:'', wsSecret:'', changelog:'' },
  tawk:       { propertyId:'', widgetId:'' },
  razorpay:   { keyId:'', keySecret:'', color:'#2d82f5' },
  phonepe:    { merchantId:'', saltKey:'', saltIndex:'1', env:'prod', color:'#5f259f' },
  paytm:      { merchantId:'', merchantKey:'', websiteName:'DEFAULT', industryType:'Retail', env:'staging', color:'#00BAF2' },
  ccavenue:   { merchantId:'', accessCode:'', workingKey:'', env:'prod', color:'#e8703a' },
  cashfree:   { appId:'', secretKey:'', env:'prod', color:'#00C853' },
  about_us:   {
    appName:'Attendix', version:'1.0.0', tagline:'Attendance & Payroll Simplified',
    description:'Attendix is a comprehensive biometric attendance management platform that connects physical fingerprint devices to the cloud via a smart Windows bridge — giving HR teams real-time visibility, automated payroll, and zero paperwork.',
    companyName:'Insha Technologies', foundedYear:'2024', website:'',
    missionStatement:'To simplify workforce management for every organization — from startups to enterprises — by making biometric attendance effortless, accurate, and insightful.',
    features: JSON.stringify([
      { icon:'🔒', title:'Biometric Security',    desc:'Hardware-level fingerprint verification with tamper-proof punch logs.' },
      { icon:'🌐', title:'Real-Time WebSocket',   desc:'Live attendance sync from device to dashboard in under a second.' },
      { icon:'📊', title:'Smart Payroll',         desc:'Automated salary calculation with LOP, OT, PF, ESI and PT.' },
      { icon:'📅', title:'Shift Management',      desc:'Flexible shift rules — grace period, half-day, late allowance, overtime.' },
      { icon:'📤', title:'Rich Exports',          desc:'Excel and PDF reports with org header, abbreviation key, and powered-by footer.' },
      { icon:'🏖️', title:'Holiday Calendar',      desc:'Auto-sync Indian public holidays via Google Calendar.' },
    ]),
    team: JSON.stringify([
      { name:'Development Team', role:'Engineering', bio:'Building robust, scalable attendance infrastructure for modern workplaces.', photo:'' },
    ]),
    contactAddress:'', contactPhone:'', contactEmail:'',
    linkedin:'', twitter:'', github:'', logoUrl:'',
  },
};

const PLUGIN_SEED = {
  sms:        { label:'SMS Gateway',              description:'InshaTech transactional SMS — single & bulk, DLT template support.' },
  whatsapp:   { label:'WhatsApp',                 description:'Meta WhatsApp Business API via Alots.io — OTP template messages.' },
  smtp:       { label:'Email (SMTP)',              description:'Nodemailer SMTP — Gmail shortcut or any SMTP provider.' },
  totp_2fa:   { label:'Two-Factor Auth (TOTP)',    description:'Google Authenticator / Authy TOTP. Admin can enforce per role.' },
  cloudinary: { label:'Cloudinary (Image Upload)', description:'Cloud image storage for profile avatars & org logos. Auto WebP compression.' },
  google_auth:{ label:'Google Sign-In',            description:'Let users sign in with their Google account. Requires Google Cloud Console OAuth 2.0 credentials.' },
  bridge_app: { label:'Bridge App Settings',       description:'Windows desktop bridge — download link, version, file size, and server connection credentials shown to users.' },
  tawk:       { label:'Tawk.to Live Chat',         description:'Embed Tawk.to chat widget. Enter Property ID and Widget ID from your Tawk.to dashboard.' },
  razorpay:   { label:'Razorpay',                  description:'Cards, UPI, Netbanking, Wallets — India\'s leading payment gateway.' },
  phonepe:    { label:'PhonePe',                   description:'UPI payments via PhonePe Standard Checkout. Requires PhonePe Business account.' },
  paytm:      { label:'Paytm',                     description:'Paytm Payment Gateway — supports UPI, cards, wallets, netbanking.' },
  ccavenue:   { label:'CCAvenue',                  description:'CCAvenue payment gateway — 200+ payment options including EMI.' },
  cashfree:   { label:'Cashfree',                  description:'Cashfree Payments — UPI, cards, netbanking, wallets with instant settlement.' },
  about_us:   { label:'About Us Page',             description:'Content for the public About Us page — app info, company, mission, features, team and contact details.' },
};

const PluginSchema = new mongoose.Schema({
  name:           { type:String, enum:PLUGIN_NAMES, unique:true, required:true, index:true },
  label:          { type:String, required:true },
  description:    { type:String, default:'' },
  enabled:        { type:Boolean, default:false, index:true },
  config:         { type:Object, default:{} },
  enabledAt:      { type:Date, default:null },
  disabledAt:     { type:Date, default:null },
  lastModifiedBy: { type:String, default:null },
  lastTestedAt:   { type:Date, default:null },
  lastTestResult: { type:String, default:null },
}, { timestamps:true });

const Plugin = mongoose.model('Plugin', PluginSchema);

async function seedPlugins() {
  for (const name of PLUGIN_NAMES) {
    await Plugin.findOneAndUpdate(
      { name },
      { $setOnInsert: { name, ...PLUGIN_SEED[name], enabled:false, config:PLUGIN_DEFAULTS[name] } },
      { upsert:true }
    ).catch(e => console.error('[plugin] seed:', e.message));
  }
  console.log('[plugin] Plugin registry ready');
}

module.exports = { Plugin, PLUGIN_NAMES, PLUGIN_DEFAULTS, seedPlugins };
