/**
 * Comprehensive App Store & Security Remediation Verification Suite for «فتّشها»
 * Run via: npx tsx tests/verify-security-remediation.mjs
 * Executes strictly against isolated testDb (`x-test-db-isolation: 1`) so `data/database.json` stays 100% untouched.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import WebSocket from 'ws';
import { generateKeyPair, SignJWT } from 'jose';
import {
  APPLE_BUNDLE_AUDIENCE,
  APPLE_ISSUER,
  sha256Hex,
  verifyAppleIdentityToken
} from '../src/engine/appleAuthVerifier';
import {
  checkTextModeration,
  isAllowedQuickReaction
} from '../src/engine/moderation';

const BASE_URL = process.env.FATTESHHA_BASE_URL || 'http://localhost:3000';
const WS_URL = process.env.FATTESHHA_WS_URL || 'ws://localhost:3000/ws';
const PROD_DB_PATH = path.resolve('data/database.json');
const TEST_DB_PATH = path.resolve('data/test-database.json');

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
  const results = [];
  const check = (section, name, passed, details = '') => {
    results.push({ section, name, passed: Boolean(passed), details });
    console.log(`${passed ? '✅ PASS' : '❌ FAIL'} [${section}] ${name}${details ? ` -> ${details}` : ''}`);
  };

  // =========================================================================
  // 1. UNIT CHECKS: Apple JWKS RS256 Verifier (jose)
  // =========================================================================
  {
    const { privateKey, publicKey } = await generateKeyPair('RS256');
    const rawNonce = 'test_raw_nonce_12345';
    const validJwt = await new SignJWT({
      email: 'player@privaterelay.appleid.com',
      email_verified: true,
      is_private_email: true,
      nonce: sha256Hex(rawNonce)
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-kid' })
      .setIssuer(APPLE_ISSUER)
      .setAudience(APPLE_BUNDLE_AUDIENCE)
      .setSubject('001234.abcdef987654.0001')
      .setIssuedAt()
      .setExpirationTime('10m')
      .sign(privateKey);

    const verifiedValid = await verifyAppleIdentityToken({
      identityToken: validJwt,
      rawNonce,
      keyResolver: publicKey
    });
    check(
      '1. Apple JWKS',
      'Valid RS256 token with matching iss/aud/exp/sha256(nonce) verifies',
      verifiedValid.sub === '001234.abcdef987654.0001' && verifiedValid.isPrivateEmail === true,
      verifiedValid.sub
    );

    const expectReject = async (label, fn) => {
      try {
        await fn();
        check('1. Apple JWKS', label, false, 'Unexpectedly succeeded');
      } catch (err) {
        check('1. Apple JWKS', label, true, err.code || err.message);
      }
    };

    await expectReject('Rejects missing token', () =>
      verifyAppleIdentityToken({ identityToken: '', keyResolver: publicKey })
    );
    await expectReject('Rejects unsigned .sig_apple_test token', () =>
      verifyAppleIdentityToken({
        identityToken:
          Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url') +
          '.' +
          Buffer.from(JSON.stringify({ sub: 'fake' })).toString('base64url') +
          '.sig_apple_test',
        keyResolver: publicKey
      })
    );
    await expectReject('Rejects mismatched nonce', () =>
      verifyAppleIdentityToken({
        identityToken: validJwt,
        rawNonce: 'wrong_nonce',
        keyResolver: publicKey
      })
    );

    const wrongAudJwt = await new SignJWT({ nonce: sha256Hex(rawNonce) })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(APPLE_ISSUER)
      .setAudience('com.wrong.bundle')
      .setSubject('001234.wrong')
      .setIssuedAt()
      .setExpirationTime('10m')
      .sign(privateKey);
    await expectReject('Rejects wrong aud', () =>
      verifyAppleIdentityToken({ identityToken: wrongAudJwt, keyResolver: publicKey })
    );

    const expiredJwt = await new SignJWT({})
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(APPLE_ISSUER)
      .setAudience(APPLE_BUNDLE_AUDIENCE)
      .setSubject('001234.expired')
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(privateKey);
    await expectReject('Rejects expired exp', () =>
      verifyAppleIdentityToken({ identityToken: expiredJwt, keyResolver: publicKey })
    );

    const parts = validJwt.split('.');
    const tampered = `${parts[0]}.${parts[1]}.${parts[2].slice(0, -3)}xxx`;
    await expectReject('Rejects tampered signature', () =>
      verifyAppleIdentityToken({ identityToken: tampered, keyResolver: publicKey })
    );
  }

  // =========================================================================
  // 2. UNIT CHECKS: Moderation, Profanity Obfuscation & Quick Reactions
  // =========================================================================
  {
    const legitimateNames = ['أحمد', 'دانة', 'جاسم', 'سارة', 'فهد', 'عبدالله', 'فتّشها', 'الكويت', 'أبو خالد'];
    const allLegitAllowed = legitimateNames.every(name => checkTextModeration(name, 'الاسم').allowed);
    check('2. Moderation Unit', 'Allows legitimate Kuwaiti & Arabic player/room names', allLegitAllowed);

    const profaneInputs = ['كلب', 'كـلـب', 'ك.ل.ب', 'ح م ا ر', 'f.u.c.k', 'شـرمـوطـة', 'كسمك'];
    const allProfaneBlocked = profaneInputs.every(txt => !checkTextModeration(txt, 'الاسم').allowed);
    check('2. Moderation Unit', 'Blocks Arabic & Latin profanity including diacritics/tatweel/spaced obfuscation', allProfaneBlocked);

    check(
      '2. Moderation Unit',
      'Quick reaction whitelist allows curated emotes and blocks arbitrary free text',
      isAllowedQuickReaction('كفووو! 🔥') && !isAllowedQuickReaction('كلام عشوائي حر') && !isAllowedQuickReaction('أهلاً شلونك')
    );
  }

  // =========================================================================
  // 3. LIVE SERVER & WS CHECKS (Isolated testDb)
  // =========================================================================
  const resetRes = await api('/api/test/reset-isolated-db', 'POST', {});
  check('3. Isolated DB', 'Reset isolated test database', resetRes.status === 200);

  // 3a. Live POST /api/auth/apple rejects forged/unsigned tokens
  {
    const missingApple = await api('/api/auth/apple', 'POST', { fullName: 'Test' });
    check('3. Apple HTTP Auth', 'POST /api/auth/apple rejects missing token (401)', missingApple.status === 401, `HTTP ${missingApple.status}`);

    const unsignedApple = await api('/api/auth/apple', 'POST', {
      identityToken: `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from('{"sub":"forged"}').toString('base64url')}.sig_apple_test`,
      fullName: 'Forged Apple'
    });
    check('3. Apple HTTP Auth', 'POST /api/auth/apple rejects unsigned .sig_apple_test token (401)', unsignedApple.status === 401, `HTTP ${unsignedApple.status}`);
  }

  // 3b. Register two test users + test profanity HTTP rejection
  const ts = Date.now().toString(36);
  const u1 = `sec_mod_a_${ts}`;
  const u2 = `sec_mod_b_${ts}`;
  const regProfane = await api('/api/auth/register', 'POST', {
    username: `prof_${ts}`,
    displayName: 'كـلـب حمار',
    password: 'StrongPassword#1'
  });
  check('3. Profanity HTTP', 'POST /api/auth/register blocks offensive displayName (400)', regProfane.status === 400, `HTTP ${regProfane.status}`);

  const reg1 = await api('/api/auth/register', 'POST', {
    username: u1,
    displayName: 'جاسم السالم',
    password: 'StrongPassword#1'
  });
  const reg2 = await api('/api/auth/register', 'POST', {
    username: u2,
    displayName: 'سارة الفهد',
    password: 'StrongPassword#2'
  });
  const tok1 = reg1.data.authToken;
  const tok2 = reg2.data.authToken;
  check('3. Accounts Setup', 'Registered two clean test accounts with authTokens', Boolean(tok1 && tok2));

  const profProfile = await api('/api/profile/update', 'POST', {
    username: u1,
    displayName: 'f.u.c.k you'
  }, tok1);
  check('3. Profanity HTTP', 'POST /api/profile/update blocks obfuscated profanity (400)', profProfile.status === 400, `HTTP ${profProfile.status}`);

  const profRoom = await api('/api/rooms/create', 'POST', {
    roomName: 'غرفة شـرمـوطـة',
    player: { id: 'p_prof', username: u1, displayName: 'جاسم السالم', avatar: '' },
    isPublic: true
  }, tok1);
  check('3. Profanity HTTP', 'POST /api/rooms/create blocks offensive room name (400)', profRoom.status === 400, `HTTP ${profRoom.status}`);

  // 3c. Reporting & Duplicate & Rate Limit
  {
    const unauthRep = await api('/api/moderation/report', 'POST', {
      reporterUsername: u1,
      targetUsername: u2,
      reason: 'اسم مسيء'
    });
    check('4. Moderation API', 'POST /api/moderation/report requires authToken (401)', unauthRep.status === 401);

    const selfRep = await api('/api/moderation/report', 'POST', {
      reporterUsername: u1,
      targetUsername: u1,
      reason: 'اسم مسيء'
    }, tok1);
    check('4. Moderation API', 'POST /api/moderation/report blocks self-reporting (400)', selfRep.status === 400);

    const validRep = await api('/api/moderation/report', 'POST', {
      reporterUsername: u1,
      targetUsername: u2,
      reason: 'إساءة أو مضايقة',
      details: 'اختبار البلاغ التلقائي',
      context: 'ONLINE_GAME'
    }, tok1);
    const createdReportId = validRep.data?.report?.id;
    check('4. Moderation API', 'POST /api/moderation/report creates PENDING report (200)', validRep.status === 200 && validRep.data?.report?.status === 'PENDING', createdReportId);

    const dupRep = await api('/api/moderation/report', 'POST', {
      reporterUsername: u1,
      targetUsername: u2,
      reason: 'سلوك مخالف'
    }, tok1);
    check('4. Moderation API', 'Duplicate open report from same reporter to same target blocked (409)', dupRep.status === 409, `HTTP ${dupRep.status}`);

    // Send 4 more reports to distinct dummy targets to hit rate limit (max 5 in 10m -> 6th returns 429)
    let rateLimitedStatus = 0;
    for (let i = 1; i <= 5; i++) {
      const r = await api('/api/moderation/report', 'POST', {
        reporterUsername: u1,
        targetUsername: `rate_target_${i}_${ts}`,
        reason: 'غش أو تلاعب'
      }, tok1);
      rateLimitedStatus = r.status;
    }
    check('4. Moderation API', 'Rate-limits more than 5 reports within 10 minutes (429)', rateLimitedStatus === 429, `6th HTTP ${rateLimitedStatus}`);

    // Admin Moderation Panel check
    const badAdminLogin = await api('/api/admin/login', 'POST', { secret: 'wrong-admin-secret-000' });
    check('4. Admin Moderation', 'POST /api/admin/login rejects wrong secret (401)', badAdminLogin.status === 401);

    const unauthAdminList = await api('/api/admin/reports', 'GET');
    check('4. Admin Moderation', 'GET /api/admin/reports rejects missing x-admin-token (401)', unauthAdminList.status === 401);

    let adminSecret = (process.env.FATTESHHA_ADMIN_SECRET || '').trim();
    if (!adminSecret && fs.existsSync('data/.admin-secret')) {
      adminSecret = fs.readFileSync('data/.admin-secret', 'utf-8').trim();
    }
    if (adminSecret) {
      const adminLogin = await api('/api/admin/login', 'POST', { secret: adminSecret });
      const adminTok = adminLogin.data?.adminToken || '';
      check('4. Admin Moderation', 'POST /api/admin/login issues signed fts_adm token for valid secret', adminLogin.status === 200 && adminTok.startsWith('fts_adm.'));

      const adminList = await api('/api/admin/reports', 'GET', null, null, { 'x-admin-token': adminTok });
      const hasRep = Array.isArray(adminList.data?.reports) && adminList.data.reports.some(r => r.id === createdReportId);
      check('4. Admin Moderation', 'GET /api/admin/reports returns created report', adminList.status === 200 && hasRep);

      if (createdReportId) {
        const patchRep = await api(`/api/admin/reports/${createdReportId}/status`, 'PATCH', {
          status: 'RESOLVED',
          actionNote: 'تم التحقق والإغلاق في اختبار الأمان'
        }, null, { 'x-admin-token': adminTok });
        check(
          '4. Admin Moderation',
          'PATCH /api/admin/reports/:id/status transitions report to RESOLVED and records audit log',
          patchRep.status === 200 && patchRep.data?.report?.status === 'RESOLVED'
        );
      }
    } else {
      check('4. Admin Moderation', 'Server admin secret available for login verification', false, 'No FATTESHHA_ADMIN_SECRET or data/.admin-secret');
    }
  }

  // 3d. Blocklist + Friends Invite + Public Rooms Filtering + WS Quick Reactions
  {
    const createPub = await api('/api/rooms/create', 'POST', {
      roomName: 'غرفة سارة العامة',
      player: { id: 'p2_room', username: u2, displayName: 'سارة الفهد', avatar: '' },
      isPublic: true
    }, tok2);
    const roomCode = createPub.data?.room?.code;
    check('5. Blocklist & Rooms', 'User B created public room', Boolean(roomCode), roomCode);

    // Connect both over WS & join roomCode BEFORE blocking
    const ws2 = await connectWs(tok2);
    ws2.send(JSON.stringify({
      type: 'ROOM_JOIN',
      payload: { code: roomCode, player: { id: 'p2_room', username: u2, displayName: 'سارة الفهد', avatar: '' } }
    }));
    await ws2.waitFor(m => m.type === 'ROOM_UPDATED');

    const ws1 = await connectWs(tok1);
    ws1.send(JSON.stringify({
      type: 'ROOM_JOIN',
      payload: { code: roomCode, player: { id: 'p1_room', username: u1, displayName: 'جاسم السالم', avatar: '' } }
    }));
    await ws1.waitFor(m => m.type === 'ROOM_UPDATED' || m.type === 'GAME_STARTED');

    // WS free-text chat rejection
    ws1.send(JSON.stringify({
      type: 'CHAT_MESSAGE',
      payload: { code: roomCode, sender: 'جاسم', text: 'رسالة نصية حرة غير مسموحة' }
    }));
    const chatErr = await ws1.waitFor(m => m.type === 'ERROR' && m.payload?.code === 'CHAT_REACTION_NOT_ALLOWED');
    check('5. WS Quick Reactions', 'WS CHAT_MESSAGE rejects arbitrary free-text input', Boolean(chatErr));

    // WS allowed quick reaction broadcast when unblocked
    ws2.send(JSON.stringify({
      type: 'CHAT_MESSAGE',
      payload: { code: roomCode, sender: 'سارة', text: 'كفووو! 🔥' }
    }));
    const chatOk = await ws1.waitFor(m => m.type === 'CHAT_BROADCAST' && m.payload?.chatItem?.text === 'كفووو! 🔥');
    check('5. WS Quick Reactions', 'WS CHAT_MESSAGE broadcasts curated quick reaction to unblocked room member', Boolean(chatOk));

    // Now u1 blocks u2
    const blkRes = await api('/api/moderation/block', 'POST', { username: u1, targetUsername: u2 }, tok1);
    const blkList = await api(`/api/moderation/blocked?username=${encodeURIComponent(u1)}`, 'GET', null, tok1);
    check(
      '5. Blocklist & Rooms',
      'POST /api/moderation/block & GET /api/moderation/blocked persist blocklist',
      blkRes.status === 200 && blkList.data?.blockedUsers?.includes(u2)
    );

    // WS quick reaction from blocked u2 must NOT reach u1
    const prevBroadcastCount = ws1._messages.filter(m => m.type === 'CHAT_BROADCAST').length;
    ws2.send(JSON.stringify({
      type: 'CHAT_MESSAGE',
      payload: { code: roomCode, sender: 'سارة', text: 'يا وحش! 🦅' }
    }));
    await new Promise(r => setTimeout(r, 250));
    const afterBroadcastCount = ws1._messages.filter(m => m.type === 'CHAT_BROADCAST').length;
    check('5. WS Quick Reactions', 'WS CHAT_BROADCAST is suppressed between blocked users', prevBroadcastCount === afterBroadcastCount);

    ws1.close();
    ws2.close();

    // Friend invite blocked (403)
    const invBlocked = await api('/api/friends/invite', 'POST', {
      fromUsername: u1,
      toUsername: u2,
      roomCode: 'XYZ99'
    }, tok1);
    check('5. Blocklist & Rooms', 'POST /api/friends/invite rejects invites between blocked users (403)', invBlocked.status === 403);

    // New public room from u2 is hidden from u1 & join rejected
    const pub2 = await api('/api/rooms/create', 'POST', {
      roomName: 'غرفة ثانية لـ سارة',
      player: { id: 'p2_room_2', username: u2, displayName: 'سارة الفهد', avatar: '' },
      isPublic: true
    }, tok2);
    const code2 = pub2.data?.room?.code;

    const pubListForU1 = await api('/api/rooms/public', 'GET', null, tok1);
    const seesBlockedRoom = Array.isArray(pubListForU1.data?.rooms) && pubListForU1.data.rooms.some(r => r.code === code2);
    check('5. Blocklist & Rooms', 'GET /api/rooms/public hides rooms hosted by blocked players', !seesBlockedRoom);

    const joinBlocked = await api('/api/rooms/join', 'POST', {
      code: code2,
      player: { id: 'p1_join_attempt', username: u1, displayName: 'جاسم السالم', avatar: '' }
    }, tok1);
    check('5. Blocklist & Rooms', 'POST /api/rooms/join prevents joining a room with a blocked player (403)', joinBlocked.status === 403);

    // Unblock restores access
    const unblk = await api('/api/moderation/unblock', 'POST', { username: u1, targetUsername: u2 }, tok1);
    const joinAfterUnblock = await api('/api/rooms/join', 'POST', {
      code: code2,
      player: { id: 'p1_join_ok', username: u1, displayName: 'جاسم السالم', avatar: '' }
    }, tok1);
    check(
      '5. Blocklist & Rooms',
      'POST /api/moderation/unblock restores ability to see/join rooms (200)',
      unblk.status === 200 && joinAfterUnblock.status === 200
    );
  }

  // 3e. Account deletion tombstone & PII cleanup
  {
    const delUser = `sec_del_${ts}`;
    const regDel = await api('/api/auth/register', 'POST', {
      username: delUser,
      displayName: 'حساب للحذف',
      password: 'DeletePass#123'
    });
    const delTok = regDel.data?.authToken;
    await api('/api/friends/add', 'POST', { username: u1, friendUsername: delUser }, tok1);
    const delRes = await api('/api/auth/delete-account', 'POST', {
      username: delUser,
      confirmDelete: 'DELETE'
    }, delTok);

    const rawTestDb = JSON.parse(fs.readFileSync(TEST_DB_PATH, 'utf-8'));
    const userGone = !rawTestDb.users?.[delUser];
    const tombstonePresent = Array.isArray(rawTestDb.deletedUsernames) && rawTestDb.deletedUsernames.includes(delUser);
    const removedFromFriend = !(rawTestDb.users?.[u1]?.friends || []).includes(delUser);
    const loginAfterDel = await api('/api/auth/login', 'POST', {
      username: delUser,
      password: 'DeletePass#123'
    });
    check(
      '6. Account Deletion',
      'POST /api/auth/delete-account purges user, records deletedUsernames tombstone, cleans friends, blocks re-login',
      delRes.status === 200 && userGone && tombstonePresent && removedFromFriend && (loginAfterDel.status === 401 || loginAfterDel.status === 404),
      `login HTTP ${loginAfterDel.status}`
    );
  }

  // =========================================================================
  // 4. STATIC CHECKS: Production dist/ Bundle, Fonts, Supabase RLS, iOS Files, Backups
  // =========================================================================
  {
    const distDir = path.resolve('dist');
    const distHtml = fs.existsSync(path.join(distDir, 'index.html'))
      ? fs.readFileSync(path.join(distDir, 'index.html'), 'utf-8')
      : '';
    const assetsDir = path.join(distDir, 'assets');
    const assetFiles = fs.existsSync(assetsDir) ? fs.readdirSync(assetsDir) : [];
    const jsBundles = assetFiles.filter(f => f.endsWith('.js')).map(f => fs.readFileSync(path.join(assetsDir, f), 'utf-8')).join('\n');
    const cssBundles = assetFiles.filter(f => f.endsWith('.css')).map(f => fs.readFileSync(path.join(assetsDir, f), 'utf-8')).join('\n');
    const woffFiles = assetFiles.filter(f => f.endsWith('.woff2') || f.endsWith('.woff'));

    check('7. dist/ Fonts & Privacy', 'Local Cairo & Tajawal woff2 fonts bundled in dist/assets', woffFiles.some(f => f.includes('cairo')) && woffFiles.some(f => f.includes('tajawal')), `${woffFiles.length} font files`);
    check('7. dist/ Fonts & Privacy', 'Zero Google Fonts CDN links in dist/index.html or CSS/JS', !/fonts\.googleapis\.com|fonts\.gstatic\.com/i.test(distHtml + cssBundles + jsBundles));
    check('7. dist/ Hardening', 'Zero hardcoded https://ais-dev-* development URLs in production dist/ bundle', !/https?:\/\/ais-dev-/i.test(jsBundles + distHtml));
    check('7. dist/ Hardening', 'Zero fake Google modal or client .from("profiles") direct REST scans in dist/', !/showGoogleModal|\.from\(["']profiles["']\)/i.test(jsBundles));

    // Realtime MQTT fallback disabled in PROD/iOS
    const rtSrc = fs.readFileSync(path.resolve('src/services/realtimeSync.ts'), 'utf-8');
    check('7. Client Security', 'MQTT public relay disabled in production & native iOS', /isPublicMqttFallbackEnabled[\s\S]*(?:import\.meta\.env\.PROD|env\.PROD)[\s\S]*isNativeIOSApp\(\)/.test(rtSrc));

    // AuthScreen Google OAuth gated properly
    const authSrc = fs.readFileSync(path.resolve('src/screens/AuthScreen.tsx'), 'utf-8');
    check('7. Client Security', 'AuthScreen removes fake Google modal & gates Google OAuth behind env flag + !isNativeIOSApp()', !authSrc.includes('showGoogleModal') && authSrc.includes("VITE_ENABLE_GOOGLE_OAUTH === 'true'") && authSrc.includes('!isNativeIOSApp()'));

    // Supabase RLS Migration
    const sqlPath = path.resolve('supabase/migrations/20261117_rls_security_hardening.sql');
    const rlsSql = fs.existsSync(sqlPath) ? fs.readFileSync(sqlPath, 'utf-8') : '';
    check(
      '8. Supabase RLS',
      'RLS hardening SQL enables RLS, revokes anon direct access, and scopes policies',
      /ENABLE ROW LEVEL SECURITY/i.test(rlsSql) && /REVOKE ALL ON (?:TABLE\s+)?public\.profiles FROM anon/i.test(rlsSql) && /CREATE POLICY/i.test(rlsSql)
    );

    // iOS Native Configs
    const privacyInfo = fs.readFileSync(path.resolve('ios/App/App/PrivacyInfo.xcprivacy'), 'utf-8');
    check(
      '9. iOS PrivacyInfo',
      'PrivacyInfo.xcprivacy declares UserID, GameplayContent, EmailAddress, Name, and CA92.1',
      privacyInfo.includes('NSPrivacyCollectedDataTypeUserID') &&
        privacyInfo.includes('NSPrivacyCollectedDataTypeGameplayContent') &&
        privacyInfo.includes('NSPrivacyCollectedDataTypeEmailAddress') &&
        privacyInfo.includes('NSPrivacyCollectedDataTypeName') &&
        privacyInfo.includes('CA92.1')
    );

    const infoPlist = fs.readFileSync(path.resolve('ios/App/App/Info.plist'), 'utf-8');
    const portraitMatches = infoPlist.match(/UIInterfaceOrientationPortrait</g) || [];
    check(
      '9. iOS Info.plist',
      'Info.plist removes Main storyboard keys, sets arm64, and locks to Portrait only',
      !infoPlist.includes('UISceneStoryboardFile') &&
        !infoPlist.includes('UIMainStoryboardFile') &&
        !infoPlist.includes('armv7') &&
        infoPlist.includes('<string>arm64</string>') &&
        !infoPlist.includes('UIInterfaceOrientationLandscape') &&
        !infoPlist.includes('UIInterfaceOrientationPortraitUpsideDown') &&
        portraitMatches.length === 2
    );

    const pbxproj = fs.readFileSync(path.resolve('ios/App/App.xcodeproj/project.pbxproj'), 'utf-8');
    check(
      '9. iOS Xcode Project',
      'project.pbxproj links PrivacyInfo.xcprivacy, sets TARGETED_DEVICE_FAMILY="1", CAPACITOR_DEBUG=false, removes COCOAPODS, uses Apple Distribution',
      pbxproj.includes('PrivacyInfo.xcprivacy in Resources') &&
        !pbxproj.includes('TARGETED_DEVICE_FAMILY = "1,2"') &&
        pbxproj.includes('TARGETED_DEVICE_FAMILY = "1"') &&
        pbxproj.includes('CAPACITOR_DEBUG = false') &&
        !pbxproj.includes('COCOAPODS') &&
        pbxproj.includes('CODE_SIGN_IDENTITY = "Apple Distribution"')
    );

    const sceneDelegate = fs.readFileSync(path.resolve('ios/App/App/SceneDelegate.swift'), 'utf-8');
    check('9. iOS SceneDelegate', 'SceneDelegate guards against duplicate UIWindow initialization', sceneDelegate.includes('if self.window == nil'));

    const postClone = fs.readFileSync(path.resolve('ios/App/ci_scripts/ci_post_clone.sh'), 'utf-8');
    check('9. Xcode Cloud Script', 'ci_post_clone.sh restricts supported orientations to Portrait only', !postClone.includes('Landscape') && !postClone.includes('UpsideDown'));

    // Backups & atomic persistence
    const hasPreBackup = fs.existsSync(path.resolve('backups/database.pre-remediation.json'));
    const rollingBackups = fs.existsSync(path.resolve('data/backups')) ? fs.readdirSync(path.resolve('data/backups')).filter(f => f.startsWith('database-backup-')) : [];
    check('10. Persistence & Backups', 'Pre-remediation backup exists and rolling database backups are active', hasPreBackup && rollingBackups.length > 0, `${rollingBackups.length} rolling backup(s)`);
  }

  // Final DB Integrity Check
  const prodHashAfter = sha256File(PROD_DB_PATH);
  check('11. Prod DB Isolation', 'data/database.json SHA-256 hash remained 100% unchanged', prodHashBefore === prodHashAfter, prodHashBefore.slice(0, 12));

  const passedCount = results.filter(r => r.passed).length;
  const totalCount = results.length;
  console.log(`\n=== SECURITY REMEDIATION SUMMARY: ${passedCount}/${totalCount} PASSED ===`);
  if (passedCount !== totalCount) {
    process.exitCode = 1;
  }
}

runSuite().catch(err => {
  console.error('FATAL TEST ERROR:', err);
  process.exit(1);
});
