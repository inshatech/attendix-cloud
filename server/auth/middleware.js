'use strict';
const { verifyAccessToken } = require('./helpers');

async function requireAuth(req, res, next) {
  try {
    // Accept token from header OR query param (needed for EventSource/SSE)
    const raw = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || (req.query.token || '');
    if (!raw) return res.status(401).json({ error: 'Authentication required' });
    const payload = verifyAccessToken(raw);
    if (!payload) return res.status(401).json({ error: 'Token expired or invalid' });
    req.authUser = { userId:payload.userId, role:payload.role, name:payload.name, allowedBridges:payload.allowedBridges||[], modules:payload.modules||[] };
    next();
  } catch { res.status(500).json({ error: 'Auth error' }); }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.authUser) return res.status(401).json({ error: 'Not authenticated' });
    if (!roles.includes(req.authUser.role)) return res.status(403).json({ error: `Access denied. Required: ${roles.join(' or ')}` });
    next();
  };
}

function requireBridgeAccess(req, res, next) {
  if (!req.authUser) return res.status(401).json({ error: 'Not authenticated' });
  if (req.authUser.role === 'admin') return next();
  const bridgeId = req.params.bridgeId;
  if (!bridgeId) return next();
  const allowed = req.authUser.allowedBridges || [];
  if (!allowed.length) return res.status(403).json({ error: 'No bridges assigned to your account' });
  if (!allowed.includes(bridgeId)) return res.status(403).json({ error: `Access denied to bridge '${bridgeId}'` });
  next();
}

async function requireSubscription(req, res, next) {
  if (!req.authUser) return res.status(401).json({ error: 'Not authenticated' });
  if (req.authUser.role === 'admin') return next();
  try {
    const { getActiveSubscription } = require('../services/subscriptionService');
    const result = await getActiveSubscription(req.authUser.userId);
    if (!result) return res.status(402).json({ error: 'No active subscription', code: 'NO_SUBSCRIPTION' });
    req.subscription = result;
    next();
  } catch (e) { res.status(500).json({ error: e.message }); }
}

module.exports = { requireAuth, requireRole, requireBridgeAccess, requireSubscription };
