#!/bin/sh
set -e

cd "$CI_PRIMARY_REPOSITORY_PATH"
npm ci
npm run build
npx cap sync ios

cd "$CI_PRIMARY_REPOSITORY_PATH/ios/App"
NEW_BUILD=$((CI_BUILD_NUMBER + 1))
agvtool new-version -all "$NEW_BUILD"
