#!/usr/bin/env python3
"""
Memory Server - Flask API for shared SQLite database
Serves memory/memory API on port 8090
"""

import sys
import os
import subprocess

# ==================================================
#  AUTO INSTALL PACKAGES
# ==================================================

REQUIRED_PACKAGES = [
    ('flask', 'flask'),
    ('flask_cors', 'flask-cors'),
]

print("Checking required packages...")
for import_name, pip_name in REQUIRED_PACKAGES:
    try:
        __import__(import_name)
    except ImportError:
        print(f"  [..] Installing {pip_name}...")
        try:
            subprocess.check_call(
                [sys.executable, "-m", "pip", "install", pip_name],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
            print(f"  [OK] {pip_name} installed")
        except subprocess.CalledProcessError:
            print(f"  [ERROR] Failed to install {pip_name}")
            input("\nPress Enter to exit...")
            sys.exit(1)

print("All packages ready!\n")

import sqlite3
import json
import time
from datetime import datetime
from flask import Flask, request, jsonify, g
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

DATABASE = 'memory.db'


def get_db():
    """Get database connection for current request."""
    db = getattr(g, '_database', None)
    if db is None:
        db = g._database = sqlite3.connect(DATABASE)
        db.row_factory = sqlite3.Row
    return db


@app.teardown_appcontext
def close_connection(exception):
    """Close database connection at end of request."""
    db = getattr(g, '_database', None)
    if db is not None:
        db.close()


def init_db():
    """Initialize database with schema."""
    with app.app_context():
        db = get_db()
        cursor = db.cursor()
        
        cursor.executescript('''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                face_encoding BLOB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            
            CREATE TABLE IF NOT EXISTS model_memories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                model_id TEXT NOT NULL,
                category TEXT NOT NULL,
                content TEXT NOT NULL,
                confidence REAL DEFAULT 1.0,
                source_user_id INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (source_user_id) REFERENCES users(id)
            );
            
            CREATE TABLE IF NOT EXISTS user_memories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                model_id TEXT NOT NULL,
                category TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            );
            
            CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                model_id TEXT NOT NULL,
                started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            );
            
            CREATE INDEX IF NOT EXISTS idx_model_memories_model_id ON model_memories(model_id);
            CREATE INDEX IF NOT EXISTS idx_user_memories_user_id ON user_memories(user_id);
            CREATE INDEX IF NOT EXISTS idx_user_memories_model_id ON user_memories(model_id);
        ''')
        db.commit()
        print("[OK] Database initialized")


def row_to_dict(row):
    """Convert sqlite3.Row to dict."""
    if row is None:
        return None
    return dict(row)


# ==================================================
#  USER ENDPOINTS
# ==================================================

@app.route('/api/users', methods=['GET'])
def get_users():
    """Get all users."""
    db = get_db()
    cursor = db.cursor()
    cursor.execute('SELECT * FROM users ORDER BY name')
    rows = cursor.fetchall()
    return jsonify([row_to_dict(r) for r in rows])


@app.route('/api/users', methods=['POST'])
def create_user():
    """Create a new user."""
    data = request.get_json()
    name = data.get('name', '').strip()
    
    if not name:
        return jsonify({'error': 'Name is required'}), 400
    
    db = get_db()
    cursor = db.cursor()
    
    try:
        cursor.execute('INSERT INTO users (name) VALUES (?)', (name,))
        db.commit()
        user_id = cursor.lastrowid
        
        cursor.execute('SELECT * FROM users WHERE id = ?', (user_id,))
        return jsonify(row_to_dict(cursor.fetchone())), 201
    except sqlite3.IntegrityError:
        cursor.execute('SELECT * FROM users WHERE name = ?', (name,))
        return jsonify(row_to_dict(cursor.fetchone())), 200


@app.route('/api/users/<int:user_id>', methods=['GET'])
def get_user(user_id):
    """Get user by ID."""
    db = get_db()
    cursor = db.cursor()
    cursor.execute('SELECT * FROM users WHERE id = ?', (user_id,))
    user = cursor.fetchone()
    
    if user is None:
        return jsonify({'error': 'User not found'}), 404
    
    return jsonify(row_to_dict(user))


@app.route('/api/users/name/<name>', methods=['GET'])
def get_user_by_name(name):
    """Get user by name."""
    db = get_db()
    cursor = db.cursor()
    cursor.execute('SELECT * FROM users WHERE name = ?', (name,))
    user = cursor.fetchone()
    
    if user is None:
        return jsonify({'error': 'User not found'}), 404
    
    return jsonify(row_to_dict(user))


# ==================================================
#  SESSION ENDPOINTS
# ==================================================

@app.route('/api/sessions', methods=['POST'])
def start_session():
    """Start a new session or get existing one."""
    data = request.get_json()
    user_id = data.get('user_id')
    model_id = data.get('model_id', 'default')
    
    if not model_id:
        return jsonify({'error': 'model_id is required'}), 400
    
    db = get_db()
    cursor = db.cursor()
    
    if user_id:
        cursor.execute('''
            INSERT INTO sessions (user_id, model_id) VALUES (?, ?)
        ''', (user_id, model_id))
    else:
        cursor.execute('''
            INSERT INTO sessions (model_id) VALUES (?)
        ''', (model_id,))
    
    db.commit()
    session_id = cursor.lastrowid
    
    cursor.execute('SELECT * FROM sessions WHERE id = ?', (session_id,))
    return jsonify(row_to_dict(cursor.fetchone())), 201


@app.route('/api/sessions/<int:session_id>', methods=['PUT'])
def update_session(session_id):
    """Update session last activity."""
    db = get_db()
    cursor = db.cursor()
    
    cursor.execute('''
        UPDATE sessions SET last_activity = CURRENT_TIMESTAMP WHERE id = ?
    ''', (session_id,))
    db.commit()
    
    cursor.execute('SELECT * FROM sessions WHERE id = ?', (session_id,))
    return jsonify(row_to_dict(cursor.fetchone()))


# ==================================================
#  MEMORY ENDPOINTS
# ==================================================

@app.route('/api/memories', methods=['GET'])
def get_memories():
    """Get memories with optional filters."""
    model_id = request.args.get('model_id')
    user_id = request.args.get('user_id')
    category = request.args.get('category')
    memory_type = request.args.get('type', 'all')
    
    db = get_db()
    cursor = db.cursor()
    
    results = []
    
    if memory_type in ['all', 'model']:
        query = 'SELECT * FROM model_memories WHERE 1=1'
        params = []
        
        if model_id:
            query += ' AND model_id = ?'
            params.append(model_id)
        if category:
            query += ' AND category = ?'
            params.append(category)
        
        query += ' ORDER BY created_at DESC'
        cursor.execute(query, params)
        
        for row in cursor.fetchall():
            mem = row_to_dict(row)
            mem['type'] = 'model'
            results.append(mem)
    
    if memory_type in ['all', 'user'] and user_id:
        query = 'SELECT * FROM user_memories WHERE user_id = ?'
        params = [user_id]
        
        if model_id:
            query += ' AND model_id = ?'
            params.append(model_id)
        if category:
            query += ' AND category = ?'
            params.append(category)
        
        query += ' ORDER BY created_at DESC'
        cursor.execute(query, params)
        
        for row in cursor.fetchall():
            mem = row_to_dict(row)
            mem['type'] = 'user'
            results.append(mem)
    
    return jsonify(results)


@app.route('/api/memories/model', methods=['GET'])
def get_model_memories():
    """Get model memories (shared, no user filter)."""
    model_id = request.args.get('model_id')
    category = request.args.get('category')
    
    db = get_db()
    cursor = db.cursor()
    
    query = 'SELECT * FROM model_memories WHERE 1=1'
    params = []
    
    if model_id:
        query += ' AND model_id = ?'
        params.append(model_id)
    if category:
        query += ' AND category = ?'
        params.append(category)
    
    query += ' ORDER BY created_at DESC'
    cursor.execute(query, params)
    
    return jsonify([row_to_dict(r) for r in cursor.fetchall()])


@app.route('/api/memories/user', methods=['GET'])
def get_user_memories():
    """Get user memories (private)."""
    user_id = request.args.get('user_id')
    model_id = request.args.get('model_id')
    category = request.args.get('category')
    
    if not user_id:
        return jsonify({'error': 'user_id is required'}), 400
    
    db = get_db()
    cursor = db.cursor()
    
    query = 'SELECT * FROM user_memories WHERE user_id = ?'
    params = [user_id]
    
    if model_id:
        query += ' AND model_id = ?'
        params.append(model_id)
    if category:
        query += ' AND category = ?'
        params.append(category)
    
    query += ' ORDER BY created_at DESC'
    cursor.execute(query, params)
    
    return jsonify([row_to_dict(r) for r in cursor.fetchall()])


@app.route('/api/memories', methods=['POST'])
def add_memory():
    """Add a new memory."""
    data = request.get_json()
    
    memory_type = data.get('type', 'model')
    model_id = data.get('model_id', 'default')
    category = data.get('category', 'fact')
    content = data.get('content', '')
    confidence = data.get('confidence', 1.0)
    source_user_id = data.get('source_user_id')
    user_id = data.get('user_id')
    
    if not content:
        return jsonify({'error': 'content is required'}), 400
    
    db = get_db()
    cursor = db.cursor()
    
    if memory_type == 'user':
        if not user_id:
            return jsonify({'error': 'user_id is required for user memories'}), 400
        
        cursor.execute('''
            INSERT INTO user_memories (user_id, model_id, category, content)
            VALUES (?, ?, ?, ?)
        ''', (user_id, model_id, category, content))
    else:
        cursor.execute('''
            INSERT INTO model_memories (model_id, category, content, confidence, source_user_id)
            VALUES (?, ?, ?, ?, ?)
        ''', (model_id, category, content, confidence, source_user_id))
    
    db.commit()
    memory_id = cursor.lastrowid
    
    return jsonify({
        'id': memory_id,
        'type': memory_type,
        'model_id': model_id,
        'category': category,
        'content': content
    }), 201


@app.route('/api/memories/<int:memory_id>', methods=['DELETE'])
def delete_memory(memory_id):
    """Delete a memory."""
    memory_type = request.args.get('type', 'model')
    
    db = get_db()
    cursor = db.cursor()
    
    if memory_type == 'user':
        cursor.execute('DELETE FROM user_memories WHERE id = ?', (memory_id,))
    else:
        cursor.execute('DELETE FROM model_memories WHERE id = ?', (memory_id,))
    
    db.commit()
    
    return jsonify({'success': True})


# ==================================================
#  UTILITY ENDPOINTS
# ==================================================

@app.route('/api/ping', methods=['GET'])
def ping():
    """Health check."""
    return jsonify({'status': 'ok', 'timestamp': datetime.now().isoformat()})


@app.route('/api/stats', methods=['GET'])
def stats():
    """Get database statistics."""
    db = get_db()
    cursor = db.cursor()
    
    cursor.execute('SELECT COUNT(*) as count FROM users')
    users_count = cursor.fetchone()[0]
    
    cursor.execute('SELECT COUNT(*) as count FROM model_memories')
    model_memories_count = cursor.fetchone()[0]
    
    cursor.execute('SELECT COUNT(*) as count FROM user_memories')
    user_memories_count = cursor.fetchone()[0]
    
    cursor.execute('SELECT COUNT(*) as count FROM sessions')
    sessions_count = cursor.fetchone()[0]
    
    return jsonify({
        'users': users_count,
        'model_memories': model_memories_count,
        'user_memories': user_memories_count,
        'sessions': sessions_count
    })


# ==================================================
#  MAIN
# ==================================================

def main():
    print("=" * 50)
    print("  Memory Server")
    print("=" * 50)
    print()
    
    port = 8090
    
    print(f"[OK] Initializing database: {DATABASE}")
    init_db()
    
    print(f"[OK] Starting server on port {port}")
    print(f"[..] API available at: http://localhost:{port}")
    print()
    
    app.run(host='0.0.0.0', port=port, debug=False)


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print("\n[INFO] Server stopped")
        sys.exit(0)
    except Exception as e:
        print(f"[ERROR] {e}")
        import traceback
        traceback.print_exc()
        input("\nPress Enter to exit...")
        sys.exit(1)
