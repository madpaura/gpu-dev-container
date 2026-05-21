#!/bin/bash
echo "Starting VS Code Server on port 8080..."
mkdir -p .config/code-server
printf 'bind-addr: 0.0.0.0:8080\nauth: none\ncert: false\n' > .config/code-server/config.yaml
mkdir -p /home/developer/.local/share/code-server/User
if [ ! -f /home/developer/.local/share/code-server/User/settings.json ]; then
    printf '{\n  "jupyter.jupyterServerType": "remote",\n  "jupyter.serverConnectionSettings": {\n    "baseUrl": "http://localhost:8888",\n    "token": ""\n  }\n}\n' > /home/developer/.local/share/code-server/User/settings.json
fi
code-server &
echo "Starting Jupyter Server on port 8888..."
exec jupyter lab --ip=0.0.0.0 --port=8888 --no-browser --allow-root \
    --ServerApp.token='' --ServerApp.password='' \
    --ServerApp.allow_origin='*' \
    --ServerApp.disable_check_xsrf=True
