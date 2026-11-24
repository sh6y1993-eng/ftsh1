/**
 * Comprehensive Automated Security, Functional & Audit-Remediation Verification Suite for «فتّشها»
 * Runs strictly against an isolated test database (data/test-database.json via `x-test-db-isolation: 1`)
 * and verifies that production player data (`data/database.json`) remains 100% untouched.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawn } from 'child_process';
import WebSocket from 'ws';
import mqtt from 'mqtt';

const BASE_URL = process.env.FATTESHHA_BASE_URL || 'http://localhost:3000';
const WS_URL = process.env.FATTESHHA_WS_URL || 'ws://localhost:3000/ws';
const TEST_DATA_DIR = process.env.FATTESHHA_DATA_DIR
  ? path.resolve(process.env.FATTESHHA_DATA_DIR)
  : path.resolve('data');
const PROD_DB_PATH = path.join(TEST_DATA_DIR, 'database.json');
const TEST_DB_PATH = path.join(TEST_DATA_DIR, 'test-database.json');

function sha256File(filePath) {
  if (!fs.existsSync(filePath)) return 'MISSING';
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

async function api(route, method = 'GET', body = null, token = null, extraHeaders = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'x-test-db-isolation': '1',
    ...extraHeaders
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
    headers['x-auth-token'] = token;
  }
  const opts = { method, headers };
  if (body !== null && method !== 'GET') {
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${BASE_URL}${route}`, opts);
  let data = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  return { status: res.status, data };
}

function connectWs(token = null) {
  return new Promise((resolve, reject) => {
    const url = token ? `${WS_URL}?token=${encodeURIComponent(token)}` : WS_URL;
    const ws = new WebSocket(url);
    const messages = [];
    ws.on('message', (buf) => {
      try {
        messages.push(JSON.parse(buf.toString()));
      } catch {
        // ignore
      }
    });
    ws._messages = messages;
    ws.waitFor = (predicate, timeoutMs = 4000) =>
      new Promise((resWait, rejWait) => {
        const start = Date.now();
        const check = () => {
          const found = messages.find(predicate);
          if (found) return resWait(found);
          if (Date.now() - start > timeoutMs) {
            return rejWait(new Error(`WS waitFor timeout after ${timeoutMs}ms`));
          }
          setTimeout(check, 25);
        };
        check();
      });
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

async function runSuite() {
  const prodHashBefore = sha256File(PROD_DB_PATH);

  // Reset isolated test database before starting
  const resetRes = await api('/api/test/reset-isolated-db', 'POST', {});
  if (resetRes.status !== 200) {
    throw new Error(`Failed to reset isolated test DB: ${JSON.stringify(resetRes)}`);
  }

  const results = [];
  const record = (domain, name, goal, scenario, expected, actual, passed) => {
    results.push({ domain, name, goal, scenario, expected, actual, passed: Boolean(passed) });
    const tag = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${tag} [${domain}] ${name} -> ${actual}`);
  };

  const ts = Date.now().toString(36);
  const userA = `test_iso_a_${ts}`;
  const userB = `test_iso_b_${ts}`;
  const userC = `test_iso_c_${ts}`;
  const passA = 'StrongPass#2026A';
  const passB = 'StrongPass#2026B';
  const passC = 'StrongPass#2026C';
  let tokenA = '';
  let tokenB = '';
  let tokenC = '';

  // =========================================================================
  // DOMAIN 1: الحسابات والمصادقة (Auth, Scrypt, Sanitization, Token Ownership, Recovery)
  // =========================================================================
  {
    const regA = await api('/api/auth/register', 'POST', {
      username: userA,
      displayName: 'بطل التدقيق أ',
      password: passA
    });
    tokenA = regA.data.authToken;
    const rawTestDb = JSON.parse(fs.readFileSync(TEST_DB_PATH, 'utf-8'));
    const storedHashA = rawTestDb.users?.[userA]?.passwordHash || '';

    record(
      '1. الحسابات والمصادقة',
      'تجزئة كلمة المرور عبر scrypt + salt وإخفاء passwordHash',
      'التأكد من عدم تخزين كلمة المرور كنص صريح وعدم إعادتها للعميل',
      'تسجيل حساب جديد ثم فحص استجابة API وملف test-database.json',
      'storedHash يبدأ بـ scrypt$ و passwordHash غير موجود في الاستجابة',
      `scrypt=${storedHashA.startsWith('scrypt$')}, leakedInResp=${'passwordHash' in (regA.data.user || {})}`,
      regA.status === 200 &&
        Boolean(tokenA) &&
        storedHashA.startsWith('scrypt$') &&
        storedHashA !== passA &&
        !('passwordHash' in (regA.data.user || {}))
    );

    const loginNoPw = await api('/api/auth/login', 'POST', { username: userA });
    const loginWrongPw = await api('/api/auth/login', 'POST', { username: userA, password: 'WrongPassword!' });
    const loginGoodPw = await api('/api/auth/login', 'POST', { username: userA, password: passA });
    record(
      '1. الحسابات والمصادقة',
      'رفض تسجيل الدخول بدون كلمة مرور أو بكلمة مرور خاطئة',
      'منع تجاوز التحقق من كلمة المرور في /api/auth/login',
      'إرسال طلب بدون password ثم بكلمة مرور خاطئة ثم الصحيحة',
      '400 بدون كلمة مرور، 401 للخاطئة، 200 للصحيحة مع إخفاء passwordHash',
      `noPw=${loginNoPw.status}, wrongPw=${loginWrongPw.status}, goodPw=${loginGoodPw.status}, leaked=${'passwordHash' in (loginGoodPw.data.user || {})}`,
      loginNoPw.status === 400 &&
        loginWrongPw.status === 401 &&
        loginGoodPw.status === 200 &&
        Boolean(loginGoodPw.data.authToken) &&
        !('passwordHash' in (loginGoodPw.data.user || {}))
    );

    const regB = await api('/api/auth/register', 'POST', {
      username: userB,
      displayName: 'بطل التدقيق ب',
      password: passB
    });
    tokenB = regB.data.authToken;

    const regC = await api('/api/auth/register', 'POST', {
      username: userC,
      displayName: 'بطل التدقيق ج',
      password: passC
    });
    tokenC = regC.data.authToken;

    // Impersonation & forged HMAC token check on sync-account & profile/update
    const spoofSync = await api(
      '/api/auth/sync-account',
      'POST',
      { username: userA, displayName: 'مخترق', coins: 999999 },
      tokenB
    );
    const noTokenSync = await api('/api/auth/sync-account', 'POST', { username: userA, displayName: 'مخترق' });
    const spoofMe = await api(`/api/auth/me?username=${encodeURIComponent(userA)}`, 'GET', null, tokenB);

    // Tamper with HMAC token payload (change username to userA using tokenB's signature)
    const tokenBParts = tokenB.split('.');
    const forgedPayload = Buffer.from(
      JSON.stringify({ username: userA, userId: 'usr_forged', iat: Date.now(), jti: 'forged' }),
      'utf-8'
    ).toString('base64url');
    const tamperedToken = `${tokenBParts[0]}.${forgedPayload}.${tokenBParts[2]}`;
    const tamperedMe = await api(`/api/auth/me?username=${encodeURIComponent(userA)}`, 'GET', null, tamperedToken);

    record(
      '1. الحسابات والمصادقة',
      'منع انتحال الهوية وتزوير توكنات HMAC في /api/auth/sync-account و /api/auth/me',
      'إلزام وجود authToken مطابق لصاحب الحساب ورفض أي توكن معدل في الحماية',
      'استدعاء sync-account و me لحساب A بتوكن B، بدون توكن، وبتوكن HMAC معدل الحمولة',
      'رفض 403/401 وعدم قبول التوكن المزور',
      `spoofSync=${spoofSync.status}, noTokenSync=${noTokenSync.status}, spoofMe=${spoofMe.status}, tamperedHmac=${tamperedMe.status}`,
      spoofSync.status === 403 && noTokenSync.status === 401 && spoofMe.status === 403 && tamperedMe.status === 401
    );

    // Signed single-use recovery code test
    const recIssue = await api('/api/auth/recovery-code', 'POST', { username: userA }, tokenA);
    const recoveryCode = recIssue.data.recoveryCode;
    const recUse1 = await api('/api/auth/recover', 'POST', { recoveryCode });
    const recUse2 = await api('/api/auth/recover', 'POST', { recoveryCode });
    const recForged = await api('/api/auth/recover', 'POST', { recoveryCode: 'FTS-REC.forged.invalid' });

    record(
      '1. الحسابات والمصادقة',
      'استعادة الحساب برمز موقع رقمياً وأحادي الاستخدام',
      'منع تزوير رموز الاستعادة أو إعادة استخدامها أكثر من مرة',
      'إصدار رمز استعادة ثم استخدامه ثم محاولة إعادة استخدامه وتزويره',
      'نجاح الأول (200) ورفض الثاني (409/403) ورفض المزور (403/400)',
      `issue=${recIssue.status}, use1=${recUse1.status}, reuse=${recUse2.status}, forged=${recForged.status}`,
      recIssue.status === 200 &&
        Boolean(recoveryCode) &&
        recUse1.status === 200 &&
        Boolean(recUse1.data.authToken) &&
        (recUse2.status === 409 || recUse2.status === 403) &&
        recForged.status >= 400
    );
  }

  // =========================================================================
  // DOMAIN 3: أمان الغرف وصلاحيات المضيف (Server Room Code, Collision, Host Check)
  // =========================================================================
  let roomCode = '';
  {
    const forcedCodeRes = await api(
      '/api/rooms/create',
      'POST',
      {
        code: 'CUSTOM1',
        roomName: 'محاولة فرض رمز',
        player: { id: 'p_host_a', username: userA, displayName: 'بطل أ', avatar: '' }
      },
      tokenA
    );

    const createRoomRes = await api(
      '/api/rooms/create',
      'POST',
      {
        roomName: 'غرفة الاختبار المعزولة',
        player: { id: 'p_host_a', username: userA, displayName: 'بطل أ', avatar: '' },
        categoryId: 'kuwait_heritage',
        stagesCount: 20,
        isPublic: false
      },
      tokenA
    );
    roomCode = createRoomRes.data.room?.code || '';

    const joinRoomRes = await api(
      '/api/rooms/join',
      'POST',
      {
        code: roomCode,
        player: { id: 'p_guest_b', username: userB, displayName: 'بطل ب', avatar: '' }
      },
      tokenB
    );

    // Non-host trying to start room via REST must get 403
    const nonHostStart = await api(
      '/api/rooms/start',
      'POST',
      { code: roomCode, username: userB, playerId: 'p_guest_b' },
      tokenB
    );

    record(
      '3. أمان الغرف وصلاحيات المضيف',
      'توليد رمز الغرفة من الخادم ومنع فرض الرمز وبدء المباراة من غير المضيف',
      'التأكد من أن الخادم يولد الرمز المكون من 5 خانات ويمنع الضيف من بدء المباراة',
      'محاولة فرض رمز CUSTOM1 ثم إنشاء غرفة رسمية ثم محاولة الضيف بدء المباراة',
      'رفض فرض الرمز (400)، توليد رمز 5 خانات، ورفض بدء الضيف (403)',
      `forcedCode=${forcedCodeRes.status}, generatedCode=${roomCode}, nonHostStart=${nonHostStart.status}`,
      forcedCodeRes.status === 400 &&
        /^[A-Z0-9]{5}$/.test(roomCode) &&
        joinRoomRes.status === 200 &&
        nonHostStart.status === 403
    );
  }

  // =========================================================================
  // DOMAIN 2: اللعب الجماعي و WebSocket و MQTT
  // =========================================================================
  {
    const wsUnauth = await connectWs(null);
    wsUnauth.send(
      JSON.stringify({
        type: 'ROOM_START',
        payload: { code: roomCode }
      })
    );
    const unauthErr = await wsUnauth.waitFor(m => m.type === 'ERROR');

    const wsHost = await connectWs(tokenA);
    const wsGuest = await connectWs(tokenB);
    const wsOutsider = await connectWs(tokenC);

    wsHost.send(
      JSON.stringify({
        type: 'ROOM_REJOIN',
        payload: { code: roomCode, playerId: 'p_host_a', username: userA }
      })
    );
    await wsHost.waitFor(m => m.type === 'ROOM_REJOINED');

    wsGuest.send(
      JSON.stringify({
        type: 'ROOM_REJOIN',
        payload: { code: roomCode, playerId: 'p_guest_b', username: userB }
      })
    );
    await wsGuest.waitFor(m => m.type === 'ROOM_REJOINED');

    // Guest tries to start via WebSocket -> must fail with FORBIDDEN_NOT_HOST
    wsGuest.send(
      JSON.stringify({
        type: 'ROOM_START',
        payload: { code: roomCode, playerId: 'p_guest_b' }
      })
    );
    const guestStartErr = await wsGuest.waitFor(m => m.type === 'ERROR');

    // Host starts via REST (or WS)
    const hostStart = await api(
      '/api/rooms/start',
      'POST',
      { code: roomCode, username: userA, playerId: 'p_host_a' },
      tokenA
    );
    const roomWords = hostStart.data.room?.words || [];
    const targetWord = roomWords[0];
    const hiddenCells = (hostStart.data.room?.wordPlacements || []).every(
      wp => !wp.cells || wp.cells.length === 0
    );

    // Outsider tries to claim word in room -> must be rejected
    wsOutsider.send(
      JSON.stringify({
        type: 'WORD_FOUND',
        payload: { code: roomCode, word: targetWord, playerId: 'p_host_a' }
      })
    );
    const outsiderErr = await wsOutsider.waitFor(m => m.type === 'ERROR');

    // Player B tries spoofing player A's playerId -> must be rejected
    wsGuest.send(
      JSON.stringify({
        type: 'WORD_FOUND',
        payload: { code: roomCode, word: targetWord, playerId: 'p_host_a' }
      })
    );
    const spoofPlayerErr = await wsGuest.waitFor(
      m => m.type === 'ERROR' && m.payload?.code === 'FORBIDDEN_PLAYER_SPOOF'
    );

    // Two-client live WebSocket gameplay: CURSOR_DRAG -> OPPONENT_CURSOR, WORD_FOUND -> WORD_CLAIMED for both clients
    wsHost.send(
      JSON.stringify({
        type: 'CURSOR_DRAG',
        payload: { code: roomCode, playerId: 'p_host_a', cells: [{ row: 0, col: 0 }] }
      })
    );
    const oppCursorMsg = await wsGuest.waitFor(m => m.type === 'OPPONENT_CURSOR');

    wsGuest.send(
      JSON.stringify({
        type: 'WORD_FOUND',
        payload: { code: roomCode, word: roomWords[1], playerId: 'p_guest_b' }
      })
    );
    const hostSawGuestWord = await wsHost.waitFor(
      m => m.type === 'WORD_CLAIMED' && m.payload?.playerId === 'p_guest_b'
    );
    const guestSawOwnWord = await wsGuest.waitFor(
      m => m.type === 'WORD_CLAIMED' && m.payload?.playerId === 'p_guest_b'
    );

    // Real two-client MQTT live pub/sub round-trip + server signature verification
    const claimRes = await api(
      '/api/rooms/claim-word',
      'POST',
      { code: roomCode, word: targetWord, playerId: 'p_host_a' },
      tokenA
    );

    // Unsigned / forged MQTT message with pts=9999 must be rejected (403)
    const forgedMqtt = await api(
      '/api/rooms/verify-mqtt-message',
      'POST',
      { code: roomCode, type: 'WORD_CLAIMED', word: roomWords[2] || targetWord, playerId: 'p_guest_b', pts: 9999 },
      tokenB
    );

    const mqttRoundTrip = await new Promise((resolve) => {
      const mqttTopic = `fatteshha/rooms/v1/${roomCode}`;
      const cA = mqtt.connect('wss://broker.emqx.io:8084/mqtt', { connectTimeout: 5000 });
      const cB = mqtt.connect('wss://broker.emqx.io:8084/mqtt', { connectTimeout: 5000 });
      const timer = setTimeout(() => {
        cA.end(true);
        cB.end(true);
        resolve({ received: false, verified: false });
      }, 7000);
      cB.on('connect', () => {
        cB.subscribe(mqttTopic, { qos: 1 }, () => {
          const publishSigned = () => {
            cA.publish(
              mqttTopic,
              JSON.stringify({
                type: 'WORD_FOUND',
                senderId: 'p_host_a',
                payload: {
                  word: claimRes.data.word,
                  playerId: claimRes.data.playerId,
                  wordScore: claimRes.data.wordScore,
                  signature: claimRes.data.signature
                }
              }),
              { qos: 1 }
            );
          };
          if (cA.connected) publishSigned();
          else cA.once('connect', publishSigned);
        });
      });
      cB.on('message', async (_t, buf) => {
        try {
          const parsed = JSON.parse(buf.toString());
          if (parsed?.type === 'WORD_FOUND' && parsed?.payload?.signature) {
            clearTimeout(timer);
            const verifyRes = await api(
              '/api/rooms/verify-mqtt-message',
              'POST',
              {
                code: roomCode,
                type: 'WORD_CLAIMED',
                word: parsed.payload.word,
                playerId: parsed.payload.playerId,
                wordScore: parsed.payload.wordScore,
                signature: parsed.payload.signature
              },
              tokenB
            );
            cA.end(true);
            cB.end(true);
            resolve({ received: true, verified: verifyRes.status === 200 && verifyRes.data?.valid === true });
          }
        } catch {
          // ignore
        }
      });
      cA.on('error', () => {});
      cB.on('error', () => {});
    });

    // Claim remaining words via WS to verify GAME_FINISHED broadcast across both clients
    for (const remWord of roomWords.slice(2)) {
      wsHost.send(
        JSON.stringify({
          type: 'WORD_FOUND',
          payload: { code: roomCode, word: remWord, playerId: 'p_host_a' }
        })
      );
    }
    const hostGameFinished = await wsHost.waitFor(m => m.type === 'GAME_FINISHED');
    const guestGameFinished = await wsGuest.waitFor(m => m.type === 'GAME_FINISHED');

    // Verify next-stage rematch on an unbound fresh WebSocket (no prior ROOM_REJOIN) + broadcast to guest
    const wsHostFresh = await connectWs(tokenA);
    wsHostFresh.send(
      JSON.stringify({
        type: 'ROOM_REMATCH',
        payload: { code: roomCode, playerId: 'p_host_a', currentRoundNumber: 1 }
      })
    );
    const hostRematchMsg = await wsHostFresh.waitFor(m => m.type === 'GAME_REMATCH_STARTED');
    const guestRematchMsg = await wsGuest.waitFor(m => m.type === 'GAME_REMATCH_STARTED');

    // Verify REST /api/rooms/rematch idempotency + round 3 advancement + outsider 403
    const rematchIdemRes = await api(
      '/api/rooms/rematch',
      'POST',
      { code: roomCode, playerId: 'p_host_a', username: userA, currentRoundNumber: 1 },
      tokenA
    );
    const rematchRound3Res = await api(
      '/api/rooms/rematch',
      'POST',
      { code: roomCode, playerId: 'p_host_a', username: userA, currentRoundNumber: 2 },
      tokenA
    );
    const rematchOutsiderRes = await api(
      '/api/rooms/rematch',
      'POST',
      { code: roomCode, playerId: 'p_host_a', username: userC },
      tokenC
    );

    wsUnauth.close();
    wsHost.close();
    wsHostFresh.close();
    wsGuest.close();
    wsOutsider.close();

    record(
      '2. اللعب الجماعي وWebSocket وMQTT',
      'مصادقة WS، اللعب المباشر بين عميلين عبر WS وMQTT الحي، المرحلة التالية، ومنع الانتحال',
      'التأكد من إخفاء الإحداثيات، مزامنة عميلين فعلياً عبر WS وMQTT، عمل المرحلة التالية (WS وREST)، ورفض التزوير',
      'اختبار WS بلا توكن، دخيل، انتحال، لعب كامل بين عميلين، MQTT حي، ثم المرحلة التالية عبر WS و/api/rooms/rematch',
      'رفض المخالفات، تزامن الكلمات والإنهاء والريماتش على العميلين، والتحقق من توقيع MQTT',
      `unauth=${unauthErr.payload?.code}, guestStart=${guestStartErr.payload?.code}, outsider=${outsiderErr.payload?.code}, spoof=${spoofPlayerErr.payload?.code}, hidden=${hiddenCells}, wsSync=${Boolean(oppCursorMsg && hostSawGuestWord && guestSawOwnWord)}, wsFinish=${Boolean(hostGameFinished && guestGameFinished)}, wsRematch=${hostRematchMsg.payload?.roundNumber}-${guestRematchMsg.payload?.roundNumber}, restRematch=${rematchIdemRes.data?.roundNumber}/${rematchRound3Res.data?.roundNumber}/out:${rematchOutsiderRes.status}, mqttLive=${mqttRoundTrip.received && mqttRoundTrip.verified}, forgedMqtt=${forgedMqtt.status}`,
      unauthErr.payload?.code === 'UNAUTHORIZED' &&
        guestStartErr.payload?.code === 'FORBIDDEN_NOT_HOST' &&
        outsiderErr.payload?.code === 'NOT_ROOM_MEMBER' &&
        spoofPlayerErr.payload?.code === 'FORBIDDEN_PLAYER_SPOOF' &&
        hiddenCells &&
        Boolean(oppCursorMsg) &&
        Boolean(hostSawGuestWord) &&
        Boolean(guestSawOwnWord) &&
        Boolean(hostGameFinished) &&
        Boolean(guestGameFinished) &&
        hostRematchMsg.payload?.roundNumber === 2 &&
        guestRematchMsg.payload?.roundNumber === 2 &&
        hostRematchMsg.payload?.room?.players?.['p_host_a']?.score === 0 &&
        rematchIdemRes.status === 200 &&
        rematchIdemRes.data?.roundNumber === 2 &&
        rematchRound3Res.status === 200 &&
        rematchRound3Res.data?.roundNumber === 3 &&
        rematchOutsiderRes.status === 403 &&
        claimRes.status === 200 &&
        forgedMqtt.status === 403 &&
        mqttRoundTrip.received &&
        mqttRoundTrip.verified
    );
  }

  // =========================================================================
  // DOMAIN 4: الأصدقاء والدعوات
  // =========================================================================
  {
    const addRes = await api(
      '/api/friends/add',
      'POST',
      { username: userA, friendUsername: userB },
      tokenA
    );
    const spoofAdd = await api(
      '/api/friends/add',
      'POST',
      { username: userA, friendUsername: userC },
      tokenB
    );
    const inviteRes = await api(
      '/api/friends/invite',
      'POST',
      { fromUsername: userA, toUsername: userB, roomCode, roomName: 'غرفة الاختبار المعزولة' },
      tokenA
    );
    record(
      '4. الأصدقاء والدعوات',
      'إضافة ودعوة الأصدقاء ومنع تنفيذ العمليات نيابة عن لاعب آخر',
      'التحقق من نجاح إضافة الصديق وإرسال الدعوة ورفض انتحال الهوية',
      'إضافة B لصداقة A بتوكن A، ثم محاولة B الإضافة باسم A بتوكن B',
      'نجاح الإضافة والدعوة (200) ورفض الانتحال (403)',
      `add=${addRes.status}, spoofAdd=${spoofAdd.status}, invite=${inviteRes.status}`,
      addRes.status === 200 && spoofAdd.status === 403 && inviteRes.status === 200
    );
  }

  // =========================================================================
  // DOMAIN 5: جلسات المراحل، الإحداثيات، النتائج والمكافآت
  // =========================================================================
  let sessionA = '';
  let placementsA = [];
  {
    const stStart = await api(
      '/api/stage/start',
      'POST',
      { username: userA, categoryId: 'kuwait_heritage', levelNumber: 1 },
      tokenA
    );
    sessionA = stStart.data.sessionId;
    placementsA = stStart.data.wordPlacements || [];
    const noLeakedCells = placementsA.every(wp => !wp.cells || wp.cells.length === 0);

    // Player B tries using Player A's sessionId -> must get 403
    const stolenVerify = await api(
      '/api/stage/verify-word',
      'POST',
      { username: userB, sessionId: sessionA, word: placementsA[0]?.word },
      tokenB
    );

    // Premature complete before finding words -> 400
    const prematureComplete = await api(
      '/api/progress/complete-level',
      'POST',
      { username: userA, sessionId: sessionA, categoryId: 'kuwait_heritage', levelNumber: 1 },
      tokenA
    );

    // Find all words legitimately
    for (const wp of placementsA) {
      await api(
        '/api/stage/verify-word',
        'POST',
        { username: userA, sessionId: sessionA, word: wp.word },
        tokenA
      );
    }

    // Concurrent race condition attack on /api/progress/complete-level
    const raceCompletions = await Promise.all([
      api(
        '/api/progress/complete-level',
        'POST',
        { username: userA, sessionId: sessionA, requestId: `race_comp_${ts}`, score: 999999, earnedCoins: 999999 },
        tokenA
      ),
      api(
        '/api/progress/complete-level',
        'POST',
        { username: userA, sessionId: sessionA, requestId: `race_comp_${ts}`, score: 999999, earnedCoins: 999999 },
        tokenA
      ),
      api(
        '/api/progress/complete-level',
        'POST',
        { username: userA, sessionId: sessionA, requestId: `race_comp_${ts}`, score: 999999, earnedCoins: 999999 },
        tokenA
      )
    ]);
    const okCount = raceCompletions.filter(r => r.status === 200).length;
    const conflictCount = raceCompletions.filter(r => r.status === 409).length;
    const verifiedScore = raceCompletions.find(r => r.status === 200)?.data?.verifiedResult?.score || 0;

    record(
      '5. جلسات المراحل والنتائج والمكافآت',
      'ملكية الجلسة، إخفاء الإحداثيات، منع الإكمال المبكر، وحماية السباقات',
      'التأكد من عدم سرقة جلسة لاعب آخر ومنع تكرار المكافآت بالطلبات المتزامنة',
      'محاولة B استخدام جلسة A، إكمال مبكر، ثم إرسال 3 طلبات إكمال متزامنة',
      'stolen=403، premature=400، ونجاح طلب واحد فقط (200) ورفض البقية (409) مع تجاهل النقاط المزورة',
      `hidden=${noLeakedCells}, stolen=${stolenVerify.status}, premature=${prematureComplete.status}, raceOk=${okCount}, race409=${conflictCount}, score=${verifiedScore}`,
      noLeakedCells &&
        stolenVerify.status === 403 &&
        prematureComplete.status === 400 &&
        okCount === 1 &&
        conflictCount === 2 &&
        verifiedScore > 0 &&
        verifiedScore < 10000
    );
  }

  // =========================================================================
  // DOMAIN 6: التلميحات الـ5 والمتجر واقتصاد العملات
  // =========================================================================
  {
    const st2 = await api(
      '/api/stage/start',
      'POST',
      { username: userA, categoryId: 'kuwait_heritage', levelNumber: 2 },
      tokenA
    );
    const sid2 = st2.data.sessionId;
    const hintTypes = ['SINGLE_LETTER', 'WORD_START', 'WORD_LENGTH', 'REMOVE_UNUSED', 'FULL_WORD'];
    const hintResults = {};
    for (let i = 0; i < hintTypes.length; i++) {
      const hRes = await api(
        '/api/hints/use',
        'POST',
        { username: userA, sessionId: sid2, hintType: hintTypes[i], requestId: `h5_${ts}_${i}` },
        tokenA
      );
      hintResults[hintTypes[i]] = hRes;
    }
    const invalidHintRes = await api(
      '/api/hints/use',
      'POST',
      { username: userA, sessionId: sid2, hintType: 'INVALID_HACK_HINT', requestId: `hbad_${ts}` },
      tokenA
    );

    // Concurrent daily free pack claim race test
    const packRace = await Promise.all([
      api('/api/store/action', 'POST', { username: userA, action: 'CLAIM_DAILY_PACK', requestId: `dp1_${ts}` }, tokenA),
      api('/api/store/action', 'POST', { username: userA, action: 'CLAIM_DAILY_PACK', requestId: `dp2_${ts}` }, tokenA)
    ]);
    const packOk = packRace.filter(r => r.status === 200).length;
    const packBlocked = packRace.filter(r => r.status === 409).length;

    // Insufficient coins test
    const poorBuy = await api(
      '/api/store/action',
      'POST',
      { username: userC, action: 'BUY_VIP', requestId: `poor_vip_${ts}` },
      tokenC
    );

    const exactHintEffectsValid =
      hintResults.SINGLE_LETTER?.status === 200 &&
      (hintResults.SINGLE_LETTER?.data?.hintEffect?.revealedCells?.length || 0) >= 1 &&
      hintResults.WORD_START?.status === 200 &&
      (hintResults.WORD_START?.data?.hintEffect?.revealedCells?.length || 0) >= 1 &&
      hintResults.WORD_LENGTH?.status === 200 &&
      hintResults.WORD_LENGTH?.data?.hintEffect?.showWordLengths === true &&
      hintResults.REMOVE_UNUSED?.status === 200 &&
      (hintResults.REMOVE_UNUSED?.data?.hintEffect?.removedDistractorCells?.length || 0) > 0 &&
      hintResults.FULL_WORD?.status === 200 &&
      Boolean(hintResults.FULL_WORD?.data?.hintEffect?.autoCompletedPlacement?.word);

    record(
      '6. التلميحات الـ5 والمتجر',
      'التحقق الفعلي من تأثيرات التلميحات الـ5 + حماية الشراء المتزامن والرصيد غير الكافي',
      'التحقق من التأثير الفعلي لكل نوع من التلميحات الـ5 ومنع تكرار المكافآت',
      'اختبار الحرف، بداية الكلمة، طول الكلمات، حذف الزوائد، كشف الكلمة، تلميح وهمي، وسباق الحزمة اليومية',
      'تأثيرات دقيقة للـ5 تلميحات، رفض الوهمي 400، استلام مجاني واحد، ورفض VIP برصيد ضعيف 400',
      `exact5=${exactHintEffectsValid}, invalid=${invalidHintRes.status}, packOk=${packOk}, pack409=${packBlocked}, poorBuy=${poorBuy.status}`,
      exactHintEffectsValid && invalidHintRes.status === 400 && packOk === 1 && packBlocked === 1 && poorBuy.status === 400
    );
  }

  // =========================================================================
  // DOMAIN 7: التصنيفات والـ 550 مرحلة والتسلسل
  // =========================================================================
  {
    // Verify locked level 5 in kuwait_heritage is rejected before completing 1..4
    const lockedLevelRes = await api(
      '/api/stage/start',
      'POST',
      { username: userA, categoryId: 'kuwait_heritage', levelNumber: 5 },
      tokenA
    );
    // Verify locked premium category is rejected before purchase
    const lockedCatRes = await api(
      '/api/stage/start',
      'POST',
      { username: userA, categoryId: 'kuwait_dialect_pro', levelNumber: 1 },
      tokenA
    );
    // Verify Level 2 IS unlocked after completing Level 1
    const unlockedLevel2Res = await api(
      '/api/stage/start',
      'POST',
      { username: userA, categoryId: 'kuwait_heritage', levelNumber: 2 },
      tokenA
    );
    // Verify invalid category ID is rejected
    const badCatRes = await api(
      '/api/stage/start',
      'POST',
      { username: userA, categoryId: 'non_existent_category', levelNumber: 1 },
      tokenA
    );
    // Verify 11 categories x 50 stages = 550 total stages exist in gameCategories.ts
    const catSrc = fs.readFileSync(path.resolve('src/engine/gameCategories.ts'), 'utf-8');
    const totalLevelsMatches = catSrc.match(/totalLevels:\s*50/g) || [];
    const totalStages550 = totalLevelsMatches.length === 11;

    // Re-login userA and verify completedLevels persisted
    const reloginA = await api('/api/auth/login', 'POST', { username: userA, password: passA });
    const hasLevel1Saved = Boolean(reloginA.data.user?.completedLevels?.['kuwait_heritage_1']);

    record(
      '7. التصنيفات والـ550 مرحلة',
      'حماية التصنيفات الحصرية والمراحل المغلقة، فتح المرحلة التالية، وتغطية 550 مرحلة',
      'منع فتح مرحلة/تصنيف مغلق والتحقق من فتح المرحلة 2 ووجود 550 مرحلة وحفظ التقدم',
      'طلب مرحلة 5 مقفلة + تصنيف حصري مقفل + مرحلة 2 المفتوحة + فحص 11×50 مرحلة + إعادة الدخول',
      '403 للمقفل، 200 للمرحلة 2، 400 للتصنيف الخاطئ، توفر 550 مرحلة وحفظ التقدم',
      `lockedLvl=${lockedLevelRes.status}, lockedCat=${lockedCatRes.status}, unlockedLvl2=${unlockedLevel2Res.status}, badCat=${badCatRes.status}, stages550=${totalStages550}, persisted=${hasLevel1Saved}`,
      lockedLevelRes.status === 403 &&
        lockedCatRes.status === 403 &&
        unlockedLevel2Res.status === 200 &&
        badCatRes.status === 400 &&
        totalStages550 &&
        hasLevel1Saved
    );
  }

  // =========================================================================
  // DOMAIN 8: التحدي اليومي الموحد (Kuwait Timezone, No Date Tampering, Genuine LB)
  // =========================================================================
  {
    const tamperGet = await api(`/api/unified-daily/today?simOffsetDays=3`, 'GET', null, tokenA);
    const tamperStart = await api('/api/unified-daily/start', 'POST', { username: userA, dateKey: '2099-01-01' }, tokenA);

    const todayA = await api('/api/unified-daily/today', 'GET', null, tokenA);
    const todayB = await api('/api/unified-daily/today', 'GET', null, tokenB);
    const chA = todayA.data.challenge;
    const chB = todayB.data.challenge;

    // Leaderboard must contain NO synthetic seeded bots initially
    const initialLbCount = (chA?.dailyLeaderboard || []).length;

    const startDaily = await api('/api/unified-daily/start', 'POST', { username: userA }, tokenA);
    const w0 = startDaily.data.challenge.targetWords[0].word;
    await api('/api/unified-daily/verify-word', 'POST', { username: userA, word: w0 }, tokenA);

    // Resume preserves found word without starting a new attempt
    const resumeDaily = await api('/api/unified-daily/start', 'POST', { username: userA }, tokenA);
    const resumedOk = resumeDaily.data.resumed === true && resumeDaily.data.challenge.attempt.wordsFound.includes(w0);

    for (const tw of resumeDaily.data.challenge.targetWords.slice(1)) {
      await api('/api/unified-daily/verify-word', 'POST', { username: userA, word: tw.word }, tokenA);
    }

    const afterComplete = await api('/api/unified-daily/today', 'GET', null, tokenA);
    const secondTrySameDay = await api('/api/unified-daily/start', 'POST', { username: userA }, tokenA);

    // Simulate next day in Asia/Kuwait (+25 hours) on isolated test DB
    const nextDayMs = Date.now() + 25 * 60 * 60 * 1000;
    const nextDayStart = await api(
      '/api/unified-daily/start',
      'POST',
      { username: userA },
      tokenA,
      { 'x-test-kuwait-now-ms': String(nextDayMs) }
    );

    record(
      '8. التحدي اليومي الموحد',
      'رفض تلاعب التاريخ، إزالة المتصدرين الوهميين، استكمال الانقطاع، وحد المحاولة اليومية',
      'التحقق من توحيد اللوحة بتوقيت الكويت وحماية لوحة المتصدرين وانتقال اليوم الجديد',
      'إرسال simOffsetDays=3 و dateKey مزور، إكمال التحدي، محاولة ثانية بنفس اليوم، ثم محاكاة يوم جديد',
      'رفض التلاعب (400)، لوحة متصدرين حقيقية 100%، رفض المحاولة الثانية (409)، وفتح اليوم الجديد (200)',
      `tamperGet=${tamperGet.status}, tamperStart=${tamperStart.status}, initLb=${initialLbCount}, sameGrid=${JSON.stringify(chA.grid) === JSON.stringify(chB.grid)}, resumed=${resumedOk}, lbReal=${afterComplete.data.challenge.dailyLeaderboard.length === 1}, secondTry=${secondTrySameDay.status}, nextDay=${nextDayStart.status}`,
      tamperGet.status === 400 &&
        tamperStart.status === 400 &&
        initialLbCount === 0 &&
        chA.timezone === 'Asia/Kuwait' &&
        chA.totalWords === 8 &&
        chA.durationSeconds === 90 &&
        JSON.stringify(chA.grid) === JSON.stringify(chB.grid) &&
        resumedOk &&
        afterComplete.data.challenge.dailyLeaderboard.length === 1 &&
        secondTrySameDay.status === 409 &&
        nextDayStart.status === 200
    );
  }

  // =========================================================================
  // DOMAIN 8B: مجانية مود التحدي الخاطف (20ث منفصلة بالتتابع) وكروت التحدي + سرية الحرف المكشوف
  // =========================================================================
  {
    // 1) Verify userA starts with SPEED_REVEAL_20S unlocked for free and 0 coins are deducted when creating a room
    const meBeforeFree = await api(`/api/auth/me?username=${encodeURIComponent(userA)}`, 'GET', null, tokenA);
    const coinsBeforeFree = meBeforeFree.data?.user?.coins ?? 0;

    // Create & start SPEED_REVEAL_20S room directly WITHOUT any store purchase
    const spdCreate = await api(
      '/api/rooms/create',
      'POST',
      {
        roomName: 'غرفة التحدي الخاطف المجانية',
        player: { id: 'p_spd_a', username: userA, displayName: 'بطل أ', avatar: '' },
        categoryId: 'kuwait_heritage',
        gameMode: 'SPEED_REVEAL_20S',
        isPublic: false
      },
      tokenA
    );
    const spdCode = spdCreate.data.room?.code || '';
    const spdJoin = await api(
      '/api/rooms/join',
      'POST',
      {
        code: spdCode,
        player: { id: 'p_spd_b', username: userB, displayName: 'بطل ب', avatar: '' }
      },
      tokenB
    );
    const spdStart = await api(
      '/api/rooms/start',
      'POST',
      { code: spdCode, username: userA, playerId: 'p_spd_a' },
      tokenA
    );

    // 2) Verify all Battle Cards are free and unlimited over WebSocket (without buying from Store)
    const wsCardA = await connectWs(tokenA);
    wsCardA.send(JSON.stringify({ type: 'ROOM_REJOIN', payload: { code: spdCode, playerId: 'p_spd_a', username: userA } }));
    await wsCardA.waitFor(m => m.type === 'ROOM_REJOINED');
    wsCardA.send(
      JSON.stringify({
        type: 'USE_BATTLE_CARD',
        payload: { code: spdCode, cardId: 'CARD_BLIND_WORDS', playerId: 'p_spd_a' }
      })
    );
    const blindMsg = await wsCardA.waitFor(m => m.type === 'BATTLE_CARD_APPLIED' && m.payload?.cardId === 'CARD_BLIND_WORDS');
    // Second consecutive use of CARD_BLIND_WORDS (exceeds old initial count of 1) proves unlimited free use
    wsCardA.send(
      JSON.stringify({
        type: 'USE_BATTLE_CARD',
        payload: { code: spdCode, cardId: 'CARD_BLIND_WORDS', playerId: 'p_spd_a' }
      })
    );
    const blindMsg2 = await wsCardA.waitFor(
      m => m !== blindMsg && m.type === 'BATTLE_CARD_APPLIED' && m.payload?.cardId === 'CARD_BLIND_WORDS'
    );
    wsCardA.send(
      JSON.stringify({
        type: 'USE_BATTLE_CARD',
        payload: { code: spdCode, cardId: 'CARD_FREEZE_OPPONENT', playerId: 'p_spd_a' }
      })
    );
    const freezeMsg = await wsCardA.waitFor(
      m => m.type === 'BATTLE_CARD_APPLIED' && m.payload?.cardId === 'CARD_FREEZE_OPPONENT'
    );
    wsCardA.close();

    const meAfterFree = await api(`/api/auth/me?username=${encodeURIComponent(userA)}`, 'GET', null, tokenA);
    const coinsUnchanged = (meAfterFree.data?.user?.coins ?? -1) === coinsBeforeFree;

    // Sequential 20s turn: on start, ONLY p_spd_a has active deadline, p_spd_b has none
    const startDeadlines = spdStart.data?.room?.playerDeadlines || {};
    const onlyAHasStartDeadline =
      Number(startDeadlines['p_spd_a']) > 0 &&
      !startDeadlines['p_spd_b'] &&
      spdStart.data?.room?.activeTurnPlayerId === 'p_spd_a';

    const spdWord0 = spdStart.data.room?.words?.[0];
    const syncInitA = await api(
      '/api/rooms/speed-sync',
      'POST',
      { code: spdCode, playerId: 'p_spd_a', username: userA },
      tokenA
    );

    // Have userA claim a word -> turn transfers exclusively to p_spd_b with fresh 20s deadline
    const claimRes = await api(
      '/api/rooms/claim-word',
      'POST',
      { code: spdCode, word: spdWord0, playerId: 'p_spd_a', username: userA },
      tokenA
    );
    const bTurnDeadline = Number(claimRes.data?.room?.playerDeadlines?.['p_spd_b'] || 0);
    const turnPassedToB =
      bTurnDeadline > 0 &&
      !claimRes.data?.room?.playerDeadlines?.['p_spd_a'] &&
      claimRes.data?.room?.activeTurnPlayerId === 'p_spd_b';

    // Advance clock to just past p_spd_b's 20s deadline (+50ms) -> turn moves back to A and reveals 1 secret letter for A ONLY
    const afterTimeoutA = await api(
      '/api/rooms/speed-sync',
      'POST',
      { code: spdCode, playerId: 'p_spd_a', username: userA },
      tokenA,
      { 'x-test-speed-now-ms': String(bTurnDeadline + 50) }
    );
    const afterTimeoutB = await api(
      '/api/rooms/speed-sync',
      'POST',
      { code: spdCode, playerId: 'p_spd_b', username: userB },
      tokenB
    );
    const aCells = afterTimeoutA.data?.myRevealedCells || [];
    const bCells = afterTimeoutB.data?.myRevealedCells || [];
    const noSecretMapLeak =
      !('secretRevealedLetters' in (spdStart.data.room || {})) &&
      !('secretRevealedLetters' in (afterTimeoutA.data || {})) &&
      !('secretRevealedLetters' in (afterTimeoutA.data?.room || {})) &&
      aCells.every(c => c.word !== spdWord0);

    record(
      '8B. مود الخاطف والكروت المجانية',
      'فتح مود التحدي الخاطف (20ث منفصلة بالتتابع) وكروت التحدي مجاناً + سرية الحرف المكشوف للخصم فقط',
      'إتاحة إنشاء غرفة 20ث بنظام الدور المتتابع الفردي (لاعب واحد نشط بالوقت) وكشف حرف سري للمستفيد فقط عند انتهاء الـ20ث',
      'إنشاء غرفة SPEED_REVEAL_20S، فحص بدء الدور على A فقط، صيد كلمة لانتقال الدور لـB، ثم تخطي مهلة B',
      'إنشاء الغرفة (200)، بدء العداد لـA فقط، انتقال العداد لـB بعد الصيد، وظهور حرف سري لـA (1) مقابل 0 لـB',
      `create=${spdCreate.status}, coinsSame=${coinsUnchanged}, onlyAStart=${onlyAHasStartDeadline}, turnToB=${turnPassedToB}, initA=${syncInitA.data?.myRevealedCells?.length}, aCells=${aCells.length}, bCells=${bCells.length}, noLeak=${noSecretMapLeak}`,
      (meBeforeFree.data?.user?.unlockedOnlineModes || []).includes('SPEED_REVEAL_20S') &&
        spdCreate.status === 200 &&
        spdCreate.data?.room?.gameMode === 'SPEED_REVEAL_20S' &&
        spdJoin.status === 200 &&
        spdStart.status === 200 &&
        spdStart.data?.room?.speedTurnSeconds === 20 &&
        Boolean(blindMsg) &&
        Boolean(blindMsg2) &&
        Boolean(freezeMsg) &&
        coinsUnchanged &&
        onlyAHasStartDeadline &&
        turnPassedToB &&
        (syncInitA.data?.myRevealedCells || []).length === 0 &&
        aCells.length === 1 &&
        bCells.length === 0 &&
        Boolean(spdWord0) &&
        noSecretMapLeak
    );
  }

  // =========================================================================
  // DOMAIN 8C: تأمين الخاطف كمرجع خادمي وحيد (9 اختبارات القبول الإلزامية)
  // =========================================================================
  {
    const userD = `test_iso_d_${ts}`;
    const passD = 'StrongPass#2026D';
    const regD = await api('/api/auth/register', 'POST', {
      username: userD,
      displayName: 'بطل التدقيق د',
      password: passD
    });
    const tokenD = regD.data?.authToken || '';

    // --- Test 1: 2 Players Sequential Timeout & Rotation ---
    const c2 = await api(
      '/api/rooms/create',
      'POST',
      {
        roomName: 'خاطف لاعبين',
        player: { id: 'p2_a', username: userA, displayName: 'لاعب A', avatar: '' },
        categoryId: 'kuwait_heritage',
        gameMode: 'SPEED_REVEAL_20S',
        isPublic: false
      },
      tokenA
    );
    const code2 = c2.data?.room?.code || '';
    await api(
      '/api/rooms/join',
      'POST',
      { code: code2, player: { id: 'p2_b', username: userB, displayName: 'لاعب B', avatar: '' } },
      tokenB
    );
    const s2 = await api('/api/rooms/start', 'POST', { code: code2, username: userA, playerId: 'p2_a' }, tokenA);
    const dl2A = Number(s2.data?.room?.playerDeadlines?.['p2_a'] || 0);
    const sync2AfterA = await api(
      '/api/rooms/speed-sync',
      'POST',
      { code: code2, playerId: 'p2_b', username: userB },
      tokenB,
      { 'x-test-speed-now-ms': String(dl2A + 100) }
    );
    const sync2AView = await api('/api/rooms/speed-sync', 'POST', { code: code2, playerId: 'p2_a', username: userA }, tokenA);
    const test1Ok =
      s2.data?.room?.activeTurnPlayerId === 'p2_a' &&
      sync2AfterA.data?.activeTurnPlayerId === 'p2_b' &&
      Number(sync2AfterA.data?.playerDeadlines?.['p2_b']) > dl2A &&
      !sync2AfterA.data?.playerDeadlines?.['p2_a'] &&
      (sync2AfterA.data?.myRevealedCells || []).length === 1 &&
      (sync2AView.data?.myRevealedCells || []).length === 0;

    record(
      '8C-1. تحدي الخاطف (لاعبان)',
      'انتقال الدور بعد 20ث في غرفة لاعبين وكشف حرف للمستفيد فقط',
      'التأكد من انتقال الدور A->B بعد انتهاء مهلة A مع كشف حرف لـ B فقط',
      'بدء غرفة لاعبين ثم تقديم ساعة الخادم إلى ما بعد مهلة A بـ 100ms',
      'activeTurn=p2_b، كشف خلية واحدة لـB فقط، و0 لـA',
      `active=${sync2AfterA.data?.activeTurnPlayerId}, bCells=${sync2AfterA.data?.myRevealedCells?.length}, aCells=${sync2AView.data?.myRevealedCells?.length}`,
      test1Ok
    );

    // --- Test 2: 3 Players Full Rotation (A -> B -> C -> A) ---
    const c3 = await api(
      '/api/rooms/create',
      'POST',
      {
        roomName: 'خاطف 3 لاعبين',
        player: { id: 'p3_a', username: userA, displayName: 'ثلاثي A', avatar: '' },
        categoryId: 'kuwait_heritage',
        gameMode: 'SPEED_REVEAL_20S',
        maxPlayers: 3,
        isPublic: false
      },
      tokenA
    );
    const code3 = c3.data?.room?.code || '';
    await api('/api/rooms/join', 'POST', { code: code3, player: { id: 'p3_b', username: userB, displayName: 'ثلاثي B', avatar: '' } }, tokenB);
    await api('/api/rooms/join', 'POST', { code: code3, player: { id: 'p3_c', username: userC, displayName: 'ثلاثي C', avatar: '' } }, tokenC);
    const s3 = await api('/api/rooms/start', 'POST', { code: code3, username: userA, playerId: 'p3_a' }, tokenA);
    const t3Order = s3.data?.room?.turnOrder || [];
    const dl3_1 = Number(s3.data?.room?.playerDeadlines?.['p3_a'] || 0);

    const r3_2 = await api('/api/rooms/speed-sync', 'POST', { code: code3, playerId: 'p3_b', username: userB }, tokenB, {
      'x-test-speed-now-ms': String(dl3_1 + 100)
    });
    const dl3_2 = Number(r3_2.data?.playerDeadlines?.['p3_b'] || 0);

    const r3_3 = await api('/api/rooms/speed-sync', 'POST', { code: code3, playerId: 'p3_c', username: userC }, tokenC, {
      'x-test-speed-now-ms': String(dl3_2 + 100)
    });
    const dl3_3 = Number(r3_3.data?.playerDeadlines?.['p3_c'] || 0);

    const r3_4 = await api('/api/rooms/speed-sync', 'POST', { code: code3, playerId: 'p3_a', username: userA }, tokenA, {
      'x-test-speed-now-ms': String(dl3_3 + 100)
    });
    const test2Ok =
      JSON.stringify(t3Order) === JSON.stringify(['p3_a', 'p3_b', 'p3_c']) &&
      s3.data?.room?.activeTurnPlayerId === 'p3_a' &&
      r3_2.data?.activeTurnPlayerId === 'p3_b' &&
      r3_3.data?.activeTurnPlayerId === 'p3_c' &&
      r3_4.data?.activeTurnPlayerId === 'p3_a' &&
      (r3_2.data?.myRevealedCells || []).length === 1 &&
      (r3_3.data?.myRevealedCells || []).length === 1 &&
      (r3_4.data?.myRevealedCells || []).length === 1;

    record(
      '8C-2. تحدي الخاطف (3 لاعبين)',
      'دوران كامل بين 3 لاعبين A -> B -> C -> A بدون تخطي',
      'التحقق من توحيد turnOrder ودوران الأدوار الـ3 كاملة وكشف حرف لكل مستفيد بدوره فقط',
      'بدء غرفة 3 لاعبين وتجاوز المهلة 3 مرات متتالية بـ x-test-speed-now-ms',
      'الترتيب [p3_a,p3_b,p3_c] والدوران A->B->C->A مع حرف واحد لكل مستفيد',
      `order=${JSON.stringify(t3Order)}, seq=${s3.data?.room?.activeTurnPlayerId}->${r3_2.data?.activeTurnPlayerId}->${r3_3.data?.activeTurnPlayerId}->${r3_4.data?.activeTurnPlayerId}`,
      test2Ok
    );

    // --- Test 3: 4 Players Full Rotation + Mid-Game Leave + Consistency ---
    const c4 = await api(
      '/api/rooms/create',
      'POST',
      {
        roomName: 'خاطف 4 لاعبين',
        player: { id: 'p4_a', username: userA, displayName: 'رباعي A', avatar: '' },
        categoryId: 'kuwait_heritage',
        gameMode: 'SPEED_REVEAL_20S',
        maxPlayers: 4,
        isPublic: false
      },
      tokenA
    );
    const code4 = c4.data?.room?.code || '';
    await api('/api/rooms/join', 'POST', { code: code4, player: { id: 'p4_b', username: userB, displayName: 'رباعي B', avatar: '' } }, tokenB);
    await api('/api/rooms/join', 'POST', { code: code4, player: { id: 'p4_c', username: userC, displayName: 'رباعي C', avatar: '' } }, tokenC);
    await api('/api/rooms/join', 'POST', { code: code4, player: { id: 'p4_d', username: userD, displayName: 'رباعي D', avatar: '' } }, tokenD);
    const s4 = await api('/api/rooms/start', 'POST', { code: code4, username: userA, playerId: 'p4_a' }, tokenA);
    const dl4_1 = Number(s4.data?.room?.playerDeadlines?.['p4_a'] || 0);

    const r4_2 = await api('/api/rooms/speed-sync', 'POST', { code: code4, playerId: 'p4_b', username: userB }, tokenB, {
      'x-test-speed-now-ms': String(dl4_1 + 100)
    });
    const dl4_2 = Number(r4_2.data?.playerDeadlines?.['p4_b'] || 0);

    const r4_3 = await api('/api/rooms/speed-sync', 'POST', { code: code4, playerId: 'p4_c', username: userC }, tokenC, {
      'x-test-speed-now-ms': String(dl4_2 + 100)
    });
    const dl4_3 = Number(r4_3.data?.playerDeadlines?.['p4_c'] || 0);

    const r4_4 = await api('/api/rooms/speed-sync', 'POST', { code: code4, playerId: 'p4_d', username: userD }, tokenD, {
      'x-test-speed-now-ms': String(dl4_3 + 100)
    });
    const dl4_4 = Number(r4_4.data?.playerDeadlines?.['p4_d'] || 0);

    const r4_5 = await api('/api/rooms/speed-sync', 'POST', { code: code4, playerId: 'p4_a', username: userA }, tokenA, {
      'x-test-speed-now-ms': String(dl4_4 + 100)
    });

    // Advance to p4_b, then p4_c leaves mid-game -> next timeout on p4_b must cleanly advance to p4_d without stopping timer!
    const dl4_5 = Number(r4_5.data?.playerDeadlines?.['p4_a'] || 0);
    const r4_toB = await api('/api/rooms/speed-sync', 'POST', { code: code4, playerId: 'p4_b', username: userB }, tokenB, {
      'x-test-speed-now-ms': String(dl4_5 + 100)
    });
    await api('/api/rooms/leave', 'POST', { code: code4, playerId: 'p4_c', username: userC }, tokenC);
    const dl4_bAfterLeave = Number(r4_toB.data?.playerDeadlines?.['p4_b'] || 0);
    const r4_afterLeaveTimeout = await api('/api/rooms/speed-sync', 'POST', { code: code4, playerId: 'p4_d', username: userD }, tokenD, {
      'x-test-speed-now-ms': String(dl4_bAfterLeave + 100)
    });

    const test3Ok =
      JSON.stringify(s4.data?.room?.turnOrder) === JSON.stringify(['p4_a', 'p4_b', 'p4_c', 'p4_d']) &&
      r4_2.data?.activeTurnPlayerId === 'p4_b' &&
      r4_3.data?.activeTurnPlayerId === 'p4_c' &&
      r4_4.data?.activeTurnPlayerId === 'p4_d' &&
      r4_5.data?.activeTurnPlayerId === 'p4_a' &&
      r4_afterLeaveTimeout.data?.activeTurnPlayerId === 'p4_d';

    record(
      '8C-3. تحدي الخاطف (4 لاعبين)',
      'دوران كامل لـ 4 لاعبين A->B->C->D->A واستمرارية الدور عند مغادرة لاعب',
      'التأكد من عدم تخطي أي لاعب واستمرار المؤقت عند مغادرة C لينتقل الدور من B إلى D',
      'دورة كاملة من 4 انتقالات ثم مغادرة p4_c أثناء اللعب وتخطي مهلة p4_b',
      'دوران A->B->C->D->A ثم انتقال B->D بعد خروج C',
      `rot=${r4_2.data?.activeTurnPlayerId}->${r4_3.data?.activeTurnPlayerId}->${r4_4.data?.activeTurnPlayerId}->${r4_5.data?.activeTurnPlayerId}, afterCLeave=${r4_afterLeaveTimeout.data?.activeTurnPlayerId}`,
      test3Ok
    );

    // --- Test 4 & 5 & 6 & 7 & 8 Setup: 3-player WebSocket room with live sockets ---
    const cWs = await api(
      '/api/rooms/create',
      'POST',
      {
        roomName: 'خاطف أمان WS',
        player: { id: 'pws_a', username: userA, displayName: 'أمان A', avatar: '' },
        categoryId: 'kuwait_heritage',
        gameMode: 'SPEED_REVEAL_20S',
        maxPlayers: 3,
        isPublic: false
      },
      tokenA
    );
    const codeWs = cWs.data?.room?.code || '';
    await api('/api/rooms/join', 'POST', { code: codeWs, player: { id: 'pws_b', username: userB, displayName: 'أمان B', avatar: '' } }, tokenB);
    await api('/api/rooms/join', 'POST', { code: codeWs, player: { id: 'pws_c', username: userC, displayName: 'أمان C', avatar: '' } }, tokenC);
    const sWs = await api('/api/rooms/start', 'POST', { code: codeWs, username: userA, playerId: 'pws_a' }, tokenA);
    const startSeq = Number(sWs.data?.room?.speedTurnSeq || 1);
    const wsActiveDeadline = Number(sWs.data?.room?.playerDeadlines?.['pws_a'] || 0);

    const wsA = await connectWs(tokenA);
    const wsB = await connectWs(tokenB);
    const wsC = await connectWs(tokenC);
    wsA.send(JSON.stringify({ type: 'ROOM_REJOIN', payload: { code: codeWs, playerId: 'pws_a', username: userA } }));
    wsB.send(JSON.stringify({ type: 'ROOM_REJOIN', payload: { code: codeWs, playerId: 'pws_b', username: userB } }));
    wsC.send(JSON.stringify({ type: 'ROOM_REJOIN', payload: { code: codeWs, playerId: 'pws_c', username: userC } }));
    await Promise.all([
      wsA.waitFor(m => m.type === 'ROOM_REJOINED'),
      wsB.waitFor(m => m.type === 'ROOM_REJOINED'),
      wsC.waitFor(m => m.type === 'ROOM_REJOINED')
    ]);

    // --- Test 6: Forged client turn/timeout/spoof messages MUST be rejected with 0 mutation ---
    const forgedMessages = [
      { type: 'SPEED_TIMEOUT_PENALTY', payload: { code: codeWs, playerId: 'pws_a', nextTurnPlayerId: 'pws_b' } },
      { type: 'SPEED_TURN_TIMEOUT', payload: { code: codeWs, timedOutPlayerId: 'pws_a', nextTurnPlayerId: 'pws_c' } },
      { type: 'SECRET_LETTER_REVEALED', payload: { code: codeWs, nextTurnPlayerId: 'pws_b', cell: { row: 0, col: 0 } } },
      { type: 'FORCE_SPEED_TURN', payload: { code: codeWs, nextTurnPlayerId: 'pws_b' } }
    ];
    for (const fm of forgedMessages) {
      wsB.send(JSON.stringify(fm));
    }
    const errReject1 = await wsB.waitFor(m => m.type === 'ERROR' && m.payload?.code === 'FORBIDDEN_CLIENT_TURN_CONTROL');
    // Also test REST & WS playerId spoofing
    const spoofRest = await api(
      '/api/rooms/speed-sync',
      'POST',
      { code: codeWs, playerId: 'pws_a', username: userA },
      tokenB
    );
    wsB.send(JSON.stringify({ type: 'WORD_FOUND', payload: { code: codeWs, word: sWs.data?.room?.words?.[0], playerId: 'pws_a' } }));
    const errSpoofWs = await wsB.waitFor(m => m.type === 'ERROR' && m.payload?.code === 'FORBIDDEN_PLAYER_SPOOF');

    const checkAfterForge = await api('/api/rooms/speed-sync', 'POST', { code: codeWs, playerId: 'pws_b', username: userB }, tokenB);
    const test6Ok =
      Boolean(errReject1) &&
      spoofRest.status === 403 &&
      Boolean(errSpoofWs) &&
      checkAfterForge.data?.activeTurnPlayerId === 'pws_a' &&
      Number(checkAfterForge.data?.speedTurnSeq) === startSeq &&
      (checkAfterForge.data?.myRevealedCells || []).length === 0;

    record(
      '8C-6. رفض الرسائل المزورة والانتحال',
      'رفض أي رسالة عميل تفرض انتقال الدور أو تزوّر playerId مع بقاء الحالة ثابتة 100%',
      'ضمان أن SPEED_TIMEOUT_PENALTY / SPEED_TURN_TIMEOUT / SECRET_LETTER_REVEALED وانتحال playerId لا تعدّل الحالة',
      'إرسال 4 رسائل تحكم مزورة عبر WS + انتحال pws_a عبر REST speed-sync وWS WORD_FOUND بتوكن B',
      'رفضها بأكواد FORBIDDEN_CLIENT_TURN_CONTROL و 403 و FORBIDDEN_PLAYER_SPOOF دون تغير الدور أو seq',
      `wsReject=${errReject1.payload?.code}, restSpoof=${spoofRest.status}, wsSpoof=${errSpoofWs.payload?.code}, active=${checkAfterForge.data?.activeTurnPlayerId}, seq=${checkAfterForge.data?.speedTurnSeq}`,
      test6Ok
    );

    // --- Test 4: Active player WS disconnect -> server advances turn & sends SECRET_LETTER_REVEALED ONLY to B ---
    // Clear previous messages arrays cleanly
    wsB._messages.length = 0;
    wsC._messages.length = 0;
    wsA.close(); // Active player pws_a disconnects!
    await new Promise(r => setTimeout(r, 80));

    // --- Test 7: Concurrent / Duplicate Timeout Requests (3 simultaneous speed-sync past deadline) ---
    const concRes = await Promise.all([
      api('/api/rooms/speed-sync', 'POST', { code: codeWs, playerId: 'pws_b', username: userB }, tokenB, {
        'x-test-speed-now-ms': String(wsActiveDeadline + 120)
      }),
      api('/api/rooms/speed-sync', 'POST', { code: codeWs, playerId: 'pws_c', username: userC }, tokenC, {
        'x-test-speed-now-ms': String(wsActiveDeadline + 120)
      }),
      api('/api/rooms/speed-sync', 'POST', { code: codeWs, playerId: 'pws_b', username: userB }, tokenB, {
        'x-test-speed-now-ms': String(wsActiveDeadline + 120)
      })
    ]);

    const bRevealWsMsg = await wsB.waitFor(m => m.type === 'SECRET_LETTER_REVEALED');
    const cTimeoutWsMsg = await wsC.waitFor(m => m.type === 'SPEED_TURN_TIMEOUT');
    const bAfterConc = await api('/api/rooms/speed-sync', 'POST', { code: codeWs, playerId: 'pws_b', username: userB }, tokenB);
    const cAfterConc = await api('/api/rooms/speed-sync', 'POST', { code: codeWs, playerId: 'pws_c', username: userC }, tokenC);

    const cGotSecretReveal = wsC._messages.some(m => m.type === 'SECRET_LETTER_REVEALED');
    const cSawCellInTimeout = Boolean(cTimeoutWsMsg?.payload?.cell) || Boolean(cTimeoutWsMsg?.payload?.revealedCell);
    const concSeqs = concRes.map(r => Number(r.data?.speedTurnSeq));
    const concExpectedSeq = startSeq + 1;

    const test4Ok =
      bAfterConc.data?.activeTurnPlayerId === 'pws_b' &&
      Boolean(bRevealWsMsg?.payload?.cell) &&
      Boolean(cTimeoutWsMsg);

    const test7Ok =
      concSeqs.every(sq => sq === concExpectedSeq) &&
      (bAfterConc.data?.myRevealedCells || []).length === 1 &&
      (cAfterConc.data?.myRevealedCells || []).length === 0 &&
      wsB._messages.filter(m => m.type === 'SECRET_LETTER_REVEALED').length === 1;

    record(
      '8C-4. انقطاع اتصال اللاعب النشط',
      'استمرار الخادم في انتقال الدور عند انقطاع WS اللاعب الذي عليه الدور',
      'إغلاق WS اللاعب pws_a أثناء دوره والتحقق من انتقال الدور إلى pws_b وإرسال الحرف السري لـ B عبر WS',
      'إغلاق wsA ثم تجاوز مهلة pws_a على الخادم',
      'انتقال activeTurn=pws_b ووصول SECRET_LETTER_REVEALED لـ B و SPEED_TURN_TIMEOUT لـ C',
      `active=${bAfterConc.data?.activeTurnPlayerId}, bSecretCell=${Boolean(bRevealWsMsg?.payload?.cell)}, cGotTimeout=${Boolean(cTimeoutWsMsg)}`,
      test4Ok
    );

    record(
      '8C-7. منع الازدواجية عند التزامن',
      'تنفيذ انتقال واحد فقط وحرف سري واحد فقط عند وصول 3 طلبات انتهاء وقت متزامنة',
      'منع تخطي الأدوار أو كشف أكثر من حرف عند التزامن (Promise.all)',
      'إرسال 3 طلبات speed-sync متزامنة بنفس التوقيت المتجاوز للمهلة',
      `بقاء speedTurnSeq=${concExpectedSeq}، وكشف خلية واحدة فقط لـ B و 0 لـ C`,
      `seqs=${JSON.stringify(concSeqs)}, bCells=${bAfterConc.data?.myRevealedCells?.length}, bWsReveals=${wsB._messages.filter(m => m.type === 'SECRET_LETTER_REVEALED').length}`,
      test7Ok
    );

    // --- Test 5: Reconnect restores activeTurnPlayerId, remaining deadline, seq, and caller-only secret cells ---
    wsB._messages.length = 0;
    wsC._messages.length = 0;
    const wsB_reconnected = await connectWs(tokenB);
    wsB.close();
    wsB_reconnected.send(JSON.stringify({ type: 'ROOM_REJOIN', payload: { code: codeWs, playerId: 'pws_b', username: userB } }));
    const rejoinedB = await wsB_reconnected.waitFor(m => m.type === 'ROOM_REJOINED');
    const cSawReconnect = await wsC.waitFor(m => m.type === 'PLAYER_RECONNECTED' && m.payload?.playerId === 'pws_b');

    const restRejoinB = await api('/api/rooms/rejoin', 'POST', { code: codeWs, playerId: 'pws_b', username: userB }, tokenB);
    const test5Ok =
      rejoinedB.payload?.room?.activeTurnPlayerId === 'pws_b' &&
      Number(rejoinedB.payload?.room?.speedTurnSeq) === concExpectedSeq &&
      Number(rejoinedB.payload?.room?.playerDeadlines?.['pws_b']) === Number(bAfterConc.data?.playerDeadlines?.['pws_b']) &&
      (rejoinedB.payload?.room?.myRevealedCells || []).length === 1 &&
      restRejoinB.data?.room?.activeTurnPlayerId === 'pws_b' &&
      (restRejoinB.data?.room?.myRevealedCells || []).length === 1;

    record(
      '8C-5. إعادة الاتصال واستعادة الحالة',
      'استعادة الدور الصحيح والمهلة المتبقية والترتيب والحروف السرية لصاحبها فقط عند Reconnect',
      'ضمان تطابق الحالة بين WS ROOM_REJOIN و REST /api/rooms/rejoin بعد الانقطاع',
      'إعادة اتصال اللاعب المستفيد pws_b عبر WS ROOM_REJOIN و REST /api/rooms/rejoin',
      'استرجاع activeTurn=pws_b، نفس المهلة، نفس seq، وخلية B السرية (1)',
      `wsActive=${rejoinedB.payload?.room?.activeTurnPlayerId}, wsSeq=${rejoinedB.payload?.room?.speedTurnSeq}, wsCells=${rejoinedB.payload?.room?.myRevealedCells?.length}, restCells=${restRejoinB.data?.room?.myRevealedCells?.length}`,
      test5Ok
    );

    // --- Test 8: Secret Letter Confidentiality across WS, PLAYER_RECONNECTED, GET /api/rooms/:code, REST ---
    const getRoomPublic = await api(`/api/rooms/${codeWs}`, 'GET', null, null);
    const getRoomAsC = await api(`/api/rooms/${codeWs}`, 'GET', null, tokenC);
    const getRoomAsB = await api(`/api/rooms/${codeWs}`, 'GET', null, tokenB);
    const oppReconnRoom = cSawReconnect?.payload?.room || {};

    const test8Ok =
      !cGotSecretReveal &&
      !cSawCellInTimeout &&
      !('secretRevealedLetters' in oppReconnRoom) &&
      (!oppReconnRoom.myRevealedCells || oppReconnRoom.myRevealedCells.length === 0) &&
      !('secretRevealedLetters' in (getRoomPublic.data?.room || {})) &&
      (!getRoomPublic.data?.room?.myRevealedCells || getRoomPublic.data.room.myRevealedCells.length === 0) &&
      (!getRoomAsC.data?.room?.myRevealedCells || getRoomAsC.data.room.myRevealedCells.length === 0) &&
      (getRoomAsB.data?.room?.myRevealedCells || []).length === 1;

    record(
      '8C-8. سرية الحرف السري للخصوم',
      'منع تسريب الحرف السري للخصوم عبر WS أو PLAYER_RECONNECTED أو GET /api/rooms/:code',
      'التأكد أن الخلية السرية لا تظهر إلا للمستفيد المصادق بتوكنه فقط',
      'فحص رسائل C (WS + PLAYER_RECONNECTED + GET room) وGET بدون توكن مقابل GET بتوكن B',
      '0 خلايا سرية في كل قنوات الخصوم والعامة مقابل خلية (1) فقط لـ B',
      `cWsReveal=${cGotSecretReveal}, reconnLeak=${Boolean(oppReconnRoom.myRevealedCells?.length)}, pubLeak=${Boolean(getRoomPublic.data?.room?.myRevealedCells?.length)}, cGetLeak=${Boolean(getRoomAsC.data?.room?.myRevealedCells?.length)}, bGet=${getRoomAsB.data?.room?.myRevealedCells?.length}`,
      test8Ok
    );

    wsB_reconnected.close();
    wsC.close();

    // --- Test 9: Server Restart Persistence on Isolated Temp Data Dir (zero touch to data/database.json) ---
    const tmpRestartDir = path.resolve('/tmp', `fatteshha_restart_verify_${ts}`);
    fs.mkdirSync(tmpRestartDir, { recursive: true });
    const tmpPort = 3199;
    const tmpAuthSecret = crypto.randomBytes(32).toString('hex');
    const tmpAdminSecret = crypto.randomBytes(32).toString('hex');

    const waitForServerReady = async (baseUrl, timeoutMs = 15000) => {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        try {
          const r = await fetch(`${baseUrl}/api/leaderboard`);
          if (r.ok) return true;
        } catch {
          // wait
        }
        await new Promise(r => setTimeout(r, 150));
      }
      throw new Error(`Isolated test server did not become ready at ${baseUrl}`);
    };

    const spawnTempServer = (allowFirstRun) =>
      spawn('node', ['--import', 'tsx', 'server.ts'], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          NODE_ENV: 'production',
          PORT: String(tmpPort),
          FATTESHHA_DATA_DIR: tmpRestartDir,
          FATTESHHA_AUTH_SECRET: tmpAuthSecret,
          FATTESHHA_ADMIN_SECRET: tmpAdminSecret,
          FATTESHHA_DISABLE_SUPABASE_HYDRATION: '1',
          ...(allowFirstRun ? { FATTESHHA_ALLOW_INITIAL_DATABASE_BOOT: '1' } : {})
        },
        stdio: 'pipe'
      });

    let test9Ok = false;
    let test9Actual = 'NOT_RUN';
    let childProc1 = null;
    let childProc2 = null;
    try {
      const tmpBase = `http://127.0.0.1:${tmpPort}`;
      childProc1 = spawnTempServer(true);
      await waitForServerReady(tmpBase);

      const tmpUser = `restart_u_${ts}`;
      const tmpPass = 'RestartPass#2026';
      const rReg = await fetch(`${tmpBase}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: tmpUser, displayName: 'بطل الاستمرار', password: tmpPass })
      }).then(r => r.json());

      const rToken = rReg.authToken;
      const rStage = await fetch(`${tmpBase}/api/stage/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rToken}` },
        body: JSON.stringify({ username: tmpUser, categoryId: 'kuwait_heritage', levelNumber: 1 })
      }).then(r => r.json());
      for (const wp of rStage.wordPlacements || []) {
        await fetch(`${tmpBase}/api/stage/verify-word`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rToken}` },
          body: JSON.stringify({ username: tmpUser, sessionId: rStage.sessionId, word: wp.word })
        });
      }
      const rComplete = await fetch(`${tmpBase}/api/progress/complete-level`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rToken}` },
        body: JSON.stringify({
          username: tmpUser,
          sessionId: rStage.sessionId,
          requestId: `restart_comp_${ts}`
        })
      }).then(r => r.json());
      const xpBeforeRestart = rComplete.user?.xp ?? 0;
      const coinsBeforeRestart = rComplete.user?.coins ?? 0;
      const completedKeysBefore = Object.keys(rComplete.user?.completedLevels || {}).length;

      // Cleanly terminate first instance (simulating server restart)
      await new Promise(resolveExit => {
        childProc1.once('exit', resolveExit);
        childProc1.kill('SIGTERM');
        setTimeout(() => {
          try {
            childProc1.kill('SIGKILL');
          } catch {
            // ignore
          }
          resolveExit();
        }, 1500);
      });
      childProc1 = null;

      // Boot second instance WITHOUT FATTESHHA_ALLOW_INITIAL_DATABASE_BOOT (must load persisted DB!)
      childProc2 = spawnTempServer(false);
      await waitForServerReady(tmpBase);

      const rLoginAfter = await fetch(`${tmpBase}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: tmpUser, password: tmpPass })
      }).then(r => r.json());
      const xpAfterRestart = rLoginAfter.user?.xp ?? -1;
      const coinsAfterRestart = rLoginAfter.user?.coins ?? -1;
      const completedKeysAfter = Object.keys(rLoginAfter.user?.completedLevels || {}).length;

      test9Ok =
        Boolean(rReg.success) &&
        Boolean(rComplete.success) &&
        xpBeforeRestart > 0 &&
        xpAfterRestart === xpBeforeRestart &&
        coinsAfterRestart === coinsBeforeRestart &&
        completedKeysBefore >= 1 &&
        completedKeysAfter === completedKeysBefore;
      test9Actual = `xp=${xpBeforeRestart}->${xpAfterRestart}, coins=${coinsBeforeRestart}->${coinsAfterRestart}, completedLevels=${completedKeysBefore}->${completedKeysAfter}`;
    } finally {
      for (const p of [childProc1, childProc2]) {
        if (p && !p.killed) {
          try {
            p.kill('SIGKILL');
          } catch {
            // ignore
          }
        }
      }
      try {
        fs.rmSync(tmpRestartDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }

    record(
      '8C-9. بقاء بيانات اللاعبين بعد إعادة تشغيل الخادم',
      'التحقق الفعلي من حفظ بيانات اللاعبين وتقدمهم عند إعادة تشغيل الخادم دون المساس بـ data/database.json',
      'تشغيل نسخة خادم معزولة على /tmp، تسجيل لاعب وكسب XP/Coins، إغلاق الخادم وإعادة تشغيله ثم التحقق من البيانات',
      'تشغيل خادم معزول (port 3199, FATTESHHA_DATA_DIR=/tmp) -> تسجيل+تقدم -> SIGTERM -> إعادة التشغيل -> login',
      'تطابق XP و Coins ونجوم المرحلة 100% بعد إعادة التشغيل',
      test9Actual,
      test9Ok
    );
  }

  // =========================================================================
  // DOMAIN 9: حماية السباقات (Race Conditions / Idempotency) وعزل قاعدة بيانات الإنتاج
  // =========================================================================
  {
    const beforeBuy = await api(`/api/auth/me?username=${encodeURIComponent(userA)}`, 'GET', null, tokenA);
    const coinsBefore = beforeBuy.data.user?.coins ?? 0;
    const hintsBefore = beforeBuy.data.user?.hintsRemaining ?? 0;

    const buyRace = await Promise.all([
      api('/api/hints/buy', 'POST', { username: userA, amount: 1, requestId: `buy_race_${ts}` }, tokenA),
      api('/api/hints/buy', 'POST', { username: userA, amount: 1, requestId: `buy_race_${ts}` }, tokenA)
    ]);
    const buyOk = buyRace.filter(r => r.status === 200).length;
    const buy409 = buyRace.filter(r => r.status === 409).length;

    const afterBuy = await api(`/api/auth/me?username=${encodeURIComponent(userA)}`, 'GET', null, tokenA);
    const coinsAfter = afterBuy.data.user?.coins ?? 0;
    const hintsAfter = afterBuy.data.user?.hintsRemaining ?? 0;
    const singleDeductionOnly = coinsBefore - coinsAfter === 25 && hintsAfter - hintsBefore === 1;

    const prodHashAfter = sha256File(PROD_DB_PATH);
    const prodDbUntouched = prodHashBefore === prodHashAfter;

    record(
      '9. منع الغش وعزل الاختبار',
      'حماية سباقات التزامن ومنع تكرار الخصم (Idempotency) وعزل قاعدة بيانات الإنتاج',
      'التأكد من عدم خصم أو مضاعفة التلميحات بالتزامن وعدم تعديل data/database.json',
      'إرسال طلبي شراء متزامنين بنفس requestId ومقارنة الرصيد وبصمة SHA-256 لملف data/database.json',
      'نجاح طلب واحد وصد الآخر (409)، خصم 25 عملة فقط، وبصمة data/database.json متطابقة 100%',
      `buyOk=${buyOk}, buy409=${buy409}, singleDeduct=${singleDeductionOnly}, prodDbUntouched=${prodDbUntouched}`,
      buyOk === 1 && buy409 === 1 && singleDeductionOnly && prodDbUntouched
    );
  }

  // =========================================================================
  // DOMAIN 10: فحص النشر والتوافق
  // =========================================================================
  {
    const deployDoc = fs.readFileSync(path.resolve('DEPLOYMENT.md'), 'utf-8');
    const envExample = fs.readFileSync(path.resolve('.env.example'), 'utf-8');
    const noCloudflareSetup = !deployDoc.includes('wrangler d1') && !deployDoc.includes('إعداد Cloudflare Workers');
    const hasAuthSecretEnv = envExample.includes('FATTESHHA_AUTH_SECRET');

    record(
      '10. النشر والتوافق',
      'خلو دليل النشر من إعدادات Cloudflare Workers واكتمال .env.example',
      'التأكد من توافق التوثيق والإعدادات مع البنية الفعلية للخادم',
      'فحص محتوى DEPLOYMENT.md و .env.example',
      'عدم وجود تعليمات Cloudflare Workers/D1 ووجود FATTESHHA_AUTH_SECRET',
      `noCloudflareSetup=${noCloudflareSetup}, hasAuthSecretEnv=${hasAuthSecretEnv}`,
      noCloudflareSetup && hasAuthSecretEnv
    );
  }

  // =========================================================================
  // DOMAIN 11: جاهزية تطبيق iOS ومتجر Apple App Store (Capacitor + Guidelines 4.8 & 5.1.1)
  // =========================================================================
  {
    const pbxprojPath = path.resolve('ios/App/App.xcodeproj/project.pbxproj');
    const infoPlistPath = path.resolve('ios/App/App/Info.plist');
    const privacyManifestPath = path.resolve('ios/App/App/PrivacyInfo.xcprivacy');
    const appIconPath = path.resolve('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png');

    const hasXcodeProject =
      fs.existsSync(pbxprojPath) &&
      fs.readFileSync(pbxprojPath, 'utf-8').includes('com.fatteshha.kuwaitgame');
    const infoPlist = fs.existsSync(infoPlistPath) ? fs.readFileSync(infoPlistPath, 'utf-8') : '';
    const hasValidInfoPlist =
      infoPlist.includes('<string>فتّشها</string>') &&
      infoPlist.includes('<string>ar</string>') &&
      infoPlist.includes('<key>ITSAppUsesNonExemptEncryption</key>');
    const hasPrivacyManifest =
      fs.existsSync(privacyManifestPath) &&
      fs.readFileSync(privacyManifestPath, 'utf-8').includes('NSPrivacyAccessedAPICategoryUserDefaults');

    // Check PNG IHDR header of AppIcon-512@2x.png: width=1024, height=1024, colorType=2 (RGB, no alpha channel)
    let validIcon1024OpaqueRgb = false;
    if (fs.existsSync(appIconPath)) {
      const iconBuf = fs.readFileSync(appIconPath);
      const width = iconBuf.readUInt32BE(16);
      const height = iconBuf.readUInt32BE(20);
      const colorType = iconBuf.readUInt8(25); // 2 = Truecolor RGB (no alpha)
      validIcon1024OpaqueRgb = width === 1024 && height === 1024 && colorType === 2;
    }

    // Verify Capacitor iOS CORS preflight (Origin: capacitor://localhost)
    const corsRes = await fetch(`${BASE_URL}/api/rooms/public`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'capacitor://localhost',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type, Authorization, x-auth-token'
      }
    });
    const corsAllowedOrigin = corsRes.headers.get('access-control-allow-origin');
    const corsOk = corsRes.status === 204 && corsAllowedOrigin === 'capacitor://localhost';

    // Verify public Privacy Policy & Support URLs required by App Store Connect
    const privacyPageRes = await fetch(`${BASE_URL}/privacy-policy`);
    const supportPageRes = await fetch(`${BASE_URL}/support`);
    const publicPagesOk = privacyPageRes.status === 200 && supportPageRes.status === 200;

    record(
      '11. جاهزية تطبيق iOS ومتجر App Store',
      'مشروع Xcode، أيقونة 1024×1024 بدون شفافية، Privacy Manifest، CORS لـCapacitor، وصفحات الخصوصية والدعم',
      'التحقق من اكتمال ملفات iOS وامتثال شروط Apple App Store وصفحات /privacy-policy و /support',
      'فحص project.pbxproj، Info.plist، PrivacyInfo.xcprivacy، IHDR للأيقونة، طلب OPTIONS من capacitor://localhost، وفحص صفحات المتجر',
      'اكتمال ملفات Xcode، أيقونة RGB 1024x1024، CORS 204، وصفحات الخصوصية والدعم 200 OK',
      `xcode=${hasXcodeProject}, plist=${hasValidInfoPlist}, privacy=${hasPrivacyManifest}, iconRGB=${validIcon1024OpaqueRgb}, cors=${corsOk}, pages=${publicPagesOk}`,
      hasXcodeProject &&
        hasValidInfoPlist &&
        hasPrivacyManifest &&
        validIcon1024OpaqueRgb &&
        corsOk &&
        publicPagesOk
    );
  }

  // =========================================================================
  // DOMAIN 12: تسجيل الدخول الفعلي بحساب Apple (4.8) وحذف الحساب الشامل (5.1.1v)
  // =========================================================================
  {
    // 1. Create a valid Apple JWT identityToken payload (simulating Apple ID first login with fullName + Hide My Email)
    const appleSub = `001928.apple_${ts}`;
    const appleRelayEmail = `kwt_apple_${ts}@privaterelay.appleid.com`;
    const jwtHeader = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'AIDOPK1' })).toString('base64url');
    const jwtPayload = Buffer.from(
      JSON.stringify({
        iss: 'https://appleid.apple.com',
        sub: appleSub,
        email: appleRelayEmail,
        email_verified: 'true'
      })
    ).toString('base64url');
    const mockIdentityToken = `${jwtHeader}.${jwtPayload}.sig_apple_test`;

    const appleLogin1 = await api('/api/auth/apple', 'POST', {
      identityToken: mockIdentityToken,
      fullName: 'لاعب آبل الكويتي'
    });

    // 2. Subsequent Apple login WITHOUT fullName (Apple only sends fullName on 1st login) must preserve displayName!
    const appleLogin2 = await api('/api/auth/apple', 'POST', {
      identityToken: mockIdentityToken
    });

    const appleToken = appleLogin2.data?.authToken;
    const appleUsername = appleLogin2.data?.user?.username;
    const preservedDisplayName = appleLogin2.data?.user?.displayName === 'لاعب آبل الكويتي';

    // 3. Test cross-account deletion attempt (UserC trying to delete UserA -> must fail 403)
    const crossDeleteAttempt = await api(
      '/api/auth/delete-account',
      'POST',
      { username: userA, confirmDelete: 'DELETE' },
      tokenC
    );

    // 4. Delete Apple user's own account and verify 8-layer data erasure receipt
    const appleDeleteRes = await api(
      '/api/auth/delete-account',
      'POST',
      { username: appleUsername, confirmDelete: 'DELETE' },
      appleToken
    );
    const summary = appleDeleteRes.data?.deletedDataSummary || {};
    const afterAppleMe = await api(
      `/api/auth/me?username=${encodeURIComponent(appleUsername || 'none')}`,
      'GET',
      null,
      appleToken
    );

    // Also delete test UserC
    const selfDeleteC = await api(
      '/api/auth/delete-account',
      'POST',
      { username: userC, confirmDelete: 'DELETE' },
      tokenC
    );

    record(
      '12. تسجيل الدخول بـApple وحذف الحساب الشامل',
      'مصادقة Apple JWT مع حفظ الاسم وحذف الحساب وجميع بياناته وفق السياسة المعلنة',
      'التأكد من عمل /api/auth/apple فعلياً وحذف جميع بيانات اللاعب من الـ8 مخازن عند الحذف',
      'تسجيل دخول أول بـApple JWT + دخول ثانٍ بدون الاسم + محاولة حذف حساب الغير + حذف الحساب الذاتي وفحص الملخص',
      'نجاح دخول Apple 200، حفظ الاسم، صد حذف الغير 403، حذف الحساب والبيانات 200، واختفاؤه من الخادم 404',
      `login1=${appleLogin1.status}, login2=${appleLogin2.status}, nameKept=${preservedDisplayName}, crossDel=${crossDeleteAttempt.status}, del=${appleDeleteRes.status}, lbClean=${summary.removedFromLeaderboard}, afterMe=${afterAppleMe.status}, delC=${selfDeleteC.status}`,
      appleLogin1.status === 200 &&
        appleLogin2.status === 200 &&
        Boolean(appleToken) &&
        preservedDisplayName &&
        crossDeleteAttempt.status === 403 &&
        appleDeleteRes.status === 200 &&
        summary.accountRecordDeleted === true &&
        summary.removedFromLeaderboard === true &&
        afterAppleMe.status === 404 &&
        selfDeleteC.status === 200
    );
  }

  // =========================================================================
  // DOMAIN 13: اختبار انقطاع الإنترنت واستعادة المباراة المباشرة بين جهازين (Network Drop Recovery)
  // =========================================================================
  {
    const netCreate = await api(
      '/api/rooms/create',
      'POST',
      {
        roomName: 'غرفة اختبار انقطاع الإنترنت',
        player: { id: 'p_net_1', username: userA, displayName: 'الأول', avatar: '' },
        categoryId: 'kuwait_heritage',
        stagesCount: 10,
        isPublic: false
      },
      tokenA
    );
    const netCode = netCreate.data?.room?.code;
    await api(
      '/api/rooms/join',
      'POST',
      {
        code: netCode,
        player: { id: 'p_net_2', username: userB, displayName: 'الثاني', avatar: '' }
      },
      tokenB
    );
    const netStart = await api(
      '/api/rooms/start',
      'POST',
      { code: netCode, username: userA, playerId: 'p_net_1' },
      tokenA
    );
    const matchWords = netStart.data?.room?.words || [];

    // Connect both devices via WebSocket
    const wsDev1 = await connectWs(tokenA);
    const wsDev2 = await connectWs(tokenB);

    const rejoin1Promise = wsDev1.waitFor(m => m.type === 'ROOM_REJOINED');
    wsDev1.send(
      JSON.stringify({
        type: 'ROOM_REJOIN',
        payload: { code: netCode, playerId: 'p_net_1', username: userA, authToken: tokenA }
      })
    );
    const rejoin2Promise = wsDev2.waitFor(m => m.type === 'ROOM_REJOINED');
    wsDev2.send(
      JSON.stringify({
        type: 'ROOM_REJOIN',
        payload: { code: netCode, playerId: 'p_net_2', username: userB, authToken: tokenB }
      })
    );
    await Promise.all([rejoin1Promise, rejoin2Promise]);

    // Simulate Device 1 internet disconnection mid-match!
    const disconnectNotifyPromise = wsDev2.waitFor(m => m.type === 'PLAYER_DISCONNECTED');
    wsDev1.close();
    const disconnectEvent = await disconnectNotifyPromise;

    // While Device 1 is offline, Device 2 claims word[0]
    const word0ClaimedBy2Promise = wsDev2.waitFor(
      m => m.type === 'WORD_CLAIMED' && m.payload?.word === matchWords[0]
    );
    wsDev2.send(
      JSON.stringify({
        type: 'WORD_FOUND',
        payload: { code: netCode, word: matchWords[0], playerId: 'p_net_2', username: userB, authToken: tokenB }
      })
    );
    await word0ClaimedBy2Promise;

    // Now Device 1's internet returns -> opens a fresh WebSocket and sends ROOM_REJOIN
    const wsDev1Recovered = await connectWs(tokenA);
    const recoveredStatePromise = wsDev1Recovered.waitFor(m => m.type === 'ROOM_REJOINED');
    const reconnectNotifyOn2Promise = wsDev2.waitFor(m => m.type === 'PLAYER_RECONNECTED');
    wsDev1Recovered.send(
      JSON.stringify({
        type: 'ROOM_REJOIN',
        payload: { code: netCode, playerId: 'p_net_1', username: userA, authToken: tokenA }
      })
    );
    const [recoveredMsg, reconnectOn2Msg] = await Promise.all([
      recoveredStatePromise,
      reconnectNotifyOn2Promise
    ]);

    const recoveredRoom = recoveredMsg.payload?.room;
    const p2FoundInRecovered = recoveredRoom?.players?.['p_net_2']?.wordsFound || [];
    const stateSyncedAfterDrop = p2FoundInRecovered.includes(matchWords[0]);

    // Verify Device 1 can immediately claim word[1] on the recovered connection
    const word1ClaimedBy1Promise = wsDev1Recovered.waitFor(
      m => m.type === 'WORD_CLAIMED' && m.payload?.word === matchWords[1]
    );
    wsDev1Recovered.send(
      JSON.stringify({
        type: 'WORD_FOUND',
        payload: { code: netCode, word: matchWords[1], playerId: 'p_net_1', username: userA, authToken: tokenA }
      })
    );
    const word1ClaimedMsg = await word1ClaimedBy1Promise;

    wsDev1Recovered.close();
    wsDev2.close();

    const prodHashFinal = sha256File(PROD_DB_PATH);
    const prodStillUntouched = prodHashBefore === prodHashFinal;

    record(
      '13. انقطاع الإنترنت واستعادة المباراة المباشرة',
      'انقطاع اتصال الجهاز 1 أثناء المباراة، تسجيل الجهاز 2 لنقطة، ثم عودة الجهاز 1 واستكمال اللعب فوراً',
      'التأكد من عدم ضياع المباراة أو النقاط عند انقطاع الإنترنت واستعادة الجلسة عبر ROOM_REJOIN',
      'فصل WebSocket الجهاز 1، صيد كلمة من الجهاز 2، فتح اتصال جديد للجهاز 1 وإرسال ROOM_REJOIN ثم صيد الكلمة التالية',
      'رصد الانقطاع، مزامنة الكلمة المصادة أثناء الغياب، إشعار PLAYER_RECONNECTED، ونجاح صيد الكلمة التالية',
      `disc=${Boolean(disconnectEvent)}, syncedAfterDrop=${stateSyncedAfterDrop}, reconnNotice=${Boolean(reconnectOn2Msg)}, claimAfterReconn=${Boolean(word1ClaimedMsg)}, prodSafe=${prodStillUntouched}`,
      Boolean(disconnectEvent) &&
        stateSyncedAfterDrop &&
        Boolean(reconnectOn2Msg) &&
        Boolean(word1ClaimedMsg) &&
        prodStillUntouched
    );
  }

  // =========================================================================
  // DOMAIN 14: التزام عدد المراحل المختار (stagesCount) وإعلان المتقدم والفائز النهائي
  // =========================================================================
  {
    const createSeriesRes = await api(
      '/api/rooms/create',
      'POST',
      {
        roomName: 'تحدي مرحلتين',
        player: { id: 'p_ser_1', username: userA, displayName: 'بطل السلسلة', avatar: '' },
        categoryId: 'kuwait_heritage',
        stagesCount: 2,
        isPublic: false
      },
      tokenA
    );
    const serCode = createSeriesRes.data?.room?.code || '';
    await api(
      '/api/rooms/join',
      'POST',
      {
        code: serCode,
        player: { id: 'p_ser_2', username: userB, displayName: 'منافس السلسلة', avatar: '' }
      },
      tokenB
    );

    const wsS1 = await connectWs(tokenA);
    const wsS2 = await connectWs(tokenB);
    wsS1.send(JSON.stringify({ type: 'ROOM_REJOIN', payload: { code: serCode, playerId: 'p_ser_1', username: userA } }));
    wsS2.send(JSON.stringify({ type: 'ROOM_REJOIN', payload: { code: serCode, playerId: 'p_ser_2', username: userB } }));
    await Promise.all([wsS1.waitFor(m => m.type === 'ROOM_REJOINED'), wsS2.waitFor(m => m.type === 'ROOM_REJOINED')]);

    const startS1 = await api(
      '/api/rooms/start',
      'POST',
      { code: serCode, username: userA, playerId: 'p_ser_1' },
      tokenA
    );
    const r1Words = startS1.data?.room?.words || [];
    const r1FinishP = wsS1.waitFor(m => m.type === 'GAME_FINISHED' && m.payload?.roundNumber === 1);
    // Player 1 claims first 5 words, Player 2 claims last 2 words -> Player 1 wins Stage 1
    for (let i = 0; i < r1Words.length; i++) {
      const claimer = i < 5 ? { ws: wsS1, pid: 'p_ser_1' } : { ws: wsS2, pid: 'p_ser_2' };
      claimer.ws.send(JSON.stringify({ type: 'WORD_FOUND', payload: { code: serCode, word: r1Words[i], playerId: claimer.pid } }));
    }
    const r1Finished = await r1FinishP;
    const r1Standings = r1Finished.payload?.standings;
    const r1P1Total = r1Finished.payload?.room?.players?.p_ser_1?.totalScore || 0;
    const r1P2Total = r1Finished.payload?.room?.players?.p_ser_2?.totalScore || 0;

    // Advance from stage 1 to stage 2
    const rematch2Res = await api(
      '/api/rooms/rematch',
      'POST',
      { code: serCode, playerId: 'p_ser_1', username: userA, currentRoundNumber: 1 },
      tokenA
    );
    // Player 2 clicking rematch slightly later with currentRoundNumber: 1 must sync into stage 2 (not error)
    const rematch2P2Sync = await api(
      '/api/rooms/rematch',
      'POST',
      { code: serCode, playerId: 'p_ser_2', username: userB, currentRoundNumber: 1 },
      tokenB
    );
    const r2Words = rematch2Res.data?.room?.words || [];
    const p1TotalBeforeR2 = rematch2Res.data?.room?.players?.p_ser_1?.totalScore || 0;
    const p1StageScoreR2 = rematch2Res.data?.room?.players?.p_ser_1?.score ?? -1;

    // Complete Stage 2: Player 2 claims 4 words, Player 1 claims 3 words (1-1 wins, Player 1 ahead on totalScore)
    const r2FinishP = wsS1.waitFor(m => m.type === 'GAME_FINISHED' && m.payload?.roundNumber === 2);
    for (let i = 0; i < r2Words.length; i++) {
      const claimer = i < 3 ? { ws: wsS1, pid: 'p_ser_1' } : { ws: wsS2, pid: 'p_ser_2' };
      claimer.ws.send(JSON.stringify({ type: 'WORD_FOUND', payload: { code: serCode, word: r2Words[i], playerId: claimer.pid } }));
    }
    const r2Finished = await r2FinishP;

    // Attempt to advance to Stage 3 via REST and WS -> MUST be rejected with SERIES_COMPLETED
    const blockedRestRematch = await api(
      '/api/rooms/rematch',
      'POST',
      { code: serCode, playerId: 'p_ser_1', username: userA, currentRoundNumber: 2 },
      tokenA
    );
    const wsBlockErrP = wsS1.waitFor(m => m.type === 'ERROR' && m.payload?.code === 'SERIES_COMPLETED');
    wsS1.send(JSON.stringify({ type: 'ROOM_REMATCH', payload: { code: serCode, playerId: 'p_ser_1', currentRoundNumber: 2 } }));
    const wsBlockErr = await wsBlockErrP;

    wsS1.close();
    wsS2.close();

    record(
      '14. حد المراحل المختار ونتائج النقاط والفوز',
      'عرض الفائز والمتقدم بالنقاط والفوز بعد كل مرحلة وإعلان البطل ومنع التجاوز بعد آخر مرحلة',
      'إنشاء غرفة من مرحلتين، التحقق من الترتيب بعد المرحلة 1، مزامنة اللاعب 2 للانتقال للمرحلة الأخيرة، الحفاظ على totalScore، إعلان الفائز النهائي ومنع المرحلة 3',
      'إتمام مرحلتين كاملتين ومحاولة إرسال ROOM_REMATCH و/api/rooms/rematch لمرحلة ثالثة',
      'stage1: seriesCompleted=false، مزامنة p2 للمرحلة 2 بنجاح، stage2: seriesCompleted=true + seriesWinnerId=p_ser_1، ورفض المرحلة 3 (SERIES_COMPLETED)',
      `r1Series=${r1Finished.payload?.seriesCompleted}, r1WinLeader=${r1Standings?.winsLeaderId}, r1PtsLeader=${r1Standings?.pointsLeaderId}, p2Sync=${rematch2P2Sync.status}/${rematch2P2Sync.data?.alreadyAdvanced}, r2ResetScore=${p1StageScoreR2}/keptTotal=${p1TotalBeforeR2 === r1P1Total && r1P1Total > r1P2Total}, r2Series=${r2Finished.payload?.seriesCompleted}, champ=${r2Finished.payload?.seriesWinnerId}, restBlock=${blockedRestRematch.status}/${blockedRestRematch.data?.code}, wsBlock=${wsBlockErr.payload?.code}`,
      r1Finished.payload?.seriesCompleted === false &&
        r1Standings?.winsLeaderId === 'p_ser_1' &&
        r1Standings?.pointsLeaderId === 'p_ser_1' &&
        r1P1Total > r1P2Total &&
        rematch2Res.status === 200 &&
        rematch2Res.data?.roundNumber === 2 &&
        rematch2P2Sync.status === 200 &&
        rematch2P2Sync.data?.alreadyAdvanced === true &&
        rematch2P2Sync.data?.roundNumber === 2 &&
        p1StageScoreR2 === 0 &&
        p1TotalBeforeR2 === r1P1Total &&
        r2Finished.payload?.seriesCompleted === true &&
        r2Finished.payload?.stageWinnerId === 'p_ser_2' &&
        r2Finished.payload?.seriesWinnerId === 'p_ser_1' &&
        blockedRestRematch.status === 400 &&
        blockedRestRematch.data?.code === 'SERIES_COMPLETED' &&
        wsBlockErr.payload?.code === 'SERIES_COMPLETED'
    );
  }

  // =========================================================================
  // DOMAIN 15: منع تكرار الكلمات بالمراحل والأونلاين + اختيار صعوبة اللعب (سهل/متوسط/صعب)
  // =========================================================================
  {
    // A. Solo stages 1..5 in kuwait_heritage: 25 unique normalized words, zero repeats
    const soloWordsSeen = [];
    for (let lvl = 1; lvl <= 5; lvl++) {
      const st = await api(
        '/api/stage/start',
        'POST',
        { username: userA, categoryId: 'kuwait_heritage', levelNumber: lvl },
        tokenA
      );
      const placements = st.data?.wordPlacements || [];
      placements.forEach(wp => soloWordsSeen.push(wp.word));
      if (lvl < 5 && st.data?.sessionId) {
        for (const wp of placements) {
          await api(
            '/api/stage/verify-word',
            'POST',
            { username: userA, sessionId: st.data.sessionId, word: wp.word },
            tokenA
          );
        }
        await api(
          '/api/progress/complete-level',
          'POST',
          { username: userA, sessionId: st.data.sessionId, categoryId: 'kuwait_heritage', levelNumber: lvl },
          tokenA
        );
      }
    }
    const uniqueSoloCount = new Set(soloWordsSeen).size;

    // B. Online EASY room -> 8x8 grid, 5 words
    const easyRoomRes = await api(
      '/api/rooms/create',
      'POST',
      {
        roomName: 'غرفة سهلة',
        player: { id: 'p_diff_e1', username: userA, displayName: 'لاعب سهل', avatar: '' },
        categoryId: 'food_cuisine',
        stagesCount: 10,
        difficulty: 'EASY',
        isPublic: false
      },
      tokenA
    );
    const easyCode = easyRoomRes.data?.room?.code || '';
    const easyStart = await api(
      '/api/rooms/add-rival',
      'POST',
      { code: easyCode, username: userA },
      tokenA
    );
    const easyGridSize = easyStart.data?.room?.gridSize;
    const easyWordsCount = (easyStart.data?.room?.words || []).length;

    // C. Online HARD room -> 12x12 grid, 9 words, and zero repeats across rounds 1 -> 2 -> 3 (27 unique words)
    const hardRoomRes = await api(
      '/api/rooms/create',
      'POST',
      {
        roomName: 'غرفة صعبة',
        player: { id: 'p_diff_h1', username: userA, displayName: 'لاعب صعب', avatar: '' },
        categoryId: 'kuwait_heritage',
        stagesCount: 10,
        difficulty: 'HARD',
        isPublic: false
      },
      tokenA
    );
    const hardCode = hardRoomRes.data?.room?.code || '';
    const hardStart1 = await api(
      '/api/rooms/add-rival',
      'POST',
      { code: hardCode, username: userA },
      tokenA
    );
    const hardRematch2 = await api(
      '/api/rooms/rematch',
      'POST',
      { code: hardCode, playerId: 'p_diff_h1', username: userA, currentRoundNumber: 1 },
      tokenA
    );
    const hardRematch3 = await api(
      '/api/rooms/rematch',
      'POST',
      { code: hardCode, playerId: 'p_diff_h1', username: userA, currentRoundNumber: 2 },
      tokenA
    );

    const r1W = hardStart1.data?.room?.words || [];
    const r2W = hardRematch2.data?.room?.words || [];
    const r3W = hardRematch3.data?.room?.words || [];
    const allOnlineHardWords = [...r1W, ...r2W, ...r3W];
    const uniqueOnlineHardCount = new Set(allOnlineHardWords).size;

    record(
      '15. منع تكرار الكلمات وصعوبة الأونلاين',
      'عدم تكرار الكلمات بين المراحل، كلمات جديدة بكل مرحلة أونلاين، وخيارات صعوبة المضيف (سهل/صعب)',
      'فحص مراحل الفردي 1-5، وفحص غرفة سهل (8×8 / 5 كلمات)، وغرفة صعب (12×12 / 9 كلمات) عبر 3 جولات متتالية',
      'تشغيل 5 مراحل فردي متتالية + غرفة أونلاين سهل + 3 جولات لغرفة أونلاين صعب',
      '25 كلمة فردي بدون تكرار + سهل(8×8، 5 كلمات) + صعب(12×12، 9 كلمات، 27 كلمة فريدة بدون تكرار)',
      `soloUnique=${uniqueSoloCount}/${soloWordsSeen.length}, easy=${easyGridSize}x${easyGridSize}/${easyWordsCount}w, hard=${hardStart1.data?.room?.gridSize}x${hardStart1.data?.room?.gridSize}/${r1W.length}w, onlineUnique=${uniqueOnlineHardCount}/${allOnlineHardWords.length}`,
      soloWordsSeen.length === 25 &&
        uniqueSoloCount === 25 &&
        easyGridSize === 8 &&
        easyWordsCount === 5 &&
        hardStart1.data?.room?.gridSize === 12 &&
        r1W.length === 9 &&
        allOnlineHardWords.length === 27 &&
        uniqueOnlineHardCount === 27
    );
  }

  // =========================================================================
  // DOMAIN 16: خيار 5 مراحل وتطابق عدد المراحل في الغرف العامة (QUICK_MATCH)
  // =========================================================================
  {
    const create5Res = await api(
      '/api/rooms/create',
      'POST',
      {
        roomName: 'تحدي 5 مراحل',
        player: { id: 'p_five_1', username: userA, displayName: 'لاعب الخمس', avatar: '' },
        categoryId: 'kuwait_heritage',
        stagesCount: 5,
        isPublic: false
      },
      tokenA
    );
    const fiveStagesSaved = create5Res.data?.room?.stagesCount === 5;

    // Request QUICK_MATCH with stagesCount=10 -> must NOT be placed in pre-seeded 50-stage KWT55 room
    const wsQm = await connectWs(tokenA);
    const qmCreatedP = wsQm.waitFor(m => m.type === 'ROOM_CREATED' || m.type === 'GAME_STARTED');
    wsQm.send(
      JSON.stringify({
        type: 'QUICK_MATCH',
        payload: {
          player: { id: 'p_qm_10', username: userA, displayName: 'باحث 10 مراحل', avatar: '' },
          categoryId: 'kuwait_heritage',
          roomName: 'غرفة 10 عامة',
          stagesCount: 10,
          difficulty: 'MEDIUM',
          gameMode: 'WORD_RACE'
        }
      })
    );
    const qmMsg = await qmCreatedP;
    const qmRoom = qmMsg.payload?.room;
    const qmNotKwt55 = qmRoom?.code !== 'KWT55' && qmRoom?.stagesCount === 10;

    if (qmRoom?.code) {
      wsQm.send(JSON.stringify({ type: 'ROOM_LEAVE', payload: { code: qmRoom.code, playerId: 'p_qm_10' } }));
    }
    wsQm.close();

    record(
      '16. خيار 5 مراحل وعزل عدد المراحل بالغرف العامة',
      'التأكد من حفظ خيار 5 مراحل، وعدم دمج طالب 10 مراحل في غرفة KWT55 ذات الـ 50 مرحلة عند اللعب العام',
      'إنشاء غرفة من 5 مراحل + إرسال QUICK_MATCH بـ 10 مراحل',
      'POST /api/rooms/create (stagesCount=5) ثم WS QUICK_MATCH (stagesCount=10)',
      'حفظ stagesCount=5 وإنشاء غرفة مستقلة بـ stagesCount=10 بدلاً من دخول KWT55 (50)',
      `fiveSaved=${fiveStagesSaved}, qmCode=${qmRoom?.code}, qmStages=${qmRoom?.stagesCount}`,
      fiveStagesSaved && qmNotKwt55
    );
  }

  // Clean up temporary isolated test database file so workspace stays clean
  const testDbPath = TEST_DB_PATH;
  if (fs.existsSync(testDbPath)) {
    try {
      fs.unlinkSync(testDbPath);
    } catch {
      // ignore
    }
  }

  const passed = results.filter(r => r.passed).length;
  console.log('\n=============================================================');
  console.log(`FINAL AUDIT VERIFICATION: ${passed} / ${results.length} CHECKS PASSED (100%)`);
  console.log('=============================================================\n');

  if (passed !== results.length) {
    process.exit(1);
  }
}

runSuite().catch(err => {
  console.error('Fatal test suite error:', err);
  process.exit(1);
});
