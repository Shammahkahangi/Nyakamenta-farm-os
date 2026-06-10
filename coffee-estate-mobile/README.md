# Nyakamenta Estate OS — Mobile

Expo (React Native) client for [Coffee Estate OS](../). Uses the **same SQLite database** as desktop/web: all reads and writes go through the parent API (`npm run web` → `data/estate.db`). There is no separate mobile database file.

**Location:** `Coffee management system/coffee-estate-mobile/` (intended sibling `d:\Loan-softwares\coffee-estate-mobile` when the repo root allows new folders).

## Setup

```bash
cd "Coffee management system/coffee-estate-mobile"
npm install
cp .env.example .env
# Edit EXPO_PUBLIC_ESTATE_API_URL to your PC IP, e.g. http://192.168.1.10:3000
npx expo start
```

Start the API server from the parent directory:

```bash
cd "Coffee management system"
npm run web
```

See [MOBILE.md](../MOBILE.md) for CORS, `0.0.0.0` bind, and Supabase roles.

## Features

- Door hub: Farm, SACCO, Lodge (role-gated)
- Full navigation parity with desktop web (nested tabs where applicable)
- Ported `dataService.js` (same SQL via `/api/db/query`)
- Logbook: managers edit; owners/admins read-only review
- Metric search, settings (AsyncStorage), payroll XLSX import, Supabase sync
