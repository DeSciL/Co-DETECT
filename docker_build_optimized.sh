#!/bin/bash

# Build script for Co-DETECT optimized Docker image

set -e

echo "Building Co-DETECT optimized Docker image..."

# Build arguments
IMAGE_NAME=${IMAGE_NAME:-co-detect}
TAG=${TAG:-latest}
PLATFORM=${PLATFORM:-linux/amd64}

# Enable Docker BuildKit for better performance
export DOCKER_BUILDKIT=1

echo "Building for platform: $PLATFORM"
echo "Image: $IMAGE_NAME:$TAG"

# Build with BuildKit optimizations
docker build \
  --platform $PLATFORM \
  --target runtime \
  --tag $IMAGE_NAME:$TAG \
  --build-arg BUILDKIT_INLINE_CACHE=1 \
  --progress=plain \
  .

# Show image size
echo ""
echo "Image built successfully!"
docker images $IMAGE_NAME:$TAG

# Optional: Run size analysis
if command -v dive >/dev/null 2>&1; then
    echo ""
    echo "Running image analysis with dive..."
    dive $IMAGE_NAME:$TAG
fi
