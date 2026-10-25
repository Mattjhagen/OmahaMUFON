#!/usr/bin/env python3
"""
Aircraft Rewind Recorder
Polls both ADS-B and API layers every 30 seconds and archives observations
"""

import sys
import os
import time
import json
import urllib.request
import urllib.error
import re
from datetime import datetime, timezone

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.database import insert_observation, prune_old_observations

# Data sources
ADSB_SOURCE = '/var/run/dump1090-mutability/aircraft.json'
FR24_SOURCE = 'http://192.168.0.7/flights.js'
API_SOURCE = 'http://localhost:8080/data/aircraft.json'
POLL_INTERVAL = 30  # seconds

def fetch_adsb_aircraft():
    """Fetch aircraft from local ADS-B receiver."""
    try:
        with open(ADSB_SOURCE, 'r') as f:
            data = json.load(f)
            return data.get('aircraft', [])
    except (FileNotFoundError, json.JSONDecodeError) as e:
        return []

def fetch_fr24_aircraft():
    """Fetch aircraft from FR24 receiver at .7 and convert to dump1090 format."""
    try:
        req = urllib.request.Request(FR24_SOURCE, headers={'User-Agent': 'SkyRewind-Recorder/1.0'})
        with urllib.request.urlopen(req, timeout=5) as response:
            data = response.read().decode('utf-8')

            # Strip JSONP wrapper: fr24_callback( ... );
            data = data.replace('fr24_callback(', '').replace(');', '')

            # Fix invalid JSON: replace empty values (,,) with ,null,
            while ',,' in data:
                data = data.replace(',,', ',null,')

            flights = json.loads(data)

            # Convert FR24 array format to dump1090 format
            # FR24 format: "HEX": ["HEX", lat, lon, track, altitude, speed, ...]
            aircraft_list = []
            for hex_id, flight_data in flights.items():
                lat = flight_data[1]
                lon = flight_data[2]

                # Skip aircraft without valid positions
                if lat == 0.00 or lon == 0.00:
                    continue

                ac = {
                    'hex': flight_data[0],  # hex code (array[0])
                    'lat': lat,              # latitude (array[1])
                    'lon': lon,              # longitude (array[2])
                    'track': flight_data[3], # track (array[3])
                    'alt_baro': flight_data[4], # altitude (array[4])
                    'gs': flight_data[5],    # speed (array[5])
                    'flight': flight_data[16] if len(flight_data) > 16 else None  # callsign (array[16])
                }
                aircraft_list.append(ac)

            return aircraft_list

    except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError, TimeoutError, IndexError) as e:
        return []

def fetch_api_aircraft():
    """Fetch aircraft from API proxy (OpenSky)."""
    try:
        req = urllib.request.Request(API_SOURCE, headers={'User-Agent': 'SkyRewind-Recorder/1.0'})
        with urllib.request.urlopen(req, timeout=5) as response:
            data = json.loads(response.read())
            return data.get('aircraft', [])
    except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError, TimeoutError) as e:
        return []

def record_snapshot():
    """Record current aircraft from both sources."""
    timestamp = datetime.now(timezone.utc).isoformat()

    # Record ADS-B aircraft from local dump1090 (may be empty)
    adsb_local_count = 0
    adsb_aircraft = fetch_adsb_aircraft()
    for ac in adsb_aircraft:
        if ac.get('lat') and ac.get('lon'):
            try:
                insert_observation(
                    timestamp=timestamp,
                    source='adsb',
                    icao_hex=ac.get('hex', '').upper(),
                    callsign=ac.get('flight', '').strip() or None,
                    registration=ac.get('registration'),
                    lat=ac['lat'],
                    lon=ac['lon'],
                    altitude=ac.get('alt_baro'),
                    ground_speed=ac.get('gs'),
                    track=ac.get('track'),
                    squawk=ac.get('squawk')
                )
                adsb_local_count += 1
            except Exception as e:
                print(f"Error recording local ADS-B aircraft {ac.get('hex')}: {e}", file=sys.stderr)

    # Record ADS-B aircraft from FR24 receiver at .7
    adsb_fr24_count = 0
    fr24_aircraft = fetch_fr24_aircraft()
    for ac in fr24_aircraft:
        if ac.get('lat') and ac.get('lon'):
            try:
                insert_observation(
                    timestamp=timestamp,
                    source='adsb',
                    icao_hex=ac.get('hex', '').upper(),
                    callsign=ac.get('flight', '').strip() or None,
                    registration=ac.get('registration'),
                    lat=ac['lat'],
                    lon=ac['lon'],
                    altitude=ac.get('alt_baro'),
                    ground_speed=ac.get('gs'),
                    track=ac.get('track'),
                    squawk=ac.get('squawk')
                )
                adsb_fr24_count += 1
            except Exception as e:
                print(f"Error recording FR24 ADS-B aircraft {ac.get('hex')}: {e}", file=sys.stderr)

    # Total ADS-B count
    adsb_count = adsb_local_count + adsb_fr24_count

    # Record API aircraft
    api_count = 0
    api_aircraft = fetch_api_aircraft()
    for ac in api_aircraft:
        if ac.get('lat') and ac.get('lon'):
            try:
                insert_observation(
                    timestamp=timestamp,
                    source='api',
                    icao_hex=ac.get('hex', '').upper(),
                    callsign=ac.get('flight', '').strip() or None,
                    registration=ac.get('registration'),
                    lat=ac['lat'],
                    lon=ac['lon'],
                    altitude=ac.get('alt_baro'),
                    ground_speed=ac.get('gs'),
                    track=ac.get('track'),
                    squawk=ac.get('squawk')
                )
                api_count += 1
            except Exception as e:
                print(f"Error recording API aircraft {ac.get('hex')}: {e}", file=sys.stderr)

    print(f"[{datetime.now(timezone.utc).strftime('%H:%M:%S')}] Recorded: {adsb_count} ADS-B (local:{adsb_local_count}, FR24:{adsb_fr24_count}), {api_count} API")
    return adsb_count + api_count

def main():
    print("=== SkyRewind Recorder ===")
    print(f"ADS-B source (local): {ADSB_SOURCE}")
    print(f"ADS-B source (FR24):  {FR24_SOURCE}")
    print(f"API source: {API_SOURCE}")
    print(f"Poll interval: {POLL_INTERVAL}s")
    print(f"Retention: 90 days")
    print("")

    iteration = 0
    while True:
        try:
            record_snapshot()

            # Prune old observations every 100 iterations (~50 minutes)
            iteration += 1
            if iteration % 100 == 0:
                deleted = prune_old_observations(days=90)
                if deleted > 0:
                    print(f"[{datetime.now(timezone.utc).strftime('%H:%M:%S')}] Pruned {deleted} old observations")

            time.sleep(POLL_INTERVAL)

        except KeyboardInterrupt:
            print("\nRecorder stopped")
            break
        except Exception as e:
            print(f"Error in main loop: {e}", file=sys.stderr)
            time.sleep(POLL_INTERVAL)

if __name__ == '__main__':
    main()
