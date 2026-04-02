'use strict';
const express   = require('express');
const router    = express.Router();
const { v4: uuidv4 } = require('uuid');
const mongoose  = require('mongoose');
const axios     = require('axios');
const { requireAuth } = require('../auth/middleware');
const { generalApiLimiter } = require('../auth/rateLimits');
const Organization   = require('../models/Organization');
const { Plugin }     = require('../models/Plugin');

// ── Holiday schema ────────────────────────────────────────────────────────────
const HolidaySchema = new mongoose.Schema({
  holidayId:   { type:String, unique:true },
  orgId:       { type:String, required:true, index:true },
  name:        { type:String, required:true },
  date:        { type:String, required:true },   // YYYY-MM-DD
  year:        { type:Number, required:true, index:true },
  type:        { type:String, enum:['national','regional','custom'], default:'custom' },
  optional:    { type:Boolean, default:false },
  description: { type:String, default:'' },
  source:      { type:String, default:'manual' }, // 'manual' | 'google' | 'import'
}, { timestamps:true });

const Holiday = mongoose.models.Holiday || mongoose.model('Holiday', HolidaySchema);

// ── Helper — same pattern as attendance.js ────────────────────────────────────
async function getOrg(orgId, userId, role) {
  if (['admin','support'].includes(role)) return Organization.findOne({ orgId }).lean();
  return Organization.findOne({ orgId, ownerId: userId }).lean();
}

// ── Google Calendar fetcher ───────────────────────────────────────────────────
// Uses the public Google Calendar API v3 — requires API key only (no OAuth)
async function fetchGoogleCalendar({ apiKey, calendarId, year }) {
  const timeMin = `${year}-01-01T00:00:00Z`;
  const timeMax = `${year}-12-31T23:59:59Z`;

  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
  const { data } = await axios.get(url, {
    params: {
      key:          apiKey,
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy:      'startTime',
      maxResults:   250,
    },
    timeout: 10000,
  });

  return (data.items || []).map(ev => {
    // Google returns date (all-day) or dateTime
    const rawDate = ev.start?.date || ev.start?.dateTime?.slice(0,10);
    return {
      name:   ev.summary || 'Holiday',
      date:   rawDate,
      source: 'google',
    };
  }).filter(h => h.date);
}

// ── Classify holiday type from name ──────────────────────────────────────────
function classifyType(name) {
  const n = name.toLowerCase();
  // Gazetted national
  const national = ['republic day','independence day','gandhi jayanti','ambedkar jayanti',
    'good friday','christmas','diwali','deepavali','holi','eid','muharram','milad',
    'guru nanak','mahavir jayanti','buddha purnima','janmashtami','dussehra','vijayadashami',
    'raksha bandhan','labour day','new year'];
  if (national.some(k => n.includes(k))) return 'national';
  // Widely observed regional
  const regional = ['pongal','sankranti','baisakhi','vishu','onam','ganesh','navratri',
    'durga','ugadi','gudi padwa','vasant','shivratri','guru gobind','chhath','dhanteras',
    'govardhan','bhai dooj','guru purnima','holika'];
  if (regional.some(k => n.includes(k))) return 'regional';
  return 'custom';
}

router.use(requireAuth, generalApiLimiter);

// ── GET all holidays for a year ───────────────────────────────────────────────
router.get('/organizations/:orgId/holidays', async (req, res) => {
  try {
    const org = await getOrg(req.params.orgId, req.authUser.userId, req.authUser.role);
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    const year = +(req.query.year || new Date().getFullYear());
    const holidays = await Holiday.find({ orgId: req.params.orgId, year }).sort({ date:1 }).lean();
    res.json({ status:'success', data: holidays });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── POST add a holiday manually ───────────────────────────────────────────────
router.post('/organizations/:orgId/holidays', async (req, res) => {
  try {
    const org = await getOrg(req.params.orgId, req.authUser.userId, req.authUser.role);
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    const { name, date, type, optional, description } = req.body;
    if (!name || !date) return res.status(400).json({ error: 'name and date required' });
    const year = new Date(date).getFullYear();
    const holiday = await Holiday.create({
      holidayId:   `hol-${uuidv4().split('-')[0]}`,
      orgId:       req.params.orgId,
      name, date, year,
      type:        type        || 'custom',
      optional:    optional    || false,
      description: description || '',
      source:      'manual',
    });
    res.status(201).json({ status:'success', data: holiday });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── POST sync from Google Calendar (real-time fetch) — BEFORE /:holidayId ────
router.post('/organizations/:orgId/holidays/sync', async (req, res) => {
  try {
    const org = await getOrg(req.params.orgId, req.authUser.userId, req.authUser.role);
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    // Load Google Calendar plugin config
    const plug = await Plugin.findOne({ name: 'google_calendar' }).lean();
    const apiKey     = plug?.config?.apiKey     || process.env.GOOGLE_CALENDAR_API_KEY || '';
    const calendarId = req.body.calendarId
      || plug?.config?.calendarId
      || 'en.indian#holiday@group.v.calendar.google.com';
    const orgCalId   = plug?.config?.orgCalendarId || '';

    if (!apiKey) {
      return res.status(503).json({
        error: 'Google Calendar API key not configured. Go to Admin → Plugins → Google Calendar and enter your API key.',
        setupRequired: true,
      });
    }

    const year = +(req.body.year || new Date().getFullYear());

    // Fetch from one or two calendars
    const calendarPromises = [fetchGoogleCalendar({ apiKey, calendarId, year })];
    if (orgCalId) calendarPromises.push(fetchGoogleCalendar({ apiKey, calendarId: orgCalId, year }));

    const results  = await Promise.allSettled(calendarPromises);
    const events   = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
    const failed   = results.filter(r => r.status === 'rejected').map(r => r.reason?.message);

    if (events.length === 0 && failed.length > 0) {
      return res.status(502).json({ error: `Google Calendar fetch failed: ${failed[0]}` });
    }

    // Upsert holidays — skip duplicates by date+name
    let imported = 0, skipped = 0;
    for (const ev of events) {
      if (!ev.date || !ev.name) { skipped++; continue; }
      const evYear = new Date(ev.date + 'T12:00:00').getFullYear();
      if (evYear !== year) { skipped++; continue; }

      const exists = await Holiday.findOne({ orgId: req.params.orgId, date: ev.date, name: ev.name }).lean();
      if (exists) { skipped++; continue; }

      await Holiday.create({
        holidayId:   `hol-${uuidv4().split('-')[0]}`,
        orgId:       req.params.orgId,
        name:        ev.name,
        date:        ev.date,
        year,
        type:        classifyType(ev.name),
        optional:    false,
        description: '',
        source:      'google',
      });
      imported++;
    }

    res.json({
      status:   'success',
      imported,
      skipped,
      year,
      calendarId,
      message:  `Synced ${imported} holidays from Google Calendar for ${year}${skipped ? ` (${skipped} already existed or skipped)` : ''}`,
      warnings: failed.length ? failed : undefined,
    });
  } catch(e) {
    // Give a clear error for common Google API errors
    const msg = e.response?.data?.error?.message || e.message;
    const status = e.response?.status || 500;
    res.status(status >= 400 && status < 500 ? status : 500).json({ error: msg });
  }
});

// ── POST check / test Google Calendar config ──────────────────────────────────
router.post('/organizations/:orgId/holidays/test-calendar', async (req, res) => {
  try {
    const org = await getOrg(req.params.orgId, req.authUser.userId, req.authUser.role);
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    const plug = await Plugin.findOne({ name: 'google_calendar' }).lean();
    const apiKey     = plug?.config?.apiKey     || process.env.GOOGLE_CALENDAR_API_KEY || '';
    const calendarId = plug?.config?.calendarId || 'en.indian#holiday@group.v.calendar.google.com';

    if (!apiKey) {
      return res.json({ ok:false, configured:false, message:'No API key configured.' });
    }

    // Fetch just 3 events to test
    const year = new Date().getFullYear();
    const url  = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
    const { data } = await axios.get(url, {
      params: { key: apiKey, timeMin:`${year}-01-01T00:00:00Z`, timeMax:`${year}-12-31T23:59:59Z`,
                singleEvents:true, orderBy:'startTime', maxResults:3 },
      timeout: 8000,
    });
    const count = data.items?.length || 0;
    res.json({ ok:true, configured:true, message:`Connection successful. Found ${count} events (showing max 3).`, sample: data.items?.map(e => e.summary) });
  } catch(e) {
    const msg = e.response?.data?.error?.message || e.message;
    res.json({ ok:false, configured:true, message:`API error: ${msg}` });
  }
});

// ── PATCH update a holiday — AFTER fixed routes ───────────────────────────────
router.patch('/organizations/:orgId/holidays/:holidayId', async (req, res) => {
  try {
    const org = await getOrg(req.params.orgId, req.authUser.userId, req.authUser.role);
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    const { name, date, type, optional, description } = req.body;
    const update = {};
    if (name        !== undefined) update.name        = name;
    if (date        !== undefined) { update.date = date; update.year = new Date(date).getFullYear(); }
    if (type        !== undefined) update.type        = type;
    if (optional    !== undefined) update.optional    = optional;
    if (description !== undefined) update.description = description;
    const holiday = await Holiday.findOneAndUpdate(
      { holidayId: req.params.holidayId, orgId: req.params.orgId },
      { $set: update }, { new:true }
    );
    if (!holiday) return res.status(404).json({ error: 'Holiday not found' });
    res.json({ status:'success', data: holiday });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── DELETE a holiday ──────────────────────────────────────────────────────────
router.delete('/organizations/:orgId/holidays/:holidayId', async (req, res) => {
  try {
    const org = await getOrg(req.params.orgId, req.authUser.userId, req.authUser.role);
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    await Holiday.deleteOne({ holidayId: req.params.holidayId, orgId: req.params.orgId });
    res.json({ status:'success' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── DELETE all holidays for a year (bulk clear before re-sync) ────────────────
router.delete('/organizations/:orgId/holidays', async (req, res) => {
  try {
    const org = await getOrg(req.params.orgId, req.authUser.userId, req.authUser.role);
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    const year = +(req.query.year);
    if (!year) return res.status(400).json({ error: 'year query param required' });
    const r = await Holiday.deleteMany({ orgId: req.params.orgId, year });
    res.json({ status:'success', deleted: r.deletedCount, year });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
