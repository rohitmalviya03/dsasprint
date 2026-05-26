# DSASprint - DSA Practice Tracker

This version adds:
- Email/password signup and login
- Google Sign-In OAuth
- MySQL database storage
- User-wise progress/status/notes
- Revision due-date planning and due-today dashboard
- Live progress refresh across open sessions
- Account-linked product feedback submissions
- Contact number capture for locally registered accounts
- Guided problem breakdowns with core patterns, solving methods, key points, and common mistakes
- Mock interview preview for DSA or development practice with AI/person modes (coming soon)
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

The Mock Interviews screen is currently a coming-soon preview, so no production database migration is required yet. When scheduling is launched, enable its table with:

```txt
database/add_mock_interviews.sql
```

If mock interview scheduling was already enabled before DSA/development tracks and AI/person modes were added, run:

```txt
database/upgrade_mock_interview_options.sql
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
- `feedback`
- `mock_interviews`

Every user's status, notes, bookmarks, revision count, and last visited time are saved separately.
Revision due dates are stored in `problem_progress.revision_due_on`.


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
POST /api/auth/login
GET  /api/auth/google
GET  /api/auth/me
POST /api/auth/logout
GET  /api/progress
GET  /api/progress/events
PUT  /api/progress/:problemId
POST /api/progress/bulk-import
DELETE /api/progress/reset
POST /api/feedback
GET  /api/mock-interviews (preview state)
POST /api/mock-interviews (disabled until launch)
PATCH /api/mock-interviews/:id/cancel (disabled until launch)
```
