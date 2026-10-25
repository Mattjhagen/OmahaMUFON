import sqlite3
from datetime import datetime, timedelta, timezone
import os

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'skyrewind.db')
REWIND_DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'rewind.db')

def get_db():
    """Get database connection for sightings."""
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def get_rewind_db():
    """Get database connection for rewind archive."""
    os.makedirs(os.path.dirname(REWIND_DB_PATH), exist_ok=True)
    conn = sqlite3.connect(REWIND_DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Initialize sightings database schema."""
    conn = get_db()
    cursor = conn.cursor()

    # Sighting reports
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS sightings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            reporter_name TEXT NOT NULL,
            sighting_time TEXT NOT NULL,
            lat REAL NOT NULL,
            lon REAL NOT NULL,
            location_text TEXT,
            bearing REAL,
            elevation REAL,
            description TEXT NOT NULL,
            duration TEXT,
            photo_path TEXT,
            type TEXT,
            created_at TEXT NOT NULL
        )
    ''')

    cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_sighting_time
        ON sightings(sighting_time)
    ''')

    # Chat messages
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS chat (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            message TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            ip TEXT
        )
    ''')

    cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_chat_timestamp
        ON chat(timestamp DESC)
    ''')

    conn.commit()
    conn.close()

def init_rewind_db():
    """Initialize rewind archive database schema."""
    conn = get_rewind_db()
    cursor = conn.cursor()

    # Aircraft observation archive
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS observations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            source TEXT NOT NULL,
            icao_hex TEXT NOT NULL,
            callsign TEXT,
            registration TEXT,
            lat REAL NOT NULL,
            lon REAL NOT NULL,
            altitude INTEGER,
            ground_speed REAL,
            track REAL,
            squawk TEXT
        )
    ''')

    cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_timestamp
        ON observations(timestamp)
    ''')

    cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_icao
        ON observations(icao_hex)
    ''')

    cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_source
        ON observations(source)
    ''')

    conn.commit()
    conn.close()

def insert_observation(timestamp, source, icao_hex, callsign, registration, lat, lon, altitude, ground_speed, track, squawk):
    """Insert a new aircraft observation."""
    conn = get_rewind_db()
    cursor = conn.cursor()

    cursor.execute('''
        INSERT INTO observations
        (timestamp, source, icao_hex, callsign, registration, lat, lon, altitude, ground_speed, track, squawk)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (timestamp, source, icao_hex, callsign, registration, lat, lon, altitude, ground_speed, track, squawk))

    conn.commit()
    conn.close()

def get_rewind_observations(start_time, end_time, lat, lon, radius_miles):
    """Get observations within time range and radius."""
    conn = get_rewind_db()
    cursor = conn.cursor()

    # Get all observations in time range
    cursor.execute('''
        SELECT * FROM observations
        WHERE timestamp >= ? AND timestamp <= ?
        ORDER BY timestamp
    ''', (start_time, end_time))

    observations = [dict(row) for row in cursor.fetchall()]
    conn.close()

    # Filter by distance (haversine)
    import math
    R = 3959  # Earth radius in miles

    filtered = []
    for obs in observations:
        lat1_rad = math.radians(lat)
        lat2_rad = math.radians(obs['lat'])
        delta_lat = math.radians(obs['lat'] - lat)
        delta_lon = math.radians(obs['lon'] - lon)

        a = math.sin(delta_lat / 2) ** 2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon / 2) ** 2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        distance = R * c

        if distance <= radius_miles:
            obs['distance_miles'] = round(distance, 2)
            filtered.append(obs)

    return filtered

def prune_old_observations(days=90):
    """Remove observations older than specified days."""
    conn = get_rewind_db()
    cursor = conn.cursor()

    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    cursor.execute('DELETE FROM observations WHERE timestamp < ?', (cutoff,))
    deleted = cursor.rowcount

    conn.commit()
    conn.close()

    return deleted

def insert_sighting(reporter_name, sighting_time, lat, lon, location_text,
                   bearing, elevation, description, duration, photo_path, sighting_type=None):
    """Insert a new sighting report."""
    conn = get_db()
    cursor = conn.cursor()

    created_at = datetime.now(timezone.utc).isoformat()

    cursor.execute('''
        INSERT INTO sightings
        (reporter_name, sighting_time, lat, lon, location_text, bearing,
         elevation, description, duration, photo_path, type, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (reporter_name, sighting_time, lat, lon, location_text, bearing,
          elevation, description, duration, photo_path, sighting_type, created_at))

    sighting_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return sighting_id

def get_sightings():
    """Get all sighting reports."""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        SELECT * FROM sightings
        ORDER BY sighting_time DESC
    ''')

    sightings = [dict(row) for row in cursor.fetchall()]
    conn.close()

    return sightings

def get_sighting(sighting_id):
    """Get a specific sighting by ID."""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('SELECT * FROM sightings WHERE id = ?', (sighting_id,))
    row = cursor.fetchone()
    conn.close()

    return dict(row) if row else None

def insert_chat_message(name, message, ip):
    """Insert a new chat message."""
    conn = get_db()
    cursor = conn.cursor()
    timestamp = datetime.now(timezone.utc).isoformat()
    cursor.execute('''
        INSERT INTO chat (name, message, timestamp, ip)
        VALUES (?, ?, ?, ?)
    ''', (name, message, timestamp, ip))
    conn.commit()
    conn.close()

def get_chat_messages(limit=50):
    """Get recent chat messages."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT * FROM chat
        ORDER BY timestamp DESC
        LIMIT ?
    ''', (limit,))
    messages = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return list(reversed(messages))

def get_sighting_types_count():
    """Get count of sightings by type."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT type, COUNT(*) as count
        FROM sightings
        WHERE type IS NOT NULL
        GROUP BY type
    ''')
    types = {row['type']: row['count'] for row in cursor.fetchall()}
    conn.close()
    return types
