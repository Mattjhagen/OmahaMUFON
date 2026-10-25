from flask import Flask, request, jsonify, send_from_directory
import os
import json
from datetime import datetime, timedelta, timezone
import math
from werkzeug.utils import secure_filename
import urllib.request
import urllib.error

try:
    from database import (
        init_db, init_rewind_db, get_sightings, get_sighting, insert_sighting,
        get_rewind_observations
    )
except ImportError:
    from backend.database import (
        init_db, init_rewind_db, get_sightings, get_sighting, insert_sighting,
        get_rewind_observations
    )

# Configure Flask to serve static files from frontend directory
FRONTEND_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'frontend'))
app = Flask(__name__, static_folder=FRONTEND_PATH, static_url_path='/static')

# Configuration
UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'uploads')
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif'}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB

# Aircraft data sources
ADSB_SOURCE = '/var/run/dump1090-mutability/aircraft.json'  # Local dump1090 (currently non-functional)
FR24_SOURCE = 'http://192.168.0.7/flights.js'  # FR24 receiver (Omaha coverage)
API_SOURCE = 'http://localhost:8080/data/aircraft.json'

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

def allowed_file(filename):
    """Check if file extension is allowed."""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def haversine_distance(lat1, lon1, lat2, lon2):
    """Calculate distance between two points in miles."""
    R = 3959  # Earth's radius in miles

    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lon = math.radians(lon2 - lon1)

    a = math.sin(delta_lat / 2) ** 2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    return R * c

def fetch_adsb_aircraft():
    """Fetch aircraft from FR24 receiver (since local dump1090 is non-functional)."""
    try:
        req = urllib.request.Request(FR24_SOURCE, headers={'User-Agent': 'SkyRewind-Merged/1.0'})
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
                    'hex': flight_data[0],
                    'flight': flight_data[16] if len(flight_data) > 16 and flight_data[16] else None,
                    'lat': lat,
                    'lon': lon,
                    'track': flight_data[3],
                    'alt_baro': flight_data[4],
                    'gs': flight_data[5],
                    'source': 'adsb'
                }
                aircraft_list.append(ac)

            return aircraft_list

    except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError, TimeoutError, IndexError) as e:
        # Fallback to local dump1090 if FR24 fails
        try:
            with open(ADSB_SOURCE, 'r') as f:
                data = json.load(f)
                aircraft = data.get('aircraft', [])
                for ac in aircraft:
                    ac['source'] = 'adsb'
                return aircraft
        except (FileNotFoundError, json.JSONDecodeError):
            return []

def fetch_api_aircraft():
    """Fetch aircraft from API proxy (OpenSky)."""
    try:
        req = urllib.request.Request(API_SOURCE, headers={'User-Agent': 'SkyRewind-Merged/1.0'})
        with urllib.request.urlopen(req, timeout=5) as response:
            data = json.loads(response.read())
            aircraft = data.get('aircraft', [])
            # Add source tag
            for ac in aircraft:
                ac['source'] = 'api'
            return aircraft
    except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError, TimeoutError) as e:
        return []

def merge_aircraft_layers():
    """Merge aircraft from both ADS-B and API layers."""
    adsb_aircraft = fetch_adsb_aircraft()
    api_aircraft = fetch_api_aircraft()

    # Deduplicate by ICAO hex - if same aircraft in both sources, merge
    aircraft_dict = {}

    for ac in adsb_aircraft:
        if ac.get('lat') and ac.get('lon'):  # Must have position
            hex_code = ac.get('hex', '').upper()
            if hex_code:
                aircraft_dict[hex_code] = {
                    'hex': hex_code,
                    'callsign': (ac.get('flight') or '').strip() or (ac.get('callsign') or '').strip() or hex_code,
                    'registration': ac.get('registration'),
                    'lat': ac['lat'],
                    'lon': ac['lon'],
                    'altitude': ac.get('alt_baro'),
                    'ground_speed': ac.get('gs'),
                    'track': ac.get('track'),
                    'squawk': ac.get('squawk'),
                    'sources': ['adsb']
                }

    for ac in api_aircraft:
        if ac.get('lat') and ac.get('lon'):
            hex_code = ac.get('hex', '').upper()
            if hex_code:
                if hex_code in aircraft_dict:
                    # Aircraft in both sources - add api source tag
                    aircraft_dict[hex_code]['sources'].append('api')
                else:
                    # API-only aircraft
                    aircraft_dict[hex_code] = {
                        'hex': hex_code,
                        'callsign': (ac.get('flight') or '').strip() or (ac.get('callsign') or '').strip() or hex_code,
                        'registration': ac.get('registration'),
                        'lat': ac['lat'],
                        'lon': ac['lon'],
                        'altitude': ac.get('alt_baro'),
                        'ground_speed': ac.get('gs'),
                        'track': ac.get('track'),
                        'squawk': ac.get('squawk'),
                        'sources': ['api']
                    }

    return list(aircraft_dict.values())

@app.route('/')
def index():
    """Serve the main frontend."""
    return send_from_directory(FRONTEND_PATH, 'index.html')

@app.route('/manifest.json')
def manifest():
    """Serve PWA manifest."""
    return send_from_directory(FRONTEND_PATH, 'manifest.json', mimetype='application/manifest+json')

@app.route('/sw.js')
def service_worker():
    """Serve service worker at root scope."""
    response = send_from_directory(FRONTEND_PATH, 'sw.js', mimetype='application/javascript')
    response.headers['Service-Worker-Allowed'] = '/'
    return response

@app.route('/favicon.svg')
def favicon_svg():
    """Serve SVG favicon."""
    return send_from_directory(FRONTEND_PATH, 'favicon.svg', mimetype='image/svg+xml')

@app.route('/favicon.ico')
def favicon_ico():
    """Serve ICO favicon."""
    return send_from_directory(FRONTEND_PATH, 'favicon.ico', mimetype='image/x-icon')

@app.route('/icons/<path:filename>')
def icons(filename):
    """Serve PWA icons."""
    return send_from_directory(os.path.join(FRONTEND_PATH, 'icons'), filename)

@app.route('/api/aircraft/live')
def live_aircraft():
    """Get current live aircraft from both layers."""
    aircraft = merge_aircraft_layers()
    return jsonify(aircraft)

@app.route('/api/rewind')
def rewind():
    """Get aircraft within radius at specified time."""
    try:
        time_str = request.args.get('time')
        lat = float(request.args.get('lat'))
        lon = float(request.args.get('lon'))
        radius = float(request.args.get('radius', 25))  # miles

        if not time_str:
            return jsonify({'error': 'time parameter required'}), 400

        # Parse center time
        center_dt = datetime.fromisoformat(time_str.replace('Z', '+00:00'))

        # Get observations within ±10 minutes
        start_time = (center_dt - timedelta(minutes=10)).isoformat()
        end_time = (center_dt + timedelta(minutes=10)).isoformat()

        observations = get_rewind_observations(start_time, end_time, lat, lon, radius)

        return jsonify(observations)

    except ValueError as e:
        return jsonify({'error': f'Invalid parameter: {str(e)}'}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/sightings', methods=['GET', 'POST'])
def sightings():
    """Get all sightings or create a new one."""
    if request.method == 'GET':
        return jsonify(get_sightings())

    # POST - create new sighting
    data = request.form if request.files else request.json

    # Validate required fields
    required_fields = ['reporter_name', 'sighting_time', 'lat', 'lon', 'description']
    for field in required_fields:
        if not data.get(field):
            return jsonify({'error': f'Missing required field: {field}'}), 400

    # Handle photo upload
    photo_path = None
    if 'photo' in request.files:
        file = request.files['photo']
        if file and file.filename:
            # Check file size
            file.seek(0, os.SEEK_END)
            file_size = file.tell()
            file.seek(0)

            if file_size > MAX_FILE_SIZE:
                return jsonify({'error': 'File size exceeds 10MB limit'}), 413

            if allowed_file(file.filename):
                filename = secure_filename(f"{datetime.now(timezone.utc).timestamp()}_{file.filename}")
                file.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))
                photo_path = filename

    try:
        sighting_id = insert_sighting(
            reporter_name=data.get('reporter_name'),
            sighting_time=data.get('sighting_time'),
            lat=float(data.get('lat')),
            lon=float(data.get('lon')),
            location_text=data.get('location_text'),
            bearing=float(data.get('bearing')) if data.get('bearing') else None,
            elevation=float(data.get('elevation')) if data.get('elevation') else None,
            description=data.get('description'),
            duration=data.get('duration'),
            photo_path=photo_path,
            sighting_type=data.get('type')
        )
    except (ValueError, TypeError) as e:
        return jsonify({'error': f'Invalid data: {str(e)}'}), 400

    return jsonify({'id': sighting_id, 'success': True}), 201

@app.route('/api/sightings/<int:sighting_id>')
def get_sighting_detail(sighting_id):
    """Get a specific sighting."""
    sighting = get_sighting(sighting_id)
    if not sighting:
        return jsonify({'error': 'Sighting not found'}), 404
    return jsonify(sighting)

@app.route('/api/uploads/<filename>')
def serve_upload(filename):
    """Serve uploaded photos."""
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

# Initialize databases at module level
init_db()
init_rewind_db()

if __name__ == '__main__':
    debug_mode = os.environ.get('FLASK_DEBUG', 'false').lower() == 'true'
    app.run(host='0.0.0.0', port=5003, debug=debug_mode)

@app.route('/api/chat', methods=['GET'])
def get_chat():
    """Get chat messages."""
    from database import get_chat_messages
    messages = get_chat_messages(limit=50)
    return jsonify(messages)

@app.route('/api/chat', methods=['POST'])
def post_chat():
    """Post a chat message."""
    from database import insert_chat_message
    data = request.json
    
    if not data.get('name') or not data.get('message'):
        return jsonify({'error': 'Name and message required'}), 400
    
    # Rate limiting: check IP
    ip = request.remote_addr
    
    # Simple rate limit: 1 message per 5 seconds per IP
    # (In production, use Redis or similar)
    
    insert_chat_message(data['name'], data['message'], ip)
    return jsonify({'success': True}), 201

@app.route('/api/sighting-types')
def get_sighting_types():
    """Get sighting type counts."""
    from database import get_sighting_types_count
    types = get_sighting_types_count()
    
    # Ensure all types are represented
    all_types = ['Sphere/Orb', 'Disc', 'Triangle', 'Cylinder', 'Rectangle', 'Diamond', 'Formation', 'Light', 'Fireball', 'Other']
    result = {t: types.get(t, 0) for t in all_types}
    
    return jsonify(result)
