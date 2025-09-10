#!/bin/bash
registry=registry.ethz.ch/descil/datascience/;name=codetect;prefix=led;

# Get latest tag or create a new one
source tag_push.sh

# Exit immediately if a command exits with a non-zero status
set -e

# Docker login to the specified registry
docker login ${registry}

# Build the Docker image using the specified Dockerfile
docker build -t ${registry}${name}:${tag} -f Dockerfile . --network=host
if [ $? -ne 0 ]; then
  echo “~~~~ error: failed to build docker container ~~~~~”
fi

# Run the Docker container (in detached mode -d), mapping port 5000 on the host to port 80 on the container
# docker run -p 5000:80 ${registry}${name}:${tag}

# Push the built Docker image to the registry
docker push ${registry}${name}:${tag}

# Tag the image as 'latest'
docker tag ${registry}${name}:${tag} ${registry}${name}:latest

# Push the 'latest' tagged image to the registry
docker push ${registry}${name}:latest

# Redeploy latest
kubectl rollout restart deployment -n ${prefix} ${prefix}-${name}
