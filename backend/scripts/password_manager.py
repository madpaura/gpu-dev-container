#!/usr/bin/env python3
"""
Password Manager Script
-----------------------
Backup user passwords from the OLD MySQL database, restore into the NEW PostgreSQL database.

Usage:
    python password_manager.py backup   [--output passwords_backup.json]
    python password_manager.py restore  [--input passwords_backup.json] [--dry-run]
    python password_manager.py list

Backup reads from MySQL (old system):
    MYSQL_HOST      default: localhost
    MYSQL_PORT      default: 3306
    MYSQL_DB        default: user_auth_db
    MYSQL_USER      default: root
    MYSQL_PASSWORD  default: 12qwaszx

Restore writes to PostgreSQL (new system):
    DB_HOST         default: localhost
    DB_PORT         default: 5432
    DB_NAME         default: gpu_dash
    DB_USER         default: gpu_dash
    DB_PASSWORD     default: changeme
"""

import argparse
import json
import os
import sys
from datetime import datetime
from typing import Dict, List, Optional


def get_mysql_connection():
    try:
        import mysql.connector
    except ImportError:
        print("Error: mysql-connector-python is required. Install with: pip install mysql-connector-python")
        sys.exit(1)

    return mysql.connector.connect(
        host=os.getenv('MYSQL_HOST', 'localhost'),
        port=int(os.getenv('MYSQL_PORT', 3306)),
        database=os.getenv('MYSQL_DB', 'user_auth_db'),
        user=os.getenv('MYSQL_USER', 'root'),
        password=os.getenv('MYSQL_PASSWORD', '12qwaszx'),
    )


def get_pg_connection():
    try:
        import psycopg2
        import psycopg2.extras
    except ImportError:
        print("Error: psycopg2-binary is required. Install with: pip install psycopg2-binary")
        sys.exit(1)

    return psycopg2.connect(
        host=os.getenv('DB_HOST', 'localhost'),
        port=int(os.getenv('DB_PORT', 5432)),
        dbname=os.getenv('DB_NAME', 'gpu_dash'),
        user=os.getenv('DB_USER', 'gpu_dash'),
        password=os.getenv('DB_PASSWORD', 'changeme'),
    )


def backup(output_file: str) -> bool:
    """Read all users from old MySQL and write to JSON."""
    try:
        conn = get_mysql_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("""
            SELECT id, username, email, password, is_admin, is_approved, user_type, status
            FROM users
            WHERE status != 'system'
        """)
        users = cursor.fetchall()
        cursor.close()
        conn.close()
    except Exception as e:
        print(f"Error reading from MySQL: {e}")
        return False

    if not users:
        print("No users found in MySQL database.")
        return False

    backup_data = {
        "backup_timestamp": datetime.now().isoformat(),
        "source": "mysql",
        "total_users": len(users),
        "users": [
            {
                "id": u['id'],
                "username": u['username'],
                "email": u['email'],
                "password_hash": u['password'],
                "is_admin": bool(u['is_admin']),
                "user_type": u.get('user_type'),
                "status": u.get('status'),
            }
            for u in users
        ],
    }

    with open(output_file, 'w') as f:
        json.dump(backup_data, f, indent=2)

    print(f"✓ Backed up {len(users)} users to: {output_file}")
    for u in users:
        flag = " [ADMIN]" if u['is_admin'] else ""
        print(f"  - {u['username']} ({u['email']}){flag}")
    return True


def restore(input_file: str, dry_run: bool = False) -> bool:
    """Write passwords from JSON backup into new PostgreSQL."""
    import psycopg2
    import psycopg2.extras

    if not os.path.exists(input_file):
        print(f"Error: backup file not found: {input_file}")
        return False

    with open(input_file) as f:
        backup_data = json.load(f)

    print(f"Backup timestamp : {backup_data.get('backup_timestamp')}")
    print(f"Users in backup  : {backup_data.get('total_users', 0)}")
    if dry_run:
        print("=== DRY RUN — no changes will be made ===")
    print()

    try:
        conn = get_pg_connection()
    except Exception as e:
        print(f"Error connecting to PostgreSQL: {e}")
        return False

    restored = skipped = not_found = 0

    for u in backup_data.get("users", []):
        username = u['username']
        password_hash = u['password_hash']

        try:
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            cur.execute("SELECT username, password FROM users WHERE username = %s", (username,))
            existing = cur.fetchone()
            cur.close()
        except Exception as e:
            print(f"  ✗ Error checking {username}: {e}")
            continue

        if not existing:
            print(f"  ✗ Not found in PostgreSQL: {username}")
            not_found += 1
            continue

        if existing['password'] == password_hash:
            print(f"  - Unchanged: {username}")
            skipped += 1
            continue

        if dry_run:
            print(f"  → Would restore: {username}")
            restored += 1
        else:
            try:
                cur = conn.cursor()
                cur.execute("UPDATE users SET password = %s WHERE username = %s", (password_hash, username))
                conn.commit()
                cur.close()
                print(f"  ✓ Restored: {username}")
                restored += 1
            except Exception as e:
                print(f"  ✗ Failed to restore {username}: {e}")

    conn.close()
    print(f"\nRestored: {restored}  Skipped: {skipped}  Not found: {not_found}")
    return True


def list_users() -> None:
    """List users from PostgreSQL."""
    import psycopg2.extras
    try:
        conn = get_pg_connection()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT id, username, email, user_type, status, is_admin FROM users WHERE status != 'system'")
        users = cur.fetchall()
        cur.close()
        conn.close()
    except Exception as e:
        print(f"Error: {e}")
        return

    print(f"Total users: {len(users)}\n")
    print(f"{'ID':<5} {'Username':<20} {'Email':<35} {'Type':<10} {'Status':<10} Admin")
    print("-" * 90)
    for u in users:
        print(f"{u['id']:<5} {u['username']:<20} {u['email']:<35} {u['user_type'] or 'regular':<10} {u['status']:<10} {'Yes' if u['is_admin'] else 'No'}")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest='command')

    bp = sub.add_parser('backup', help='Backup from MySQL → JSON')
    bp.add_argument('--output', '-o', default='passwords_backup.json')

    rp = sub.add_parser('restore', help='Restore from JSON → PostgreSQL')
    rp.add_argument('--input', '-i', default='passwords_backup.json')
    rp.add_argument('--dry-run', '-n', action='store_true')

    sub.add_parser('list', help='List users in PostgreSQL')

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        sys.exit(1)

    if args.command == 'backup':
        sys.exit(0 if backup(args.output) else 1)
    elif args.command == 'restore':
        sys.exit(0 if restore(args.input, args.dry_run) else 1)
    elif args.command == 'list':
        list_users()


if __name__ == '__main__':
    main()
