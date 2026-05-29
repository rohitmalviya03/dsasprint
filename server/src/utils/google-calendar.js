import { randomUUID } from 'node:crypto';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3/calendars';

function calendarConfig() {
  return {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    refreshToken: process.env.GOOGLE_CALENDAR_REFRESH_TOKEN,
    calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
    timeZone: process.env.GOOGLE_CALENDAR_TIME_ZONE || 'Asia/Kolkata'
  };
}

export function isGoogleCalendarConfigured() {
  const config = calendarConfig();
  return [config.clientId, config.clientSecret, config.refreshToken].every((value) => value && !String(value).includes('your_'));
}

async function googleJson(response, fallbackMessage) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload.error_description || payload.error?.message || payload.error || fallbackMessage;
    throw new Error(message);
  }
  return payload;
}

async function getAccessToken() {
  const config = calendarConfig();
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
  const token = await googleJson(response, 'Unable to authorize Google Calendar.');
  return token.access_token;
}

function meetLinkFromEvent(event) {
  return event.hangoutLink
    || event.conferenceData?.entryPoints?.find((entry) => entry.entryPointType === 'video')?.uri
    || '';
}

export async function createInterviewCalendarEvent(interview) {
  if (!isGoogleCalendarConfigured()) {
    throw new Error('Google Calendar is not configured. Add a Meet link manually or configure GOOGLE_CALENDAR_REFRESH_TOKEN.');
  }
  const config = calendarConfig();
  const accessToken = await getAccessToken();
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
        'Scheduled from DSASprint admin console.'
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
  const event = await googleJson(response, 'Unable to create Google Calendar event.');
  const meetingLink = meetLinkFromEvent(event);
  if (!meetingLink) throw new Error('Google Calendar created the event, but no Meet link was returned.');
  return { eventId: event.id, meetingLink, htmlLink: event.htmlLink };
}
