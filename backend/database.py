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
    """Initialize sightings database schema with migration support."""
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

    # Sighting confirmations (Feature 3: "I saw this too")
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS sighting_confirmations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sighting_id INTEGER NOT NULL,
            ip TEXT NOT NULL,
            created_at TEXT NOT NULL,
            UNIQUE(sighting_id, ip),
            FOREIGN KEY (sighting_id) REFERENCES sightings(id) ON DELETE CASCADE
        )
    ''')

    cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_confirmation_sighting
        ON sighting_confirmations(sighting_id)
    ''')

    # Push subscriptions for Web Push notifications
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS push_subscriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            endpoint TEXT NOT NULL UNIQUE,
            p256dh TEXT NOT NULL,
            auth TEXT NOT NULL,
            ip TEXT,
            created_at TEXT NOT NULL
        )
    ''')

    cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_push_endpoint
        ON push_subscriptions(endpoint)
    ''')

    # Migration: Add missing columns to existing tables
    # Define desired schema for each table
    desired_columns = {
        'sightings': [
            ('reporter_name', 'TEXT NOT NULL DEFAULT ""'),
            ('sighting_time', 'TEXT NOT NULL DEFAULT ""'),
            ('lat', 'REAL NOT NULL DEFAULT 0'),
            ('lon', 'REAL NOT NULL DEFAULT 0'),
            ('location_text', 'TEXT'),
            ('bearing', 'REAL'),
            ('elevation', 'REAL'),
            ('description', 'TEXT NOT NULL DEFAULT ""'),
            ('duration', 'TEXT'),
            ('photo_path', 'TEXT'),
            ('type', 'TEXT'),
            ('created_at', 'TEXT NOT NULL DEFAULT ""')
        ],
        'chat': [
            ('name', 'TEXT NOT NULL DEFAULT ""'),
            ('message', 'TEXT NOT NULL DEFAULT ""'),
            ('timestamp', 'TEXT NOT NULL DEFAULT ""'),
            ('ip', 'TEXT')
        ]
    }

    for table_name, columns in desired_columns.items():
        # Get existing columns
        cursor.execute(f'PRAGMA table_info({table_name})')
        existing_cols = {row[1] for row in cursor.fetchall()}

        # Add missing columns
        for col_name, col_type in columns:
            if col_name not in existing_cols:
                try:
                    cursor.execute(f'ALTER TABLE {table_name} ADD COLUMN {col_name} {col_type}')
                    print(f"Added column {col_name} to {table_name}")
                except Exception as e:
                    # Column might have been added concurrently or other error
                    print(f"Could not add {col_name} to {table_name}: {e}")

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

def confirm_sighting(sighting_id, ip):
    """Confirm a sighting (I saw this too). Returns (count, already_confirmed)."""
    conn = get_db()
    cursor = conn.cursor()

    created_at = datetime.now(timezone.utc).isoformat()
    already_confirmed = False

    try:
        cursor.execute('''
            INSERT INTO sighting_confirmations (sighting_id, ip, created_at)
            VALUES (?, ?, ?)
        ''', (sighting_id, ip, created_at))
        conn.commit()
    except sqlite3.IntegrityError:
        # Already confirmed by this IP
        already_confirmed = True

    # Get current count
    cursor.execute('''
        SELECT COUNT(*) as count
        FROM sighting_confirmations
        WHERE sighting_id = ?
    ''', (sighting_id,))
    count = cursor.fetchone()['count']

    conn.close()
    return count, already_confirmed

def get_confirmation_count(sighting_id):
    """Get confirmation count for a sighting."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT COUNT(*) as count
        FROM sighting_confirmations
        WHERE sighting_id = ?
    ''', (sighting_id,))
    count = cursor.fetchone()['count']
    conn.close()
    return count

def check_confirmation(sighting_id, ip):
    """Check if an IP has already confirmed a sighting."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT COUNT(*) as count
        FROM sighting_confirmations
        WHERE sighting_id = ? AND ip = ?
    ''', (sighting_id, ip))
    count = cursor.fetchone()['count']
    conn.close()
    return count > 0

def get_sightings_with_confirmations(requester_ip=None):
    """Get all sightings with confirmation counts and whether requester confirmed."""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        SELECT s.*,
               COUNT(DISTINCT c.id) as confirmations
        FROM sightings s
        LEFT JOIN sighting_confirmations c ON s.id = c.sighting_id
        GROUP BY s.id
        ORDER BY s.sighting_time DESC
    ''')

    sightings = [dict(row) for row in cursor.fetchall()]

    # If requester_ip provided, check which ones they confirmed
    if requester_ip:
        for sighting in sightings:
            cursor.execute('''
                SELECT COUNT(*) as count
                FROM sighting_confirmations
                WHERE sighting_id = ? AND ip = ?
            ''', (sighting['id'], requester_ip))
            sighting['confirmed_by_me'] = cursor.fetchone()['count'] > 0

    conn.close()
    return sightings

def delete_sighting(sighting_id):
    """Delete a sighting and its confirmations."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM sightings WHERE id = ?', (sighting_id,))
    deleted = cursor.rowcount
    conn.commit()
    conn.close()
    return deleted > 0

def save_push_subscription(endpoint, p256dh, auth, ip=None):
    """Save or update a push subscription."""
    conn = get_db()
    cursor = conn.cursor()
    now = datetime.now(timezone.utc).isoformat()

    # Use INSERT OR REPLACE to handle duplicates
    cursor.execute('''
        INSERT OR REPLACE INTO push_subscriptions (endpoint, p256dh, auth, ip, created_at)
        VALUES (?, ?, ?, ?, ?)
    ''', (endpoint, p256dh, auth, ip, now))

    conn.commit()
    conn.close()
    return True

def delete_push_subscription(endpoint):
    """Delete a push subscription by endpoint."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM push_subscriptions WHERE endpoint = ?', (endpoint,))
    deleted = cursor.rowcount
    conn.commit()
    conn.close()
    return deleted > 0

def get_all_push_subscriptions():
    """Get all active push subscriptions."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT endpoint, p256dh, auth FROM push_subscriptions')
    subscriptions = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return subscriptions
