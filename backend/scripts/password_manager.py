#!/usr/bin/env python3
"""
Password Manager Script
-----------------------
Backup and restore user passwords from MySQL database.

Usage:
    # Backup passwords to file
    python password_manager.py backup [--output passwords_backup.json]
    
    # Restore passwords from backup file
    python password_manager.py restore [--input passwords_backup.json]
    
    # List all users (without passwords)
    python password_manager.py list

Environment Variables:
    DB_HOST     - MySQL host (default: 0.0.0.0)
    DB_NAME     - Database name (default: user_auth_db)
    DB_USER     - Database user (default: root)
    DB_PASSWORD - Database password (default: 12qwaszx)
    DB_PORT     - Database port (default: 3306)
"""

import argparse
import json
import os
import sys
from datetime import datetime
from typing import Dict, List, Optional

try:
    import mysql.connector
except ImportError:
    print("Error: mysql-connector-python is required. Install with: pip install mysql-connector-python")
    sys.exit(1)


class PasswordManager:
    """Manage user password backup and restore operations."""
    
    def __init__(self):
        """Initialize database connection."""
        self.db_config = {
            'host': os.getenv('DB_HOST', '0.0.0.0'),
            'database': os.getenv('DB_NAME', 'user_auth_db'),
            'user': os.getenv('DB_USER', 'root'),
            'password': os.getenv('DB_PASSWORD', '12qwaszx'),
            'port': int(os.getenv('DB_PORT', 3306)),
        }
    
    def get_connection(self):
        """Get database connection."""
        return mysql.connector.connect(**self.db_config)
    
    def get_all_users_with_passwords(self) -> List[Dict]:
        """Get all users with their password hashes."""
        query = """
        SELECT id, username, email, password, is_admin, is_approved, user_type, status
        FROM users
        WHERE status != 'system'
        """
        
        conn = self.get_connection()
        try:
            cursor = conn.cursor(dictionary=True)
            cursor.execute(query)
            users = cursor.fetchall()
            return users
        finally:
            cursor.close()
            conn.close()
    
    def get_user_by_username(self, username: str) -> Optional[Dict]:
        """Get user by username."""
        query = "SELECT id, username, email, password FROM users WHERE username = %s"
        
        conn = self.get_connection()
        try:
            cursor = conn.cursor(dictionary=True)
            cursor.execute(query, (username,))
            return cursor.fetchone()
        finally:
            cursor.close()
            conn.close()
    
    def update_password(self, username: str, password_hash: str) -> bool:
        """Update user password by username."""
        query = "UPDATE users SET password = %s WHERE username = %s"
        
        conn = self.get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(query, (password_hash, username))
            conn.commit()
            return cursor.rowcount > 0
        except mysql.connector.Error as e:
            print(f"Error updating password for {username}: {e}")
            return False
        finally:
            cursor.close()
            conn.close()
    
    def backup_passwords(self, output_file: str = "passwords_backup.json") -> bool:
        """Backup all user passwords to a JSON file."""
        try:
            users = self.get_all_users_with_passwords()
            
            if not users:
                print("No users found in database.")
                return False
            
            backup_data = {
                "backup_timestamp": datetime.now().isoformat(),
                "db_host": self.db_config['host'],
                "db_name": self.db_config['database'],
                "total_users": len(users),
                "users": []
            }
            
            for user in users:
                backup_data["users"].append({
                    "id": user['id'],
                    "username": user['username'],
                    "email": user['email'],
                    "password_hash": user['password'],
                    "is_admin": bool(user['is_admin']),
                    "user_type": user['user_type'],
                    "status": user['status']
                })
            
            with open(output_file, 'w') as f:
                json.dump(backup_data, f, indent=2)
            
            print(f"✓ Backed up {len(users)} user passwords to: {output_file}")
            print("\nUsers backed up:")
            for user in users:
                admin_flag = " [ADMIN]" if user['is_admin'] else ""
                print(f"  - {user['username']} ({user['email']}){admin_flag}")
            
            return True
            
        except Exception as e:
            print(f"Error during backup: {e}")
            return False
    
    def restore_passwords(self, input_file: str = "passwords_backup.json", dry_run: bool = False) -> bool:
        """Restore user passwords from a JSON backup file."""
        try:
            if not os.path.exists(input_file):
                print(f"Error: Backup file not found: {input_file}")
                return False
            
            with open(input_file, 'r') as f:
                backup_data = json.load(f)
            
            print(f"Backup file info:")
            print(f"  - Created: {backup_data.get('backup_timestamp', 'Unknown')}")
            print(f"  - Source DB: {backup_data.get('db_host', 'Unknown')}:{backup_data.get('db_name', 'Unknown')}")
            print(f"  - Total users in backup: {backup_data.get('total_users', 0)}")
            print()
            
            if dry_run:
                print("=== DRY RUN MODE - No changes will be made ===\n")
            
            users = backup_data.get("users", [])
            restored = 0
            skipped = 0
            not_found = 0
            
            for user_backup in users:
                username = user_backup['username']
                password_hash = user_backup['password_hash']
                
                # Check if user exists in current database
                current_user = self.get_user_by_username(username)
                
                if not current_user:
                    print(f"  ✗ User not found: {username}")
                    not_found += 1
                    continue
                
                # Check if password is different
                if current_user['password'] == password_hash:
                    print(f"  - Skipped (same password): {username}")
                    skipped += 1
                    continue
                
                if dry_run:
                    print(f"  → Would restore: {username}")
                    restored += 1
                else:
                    if self.update_password(username, password_hash):
                        print(f"  ✓ Restored: {username}")
                        restored += 1
                    else:
                        print(f"  ✗ Failed to restore: {username}")
            
            print()
            print(f"Summary:")
            print(f"  - Restored: {restored}")
            print(f"  - Skipped (unchanged): {skipped}")
            print(f"  - Not found: {not_found}")
            
            return True
            
        except json.JSONDecodeError as e:
            print(f"Error: Invalid JSON in backup file: {e}")
            return False
        except Exception as e:
            print(f"Error during restore: {e}")
            return False
    
    def list_users(self) -> None:
        """List all users without showing passwords."""
        try:
            users = self.get_all_users_with_passwords()
            
            if not users:
                print("No users found in database.")
                return
            
            print(f"Total users: {len(users)}\n")
            print(f"{'ID':<5} {'Username':<20} {'Email':<35} {'Type':<10} {'Status':<10} {'Admin'}")
            print("-" * 95)
            
            for user in users:
                admin = "Yes" if user['is_admin'] else "No"
                print(f"{user['id']:<5} {user['username']:<20} {user['email']:<35} {user['user_type'] or 'regular':<10} {user['status']:<10} {admin}")
                
        except Exception as e:
            print(f"Error listing users: {e}")


def main():
    parser = argparse.ArgumentParser(
        description="Backup and restore user passwords from MySQL database",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Backup all passwords
  python password_manager.py backup
  
  # Backup to specific file
  python password_manager.py backup --output my_backup.json
  
  # Restore passwords (dry run first)
  python password_manager.py restore --dry-run
  
  # Restore passwords
  python password_manager.py restore --input my_backup.json
  
  # List all users
  python password_manager.py list

Environment Variables:
  DB_HOST, DB_NAME, DB_USER, DB_PASSWORD, DB_PORT
        """
    )
    
    subparsers = parser.add_subparsers(dest='command', help='Available commands')
    
    # Backup command
    backup_parser = subparsers.add_parser('backup', help='Backup user passwords to file')
    backup_parser.add_argument(
        '--output', '-o',
        default='passwords_backup.json',
        help='Output file path (default: passwords_backup.json)'
    )
    
    # Restore command
    restore_parser = subparsers.add_parser('restore', help='Restore user passwords from file')
    restore_parser.add_argument(
        '--input', '-i',
        default='passwords_backup.json',
        help='Input backup file path (default: passwords_backup.json)'
    )
    restore_parser.add_argument(
        '--dry-run', '-n',
        action='store_true',
        help='Show what would be restored without making changes'
    )
    
    # List command
    subparsers.add_parser('list', help='List all users')
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        sys.exit(1)
    
    manager = PasswordManager()
    
    # Test database connection
    try:
        conn = manager.get_connection()
        conn.close()
        print(f"Connected to database: {manager.db_config['host']}:{manager.db_config['database']}\n")
    except mysql.connector.Error as e:
        print(f"Error connecting to database: {e}")
        print("\nCheck your environment variables:")
        print("  DB_HOST, DB_NAME, DB_USER, DB_PASSWORD, DB_PORT")
        sys.exit(1)
    
    if args.command == 'backup':
        success = manager.backup_passwords(args.output)
        sys.exit(0 if success else 1)
    
    elif args.command == 'restore':
        success = manager.restore_passwords(args.input, dry_run=args.dry_run)
        sys.exit(0 if success else 1)
    
    elif args.command == 'list':
        manager.list_users()
        sys.exit(0)


if __name__ == '__main__':
    main()
