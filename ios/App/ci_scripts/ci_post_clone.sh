#!/bin/sh
set -e

# تثبيت Node.js عبر Homebrew إذا لم يكن مثبتاً
if ! command -v node >/dev/null 2>&1; then
  brew install node
fi

# الانتقال إلى جذر المشروع
cd "${CI_PRIMARY_REPOSITORY_PATH:-$(cd "$(dirname "$0")/../../.." && pwd)}"

# تثبيت حزم المشروع وبناء نسخة الويب ومزامنتها مع iOS
npm install || npm install --legacy-peer-deps
npm run build
npx cap sync ios

# تحديث رقم البناء تلقائياً في Xcode Cloud لتفادي رفض TestFlight للنسخ المكررة
if [ -n "$CI_BUILD_NUMBER" ]; then
  if [ "$CI_BUILD_NUMBER" -lt 9 ] 2>/dev/null; then
    TARGET_BUILD=$((8 + CI_BUILD_NUMBER))
  else
    TARGET_BUILD="$CI_BUILD_NUMBER"
  fi
  sed -i '' "s/CURRENT_PROJECT_VERSION = [0-9]*;/CURRENT_PROJECT_VERSION = ${TARGET_BUILD};/g" ios/App/App.xcodeproj/project.pbxproj || true
fi

# التأكد من حصر الاتجاه بالوضع الرأسي المعتمد (Portrait Only)
/usr/libexec/PlistBuddy -c "Delete :UISupportedInterfaceOrientations" ios/App/App/Info.plist 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Add :UISupportedInterfaceOrientations array" ios/App/App/Info.plist
/usr/libexec/PlistBuddy -c "Add :UISupportedInterfaceOrientations:0 string UIInterfaceOrientationPortrait" ios/App/App/Info.plist

/usr/libexec/PlistBuddy -c "Delete :UISupportedInterfaceOrientations~ipad" ios/App/App/Info.plist 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Add :UISupportedInterfaceOrientations~ipad array" ios/App/App/Info.plist
/usr/libexec/PlistBuddy -c "Add :UISupportedInterfaceOrientations~ipad:0 string UIInterfaceOrientationPortrait" ios/App/App/Info.plist

