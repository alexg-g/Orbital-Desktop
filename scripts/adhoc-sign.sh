#!/bin/bash
# Ad-hoc signing script for electron-builder
# This replaces the production signing script for beta builds

APP_PATH="$1"

if [ -z "$APP_PATH" ]; then
    echo "Usage: $0 <path-to-app>"
    exit 1
fi

echo "Ad-hoc signing: $APP_PATH"
codesign --force --deep --sign - "$APP_PATH"
echo "Ad-hoc signing complete"
