import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

const ROOT_DIR = process.cwd();
const PROD_FILES_TO_HASH = [
  path.join(ROOT_DIR, 'data', 'database.json'),
  path.join(ROOT_DIR, 'data', '.auth-secret'),
  path.join(ROOT_DIR, 'data', '.admin-secret'),
  path.join(ROOT_DIR, 'data', '.database_initialization_receipt.json'),
  path.join(ROOT_DIR, 'data', '.server_first_run_completed.json')
];

function sha256File(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function snapshotHashes(files) {
  const out = {};
  for (const f of files) {
    out[path.relative(ROOT_DIR, f)] = sha256File(f);
  }
  return out;
}

function assert(cond, msg) {
  if (!cond) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

function cleanServerEnv(overrides = {}) {
  const env = { ...process.env };
  const keysToStrip = [
    'NODE_ENV',
    'RENDER',
    'RENDER_SERVICE_ID',
    'RENDER_EXTERNAL_URL',
    'FATTESHHA_DATA_DIR',
    'FATTESHHA_AUTH_SECRET',
    'SESSION_SECRET',
    'FATTESHHA_ADMIN_SECRET',
    'FATTESHHA_ALLOW_INITIAL_DATABASE_BOOT',
    'FATTESHHA_INIT_FIRST_RUN',
    'PORT'
  ];
  for (const k of keysToStrip) {
    delete env[k];
  }
  return {
    ...env,
    FATTESHHA_DISABLE_SUPABASE_HYDRATION: '1',
    ...overrides
  };
}

function spawnServerAndAwaitExit({ cwd = ROOT_DIR, port, env = {}, timeoutMs = 10000 }) {
  return new Promise((resolve) => {
    const child = spawn('node', ['--import', 'tsx', 'server.ts'], {
      cwd,
      env: cleanServerEnv({ PORT: String(port), ...env }),
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    let finished = false;

    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });

    const timer = setTimeout(() => {
      if (!finished) {
        finished = true;
        try { child.kill('SIGKILL'); } catch {}
        resolve({ exitCode: null, timedOut: true, stdout, stderr });
      }
    }, timeoutMs);

    child.on('exit', (code, signal) => {
      if (!finished) {
        finished = true;
        clearTimeout(timer);
        resolve({ exitCode: code, signal, timedOut: false, stdout, stderr });
      }
    });
  });
}

async function spawnServerAndWaitReady({ cwd = ROOT_DIR, port, env = {}, timeoutMs = 15000 }) {
  const child = spawn('node', ['--import', 'tsx', 'server.ts'], {
    cwd,
    env: cleanServerEnv({ PORT: String(port), ...env }),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let stdout = '';
  let stderr = '';
  let exited = false;
  let exitCode = null;

  child.stdout.on('data', d => { stdout += d.toString(); });
  child.stderr.on('data', d => { stderr += d.toString(); });
  child.on('exit', (code) => {
    exited = true;
    exitCode = code;
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (exited) {
      throw new Error(`Server exited prematurely (code=${exitCode})\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
    }
    try {
      const res = await fetch(`${baseUrl}/health`);
      if (res.ok) {
        const health = await res.json();
        return {
          baseUrl,
          health,
          getLogs: () => ({ stdout, stderr }),
          stop: async () => {
            if (!exited) {
              await new Promise((resExit) => {
                child.once('exit', resExit);
                child.kill('SIGTERM');
                setTimeout(() => {
                  try { child.kill('SIGKILL'); } catch {}
                  resExit();
                }, 2000);
              });
            }
          }
        };
      }
    } catch {
      // retry until ready
    }
    await new Promise(r => setTimeout(r, 150));
  }

  try { child.kill('SIGKILL'); } catch {}
  throw new Error(`Server did not become ready within ${timeoutMs}ms\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
}

function createIsolatedLocalWorkspace(tmpDir) {
  fs.mkdirSync(tmpDir, { recursive: true });
  fs.copyFileSync(path.join(ROOT_DIR, 'server.ts'), path.join(tmpDir, 'server.ts'));
  for (const entry of ['src', 'node_modules', 'package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts', 'index.html', 'public']) {
    const srcPath = path.join(ROOT_DIR, entry);
    const dstPath = path.join(tmpDir, entry);
    if (fs.existsSync(srcPath) && !fs.existsSync(dstPath)) {
      fs.symlinkSync(srcPath, dstPath);
    }
  }
  return tmpDir;
}

function copyDirRecursive(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

async function runAll() {
  const beforeHashes = snapshotHashes(PROD_FILES_TO_HASH);
  console.log('=== Production SHA-256 Snapshot BEFORE Tests ===');
  console.log(JSON.stringify(beforeHashes, null, 2));

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fatteshha-startup-sec-'));
  const results = [];
  let nextPort = 3251;

  const record = (id, name, details) => {
    results.push({ id, name, passed: true, details });
    console.log(`\n[PASS] ${id}: ${name}\n  -> ${details}`);
  };

  try {
    // =========================================================================
    // TEST 1: Local dev first-run (NODE_ENV=development ONLY) + non-dev rejection
    // =========================================================================
    {
      const ws = createIsolatedLocalWorkspace(path.join(tmpRoot, 't1_local_ws'));
      const wsDataDir = path.join(ws, 'data');

      for (const badEnvName of ['test', 'staging', undefined]) {
        const res = await spawnServerAndAwaitExit({
          cwd: ws,
          port: nextPort++,
          env: badEnvName ? { NODE_ENV: badEnvName } : {}
        });
        assert(res.exitCode !== 0 && !res.timedOut, `Expected rejection when NODE_ENV=${String(badEnvName)}`);
        assert(!fs.existsSync(wsDataDir), `data/ must NOT be created for NODE_ENV=${String(badEnvName)}`);
      }

      const srv = await spawnServerAndWaitReady({
        cwd: ws,
        port: nextPort++,
        env: { NODE_ENV: 'development' }
      });
      try {
        assert(srv.health.ok === true, 'Local dev health check failed');
        assert(srv.health.authSecretSource === 'file', `Expected authSecretSource=file, got ${srv.health.authSecretSource}`);
        assert(fs.existsSync(path.join(wsDataDir, 'database.json')), 'Expected database.json created');
        assert(fs.existsSync(path.join(wsDataDir, '.auth-secret')), 'Expected .auth-secret created');
        assert(fs.existsSync(path.join(wsDataDir, '.admin-secret')), 'Expected .admin-secret created');
        assert(fs.existsSync(path.join(wsDataDir, '.database_initialization_receipt.json')), 'Expected storage receipt created');
        assert(fs.existsSync(path.join(wsDataDir, '.server_first_run_completed.json')), 'Expected host receipt created');
      } finally {
        await srv.stop();
      }

      record(
        'Test 1',
        'تشغيل تطوير محلي لأول مرة (NODE_ENV=development فقط) ورفض test/staging/undefined',
        `Rejected NODE_ENV=test|staging|undefined cleanly without creating data/; NODE_ENV=development booted HTTP 200 with DB & secrets created inside ${wsDataDir}`
      );
    }

    // Seed a reusable clean production dataDir for Tests 2, 4, 5
    const seededProdDir = path.join(tmpRoot, 'seeded_prod_dir');
    copyDirRecursive(path.join(tmpRoot, 't1_local_ws', 'data'), seededProdDir);

    // =========================================================================
    // TEST 2: Production run with intact database & secrets
    // =========================================================================
    {
      const dataDir = path.join(tmpRoot, 't2_prod_intact');
      copyDirRecursive(seededProdDir, dataDir);
      const authBefore = sha256File(path.join(dataDir, '.auth-secret'));
      const adminBefore = sha256File(path.join(dataDir, '.admin-secret'));
      const dbBefore = sha256File(path.join(dataDir, 'database.json'));

      const srv = await spawnServerAndWaitReady({
        port: nextPort++,
        env: {
          NODE_ENV: 'production',
          FATTESHHA_DATA_DIR: dataDir
        }
      });
      try {
        assert(srv.health.ok === true, 'Prod intact health failed');
        assert(srv.health.authSecretSource === 'file', 'Expected file secret source');
      } finally {
        await srv.stop();
      }

      const authAfter = sha256File(path.join(dataDir, '.auth-secret'));
      const adminAfter = sha256File(path.join(dataDir, '.admin-secret'));
      const dbAfter = sha256File(path.join(dataDir, 'database.json'));
      assert(authBefore === authAfter, '.auth-secret hash changed on normal prod start!');
      assert(adminBefore === adminAfter, '.admin-secret hash changed on normal prod start!');
      assert(typeof dbAfter === 'string' && dbAfter.length === 64 && dbBefore.length === 64, 'DB missing after start');

      record(
        'Test 2',
        'تشغيل إنتاج بقاعدة بيانات وأسرار سليمة دون استبدالها',
        `Booted HTTP 200 in NODE_ENV=production; .auth-secret SHA-256 preserved (${authAfter.slice(0, 12)}...), .admin-secret SHA-256 preserved (${adminAfter.slice(0, 12)}...)`
      );
    }

    // =========================================================================
    // TEST 3: Storage / Disk Loss in Production & Render (non-existent & empty)
    // =========================================================================
    {
      const missingDisk = path.join(tmpRoot, 't3_unmounted_disk', 'var_data');
      const resMissing = await spawnServerAndAwaitExit({
        port: nextPort++,
        env: {
          NODE_ENV: 'production',
          RENDER: 'true',
          FATTESHHA_DATA_DIR: missingDisk
        }
      });
      assert(resMissing.exitCode !== 0 && !resMissing.timedOut, 'Expected non-zero exit when storage disk is missing');
      assert(!fs.existsSync(missingDisk), 'DATA_DIR must NOT be created when storage disk is lost!');

      const emptyMountedDisk = path.join(tmpRoot, 't3_empty_mounted_disk');
      fs.mkdirSync(emptyMountedDisk, { recursive: true });
      const resEmpty = await spawnServerAndAwaitExit({
        port: nextPort++,
        env: {
          NODE_ENV: 'production',
          RENDER: 'true',
          FATTESHHA_DATA_DIR: emptyMountedDisk
        }
      });
      assert(resEmpty.exitCode !== 0 && !resEmpty.timedOut, 'Expected non-zero exit when mounted disk is empty without authorization');
      assert(!fs.existsSync(path.join(emptyMountedDisk, 'database.json')), 'Empty database.json must NOT be created');
      assert(!fs.existsSync(path.join(emptyMountedDisk, '.auth-secret')), '.auth-secret must NOT be created on disk loss');
      assert(!fs.existsSync(path.join(emptyMountedDisk, '.admin-secret')), '.admin-secret must NOT be created on disk loss');

      record(
        'Test 3',
        'فقدان قرص التخزين في الإنتاج / Render (مسار غير موجود ومسار فارغ)',
        `Both missing (${resMissing.exitCode}) and empty (${resEmpty.exitCode}) halted immediately with zero directory/DB/secret creation`
      );
    }

    // =========================================================================
    // TEST 4: Missing .auth-secret in previously initialized environment
    // =========================================================================
    {
      const dataDir = path.join(tmpRoot, 't4_missing_auth_secret');
      copyDirRecursive(seededProdDir, dataDir);
      const authPath = path.join(dataDir, '.auth-secret');
      const adminPath = path.join(dataDir, '.admin-secret');
      const adminHashBefore = sha256File(adminPath);
      fs.unlinkSync(authPath);

      const res = await spawnServerAndAwaitExit({
        port: nextPort++,
        env: {
          NODE_ENV: 'production',
          FATTESHHA_DATA_DIR: dataDir
        }
      });
      assert(res.exitCode !== 0 && !res.timedOut, 'Expected halt when .auth-secret is missing');
      assert(
        (res.stderr + res.stdout).includes('FATAL AUTH SECRET MISSING'),
        `Expected FATAL AUTH SECRET MISSING in logs, got: ${res.stderr}`
      );
      assert(!fs.existsSync(authPath), 'Replacement .auth-secret MUST NOT be generated!');
      assert(sha256File(adminPath) === adminHashBefore, '.admin-secret was modified unexpectedly');

      record(
        'Test 4',
        'فقدان ملف .auth-secret في بيئة مهيأة مسبقاً',
        `Halted with exitCode=${res.exitCode} and "FATAL AUTH SECRET MISSING"; no replacement .auth-secret created`
      );
    }

    // =========================================================================
    // TEST 5: Missing .admin-secret in previously initialized environment
    // =========================================================================
    {
      const dataDir = path.join(tmpRoot, 't5_missing_admin_secret');
      copyDirRecursive(seededProdDir, dataDir);
      const authPath = path.join(dataDir, '.auth-secret');
      const adminPath = path.join(dataDir, '.admin-secret');
      const authHashBefore = sha256File(authPath);
      fs.unlinkSync(adminPath);

      const res = await spawnServerAndAwaitExit({
        port: nextPort++,
        env: {
          NODE_ENV: 'production',
          FATTESHHA_DATA_DIR: dataDir
        }
      });
      assert(res.exitCode !== 0 && !res.timedOut, 'Expected halt when .admin-secret is missing');
      assert(
        (res.stderr + res.stdout).includes('FATAL ADMIN SECRET MISSING'),
        `Expected FATAL ADMIN SECRET MISSING in logs, got: ${res.stderr}`
      );
      assert(!fs.existsSync(adminPath), 'Replacement .admin-secret MUST NOT be generated!');
      assert(sha256File(authPath) === authHashBefore, '.auth-secret was modified unexpectedly');

      record(
        'Test 5',
        'فقدان ملف .admin-secret في بيئة مهيأة مسبقاً',
        `Halted with exitCode=${res.exitCode} and "FATAL ADMIN SECRET MISSING"; no replacement .admin-secret created`
      );
    }

    // =========================================================================
    // TEST 6: Session token & admin token validity + player progress across restart
    // =========================================================================
    {
      const dataDir = path.join(tmpRoot, 't6_session_continuity');
      const port = nextPort++;
      const srv1 = await spawnServerAndWaitReady({
        port,
        env: {
          NODE_ENV: 'production',
          FATTESHHA_DATA_DIR: dataDir,
          FATTESHHA_ALLOW_INITIAL_DATABASE_BOOT: '1'
        }
      });

      let savedToken = '';
      let savedAdminToken = '';
      let username = `continuity_${Date.now()}`;
      let xpBefore = 0;
      let coinsBefore = 0;
      let authHashBefore = '';
      let adminHashBefore = '';

      try {
        const regRes = await fetch(`${srv1.baseUrl}/api/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username,
            displayName: 'بطل الاستمرارية',
            password: 'SessionPass#2026'
          })
        }).then(r => r.json());
        assert(regRes.success && regRes.authToken, 'Failed to register player in Test 6');
        savedToken = regRes.authToken;

        const stageRes = await fetch(`${srv1.baseUrl}/api/stage/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${savedToken}` },
          body: JSON.stringify({ username, categoryId: 'kuwait_heritage', levelNumber: 1 })
        }).then(r => r.json());
        assert(stageRes.success && stageRes.sessionId, 'Failed to start stage in Test 6');

        for (const wp of stageRes.wordPlacements || []) {
          await fetch(`${srv1.baseUrl}/api/stage/verify-word`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${savedToken}` },
            body: JSON.stringify({ username, sessionId: stageRes.sessionId, word: wp.word })
          });
        }

        const compRes = await fetch(`${srv1.baseUrl}/api/progress/complete-level`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${savedToken}` },
          body: JSON.stringify({ username, sessionId: stageRes.sessionId, requestId: `t6_comp_${Date.now()}` })
        }).then(r => r.json());
        assert(compRes.success && compRes.user?.xp > 0, 'Failed to complete stage in Test 6');
        xpBefore = compRes.user.xp;
        coinsBefore = compRes.user.coins;

        const adminSecretOnDisk = fs.readFileSync(path.join(dataDir, '.admin-secret'), 'utf-8').trim();
        const admRes = await fetch(`${srv1.baseUrl}/api/admin/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ secret: adminSecretOnDisk })
        }).then(r => r.json());
        assert(admRes.success && admRes.adminToken, 'Failed admin login in Test 6');
        savedAdminToken = admRes.adminToken;

        authHashBefore = sha256File(path.join(dataDir, '.auth-secret'));
        adminHashBefore = sha256File(path.join(dataDir, '.admin-secret'));
      } finally {
        await srv1.stop();
      }

      // Restart cleanly WITHOUT FATTESHHA_ALLOW_INITIAL_DATABASE_BOOT
      const srv2 = await spawnServerAndWaitReady({
        port,
        env: {
          NODE_ENV: 'production',
          FATTESHHA_DATA_DIR: dataDir
        }
      });
      try {
        const authHashAfter = sha256File(path.join(dataDir, '.auth-secret'));
        const adminHashAfter = sha256File(path.join(dataDir, '.admin-secret'));
        assert(authHashBefore === authHashAfter, '.auth-secret changed after restart!');
        assert(adminHashBefore === adminHashAfter, '.admin-secret changed after restart!');

        const meRes = await fetch(`${srv2.baseUrl}/api/auth/me`, {
          headers: { Authorization: `Bearer ${savedToken}` }
        });
        assert(meRes.ok, `Pre-restart authToken rejected after restart! status=${meRes.status}`);
        const meData = await meRes.json();
        assert(meData.success && meData.user?.username === username, 'Mismatch on /api/auth/me after restart');
        assert(meData.user.xp === xpBefore, `XP drift across restart: ${xpBefore} vs ${meData.user.xp}`);
        assert(meData.user.coins === coinsBefore, `Coins drift across restart: ${coinsBefore} vs ${meData.user.coins}`);

        const repRes = await fetch(`${srv2.baseUrl}/api/admin/reports`, {
          headers: { 'x-admin-token': savedAdminToken }
        });
        assert(repRes.ok, `Pre-restart adminToken rejected after restart! status=${repRes.status}`);
      } finally {
        await srv2.stop();
      }

      record(
        'Test 6',
        'استمرارية صلاحية رمز الجلسة والمشرف وتقدّم اللاعب بعد إعادة التشغيل',
        `Pre-restart fts_tok & fts_adm both returned HTTP 200 after restart; xp=${xpBefore}, coins=${coinsBefore}, .auth-secret/.admin-secret SHA-256 unchanged`
      );
    }

    // =========================================================================
    // TEST 7: hadPriorInitialization edge cases + pre-init security guard
    // =========================================================================
    {
      // 7A: Loss of DB + receipts + backups in local dev while .auth-secret survives -> must HALT (not treat as first run!)
      const ws7 = createIsolatedLocalWorkspace(path.join(tmpRoot, 't7_partial_secret_loss_ws'));
      const ws7DataDir = path.join(ws7, 'data');
      fs.mkdirSync(ws7DataDir, { recursive: true });
      const survivingSecret = crypto.randomBytes(48).toString('hex');
      fs.writeFileSync(path.join(ws7DataDir, '.auth-secret'), survivingSecret, { mode: 0o600 });
      const survivingHash = sha256File(path.join(ws7DataDir, '.auth-secret'));

      const res7a = await spawnServerAndAwaitExit({
        cwd: ws7,
        port: nextPort++,
        env: { NODE_ENV: 'development' }
      });
      assert(res7a.exitCode !== 0 && !res7a.timedOut, 'Expected halt when DB+receipts+backups missing while .auth-secret exists');
      assert(!fs.existsSync(path.join(ws7DataDir, 'database.json')), 'Blank DB must NOT be created when .auth-secret already exists');
      assert(sha256File(path.join(ws7DataDir, '.auth-secret')) === survivingHash, 'Existing .auth-secret was modified');

      // 7B: Direct serverSecurity pre-init access must throw ServerSecurityInitializationError
      const secMod = await import('../src/engine/serverSecurity.ts');
      let threwPreInit = false;
      try {
        secMod.createAuthToken('probe', 'usr_probe');
      } catch (e) {
        threwPreInit = e?.name === 'ServerSecurityInitializationError';
      }
      assert(threwPreInit, 'Expected createAuthToken before initializeServerSecurity() to throw ServerSecurityInitializationError');

      // Also verify initializing without allowFirstRunSecretGeneration on an empty prod dir throws
      const emptySecDir = path.join(tmpRoot, 't7_empty_sec_dir');
      fs.mkdirSync(emptySecDir, { recursive: true });
      let threwNoApproval = false;
      try {
        secMod.initializeServerSecurity({
          dataDir: emptySecDir,
          hadPriorInitialization: false,
          allowFirstRunSecretGeneration: false
        });
      } catch (e) {
        threwNoApproval = e?.name === 'ServerSecurityInitializationError';
      }
      assert(threwNoApproval, 'Expected initializeServerSecurity without approval to throw');
      assert(!fs.existsSync(path.join(emptySecDir, '.auth-secret')), 'Must not write .auth-secret without approval');

      record(
        'Test 7',
        'حماية hadPriorInitialization عند فقدان DB/الإيصالات ومنع استدعاء دوال الأمان قبل التهيئة',
        'Surviving .auth-secret blocked blank DB creation on restart (halted non-zero); pre-init token creation & unapproved secret init threw ServerSecurityInitializationError'
      );
    }

    const afterHashes = snapshotHashes(PROD_FILES_TO_HASH);
    console.log('\n=== Production SHA-256 Snapshot AFTER Tests ===');
    console.log(JSON.stringify(afterHashes, null, 2));

    for (const key of Object.keys(beforeHashes)) {
      assert(
        beforeHashes[key] === afterHashes[key],
        `CRITICAL: Production file changed during isolated tests: ${key} (${beforeHashes[key]} !== ${afterHashes[key]})`
      );
    }

    console.log('\n✅ ALL 7 STARTUP & SECURITY TESTS PASSED! Production DB & secrets 100% unchanged.');
  } finally {
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {
      // ignore cleanup error
    }
  }
}

runAll().catch((err) => {
  console.error('\n❌ STARTUP SECURITY TEST SUITE FAILED:', err);
  process.exit(1);
});
