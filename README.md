# Harrison's Online Night Exam — Deployment Ready

**Exam window:** 20:00–20:30 Asia/Kabul  
**Questions:** 10 original Harrison-style internal-medicine MCQs  
**Time:** 25 seconds/question  
**Ranking:** central PostgreSQL ranking by correct answers, then completion time.

## What this version does
- Uses **server time**, not the participant's phone clock.
- Blocks the exam before 20:00 and after 20:30.
- Validates answers on the server.
- Stores attempts and answers centrally.
- Creates the PostgreSQL tables automatically on startup.
- Provides `/health` for deployment health checks.
- Includes `render.yaml` for Render deployment.

## Deploy on Render
Render supports Node/Express Web Services and managed Postgres. The normal deployment flow is to connect a Git repository, choose **New → Web Service**, and set the build command to `npm install` and start command to `npm start`.

### Easiest route
1. Put this folder in a GitHub repository.
2. In Render, choose **New → Blueprint** and select that repository.
3. Render reads `render.yaml` and creates the web service + database.
4. Deploy.
5. Share the resulting `https://...onrender.com` URL with participants.

The app's `render.yaml` already sets:
- `EXAM_TIMEZONE=Asia/Kabul`
- `EXAM_START=20:00`
- `EXAM_END=20:30`
- `QUESTION_SECONDS=25`
- `DATABASE_URL` from the managed Postgres database

## Important production note
The free Render resources are intended for testing/hobby use and have limitations. For a high-stakes recurring exam, use a suitable paid production database/service plan.

## Local test
```bash
npm install
DATABASE_URL="postgresql://..." npm start
```
Then open `http://localhost:3000`.

The questions are original Harrison-style questions and are not copied from Harrison's copyrighted text.
