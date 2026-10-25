"""
SkyRewind Admin Backend
Moderation interface for managing reports and chat messages.
Runs on separate port, accessible only via Cloudflare Access PIN gate at uap.mattjhagen.xyz.
"""

from flask import Flask, request, jsonify, send_from_directory
import os
import json
from datetime import datetime

try:
    from database import (
        init_db, get_sightings, delete_sighting, get_chat_messages, get_db
    )
except ImportError:
    from backend.database import (
        init_db, get_sightings, delete_sighting, get_chat_messages, get_db
    )

# Configure Flask to serve admin frontend
ADMIN_FRONTEND_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'admin-frontend'))
app = Flask(__name__, static_folder=ADMIN_FRONTEND_PATH, static_url_path='/admin')

# Upload folder (for photo deletion)
UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'uploads')

# Moderation log file
MOD_LOG_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'moderation_log.jsonl')

def log_moderation_action(action_type, target_type, target_id, details=None):
    """Log moderation action to JSONL file."""
    os.makedirs(os.path.dirname(MOD_LOG_FILE), exist_ok=True)

    log_entry = {
        'timestamp': datetime.utcnow().isoformat() + 'Z',
        'action': action_type,
        'target_type': target_type,
        'target_id': target_id,
        'details': details or {}
    }

    with open(MOD_LOG_FILE, 'a') as f:
        f.write(json.dumps(log_entry) + '\n')

# ===== ADMIN FRONTEND =====
@app.route('/')
def admin_index():
    """Serve admin interface."""
    return send_from_directory(ADMIN_FRONTEND_PATH, 'index.html')

# ===== MODERATION ENDPOINTS =====

@app.route('/api/admin/reports', methods=['GET'])
def list_reports():
    """List all reports with details."""
    sightings = get_sightings()
    return jsonify(sightings)

@app.route('/api/admin/reports/<int:sighting_id>', methods=['DELETE'])
def delete_report(sighting_id):
    """Delete a report, its confirmations, and its photo file."""
    # Get sighting info before deletion (for logging)
    sighting = None
    db = get_db()
    cursor = db.cursor()
    cursor.execute('SELECT * FROM sightings WHERE id = ?', (sighting_id,))
    row = cursor.fetchone()

    if row:
        sighting = dict(row)

    # Delete sighting (database.py handles cascade deletion of confirmations)
    success = delete_sighting(sighting_id)

    if not success:
        return jsonify({'error': 'Report not found'}), 404

    # Delete photo file if exists
    if sighting and sighting.get('photo_path'):
        photo_path = os.path.join(UPLOAD_FOLDER, os.path.basename(sighting['photo_path']))
        if os.path.exists(photo_path):
            try:
                os.remove(photo_path)
            except Exception as e:
                print(f"Failed to delete photo file: {e}")

    # Log the moderation action
    log_moderation_action(
        action_type='delete_report',
        target_type='sighting',
        target_id=sighting_id,
        details={
            'reporter_name': sighting.get('reporter_name') if sighting else None,
            'type': sighting.get('type') if sighting else None,
            'had_photo': bool(sighting.get('photo_path')) if sighting else False
        }
    )

    return jsonify({'success': True, 'deleted': sighting_id})

@app.route('/api/admin/chat', methods=['GET'])
def list_chat_messages():
    """List all chat messages."""
    messages = get_chat_messages(limit=500)
    return jsonify(messages)

@app.route('/api/admin/chat/<int:chat_id>', methods=['DELETE'])
def delete_chat_message(chat_id):
    """Delete a chat message."""
    db = get_db()
    cursor = db.cursor()

    # Get message info before deletion (for logging)
    cursor.execute('SELECT * FROM chat WHERE id = ?', (chat_id,))
    row = cursor.fetchone()

    if not row:
        return jsonify({'error': 'Message not found'}), 404

    message_data = dict(row)

    # Delete message
    cursor.execute('DELETE FROM chat WHERE id = ?', (chat_id,))
    db.commit()

    # Log the moderation action
    log_moderation_action(
        action_type='delete_chat',
        target_type='chat',
        target_id=chat_id,
        details={
            'sender_name': message_data.get('name'),
            'message_preview': message_data.get('message')[:50] if message_data.get('message') else None
        }
    )

    return jsonify({'success': True, 'deleted': chat_id})

@app.route('/api/admin/modlog', methods=['GET'])
def get_moderation_log():
    """Get moderation log entries (most recent first)."""
    if not os.path.exists(MOD_LOG_FILE):
        return jsonify([])

    entries = []
    with open(MOD_LOG_FILE, 'r') as f:
        for line in f:
            if line.strip():
                try:
                    entries.append(json.loads(line))
                except json.JSONDecodeError:
                    continue

    # Return most recent first
    entries.reverse()

    # Limit to last 100 entries
    return jsonify(entries[:100])

@app.route('/api/admin/stats', methods=['GET'])
def get_admin_stats():
    """Get quick stats for admin dashboard."""
    db = get_db()
    cursor = db.cursor()

    cursor.execute('SELECT COUNT(*) as count FROM sightings')
    reports_count = cursor.fetchone()['count']

    cursor.execute('SELECT COUNT(*) as count FROM chat')
    chat_count = cursor.fetchone()['count']

    cursor.execute('SELECT COUNT(*) as count FROM sighting_confirmations')
    confirmations_count = cursor.fetchone()['count']

    # Count moderation log entries
    modlog_count = 0
    if os.path.exists(MOD_LOG_FILE):
        with open(MOD_LOG_FILE, 'r') as f:
            modlog_count = sum(1 for line in f if line.strip())

    return jsonify({
        'reports_count': reports_count,
        'chat_count': chat_count,
        'confirmations_count': confirmations_count,
        'modlog_count': modlog_count
    })

# Initialize database
init_db()

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5004, debug=False)
