#!/bin/bash
echo "Starting VS Code Server on port 8080..."
mkdir -p .config/code-server
printf 'bind-addr: 0.0.0.0:8080\nauth: none\ncert: false\n' > .config/code-server/config.yaml

# Write code-server settings with the correct Jupyter base URL (including path prefix)
mkdir -p /home/developer/.local/share/code-server/User
JUPYTER_BASE=${JUPYTER_BASE_URL:-""}
JUPYTER_SERVER_URL="http://localhost:8888${JUPYTER_BASE}"
printf '{\n  "jupyter.jupyterServerType": "remote",\n  "jupyter.serverConnectionSettings": {\n    "baseUrl": "%s",\n    "token": ""\n  }\n}\n' "$JUPYTER_SERVER_URL" > /home/developer/.local/share/code-server/User/settings.json

code-server &

echo "Starting Jupyter Server on port 8888..."
if [ -n "$JUPYTER_BASE_URL" ]; then
    exec jupyter lab --ip=0.0.0.0 --port=8888 --no-browser --allow-root \
        --ServerApp.token='' --ServerApp.password='' \
        --ServerApp.base_url="$JUPYTER_BASE_URL" \
        --ServerApp.allow_origin='*' \
        --ServerApp.disable_check_xsrf=True
else
    exec jupyter lab --ip=0.0.0.0 --port=8888 --no-browser --allow-root \
        --ServerApp.token='' --ServerApp.password='' \
        --ServerApp.allow_origin='*' \
        --ServerApp.disable_check_xsrf=True
fi
