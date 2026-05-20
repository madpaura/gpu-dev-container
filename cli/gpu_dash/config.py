import os
import json
import stat
from pathlib import Path

CONFIG_PATH = Path.home() / ".gpu-dash.json"


def get_token(token_flag=None):
    """Resolve token: flag > env > file. Returns token or None."""
    if token_flag:
        return token_flag
    if os.getenv("GPU_DASH_TOKEN"):
        return os.getenv("GPU_DASH_TOKEN")
    if CONFIG_PATH.exists():
        data = json.loads(CONFIG_PATH.read_text())
        return data.get("token")
    return None


def get_api_url():
    return os.getenv("GPU_DASH_URL", "http://localhost:8500")


def save_token(token, api_url):
    CONFIG_PATH.write_text(json.dumps({"token": token, "api_url": api_url}))
    CONFIG_PATH.chmod(0o600)


def clear_token():
    if CONFIG_PATH.exists():
        CONFIG_PATH.unlink()
