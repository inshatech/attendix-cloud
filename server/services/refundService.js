'use strict';
/**
 * refundService.js — Gateway-connected refunds for all 4 payment gateways
 *
 * Razorpay : POST https://api.razorpay.com/v1/payments/{paymentId}/refund
 *            amount in paise, uses official SDK
 *
 * PhonePe  : POST {host}/pg/v1/refund
 *            base64 payload, X-VERIFY = SHA256(base64 + "/pg/v1/refund" + saltKey) + "###" + saltIndex
 *            originalTransactionId = the original merchantTransactionId
 *            merchantTransactionId = new unique refund transaction ID
 *
 * Paytm    : POST https://securegw.paytm.in/refund/apply
 *            body: { mid, txnType:"REFUND", orderId, txnId, refId, refundAmount }
 *            head: { signature: HMAC-SHA256(JSON.stringify(body), merchantKey) }
 *
 * CCAvenue : POST https://api.ccavenue.com/apis/servlet/DoWebTrans
 *            command=refundOrder, enc_request = AES-128-ECB encrypted JSON
 *            payload: { reference_no, refund_amount, refund_ref_no }
 */

const crypto = require('crypto');

// ── Helpers ───────────────────────────────────────────────────────────────────
function sha256Hex(str) {
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}
function hmacSha256Hex(secret, data) {
  return crypto.createHmac('sha256', secret).update(data, 'utf8').digest('hex');
}
function ccaKey(workingKey) {
  return crypto.createHash('md5').update(workingKey, 'utf8').digest();
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

// ── 1. RAZORPAY REFUND ────────────────────────────────────────────────────────
// Docs: https://razorpay.com/docs/api/refunds/create-normal/
// POST /v1/payments/{payment_id}/refund
// amount in paise (integer), uses official SDK
async function razorpayRefund({ cfg, transactionId, amount, notes }) {
  if (!cfg.keyId || !cfg.keySecret) throw new Error('Razorpay: keyId and keySecret required');
  if (!transactionId) throw new Error('Razorpay: transactionId (payment_id like pay_xxx) required');

  let Razorpay;
  try { Razorpay = require('razorpay'); }
  catch { throw new Error('Razorpay SDK not installed. Run: npm install razorpay'); }

  const instance  = new Razorpay({ key_id: cfg.keyId, key_secret: cfg.keySecret });
  const amtPaise  = Math.round(Number(amount) * 100);

  const refund = await instance.payments.refund(transactionId, {
    amount: amtPaise,
    speed:  'optimum',   // instant if possible, else normal (5-7 days)
    notes:  { reason: notes || 'Admin refund via Attendix Cloud' },
  });

  // refund.id = rfnd_xxx, refund.status = 'processed' | 'pending' | 'failed'
  return {
    gateway:    'razorpay',
    refundId:   refund.id,
    status:     refund.status,
    amount:     refund.amount / 100,
    speed:      refund.speed_processed || refund.speed_requested,
    createdAt:  new Date(refund.created_at * 1000).toISOString(),
  };
}

// ── 2. PHONEPE REFUND ─────────────────────────────────────────────────────────
// Docs: https://developer.phonepe.com/v1/reference/refund-8
// POST {host}/pg/v1/refund
// X-VERIFY = SHA256(base64Payload + "/pg/v1/refund" + saltKey) + "###" + saltIndex
async function phonePeRefund({ cfg, transactionId, amount, userId }) {
  if (!cfg.merchantId || !cfg.saltKey) throw new Error('PhonePe: merchantId and saltKey required');
  if (!transactionId) throw new Error('PhonePe: transactionId (original merchantTransactionId) required');

  const refundTxnId = 'RF' + Date.now();   // unique refund transaction ID (≤38 chars)
  const amtPaise    = Math.round(Number(amount) * 100);
  const saltIndex   = String(cfg.saltIndex || '1');

  const payload = {
    merchantId:              cfg.merchantId,
    merchantUserId:          String(userId || 'ADMIN').replace(/[^a-zA-Z0-9]/g,'').slice(0,36) || 'ADMIN',
    originalTransactionId:   transactionId,   // original pay transaction
    merchantTransactionId:   refundTxnId,     // new unique refund txn ID
    amount:                  amtPaise,
    callbackUrl:             cfg.callbackUrl || '',
  };

  // Remove empty fields
  Object.keys(payload).forEach(k => !payload[k] && delete payload[k]);

  const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');
  const xVerify       = sha256Hex(base64Payload + '/pg/v1/refund' + cfg.saltKey) + '###' + saltIndex;

  const host = cfg.environment === 'production'
    ? 'https://api.phonepe.com/apis/hermes'
    : 'https://api-preprod.phonepe.com/apis/pg-sandbox';

  const res  = await fetch(`${host}/pg/v1/refund`, {
    method:  'POST',
    headers: { 'Content-Type':'application/json', 'X-VERIFY':xVerify, accept:'application/json' },
    body:    JSON.stringify({ request: base64Payload }),
  });
  const data = await res.json();

  // PAYMENT_PENDING is normal — refund is processing, not a failure
  if (!data.success && data.code !== 'PAYMENT_PENDING') {
    throw new Error(`PhonePe refund: [${data.code}] ${data.message || JSON.stringify(data.data||{})}`);
  }

  return {
    gateway:       'phonepe',
    refundId:      data.data?.transactionId || refundTxnId,
    merchantRefId: refundTxnId,
    status:        data.code === 'PAYMENT_SUCCESS' ? 'processed' : 'pending',
    amount,
    code:          data.code,
  };
}

// ── 3. PAYTM REFUND ───────────────────────────────────────────────────────────
// Docs: https://business.paytm.com/docs/api/refund-api/
// POST https://securegw.paytm.in/refund/apply
// body: { mid, txnType, orderId, txnId, refId, refundAmount }
// signature = HMAC-SHA256(JSON.stringify(body), merchantKey)
async function paytmRefund({ cfg, transactionId, orderId, amount }) {
  if (!cfg.merchantId || !cfg.merchantKey) throw new Error('Paytm: merchantId and merchantKey required');
  if (!transactionId) throw new Error('Paytm: transactionId (TXNID from payment response) required');
  if (!orderId)       throw new Error('Paytm: orderId required');

  const refId  = 'RF' + Date.now();
  const bodyObj = {
    mid:          cfg.merchantId,
    txnType:      'REFUND',
    orderId,
    txnId:        transactionId,
    refId,
    refundAmount: Number(amount).toFixed(2),
  };

  const signature = hmacSha256Hex(cfg.merchantKey, JSON.stringify(bodyObj));
  const env       = cfg.environment === 'production' ? 'securegw' : 'securegw-stage';

  const res  = await fetch(`https://${env}.paytm.in/refund/apply`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ body: bodyObj, head: { signature } }),
  });

  if (!res.ok) throw new Error(`Paytm refund HTTP ${res.status}: ${await res.text()}`);

  const data = await res.json();
  const body = data.body || {};

  if (body.resultInfo?.resultStatus === 'TXN_FAILURE') {
    throw new Error(`Paytm refund failed: ${body.resultInfo.resultMsg}`);
  }

  return {
    gateway:  'paytm',
    refundId: body.refundId || refId,
    refId,
    status:   body.resultInfo?.resultStatus === 'TXN_SUCCESS' ? 'processed' : 'pending',
    amount,
    txnId:    body.txnId,
  };
}

// ── 4. CCAVENUE REFUND ────────────────────────────────────────────────────────
// Docs: CCAvenue API v1.2 — command=refundOrder
// POST https://api.ccavenue.com/apis/servlet/DoWebTrans
// enc_request = AES-128-ECB(JSON { reference_no, refund_amount, refund_ref_no })
async function ccavenueRefund({ cfg, transactionId, amount }) {
  if (!cfg.merchantId || !cfg.accessCode || !cfg.workingKey) {
    throw new Error('CCAvenue: merchantId, accessCode and workingKey required');
  }
  if (!transactionId) throw new Error('CCAvenue: transactionId (CCAvenue reference_no / tracking_id) required');

  const keyBuf      = ccaKey(cfg.workingKey);
  const refundRefNo = 'RF' + Date.now();
  const payload     = JSON.stringify({
    reference_no:  transactionId,
    refund_amount: Number(amount).toFixed(2),
    refund_ref_no: refundRefNo,
  });
  const encRequest = ccaEncrypt(payload, keyBuf);

  const apiUrl = cfg.environment === 'production'
    ? 'https://api.ccavenue.com/apis/servlet/DoWebTrans'
    : 'https://apitest.ccavenue.com/apis/servlet/DoWebTrans';

  const body = new URLSearchParams({
    enc_request:   encRequest,
    access_code:   cfg.accessCode,
    request_type:  'JSON',
    response_type: 'JSON',
    command:       'refundOrder',
    version:       '1.2',
  }).toString();

  const res  = await fetch(apiUrl, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) throw new Error(`CCAvenue refund HTTP ${res.status}`);

  const text = await res.text();
  // Response format: "status=0&enc_response=xxxx" or plain error
  const params = Object.fromEntries(text.split('&').map(p => { const i=p.indexOf('='); return [p.slice(0,i), p.slice(i+1)]; }));

  if (params.status === '1') {
    throw new Error(`CCAvenue refund failed: ${params.enc_response || 'Unknown error'}`);
  }

  // Decrypt enc_response to get refund details
  const decrypted = params.enc_response ? ccaDecrypt(params.enc_response, keyBuf) : null;
  let refundData  = {};
  if (decrypted) {
    try { refundData = JSON.parse(decrypted); } catch {}
  }

  const result = refundData?.Refund_Order_Result || refundData;
  if (result?.refund_status === '1') {
    throw new Error(`CCAvenue refund rejected: ${result.reason || 'Unknown reason'}`);
  }

  return {
    gateway:        'ccavenue',
    refundId:       refundRefNo,
    status:         result?.refund_status === '0' ? 'processed' : 'pending',
    amount,
    referenceNo:    transactionId,
  };
}

// ── Unified refund dispatcher ─────────────────────────────────────────────────
async function processRefund({ gateway, cfg, transactionId, paymentRef, orderId, amount, userId, notes }) {
  if (!amount || amount <= 0) throw new Error('Refund amount must be greater than 0');
  const txnId = transactionId || paymentRef;

  switch (gateway) {
    case 'razorpay': return razorpayRefund ({ cfg, transactionId: txnId, amount, notes });
    case 'phonepe':  return phonePeRefund  ({ cfg, transactionId: txnId, amount, userId });
    case 'paytm':    return paytmRefund    ({ cfg, transactionId: txnId, orderId: orderId||txnId, amount });
    case 'ccavenue': return ccavenueRefund ({ cfg, transactionId: txnId, amount });
    default:
      throw new Error(`Cannot process refund automatically for gateway "${gateway}". Process it manually in your gateway dashboard.`);
  }
}

module.exports = { processRefund, razorpayRefund, phonePeRefund, paytmRefund, ccavenueRefund };
