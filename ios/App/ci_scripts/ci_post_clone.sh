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

NEW_BUILD=$((CI_BUILD_NUMBER + 10))
sed -i '' "s/CURRENT_PROJECT_VERSION = [0-9]*;/CURRENT_PROJECT_VERSION = $NEW_BUILD;/g" "$CI_PRIMARY_REPOSITORY_PATH/ios/App/App.xcodeproj/project.pbxproj"
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion $NEW_BUILD" "$CI_PRIMARY_REPOSITORY_PATH/ios/App/App/Info.plist" 2>/dev/null || true
