# DSASprint - DSA Practice Tracker

This version adds:
- Email/password signup and login
- Google Sign-In OAuth
- MySQL database storage
- User-wise progress/status/notes
- Revision due-date planning and due-today dashboard
- Dashboard analytics with streaks, weekly activity, and weak-topic guidance
- Live progress refresh across open sessions
- Forgot-password recovery using expiring emailed reset links
- Account-linked product feedback submissions
- Contact number capture for locally registered accounts
- Guided problem breakdowns with core patterns, solving methods, key points, and common mistakes
- Admin console for registered users, problem publishing, study plans, and mock interview assignments
- Separate interviewer application and admin approval flow, interviewer workspaces, availability, Google Meet assignment, and feedback scorecards; AI mode is coming soon
- SEO metadata, structured data, sitemap, and crawler instructions for `https://dsasprint.in/`
- Export JSON, Import JSON, Reset Stats
- Study Plan → Learn-section problem focus

## Folder Structure

```txt
client/     Frontend app
server/     Node.js + Express API
database/   MySQL schema
docker-compose.yml optional local MySQL
```

## 1. Start MySQL

### Option A: Docker

```bash
docker compose up -d
```

Default database:

```txt
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=rootpassword
DB_NAME=dsa_learning_platform
```

### Option B: Existing MySQL

Run this file manually in MySQL Workbench/phpMyAdmin:

```txt
database/schema.sql
```

For an existing database created before revision planning was added, run:

```txt
database/add_revision_due_on.sql
```

To enable the Feedback tab for an existing database, run:

```txt
database/add_feedback.sql
```

To add contact numbers to existing user accounts, run:

```txt
database/add_contact_number.sql
```

To enable dashboard streak analytics and password recovery for an existing database, run this before deploying the related application update:

```txt
database/add_analytics_and_password_reset.sql
```

To enable the admin console, published problems, study plans, and person-led mock interview requests, run:

```txt
database/add_admin_panel.sql
```

If you already ran `database/add_mock_interviews.sql`, also run:

```txt
database/upgrade_existing_mock_interviews_for_admin.sql
```

If your existing `mock_interviews` table was created before the DSA/development and AI/person fields were added, run `database/upgrade_mock_interview_options.sql` before the admin upgrade script.

To enable registered interviewer accounts, availability slots, assignments, and scorecards after the admin migration, run:

```txt
database/add_interviewer_portal.sql
```

If `database/add_interviewer_portal.sql` was already applied before adding the public interviewer application flow, also run:

```txt
database/upgrade_interviewer_applications.sql
```

If the interviewer portal migration was already applied before slot-backed admin scheduling was added, also run:

```txt
database/upgrade_interview_scheduling_workflow.sql
```

## 2. Configure The App

```bash
copy server\.env.example server\.env
```

On Mac/Linux use:

```bash
cp server/.env.example server/.env
```

Edit `server/.env`:

```env
PORT=5000
CLIENT_URL=http://localhost:5173
JWT_SECRET=make_a_long_random_secret_here
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=rootpassword
DB_NAME=dsa_learning_platform
```

## 3. Start The Complete App

From the project root, run one command:

```bash
npm run dev
```

On first run, DSASprint installs the `client` and `server` dependencies automatically, then starts both services together.

Open:

```txt
http://localhost:5173
```

API health check:

```txt
http://localhost:5000/health
```

Optional commands:

```bash
npm run setup
npm run build
```

For a single-port production-style local run:

```bash
npm run build
npm start
```

Then open `http://localhost:5000`.

## Hostinger Node Deployment

Deploy from the repository root, not the `client` folder:

```txt
Root directory: .
Build command: npm run build
Package manager: npm
Output directory: client/dist
Entry file: server/src/server.js
Node version: 22.x
```

Add these environment variables in Hostinger:

```env
NODE_ENV=production
CLIENT_URL=https://your-domain.example
JWT_SECRET=your_long_random_secret
DB_HOST=your_mysql_host
DB_PORT=3306
DB_USER=your_mysql_user
DB_PASSWORD=your_mysql_password
DB_NAME=dsa_learning_platform
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=https://your-domain.example/api/auth/google/callback
GOOGLE_CALENDAR_REFRESH_TOKEN=your_google_calendar_refresh_token
GOOGLE_CALENDAR_ID=primary
GOOGLE_CALENDAR_TIME_ZONE=Asia/Kolkata
SMTP_HOST=your_smtp_host
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_smtp_username
SMTP_PASS=your_smtp_password
MAIL_FROM=DSASprint <help.dsasprint@outlook.com>
ADMIN_EMAILS=your_admin_login_email@dsasprint.in
```

Do not add `VITE_API_URL` in Hostinger when the frontend and API are deployed together on the same domain. Production builds always call the same deployed origin for `/api/...`.
Use the exact Hostinger URL for `CLIENT_URL`, for example:

```env
CLIENT_URL=https://powderblue-rhinoceros-970921.hostingersite.com
GOOGLE_CALLBACK_URL=https://powderblue-rhinoceros-970921.hostingersite.com/api/auth/google/callback
```

For the public DSASprint domain, keep the production app reachable at:

```txt
https://dsasprint.in/
https://dsasprint.in/robots.txt
https://dsasprint.in/sitemap.xml
```

After deployment, add `https://dsasprint.in/` in Google Search Console and submit:

```txt
https://dsasprint.in/sitemap.xml
```

## 4. Google Sign-In Setup

1. Go to Google Cloud Console.
2. Create OAuth Client ID.
3. Application type: Web application.
4. Authorized JavaScript origins:

```txt
http://localhost:5173
```

5. Authorized redirect URI:

```txt
http://localhost:5000/api/auth/google/callback
```

6. Put values in `server/.env`:

```env
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_CALLBACK_URL=http://localhost:5000/api/auth/google/callback
```

Restart backend.

## 4.1 Google Calendar Interview Scheduling

Admin scheduling can automatically create a Google Calendar event, invite the learner and interviewer, generate a Google Meet link, and save that link on the interview request. If these variables are not configured, admin can still paste a Meet link manually.

In Google Cloud Console, enable the Google Calendar API for the same OAuth project. Generate a refresh token for the Google account that should own the interview calendar using the Calendar event scope:

```txt
https://www.googleapis.com/auth/calendar.events
```

Add these values in `server/.env`:

```env
GOOGLE_CALENDAR_REFRESH_TOKEN=your_refresh_token
GOOGLE_CALENDAR_ID=primary
GOOGLE_CALENDAR_TIME_ZONE=Asia/Kolkata
```

Restart backend after changing `.env`. In Admin Console > Mock Interviews, choose an interviewer and set status to `Scheduled`; leave the Meet link field blank to auto-create the Calendar event.

## 5. Production Notes

For production deployment:
- Use HTTPS.
- Set `NODE_ENV=production`.
- Use strong `JWT_SECRET`.
- Use a managed MySQL provider.
- Set `CLIENT_URL` to your real frontend URL.
- Update Google OAuth redirect URI to your production backend callback.
- Keep `.env` private. Never upload it to GitHub.

## Main Database Tables

- `users`
- `problem_progress`
- `practice_activity`
- `password_reset_tokens`
- `feedback`
- `mock_interviews`
- `admin_problems`
- `study_plans`
- `study_plan_items`
- `interviewer_profiles`
- `interviewer_availability`
- `interview_feedback`

Every user's status, notes, bookmarks, revision count, and last visited time are saved separately.
Revision due dates are stored in `problem_progress.revision_due_on`.
Practice activity records power the streak and weekly analytics dashboard. Password reset tokens are hashed, single-use, and expire after 30 minutes.
Set `ADMIN_EMAILS` to one or more comma-separated registered account email addresses to expose the protected Admin Console. Interviewers use the **Apply as Interviewer** link on sign-in to create a pending account and profile. Admin reviews the application in **Admin Console > Interviewer Applications** and selects **Approve**; only then can the interviewer sign in and publish availability. When a learner requests a mock interview, admin selects an interviewer whose available slot covers that time and sets the request to **Scheduled**. If Google Calendar is configured, DSASprint creates a Calendar event with a Google Meet link automatically; otherwise admin can paste a Meet URL manually. The booked session appears immediately in the interviewer workspace, where the interviewer accepts or declines it and later shares a structured scorecard.


## CORS Setup

In `server/.env`, keep this line for local development:

```env
CLIENT_URL=http://localhost:5173
```

If you deploy frontend later, change it to your frontend URL. For multiple origins, use comma-separated values:

```env
CLIENT_URL=http://localhost:5173,https://your-frontend-domain.com
```

After changing `.env`, restart backend.

## Useful API Endpoints

```txt
POST /api/auth/signup
POST /api/auth/interviewer-signup
POST /api/auth/login
POST /api/auth/forgot-password
POST /api/auth/reset-password
GET  /api/auth/google
GET  /api/auth/me
POST /api/auth/logout
GET  /api/progress
GET  /api/progress/analytics
GET  /api/progress/events
PUT  /api/progress/:problemId
POST /api/progress/bulk-import
DELETE /api/progress/reset
POST /api/feedback
GET  /api/content/problems
GET  /api/content/study-plans
GET  /api/mock-interviews
POST /api/mock-interviews
PATCH /api/mock-interviews/:id/cancel
GET  /api/admin/overview
GET  /api/admin/users
POST /api/admin/problems
POST /api/admin/study-plans
GET  /api/admin/mock-interviews
PATCH /api/admin/mock-interviews/:id
GET  /api/admin/interviewers
PATCH /api/admin/interviewers/:id/status
GET  /api/interviewer/dashboard
PUT  /api/interviewer/profile
POST /api/interviewer/availability
DELETE /api/interviewer/availability/:id
PATCH /api/interviewer/interviews/:id/respond
PUT  /api/interviewer/interviews/:id/feedback
```
