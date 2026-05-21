# Use NVIDIA's CUDA base image with Ubuntu
FROM nvidia/cuda:12.4.1-devel-ubuntu22.04
# FROM ubuntu:22.04

# Avoid prompts from apt
ENV DEBIAN_FRONTEND=noninteractive

# Install prerequisites
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    gnupg \
    ca-certificates \
    apt-transport-https \
    software-properties-common \
    git \
    vim \
    htop \
    nodejs \
    npm \
    python3 \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Set Python3 as default
RUN ln -sf /usr/bin/python3 /usr/bin/python && \
    ln -sf /usr/bin/pip3 /usr/bin/pip

# Install code-server (VS Code Server)
RUN curl -fsSL https://code-server.dev/install.sh | sh -s -- --version 4.121.0

# Install JupyterLab and comprehensive data science packages
RUN pip install --no-cache-dir \
    # Jupyter ecosystem
    jupyterlab \
    notebook \
    ipywidgets \
    jupyterlab-git \
    jupyterlab-lsp  \
    # Core data science libraries
    numpy \
    pandas \
    scipy \
    scikit-learn \
    # Visualization libraries
    matplotlib \
    seaborn \
    plotly \
    bokeh \
    altair \
    # Machine learning and AI
    tensorflow \
    torch \
    torchvision \
    torchaudio \
    transformers \
    datasets \
    # Deep learning utilities
    keras \
    xgboost \
    lightgbm \
    catboost \
    # Statistical analysis
    statsmodels \
    pingouin \
    # Data processing and utilities
    openpyxl \
    xlrd \
    h5py \
    pyarrow \
    fastparquet \
    # Database connectivity
    sqlalchemy \
    psycopg2-binary \
    pymongo \
    # Web scraping and APIs
    requests \
    beautifulsoup4 \
    scrapy \
    # Image processing
    pillow \
    opencv-python \
    imageio \
    # Natural language processing
    nltk \
    spacy \
    textblob \
    # Time series analysis
    prophet \
    # Geospatial analysis
    geopandas \
    folium \
    # Development and debugging tools
    jupyter-dash \
    ipdb \
    tqdm \
    # Configuration and environment
    python-dotenv \
    pyyaml \
    # Testing
    pytest \
    pytest-cov

# Create a non-root user
RUN useradd -m -s /bin/bash developer
USER developer
WORKDIR /home/developer

# Expose ports
# 8080 for VS Code Server
# 8888 for Jupyter Server
EXPOSE 8080 8888

# Create startup script
RUN cat > /tmp/start.sh << 'SCRIPT'
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
SCRIPT
RUN chmod +x /tmp/start.sh

CMD ["/tmp/start.sh"]