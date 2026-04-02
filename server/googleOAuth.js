'use strict';

/**
 * auth/googleOAuth.js
 * ────────────────────
 * Google OAuth 2.0 login via passport-google-oauth20.
 *
 * Flow:
 *   GET  /auth/google              → redirect to Google consent screen
 *   GET  /auth/google/callback     → Google redirects back here
 *                                    → if user exists: issue JWT pair, redirect to dashboard
 *                                    → if new user: redirect to /auth/google/no-account
 *
 * Setup in Google Cloud Console:
 *   1. APIs & Services → Credentials → Create OAuth 2.0 Client ID
 *   2. Authorised redirect URI: https://yourdomain.com/auth/google/callback
 *   3. Copy Client ID + Secret into .env as GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
 *
 * Env variables:
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 *   GOOGLE_CALLBACK_URL     default: http://localhost:8000/auth/google/callback
 *   FRONTEND_URL            default: http://localhost:3000  (redirect destination)
 *
 * Self-registration policy:
 *   By default, only pre-existing AuthUser accounts can log in via Google
 *   (matching on email). An admin must create the account first.
 *   Set GOOGLE_ALLOW_SIGNUP=true to auto-create 'user'-role accounts on first login.
 */

const passport = require('passport');
const { Strategy: GoogleStrategy } = require('passport-google-oauth20');
const { v4: uuidv4 } = require('uuid');

const AuthUser = require('../models/AuthUser');
const { signAccessToken, signRefreshToken, hashToken } = require('./helpers');

// ── Passport session stubs (we use JWT, not sessions — these are no-ops) ─────
passport.serializeUser((user, done) => done(null, user.userId));
passport.deserializeUser(async (id, done) => {
    try { done(null, await AuthUser.findOne({ userId: id }).lean()); }
    catch (e) { done(e); }
});

// ── Google Strategy ───────────────────────────────────────────────────────────
function initGoogleOAuth(app) {
    const {
        GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET,
        GOOGLE_CALLBACK_URL = 'http://localhost:8000/auth/google/callback',
        GOOGLE_ALLOW_SIGNUP = 'false',
        FRONTEND_URL = 'http://localhost:3000',
    } = process.env;

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
        console.warn('[auth] Google OAuth disabled — set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET');
        return;
    }

    passport.use(new GoogleStrategy(
        {
            clientID: GOOGLE_CLIENT_ID,
            clientSecret: GOOGLE_CLIENT_SECRET,
            callbackURL: GOOGLE_CALLBACK_URL,
            scope: ['profile', 'email'],
        },
        async (accessToken, refreshToken, profile, done) => {
            try {
                const email = profile.emails?.[0]?.value?.toLowerCase();
                if (!email) return done(new Error('Google account has no email'));

                // Try to find existing account by email
                let user = await AuthUser.findOne({ email });

                if (!user) {
                    if (GOOGLE_ALLOW_SIGNUP !== 'true') {
                        // Account must be pre-created by admin
                        return done(null, false, { message: 'no_account' });
                    }

                    // Auto-create a user-role account
                    user = await AuthUser.create({
                        userId: `usr-${uuidv4().split('-')[0]}`,
                        name: profile.displayName || email.split('@')[0],
                        email,
                        role: 'user',
                        isActive: true,
                        emailVerified: true,
                        passwordHash: null,     // OAuth-only, no password
                        googleId: profile.id,
                        allowedBridges: [],
                        modules: [],
                        createdBy: 'google-oauth',
                    });
                    console.log(`[auth] Google OAuth: auto-created account for ${email}`);
                }

                if (!user.isActive) return done(null, false, { message: 'account_inactive' });

                // Store Google ID for future matching (idempotent)
                if (!user.googleId) {
                    await AuthUser.updateOne({ userId: user.userId }, { $set: { googleId: profile.id } });
                }

                return done(null, user);
            } catch (e) {
                return done(e);
            }
        }
    ));

    app.use(passport.initialize());

    // ── Routes ────────────────────────────────────────────────────────────────

    // Start OAuth flow
    app.get('/auth/google',
        passport.authenticate('google', { scope: ['profile', 'email'], session: false })
    );

    // Callback from Google
    app.get('/auth/google/callback',
        passport.authenticate('google', { session: false, failWithError: true }),
        async (req, res) => {
            try {
                const user = req.user;
                if (!user) return res.redirect(`${FRONTEND_URL}/login?error=no_account`);

                // Issue JWT pair
                const payload = {
                    userId: user.userId,
                    role: user.role,
                    name: user.name,
                    allowedBridges: user.allowedBridges || [],
                    modules: (user.modules || []).map(m => ({ name: m.name, enabled: m.enabled })),
                };
                const accessToken = signAccessToken(payload);
                const { token: refreshTok, hash, expiresAt } = signRefreshToken({ userId: user.userId });

                // Persist refresh token
                const cleanTokens = (user.refreshTokens || [])
                    .filter(t => t.expiresAt > new Date())
                    .slice(-9);
                cleanTokens.push({
                    tokenHash: hash,
                    device: 'google-oauth',
                    createdAt: new Date(),
                    expiresAt,
                });

                await AuthUser.updateOne({ userId: user.userId }, {
                    $set: {
                        refreshTokens: cleanTokens,
                        lastLoginAt: new Date(),
                        lastLoginIp: req.ip,
                        loginAttempts: 0,
                    }
                });

                // Redirect to frontend with tokens in query params
                // In production: use HttpOnly cookies or a short-lived code exchange instead
                const params = new URLSearchParams({
                    accessToken,
                    refreshToken: refreshTok,
                    role: user.role,
                    name: user.name,
                });
                res.redirect(`${FRONTEND_URL}/auth/callback?${params}`);
            } catch (e) {
                console.error('[auth] Google callback error:', e.message);
                res.redirect(`${FRONTEND_URL}/login?error=server_error`);
            }
        },
        // Error handler (passport failWithError)
        (err, req, res, next) => {
            console.error('[auth] Google OAuth error:', err.message);
            const msg = err.message === 'no_account' ? 'no_account' : 'oauth_error';
            res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/login?error=${msg}`);
        }
    );

    // Info endpoint — check if Google OAuth is configured
    app.get('/auth/google/status', (req, res) => {
        res.json({
            enabled: true,
            allowSignup: GOOGLE_ALLOW_SIGNUP === 'true',
        });
    });

    console.log('[auth] Google OAuth 2.0 initialized');
}

module.exports = { initGoogleOAuth };
