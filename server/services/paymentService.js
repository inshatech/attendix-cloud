'use strict';
/**
 * paymentService.js — Bulletproof unified payment gateway
 * Based on official API documentation for all 4 gateways.
 *
 * PhonePe  : https://developer.phonepe.com/v1/docs/pay-page-integration
 * Razorpay : https://razorpay.com/docs/api/orders/
 * Paytm    : https://developer.paytm.com/docs/payment-gateway/
 * CCAvenue : https://www.ccavenue.com/api_integration.jsp
 *
 * Constraints enforced:
 *   PhonePe  — merchantTransactionId: 1-38 chars, [A-Za-z0-9_-] only
 *              merchantUserId:        1-36 chars, alphanumeric only
 *              amount:                integer paise
 *   Razorpay — amount: integer paise; receipt: max 40 chars; uses official npm SDK
 *   Paytm    — orderId: max 64 chars; txnAmount.value: string "1950.00"
 *   CCAvenue — order_id: max 30 chars; workingKey: MD5 → AES-128-ECB
 */

const crypto = require('crypto');

// ── Safe ID generators ────────────────────────────────────────────────────────

/** PhonePe: [A-Za-z0-9_-], 1–38 chars */
function genPhonePeId() {
  // 'PP' + 13-digit timestamp = 15 chars — well within 38
  return 'PP' + Date.now();
}

/** Razorpay receipt: max 40 chars */
function genRazorpayReceipt() {
  return 'REC' + Date.now(); // 16 chars
}

/** Paytm orderId: max 64 chars */
function genPaytmOrderId() {
  return 'PT' + Date.now(); // 15 chars
}

/** CCAvenue order_id: max 30 chars */
function genCCAvOrderId() {
  return 'CA' + Date.now(); // 15 chars
}

// ── Crypto helpers ────────────────────────────────────────────────────────────

function sha256Hex(str) {
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}

function hmacSha256Hex(secret, data) {
  return crypto.createHmac('sha256', secret).update(data, 'utf8').digest('hex');
}

/** CCAvenue: key = MD5(workingKey) → 16-byte Buffer → AES-128-ECB */
function ccaKey(workingKey) {
  return crypto.createHash('md5').update(workingKey, 'utf8').digest(); // 16 bytes
}
function ccaEncrypt(plaintext, keyBuf) {
  const c = crypto.createCipheriv('aes-128-ecb', keyBuf, '');
  c.setAutoPadding(true);
  return Buffer.concat([c.update(Buffer.from(plaintext, 'utf8')), c.final()]).toString('hex');
}
function ccaDecrypt(hexStr, keyBuf) {
  try {
    const d = crypto.createDecipheriv('aes-128-ecb', keyBuf, '');
    d.setAutoPadding(true);
    return Buffer.concat([d.update(Buffer.from(hexStr, 'hex')), d.final()]).toString('utf8');
  } catch { return null; }
}

// ── 1. RAZORPAY ───────────────────────────────────────────────────────────────
// Docs: https://razorpay.com/docs/api/orders/
// Use official SDK: npm install razorpay

async function razorpayCreateOrder({ cfg, amount, userId, planId, billingCycle }) {
  if (!cfg.keyId || !cfg.keySecret) {
    throw new Error('Razorpay: keyId and keySecret are required');
  }

  let Razorpay;
  try {
    Razorpay = require('razorpay');
  } catch {
    throw new Error('Razorpay SDK not installed. Run: npm install razorpay');
  }

  const instance = new Razorpay({ key_id: cfg.keyId, key_secret: cfg.keySecret });
  const amtPaise  = Math.round(Number(amount) * 100); // must be integer paise
  const receipt   = genRazorpayReceipt();              // max 40 chars ✓

  const order = await instance.orders.create({
    amount:          amtPaise,
    currency:        'INR',
    receipt,
    payment_capture: true,    // auto-capture on payment
    notes: {                  // webhook reads these to activate subscription
      userId,
      planId,
      billingCycle,
    },
  });

  return {
    gateway:  'razorpay',
    orderId:  order.id,       // e.g. "order_DBJOWzybf0sJbb"
    receipt,
    amount,
    amtPaise,
    currency: 'INR',
    keyId:    cfg.keyId,      // needed by frontend Checkout.js
  };
}

function razorpayVerifyWebhook({ cfg, rawBody, signature }) {
  // Razorpay sends x-razorpay-signature = HMAC-SHA256(rawBody, webhookSecret)
  const expected = hmacSha256Hex(cfg.webhookSecret, rawBody);
  return expected === signature;
}

function razorpayVerifyPayment({ cfg, orderId, paymentId, signature }) {
  // Frontend verification: HMAC-SHA256("orderId|paymentId", keySecret)
  const expected = hmacSha256Hex(cfg.keySecret, `${orderId}|${paymentId}`);
  return expected === signature;
}

// ── 2. PHONEPE ────────────────────────────────────────────────────────────────
// Docs: https://developer.phonepe.com/v1/docs/pay-page-integration
// Sandbox: merchantId=PGTESTPAYUAT86, saltKey=96434309-7796-489d-8924-ab56988a6076, saltIndex=1
// X-VERIFY = SHA256(base64Payload + "/pg/v1/pay" + saltKey) + "###" + saltIndex

async function phonePeInitiate({ cfg, amount, userId, planId, billingCycle, redirectUrl, frontendUrl }) {
  if (!cfg.merchantId || !cfg.saltKey) {
    throw new Error('PhonePe: merchantId and saltKey are required');
  }

  const merchantTransactionId = genPhonePeId();       // 15 chars, [A-Z0-9] ✓
  const merchantUserId = String(userId)
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 36) || 'MUID001';                       // alphanumeric ≤36 ✓
  const amtPaise = Math.round(Number(amount) * 100);  // integer paise ✓
  const saltIndex = String(cfg.saltIndex || '1');

  // Neutral redirect — frontend checks status via API, does NOT auto-activate from URL
  const fullRedirectUrl = `${frontendUrl}/subscription?transactionId=${merchantTransactionId}&gateway=phonepe`

  const payload = {
    merchantId:            cfg.merchantId,
    merchantTransactionId,
    merchantUserId,
    amount:                amtPaise,
    redirectUrl:           fullRedirectUrl,
    redirectMode:          'REDIRECT',
    callbackUrl:           cfg.callbackUrl || fullRedirectUrl,
    paymentInstrument:     { type: 'PAY_PAGE' },
  };

  // Remove null/undefined — PhonePe rejects extra/null fields
  Object.keys(payload).forEach(k => (payload[k] == null) && delete payload[k]);

  const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');
  const xVerify       = sha256Hex(base64Payload + '/pg/v1/pay' + cfg.saltKey) + '###' + saltIndex;

  const host = (cfg.environment === 'sandbox' || !cfg.environment)
    ? 'https://api-preprod.phonepe.com/apis/pg-sandbox'
    : 'https://api.phonepe.com/apis/hermes';

  const res  = await fetch(`${host}/pg/v1/pay`, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-VERIFY':      xVerify,
      'accept':        'application/json',
    },
    body: JSON.stringify({ request: base64Payload }),
  });

  const data = await res.json();
  if (!data.success) {
    throw new Error(`PhonePe: [${data.code}] ${data.message || JSON.stringify(data.data || {})}`);
  }

  const paymentUrl = data.data?.instrumentResponse?.redirectInfo?.url;
  if (!paymentUrl) throw new Error('PhonePe: No redirect URL in response');

  return {
    gateway:    'phonepe',
    orderId:    merchantTransactionId,
    paymentUrl,
    amount,
    userId, planId, billingCycle,
  };
}

async function phonePeCheckStatus({ cfg, merchantTransactionId }) {
  // Status check: GET /pg/v1/status/{merchantId}/{merchantTransactionId}
  // X-VERIFY = SHA256("/pg/v1/status/{mid}/{txnId}" + saltKey) + "###" + saltIndex
  const saltIndex = String(cfg.saltIndex || '1');
  const path      = `/pg/v1/status/${cfg.merchantId}/${merchantTransactionId}`;
  const xVerify   = sha256Hex(path + cfg.saltKey) + '###' + saltIndex;

  const host = (cfg.environment === 'sandbox' || !cfg.environment)
    ? 'https://api-preprod.phonepe.com/apis/pg-sandbox'
    : 'https://api.phonepe.com/apis/hermes';

  const res  = await fetch(`${host}${path}`, {
    method:  'GET',
    headers: {
      'Content-Type':  'application/json',
      'X-VERIFY':       xVerify,
      'X-MERCHANT-ID':  cfg.merchantId,
      'accept':         'application/json',
    },
  });
  const data = await res.json();
  return {
    success: data.success && data.code === 'PAYMENT_SUCCESS',
    code:    data.code,
    data:    data.data,
  };
}

function phonePeVerifyWebhook({ cfg, response, checksum }) {
  // PhonePe sends: response (base64), checksum = SHA256(response + saltKey) + "###" + saltIndex
  const saltIndex  = String(cfg.saltIndex || '1');
  const expected   = sha256Hex(response + cfg.saltKey) + '###' + saltIndex;
  if (expected !== checksum) return { valid: false };
  try {
    const decoded = JSON.parse(Buffer.from(response, 'base64').toString('utf8'));
    return { valid: true, success: decoded?.code === 'PAYMENT_SUCCESS', data: decoded };
  } catch { return { valid: false }; }
}

// ── 3. PAYTM ──────────────────────────────────────────────────────────────────
// Docs: https://developer.paytm.com/docs/payment-gateway/web-integration/custom/
// Initiate: POST https://securegw.paytm.in/theia/api/v1/initiateTransaction
// Checksum: HMAC-SHA256 of JSON body string using merchantKey

async function paytmInitiate({ cfg, amount, userId, planId, billingCycle, callbackUrl }) {
  if (!cfg.merchantId || !cfg.merchantKey) {
    throw new Error('Paytm: merchantId and merchantKey are required');
  }

  const orderId  = genPaytmOrderId();                          // max 64 chars ✓
  const amtStr   = Number(amount).toFixed(2);                  // "1950.00" ✓
  const custId   = String(userId).replace(/[^a-zA-Z0-9@._-]/g, '').slice(0, 64) || 'CUST001';
  const env      = cfg.environment === 'production' ? 'securegw' : 'securegw-stage';

  const bodyObj = {
    requestType: 'Payment',
    mid:         cfg.merchantId,
    websiteName: cfg.website || 'DEFAULT',
    orderId,
    callbackUrl: callbackUrl || cfg.callbackUrl,
    txnAmount:   { value: amtStr, currency: 'INR' },
    userInfo:    { custId },
  };

  const signature = hmacSha256Hex(cfg.merchantKey, JSON.stringify(bodyObj));

  const url = `https://${env}.paytm.in/theia/api/v1/initiateTransaction?mid=${encodeURIComponent(cfg.merchantId)}&orderId=${encodeURIComponent(orderId)}`;
  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ body: bodyObj, head: { signature } }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Paytm HTTP ${res.status}: ${txt.slice(0, 200)}`);
  }

  const data = await res.json();
  if (data.body?.resultInfo?.resultStatus === 'F') {
    throw new Error(`Paytm: ${data.body.resultInfo.resultMsg || 'Initiation failed'}`);
  }

  const txnToken = data.body?.txnToken;
  if (!txnToken) throw new Error('Paytm: No txnToken in response — check credentials');

  return {
    gateway:    'paytm',
    orderId,
    txnToken,
    mid:        cfg.merchantId,
    amount,
    paymentUrl: `https://${env}.paytm.in/theia/api/v1/showPaymentPage?mid=${encodeURIComponent(cfg.merchantId)}&orderId=${encodeURIComponent(orderId)}`,
    userId, planId, billingCycle,
  };
}

function paytmVerifyWebhook({ cfg, body }) {
  const { CHECKSUMHASH, ...rest } = body;
  if (!CHECKSUMHASH) return { valid: false };
  // Paytm checksum verification: sort params alphabetically, join with |
  const str      = Object.keys(rest).sort().map(k => rest[k]).join('|');
  const expected = hmacSha256Hex(cfg.merchantKey, str);
  return {
    valid:   expected === CHECKSUMHASH,
    success: rest.STATUS === 'TXN_SUCCESS',
    data:    body,
  };
}

// ── 4. CCAVENUE ───────────────────────────────────────────────────────────────
// Docs: https://www.ccavenue.com/api_integration.jsp
// Encryption: AES-128-ECB with key = MD5(workingKey)

function ccavenueEncrypt({ cfg, amount, userId, planId, billingCycle, redirectUrl, cancelUrl }) {
  if (!cfg.merchantId || !cfg.accessCode || !cfg.workingKey) {
    throw new Error('CCAvenue: merchantId, accessCode and workingKey are required');
  }

  const orderId = genCCAvOrderId();  // max 30 chars ✓
  const keyBuf  = ccaKey(cfg.workingKey);
  const email   = String(userId).includes('@') ? userId : 'customer@attendancegateway.com';

  const params = new URLSearchParams({
    merchant_id:  cfg.merchantId,
    order_id:     orderId,
    currency:     cfg.currency || 'INR',
    amount:       Number(amount).toFixed(2),
    redirect_url: redirectUrl || cfg.redirectUrl || '',
    cancel_url:   cancelUrl   || cfg.cancelUrl   || '',
    billing_email: email,
    billing_name: 'Subscriber',
  }).toString();

  const encRequest = ccaEncrypt(params, keyBuf);

  return {
    gateway:    'ccavenue',
    orderId,
    accessCode: cfg.accessCode,
    encRequest,
    amount,
    actionUrl:  cfg.environment === 'production'
      ? 'https://secure.ccavenue.com/transaction/transaction.do?command=initiateTransaction'
      : 'https://test.ccavenue.com/transaction/transaction.do?command=initiateTransaction',
    userId, planId, billingCycle,
  };
}

function ccavenueDecrypt({ cfg, encResp }) {
  const keyBuf    = ccaKey(cfg.workingKey);
  const decrypted = ccaDecrypt(encResp, keyBuf);
  if (!decrypted) return { valid: false };
  const params = {};
  decrypted.split('&').forEach(pair => {
    const eqIdx = pair.indexOf('=');
    if (eqIdx > 0) params[pair.slice(0, eqIdx)] = pair.slice(eqIdx + 1);
  });
  return {
    valid:   true,
    success: params.order_status === 'Success',
    data:    params,
  };
}

// ── Active gateway ────────────────────────────────────────────────────────────

async function getActiveGateway() {
  const { Plugin } = require('../models/Plugin');
  for (const name of ['razorpay', 'phonepe', 'paytm', 'ccavenue']) {
    const p = await Plugin.findOne({ name, enabled: true }).lean();
    if (p) return { name, config: p.config };
  }
  return null;
}

// Returns ALL enabled gateways (for user gateway picker)
async function getAllActiveGateways() {
  const { Plugin } = require('../models/Plugin');
  const all = await Plugin.find({ name: { $in: ['razorpay','phonepe','paytm','ccavenue'] }, enabled: true })
    .select('name label').lean();
  return all.map(p => p.name);
}

// ── Unified initiate ──────────────────────────────────────────────────────────

async function initiatePayment({ planId, amount, billingCycle, userId, frontendUrl, gateway: preferredGateway }) {
  let gw;
  if (preferredGateway) {
    // User explicitly chose a gateway — load it if enabled
    const { Plugin } = require('../models/Plugin');
    const p = await Plugin.findOne({ name: preferredGateway, enabled: true }).lean();
    if (!p) throw new Error(`Payment gateway "${preferredGateway}" is not enabled`);
    gw = { name: preferredGateway, config: p.config };
  } else {
    gw = await getActiveGateway();
  }
  if (!gw) {
    throw new Error('No payment gateway enabled. Please configure one in Admin → Plugins.');
  }

  // Neutral redirect — no payment=success. Frontend must verify via status API.
  const redirectUrl = `${frontendUrl}/subscription?payment=pending`;
  const cancelUrl   = `${frontendUrl}/subscription?payment=cancelled`;

  switch (gw.name) {
    case 'razorpay':
      return razorpayCreateOrder({ cfg: gw.config, amount, userId, planId, billingCycle });

    case 'phonepe':
      return phonePeInitiate({ cfg: gw.config, amount, userId, planId, billingCycle, redirectUrl, frontendUrl });

    case 'paytm':
      return paytmInitiate({ cfg: gw.config, amount, userId, planId, billingCycle, callbackUrl: redirectUrl });

    case 'ccavenue':
      return ccavenueEncrypt({ cfg: gw.config, amount, userId, planId, billingCycle, redirectUrl, cancelUrl });

    default:
      throw new Error(`Unsupported gateway: ${gw.name}`);
  }
}

module.exports = {
  getActiveGateway,
  getAllActiveGateways,
  initiatePayment,
  // Razorpay
  razorpayCreateOrder, razorpayVerifyWebhook, razorpayVerifyPayment,
  // PhonePe
  phonePeInitiate, phonePeCheckStatus, phonePeVerifyWebhook,
  // Paytm
  paytmInitiate, paytmVerifyWebhook,
  // CCAvenue
  ccavenueEncrypt, ccavenueDecrypt,
};
