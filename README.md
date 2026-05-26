# DSA Learning Platform — Production MySQL Version

This version adds:
- Email/password signup and login
- Google Sign-In OAuth
- MySQL database storage
- User-wise progress/status/notes
- Revision due-date planning and due-today dashboard
- Live progress refresh across open sessions
- Account-linked product feedback submissions
- Contact number capture for locally registered accounts
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

## 2. Start Backend

```bash
cd server
npm install
copy .env.example .env
```

On Mac/Linux use:

```bash
cp .env.example .env
```

Edit `.env`:

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

Run:

```bash
npm run dev
```

Check API:

```txt
http://localhost:5000/health
```

## 3. Start Frontend

Open a new terminal:

```bash
cd client
npm install
npm run dev
```

Open:

```txt
http://localhost:5173
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
```
