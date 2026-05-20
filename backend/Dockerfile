# Use Python 3.11 slim image for minimal size
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies required for Docker management and SSH
RUN apt-get update && apt-get install -y \
    # Docker CLI for container management
    curl \
    gnupg \
    lsb-release \
    # SSH client for remote connections
    openssh-client \
    # System monitoring tools
    procps \
    # Clean up to reduce image size
    && rm -rf /var/lib/apt/lists/*

# Install Docker CLI
RUN curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/debian $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null \
    && apt-get update \
    && apt-get install -y docker-ce-cli \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY backend/requirements-docker.txt requirements.txt

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY backend/ .

# Create necessary directories
RUN mkdir -p /app/logs

# Set environment variables
ENV PYTHONPATH=/app
ENV FLASK_APP=app.py
ENV FLASK_ENV=production

# Expose the application port
EXPOSE 8500

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8500/health || exit 1

# Start the application
ENTRYPOINT ["/app/entrypoint.sh"]
