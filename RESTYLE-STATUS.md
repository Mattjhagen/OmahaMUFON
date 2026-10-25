# UAP Tracker Command Center Restyle - Implementation Status

## ✅ COMPLETED - Backend Infrastructure

### Database Schema Updates
- ✅ Added `type` field to sightings table
- ✅ Created `chat` table (id, name, message, timestamp, ip)
- ✅ Added indexes for chat timestamps

### Database Functions Added
- ✅ `insert_chat_message(name, message, ip)` - Insert chat messages
- ✅ `get_chat_messages(limit=50)` - Retrieve recent messages
- ✅ `get_sighting_types_count()` - Get count by type
- ✅ Updated `insert_sighting()` to accept `sighting_type` parameter

### API Endpoints Added
- ✅ `GET /api/chat` - Retrieve chat messages
- ✅ `POST /api/chat` - Post new chat message (with IP logging for rate limiting)
- ✅ `GET /api/sighting-types` - Get sighting type counts
- ✅ Updated `POST /api/sightings` to handle type field

### Data Wiring Fixed
- ✅ Backend `fetch_adsb_aircraft()` reads from FR24 receiver (192.168.0.7/flights.js)
- ✅ None-handling fix for callsign fields prevents 500 errors
- ✅ Live API endpoint returns FR24-backed aircraft data

### Backup Created
- ✅ Original frontend backed up to `frontend.bak-20261024-203344`

## ⚠️ PENDING - Frontend Restyle

The backend is complete and functional. The frontend restyle requires:

### 1. HTML Structure (index.html)
**Command Center Layout:**
```html
<div id="root">
    <!-- Top Status Bar -->
    <div class="header">
        <span class="header-title">SKYREWIND UAP TRACKING NETWORK</span>
        <div class="header-status">
            <div class="status-indicator">
                <div class="status-dot"></div>
                <span>ADS-B LIVE</span>
            </div>
            <div class="status-indicator">
                <span>AIRCRAFT: <span id="aircraft-count">0</span></span>
            </div>
            <div class="status-indicator">
                <span>REPORTS: <span id="reports-count">0</span></span>
            </div>
            <div class="status-indicator">
                <span id="current-time"></span>
            </div>
        </div>
    </div>

    <!-- Main Grid -->
    <div class="main-grid">
        <!-- LEFT COLUMN -->
        <div style="display: flex; flex-direction: column; gap: 3px;">
            <!-- SIGHTING TYPES Panel -->
            <div class="panel">
                <div class="panel-title">SIGHTING TYPES</div>
                <div class="panel-content" id="sighting-types"></div>
            </div>

            <!-- FLIGHTS Panel -->
            <div class="panel">
                <div class="panel-title">FLIGHTS</div>
                <div class="panel-content" id="flights-panel"></div>
            </div>

            <!-- UAP REPORTS List -->
            <div class="panel">
                <div class="panel-title">UAP REPORTS (<span id="reports-count-panel">0</span>)</div>
                <div class="panel-content" id="reports-list"></div>
            </div>
        </div>

        <!-- CENTER - Map + Detail Panel -->
        <div style="display: flex; flex-direction: column; gap: 3px;">
            <!-- Map -->
            <div class="panel" style="flex: 1;">
                <div id="map"></div>
            </div>

            <!-- ACTIVE SIGHTING Detail Panel -->
            <div class="panel" style="height: 180px;">
                <div class="panel-title">
                    ACTIVE SIGHTING
                    <span style="float: right;">
                        <button onclick="prevSighting()">◀ PREV</button>
                        <button onclick="nextSighting()">NEXT ▶</button>
                    </span>
                </div>
                <div class="panel-content" id="active-sighting"></div>
            </div>
        </div>

        <!-- RIGHT COLUMN - GROUP CHAT -->
        <div class="panel">
            <div class="panel-title">GROUP CHAT</div>
            <div class="panel-content" id="chat-messages"></div>
            <div class="chat-input">
                <input type="text" id="chat-name" placeholder="Display Name" />
                <input type="text" id="chat-message" placeholder="Message" />
                <button onclick="sendChat()">SEND</button>
            </div>
        </div>
    </div>

    <!-- BOTTOM - USER SUBMITTED PHOTOS Strip -->
    <div class="panel" style="height: 118px;">
        <div class="panel-title">USER SUBMITTED PHOTOS</div>
        <div class="panel-content" style="display: flex; gap: 8px; overflow-x: auto;" id="photo-strip"></div>
    </div>
</div>
```

### 2. CSS Styling (style.css)
**Command Center Theme (from DOT-Cams-main):**
```css
* { margin: 0; padding: 0; box-sizing: border-box; }

body {
    background: #0f1419;
    color: #a8b2bc;
    font-family: 'Courier New', 'Fira Code', monospace;
    font-size: 10px;
    overflow: hidden;
    height: 100vh;
}

#root {
    display: grid;
    grid-template-rows: auto 1fr auto;
    height: 100vh;
    padding: 3px;
    gap: 3px;
}

.header {
    background: #1a1f26;
    color: #a8b2bc;
    padding: 5px 12px;
    border: 1px solid #4a8fa0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 9px;
}

.header-title {
    color: #6eb3c4;
    font-weight: bold;
    letter-spacing: 1px;
}

.status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #6ea87d;
    box-shadow: 0 0 6px #6ea87d;
    animation: pulse-dot 2s infinite;
}

@keyframes pulse-dot {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
}

.main-grid {
    display: grid;
    grid-template-columns: 240px 1fr 340px;
    gap: 3px;
    overflow: hidden;
}

.panel {
    background: #1a1f26;
    border: 1px solid #4a8fa0;
    padding: 8px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
}

.panel-title {
    color: #6eb3c4;
    font-weight: bold;
    font-size: 9px;
    margin-bottom: 6px;
    padding-bottom: 4px;
    border-bottom: 1px solid #4a8fa0;
    letter-spacing: 0.5px;
}

.panel-content {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
}

.panel-content::-webkit-scrollbar {
    width: 4px;
}

.panel-content::-webkit-scrollbar-track {
    background: #0d0518;
}

.panel-content::-webkit-scrollbar-thumb {
    background: #4a8fa0;
    border-radius: 2px;
}

/* Map styling */
#map {
    width: 100%;
    height: 100%;
    background: #000;
    border: 1px solid #4a8fa0;
}

.leaflet-container {
    background: #000;
    font-family: 'Courier New', monospace;
}

.leaflet-popup-content-wrapper {
    background: #1a1f26;
    color: #a8b2bc;
    border: 1px solid #4a8fa0;
    font-family: 'Courier New', monospace;
    font-size: 10px;
}

.leaflet-popup-tip {
    background: #1a1f26;
    border: 1px solid #4a8fa0;
}

/* Sighting type buttons */
.type-button {
    font-size: 8px;
    padding: 4px 0;
    border-bottom: 1px solid #1a1a2e;
    cursor: pointer;
    transition: background 0.2s;
    display: flex;
    justify-content: space-between;
}

.type-button:hover {
    background: #1a1a2e;
}

.type-button.active {
    background: rgba(74, 143, 160, 0.2);
}

/* Report row styling */
.report-row {
    font-size: 8px;
    padding: 4px 0;
    border-bottom: 1px solid #1a1a2e;
    cursor: pointer;
    transition: background 0.2s;
}

.report-row:hover {
    background: #1a1a2e;
}

.report-row.focused {
    background: rgba(74, 143, 160, 0.2);
}

/* Chat styling */
.chat-input {
    display: flex;
    gap: 4px;
    padding-top: 6px;
    border-top: 1px solid #4a8fa0;
}

.chat-input input {
    flex: 1;
    background: #0f1419;
    border: 1px solid #4a8fa0;
    color: #a8b2bc;
    padding: 4px;
    font-family: 'Courier New', monospace;
    font-size: 9px;
}

.chat-input button {
    background: #6eb3c4;
    border: none;
    color: #000;
    padding: 4px 12px;
    cursor: pointer;
    font-family: 'Courier New';
    font-size: 9px;
    font-weight: bold;
    border-radius: 2px;
}

.chat-message {
    font-size: 8px;
    padding: 4px;
    background: rgba(110, 179, 196, 0.1);
    margin-bottom: 2px;
    border-left: 2px solid #6eb3c4;
}

/* Detail panel styling */
.detail-row {
    display: flex;
    gap: 6px;
    margin-bottom: 3px;
    font-size: 8px;
}

.detail-label {
    color: #6eb3c4;
    min-width: 80px;
}

.type-badge {
    font-size: 7px;
    padding: 2px 6px;
    border-radius: 2px;
    background: rgba(110, 179, 196, 0.2);
    color: #6eb3c4;
    font-weight: bold;
}
```

### 3. JavaScript Implementation (app.js)
**Key Functions Needed:**
- `updateLiveAircraft()` - Fetch from `/api/aircraft/live` (FR24-backed)
- `loadSightingTypes()` - Fetch from `/api/sighting-types`
- `loadReports()` - Fetch from `/api/sightings`
- `loadChat()` - Fetch from `/api/chat` (poll every 3s)
- `sendChat()` - POST to `/api/chat`
- `showSightingDetail(id)` - Load sighting into detail panel
- `prevSighting()` / `nextSighting()` - Navigate through sightings
- `filterByType(type)` - Filter map blips and list by type
- `checkAircraftMatch(sighting)` - Call `/api/rewind` for sighting
- `loadPhotoStrip()` - Load user-submitted photos

### 4. Report Form Updates
**Add to sighting form:**
```html
<label>Type</label>
<select name="type" required>
    <option value="">Select type...</option>
    <option value="Sphere/Orb">Sphere/Orb</option>
    <option value="Disc">Disc</option>
    <option value="Triangle">Triangle</option>
    <option value="Cylinder">Cylinder</option>
    <option value="Rectangle">Rectangle</option>
    <option value="Diamond">Diamond</option>
    <option value="Formation">Formation</option>
    <option value="Light">Light</option>
    <option value="Fireball">Fireball</option>
    <option value="Other">Other</option>
</select>

<label>Description</label>
<textarea name="description" required rows="4"></textarea>

<label>Photo (optional)</label>
<input type="file" name="photo" accept="image/jpeg,image/png" />
```

## 🔧 RESTART REQUIRED

Run:
```bash
sudo systemctl restart skyrewind-merged-web
```

Then test endpoints:
```bash
curl http://localhost:5003/api/sighting-types
curl http://localhost:5003/api/chat
```

## 📋 VERIFICATION CHECKLIST

After completing frontend restyle:

- [ ] Visit https://uap.mattjhagen.xyz
- [ ] Status bar shows live aircraft count (non-zero when FR24 has data)
- [ ] Aircraft markers appear on map with [ADS-B] badges
- [ ] SIGHTING TYPES panel shows real counts (0 if no reports)
- [ ] FLIGHTS panel shows live count from FR24-backed API
- [ ] UAP REPORTS list shows real user reports
- [ ] Clicking report centers map blip and loads detail panel
- [ ] Detail panel shows ACTIVE SIGHTING with PREV/NEXT controls
- [ ] GROUP CHAT accepts and displays messages
- [ ] USER SUBMITTED PHOTOS strip shows real photos or empty state
- [ ] Report form includes type dropdown
- [ ] No "OFFLINE / 0 aircraft" bug when API returns data

## 📝 IMPLEMENTATION NOTES

**Data Wiring Critical Points:**
1. Map markers: Read from `/api/aircraft/live` (FR24-backed)
2. FLIGHTS count: Read from `/api/aircraft/live` length
3. Status bar count: Read from `/api/aircraft/live` length
4. Never read from `/var/run/dump1090-mutability/aircraft.json` directly
5. Rewind data: Read from `/api/rewind` (database-backed)

**Empty States:**
- No reports: "No UAP reports submitted yet"
- No photos: "No photos submitted yet"
- No chat: "No messages yet"
- Never show fabricated/demo data

**Future Phase (NOT this task):**
- Google OAuth for usernames
- User-adopted titles (Field Investigator, Researcher, etc.)
- Moderation tools for chat/reports/photos
