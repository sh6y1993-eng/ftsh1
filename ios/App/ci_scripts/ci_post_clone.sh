#!/bin/sh
set -e

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
export HOMEBREW_NO_AUTO_UPDATE=1

if ! command -v node >/dev/null 2>&1; then
  brew install node
fi

cd "$CI_PRIMARY_REPOSITORY_PATH"
npm install
npm run build
npx cap sync ios

cd "$CI_PRIMARY_REPOSITORY_PATH/ios/App"
NEW_BUILD=$((CI_BUILD_NUMBER + 10))
agvtool new-version -all "$NEW_BUILD"
