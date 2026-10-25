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
let lastSeenChatId = 0; // For notification tracking
let rateLimitActive = false;
let rewindMode = false;
let currentRewindTime = null;
let currentRewindLat = null;
let currentRewindLon = null;
let currentRewindRadius = 25;
let notificationsEnabled = false;
let pushSubscription = null;
let currentTheme = localStorage.getItem('skyrewind-theme') || 'command';
let currentTileLayer = null;
let userLocationMarker = null;
let userLocationCoords = null;
let rewindRequestId = 0; // Track rewind requests to ignore stale responses
let sliderDebounceTimer = null; // Debounce timer for slider changes

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initMap();
    initModals();
    initChat();
    initNotifications();
    initRewindControls();
    initMobileMenu();
    initMyLocation();
    initTutorial();
    loadSightingTypes();
    loadReports();
    loadPhotoStrip();
    startLiveUpdates();
    updateClock();
    setInterval(updateClock, 1000);
});

// ===== THEME SYSTEM =====
function initTheme() {
    const themeSelect = document.getElementById('theme-select');

    // Set initial theme in select
    themeSelect.value = currentTheme;

    // Theme change handler
    themeSelect.addEventListener('change', (e) => {
        changeTheme(e.target.value);
    });

    // Mobile menu theme button
    const mobileThemeBtn = document.getElementById('mobile-menu-theme');
    if (mobileThemeBtn) {
        mobileThemeBtn.addEventListener('click', () => {
            showMobileThemeModal();
        });
    }
}

function changeTheme(theme) {
    currentTheme = theme;

    // Update HTML attribute
    document.documentElement.setAttribute('data-theme', theme);

    // Save to localStorage
    localStorage.setItem('skyrewind-theme', theme);

    // Update theme-color meta for PWA
    const themeColors = {
        'command': '#0f1419',
        'light': '#f5f7fa',
        'high-contrast': '#000000',
        'amber-terminal': '#0d0a00',
        'red-black': '#000000'
    };

    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    if (themeColorMeta) {
        themeColorMeta.content = themeColors[theme] || '#0f1419';
    }

    // Update map basemap
    if (map && currentTileLayer) {
        updateMapBasemap(theme);
    }

    // Update theme select if changed via mobile
    const themeSelect = document.getElementById('theme-select');
    if (themeSelect) {
        themeSelect.value = theme;
    }
}

function updateMapBasemap(theme) {
    // Remove existing tile layer
    if (currentTileLayer) {
        map.removeLayer(currentTileLayer);
    }

    // Choose basemap based on theme
    if (theme === 'light') {
        // Light basemap for light theme
        currentTileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            maxZoom: 16,
            subdomains: 'abcd'
        });
    } else {
        // Dark basemap for all other themes
        currentTileLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
            attribution: 'Esri',
            maxZoom: 16
        });
    }

    currentTileLayer.addTo(map);
}

function showMobileThemeModal() {
    const themes = [
        { value: 'command', label: 'Command (Dark)' },
        { value: 'light', label: 'Light' },
        { value: 'high-contrast', label: 'High Contrast' },
        { value: 'amber-terminal', label: 'Amber Terminal' },
        { value: 'red-black', label: 'Red & Black' }
    ];

    const buttonsHtml = themes.map(t =>
        `<button class="mobile-menu-item" onclick="changeTheme('${t.value}'); closeMobileMenu();" style="background: ${t.value === currentTheme ? 'var(--input-bg)' : 'var(--panel-bg)'}; border-color: ${t.value === currentTheme ? 'var(--accent)' : 'var(--panel-border)'};">${t.value === currentTheme ? '✓ ' : ''}${t.label}</button>`
    ).join('');

    // Use modal for theme selection on mobile
    const modal = document.getElementById('report-modal');
    const modalContent = modal.querySelector('.modal-content');
    const modalHeader = modal.querySelector('.modal-header span');
    const modalOverlay = document.getElementById('modal-overlay');

    modalHeader.textContent = 'Choose Theme';
    modalContent.innerHTML = `<div style="display: flex; flex-direction: column; gap: 8px;">${buttonsHtml}</div>`;

    modal.classList.add('active');
    modalOverlay.classList.add('active');
}

function closeMobileMenu() {
    const mobileMenu = document.getElementById('mobile-menu');
    const mobileMenuOverlay = document.getElementById('mobile-menu-overlay');

    mobileMenu.classList.remove('active');
    mobileMenuOverlay.classList.remove('active');

    // Reset hamburger button
    const hamburgerBtn = document.getElementById('hamburger-btn');
    if (hamburgerBtn) {
        hamburgerBtn.classList.remove('active');
    }
}

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

    // Choose tile layer based on current theme
    if (currentTheme === 'light') {
        // Light basemap for light theme
        currentTileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            maxZoom: 16,
            subdomains: 'abcd'
        });
    } else {
        // Dark basemap for all other themes
        currentTileLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
            attribution: 'Esri',
            maxZoom: 16
        });
    }

    currentTileLayer.addTo(map);

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

// ===== REWIND CONTROLS (Feature 4: 24-Hour Slider) =====
function initRewindControls() {
    const timeSlider = document.getElementById('time-slider');
    const timeReadout = document.getElementById('time-readout');
    const backToLiveBtn = document.getElementById('back-to-live-btn');
    const sightingSelect = document.getElementById('sighting-select');

    // Initialize time readout to now
    updateTimeReadout(288);

    // Slider input event (continuous updates while dragging)
    timeSlider.addEventListener('input', (e) => {
        const sliderValue = parseInt(e.target.value);
        updateTimeReadout(sliderValue);
    });

    // Slider change event (debounced to prevent rapid-fire requests during dragging)
    timeSlider.addEventListener('change', (e) => {
        const sliderValue = parseInt(e.target.value);

        // Clear any pending debounce timer
        if (sliderDebounceTimer) {
            clearTimeout(sliderDebounceTimer);
        }

        // Debounce: wait 250ms after slider stops moving
        sliderDebounceTimer = setTimeout(() => {
            handleSliderChange(sliderValue);
            sliderDebounceTimer = null;
        }, 250);
    });

    // Back to live button
    backToLiveBtn.onclick = () => {
        timeSlider.value = 288; // Snap to now
        updateTimeReadout(288);
        exitRewindMode();
    };

    // Sighting jump
    sightingSelect.addEventListener('change', (e) => {
        const index = parseInt(e.target.value);
        if (!isNaN(index) && allSightings[index]) {
            jumpToSighting(index);
        }
    });

    // Radius change: refresh rewind data AND zoom map to fit radius
    const radiusSelect = document.getElementById('search-radius');
    radiusSelect.addEventListener('change', () => {
        if (rewindMode && currentRewindTime && currentRewindLat && currentRewindLon) {
            const newRadius = parseInt(radiusSelect.value) || 25;
            console.log(`[REWIND] Radius changed to ${newRadius} mi, refreshing...`);

            // Calculate appropriate zoom level for the radius
            const zoomLevel = getZoomForRadius(newRadius);

            // Zoom map to fit the new radius
            map.setView([currentRewindLat, currentRewindLon], zoomLevel);

            // Refresh rewind data with new radius
            enterRewindMode(currentRewindTime, currentRewindLat, currentRewindLon, newRadius);
        }
    });
}

function getZoomForRadius(radiusMiles) {
    // Calculate zoom level to fit radius in view
    // Leaflet zoom levels (approximate coverage at center latitude ~41°):
    // Zoom 14: ~3 miles, 13: ~6 mi, 12: ~12 mi, 11: ~25 mi, 10: ~50 mi, 9: ~100 mi
    if (radiusMiles <= 5) return 13;
    if (radiusMiles <= 12) return 12;
    if (radiusMiles <= 25) return 11;
    if (radiusMiles <= 50) return 10;
    return 9; // 100+ miles
}

function sliderValueToTimestamp(sliderValue) {
    // Slider: 0 = 24 hours ago, 288 = now
    // Each step = 5 minutes (24 hours * 60 min / 288 steps = 5 min)
    const now = new Date();
    const minutesAgo = (288 - sliderValue) * 5;
    const timestamp = new Date(now.getTime() - minutesAgo * 60 * 1000);
    return timestamp;
}

function timestampToSliderValue(timestamp) {
    // Convert a timestamp to slider value (0-288)
    const now = new Date();
    const ts = new Date(timestamp);
    const minutesAgo = Math.floor((now - ts) / (60 * 1000));
    const sliderValue = Math.max(0, Math.min(288, 288 - Math.floor(minutesAgo / 5)));
    return sliderValue;
}

function updateTimeReadout(sliderValue) {
    const timeReadout = document.getElementById('time-readout');

    if (sliderValue === 288) {
        timeReadout.textContent = 'NOW (Live)';
    } else {
        const timestamp = sliderValueToTimestamp(sliderValue);
        const formatted = timestamp.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        timeReadout.textContent = formatted;
    }
}

function handleSliderChange(sliderValue) {
    if (sliderValue === 288) {
        // At NOW position = LIVE mode
        exitRewindMode();
    } else {
        // Scrubbed back = REWIND mode
        const timestamp = sliderValueToTimestamp(sliderValue);
        const center = map.getCenter();
        const radius = parseInt(document.getElementById('search-radius').value) || 25;

        // Zoom map to fit the radius
        const zoomLevel = getZoomForRadius(radius);
        map.setView([center.lat, center.lng], zoomLevel);

        enterRewindMode(timestamp.toISOString(), center.lat, center.lng, radius);
    }
}

function jumpToSighting(index) {
    const sighting = allSightings[index];
    if (!sighting) return;

    // Calculate slider value for sighting's time
    const sliderValue = timestampToSliderValue(sighting.sighting_time);

    // Set slider position
    const timeSlider = document.getElementById('time-slider');
    timeSlider.value = sliderValue;
    updateTimeReadout(sliderValue);

    // Enter rewind mode at sighting's time and location
    const radius = parseInt(document.getElementById('search-radius').value) || 25;

    // Zoom map to fit the radius around sighting location
    const zoomLevel = getZoomForRadius(radius);
    map.setView([sighting.lat, sighting.lon], zoomLevel);

    enterRewindMode(sighting.sighting_time, sighting.lat, sighting.lon, radius);

    // Show the sighting details
    currentSightingIndex = index;
    showSightingDetail(index);
    renderReportsList();
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

    // CRITICAL: Clear ALL markers (live AND rewind) before loading new rewind data
    Object.values(aircraftMarkers).forEach(marker => map.removeLayer(marker));
    aircraftMarkers = {};

    Object.values(rewindMarkers).forEach(marker => map.removeLayer(marker));
    rewindMarkers = {};

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

    // Reset slider to NOW position
    const timeSlider = document.getElementById('time-slider');
    if (timeSlider && timeSlider.value !== '288') {
        timeSlider.value = 288;
        updateTimeReadout(288);
    }

    // Clear rewind markers
    Object.values(rewindMarkers).forEach(marker => map.removeLayer(marker));
    rewindMarkers = {};

    // Resume live updates
    startLiveUpdates();
}

async function loadRewindData(time, lat, lon, radius) {
    // Increment request ID to track this request
    const thisRequestId = ++rewindRequestId;

    try {
        const response = await fetch(
            `${API_BASE}/api/rewind?lat=${lat}&lon=${lon}&time=${time}&radius=${radius}`
        );

        if (!response.ok) throw new Error('Failed to load rewind data');

        const observations = await response.json(); // Returns array directly, not {aircraft: [...]}

        // CRITICAL: Ignore stale responses (a newer request was made while this one was in flight)
        if (thisRequestId !== rewindRequestId) {
            console.log(`[REWIND] Ignoring stale response ${thisRequestId} (current: ${rewindRequestId})`);
            return;
        }

        // CRITICAL: Clear old rewind markers AGAIN before rendering (in case multiple calls raced)
        Object.values(rewindMarkers).forEach(marker => map.removeLayer(marker));
        rewindMarkers = {};

        console.log(`[REWIND] Processing ${observations.length} raw observations`);

        if (Array.isArray(observations) && observations.length > 0) {
            // DEDUPLICATE: Group by icao_hex and keep only the closest timestamp to requested time
            const requestedTime = new Date(time).getTime();
            const aircraftMap = new Map();

            observations.forEach(obs => {
                const icao = obs.icao_hex;
                if (!icao) {
                    console.warn('[REWIND] Skipping observation with missing icao_hex:', obs);
                    return;
                }

                const obsTime = new Date(obs.timestamp).getTime();
                const timeDiff = Math.abs(requestedTime - obsTime);

                if (!aircraftMap.has(icao)) {
                    aircraftMap.set(icao, { obs, timeDiff });
                } else {
                    const existing = aircraftMap.get(icao);
                    if (timeDiff < existing.timeDiff) {
                        aircraftMap.set(icao, { obs, timeDiff });
                    }
                }
            });

            // Plot only the deduplicated aircraft (one position per aircraft)
            const uniqueAircraft = Array.from(aircraftMap.values()).map(item => item.obs);

            console.log(`[REWIND] Deduped to ${uniqueAircraft.length} unique aircraft`);

            uniqueAircraft.forEach(a => {
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

                // CRITICAL: Store ONLY ONE marker per icao_hex (deduplicated)
                // If a duplicate key somehow gets through, it will overwrite (not accumulate)
                rewindMarkers[a.icao_hex] = marker;
            });

            // Update flights count with UNIQUE aircraft count
            const finalMarkerCount = Object.keys(rewindMarkers).length;
            console.log(`[REWIND] Rendered ${finalMarkerCount} markers on map`);

            document.getElementById('flights-count').textContent = finalMarkerCount;
            document.getElementById('aircraft-count').textContent = finalMarkerCount;
        } else {
            // No recorded aircraft for this time - honest empty state
            document.getElementById('flights-count').textContent = '0';
            document.getElementById('aircraft-count').textContent = '0';
        }

    } catch (error) {
        console.error('Error loading rewind data:', error);
        // Don't alert for network errors, just log them
        document.getElementById('flights-count').textContent = '0';
        document.getElementById('aircraft-count').textContent = '0';
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

        const aircraft = await response.json(); // Returns array directly

        if (Array.isArray(aircraft) && aircraft.length > 0) {
            const aircraftList = aircraft.map(a =>
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

        // Check for new messages for notifications
        if (notificationsEnabled && lastSeenChatId > 0 && newestId > lastSeenChatId) {
            // Find new messages since last seen
            const newMessages = messages.filter(m => m.id > lastSeenChatId);
            // Show notification for the most recent new message
            if (newMessages.length > 0) {
                const latestMsg = newMessages[newMessages.length - 1];
                showChatNotification(latestMsg.name, latestMsg.message);
            }
        }

        lastChatId = newestId;
        if (notificationsEnabled) {
            lastSeenChatId = newestId;
        }

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

// ===== NOTIFICATIONS =====
function initNotifications() {
    const toggleBtn = document.getElementById('notification-toggle-btn');
    if (!toggleBtn) return;

    // Check if notifications are supported
    if (!('Notification' in window)) {
        toggleBtn.textContent = '🔕 N/A';
        toggleBtn.disabled = true;
        toggleBtn.title = 'Notifications not supported in this browser';
        return;
    }

    // Update button based on current permission
    updateNotificationButton();

    // Set up toggle handler
    toggleBtn.onclick = toggleNotifications;

    // Listen for service worker messages
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', (event) => {
            if (event.data.action === 'focusChat') {
                // Scroll to chat panel or focus chat input
                document.getElementById('chat-message')?.focus();
            }
        });
    }
}

function updateNotificationButton() {
    const toggleBtn = document.getElementById('notification-toggle-btn');
    if (!toggleBtn) return;

    if (Notification.permission === 'granted' && notificationsEnabled) {
        toggleBtn.textContent = '🔔 ON';
        toggleBtn.title = 'Disable chat notifications';
    } else if (Notification.permission === 'granted') {
        toggleBtn.textContent = '🔔 OFF';
        toggleBtn.title = 'Enable chat notifications';
    } else if (Notification.permission === 'denied') {
        toggleBtn.textContent = '🔕 DENIED';
        toggleBtn.title = 'Notifications blocked - check browser settings';
        toggleBtn.disabled = true;
    } else {
        toggleBtn.textContent = '🔔 OFF';
        toggleBtn.title = 'Enable chat notifications';
    }
}

async function toggleNotifications() {
    if (Notification.permission === 'denied') {
        alert('Notifications are blocked. Please enable them in your browser settings.');
        return;
    }

    if (!notificationsEnabled) {
        // Request permission if needed
        if (Notification.permission === 'default') {
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                updateNotificationButton();
                return;
            }
        }

        // Enable notifications
        notificationsEnabled = true;
        lastSeenChatId = lastChatId; // Start tracking from current position
        updateNotificationButton();

        // Request push subscription for background notifications
        await requestPushSubscription();

        // Show confirmation
        new Notification('SkyRewind Notifications', {
            body: 'Chat notifications enabled! You\'ll be notified of new messages.',
            icon: '/static/icons/icon-192.png',
            tag: 'notification-enabled'
        });
    } else {
        // Disable notifications
        notificationsEnabled = false;
        updateNotificationButton();

        // Unsubscribe from push
        await unsubscribePush();
    }
}

async function requestPushSubscription() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.log('Push notifications not supported');
        return;
    }

    try {
        const registration = await navigator.serviceWorker.ready;

        // Check if already subscribed
        let subscription = await registration.pushManager.getSubscription();

        if (!subscription) {
            // Subscribe to push notifications with VAPID public key
            const vapidPublicKey = 'BLIvgAHlr9aJBdp2hNbUZfPbLigZMpM3vBSu7pZtW6ZBb_789tmarYdT9vvWMcsViW8hzgcjG1o9jCdTTUmoWvA';

            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
            });
        }

        // Send subscription to server
        await fetch(`${API_BASE}/api/push/subscribe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(subscription)
        });

        pushSubscription = subscription;
        console.log('Push subscription successful');
    } catch (error) {
        console.error('Push subscription failed:', error);
    }
}

async function unsubscribePush() {
    if (!pushSubscription) return;

    try {
        await fetch(`${API_BASE}/api/push/unsubscribe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(pushSubscription)
        });

        await pushSubscription.unsubscribe();
        pushSubscription = null;
        console.log('Push unsubscribed');
    } catch (error) {
        console.error('Push unsubscribe failed:', error);
    }
}

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

function showChatNotification(sender, message) {
    if (!notificationsEnabled || Notification.permission !== 'granted') return;
    if (document.hasFocus()) return; // Don't show if app is focused

    const notification = new Notification(`${sender} (SkyRewind Chat)`, {
        body: message.substring(0, 100) + (message.length > 100 ? '...' : ''),
        icon: '/static/icons/icon-192.png',
        badge: '/static/icons/icon-192.png',
        tag: 'chat-message',
        requireInteraction: false
    });

    notification.onclick = () => {
        window.focus();
        document.getElementById('chat-message')?.focus();
        notification.close();
    };
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

// ===== MOBILE MENU =====
let mobileMenuOpen = false;

function initMobileMenu() {
    const hamburgerBtn = document.getElementById('hamburger-btn');
    const mobileMenu = document.getElementById('mobile-menu');
    const mobileMenuOverlay = document.getElementById('mobile-menu-overlay');
    const mobileMenuClose = document.getElementById('mobile-menu-close');

    if (!hamburgerBtn) return;

    const toggleMenu = () => {
        mobileMenuOpen = !mobileMenuOpen;
        hamburgerBtn.classList.toggle('active');
        mobileMenu.classList.toggle('active');
        mobileMenuOverlay.classList.toggle('active');
    };

    hamburgerBtn.onclick = toggleMenu;
    mobileMenuClose.onclick = toggleMenu;
    mobileMenuOverlay.onclick = toggleMenu;

    // Menu item actions
    document.getElementById('mobile-menu-report').onclick = () => {
        toggleMenu();
        document.getElementById('report-btn').click();
    };

    document.getElementById('mobile-menu-chat').onclick = () => {
        toggleMenu();
        document.getElementById('chat-message')?.focus();
        document.getElementById('chat-message')?.scrollIntoView({ behavior: 'smooth' });
    };

    document.getElementById('mobile-menu-notifications').onclick = () => {
        toggleMenu();
        toggleNotifications();
    };

    document.getElementById('mobile-menu-tutorial').onclick = () => {
        toggleMenu();
        showTutorial();
    };

    document.getElementById('mobile-menu-install').onclick = () => {
        toggleMenu();
        promptInstall();
    };
}

// ===== MY LOCATION (GEOLOCATION) =====

function initMyLocation() {
    const myLocationBtn = document.getElementById('my-location-btn');
    if (!myLocationBtn) return;

    myLocationBtn.onclick = () => {
        // If marker exists and GPS coords are saved, snap back to GPS
        if (userLocationMarker && userLocationCoords) {
            const currentPos = userLocationMarker.getLatLng();
            const gpsLat = userLocationCoords.lat;
            const gpsLon = userLocationCoords.lon;

            // Check if marker has been moved
            const distance = Math.abs(currentPos.lat - gpsLat) + Math.abs(currentPos.lng - gpsLon);
            if (distance > 0.0001) { // About 10 meters
                // Snap back to GPS position
                userLocationMarker.setLatLng([gpsLat, gpsLon]);
                map.setView([gpsLat, gpsLon], map.getZoom());
                showLocationReadout(gpsLat, gpsLon);
                userLocationMarker.openPopup();

                // Update rewind center
                if (currentRewindLat !== null && currentRewindLon !== null) {
                    currentRewindLat = gpsLat;
                    currentRewindLon = gpsLon;
                }
                return;
            }
        }

        // Otherwise, request GPS location
        findMyLocation();
    };
}

function findMyLocation() {
    const myLocationBtn = document.getElementById('my-location-btn');

    // Check if geolocation is supported
    if (!('geolocation' in navigator)) {
        showLocationError('Location services not supported on this device');
        return;
    }

    // Request user location (requires user gesture - never auto-request)
    myLocationBtn.classList.add('locating');
    myLocationBtn.disabled = true;

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;

            // Save GPS coords for snap-back
            userLocationCoords = { lat, lon };

            // Center map on user location
            map.setView([lat, lon], 12);

            // Create or update draggable marker
            createDraggableLocationMarker(lat, lon);

            // Offer to re-center rewind radius (don't silently change if user already set one)
            if (currentRewindLat !== null && currentRewindLon !== null) {
                if (confirm('Set your location as the rewind center?')) {
                    currentRewindLat = lat;
                    currentRewindLon = lon;
                }
            } else {
                // First time - set rewind center to user location
                currentRewindLat = lat;
                currentRewindLon = lon;
            }

            myLocationBtn.classList.remove('locating');
            myLocationBtn.disabled = false;

            showLocationReadout(lat, lon);
        },
        (error) => {
            myLocationBtn.classList.remove('locating');
            myLocationBtn.disabled = false;

            // Handle errors honestly
            let message = 'Location unavailable';
            if (error.code === error.PERMISSION_DENIED) {
                message = 'Location permission denied. Enable in browser settings.';
            } else if (error.code === error.POSITION_UNAVAILABLE) {
                message = 'Location unavailable - position unavailable';
            } else if (error.code === error.TIMEOUT) {
                message = 'Location request timed out';
            }

            showLocationError(message);
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        }
    );
}

function createDraggableLocationMarker(lat, lon) {
    // Remove old marker if exists
    if (userLocationMarker) {
        map.removeLayer(userLocationMarker);
    }

    // Create draggable "you are here" marker (distinct from aircraft/reports)
    const icon = L.divIcon({
        className: 'user-location-marker-container',
        html: '<div class="user-location-marker"></div>',
        iconSize: [24, 24],
        iconAnchor: [12, 12]
    });

    userLocationMarker = L.marker([lat, lon], {
        icon: icon,
        draggable: true,
        autoPan: true
    })
    .bindPopup('<strong>Your location</strong><br><small>Drag to move</small>')
    .addTo(map);

    // Update coordinates on drag
    userLocationMarker.on('drag', (e) => {
        const pos = e.target.getLatLng();
        showLocationReadout(pos.lat, pos.lng);

        // Update rewind center if it was set to user location
        if (currentRewindLat !== null && currentRewindLon !== null) {
            currentRewindLat = pos.lat;
            currentRewindLon = pos.lng;
        }
    });

    userLocationMarker.on('dragend', (e) => {
        const pos = e.target.getLatLng();
        showLocationReadout(pos.lat, pos.lng);
    });

    // Open popup automatically to show drag hint
    userLocationMarker.openPopup();
}

function showLocationReadout(lat, lon) {
    // Create readout element if it doesn't exist
    let readout = document.getElementById('location-readout');
    if (!readout) {
        readout = document.createElement('div');
        readout.id = 'location-readout';
        readout.className = 'location-readout monospace';
        document.querySelector('.panel-map').appendChild(readout);
    }

    // Format coordinates to 5 decimal places
    const latStr = lat.toFixed(5);
    const lonStr = lon.toFixed(5);

    readout.textContent = `📍 ${latStr}, ${lonStr}`;
    readout.classList.add('active');

    // Hide after 5 seconds (but show again on drag)
    clearTimeout(window.locationReadoutTimer);
    window.locationReadoutTimer = setTimeout(() => {
        readout.classList.remove('active');
    }, 5000);
}

function showLocationError(message) {
    // Non-blocking error message
    const notification = document.createElement('div');
    notification.className = 'location-error-toast';
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: #c96c6c;
        color: #fff;
        padding: 12px 20px;
        border-radius: 4px;
        font-size: 12px;
        z-index: 5000;
        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
    `;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.remove();
    }, 5000);
}

// ===== TUTORIAL =====
let installPromptEvent = null;

const TUTORIAL_STEPS = [
    {
        title: 'Welcome to SkyRewind',
        content: 'SkyRewind is a UAP sighting log + live aircraft cross-check for the Omaha area. Log sightings, see live aircraft, and check if your sighting matches a known flight.'
    },
    {
        title: 'The Map',
        content: 'The map shows live aircraft with different icons: 🛩️ General Aviation, ✈️ Passenger Jets, 📦 Cargo, 🛫 Other. Tap any aircraft to see details. Red markers are UAP reports.'
    },
    {
        title: 'Report a Sighting',
        content: 'Tap "Report Sighting" to submit a UAP report. Include the type (disc, sphere, triangle, etc.) and optionally a photo. Reports appear on the map for others to see.'
    },
    {
        title: '24-Hour Rewind',
        content: 'Drag the time slider at the bottom to rewind 24 hours and see past aircraft. This helps check if your sighting matched a known flight. Tap "Back to Live" to return.'
    },
    {
        title: 'Chat, Location & Themes',
        content: 'Use Group Chat to discuss sightings. Tap "I saw this too" on reports you witnessed. The 📍 button finds your location (drag the pin to move it). Choose from 5 color themes in the header.'
    }
];

function initTutorial() {
    const helpBtn = document.getElementById('help-btn');
    if (helpBtn) {
        helpBtn.onclick = showTutorial;
    }

    // Check if first visit
    if (!localStorage.getItem('skyrewind-tutorial-seen')) {
        // Show tutorial on first visit
        setTimeout(() => {
            showTutorial();
        }, 1000);
    }

    // Listen for beforeinstallprompt event
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        installPromptEvent = e;
        console.log('Install prompt captured');
    });
}

function showTutorial() {
    const overlay = document.getElementById('tutorial-overlay');
    overlay.classList.add('active');

    let currentStep = 0;
    renderTutorialStep(currentStep);

    const closeBtn = document.getElementById('tutorial-close');
    const skipBtn = document.getElementById('tutorial-skip');
    const prevBtn = document.getElementById('tutorial-prev');
    const nextBtn = document.getElementById('tutorial-next');

    const closeTutorial = () => {
        overlay.classList.remove('active');
        localStorage.setItem('skyrewind-tutorial-seen', 'true');

        // Show install prompt after tutorial if available
        if (installPromptEvent && isMobile()) {
            setTimeout(() => {
                promptInstall();
            }, 500);
        }
    };

    closeBtn.onclick = closeTutorial;
    skipBtn.onclick = closeTutorial;

    prevBtn.onclick = () => {
        if (currentStep > 0) {
            currentStep--;
            renderTutorialStep(currentStep);
        }
    };

    nextBtn.onclick = () => {
        if (currentStep < TUTORIAL_STEPS.length - 1) {
            currentStep++;
            renderTutorialStep(currentStep);
        } else {
            closeTutorial();
        }
    };

    function renderTutorialStep(step) {
        const content = document.getElementById('tutorial-content');
        const progress = document.getElementById('tutorial-progress');
        const prevBtn = document.getElementById('tutorial-prev');
        const nextBtn = document.getElementById('tutorial-next');

        const tutorialStep = TUTORIAL_STEPS[step];
        content.innerHTML = `
            <h3>${tutorialStep.title}</h3>
            <p>${tutorialStep.content}</p>
        `;

        // Progress dots
        progress.innerHTML = TUTORIAL_STEPS.map((_, i) =>
            `<div class="tutorial-progress-dot ${i === step ? 'active' : ''}"></div>`
        ).join('');

        // Navigation buttons
        prevBtn.style.display = step > 0 ? 'block' : 'none';
        nextBtn.textContent = step < TUTORIAL_STEPS.length - 1 ? 'Next →' : 'Done';
    }
}

function isMobile() {
    return window.innerWidth < 768 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function promptInstall() {
    if (!installPromptEvent) {
        // No install prompt available
        if (isMobile()) {
            alert('To install SkyRewind:\n\niOS: Tap Share → Add to Home Screen\n\nAndroid: Open menu → Install app or Add to Home screen');
        } else {
            alert('Install option not available. Check your browser\'s address bar for an install icon, or bookmark this page.');
        }
        return;
    }

    installPromptEvent.prompt();
    installPromptEvent.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
            console.log('User accepted install');
        }
        installPromptEvent = null;
    });
}

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
