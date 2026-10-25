# SkyRewind Merged UAP Tracker - Build Report

**Build Date:** 2026-10-24  
**Build Location:** `/opt/skyrewind-merged`  
**Port:** 5003  
**Status:** BUILT — AWAITING SERVICE STARTUP & ACCEPTANCE CHECKS

---

## What Was Built

A merged UAP aircraft tracker that combines:
- **ADS-B Layer:** Local rtl_adsb receiver data from `/var/run/dump1090-mutability/aircraft.json`
- **API Layer:** OpenSky Network API via aircraft-proxy on port 8080 (Omaha bounding box: lat 40.5-42.0, lon -97.0--95.0)
- **Rewind Archive:** 90-day SQLite database of aircraft observations from both layers
- **SkyRewind UI:** Sighting reporting, feed, map with merged aircraft rendering and source badges

---

## Components

### 1. Backend (Flask on port 5003)
- **File:** `backend/app.py`
- **Endpoints:**
  - `GET /` — Serves frontend
  - `GET /api/aircraft/live` — Merged aircraft from both ADS-B and API layers
  - `GET /api/rewind?time=&lat=&lon=&radius=` — Historical aircraft within radius at specified time
  - `GET /api/sightings` — All sighting reports
  - `POST /api/sightings` — Create new sighting
  - `GET /api/sightings/<id>` — Get specific sighting
- **Database:** `backend/database.py`
  - Sightings: `data/skyrewind.db` (same schema as live SkyRewind)
  - Rewind archive: `data/rewind.db` (observations table)

### 2. Aircraft Proxy (OpenSky → dump1090 format on port 8080)
- **File:** `services/aircraft-proxy.py` (copied from command center)
- **Function:** Fetches OpenSky Network API, converts to dump1090 format
- **Coverage:** Omaha area (lat 40.5-42.0, lon -97.0--95.0)
- **Free API:** No authentication required

### 3. Recorder Service
- **File:** `services/recorder.py`
- **Function:** Polls both ADS-B and API layers every 30 seconds, writes observations to rewind DB
- **Fields:** timestamp, source (adsb/api), icao_hex, callsign, registration, lat, lon, altitude, ground_speed, track, squawk
- **Retention:** 90 days (auto-prune)

### 4. Frontend (Vanilla JS, SkyRewind UI)
- **Files:** `frontend/index.html`, `frontend/app.js`, `frontend/style.css`
- **Features:**
  - Live map with merged aircraft (ADS-B + API)
  - Aircraft markers with source badges: [ADS-B], [API], or [ADS-B + API] for aircraft seen by both
  - Sighting reporting (same as live SkyRewind)
  - Rewind & match (uses /api/rewind)
  - Feed view with search/filter
- **Language discipline:** "No ADS-B match found" wording preserved

### 5. Systemd Services
- **Files:** `systemd/*.service`
- **Services:**
  - `skyrewind-merged-aircraft-proxy.service` — OpenSky proxy on port 8080
  - `skyrewind-merged-recorder.service` — 30-second polling + DB write
  - `skyrewind-merged-web.service` — Gunicorn (4 workers) on port 5003
- **User:** All run as `skyrewind` user

---

## Data Sources & Layers

### Layer A (API - OpenSky Network)
- **Source:** `http://localhost:8080/data/aircraft.json` (aircraft-proxy)
- **Coverage:** Omaha bounding box (40.5-42.0 lat, -97.0--95.0 lon)
- **Free:** No authentication required
- **Badge:** `[API]` in UI

### Layer B (ADS-B - Local Receiver)
- **Source:** `/var/run/dump1090-mutability/aircraft.json`
- **Coverage:** Line-of-sight from receiver (41.25, -95.95)
- **Badge:** `[ADS-B]` in UI

### Merged Display
- If same ICAO hex appears in both sources: **one marker** with badge `[ADS-B + API]`
- Otherwise: separate markers with individual badges
- Marker shows: callsign, altitude, speed, heading, ICAO hex, source badge

---

## Rewind Mechanism

### Recorder Behavior
- Polls both layers every 30 seconds
- Writes all aircraft with positions to `data/rewind.db`
- Prunes observations older than 90 days every 100 iterations (~50 minutes)

### Rewind API
- **Endpoint:** `GET /api/rewind?time=<ISO-8601>&lat=<float>&lon=<float>&radius=<miles>`
- **Time window:** ±10 minutes from requested time
- **Returns:** All observations within radius, with distance_miles calculated
- **Honest limit:** Rewind only reaches back to when recording started (no pre-recording history)

### UI Rewind
- Load sighting → fetch rewind observations → time scrubber (±10 min)
- Aircraft markers rendered at scrubbed time (30-second window)
- Match panel shows closest approaches for each aircraft
- Wording: "No ADS-B match found" when no aircraft detected

---

## File Tree

```
/opt/skyrewind-merged/
├── backend/
│   ├── __init__.py
│   ├── app.py
│   └── database.py
├── frontend/
│   ├── index.html
│   ├── app.js
│   ├── style.css
│   ├── sw.js
│   ├── manifest.json
│   ├── favicon.svg
│   └── icons/
├── services/
│   ├── aircraft-proxy.py
│   └── recorder.py
├── systemd/
│   ├── skyrewind-merged-aircraft-proxy.service
│   ├── skyrewind-merged-recorder.service
│   └── skyrewind-merged-web.service
├── data/  (created on first run, owned by skyrewind:skyrewind)
│   ├── skyrewind.db  (sightings)
│   ├── rewind.db  (observations archive)
│   └── uploads/
├── venv/  (Python 3.12 virtual environment)
├── requirements.txt
├── install.sh
├── SETUP_INSTRUCTIONS.txt
└── BUILD_REPORT.md  (this file)
```

---

## Deviations from Original Prompt

None. Build matches the prompt exactly:
- ✅ Two data layers (ADS-B + OpenSky API via proxy)
- ✅ Merged aircraft rendering with source badges
- ✅ Rewind recorder (30s poll, 90-day retention, includes registration field)
- ✅ Rewind API (/api/rewind)
- ✅ SkyRewind UI preserved (no crime/traffic/dispatch panels)
- ✅ Command-center aircraft rendering style (callsign + speed labels)
- ✅ New folder, new port (5003), new services
- ✅ Live SkyRewind UNTOUCHED (verified :5000 and https://uap.mattjhagen.xyz still serve old SkyRewind)
- ✅ OpenSky API confirmed as the data source (not FR24)

---

## Acceptance Checks (TO BE RUN)

After Matty runs the commands in `SETUP_INSTRUCTIONS.txt`, perform these checks:

### 1. New app serves on port 5003
```bash
curl http://localhost:5003 | head -n 20
```
**Expected:** HTML page with "SkyRewind" title

### 2. Live map shows BOTH layers
- Open http://localhost:5003 in browser
- Wait 10 seconds for aircraft to load
- **Expected:** Aircraft markers with source badges ([ADS-B], [API], or [ADS-B + API])
- **Check:** Click a marker to verify popup shows callsign, altitude, speed, ICAO, and source badge

### 3. Recorder has written snapshots
Wait 2 minutes after recorder starts, then:
```bash
sqlite3 /opt/skyrewind-merged/data/rewind.db "SELECT COUNT(*), source FROM observations GROUP BY source;"
```
**Expected:** Two rows showing counts for 'adsb' and 'api' sources (at least a few observations each if aircraft are present)

### 4. Rewind API works
Pick a recent time (e.g., 15 minutes ago) and test:
```bash
curl -s 'http://localhost:5003/api/rewind?time=2026-10-24T16:00:00Z&lat=41.25&lon=-95.95&radius=25' | python3 -m json.tool
```
**Expected:** JSON array of observations with timestamp, source, icao_hex, callsign, lat, lon, distance_miles

### 5. No crime/traffic/dispatch panels
- Open http://localhost:5003 in browser
- **Expected:** SkyRewind UI (map, sighting form, feed) with NO:
  - SpotCrime markers
  - CAD feed
  - Broadcastify scanner
  - Nebraska 511 cameras
  - Services/telemetry panels
  - SHAGGOTH graph
  - Integrity-fault banner

### 6. Live https://uap.mattjhagen.xyz is UNCHANGED
```bash
curl -s https://uap.mattjhagen.xyz | head -n 20
```
**Expected:** Same SkyRewind HTML as before (title: "SkyRewind - Aircraft Tracking & Sighting Reports")

---

## Proposed Cutover Steps (FOR MATTY'S APPROVAL ONLY)

**DO NOT EXECUTE THESE YET — REPORT BACK FIRST**

Once acceptance checks pass and Matty approves:

1. Edit `~/.cloudflared/config.yml`:
   ```yaml
   ingress:
     - hostname: mattjhagen.xyz
       service: http://localhost:3001
     - hostname: www.mattjhagen.xyz
       service: http://localhost:3001
     - hostname: uap.mattjhagen.xyz
       service: http://localhost:5003  # CHANGE FROM :5000 TO :5003
     - service: http_status:404
   ```

2. Validate tunnel config:
   ```bash
   cloudflared tunnel ingress validate --config ~/.cloudflared/config.yml
   ```

3. Restart cloudflared:
   ```bash
   sudo systemctl restart cloudflared
   ```

4. Verify cutover:
   ```bash
   curl -s https://uap.mattjhagen.xyz | head -n 20
   ```
   **Expected:** Merged tracker (same HTML structure, but backend now serves from :5003)

5. Monitor for errors:
   ```bash
   journalctl -u cloudflared --since "1 minute ago"
   journalctl -u skyrewind-merged-web --since "1 minute ago"
   ```

---

## Service Commands

### Start services:
```bash
sudo systemctl start skyrewind-merged-aircraft-proxy
sudo systemctl start skyrewind-merged-recorder
sudo systemctl start skyrewind-merged-web
```

### Check status:
```bash
sudo systemctl status skyrewind-merged-aircraft-proxy
sudo systemctl status skyrewind-merged-recorder
sudo systemctl status skyrewind-merged-web
```

### View logs:
```bash
journalctl -u skyrewind-merged-aircraft-proxy --since "2 minutes ago"
journalctl -u skyrewind-merged-recorder --since "2 minutes ago"
journalctl -u skyrewind-merged-web --since "2 minutes ago"
```

### Stop services:
```bash
sudo systemctl stop skyrewind-merged-aircraft-proxy
sudo systemctl stop skyrewind-merged-recorder
sudo systemctl stop skyrewind-merged-web
```

---

## Notes

- **Recorder DB path:** `/opt/skyrewind-merged/data/rewind.db`
- **Service user:** `skyrewind` (same as live SkyRewind)
- **Ownership:** Directory is `matt:skyrewind` mode 775; `data/` will be `skyrewind:skyrewind` after setup commands run
- **Port 8080:** Aircraft proxy (OpenSky → dump1090 format) — not exposed to internet, local only
- **Port 5003:** Merged web app — will be exposed via Cloudflare Tunnel after cutover
- **Rewind honest limit:** Archive only contains observations from recorder start time forward (no historical backfill unless external source added)
- **OpenSky API:** Free, no auth, 10-second rate limit (recorder polls every 30s, well under limit)
- **Command center preserved:** `/home/matt/DOT-Cams-main` UNTOUCHED, still serves on :8002 as ads.mattjhagen.xyz (the crime map)

---

## Build Completion

**Status:** READY FOR SERVICE STARTUP

**Next steps:**
1. Matty: Run commands in `SETUP_INSTRUCTIONS.txt`
2. Run acceptance checks above
3. Report findings (which layers have aircraft, recorder counts, any errors)
4. If all checks pass, Matty approves cutover
5. Execute cutover steps to switch uap.mattjhagen.xyz → port 5003

**Builder:** Claude Sonnet 4.5  
**Build log preserved in:** This file
