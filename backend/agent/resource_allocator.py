import json
import os
import fcntl
from datetime import datetime
from typing import Dict, Optional, List, Tuple
from loguru import logger


class PortManager:
    def __init__(self, config_file="port_allocations.json", settings_file="port_settings.json"):
        self.config_file = config_file
        self.settings_file = settings_file
        self._initialize_files()

    def _initialize_files(self):
        if not os.path.exists(self.config_file):
            self._write_json(self.config_file, {"allocations": {}})
            logger.info(f"Created port allocations file: {self.config_file}")

        if not os.path.exists(self.settings_file):
            self._write_json(self.settings_file, {
                "port_range": {
                    "start": 10000,  # avoid conflict with admin stack ports (9000)
                    "end": 65535,
                    "default_range_size": 10
                }
            })
            logger.info(f"Created port settings file: {self.settings_file}")

    def _read_json(self, file_path: str) -> Dict:
        try:
            with open(file_path, 'r') as f:
                return json.load(f)
        except (FileNotFoundError, json.JSONDecodeError) as e:
            logger.error(f"Error reading {file_path}: {e}")
            return {}

    def _write_json(self, file_path: str, data: Dict) -> bool:
        """Atomic write with exclusive file lock to prevent concurrent corruption."""
        try:
            lock_path = file_path + ".lock"
            with open(lock_path, 'w') as lock_f:
                fcntl.flock(lock_f, fcntl.LOCK_EX)
                try:
                    with open(file_path, 'w') as f:
                        json.dump(data, f, indent=2)
                    return True
                finally:
                    fcntl.flock(lock_f, fcntl.LOCK_UN)
        except Exception as e:
            logger.error(f"Error writing to {file_path}: {e}")
            return False

    def _get_settings(self) -> Dict:
        settings = self._read_json(self.settings_file)
        return settings.get("port_range", {
            "start": 10000,
            "end": 65535,
            "default_range_size": 10
        })

    def allocate_ports(self, user_id: str, range_size: Optional[int] = None) -> Optional[Dict[str, int]]:
        """Allocate a port range to a user. Returns existing allocation if already allocated."""
        if range_size is None:
            range_size = self._get_settings().get("default_range_size", 10)

        # Acquire lock for the full read-find-write cycle
        lock_path = self.config_file + ".lock"
        with open(lock_path, 'w') as lock_f:
            fcntl.flock(lock_f, fcntl.LOCK_EX)
            try:
                data = self._read_json(self.config_file)
                allocations = data.get("allocations", {})

                if user_id in allocations:
                    logger.info(f"Ports already allocated for user {user_id}, returning existing")
                    entry = allocations[user_id]
                    return {"start_port": entry["start_port"], "end_port": entry["end_port"]}

                start_port = self._find_available_port_range(range_size, allocations)
                if start_port is None:
                    logger.error("No available port range to allocate")
                    return None

                end_port = start_port + range_size - 1
                allocations[user_id] = {
                    "start_port": start_port,
                    "end_port": end_port,
                    "range_size": range_size,
                    "allocated_at": datetime.now().isoformat(),
                }
                data["allocations"] = allocations

                with open(self.config_file, 'w') as f:
                    json.dump(data, f, indent=2)

                logger.info(f"Port range allocated for user {user_id}: [{start_port}-{end_port}]")
                return {"start_port": start_port, "end_port": end_port}
            finally:
                fcntl.flock(lock_f, fcntl.LOCK_UN)

    def deallocate_ports(self, user_id: str) -> bool:
        """Deallocate a user's port range. Returns True on success or if no ports were allocated."""
        lock_path = self.config_file + ".lock"
        with open(lock_path, 'w') as lock_f:
            fcntl.flock(lock_f, fcntl.LOCK_EX)
            try:
                data = self._read_json(self.config_file)
                allocations = data.get("allocations", {})

                if user_id not in allocations:
                    logger.info(f"No ports allocated for user {user_id}, nothing to deallocate")
                    return True

                entry = allocations.pop(user_id)
                data["allocations"] = allocations

                with open(self.config_file, 'w') as f:
                    json.dump(data, f, indent=2)

                logger.success(f"Port range deallocated for user {user_id}: [{entry['start_port']}-{entry['end_port']}]")
                return True
            except Exception as e:
                logger.error(f"Error deallocating ports for user {user_id}: {e}")
                return False
            finally:
                fcntl.flock(lock_f, fcntl.LOCK_UN)

    def get_allocated_ports(self, user_id: str) -> Optional[Dict[str, int]]:
        data = self._read_json(self.config_file)
        entry = data.get("allocations", {}).get(user_id)
        if not entry:
            return None
        return {"start_port": entry["start_port"], "end_port": entry["end_port"]}

    def _find_available_port_range(self, range_size: int, allocations: Dict) -> Optional[int]:
        """Find next available start port given current allocations dict (caller holds lock)."""
        settings = self._get_settings()
        min_port = settings.get("start", 10000)
        max_port = settings.get("end", 65535)

        allocated_ranges = sorted(
            (v["start_port"], v["end_port"]) for v in allocations.values()
        )

        next_start = min_port
        for start_port, end_port in allocated_ranges:
            if next_start + range_size - 1 < start_port:
                return next_start
            next_start = end_port + 1

        if next_start + range_size - 1 <= max_port:
            return next_start
        return None

    def get_all_allocations(self) -> Dict[str, Dict]:
        return self._read_json(self.config_file).get("allocations", {})

    def get_allocation_summary(self) -> Dict:
        data = self._read_json(self.config_file)
        allocations = data.get("allocations", {})
        settings = self._get_settings()

        total_ports_allocated = sum(v["range_size"] for v in allocations.values())
        port_range = settings.get("end", 65535) - settings.get("start", 10000) + 1
        utilization = (total_ports_allocated / port_range) * 100 if port_range > 0 else 0

        return {
            "total_users": len(allocations),
            "total_ports_allocated": total_ports_allocated,
            "port_range_size": port_range,
            "utilization_percent": round(utilization, 2),
            "available_ports": port_range - total_ports_allocated,
        }
