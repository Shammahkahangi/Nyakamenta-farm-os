# Coffee Estate OS — Mobile (Expo)

The mobile app lives at `Coffee management system/coffee-estate-mobile/` (sibling `d:\Loan-softwares\coffee-estate-mobile` if your environment allows creating it at repo root).

## One database (important)

Mobile does **not** have its own database. It uses the **same SQLite file** as the estate API server:

| Client | How it reaches data |
|--------|---------------------|
| **Mobile (Expo)** | HTTP → `npm run web` → `data/estate.db` |
| **Browser (web)** | HTTP → `npm run web` → `data/estate.db` |
| **Desktop (Electron)** | Direct SQLite → `data/estate.db` (same folder as `npm run web`; override with `ESTATE_DATA_DIR` in `.env`) |

As long as the phone’s `EXPO_PUBLIC_ESTATE_API_URL` points at the machine running `npm run web`, mobile and desktop see the **same blocks, loans, logbook, SACCO, lodge**, etc.

Optional cloud sync: **Settings → Sync with Supabase** pushes/pulls via the same `/api/sync` endpoint on that server.

## Server requirements

1. Run the estate API: `npm run web` from `Coffee management system/`.
2. Server binds to `0.0.0.0` by default (`ESTATE_BIND_HOST` to override).
3. CORS is enabled for mobile and browser clients.
4. Phones must reach the PC/server IP on the same network (or use HTTPS in production).

## Environment

Copy `coffee-estate-mobile/.env.example` to `.env` and set:

- `EXPO_PUBLIC_ESTATE_API_URL` — e.g. `http://192.168.x.x:3000` (no trailing slash)
- `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` — same as desktop `.env`

For offline dev only (no Supabase): set `ESTATE_LOCAL_WEB_AUTH=1` in the desktop `.env`, restart server, then sign in with the **Local dev** button in the app.

## Supabase roles

Set `app_metadata.estate_role` (or `user_metadata.estate_role`) to one of: `owner`, `admin`, `manager`, `sacco_lead`, `lodge_lead`.

## Run mobile

```bash
cd "Coffee management system/coffee-estate-mobile"
npm install
npx expo start
```

## Android release

```bash
npx eas build --platform android
```

(Configure `eas.json` in the mobile folder when ready for production builds.)
