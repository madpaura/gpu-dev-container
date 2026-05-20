"""Agent registry backed by the agents DB table."""

from typing import List, Dict, Any, Optional
from loguru import logger
from .base import DatabaseManager


class AgentRepository:

    def __init__(self):
        self.db = DatabaseManager()

    def get_all_agents(self) -> List[Dict[str, Any]]:
        conn = self.db.get_connection()
        try:
            cursor = conn.cursor(dictionary=True)
            cursor.execute("SELECT * FROM agents ORDER BY registered_at DESC")
            return [dict(row) for row in cursor.fetchall()]
        except Exception as e:
            logger.error(f"Error fetching agents: {e}")
            return []
        finally:
            conn.close()

    def get_agent_ips(self, only_online: bool = False) -> List[str]:
        conn = self.db.get_connection()
        try:
            cursor = conn.cursor()
            if only_online:
                cursor.execute("SELECT ip_address FROM agents WHERE status = 'online'")
            else:
                cursor.execute("SELECT ip_address FROM agents")
            return [row[0] for row in cursor.fetchall()]
        except Exception as e:
            logger.error(f"Error fetching agent IPs: {e}")
            return []
        finally:
            conn.close()

    def register_agent(self, ip_address: str, name: Optional[str] = None) -> bool:
        conn = self.db.get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO agents (ip_address, name, status, registered_at, last_seen)
                VALUES (%s, %s, 'online', NOW(), NOW())
                ON CONFLICT (ip_address) DO UPDATE
                SET status = 'online',
                    last_seen = NOW(),
                    name = COALESCE(EXCLUDED.name, agents.name)
            """, (ip_address, name))
            conn.commit()
            return True
        except Exception as e:
            conn.rollback()
            logger.error(f"Error registering agent {ip_address}: {e}")
            return False
        finally:
            conn.close()

    def unregister_agent(self, ip_address: str) -> bool:
        conn = self.db.get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                "UPDATE agents SET status = 'offline' WHERE ip_address = %s",
                (ip_address,)
            )
            conn.commit()
            return True
        except Exception as e:
            conn.rollback()
            logger.error(f"Error unregistering agent {ip_address}: {e}")
            return False
        finally:
            conn.close()

    def update_heartbeat(self, ip_address: str) -> bool:
        """Update last_seen and ensure status is online. Registers if not found."""
        conn = self.db.get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO agents (ip_address, status, registered_at, last_seen)
                VALUES (%s, 'online', NOW(), NOW())
                ON CONFLICT (ip_address) DO UPDATE
                SET status = 'online', last_seen = NOW()
            """, (ip_address,))
            conn.commit()
            return True
        except Exception as e:
            conn.rollback()
            logger.error(f"Error updating heartbeat for {ip_address}: {e}")
            return False
        finally:
            conn.close()

    def mark_stale_offline(self, threshold_seconds: int = 90) -> int:
        """Mark agents offline if last_seen is older than threshold. Returns count updated."""
        conn = self.db.get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE agents SET status = 'offline'
                WHERE status = 'online'
                AND last_seen < NOW() - (%s * INTERVAL '1 second')
            """, (threshold_seconds,))
            count = cursor.rowcount
            conn.commit()
            if count:
                logger.info(f"Marked {count} stale agent(s) offline")
            return count
        except Exception as e:
            conn.rollback()
            logger.error(f"Error marking stale agents offline: {e}")
            return 0
        finally:
            conn.close()

    def delete_agent(self, ip_address: str) -> bool:
        conn = self.db.get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM agents WHERE ip_address = %s", (ip_address,))
            conn.commit()
            return cursor.rowcount > 0
        except Exception as e:
            conn.rollback()
            logger.error(f"Error deleting agent {ip_address}: {e}")
            return False
        finally:
            conn.close()

    def agent_exists(self, ip_address: str) -> bool:
        conn = self.db.get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT 1 FROM agents WHERE ip_address = %s", (ip_address,))
            return cursor.fetchone() is not None
        except Exception as e:
            logger.error(f"Error checking agent existence {ip_address}: {e}")
            return False
        finally:
            conn.close()
