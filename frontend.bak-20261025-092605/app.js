// API base URL
const API_BASE = window.location.origin;

// Map center for Omaha, NE
const DEFAULT_CENTER = [41.25, -95.95];
const DEFAULT_ZOOM = 9;

// Icons for sighting types (UFO-themed) - USED IN BOTH PANEL AND MAP BLIPS
const SIGHTING_ICONS = {
    'Sphere/Orb': '🔴',
    'Disc': '🛸',
    'Triangle': '🔺',
    'Cylinder': '⚫',
    'Rectangle': '⬜',
    'Diamond': '💠',
    'Formation': '✨',
    'Light': '💡',
    'Fireball': '🔥',
    'Other': '❓'
};

// Aircraft categories for differentiated markers (Feature 1)
const AIRCRAFT_CATEGORIES = {
    ga: { name: 'General Aviation', icon: '🛩️', color: '#6ea87d', rotate: true },
    passenger: { name: 'Passenger Jet', icon: '✈️', color: '#6eb3c4', rotate: true },
    cargo: { name: 'Cargo Jet', icon: '📦', color: '#d4a574', rotate: true },
    other: { name: 'Other Aircraft', icon: '🛫', color: '#a8b2bc', rotate: true }
};

const AIRLINE_CALLSIGNS = ['UAL', 'DAL', 'SWA', 'AAL', 'SKW', 'ASA', 'EJA', 'LXJ', 'ENY', 'FFT', 'JBU', 'NKS', 'SWA'];
const CARGO_CALLSIGNS = ['FDX', 'UPS'];

// State
let map = null;
let aircraftMarkers = {};
let rewindMarkers = {};
let sightingMarkers = {};
let allSightings = [];
let filteredSightings = [];
let currentSightingIndex = -1;
let currentFilter = 'all';
let chatPollInterval = null;
let aircraftPollInterval = null;
let lastChatId = 0;
let rateLimitActive = false;
let rewindMode = false;
let currentRewindTime = null;
let currentRewindLat = null;
let currentRewindLon = null;
let currentRewindRadius = 25;

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    initModals();
    initChat();
    initRewindControls();
    loadSightingTypes();
    loadReports();
    loadPhotoStrip();
    startLiveUpdates();
    updateClock();
    setInterval(updateClock, 1000);
});

// ===== AIRCRAFT CATEGORIZATION (Feature 1) =====
function categorizeAircraft(callsign) {
    if (!callsign) return 'other';

    // N-number: general aviation (e.g., N123AB)
    if (/^N\d/.test(callsign)) {
        return 'ga';
    }

    // Extract first 3 characters for airline/cargo check
    const prefix = callsign.substring(0, 3).toUpperCase();

    // Cargo carriers
    if (CARGO_CALLSIGNS.includes(prefix)) {
        return 'cargo';
    }

    // Passenger airlines
    if (AIRLINE_CALLSIGNS.includes(prefix)) {
        return 'passenger';
    }

    return 'other';
}

// ===== MAP =====
function initMap() {
    map = L.map('map').setView(DEFAULT_CENTER, DEFAULT_ZOOM);

    // Dark tile layer
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Esri',
        maxZoom: 16
    }).addTo(map);

    // Add legend to flights panel
    addAircraftLegend();
}

function addAircraftLegend() {
    const flightsPanel = document.getElementById('flights-panel');
    const legend = document.createElement('div');
    legend.className = 'aircraft-legend';
    legend.innerHTML = `
        <div class="legend-title">AIRCRAFT TYPES</div>
        <div class="legend-item">
            <span class="legend-icon">${AIRCRAFT_CATEGORIES.ga.icon}</span>
            <span>${AIRCRAFT_CATEGORIES.ga.name}</span>
        </div>
        <div class="legend-item">
            <span class="legend-icon">${AIRCRAFT_CATEGORIES.passenger.icon}</span>
            <span>${AIRCRAFT_CATEGORIES.passenger.name}</span>
        </div>
        <div class="legend-item">
            <span class="legend-icon">${AIRCRAFT_CATEGORIES.cargo.icon}</span>
            <span>${AIRCRAFT_CATEGORIES.cargo.name}</span>
        </div>
        <div class="legend-item">
            <span class="legend-icon">${AIRCRAFT_CATEGORIES.other.icon}</span>
            <span>${AIRCRAFT_CATEGORIES.other.name}</span>
        </div>
    `;
    flightsPanel.appendChild(legend);
}

// ===== REWIND CONTROLS (Feature 4) =====
function initRewindControls() {
    const rewindBtn = document.getElementById('rewind-btn');
    const backToLiveBtn = document.getElementById('back-to-live-btn');
    const rewindTimeInput = document.getElementById('rewind-time');
    const loadSightingBtn = document.getElementById('load-sighting-btn');

    // Set default rewind time to 1 hour ago
    const oneHourAgo = new Date();
    oneHourAgo.setHours(oneHourAgo.getHours() - 1);
    oneHourAgo.setMinutes(oneHourAgo.getMinutes() - oneHourAgo.getTimezoneOffset());
    rewindTimeInput.value = oneHourAgo.toISOString().slice(0, 16);

    rewindBtn.onclick = () => {
        const rewindTime = rewindTimeInput.value;
        const radius = parseInt(document.getElementById('search-radius').value);

        if (!rewindTime) {
            alert('Please select a date and time');
            return;
        }

        // Convert to UTC ISO string
        const localDate = new Date(rewindTime);
        const utcTime = localDate.toISOString();

        // Use map center for location
        const center = map.getCenter();
        enterRewindMode(utcTime, center.lat, center.lng, radius);
    };

    backToLiveBtn.onclick = () => {
        exitRewindMode();
    };

    loadSightingBtn.onclick = () => {
        const select = document.getElementById('sighting-select');
        const index = parseInt(select.value);
        if (!isNaN(index) && allSightings[index]) {
            const sighting = allSightings[index];
            const radius = parseInt(document.getElementById('search-radius').value);

            // Jump to sighting's time and location
            enterRewindMode(sighting.sighting_time, sighting.lat, sighting.lon, radius);

            // Also show the sighting details and center map
            currentSightingIndex = index;
            showSightingDetail(index);
            map.setView([sighting.lat, sighting.lon], 12);
            renderReportsList();
        }
    };
}

async function enterRewindMode(time, lat, lon, radius) {
    rewindMode = true;
    currentRewindTime = time;
    currentRewindLat = lat;
    currentRewindLon = lon;
    currentRewindRadius = radius;

    // Update mode indicator
    const modeBadge = document.getElementById('mode-badge');
    const backToLiveBtn = document.getElementById('back-to-live-btn');
    modeBadge.textContent = `⏱️ REWIND — ${new Date(time).toLocaleString()}`;
    modeBadge.className = 'mode-badge rewind';
    backToLiveBtn.style.display = 'inline-block';

    // Clear live aircraft markers
    Object.values(aircraftMarkers).forEach(marker => map.removeLayer(marker));
    aircraftMarkers = {};

    // Stop live polling
    if (aircraftPollInterval) {
        clearInterval(aircraftPollInterval);
        aircraftPollInterval = null;
    }

    // Load rewind data
    await loadRewindData(time, lat, lon, radius);
}

function exitRewindMode() {
    rewindMode = false;
    currentRewindTime = null;

    // Update mode indicator
    const modeBadge = document.getElementById('mode-badge');
    const backToLiveBtn = document.getElementById('back-to-live-btn');
    modeBadge.textContent = '● LIVE';
    modeBadge.className = 'mode-badge live';
    backToLiveBtn.style.display = 'none';

    // Clear rewind markers
    Object.values(rewindMarkers).forEach(marker => map.removeLayer(marker));
    rewindMarkers = {};

    // Resume live updates
    startLiveUpdates();
}

async function loadRewindData(time, lat, lon, radius) {
    try {
        const response = await fetch(
            `${API_BASE}/api/rewind?lat=${lat}&lon=${lon}&time=${time}&radius=${radius}`
        );

        if (!response.ok) throw new Error('Failed to load rewind data');

        const data = await response.json();

        // Clear old rewind markers
        Object.values(rewindMarkers).forEach(marker => map.removeLayer(marker));
        rewindMarkers = {};

        if (data.aircraft && data.aircraft.length > 0) {
            data.aircraft.forEach(a => {
                const category = categorizeAircraft(a.callsign);
                const config = AIRCRAFT_CATEGORIES[category];

                // Create rotated icon
                const rotation = config.rotate && a.track ? a.track : 0;
                const icon = L.divIcon({
                    className: 'aircraft-marker',
                    html: `<div style="color: ${config.color}; font-size: 16px; transform: rotate(${rotation}deg); transform-origin: center;">${config.icon}</div>`,
                    iconSize: [16, 16],
                    iconAnchor: [8, 8]
                });

                const popupContent = `
                    <div class="popup-row">
                        <span class="popup-label">CALLSIGN:</span>
                        <span>${a.callsign || a.icao_hex}</span>
                    </div>
                    <div class="popup-row">
                        <span class="popup-label">CATEGORY:</span>
                        <span>${config.name}</span>
                    </div>
                    <div class="popup-row">
                        <span class="popup-label">ALTITUDE:</span>
                        <span>${a.altitude || 'N/A'} ft</span>
                    </div>
                    <div class="popup-row">
                        <span class="popup-label">SPEED:</span>
                        <span>${a.ground_speed || 'N/A'} kts</span>
                    </div>
                    <div class="popup-row">
                        <span class="popup-label">TRACK:</span>
                        <span>${a.track || 'N/A'}°</span>
                    </div>
                    <div class="popup-row">
                        <span class="popup-label">TIME:</span>
                        <span>${new Date(a.timestamp).toLocaleString()}</span>
                    </div>
                `;

                const marker = L.marker([a.lat, a.lon], { icon })
                    .bindPopup(popupContent)
                    .addTo(map);

                rewindMarkers[`${a.icao_hex}-${a.timestamp}`] = marker;
            });

            // Update flights count
            document.getElementById('flights-count').textContent = data.aircraft.length;
            document.getElementById('aircraft-count').textContent = data.aircraft.length;
        } else {
            document.getElementById('flights-count').textContent = '0';
            document.getElementById('aircraft-count').textContent = '0';
        }

    } catch (error) {
        console.error('Error loading rewind data:', error);
        alert('Failed to load rewind data');
    }
}

// ===== LIVE AIRCRAFT (Feature 1: Differentiated Markers) =====
function startLiveUpdates() {
    if (rewindMode) return; // Don't start if in rewind mode
    loadAircraft();
    aircraftPollInterval = setInterval(() => {
        if (!rewindMode) loadAircraft();
    }, 10000); // Every 10 seconds
}

async function loadAircraft() {
    if (rewindMode) return; // Skip if in rewind mode

    try {
        const response = await fetch(`${API_BASE}/api/aircraft/live`);
        if (!response.ok) throw new Error('Failed to fetch aircraft');

        const aircraft = await response.json();

        // Update status
        document.getElementById('aircraft-count').textContent = aircraft.length;
        document.getElementById('flights-count').textContent = aircraft.length;

        const statusDot = document.getElementById('status-dot');
        if (aircraft.length > 0) {
            statusDot.classList.remove('offline');
        } else {
            statusDot.classList.add('offline');
        }

        // Update markers
        const currentHexes = new Set(aircraft.map(a => a.hex));

        // Remove old markers
        Object.keys(aircraftMarkers).forEach(hex => {
            if (!currentHexes.has(hex)) {
                map.removeLayer(aircraftMarkers[hex]);
                delete aircraftMarkers[hex];
            }
        });

        // Add/update markers with differentiated styles (Feature 1)
        aircraft.forEach(a => {
            if (!a.lat || !a.lon) return;

            const category = categorizeAircraft(a.callsign);
            const config = AIRCRAFT_CATEGORIES[category];

            // Rotate icon by track heading
            const rotation = config.rotate && a.track ? a.track : 0;

            const sourceBadge = a.sources?.includes('adsb') ? '[ADS-B]' : '[API]';
            const popupContent = `
                <div class="popup-row">
                    <span class="popup-label">CALLSIGN:</span>
                    <span>${a.callsign || a.hex}</span>
                </div>
                <div class="popup-row">
                    <span class="popup-label">CATEGORY:</span>
                    <span>${config.name}</span>
                </div>
                <div class="popup-row">
                    <span class="popup-label">SOURCE:</span>
                    <span>${sourceBadge}</span>
                </div>
                <div class="popup-row">
                    <span class="popup-label">ALTITUDE:</span>
                    <span>${a.altitude || 'N/A'} ft</span>
                </div>
                <div class="popup-row">
                    <span class="popup-label">SPEED:</span>
                    <span>${a.ground_speed || 'N/A'} kts</span>
                </div>
                <div class="popup-row">
                    <span class="popup-label">TRACK:</span>
                    <span>${a.track || 'N/A'}°</span>
                </div>
            `;

            if (aircraftMarkers[a.hex]) {
                // Update existing marker
                aircraftMarkers[a.hex].setLatLng([a.lat, a.lon]);
                aircraftMarkers[a.hex].getPopup().setContent(popupContent);

                // Update icon rotation
                const icon = L.divIcon({
                    className: 'aircraft-marker',
                    html: `<div style="color: ${config.color}; font-size: 16px; transform: rotate(${rotation}deg); transform-origin: center;">${config.icon}</div>`,
                    iconSize: [16, 16],
                    iconAnchor: [8, 8]
                });
                aircraftMarkers[a.hex].setIcon(icon);
            } else {
                // Create new marker
                const icon = L.divIcon({
                    className: 'aircraft-marker',
                    html: `<div style="color: ${config.color}; font-size: 16px; transform: rotate(${rotation}deg); transform-origin: center;">${config.icon}</div>`,
                    iconSize: [16, 16],
                    iconAnchor: [8, 8]
                });

                const marker = L.marker([a.lat, a.lon], { icon })
                    .bindPopup(popupContent)
                    .addTo(map);

                aircraftMarkers[a.hex] = marker;
            }
        });

    } catch (error) {
        console.error('Error loading aircraft:', error);
        document.getElementById('status-dot').classList.add('offline');
    }
}

// ===== SIGHTING TYPES =====
async function loadSightingTypes() {
    try {
        const response = await fetch(`${API_BASE}/api/sighting-types`);
        if (!response.ok) throw new Error('Failed to fetch sighting types');

        const types = await response.json();
        const container = document.getElementById('sighting-types');

        // Add "All" option
        const allButton = document.createElement('div');
        allButton.className = 'type-button active';
        allButton.innerHTML = `
            <span><span class="type-icon">🌐</span> All Types</span>
            <span class="type-count">${Object.values(types).reduce((sum, count) => sum + count, 0)}</span>
        `;
        allButton.onclick = () => filterByType('all');
        container.appendChild(allButton);

        // Add each type
        Object.entries(types).forEach(([type, count]) => {
            const button = document.createElement('div');
            button.className = 'type-button';
            button.dataset.type = type;
            button.innerHTML = `
                <span><span class="type-icon">${SIGHTING_ICONS[type] || '❓'}</span> ${type}</span>
                <span class="type-count">${count}</span>
            `;
            button.onclick = () => filterByType(type);
            container.appendChild(button);
        });

    } catch (error) {
        console.error('Error loading sighting types:', error);
    }
}

function filterByType(type) {
    currentFilter = type;

    // Update active button
    document.querySelectorAll('.type-button').forEach(btn => {
        btn.classList.remove('active');
    });

    if (type === 'all') {
        document.querySelector('.type-button').classList.add('active');
        filteredSightings = [...allSightings];
    } else {
        const typeBtn = document.querySelector(`.type-button[data-type="${type}"]`);
        if (typeBtn) typeBtn.classList.add('active');
        filteredSightings = allSightings.filter(s => s.type === type);
    }

    // Update reports list
    renderReportsList();

    // Update sighting markers
    updateSightingMarkers();
}

// ===== REPORTS LIST =====
async function loadReports() {
    try {
        const response = await fetch(`${API_BASE}/api/sightings`);
        if (!response.ok) throw new Error('Failed to fetch reports');

        allSightings = await response.json();
        allSightings.reverse(); // Newest first
        filteredSightings = [...allSightings];

        document.getElementById('reports-count').textContent = allSightings.length;
        document.getElementById('reports-count-panel').textContent = allSightings.length;

        renderReportsList();
        updateSightingMarkers();

        // Load most recent sighting into detail panel
        if (allSightings.length > 0) {
            currentSightingIndex = 0;
            showSightingDetail(0);
        }

        // Populate sighting select dropdown
        const select = document.getElementById('sighting-select');
        select.innerHTML = '<option value="">Or select a sighting to jump to...</option>';
        allSightings.forEach((s, i) => {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = `${s.reporter_name} - ${s.type || 'Unknown'} - ${formatTimeAgo(s.sighting_time)}`;
            select.appendChild(option);
        });

    } catch (error) {
        console.error('Error loading reports:', error);
    }
}

function renderReportsList() {
    const container = document.getElementById('reports-list');

    if (filteredSightings.length === 0) {
        container.innerHTML = '<div class="empty-state">No UAP reports submitted yet</div>';
        return;
    }

    container.innerHTML = '';
    filteredSightings.forEach((sighting, index) => {
        const actualIndex = allSightings.indexOf(sighting);
        const row = document.createElement('div');
        row.className = 'report-row';
        if (actualIndex === currentSightingIndex) {
            row.classList.add('focused');
        }
        row.innerHTML = `
            <div>
                <div class="report-title">${SIGHTING_ICONS[sighting.type] || '❓'} ${sighting.type || 'Unknown'}</div>
                <div class="report-location">${sighting.location_text || `${sighting.lat.toFixed(4)}, ${sighting.lon.toFixed(4)}`}</div>
                <div class="report-time">${formatTimeAgo(sighting.sighting_time)} ago • ${sighting.confirmations || 0} saw this</div>
            </div>
        `;
        row.onclick = () => {
            currentSightingIndex = actualIndex;
            showSightingDetail(actualIndex);
            centerOnSighting(sighting);
            renderReportsList(); // Re-render to update focus
        };
        container.appendChild(row);
    });
}

// Feature 2: Per-type report blip icons (using SIGHTING_ICONS)
function updateSightingMarkers() {
    // Clear existing sighting markers
    Object.values(sightingMarkers).forEach(marker => map.removeLayer(marker));
    sightingMarkers = {};

    // Add markers for filtered sightings
    filteredSightings.forEach((sighting, index) => {
        if (!sighting.lat || !sighting.lon) return;

        const actualIndex = allSightings.indexOf(sighting);
        const icon = L.divIcon({
            className: 'sighting-marker',
            html: `<div style="color: #c96c6c; font-size: 20px;">${SIGHTING_ICONS[sighting.type] || '❓'}</div>`,
            iconSize: [20, 20],
            iconAnchor: [10, 10]
        });

        const popupContent = `
            <div class="popup-row">
                <span class="popup-label">TYPE:</span>
                <span>${sighting.type || 'Unknown'}</span>
            </div>
            <div class="popup-row">
                <span class="popup-label">LOCATION:</span>
                <span>${sighting.location_text || 'N/A'}</span>
            </div>
            <div class="popup-row">
                <span class="popup-label">TIME:</span>
                <span>${formatTimeAgo(sighting.sighting_time)} ago</span>
            </div>
            <div class="popup-row">
                <span class="popup-label">REPORT ID:</span>
                <span>#${sighting.id}</span>
            </div>
            <div class="popup-row">
                <span class="popup-label">CONFIRMATIONS:</span>
                <span>${sighting.confirmations || 0}</span>
            </div>
            <div class="popup-row">
                <span class="popup-label">DESCRIPTION:</span>
                <span>${sighting.description}</span>
            </div>
        `;

        const marker = L.marker([sighting.lat, sighting.lon], { icon })
            .bindPopup(popupContent)
            .addTo(map);

        marker.on('click', () => {
            currentSightingIndex = actualIndex;
            showSightingDetail(actualIndex);
            renderReportsList(); // Update focus
        });

        sightingMarkers[sighting.id] = marker;
    });
}

function centerOnSighting(sighting) {
    if (sighting.lat && sighting.lon) {
        map.setView([sighting.lat, sighting.lon], 12);
        if (sightingMarkers[sighting.id]) {
            sightingMarkers[sighting.id].openPopup();
        }
    }
}

// ===== DETAIL PANEL (Feature 3: Confirmation Button) =====
function showSightingDetail(index) {
    if (index < 0 || index >= allSightings.length) {
        document.getElementById('active-sighting').innerHTML = '<div class="empty-state">No sighting selected</div>';
        return;
    }

    currentSightingIndex = index;
    const sighting = allSightings[index];

    const container = document.getElementById('active-sighting');
    container.innerHTML = `
        <div class="detail-grid">
            <div class="detail-row">
                <span class="detail-label">REPORT ID:</span>
                <span class="detail-value">#${sighting.id}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">TYPE:</span>
                <span class="detail-value"><span class="type-badge">${sighting.type || 'Unknown'}</span></span>
            </div>
            <div class="detail-row">
                <span class="detail-label">REPORTER:</span>
                <span class="detail-value">${sighting.reporter_name}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">LOCATION:</span>
                <span class="detail-value">${sighting.location_text || 'N/A'}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">TIME:</span>
                <span class="detail-value">${new Date(sighting.sighting_time).toLocaleString()} (${formatTimeAgo(sighting.sighting_time)} ago)</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">STATUS:</span>
                <span class="detail-value"><span class="status-badge">REPORTED</span></span>
            </div>
            <div class="detail-row">
                <span class="detail-label">COORD:</span>
                <span class="detail-value">${sighting.lat.toFixed(6)}, ${sighting.lon.toFixed(6)}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">DURATION:</span>
                <span class="detail-value">${sighting.duration || 'N/A'}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">BEARING:</span>
                <span class="detail-value">${sighting.bearing ? sighting.bearing + '°' : 'N/A'}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">ELEVATION:</span>
                <span class="detail-value">${sighting.elevation ? sighting.elevation + '°' : 'N/A'}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">NOTES:</span>
                <span class="detail-value">${sighting.description}</span>
            </div>
        </div>
        ${sighting.photo_path ? `
            <div class="detail-photo" onclick="openLightbox('${sighting.photo_path}', ${sighting.id})">
                <img src="${API_BASE}/api/uploads/${sighting.photo_path}" alt="Sighting photo">
            </div>
        ` : ''}
        <div id="aircraft-check-${sighting.id}" class="aircraft-match">
            <div class="aircraft-match-label">AIRCRAFT CHECK:</div>
            <div>Loading...</div>
        </div>
        <div class="confirm-section">
            <button id="confirm-btn-${sighting.id}" class="btn-confirm" onclick="confirmSighting(${sighting.id})" ${sighting.confirmed_by_me ? 'disabled' : ''}>
                ${sighting.confirmed_by_me ? 'You saw this too' : 'I saw this too'}
            </button>
            <span class="confirm-count" id="confirm-count-${sighting.id}">${sighting.confirmations || 0} ${(sighting.confirmations || 0) === 1 ? 'person' : 'people'} saw this</span>
        </div>
    `;

    // Update PREV/NEXT buttons
    document.getElementById('prev-btn').disabled = index === 0;
    document.getElementById('next-btn').disabled = index === allSightings.length - 1;

    // Load aircraft check
    checkAircraftMatch(sighting);
}

async function confirmSighting(sightingId) {
    try {
        const response = await fetch(`${API_BASE}/api/sightings/${sightingId}/confirm`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) throw new Error('Failed to confirm sighting');

        const data = await response.json();

        // Update button and count
        const btn = document.getElementById(`confirm-btn-${sightingId}`);
        const countSpan = document.getElementById(`confirm-count-${sightingId}`);

        if (btn) {
            btn.disabled = true;
            btn.textContent = 'You saw this too';
        }

        if (countSpan) {
            countSpan.textContent = `${data.count} ${data.count === 1 ? 'person' : 'people'} saw this`;
        }

        // Update sighting in allSightings
        const sighting = allSightings.find(s => s.id === sightingId);
        if (sighting) {
            sighting.confirmations = data.count;
            sighting.confirmed_by_me = true;
        }

        // Reload reports list to update confirmation counts
        renderReportsList();

        // Reload sighting types to update counts
        await loadSightingTypes();

    } catch (error) {
        console.error('Error confirming sighting:', error);
        alert('Failed to confirm sighting');
    }
}

async function checkAircraftMatch(sighting) {
    const container = document.getElementById(`aircraft-check-${sighting.id}`);
    if (!container) return;

    try {
        const radius = currentRewindRadius || parseInt(document.getElementById('search-radius').value) || 25;
        const response = await fetch(
            `${API_BASE}/api/rewind?lat=${sighting.lat}&lon=${sighting.lon}&time=${sighting.sighting_time}&radius=${radius}`
        );

        if (!response.ok) throw new Error('Failed to check aircraft');

        const data = await response.json();

        if (data.aircraft && data.aircraft.length > 0) {
            const aircraftList = data.aircraft.map(a =>
                `<span class="aircraft-callsign">${a.callsign || a.icao_hex}</span>`
            ).join(', ');
            container.innerHTML = `
                <div class="aircraft-match-label">AIRCRAFT CHECK:</div>
                <div>Matched: ${aircraftList}</div>
            `;
        } else {
            container.innerHTML = `
                <div class="aircraft-match-label">AIRCRAFT CHECK:</div>
                <div>No ADS-B match found</div>
            `;
        }
    } catch (error) {
        console.error('Error checking aircraft:', error);
        container.innerHTML = `
            <div class="aircraft-match-label">AIRCRAFT CHECK:</div>
            <div>—</div>
        `;
    }
}

function prevSighting() {
    if (currentSightingIndex > 0) {
        currentSightingIndex--;
        showSightingDetail(currentSightingIndex);
        renderReportsList();
    }
}

function nextSighting() {
    if (currentSightingIndex < allSightings.length - 1) {
        currentSightingIndex++;
        showSightingDetail(currentSightingIndex);
        renderReportsList();
    }
}

// ===== CHAT =====
function initChat() {
    document.getElementById('chat-send-btn').onclick = sendChat;
    document.getElementById('chat-message').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendChat();
    });

    loadChat();
    chatPollInterval = setInterval(loadChat, 3000); // Poll every 3 seconds
}

async function loadChat() {
    try {
        const response = await fetch(`${API_BASE}/api/chat`);
        if (!response.ok) throw new Error('Failed to fetch chat');

        const messages = await response.json();
        const container = document.getElementById('chat-messages');

        if (messages.length === 0) {
            container.innerHTML = '<div class="empty-state">No messages yet</div>';
            return;
        }

        // Only update if new messages
        const newestId = messages.length > 0 ? messages[messages.length - 1].id : 0;
        if (newestId === lastChatId) return;
        lastChatId = newestId;

        const wasScrolledToBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 50;

        container.innerHTML = '';
        messages.forEach(msg => {
            const msgDiv = document.createElement('div');
            msgDiv.className = 'chat-message';
            msgDiv.innerHTML = `
                <div class="chat-message-name">${escapeHtml(msg.name)}</div>
                <div class="chat-message-text">${escapeHtml(msg.message)}</div>
                <div class="chat-message-time">${formatTimeAgo(msg.timestamp)} ago</div>
            `;
            container.appendChild(msgDiv);
        });

        if (wasScrolledToBottom) {
            container.scrollTop = container.scrollHeight;
        }

    } catch (error) {
        console.error('Error loading chat:', error);
    }
}

async function sendChat() {
    if (rateLimitActive) return;

    const nameInput = document.getElementById('chat-name');
    const messageInput = document.getElementById('chat-message');
    const name = nameInput.value.trim();
    const message = messageInput.value.trim();

    if (!name || !message) {
        alert('Please enter both display name and message');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, message })
        });

        if (response.status === 429) {
            showRateLimit();
            return;
        }

        if (!response.ok) throw new Error('Failed to send message');

        messageInput.value = '';
        loadChat();

    } catch (error) {
        console.error('Error sending chat:', error);
        alert('Failed to send message');
    }
}

function showRateLimit() {
    const container = document.getElementById('chat-messages');
    const rateLimitMsg = document.createElement('div');
    rateLimitMsg.className = 'chat-rate-limit';
    rateLimitMsg.textContent = 'Rate limit: Please wait 5 seconds between messages';
    container.appendChild(rateLimitMsg);
    container.scrollTop = container.scrollHeight;

    rateLimitActive = true;
    setTimeout(() => {
        rateLimitActive = false;
        rateLimitMsg.remove();
    }, 5000);
}

// ===== PHOTO STRIP =====
async function loadPhotoStrip() {
    try {
        const response = await fetch(`${API_BASE}/api/sightings`);
        if (!response.ok) throw new Error('Failed to fetch photos');

        const sightings = await response.json();
        const container = document.getElementById('photo-strip');

        const withPhotos = sightings.filter(s => s.photo_path);

        if (withPhotos.length === 0) {
            container.innerHTML = '<div class="empty-state-photos">No photos submitted yet</div>';
            return;
        }

        container.innerHTML = '';
        withPhotos.forEach(sighting => {
            const thumb = document.createElement('div');
            thumb.className = 'photo-thumb';
            thumb.innerHTML = `
                <img src="${API_BASE}/api/uploads/${sighting.photo_path}" alt="Sighting photo">
                <div class="photo-thumb-label">#${sighting.id} - ${sighting.type || 'Unknown'}</div>
            `;
            thumb.onclick = () => {
                openLightbox(sighting.photo_path, sighting.id);
                centerOnSighting(sighting);
            };
            container.appendChild(thumb);
        });

    } catch (error) {
        console.error('Error loading photos:', error);
    }
}

// ===== LIGHTBOX =====
function openLightbox(photoPath, sightingId) {
    const lightbox = document.getElementById('lightbox');
    const img = document.getElementById('lightbox-img');
    const info = document.getElementById('lightbox-info');

    img.src = `${API_BASE}/api/uploads/${photoPath}`;

    const sighting = allSightings.find(s => s.id === sightingId);
    if (sighting) {
        info.innerHTML = `
            <div class="lightbox-info-row">
                <span class="lightbox-info-label">REPORT ID:</span>
                <span class="lightbox-info-value">#${sighting.id}</span>
            </div>
            <div class="lightbox-info-row">
                <span class="lightbox-info-label">TYPE:</span>
                <span class="lightbox-info-value">${sighting.type || 'Unknown'}</span>
            </div>
            <div class="lightbox-info-row">
                <span class="lightbox-info-label">LOCATION:</span>
                <span class="lightbox-info-value">${sighting.location_text || 'N/A'}</span>
            </div>
            <div class="lightbox-info-row">
                <span class="lightbox-info-label">TIME:</span>
                <span class="lightbox-info-value">${formatTimeAgo(sighting.sighting_time)} ago</span>
            </div>
            <div class="lightbox-info-row">
                <span class="lightbox-info-label">CONFIRMATIONS:</span>
                <span class="lightbox-info-value">${sighting.confirmations || 0}</span>
            </div>
            <div class="lightbox-info-row">
                <span class="lightbox-info-label">DESCRIPTION:</span>
                <span class="lightbox-info-value">${sighting.description}</span>
            </div>
        `;
    }

    lightbox.classList.add('active');
}

document.getElementById('lightbox-close').onclick = () => {
    document.getElementById('lightbox').classList.remove('active');
};

document.getElementById('lightbox').onclick = (e) => {
    if (e.target.id === 'lightbox') {
        document.getElementById('lightbox').classList.remove('active');
    }
};

// ===== MODALS =====
function initModals() {
    const reportBtn = document.getElementById('report-btn');
    const modalOverlay = document.getElementById('modal-overlay');
    const reportModal = document.getElementById('report-modal');
    const modalClose = document.getElementById('modal-close');
    const modalCancel = document.getElementById('modal-cancel');
    const reportForm = document.getElementById('report-form');

    reportBtn.onclick = () => {
        modalOverlay.classList.add('active');
        reportModal.classList.add('active');

        // Pre-fill with map center
        const center = map.getCenter();
        reportForm.lat.value = center.lat.toFixed(6);
        reportForm.lon.value = center.lng.toFixed(6);

        // Pre-fill with current time
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        reportForm.sighting_time.value = now.toISOString().slice(0, 16);
    };

    function closeModal() {
        modalOverlay.classList.remove('active');
        reportModal.classList.remove('active');
    }

    modalClose.onclick = closeModal;
    modalCancel.onclick = closeModal;
    modalOverlay.onclick = closeModal;

    reportForm.onsubmit = async (e) => {
        e.preventDefault();

        const formData = new FormData(reportForm);

        try {
            const response = await fetch(`${API_BASE}/api/sightings`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(error);
            }

            closeModal();
            reportForm.reset();

            // Reload data
            await loadReports();
            await loadSightingTypes();
            await loadPhotoStrip();

            alert('Sighting reported successfully!');

        } catch (error) {
            console.error('Error submitting report:', error);
            alert('Failed to submit report: ' + error.message);
        }
    };

    // PREV/NEXT buttons
    document.getElementById('prev-btn').onclick = prevSighting;
    document.getElementById('next-btn').onclick = nextSighting;
}

// Map click for coordinates
map?.on('click', (e) => {
    const form = document.getElementById('report-form');
    if (form && document.getElementById('report-modal').classList.contains('active')) {
        form.lat.value = e.latlng.lat.toFixed(6);
        form.lon.value = e.latlng.lng.toFixed(6);
    }
});

// ===== UTILITIES =====
function formatTimeAgo(timestamp) {
    const now = new Date();
    const then = new Date(timestamp);
    const seconds = Math.floor((now - then) / 1000);

    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function updateClock() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
    const dateStr = now.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
    document.getElementById('current-time').textContent = `${timeStr} ${dateStr}`;
}
