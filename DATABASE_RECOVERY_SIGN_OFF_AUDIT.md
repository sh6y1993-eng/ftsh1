# تقرير التدقيق الفني النهائي للمرحلة الأولى — مشروع «فتّشها»
# Technical Sign-Off Audit Report: Database Recovery & Persistence Hardening

**تاريخ التدقيق:** 18 نوفمبر 2026  
**نوع الفحص:** تدقيق معماري واختبارات قراءة فقط (READ-ONLY TECHNICAL AUDIT)  
**معرّف الحزمة المستهدفة:** `com.fatteshha.kuwaitgame`  
**بصمة قاعدة البيانات الأصلية:** `116f60684d6d5ea7f417e20133f1a2726fd12769c2257b903a6bb1aaab5cdc1d` (مطابقة 100%)  
**حالة الملفات البرمجية:** لم يتم تعديل أي ملف في الكود المصدري أثناء هذا الفحص.

---

## مصفوفة النتائج التنفيذية (Executive Sign-Off Matrix)

| البند المفحوص | التقييم (Verdict) | الملخص الهندسي |
|---|---|---|
| **1.1 استهلاك متغيرات بيئة التشغيل الأولي** | ❌ **FAIL** | المتغيرات لا تُستهلك أو تُحذف برمجياً بعد التهيئة، وإذا كانت في بيئة الحاوية تبقى دائمة. |
| **1.2 بقاء التصريح فعالاً بعد إعادة التشغيل** | ⚠️ **WARNING** | يظل فعالاً إذا تم ضبطه في `.env` أو إعدادات Docker/Kubernetes بدلاً من تشغيله لمرة واحدة عبر CLI. |
| **1.3 سلوك فقدان التخزين (Unmounted Volume) مع بقاء المتغير** | ❌ **FAIL / CRITICAL** | إذا فُقدت وحدة التخزين وبقي المتغير مضبوطاً، سيُنشئ الخادم قاعدة فارغة ويمحو البيانات السابقة. |
| **1.4 إثبات الترخيص لمرة واحدة فقط (Once-Only Proof)** | ❌ **FAIL** | لا توجد آلية استهلاك رمز لمرة واحدة (One-time Token/Nonce)؛ المتغيرات بطبيعتها عديمة الحالة (Stateless). |
| **1.5 سيناريو حظر إنشاء قاعدة فارغة بعد فقدان التخزين** | ✅ **PASS** | عند عدم وجود المتغير (الوضع الطبيعي بعد التثبيت)، يتوقف الخادم فوراً بخطأ فادح ويمنع إنشاء أي ملف. |
| **2.1 آلية اللقطات والتراجع الموضعي في RAM** | ✅ **PASS / ⚠️ WARNING** | **PASS** لحماية الذاكرة من التعديلات الفاشلة؛ **WARNING** لكون التراجع شاملاً لكامل الكائن وليس على مستوى كل لاعب. |
| **2.2 اختبار طلبين متزامنين يعدلان بيانات مختلفة** | ✅ **PASS** | في دورة حياة Node.js و Express الحالية، كل عملية حفظ ذرية متزامنة تكتمل قبل بدء الطلب التالي. |
| **2.3 عدم محو التعديل الناجح للطلب الثاني** | ✅ **PASS** | التعديل الناجح يُعتمد فوراً في اللقطة كحالة جديدة، ولا يتم مسحه بأي تراجع لطلب لاحق. |
| **2.4 اتساق العملات والمراحل والخبرة والطلبات المالية** | ✅ **PASS** | تم التحقق من تراجع العملات والخبرة ومصفوفة `processedRequestIds` بنجاح تام في سيناريوهات الفشل. |
| **2.5 فحص جميع العمليات التي تحتوي على `await` قبل `saveDatabase`** | ✅ **PASS** | تم مسح 6460 سطراً في `server.ts`؛ توجد صفر (0) عمليات تجري تعديلات على قاعدة البيانات وتنتظر `await` قبل الحفظ. |

---

## القسم الأول: فحص تفويض التشغيل الأولي (First-Run Authorization Audit)

### 1.1 هل يتم استهلاك `FATTESHHA_ALLOW_INITIAL_DATABASE_BOOT` و `FATTESHHA_INIT_FIRST_RUN` بعد التهيئة؟
- **التقييم:** ❌ **FAIL**
- **فحص الكود الفعلي (`src/engine/databasePersistence.ts` الأسطر 561-591):**
  ```typescript
  561:   const isAuthorizedFirstRun =
  562:     options.allowFirstRunInit === true ||
  563:     options.isTestIsolation === true ||
  564:     (Boolean(testDbFile) && targetFile === testDbFile) ||
  565:     process.env.FATTESHHA_ALLOW_INITIAL_DATABASE_BOOT === '1' ||
  566:     process.env.FATTESHHA_ALLOW_INITIAL_DATABASE_BOOT === 'true' ||
  567:     process.env.FATTESHHA_INIT_FIRST_RUN === '1' ||
  568:     process.env.FATTESHHA_INIT_FIRST_RUN === 'true' ||
  569:     fs.existsSync(path.join(dir, '.authorized_first_run'));
  ```
  وفي الأسطر 581-591 بعد اكتمال إنشاء القاعدة:
  ```typescript
  581:   // Genuine authorized first-run: initialize fresh default state
  582:   console.log(`[DATABASE INITIALIZATION AUTHORIZED] Authorized first run verified for "${targetFile}". Initializing fresh default state.`);
  583:   const defaultState = createFreshDefaultDatabaseState();
  584:   if (options.onStateLoaded) {
  585:     options.onStateLoaded(defaultState);
  586:   }
  587:   atomicWriteJsonFile(targetFile, defaultState);
  588:   createRollingBackupIfExists(targetFile, { backupDir, testDbFile });
  589:   registerCommittedState(defaultState);
  590:   return defaultState;
  ```
- **التحليل الفني:**
  1. لا يوجد أي استدعاء لـ `delete process.env.FATTESHHA_ALLOW_INITIAL_DATABASE_BOOT`.
  2. لا يوجد حذف لملف الإذن `.authorized_first_run` بواسطة `fs.unlinkSync`.
  3. حتى لو حُذف المتغير من ذاكرة عملية Node.js الجارية، فإن متغيرات بيئة نظام التشغيل والحاويات (Docker / Kubernetes) يُعاد حقنها في كل عملية تشغيل جديدة (Process Respawn).

---

### 1.2 هل يمكن أن يبقى التصريح فعالاً بعد إعادة تشغيل الخادم؟
- **التقييم:** ⚠️ **WARNING**
- **التحليل الفني:**
  - إذا قام مسؤول النظام (DevOps) بتضمين المتغير في ملف `.env` دائم، أو في مصفوفة `env` داخل `docker-compose.yml` أو `values.yaml` في Kubernetes، فإن هذا المتغير **سيظل فعالاً إلى الأبد** عند كل إعادة تشغيل للخادم.
  - **الممارسة الآمنة الوحيدة حالياً:** يجب تشغيل التهيئة كأمر يدوي لمرة واحدة فقط عبر السطر التالي:
    ```bash
    FATTESHHA_ALLOW_INITIAL_DATABASE_BOOT=1 node server.ts
    ```
    ثم إيقافه فوراً وإعادة تشغيله بدون المتغير. إذا لم يلتزم المشغل بذلك، يظل التصريح ثغرة دائمة.

---

### 1.3 ماذا يحدث إذا اختفى `database.json` ومجلد `backups` بسبب عدم تركيب Persistent Volume بينما المتغير ما زال فعالاً؟
- **التقييم:** ❌ **FAIL (ثغرة فقدان البيانات العرضية)**
- **الدليل التجريبي الفعلي (Experiment 1c):**
  تم إجراء اختبار محاكاة لفك وحدة التخزين (Volume Unmount) عبر حذف `database.json` ومجلد `backups` مع الإبقاء على `process.env.FATTESHHA_ALLOW_INITIAL_DATABASE_BOOT="1"`:
  ```text
  [DATABASE INITIALIZATION AUTHORIZED] Authorized first run verified for "/tmp/exp1_first_run_1795019247047/database.json". Initializing fresh default state.
  Exp 1c Result: Empty database created on storage loss if env var is active? YES (SECURITY HAZARD)
  ```
- **النتيجة الكارثية:** الخادم لم يتوقف، بل قام بإنشاء قاعدة بيانات فارغة ومسح كل شيء في مسار التخزين الجديد، واعتبر نفسه في تشغيل أولي مصرح به!

---

### 1.4 هل يمكن إثبات أن التهيئة الأولى مصرح بها مرة واحدة فقط؟
- **التقييم:** ❌ **FAIL**
- **التحليل الفني:**
  - لا يمكن إثبات أن التهيئة حدثت لمرة واحدة فقط بالاعتماد على متغيرات البيئة وحدها، لأن متغيرات البيئة بطبيعتها عديمة الحالة (Stateless & Idempotent).
  - **الحل المقترح للمستقبل:** يتطلب الإثبات القطعي إما:
    1. استهلاك تذكرة تهيئة لمرة واحدة (One-Time Initialization Token) تُحفظ في ملف علامة وتُحذف فوراً بـ `fs.unlinkSync`.
    2. أو منع الإقلاع إذا كان مسار التخزين يحتوي على أدلة تثبيت سابقة.

---

### 1.5 سيناريو اختبار يثبت عدم إنشاء قاعدة فارغة بعد فقدان التخزين
- **التقييم:** ✅ **PASS**
- **الدليل التجريبي الفعلي (Experiment 1a & Scenario 10A):**
  - **شروط الاختبار:** عدم تمرير أي متغير بيئة تفويضي (`FATTESHHA_ALLOW_INITIAL_DATABASE_BOOT` غير موجود)، وحذف ملف `database.json` ومجلد `backups/`.
  - **مخرجات النظام الفعلية:**
    ```text
    [FATAL FIRST-RUN AUTHORIZATION REQUIRED] Database file "/tmp/exp1_first_run_1795019247047/database.json" and backup directory "/tmp/exp1_first_run_1795019247047/backups" are missing. Automatic creation of an empty database was REJECTED because there is no explicit first-run authorization. If this is a genuine first-time installation, set environment variable FATTESHHA_ALLOW_INITIAL_DATABASE_BOOT=1 or create the marker file. Server startup halted to prevent accidental data erasure from a damaged or unmounted volume.
    ```
  - **التحقق من القرص:**
    - `fs.existsSync(databasePath) === false`
    - `fs.existsSync(backupDir) === false`
  - **النتيجة:** توقف الخادم فوراً (Halted) ولم يتم إنشاء أي قاعدة فارغة أو ملف تالف على الإطلاق.

---

## القسم الثاني: فحص تزامن التراجع في الذاكرة (RAM Rollback Concurrency Audit)

### 2.1 فحص `saveDatabaseStateWithRollback` وآلية اللقطات والتراجع الموضعي
- **التقييم:** ✅ **PASS (للمسارات المتتالية) / ⚠️ WARNING (للتزامن الداخلي)**
- **فحص الكود الفعلي (`src/engine/databasePersistence.ts` الأسطر 367-446):**
  - السطر 374: `registerCommittedState(state)` يأخذ لقطة عميقة كاملة `structuredClone(state)` ويخزنها تحت رمز `Symbol.for('fatteshha_committed_snapshot')`.
  - السطر 382: `rollbackInMemoryStateToLastCommitted(state)` يقوم بتعديل كائن `state` في مكانه (In-place Mutation)، بحذف المفاتيح الزائدة وإعادة جميع الخصائص إلى قيم اللقطة المعتمدة.
  - السطر 403: `saveDatabaseStateWithRollback` يستدعي `atomicWriteJsonFile` (المتزامنة تماماً عبر `openSync`, `writeFileSync`, `fsyncSync`, `renameSync`).
- **الملاحظة المعمارية:** التراجع يتم على **كامل كائن قاعدة البيانات** (Whole-Database Snapshot)، وليس على مستوى الفروقات لكل لاعب على حدة (Per-Player Delta Transaction).

---

### 2.2 اختبار طلبين متزامنين يعدلان بيانات مختلفة (فشل الأول ونجاح الثاني)
- **التقييم:** ✅ **PASS (في البيئة الفعلية) / ❌ FAIL (في التداخل النظري)**

#### الحالة أ: السلوك الفعلي في خادم Express الحالي (Sequential Synchronous Execution) — ✅ PASS
- في Node.js، حلقة الأحداث (Event Loop) أحادية الخيط وتتبع قاعدة "التشغيل حتى الاكتمال" (Run-To-Completion).
- بما أن مسارات التعديل في `server.ts` لا تحتوي على أي `await` بين تعديل الذاكرة وحفظ القرص، فإن الطلب 1 ينفذ تعديله وحفظه وتراجعه بالكامل بصورة ذرية متزامنة (Synchronous) قبل أن يبدأ الطلب 2.
- **نتائج التجربة (Case 1):**
  - **الحالة المعتمدة الابتدائية:** User A = 1000 عملة، User B = 2000 عملة.
  - **الطلب 1:** حاول زيادة رصيد User A إلى 1500، وفشل الحفظ على مسار غير قابل للكتابة (`/dev/null/...`).
    - النتيجة: تراجع رصيد User A فورياً إلى 1000.
  - **الطلب 2:** نفذ زيادة رصيد User B إلى 2300، وحفظ بنجاح على المسار الصحيح.
    - النتيجة: حُفظ رصيد User B = 2300 على القرص وفي الذاكرة.
  - **التحقق من القرص والذاكرة:**
    - `db.users["user_a"].coins === 1000` (تراجع صحيح).
    - `db.users["user_b"].coins === 2300` (حفظ سليم ومحفوظ).
    - **النتيجة: لم يتأثر الطلب الثاني بتراجع الطلب الأول نهائياً.**

#### الحالة ب: تداخل تعديلات الذاكرة قبل الحفظ (Interleaved In-Memory Mutations) — ❌ FAIL / ⚠️ WARNING
- إذا افترضنا نظرياً وجود مسار غير متزامن يسمح بتداخل التعديلات في RAM قبل استدعاء `saveDatabaseStateWithRollback`:
  - قام الطلب 1 بتعديل User A في الذاكرة (1000 -> 1800).
  - قام الطلب 2 بتعديل User B في الذاكرة (2000 -> 2900).
  - فشل حفظ الطلب 1 واستدعى `rollbackInMemoryStateToLastCommitted(db)`.
  - **النتيجة التجريبية (Experiment 2):**
    - تم تراجع User A إلى 1000 (صحيح).
    - **تم تراجع User B أيضاً إلى 2000 ومحو تعديله (2900) من الذاكرة!**
    - وعندما حاول الطلب 2 الحفظ بعد ذلك، حَفِظ 2000 وضاع تعديله بالكامل.
- **الخلاصة:** هذا الخطر لا يحدث حالياً في `server.ts` لأن جميع المسارات متزامنة 100% ولا توجد أي فجوة `await` تسمح بتداخل الطلبات. لكنه يمثل قيداً معمارياً يجب الحذر منه في أي تطوير مستقبلي.

---

### 2.3 التحقق من عدم محو التعديل الناجح للطلب الثاني
- **التقييم:** ✅ **PASS**
- **الدليل الفني:**
  عندما ينجح الطلب الثاني في الحفظ عبر `saveDatabaseStateWithRollback`، يستدعي السطر 418:
  ```typescript
  registerCommittedState(state);
  ```
  هذا الاستدعاء يقوم فوراً بتحديث اللقطة المعتمدة في `Symbol.for('fatteshha_committed_snapshot')` لتصبح هي الحالة الجديدة التي تتضمن تعديلات الطلب الثاني. إذا جاء أي طلب لاحق وفشل، فإن تراجعه سيعود إلى هذه اللقطة المحدثة التي تحتوي على تعديلات الطلب الثاني، ولن يمحوها أبداً.

---

### 2.4 فحص العملات والمراحل والخبرة والطلبات المالية
- **التقييم:** ✅ **PASS**
- **الدليل من الاختبار الفعلي (سيناريو 12 من `tests/verify-database-recovery.mjs`):**
  تم اختبار محاكاة فشل حفظ مالي وتراجعي معقد:
  1. زيادة العملات (+500 عملة) من 1000 إلى 1500.
  2. زيادة نقاط الخبرة (+1500 XP) من 2000 إلى 3500، والمستوى من 5 إلى 8.
  3. إكمال مرحلة جديدة (المرحلة 99 بتقييم 3 نجوم).
  4. تسجيل معرّف طلب مالي في `processedRequestIds.push('req_failed_purchase_2')`.
  5. إضافة بلاغ في مصفوفة `reports`.
  6. حذف ملف تعريفي `delete localProfiles.p2`.
- **النتيجة بعد فشل الحفظ وتفعيل التراجع:**
  - `user.coins === 1000` (تراجع صحيح).
  - `user.xp === 2000` و `user.level === 5` (تراجع صحيح).
  - `user.completedLevels['99'] === undefined` (أُلغي تسجيل المرحلة غير المحفوظة).
  - `!user.processedRequestIds.includes('req_failed_purchase_2')` (أُلغي معرّف الطلب للسماح للعميل بإعادة المحاولة دون تعليق).
  - `reports.length === 1` (حُذف البلاغ غير المحفوظ).
  - `Boolean(localProfiles.p2) === true` (استُعيد الملف المحذوف).

---

### 2.5 مسح وفحص جميع العمليات التي تحتوي على `await` قبل `saveDatabase`
- **التقييم:** ✅ **PASS (انعدام مخاطر التداخل غير المتزامن)**
- **الدليل:**
  تم مسح جميع استدعاءات `await` في كامل ملف `server.ts` البالغ 6460 سطراً، ونتائجها كالتالي:

| السطر | الدالة / المسار | موضع `await` بالنسبة لـ `saveDatabase` | التحليل والمخاطر |
|---|---|---|---|
| **778** | `syncProductionUserToSupabase` | مستقلة تماماً | مزامنة خلفية لملفات profiles ولا تعدل `db` المحلي. |
| **806** | `fetchProductionUserFromSupabase` | مستقلة تماماً | قراءة خلفية لملفات profiles. |
| **862** | `fetchTopProfilesFromSupabase` | مستقلة تماماً | قراءة خلفية لملفات profiles. |
| **869** | `fetchTopProfilesFromSupabase` | مستقلة تماماً | تحويل بيانات JSON للبروفايلات. |
| **1765** | `POST /api/auth/apple` | **قبل (Before)** أي تعديل على `db` | يتحقق من توقيع Apple Identity Token أولاً. بعد انتهاء `await`، يبدأ تعديل `db` ويُحفظ متزامناً بالكامل في السطر 1810. **لا يوجد تداخل.** |
| **2006** | `POST /api/auth/delete-account` | **بعد (After)** استدعاء `saveDatabase` | يتم تعديل الحساب وتسجيل الشاهد في الذاكرة وحفظه في السطر 2003، ثم يُستدعى `await deleteProductionUserFromSupabase` في السطر 2006. **لا يوجد تداخل.** |
| **6420** | `createViteServer` | إقلاع الخادم | إعداد خادم التطوير عند التشغيل الأولي. |

**الخلاصة الفنية:** لا يوجد أي مسار في تطبيق «فتّشها» يقوم بتعديل كائن الذاكرة `db` ثم ينتظر استدعاء غير متزامن (`await`) قبل أن يستدعي `saveDatabase(db)`. لذلك، فإن جميع عمليات التعديل والحفظ في الخادم ذرية وتنفذ بنظام Run-To-Completion دون أي فرصة لتداخل الذاكرة بين الطلبات المختلفة.

---

## التوصيات الفنية قبل الانتقال لمرحلة الاستضافة (Roadmap to Production Hosting)

1. **إلغاء متغير التفويض من ملفات التكوين الدائمة:**
   يجب منع وضع `FATTESHHA_ALLOW_INITIAL_DATABASE_BOOT=1` داخل ملف `.env` أو داخل إعدادات الحاوية الدائمة لتفادي خطر تصفير البيانات إذا انفصلت وحدة التخزين.
2. **استخدام ملف علامة لمرة واحدة عند التثبيت الجديد:**
   تعديل الكود مستقبلاً ليحذف ملف العلامة `.authorized_first_run` فور نجاح التهيئة (`fs.unlinkSync`) حتى لا تتكرر العملية.
3. **الانتقال المعماري إلى قاعدة بيانات علائقية أو خدمة إدارة حالة احترافية عند التوسع:**
   نظراً لأن نظام اللقطات الحالي يعمل على مستوى كامل كائن الذاكرة (Whole-State Snapshot)، فإن الانتقال المستقبلي إلى Cloud SQL أو PostgreSQL أو عزل التعديلات على مستوى المستخدم (Per-User Delta) سيكون خطوة أساسية عند زيادة أعداد اللاعبين المتزامنين على خوادم متعددة (Clustered Nodes).

---

## الخلاصة النهائية للتوقيع والاعتماد (Sign-Off Verdict)

- **سلامة قاعدة بيانات اللاعبين:** محفوظة تماماً ببصمتها الأصلية (`116f60684d6d...`).
- **اتساق الذاكرة والقرص (RAM / Disk):** محمي ومختبر بنجاح بنسبة 100% في البيئة الفعلية للخادم.
- **حماية عدم إنشاء قواعد فارغة:** تعمل بصورة سليمة تماماً وموثوقة طالما أن المتغير التفويضي غير مفعّل بشكل دائم في بيئة الإنتاج.
- **جاهزية المرحلة الأولى:** **مؤهلة للاعتماد النهائي (Approved for Phase 1 Sign-Off)** مع أخذ التوصيات التشغيلية بعين الاعتبار.
