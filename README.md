# OBD Calling Platform

A fresh, standalone project with three features:
- **Text to Speech** — convert text into speech in any/all of 11 Indian languages at once (checkbox selection), powered by Sarvam AI. Every language is saved as `<language>.mp3` (e.g. `hindi.mp3`) both on disk and in MongoDB, and is downloadable.
- **Speech to Text** — upload audio and get a transcript (Sarvam AI, Saaras v3).
- **OBD Campaigns** — upload a contact sheet + a voice message, auto-dial every contact via Sarv's Voice Broadcast API, and track status (polled from Sarv's Fetch Voice Report API). Includes an insights dashboard (total calls, success rate, recent activity) styled after the reference design.

## Project Structure
```
obd-suite/
├── backend/     FastAPI + MongoDB + Sarvam AI + Twilio
└── frontend/    React + Vite (light theme dashboard)
```
Frontend, backend, and database are fully separate — the frontend only talks to the backend over HTTP, and the backend is the only thing that talks to MongoDB.

## 1. Prerequisites
- Python 3.10+
- Node.js 18+
- **MongoDB** running somewhere reachable — either:
  - Local: install MongoDB Community Server and run `mongod` ([mongodb.com/try/download/community](https://www.mongodb.com/try/download/community)), default URI `mongodb://localhost:27017`
  - Or free cloud option: [MongoDB Atlas](https://www.mongodb.com/cloud/atlas/register) — create a free cluster and copy its connection string
- A [Sarvam AI](https://dashboard.sarvam.ai) API key
- A [Sarv](https://console.sarv.com) account (only needed for OBD Campaigns): username, API token, a Voice Broadcast plan_id, and an approved caller_id
- **Your server's public IP whitelisted in the Sarv panel** — every Sarv API call fails with error code `003` until this is done. If you're testing from your own PC, whitelist your current public IP (it may change); for production, deploy somewhere with a static IP.
- [ngrok](https://ngrok.com/download) (only needed for OBD Campaigns, so Sarv's servers can fetch your generated audio file over a public URL — same reason it was needed for Twilio)

**All audio now lives in MongoDB, not on local disk.** Every generated TTS voice and every uploaded campaign audio file is stored as binary data directly inside its MongoDB document, and is streamed back out in real time whenever it's played, downloaded, or dialed by Twilio. Nothing is written to the server's filesystem — so this works the same whether you run it on your own PC or deploy it to any server, and moving/redeploying the backend never loses audio.

## 2. Backend Setup

```bash
cd backend
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
```

Edit `backend/.env`:
```
SARVAM_API_KEY=your_sarvam_key
MONGODB_URI=mongodb://localhost:27017      # or your Atlas connection string
MONGODB_DB=obd_suite
SARV_USER_ID=your_sarv_user_id
SARV_USER_TOKEN=your_sarv_user_token
SARV_PLAN_ID=your_sarv_voice_plan_id
SARV_PLAN_TYPE=C
SARV_INCLUDES_COUNTRY_CODE=N                # Y if your contact numbers already include "91"
PUBLIC_BASE_URL=                            # fill in Step 4, only needed for OBD Campaigns
```

Run it:
```bash
uvicorn main:app --reload --port 8000
```
Check `http://localhost:8000/health` — it should report `{"status":"ok","mongodb_connected":true}`.
If `mongodb_connected` is `false`, MongoDB isn't reachable — double check `MONGODB_URI` and that `mongod` is running (or your Atlas cluster allows your IP).

## 3. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:5173`.

## 4. (Only for OBD Campaigns) Expose the backend with ngrok

```bash
ngrok http 8000
```
Copy the `https://...ngrok-free.app` URL it gives you into `backend/.env` as `PUBLIC_BASE_URL`, then **restart the backend** (env changes require a restart, `--reload` only watches code changes).

This URL is where your generated/uploaded audio lives (`/api/tts/download/...` and `/api/campaigns/{id}/audio`). Sarv fetches it once per recording (via the Upload Announcement API) — separately, your **outbound** IP must also be whitelisted in the Sarv panel, or every API call fails with error `003`.

## How Text-to-Speech Works
1. Type your text.
2. Check every language you want it converted into.
3. Click "Generate speech in N languages" — the backend calls Sarvam AI once per selected language.
4. Each language's audio is stored as binary data directly inside its MongoDB document (`tts_audio` collection), alongside its metadata (language, filename, text, timestamp) — generating the same language again simply overwrites that language's document. Nothing touches local disk.
5. Every result gets an inline player and a download button, both of which stream the audio live from MongoDB — and everything ever generated stays listed in the "Generated Library" panel.

## How OBD Campaign Contact Sheets Work

Your contact Excel/CSV can include an optional **Language** column (e.g. "Hindi", "Bengali"):

| Phone Number | Name | Language |
|---|---|---|
| 9876543210 | Ravi | Hindi |
| 9812345678 | Priya | Bengali |

When the campaign starts, for **each contact**:
- The system looks up that contact's language among everything already generated in the **Text-to-Speech Studio** (e.g. "Hindi" → `hindi.mp3`).
- If a matching recording exists, that number is called and hears that language's recording.
- If the language is missing, misspelled, or was never generated in the Studio, **that number is never called** — it's marked in the Excel report as `Skipped — Language Mismatch`, with the Error column explaining exactly why (e.g. *"File name mismatch with details — no saved recording found for 'Bengali' (bengali.mp3)"*).
- If a row has no Language value at all, it falls back to the campaign's own default audio (Step 1 on the campaign page) — if no default audio is set either, the campaign won't start until you add one or fill in every contact's language.

So: generate the languages you need in the Text-to-Speech Studio first, then upload a contact sheet tagging each number with the matching language.

## How Calling Actually Works via Sarv (under the hood)
This uses Sarv's **vb-api v2 `/broadcasting`** endpoint (confirmed against a real working request), which is simpler than Sarv's older announcement-based API — no separate "upload audio" step needed:
1. Contacts are grouped by which recording they should hear (their matched language, or the campaign default).
2. For each group, the backend calls `GET https://console.sarv.com/vb-api/v2/broadcasting` directly with `audio_url` pointing at the same MongoDB-streaming URL used before, plus a JSON `contacts` array of that group's numbers (in batches — see `SARV_MAX_CONTACTS_PER_REQUEST` in `.env`, default 100; Sarv's real per-request limit for this endpoint isn't publicly documented, so adjust if you hit errors), plus a `callback_url` pointing back at this backend.
3. Each contact's `uniqueId` (from the response) is saved against its call log.
4. Sarv pushes status updates to `POST /api/campaigns/webhooks/sarv-status` as calls progress. **The exact payload shape hasn't been confirmed yet** — the route logs the raw body on every hit, so after your first real test campaign, check the backend logs for a line like `Sarv callback received: {...}` and tell me what it looks like so the field-name guesses (`uniqueId`/`status`/`duration`) in that route and in `sarv_client.py::map_sarv_status` can be tightened to match exactly.

## A Note on Audio Storage Limits
Since audio is stored as binary data inside a single MongoDB document, each individual recording is capped by MongoDB's 16MB-per-document limit — comfortably enough for typical voice-message-length content (several minutes of MP3 audio at 128kbps), but not suited to very long recordings (e.g. hour-long narrations). If you ever need audio longer than that, MongoDB's GridFS (for storing larger files split across chunks) would be the next step — let me know if you'd like that added.

## Common Issues
| Problem | Fix |
|---|---|
| `mongodb_connected: false` on `/health` | MongoDB isn't running or `MONGODB_URI` is wrong |
| "SARVAM_API_KEY is not configured" | Fill it into `backend/.env`, restart the backend |
| OBD calls don't trigger | Double-check `SARV_USER_ID` / `SARV_USER_TOKEN` / `SARV_PLAN_ID` in `.env` |
| Call connects but no audio | Confirm `PUBLIC_BASE_URL` matches your current ngrok URL and the backend was restarted after changing `.env` (Sarv fetches `audio_url` fresh on every call, no re-upload step needed) |
| Status stays stuck on "initiated" forever | The Sarv callback (`/api/campaigns/webhooks/sarv-status`) needs `PUBLIC_BASE_URL` set and reachable; check backend logs for `"Sarv callback received: ..."` to see the raw payload Sarv actually sends, and adjust field names in that route if needed |
