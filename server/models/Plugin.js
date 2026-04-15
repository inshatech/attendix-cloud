'use strict';
const mongoose = require('mongoose');

const PLUGIN_NAMES = [
  'sms', 'whatsapp', 'smtp', 'totp_2fa', 'cloudinary', 'google_auth', 'bridge_app',
  'tawk', 'turnstile', 'razorpay', 'phonepe', 'paytm', 'ccavenue', 'cashfree', 'about_us', 'legal_pages',
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
  turnstile:  { siteKey:'', secretKey:'', onLogin:false, onRegister:true, onForgotPassword:true },
  razorpay:   { keyId:'', keySecret:'', color:'#2d82f5' },
  phonepe:    { merchantId:'', saltKey:'', saltIndex:'1', env:'prod', color:'#5f259f' },
  paytm:      { merchantId:'', merchantKey:'', websiteName:'DEFAULT', industryType:'Retail', env:'staging', color:'#00BAF2' },
  ccavenue:   { merchantId:'', accessCode:'', workingKey:'', env:'prod', color:'#e8703a' },
  cashfree:   { appId:'', secretKey:'', env:'prod', color:'#00C853' },
  legal_pages: {
    privacy_policy: {
      title: 'Privacy Policy',
      lastUpdated: 'April 2026',
      content: `<h2>Privacy Policy</h2><p>This Privacy Policy explains how <strong>Insha Technologies</strong> ("we", "us", or "our") collects, uses, stores, and protects information when you use the <strong>Attendix</strong> platform — a biometric attendance management SaaS ("Service").</p><h3>1. Information We Collect</h3><p>We collect the following categories of information:</p><ul><li><strong>Account Information:</strong> Name, email address, mobile number, organization details, and login credentials.</li><li><strong>Employee Attendance Data:</strong> Punch-in/out timestamps, device identifiers, shift details, and working hours — collected via biometric devices connected through the Attendix Bridge App.</li><li><strong>Biometric References:</strong> Fingerprint templates and face recognition data are stored on the physical biometric device only. Attendix does not store raw biometric data on our servers.</li><li><strong>Usage Data:</strong> IP addresses, browser/device type, pages visited, and feature usage for performance monitoring and security.</li><li><strong>Payment Information:</strong> Subscription billing details are processed by our payment gateway partners. We do not store card or bank account numbers.</li></ul><h3>2. How We Use Your Information</h3><ul><li>To provide, maintain, and improve the Attendix platform.</li><li>To generate attendance reports, payroll calculations, and analytics.</li><li>To send transactional communications (OTP, alerts, reports).</li><li>To process subscription payments and send billing receipts.</li><li>To detect and prevent fraud, abuse, and unauthorized access.</li><li>To comply with applicable legal obligations.</li></ul><h3>3. Data Sharing</h3><p>We do not sell your personal data. We may share data with:</p><ul><li><strong>Service Providers:</strong> Cloud infrastructure, payment gateways, SMS/WhatsApp/email providers — only as needed to operate the Service.</li><li><strong>Legal Authorities:</strong> When required by law, court order, or government regulation.</li><li><strong>Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets.</li></ul><h3>4. Data Retention</h3><p>We retain your account and attendance data for as long as your subscription is active. Upon account deletion, data is purged within 30 days, except where required by law.</p><h3>5. Security</h3><p>We implement industry-standard security measures including TLS encryption in transit, hashed passwords, JWT-based authentication, and access control. No method of transmission over the internet is 100% secure; we cannot guarantee absolute security.</p><h3>6. Your Rights</h3><p>You have the right to access, correct, or delete your personal data. To exercise these rights, contact us at <strong>support@inshatech.com</strong>. We will respond within 30 business days.</p><h3>7. Cookies</h3><p>Attendix uses session cookies for authentication and local storage for preferences. No third-party advertising cookies are used.</p><h3>8. Changes to This Policy</h3><p>We may update this Privacy Policy from time to time. We will notify you of significant changes by email or in-app notice. Continued use of the Service after changes constitutes acceptance.</p><h3>9. Contact Us</h3><p>For privacy-related queries, contact us at <strong>privacy@inshatech.com</strong> or visit <strong>www.inshatech.com</strong>.</p>`,
    },
    terms_of_service: {
      title: 'Terms of Service',
      lastUpdated: 'April 2026',
      content: `<h2>Terms of Service</h2><p>These Terms of Service ("Terms") govern your use of the <strong>Attendix</strong> platform operated by <strong>Insha Technologies</strong>. By accessing or using the Service, you agree to be bound by these Terms.</p><h3>1. Eligibility</h3><p>You must be at least 18 years old and authorized to act on behalf of your organization to use Attendix. By registering, you confirm you have the legal authority to enter into this agreement.</p><h3>2. Account Responsibilities</h3><ul><li>You are responsible for maintaining the confidentiality of your login credentials.</li><li>You must notify us immediately of any unauthorized access to your account.</li><li>You are responsible for all activity that occurs under your account.</li><li>Sharing account credentials with unauthorized parties is strictly prohibited.</li></ul><h3>3. Subscription and Billing</h3><ul><li>Attendix is offered on a subscription basis (monthly, quarterly, or annual plans).</li><li>Subscriptions automatically renew unless cancelled before the renewal date.</li><li>Pricing is as displayed on the platform. We reserve the right to change prices with 30 days' notice.</li><li>All fees are exclusive of applicable taxes unless stated otherwise.</li></ul><h3>4. Acceptable Use</h3><p>You agree not to:</p><ul><li>Use the Service for any unlawful, fraudulent, or malicious purpose.</li><li>Attempt to gain unauthorized access to any system or data.</li><li>Reverse engineer, decompile, or disassemble any part of the Service.</li><li>Use the Service to transmit spam, malware, or harmful content.</li><li>Misrepresent employee attendance data or use the platform to falsify records.</li></ul><h3>5. Intellectual Property</h3><p>All software, designs, and content comprising the Attendix platform are the exclusive property of Insha Technologies and protected by intellectual property laws. You receive a limited, non-exclusive, non-transferable license to use the Service during your subscription period.</p><h3>6. Data Ownership</h3><p>You retain ownership of all attendance and organizational data you upload or generate through the Service. You grant us a limited license to process this data solely to provide the Service.</p><h3>7. Service Availability</h3><p>We strive for high availability but do not guarantee uninterrupted service. Scheduled maintenance will be communicated in advance where possible. We are not liable for downtime beyond our reasonable control.</p><h3>8. Limitation of Liability</h3><p>To the maximum extent permitted by law, Insha Technologies shall not be liable for any indirect, incidental, special, or consequential damages arising from use of or inability to use the Service. Our total liability shall not exceed the fees paid by you in the 3 months preceding the claim.</p><h3>9. Termination</h3><p>Either party may terminate this agreement at any time. Upon termination, your access to the Service will cease and your data will be retained for 30 days before deletion.</p><h3>10. Governing Law</h3><p>These Terms are governed by the laws of India. Any disputes shall be subject to the exclusive jurisdiction of the courts of Hyderabad, Telangana.</p><h3>11. Changes to Terms</h3><p>We may update these Terms at any time. Continued use of the Service after changes constitutes your acceptance of the revised Terms.</p><h3>12. Contact</h3><p>For questions about these Terms, contact us at <strong>legal@inshatech.com</strong>.</p>`,
    },
    refund_policy: {
      title: 'Refund Policy',
      lastUpdated: 'April 2026',
      content: `<h2>Refund Policy</h2><p>This Refund Policy outlines the conditions under which <strong>Insha Technologies</strong> issues refunds for <strong>Attendix</strong> subscriptions.</p><h3>1. Free Trial</h3><p>Attendix offers a free trial period for new accounts. No payment is required during the trial. At the end of the trial, your subscription will activate automatically only if a payment method is on file and you have selected a paid plan.</p><h3>2. Subscription Refunds</h3><ul><li><strong>Monthly Plans:</strong> Refunds are not provided for partial months. You may cancel at any time and retain access until the end of the current billing period.</li><li><strong>Annual Plans:</strong> If you cancel within <strong>7 days</strong> of your annual subscription start date and have not used the Service beyond 5 active users, you are eligible for a full refund.</li><li><strong>After 7 Days:</strong> No refunds are issued for annual plans after the 7-day window, regardless of usage.</li></ul><h3>3. Eligible Refund Scenarios</h3><p>We will issue a full refund in the following cases:</p><ul><li>Duplicate payment due to a technical error on our platform.</li><li>Subscription activated without your consent due to a system error.</li><li>Service was completely unavailable for more than 72 consecutive hours during your paid period (excluding scheduled maintenance).</li></ul><h3>4. Non-Refundable Items</h3><ul><li>Add-on features purchased separately.</li><li>Fees for SMS, WhatsApp, or other third-party messaging consumed through the platform.</li><li>Subscriptions cancelled after the refund window.</li><li>Accounts suspended for violation of our Terms of Service.</li></ul><h3>5. How to Request a Refund</h3><p>To request a refund, contact our support team at <strong>billing@inshatech.com</strong> within the eligible window. Include:</p><ul><li>Your registered email address.</li><li>Organization name.</li><li>Payment transaction ID or invoice number.</li><li>Reason for refund request.</li></ul><p>We will review your request and respond within <strong>5 business days</strong>. Approved refunds are processed within 7–10 business days to the original payment method.</p><h3>6. Chargebacks</h3><p>If you initiate a chargeback with your bank before contacting us, we reserve the right to suspend your account pending resolution. We encourage you to contact our support team first — most issues can be resolved quickly.</p><h3>7. Contact</h3><p>For billing and refund queries, reach us at <strong>billing@inshatech.com</strong> or raise a support ticket from your Attendix dashboard.</p>`,
    },
    report_abuse: {
      title: 'Report Abuse',
      lastUpdated: 'April 2026',
      content: `<h2>Report Abuse</h2><p>At <strong>Insha Technologies</strong>, we are committed to maintaining the integrity and safety of the <strong>Attendix</strong> platform. If you encounter misuse, fraud, or any form of abuse, please report it to us immediately.</p><h3>What Constitutes Abuse?</h3><p>The following activities violate our Terms of Service and should be reported:</p><ul><li><strong>Attendance Fraud:</strong> Falsifying employee punch records, proxy attendance, or tampering with biometric device data.</li><li><strong>Unauthorized Access:</strong> Attempting to access accounts, data, or systems without authorization.</li><li><strong>Data Misuse:</strong> Using employee attendance or personal data for purposes outside legitimate HR management.</li><li><strong>Platform Scraping:</strong> Automated extraction of data from the Attendix platform without authorization.</li><li><strong>Account Sharing:</strong> Sharing login credentials across multiple organizations or users in violation of licensing terms.</li><li><strong>Spam or Phishing:</strong> Using Attendix communication features to send unsolicited messages or impersonate Insha Technologies.</li><li><strong>Intellectual Property Violations:</strong> Reproducing or distributing Attendix software, UI, or documentation without permission.</li></ul><h3>How to Report</h3><p>You can report abuse through any of the following channels:</p><ul><li><strong>In-App Support Ticket:</strong> Log in to your Attendix dashboard → Support → New Ticket → Category: Abuse/Fraud.</li><li><strong>Email:</strong> Send a detailed report to <strong>abuse@inshatech.com</strong> with subject line: <em>"Abuse Report – [Brief Description]"</em>.</li><li><strong>Emergency (Security Breach):</strong> For active security incidents, email <strong>security@inshatech.com</strong> immediately.</li></ul><h3>What to Include in Your Report</h3><ul><li>Your name and registered email address.</li><li>Organization or user involved in the abuse (if known).</li><li>Description of the incident with as much detail as possible.</li><li>Screenshots, logs, or any supporting evidence.</li><li>Date and time of the incident.</li></ul><h3>What Happens After You Report</h3><ol><li>We acknowledge your report within <strong>24 hours</strong>.</li><li>Our team investigates the report — typically within <strong>5 business days</strong>.</li><li>Depending on severity, we may suspend the offending account, escalate to law enforcement, or take corrective action.</li><li>We will keep you informed of the outcome where permitted by law.</li></ol><h3>Responsible Disclosure (Security Vulnerabilities)</h3><p>If you discover a security vulnerability in Attendix, please report it responsibly to <strong>security@inshatech.com</strong>. Do not publicly disclose the vulnerability until we have had a reasonable opportunity to address it. We appreciate responsible researchers and will acknowledge contributions.</p><h3>Contact</h3><p>For all abuse-related concerns: <strong>abuse@inshatech.com</strong><br/>For security vulnerabilities: <strong>security@inshatech.com</strong><br/>Website: <strong>www.inshatech.com</strong></p>`,
    },
  },
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
  turnstile:  { label:'Cloudflare Turnstile',      description:'Privacy-friendly CAPTCHA for login, register and forgot-password forms. Protects against bots without annoying real users.' },
  razorpay:   { label:'Razorpay',                  description:'Cards, UPI, Netbanking, Wallets — India\'s leading payment gateway.' },
  phonepe:    { label:'PhonePe',                   description:'UPI payments via PhonePe Standard Checkout. Requires PhonePe Business account.' },
  paytm:      { label:'Paytm',                     description:'Paytm Payment Gateway — supports UPI, cards, wallets, netbanking.' },
  ccavenue:   { label:'CCAvenue',                  description:'CCAvenue payment gateway — 200+ payment options including EMI.' },
  cashfree:   { label:'Cashfree',                  description:'Cashfree Payments — UPI, cards, netbanking, wallets with instant settlement.' },
  about_us:   { label:'About Us Page',             description:'Content for the public About Us page — app info, company, mission, features, team and contact details.' },
  legal_pages: { label:'Legal Pages',              description:'Manage Privacy Policy, Terms of Service, Refund Policy and Report Abuse pages. All are public at /policies/*.' },
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
