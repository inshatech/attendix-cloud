'use strict';
const https = require('https');
const { Plugin } = require('../models/Plugin');
const Holiday    = require('../models/Holiday');
const { v4: uuidv4 } = require('uuid');

/**
 * Fetch events from a Google Calendar using the public API.
 * Requires: Google Calendar API key with Calendar API enabled.
 * The Indian holidays calendar is publicly accessible.
 */
function fetchGoogleCalendarEvents(apiKey, calendarId, timeMin, timeMax) {
  return new Promise((resolve, reject) => {
    const encodedId = encodeURIComponent(calendarId);
    const params = new URLSearchParams({
      key:          apiKey,
      timeMin:      timeMin,
      timeMax:      timeMax,
      singleEvents: 'true',
      orderBy:      'startTime',
      maxResults:   '250',
    });
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodedId}/events?${params}`;
    const urlObj = new URL(url);

    const req = https.request({
      hostname: urlObj.hostname,
      path:     urlObj.pathname + urlObj.search,
      method:   'GET',
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) return reject(new Error(json.error.message || 'Google Calendar API error'));
          resolve(json.items || []);
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

/**
 * Sync holidays from Google Calendar into the Holiday collection for an org.
 *
 * @param {string} orgId
 * @param {number} monthsAhead - how many months to sync (default 3)
 * @returns {{ synced: number, skipped: number, errors: string[] }}
 */
async function syncHolidays(orgId, monthsAhead = 3) {
  const plugin = await Plugin.findOne({ name: 'google_calendar', enabled: true }).lean();
  if (!plugin) throw new Error('Google Calendar plugin is not enabled. Enable it in Admin → Plugins.');

  const { apiKey, calendarId, orgCalendarId } = plugin.config || {};
  if (!apiKey) throw new Error('Google Calendar API key not configured.');

  const calIds = [
    calendarId || 'en.indian#holiday@group.v.calendar.google.com',
  ];
  if (orgCalendarId) calIds.push(orgCalendarId);

  const now    = new Date();
  const timeMin = now.toISOString();
  const timeMax = new Date(now.getFullYear(), now.getMonth() + monthsAhead, 1).toISOString();

  let synced = 0, skipped = 0;
  const errors = [];

  for (const calId of calIds) {
    try {
      const events = await fetchGoogleCalendarEvents(apiKey, calId, timeMin, timeMax);

      for (const event of events) {
        // All-day events have start.date, timed events have start.dateTime
        const date = event.start?.date || event.start?.dateTime?.slice(0, 10);
        if (!date) continue;

        const name = event.summary || 'Holiday';

        try {
          await Holiday.findOneAndUpdate(
            { orgId, googleId: event.id },
            {
              $set: {
                date, name,
                description: event.description || null,
                type:     'public',
                source:   'google',
                isActive: true,
              },
              $setOnInsert: {
                holidayId: `hol-${uuidv4().split('-')[0]}`,
                orgId,
                googleId: event.id,
                createdBy: 'system',
              },
            },
            { upsert: true }
          );
          synced++;
        } catch (e) {
          skipped++;
          errors.push(`${date} ${name}: ${e.message}`);
        }
      }
    } catch (e) {
      errors.push(`Calendar ${calId}: ${e.message}`);
    }
  }

  return { synced, skipped, errors };
}

/**
 * Get all holidays for an org in a date range.
 * Returns a Set of date strings "YYYY-MM-DD" for fast lookup.
 */
async function getHolidaySet(orgId, startDate, endDate) {
  const holidays = await Holiday.find({
    orgId,
    isActive: true,
    date: { $gte: startDate, $lte: endDate },
  }).select('date').lean();
  return new Set(holidays.map(h => h.date));
}

module.exports = { syncHolidays, getHolidaySet, fetchGoogleCalendarEvents };
