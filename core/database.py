# Metadata Remote - Intelligent audio metadata editor
# Copyright (C) 2025 Dr. William Nelson Leonard
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.

import sqlite3
import os
import math
from typing import Dict, List, Any

from config import MUSIC_DIR, logger

# Database path configuration
DATA_DIR = os.path.abspath(os.path.join(MUSIC_DIR, '..', 'data'))
DB_PATH = os.path.join(DATA_DIR, 'music.db')
MIGRATIONS_DIR = os.path.abspath(os.path.join(MUSIC_DIR, '..', 'migrations'))

def get_db_connection():
    """Get a new database connection."""
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn

def init_db():
    """Initialize the database and run migrations."""
    os.makedirs(DATA_DIR, exist_ok=True)
    conn = get_db_connection()
    try:
        migration_file = os.path.join(MIGRATIONS_DIR, '001_init.sql')
        if os.path.exists(migration_file):
            with open(migration_file, 'r') as f:
                conn.executescript(f.read())
            conn.commit()
            logger.info("Database initialized and migrations applied.")
            populate_tags_table()
        else:
            logger.error(f"Migration file not found: {migration_file}")
    finally:
        conn.close()

def populate_tags_table():
    """Pre-populate the tags table with standard tag names."""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        standard_tags = [
            'TITLE', 'ARTIST', 'ALBUM', 'GENRE'
        ]
        for tag in standard_tags:
            cursor.execute("INSERT OR IGNORE INTO tags (tag_name) VALUES (?)", (tag,))
        conn.commit()
        logger.info("Standard tags populated.")
    finally:
        conn.close()

def get_file_count() -> int:
    conn = get_db_connection()
    try:
        return conn.execute("SELECT COUNT(*) FROM files").fetchone()[0]
    except sqlite3.OperationalError:
        return 0 # Table might not exist yet
    finally:
        conn.close()

def index_file(path: str, name: str, folder: str, size: int, date: int, tags: Dict[str, str]):
    conn = get_db_connection()
    try:
        with conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO files (path, name, folder, size, date)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(path) DO UPDATE SET
                name=excluded.name, folder=excluded.folder, size=excluded.size, date=excluded.date
            """, (path, name, folder, size, date))
            
            cursor.execute("SELECT file_id FROM files WHERE path = ?", (path,))
            file_id = cursor.fetchone()[0]
            
            cursor.execute("DELETE FROM file_tags WHERE file_id = ?", (file_id,))
            
            for tag_name, tag_value in tags.items():
                tag_name_upper = tag_name.upper()
                if tag_value:
                    cursor.execute("INSERT OR IGNORE INTO tags (tag_name) VALUES (?)", (tag_name_upper,))
                    cursor.execute("""
                        INSERT INTO file_tags (file_id, tag_id, tag_value)
                        VALUES (?, (SELECT tag_id FROM tags WHERE tag_name = ?), ?)
                    """, (file_id, tag_name_upper, str(tag_value)))
    finally:
        conn.close()

def remove_file(path: str):
    conn = get_db_connection()
    try:
        with conn:
            conn.execute("DELETE FROM files WHERE path = ?", (path,))
    finally:
        conn.close()

def query_files(filters: Dict[str, str], page: int, limit: int) -> Dict[str, Any]:
    conn = get_db_connection()
    try:
        base_query = "FROM files f"
        where_clauses = []
        params = []
        
        tag_filters = {k: v for k, v in filters.items() if k not in ['name', 'folder']}
        
        where_clauses.append("f.folder = ?")
        params.append(filters['folder'])

        for i, (tag_name, tag_value) in enumerate(tag_filters.items()):
             if tag_value == '/null':
                 # Find files that DO NOT have the tag or have it with an empty value.
                 # We do this by excluding files that DO have the tag with a non-empty value.
                 where_clauses.append(f"""
                     f.file_id NOT IN (
                         SELECT ft.file_id FROM file_tags ft JOIN tags t ON ft.tag_id = t.tag_id
                         WHERE t.tag_name = ? AND ft.tag_value IS NOT NULL AND ft.tag_value != ''
                     )
                 """)
                 params.append(tag_name.upper())
             else:
                 join_alias = f"ft{i}"
                 tag_alias = f"t{i}"
                 base_query += f" JOIN file_tags {join_alias} ON f.file_id = {join_alias}.file_id JOIN tags {tag_alias} ON {join_alias}.tag_id = {tag_alias}.tag_id"
                 where_clauses.append(f"{tag_alias}.tag_name = ? AND {join_alias}.tag_value LIKE ?")
                 params.extend([tag_name.upper(), f"%{tag_value}%"])

        where_sql = "WHERE " + " AND ".join(where_clauses) if where_clauses else ""

        count_query = f"SELECT COUNT(DISTINCT f.file_id) {base_query} {where_sql}"
        total = conn.execute(count_query, params).fetchone()[0]
        
        offset = (page - 1) * limit
        files_query = f"SELECT DISTINCT f.path, f.name, f.folder, f.size, f.date {base_query} {where_sql} ORDER BY f.folder, f.name LIMIT ? OFFSET ?"
        params.extend([limit, offset])
        
        files = [dict(row) for row in conn.execute(files_query, params).fetchall()]
        total_pages = math.ceil(total / limit) if limit > 0 else 0
        
        return {
            "files": files,
            "pagination": { "page": page, "limit": limit, "total": total, "totalPages": total_pages, "hasNext": page < total_pages, "hasPrev": page > 1 }
        }
    finally:
        conn.close()

def get_tags() -> List[str]:
    conn = get_db_connection()
    try:
        return [row['tag_name'] for row in conn.execute("SELECT tag_name FROM tags ORDER BY tag_name").fetchall()]
    finally:
        conn.close()

def get_tag_values(tag_name: str) -> List[str]:
    conn = get_db_connection()
    try:
        query = "SELECT DISTINCT ft.tag_value FROM file_tags ft JOIN tags t ON ft.tag_id = t.tag_id WHERE t.tag_name = ? ORDER BY ft.tag_value"
        return [row['tag_value'] for row in conn.execute(query, (tag_name.upper(),)).fetchall()]
    finally:
        conn.close()
