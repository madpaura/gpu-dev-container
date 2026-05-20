import requests
from .config import get_api_url


class APIError(Exception):
    pass


class APIClient:
    def __init__(self, token=None):
        self.base_url = get_api_url()
        self.token = token

    def _headers(self):
        h = {"Content-Type": "application/json"}
        if self.token:
            h["Authorization"] = f"Bearer {self.token}"
        return h

    def post(self, path, data):
        try:
            r = requests.post(
                f"{self.base_url}{path}",
                json=data,
                headers=self._headers(),
                timeout=60,
            )
            if not r.ok:
                try:
                    body = r.json()
                    raise APIError(body.get("error", body.get("message", r.text)))
                except (ValueError, KeyError):
                    raise APIError(r.text)
            return r.json()
        except requests.RequestException as e:
            raise APIError(str(e))

    def put(self, path, data):
        try:
            r = requests.put(
                f"{self.base_url}{path}",
                json=data,
                headers=self._headers(),
                timeout=60,
            )
            if not r.ok:
                try:
                    body = r.json()
                    raise APIError(body.get("error", body.get("message", r.text)))
                except (ValueError, KeyError):
                    raise APIError(r.text)
            return r.json()
        except requests.RequestException as e:
            raise APIError(str(e))

    def get(self, path):
        try:
            r = requests.get(
                f"{self.base_url}{path}",
                headers=self._headers(),
                timeout=60,
            )
            if not r.ok:
                try:
                    body = r.json()
                    raise APIError(body.get("error", body.get("message", r.text)))
                except (ValueError, KeyError):
                    raise APIError(r.text)
            return r.json()
        except requests.RequestException as e:
            raise APIError(str(e))
