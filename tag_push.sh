#!/bin/bash

# Get the latest tag or default to v.0.0.0 if no tags exist
VERSION=$(git describe --abbrev=0 --tags 2>/dev/null || echo "v0.0.0")
VERSION_BITS=(${VERSION//./ })
VNUM1=$(echo ${VERSION_BITS[0]} | sed 's/v//')
VNUM2=${VERSION_BITS[1]}
VNUM3=${VERSION_BITS[2]}
VNUM3=$((VNUM3+1));

NEW_TAG="v$VNUM1.$VNUM2.$VNUM3"
echo "Updating $VERSION to $NEW_TAG"

GIT_COMMIT=$(git rev-parse HEAD)
NEEDS_TAG=$(git describe --contains $GIT_COMMIT 2>/dev/null)

if [ -z "$NEEDS_TAG" ]; then git push && git tag $NEW_TAG && git push --tags; tag=$NEW_TAG;
else echo "Already a tag on this commit"; tag=$VERSION;
fi
