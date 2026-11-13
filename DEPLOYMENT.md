# دليل نشر لعبة «فتّشها» (Fatteshha Deployment Guide)

يوضح هذا الدليل خيارات نشر اللعبة، سواء كحزمة كاملة (Full-Stack) أو نشر الواجهة الأمامية على **Netlify** مع ربطها بخادم أو **Cloudflare Workers & D1**.

---

## 1. خيار النشر المباشر (Full-Stack Node.js / Cloud Run / VPS)

هذا هو الخيار الأسهل الذي يشغّل الواجهة الأمامية وخادم الـ WebSocket والـ REST API معاً على نفس المنفذ:

1. بناء ملفات الواجهة للإنتاج:
   ```bash
   npm run build
   ```

2. تشغيل الخادم في بيئة الإنتاج:
   ```bash
   NODE_ENV=production node server.ts
   # أو باستخدام tsx:
   NODE_ENV=production npx tsx server.ts
   ```

سيعمل الخادم على المنفذ `PORT=3000` ويخدم كل من:
- صفحات الـ SPA المترجمة من مجلد `dist`
- واجهات REST API على المسارات `/api/*`
- اتصال الـ WebSocket المباشر على المسار `/ws`

---

## 2. نشر الواجهة الأمامية على Netlify

إذا رغبت في نشر الواجهة الثابتة فقط على منصة Netlify:

### إعدادات Netlify:
- **Build Command**: `npm run build`
- **Publish Directory**: `dist`

### ملف إعادة التوجيه للـ SPA (`_redirects`):
أنشئ ملفاً باسم `public/_redirects` يحتوي على:
```
/*    /index.html   200
```

### ربط الخادم من Netlify:
إذا تم استضافة خادم الـ API والـ WebSockets على خادم خارجي (مثل Railway أو Render أو Cloud Run)، حدد متغير البيئة في Netlify:
- `VITE_API_URL`: رابط خادم الـ API الخاص بك
- `VITE_WS_URL`: رابط الـ WebSocket الخاص بك (مثل `wss://your-server.com/ws`)

---

## 3. مخطط قاعدة البيانات لـ Cloudflare D1 / SQLite

يمكنك إنشاء قاعدة البيانات وتشغيل هذا المخطط على Cloudflare D1 عبر الأمر:
```bash
npx wrangler d1 execute fatteshha-db --file=./schema.sql
```

محتوى `schema.sql`:

```sql
-- جدول المستخدمين وحسابات اللاعبين
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  avatar TEXT,
  level INTEGER DEFAULT 1,
  xp INTEGER DEFAULT 0,
  coins INTEGER DEFAULT 100,
  hints_remaining INTEGER DEFAULT 5,
  multiplayer_wins INTEGER DEFAULT 0,
  multiplayer_losses INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- جدول المراحل المكتملة
CREATE TABLE IF NOT EXISTS completed_levels (
  user_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  level_number INTEGER NOT NULL,
  stars INTEGER NOT NULL,
  best_time REAL NOT NULL,
  score INTEGER NOT NULL,
  completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, category_id, level_number),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- جدول الأوسمة والإنجازات المكتسبة
CREATE TABLE IF NOT EXISTS achievements (
  user_id TEXT NOT NULL,
  achievement_id TEXT NOT NULL,
  unlocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, achievement_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- جدول مباريات الأونلاين المباشرة
CREATE TABLE IF NOT EXISTS online_matches (
  id TEXT PRIMARY KEY,
  room_code TEXT NOT NULL,
  category_id TEXT NOT NULL,
  level_number INTEGER NOT NULL,
  winner_id TEXT,
  duration_seconds REAL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 4. إعداد Cloudflare Workers للواجهة الخلفية

إذا كنت تستخدم Cloudflare Workers لدعم الـ WebSockets:
- استخدم **Cloudflare Durable Objects** لدعم الـ WebSocket Rooms (تنسيق حالة الغرف ومزامنة اللاعبين في الوقت الفعلي).
- اربط الـ Worker بقاعدة بيانات D1 المعرفة أعلاه لمعالجة تسجيل الدخول وحفظ تقدم المراحل.
