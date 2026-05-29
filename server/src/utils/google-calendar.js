import { randomUUID } from 'node:crypto';
import { logger } from './logger.js';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';
const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3/calendars';

function calendarConfig(overrides = {}) {
  return {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    refreshToken: overrides.refreshToken || process.env.GOOGLE_CALENDAR_REFRESH_TOKEN,
    calendarId: overrides.calendarId || process.env.GOOGLE_CALENDAR_ID || 'primary',
    timeZone: overrides.timeZone || process.env.GOOGLE_CALENDAR_TIME_ZONE || 'Asia/Kolkata'
  };
}

export function isGoogleCalendarConfigured() {
  const config = calendarConfig();
  return [config.clientId, config.clientSecret, config.refreshToken].every((value) => value && !String(value).includes('your_'));
}

export function googleCalendarConfigStatus() {
  const config = calendarConfig();
  return {
    hasClientId: Boolean(config.clientId && !String(config.clientId).includes('your_')),
    hasClientSecret: Boolean(config.clientSecret && !String(config.clientSecret).includes('your_')),
    hasRefreshToken: Boolean(config.refreshToken && !String(config.refreshToken).includes('your_')),
    calendarId: config.calendarId,
    timeZone: config.timeZone,
    configured: isGoogleCalendarConfigured()
  };
}

async function googleJson(response, fallbackMessage, context = {}) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload.error_description || payload.error?.message || payload.error || fallbackMessage;
    logger.error('google_calendar_api_error', {
      ...context,
      statusCode: response.status,
      statusText: response.statusText,
      googleError: payload.error,
      googleErrorDescription: payload.error_description,
      googleErrorMessage: payload.error?.message
    });
    const error = new Error(message);
    error.statusCode = response.status >= 400 && response.status < 500 ? 400 : 502;
    throw error;
  }
  return payload;
}

async function getAccessToken(overrides = {}) {
  const config = calendarConfig(overrides);
  logger.info('google_calendar_token_request', googleCalendarConfigStatus());
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: 'refresh_token'
    })
  });
  const token = await googleJson(response, 'Unable to authorize Google Calendar.', { operation: 'token_refresh' });
  return token.access_token;
}

export function googleCalendarRedirectUri() {
  return process.env.GOOGLE_CALENDAR_CALLBACK_URL || `http://localhost:${process.env.PORT || 5000}/api/interviewer/google-calendar/callback`;
}

export function googleCalendarAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || '',
    redirect_uri: googleCalendarRedirectUri(),
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    scope: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email',
    state
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeCalendarCode(code) {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      code,
      redirect_uri: googleCalendarRedirectUri(),
      grant_type: 'authorization_code'
    })
  });
  const token = await googleJson(response, 'Unable to connect Google Calendar.', { operation: 'calendar_code_exchange' });
  if (!token.refresh_token) {
    const error = new Error('Google did not return a refresh token. Reconnect Calendar and approve offline access.');
    error.statusCode = 400;
    throw error;
  }
  const userInfoResponse = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${token.access_token}` }
  });
  const userInfo = await googleJson(userInfoResponse, 'Unable to read connected Google account.', { operation: 'calendar_userinfo' });
  return { refreshToken: token.refresh_token, email: userInfo.email };
}

function meetLinkFromEvent(event) {
  return event.hangoutLink
    || event.conferenceData?.entryPoints?.find((entry) => entry.entryPointType === 'video')?.uri
    || '';
}

export async function createInterviewCalendarEvent(interview, options = {}) {
  if (!options.refreshToken && !isGoogleCalendarConfigured()) {
    logger.warn('google_calendar_not_configured', googleCalendarConfigStatus());
    throw new Error('Google Calendar is not configured. Connect an interviewer Google Calendar before scheduling.');
  }
  const config = calendarConfig(options);
  const accessToken = await getAccessToken(options);
  const startsAt = new Date(interview.scheduled_at);
  const endsAt = new Date(startsAt.getTime() + Number(interview.duration_minutes) * 60 * 1000);
  const attendees = [
    { email: interview.user_email, displayName: interview.user_name },
    { email: interview.interviewer_email, displayName: interview.interviewer_name }
  ].filter((attendee) => attendee.email);
  const params = new URLSearchParams({
    conferenceDataVersion: '1',
    sendUpdates: 'all'
  });
  logger.info('google_calendar_event_create_request', {
    calendarId: config.calendarId,
    timeZone: config.timeZone,
    interviewId: interview.id,
    attendeeCount: attendees.length,
    startsAt: startsAt.toISOString(),
    durationMinutes: Number(interview.duration_minutes)
  });
  const response = await fetch(`${GOOGLE_CALENDAR_API}/${encodeURIComponent(config.calendarId)}/events?${params}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      summary: `DSASprint Mock Interview: ${interview.focus_area}`,
      description: [
        `Track: ${interview.interview_track}`,
        `Type: ${interview.interview_type}`,
        interview.notes ? `Candidate notes: ${interview.notes}` : '',
        'Scheduled from DSASprint interviewer workspace.'
      ].filter(Boolean).join('\n'),
      start: { dateTime: startsAt.toISOString(), timeZone: config.timeZone },
      end: { dateTime: endsAt.toISOString(), timeZone: config.timeZone },
      attendees,
      conferenceData: {
        createRequest: {
          requestId: `dsasprint-${interview.id}-${randomUUID()}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' }
        }
      }
    })
  });
  const event = await googleJson(response, 'Unable to create Google Calendar event.', { operation: 'event_insert', calendarId: config.calendarId, interviewId: interview.id });
  const meetingLink = meetLinkFromEvent(event);
  if (!meetingLink) throw new Error('Google Calendar created the event, but no Meet link was returned.');
  logger.info('google_calendar_event_created', { calendarId: config.calendarId, interviewId: interview.id, eventId: event.id, hasMeetingLink: Boolean(meetingLink) });
  return { eventId: event.id, meetingLink, htmlLink: event.htmlLink };
}
