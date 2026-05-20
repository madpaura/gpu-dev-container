"""In-memory application log store shared across route blueprints."""

from collections import deque
from datetime import datetime
from loguru import logger

app_logs = deque(maxlen=1000)


def add_app_log(level, message, username=None, ip_address=None):
    app_logs.append({
        'timestamp': datetime.now().isoformat(),
        'level': level,
        'message': message,
        'username': username,
        'ip_address': ip_address,
    })
    if level == 'ERROR':
        logger.error(f"{message} | User: {username} | IP: {ip_address}")
    elif level == 'WARNING':
        logger.warning(f"{message} | User: {username} | IP: {ip_address}")
    else:
        logger.info(f"{message} | User: {username} | IP: {ip_address}")
