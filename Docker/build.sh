#!/bin/bash

# Build script for GPU-enabled development environment

echo "Building GPU-enabled development environment Docker image..."

# Check if Docker is installed
if ! command -v docker &> /dev/null
then
    echo "Error: Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if NVIDIA Container Toolkit is installed
if ! command -v nvidia-docker &> /dev/null && ! docker info | grep -i nvidia &> /dev/null
then
    echo "Warning: NVIDIA Container Toolkit may not be installed."
    echo "GPU support might not be available."
    echo ""
fi

# Build the Docker image
echo "Building Docker image..."
DOCKER_BUILDKIT=1 docker build -t gpu-dev-environment .

if [ $? -eq 0 ]; then
    echo ""
    echo "Build successful!"
    echo "Image name: gpu-dev-environment"
    echo ""
    echo "To run the container:"
    echo "  docker run -it --gpus all -p 8080:8080 -p 8888:8888 gpu-dev-environment"
    echo ""
    echo "Or use docker-compose:"
    echo "  docker-compose up"
    echo ""
else
    echo "Build failed!"
    exit 1
fi