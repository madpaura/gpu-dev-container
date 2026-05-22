#!/bin/bash

# Installation script for Dev Services Nginx setup

echo "=== Dev Services Nginx Setup ==="

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "Please run as root (sudo)"
    exit 1
fi

# Check if nginx is installed
if ! command -v nginx &> /dev/null; then
    echo "Nginx is not installed. Installing..."
    apt update
    apt install -y nginx
fi

# Copy configuration files
echo "Copying configuration files..."
cp nginx.conf /etc/nginx/nginx.conf

# Create sites-available directory if it doesn't exist
mkdir -p /etc/nginx/sites-available
mkdir -p /etc/nginx/sites-enabled

# Copy site configuration
cp sites-available/dev-services /etc/nginx/sites-available/

# Remove default site to prevent conflicts
rm -f /etc/nginx/sites-enabled/default

# Copy systemd service files
echo "Installing systemd services..."
cp dev-services-nginx.service /etc/systemd/system/

# Reload systemd
systemctl daemon-reload

# Enable services
systemctl enable dev-services-nginx

# Test nginx configuration
echo "Testing Nginx configuration..."
if nginx -t; then
    echo "Nginx configuration is valid"
    # Reload nginx
    systemctl reload nginx
    echo "Nginx reloaded successfully"
else
    echo "Nginx configuration test failed"
    exit 1
fi
