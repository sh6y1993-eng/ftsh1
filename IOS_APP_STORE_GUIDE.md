# دليل بناء وتوقيع ورفع تطبيق «فتّشها» على Apple App Store (iOS)

هذا الدليل يوثق البنية الكاملة لتطبيق **«فتّشها – تحداك في كل كلمة»** لنظام **iOS (iPhone)** المبني عبر **Capacitor 8**، مع خطوات التشغيل المحلي على جهاز **Mac (Xcode)**، التوقيع الرقمي، استخراج ملف **IPA / Archive**، تجهيز صفحة **App Store Connect**، والرفع عبر **TestFlight**.

---

## 1. ملخص الإعدادات التقنية المعتمدة في المشروع

| الإعداد | القيمة المعتمدة | الملف المرجعي |
|---|---|---|
| **اسم التطبيق (App Name)** | `فتّشها` | `capacitor.config.ts` / `ios/App/App/Info.plist` |
| **معرّف الحزمة (Bundle Identifier)** | `com.fatteshha.kuwaitgame` | `ios/App/App.xcodeproj/project.pbxproj` |
| **الإصدار التسويقي (Version)** | `1.0` (`MARKETING_VERSION`) | `ios/App/App.xcodeproj/project.pbxproj` |
| **رقم البناء (Build Number)** | `8` (`CURRENT_PROJECT_VERSION`) | `ios/App/App.xcodeproj/project.pbxproj` |
| **الأجهزة والاتجاه المعتمد** | iPhone فقط (`TARGETED_DEVICE_FAMILY = 1`) — الوضع الرأسي (`UIInterfaceOrientationPortrait`) | `ios/App/App/Info.plist` / `project.pbxproj` |
| **إعفاء التشفير (Export Compliance)** | `ITSAppUsesNonExemptEncryption = false` | `ios/App/App/Info.plist` |
| **ملف خصوصية Apple iOS 17+** | مُفعّل (`UserID`, `GameplayContent`, `EmailAddress`, `Name` + `CA92.1` لـ `UserDefaults`) | `ios/App/App/PrivacyInfo.xcprivacy` |
| **أيقونة المتجر (App Store Icon)** | `1024×1024` RGB PNG بدون قناة شفافية (Alpha Off) | `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` |
| **شاشة الإقلاع (Launch Screen)** | `2732×2732` خلفية `#020c18` بشعار فتّشها | `ios/App/App/Assets.xcassets/Splash.imageset/` |
| **رابط سياسة الخصوصية العام** | `/privacy-policy` (`public/privacy-policy.html`) | `server.ts` / `public/privacy-policy.html` |
| **رابط الدعم الفني العام** | `/support` (`public/support.html`) | `server.ts` / `public/support.html` |

---

## 2. الإضافات الأصلية لنظام iOS (Capacitor Native Plugins)

تم تثبيت ومزامنة الإضافات الرسمية التالية داخل `ios/App/CapApp-SPM/Package.swift`:
1. **`@capacitor/app`**: رصد انتقال التطبيق للخلفية والعودة للمقدمة (`appStateChange`) لإعادة تفعيل الصوت (`AudioContext`) وإعادة ربط جلسات اللعب الجماعي (`ROOM_REJOIN`) تلقائياً دون فقدان المرحلة الجارية.
2. **`@capacitor/network`**: رصد انقطاع الإنترنت وعودته (`networkStatusChange`) وإعادة إنشاء اتصال WebSocket تلقائياً ومزامنة حالة الغرفة فوراً.
3. **`@capacitor/haptics`**: تفعيل اهتزازات iPhone التفاعلية (Taptic Engine) عند النقر على الحروف، اكتشاف الكلمات، الفوز، أو الخطأ.
4. **`@capacitor/status-bar`**: ضبط شريط الحالة العلوي بنمط داكن متوافق مع خلفية اللعبة (`#020c18`) والـ Dynamic Island / Notch.
5. **`@capacitor/splash-screen`**: عرض شاشة الإقلاع بملء الشاشة وإخفاؤها بسلاسة عند جاهزية الواجهة.
6. **`@capacitor/keyboard`**: ضبط لوحة المفاتيح العربية على iOS ومنع تغطية حقول الإدخال.

---

## 3. امتثال شروط مراجعة Apple App Store Review Guidelines

1. **Guideline 5.1.1(v) — حذف الحساب وبياناته الشامل (Account Deletion):**
   - يتوفر زر **«حذف الحساب نهائياً (Delete Account)»** في كلٍّ من **شاشة الإعدادات (`SettingsScreen`)** و**شاشة الملف الشخصي (`ProfileScreen`)**.
   - يستدعي المسار المحمي بالتوكن `POST /api/auth/delete-account` الذي يمسح سجل الحساب، ويزيله من لوحة الصدارة (`leaderboard`)، ومن قوائم الأصدقاء (`friends`)، ويمسح سجلات التحدي اليومي (`unifiedDailyAttempts` / `unifiedDailyStreaks`)، والجلسات الفردية (`activeStageSessions`)، والغرف النشطة (`activeRooms`)، والدعوات (`pendingRoomInvites`).
2. **Guideline 4.8 — تسجيل الدخول الفعلي بحساب Apple (`POST /api/auth/apple`):**
   - يتوفر زر **«متابعة بحساب Apple»** في شاشة تسجيل الدخول (`AuthScreen`) مربوطاً بمسار التحقق الفعلي `POST /api/auth/apple` على الخادم، مع التحقق التشفيري من تواقيع Apple JWKS (`RS256` عبر `jose`)، والتحقق من الـ `nonce` و`aud` و`iss`، وحفظ الاسم المعروض (`fullName`) عبر جلسات الدخول المتتالية ودعم بريد الإخفاء `@privaterelay.appleid.com`.
3. **Guideline 1.2 — سلامة المحتوى المُنشأ بواسطة المستخدمين (UGC Safety):**
   - تصفية نصية ثنائية الطبقة للأسماء المستعارة وأسماء الغرف، وقصر محادثات اللعب الأونلاين على ردود فعل محددة مسبقاً (Whitelist)، وتوفير **الإبلاغ (`POST /api/moderation/report`)** و**الحظر الفوري (`POST /api/moderation/block`)** وفك الحظر مع لوحة إشراف محمية لإدارة البلاغات.
4. **Guideline 5.1.1 — سياسة الخصوصية والدعم الفني وأمان البيانات:**
   - متاحة داخل التطبيق مباشرة وعبر الروابط العامة `/privacy-policy` و `/support` على نطاق الإنتاج المخصص، مع تشديد سياسات Supabase RLS وقصر القراءة والكتابة عبر الخادم الموثوق.

---

## 4. خطوات التشغيل على جهاز Mac وفتح المشروع في Xcode

*(ملاحظة تقنية: خطوات فتح Xcode والتوقيع بشهادة Apple Developer واستخراج `.ipa` تتطلب نظام macOS حصرياً ولا يمكن لمحرك سحابي على Linux تنفيذها نيابةً عن جهاز المطور).*

### أ) تثبيت الحزم ومزامنة مشروع iOS
على جهاز Mac (يحتوي على Node.js 20+ و Xcode 15 أو أحدث):

```bash
# 1. تثبيت الحزم
npm install

# 2. بناء الواجهة الأمامية ومزامنتها مع مشروع Xcode
npm run ios:sync

# 3. فتح المشروع في Xcode
npm run ios:open
```
أو افتح الملف مباشرة من Finder:
`ios/App/App.xcodeproj`

---

## 5. إعداد التوقيع الرقمي (Signing & Capabilities) في Xcode

1. من القائمة اليسرى في Xcode، اختر جذر المشروع **`App`** ثم اختر الهدف (**Target: `App`**).
2. انتقل إلى تبويب **`Signing & Capabilities`**.
3. فعّل خيار **`Automatically manage signing`**.
4. اختر حساب المطور الخاص بك في **`Team`** (حساب Apple Developer Program الفعّال).
5. تأكد من أن **`Bundle Identifier`** هو:
   `com.fatteshha.kuwaitgame`
6. اضغط **`+ Capability`** وأضف **`Sign in with Apple`**.

---

## 6. استخراج نسخة النشر (Archive / IPA) والرفع إلى TestFlight & App Store

1. من شريط Xcode العلوي، غيّر وجهة البناء (Run Destination) إلى:
   **`Any iOS Device (arm64)`**
2. من القائمة العلوية في Xcode، اختر:
   **`Product` ➔ `Archive`**
3. بعد اكتمال عملية الأرشفة، ستفتح نافذة **`Organizer`** تلقائياً:
   - اضغط على زر **`Validate App`** للتحقق المسبق من مطابقة الأيقونة والتوقيع وملف `PrivacyInfo.xcprivacy`.
   - بعد نجاح التحقق، اضغط **`Distribute App`** ➔ **`App Store Connect`** ➔ **`Upload`**.
4. **التجربة عبر TestFlight:**
   - افتح **App Store Connect** ➔ تبويب **TestFlight**.
   - ستظهر النسخة المرفوعة (`1.0 (1)`) خلال دقائق، وبجوارها `Missing Compliance` يختفي تلقائياً بفضل إعداد `ITSAppUsesNonExemptEncryption = false`.
   - أضف حسابك في **Internal Testing** وثبّت اللعبة عبر تطبيق **TestFlight** على جهاز iPhone لتجربتها قبل الإرسال للمراجعة النهائية.

---

## 7. نصوص وبيانات صفحة المتجر الجاهزة للنسخ في App Store Connect

### أ) المعلومات الأساسية (App Information)
- **اسم التطبيق (Name):** `فتّشها - تحداك في كل كلمة`
- **العنوان الفرعي (Subtitle):** `لعبة البحث عن الكلمات والأونلاين`
- **التصنيف الأساسي (Primary Category):** `Games` ➔ `Word` (أو `Trivia`)
- **التصنيف العمري (Age Rating):** `4+` (خالية تماماً من أي محتوى غير ملائم)
- **رابط سياسة الخصوصية العام (Privacy Policy URL):**
  `<YOUR_PRODUCTION_HTTPS_DOMAIN>/privacy-policy`
- **رابط الدعم الفني العام (Support URL):**
  `<YOUR_PRODUCTION_HTTPS_DOMAIN>/support`

*(تنبيه: يجب ضبط `VITE_API_BASE_URL` و`VITE_BACKEND_URL` على نطاق HTTPS دائم ومملوك للإنتاج قبل بناء نسخة `npm run ios:sync` المخصصة للرفع إلى App Store).*

### ب) النص الترويجي (Promotional Text - 170 chars)
> تحدَّ ذكاءك وسرعة ملاحظتك في «فتّشها»! أكثر من 550 مرحلة شيّقة بلهجة وهوية كويتية وعربية، تحدٍ يومي موحّد، وغرف لعب جماعي أونلاين سريعة ومباشرة مع أصدقائك!

### ج) الوصف الكامل للمتجر (Description)
```text
مرحباً بك في «فتّشها – تحداك في كل كلمة»، لعبة البحث عن الكلمات العربية الأكثر حماساً وتفاعلاً بطابع كويتي وخليجي أصيل!

ابحث عن الكلمات المخفية داخل الشبكة في 8 اتجاهات مختلفة (أفقياً، رأسياً، وقطرياً) واكسب النجوم ونقاط الخبرة والعملات لفتح الألقاب والمظاهر الحصرية.

أبرز مميزات لعبة «فتّشها»:
• 550 مرحلة متدرجة الصعوبة موزعة على 11 تصنيفاً ممتعاً (تراث الكويت، أمثال شعبية، أكلات كويتية، مناطق الديرة، رياضة، علوم، والمزيد!).
• اللعب الجماعي المباشر (أونلاين 1 ضد 1): أنشئ غرفة عامة أو خاصة بكود سري، أو ادعُ أصدقاءك مباشرة، وتنافسوا في صيد الكلمات بأجزاء من الثانية!
• مود التحدي الخاطف (20 ثانية): طور تنافسي مثير يمنح كل لاعب 20 ثانية لاكتشاف الكلمة قبل أن ينكشف حرف سري لخصمه!
• التحدي اليومي الموحّد: شبكة يومية موحدة لجميع اللاعبين مع لوحة صدارة حقيقية وجوائز استمرارية يومية وأسبوعية.
• 5 وسائل مساعدة ذكية وكروت مواجهة تفاعلية لقلب موازين المباراة.
• دعم كامل لأجهزة iPhone مع استجابة لمس تفاعلية (Haptics) ومؤثرات صوتية حماسية.

حمّل «فتّشها» الآن وورّنا شطارتك في صيد الكلمات!
```

### د) الكلمات المفتاحية (Keywords - مفصولة بفواصل بدون مسافات)
`فتشها,كلمات,الغاز,الكويت,تحدي,ذكاء,حروف,العاب,عربية,اونلاين,مسابقات,البحث,شبكة,كلمات_متقاطعة`

### هـ) مقاسات لقطات الشاشة المطلوبة في App Store Connect (Screenshots)
عند تشغيل اللعبة على محاكي Xcode (`iPhone 16 Pro Max`)، اضغط **`⌘ + S`** لحفظ 5 لقطات شاشة بالمقاس المعتمد (`1320 × 2868` أو `1290 × 2796` لـ 6.9" / 6.7" Display):
1. شاشة البداية وتسجيل الدخول (تُظهر شخصية فتّشها الكويتية).
2. الشاشة الرئيسية والتصنيفات الـ11.
3. شاشة اللعب الفردي أثناء تحديد الكلمات على الشبكة.
4. شاشة اللعب الجماعي الأونلاين (1 ضد 1) ومود التحدي الخاطف (20 ثانية).
5. شاشة الفوز والنجوم ولوحة الصدارة.
