import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import WebSocket from 'ws';

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';
const WS_URL = BASE_URL.replace(/^http/, 'ws') + '/ws';
const PROD_DB_PATH = path.resolve(process.cwd(), 'data', 'database.json');
const AUTH_SECRET_PATH = path.resolve(process.cwd(), 'data', '.auth-secret');
const ADMIN_SECRET_PATH = path.resolve(process.cwd(), 'data', '.admin-secret');

function sha256File(filePath) {
  if (!fs.existsSync(filePath)) return 'MISSING';
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

async function apiPost(route, body = {}, token = '', extraHeaders = {}, useTestIsolation = true) {
  const headers = {
    'Content-Type': 'application/json',
    ...(useTestIsolation ? { 'x-test-db-isolation': '1' } : {}),
    ...extraHeaders
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
    headers['x-auth-token'] = token;
  }
  const res = await fetch(`${BASE_URL}${route}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

async function apiGet(route, token = '', extraHeaders = {}, useTestIsolation = true) {
  const headers = {
    ...(useTestIsolation ? { 'x-test-db-isolation': '1' } : {}),
    ...extraHeaders
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
    headers['x-auth-token'] = token;
  }
  const res = await fetch(`${BASE_URL}${route}`, {
    method: 'GET',
    headers
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

function connectWs(token) {
  return new Promise((resolve, reject) => {
    const url = token ? `${WS_URL}?token=${encodeURIComponent(token)}` : WS_URL;
    const ws = new WebSocket(url);
    const messages = [];
    ws.on('message', (raw) => {
      try {
        messages.push(JSON.parse(raw.toString()));
      } catch {
        // ignore
      }
    });
    ws.on('open', () => resolve({ ws, messages }));
    ws.on('error', reject);
  });
}

function waitForWsMessage(messages, predicate, timeoutMs = 4500) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const timer = setInterval(() => {
      const found = messages.find(predicate);
      if (found) {
        clearInterval(timer);
        resolve(found);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        clearInterval(timer);
        reject(new Error(`Timeout waiting for WS message (${timeoutMs}ms). Seen: ${messages.map(m => m.type).join(',')}`));
      }
    }, 35);
  });
}

async function registerIsolatedUser(prefix) {
  const suffix = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const username = `${prefix}_${suffix}`.toLowerCase();
  const displayName = `لاعب ${prefix}`;
  const res = await apiPost('/api/auth/register', {
    username,
    displayName,
    password: 'TestPass!2026',
    avatar: '👨🏻'
  });
  assert.equal(res.status, 200, `Failed to register test user ${username}: ${JSON.stringify(res.data)}`);
  assert.ok(res.data.authToken, 'Missing authToken');
  return {
    id: res.data.user.id,
    username: res.data.user.username,
    displayName: res.data.user.displayName,
    avatar: res.data.user.avatar,
    token: res.data.authToken
  };
}

async function createAndStartSpeedRoom(players, maxPlayers = players.length, useTestIsolation = true) {
  const host = players[0];
  const createRes = await apiPost(
    '/api/rooms/create',
    {
      roomName: `تحدي خاطف ${maxPlayers}P`,
      isPublic: false,
      maxPlayers,
      gameMode: 'SPEED_REVEAL_20S',
      difficulty: 'MEDIUM',
      stagesCount: 3,
      categoryId: 'kuwait_heritage',
      player: {
        id: host.id,
        username: host.username,
        displayName: host.displayName,
        avatar: host.avatar
      }
    },
    host.token,
    {},
    useTestIsolation
  );
  assert.equal(createRes.status, 200, `Room create failed: ${JSON.stringify(createRes.data)}`);
  const code = createRes.data.room.code;

  for (let i = 1; i < players.length; i++) {
    const p = players[i];
    const joinRes = await apiPost(
      '/api/rooms/join',
      {
        code,
        player: {
          id: p.id,
          username: p.username,
          displayName: p.displayName,
          avatar: p.avatar
        }
      },
      p.token,
      {},
      useTestIsolation
    );
    assert.equal(joinRes.status, 200, `Join failed for player ${i + 1}: ${JSON.stringify(joinRes.data)}`);
  }

  if (players.length >= 2) {
    const startRes = await apiPost(
      '/api/rooms/start',
      {
        code,
        username: host.username,
        playerId: host.id
      },
      host.token,
      {},
      useTestIsolation
    );
    assert.equal(startRes.status, 200, `Room start failed: ${JSON.stringify(startRes.data)}`);
    return { code, room: startRes.data.room };
  }

  return { code, room: createRes.data.room };
}

async function runSpeedRevealSecurityVerification() {
  console.log('================================================================================');
  console.log('🛡️  VERIFYING SPEED_REVEAL_20S SECURITY FIXES (10 FIXES & ISOLATED SUITE)');
  console.log('================================================================================');

  const initialProdDbHash = sha256File(PROD_DB_PATH);
  const initialAuthSecretHash = sha256File(AUTH_SECRET_PATH);
  const initialAdminSecretHash = sha256File(ADMIN_SECRET_PATH);

  // Reset isolated test DB
  const resetRes = await apiPost('/api/test/reset-isolated-db', {});
  assert.equal(resetRes.status, 200, 'Failed to reset isolated test DB');

  // Register 4 isolated test players
  const p1 = await registerIsolatedUser('spd_p1');
  const p2 = await registerIsolatedUser('spd_p2');
  const p3 = await registerIsolatedUser('spd_p3');
  const p4 = await registerIsolatedUser('spd_p4');

  // ----------------------------------------------------------------------------
  // TEST 1: 2-Player SPEED_REVEAL_20S Match + Out-of-Turn Rejection (REST & WS)
  // ----------------------------------------------------------------------------
  console.log('\n[1/8] Testing 2-Player SPEED_REVEAL_20S & Out-of-Turn Word Claim Rejection (REST & WS)...');
  const { code: code2P, room: room2P } = await createAndStartSpeedRoom([p1, p2], 2, true);
  assert.equal(room2P.gameMode, 'SPEED_REVEAL_20S');
  assert.deepEqual(room2P.turnOrder, [p1.id, p2.id], 'Initial 2P turnOrder must be [P1, P2]');
  assert.equal(room2P.activeTurnPlayerId, p1.id, 'P1 must hold the initial active turn');
  assert.equal(room2P.speedTurnSeq, 1, 'Initial speedTurnSeq must be 1');

  const wsConn1 = await connectWs(p1.token);
  const wsConn2 = await connectWs(p2.token);
  wsConn1.ws.send(JSON.stringify({ type: 'ROOM_REJOIN', payload: { code: code2P, playerId: p1.id, username: p1.username, authToken: p1.token } }));
  wsConn2.ws.send(JSON.stringify({ type: 'ROOM_REJOIN', payload: { code: code2P, playerId: p2.id, username: p2.username, authToken: p2.token } }));
  await waitForWsMessage(wsConn1.messages, m => m.type === 'ROOM_REJOINED');
  await waitForWsMessage(wsConn2.messages, m => m.type === 'ROOM_REJOINED');

  const firstWordPlacement = room2P.wordPlacements[0];
  assert.ok(firstWordPlacement && firstWordPlacement.word, 'Board must have wordPlacements');

  // 1A: P2 attempts to claim a valid board word via REST while it is P1's turn -> MUST be rejected with 403 OUT_OF_TURN
  const outOfTurnRest = await apiPost(
    '/api/rooms/claim-word',
    {
      code: code2P,
      word: firstWordPlacement.word,
      cells: firstWordPlacement.cells,
      playerId: p2.id,
      username: p2.username
    },
    p2.token
  );
  assert.equal(outOfTurnRest.status, 403, 'Out-of-turn REST word claim must return HTTP 403');
  assert.equal(outOfTurnRest.data.code, 'OUT_OF_TURN', 'Error code must be OUT_OF_TURN');
  assert.equal(outOfTurnRest.data.claimed, false, 'claimed must be false');
  assert.equal(outOfTurnRest.data.room.players[p2.id].score, 0, 'Out-of-turn player must receive 0 points');
  assert.equal(outOfTurnRest.data.room.activeTurnPlayerId, p1.id, 'Active turn must remain P1');
  assert.equal(outOfTurnRest.data.room.speedTurnSeq, 1, 'speedTurnSeq must remain 1');

  // 1B: P2 attempts to claim a valid board word via WebSocket WORD_FOUND while it is P1's turn -> MUST be rejected
  wsConn2.messages.length = 0;
  wsConn2.ws.send(
    JSON.stringify({
      type: 'WORD_FOUND',
      payload: {
        code: code2P,
        word: firstWordPlacement.word,
        cells: firstWordPlacement.cells,
        playerId: p2.id,
        username: p2.username,
        authToken: p2.token
      }
    })
  );
  const wsOutErr = await waitForWsMessage(wsConn2.messages, m => m.type === 'ERROR' && m.payload?.code === 'OUT_OF_TURN');
  assert.equal(wsOutErr.payload.code, 'OUT_OF_TURN');

  const checkAfterOutWs = await apiGet(`/api/rooms/${code2P}`, p1.token);
  assert.equal(checkAfterOutWs.data.room.players[p2.id].score, 0, 'P2 score must still be 0 after WS out-of-turn attempt');
  assert.equal(checkAfterOutWs.data.room.activeTurnPlayerId, p1.id, 'Active turn must still be P1');
  assert.ok(!checkAfterOutWs.data.room.wordPlacements[0].foundBy, 'Word must remain unclaimed');

  // 1C: P1 (whose turn IS active) claims the first word -> succeeds, awards points, and rotates turn to P2
  const validP1Claim = await apiPost(
    '/api/rooms/claim-word',
    {
      code: code2P,
      word: firstWordPlacement.word,
      cells: firstWordPlacement.cells,
      playerId: p1.id,
      username: p1.username
    },
    p1.token
  );
  assert.equal(validP1Claim.status, 200, 'Active turn player P1 word claim must succeed');
  assert.equal(validP1Claim.data.claimed, true);
  assert.ok(validP1Claim.data.room.players[p1.id].score > 0, 'P1 must receive points');
  assert.equal(validP1Claim.data.room.activeTurnPlayerId, p2.id, 'Turn must advance to P2 after P1 claims a word');
  assert.equal(validP1Claim.data.room.speedTurnSeq, 2, 'speedTurnSeq must increment to 2');

  // 1D: P1 tries to claim a second word immediately -> rejected with 403 OUT_OF_TURN because turn rotated to P2!
  const secondWordPlacement = room2P.wordPlacements[1];
  const p1DoubleClaim = await apiPost(
    '/api/rooms/claim-word',
    {
      code: code2P,
      word: secondWordPlacement.word,
      cells: secondWordPlacement.cells,
      playerId: p1.id,
      username: p1.username
    },
    p1.token
  );
  assert.equal(p1DoubleClaim.status, 403, 'P1 second consecutive word claim in same turn must be rejected as OUT_OF_TURN');
  assert.equal(p1DoubleClaim.data.code, 'OUT_OF_TURN');
  console.log('   ✅ 2-Player turn rotation & out-of-turn rejection (REST + WS) verified.');

  // ----------------------------------------------------------------------------
  // TEST 2: Timeout, Secret Letter Isolation, and Concurrent Duplicate Timeout Requests
  // ----------------------------------------------------------------------------
  console.log('\n[2/8] Testing 20s Timeout, Concurrent Duplicate Timeout Requests, and Secret Letter Isolation...');
  const p2Deadline = Number(validP1Claim.data.room.playerDeadlines[p2.id]);
  assert.ok(p2Deadline > 0, 'P2 must have an active 20s deadline');

  // Fire 5 concurrent speed-sync requests past P2's deadline to test idempotency & concurrency lock
  const simulatedAfterP2Timeout = p2Deadline + 250;
  const concurrentSyncs = await Promise.all(
    Array.from({ length: 5 }, (_, idx) =>
      apiPost(
        '/api/rooms/speed-sync',
        {
          code: code2P,
          playerId: idx % 2 === 0 ? p1.id : p2.id,
          username: idx % 2 === 0 ? p1.username : p2.username
        },
        idx % 2 === 0 ? p1.token : p2.token,
        { 'x-test-speed-now-ms': String(simulatedAfterP2Timeout) }
      )
    )
  );
  for (const r of concurrentSyncs) {
    assert.equal(r.status, 200);
    assert.equal(r.data.speedTurnSeq, 3, '5 concurrent timeout sync requests must advance speedTurnSeq by exactly 1 (from 2 to 3)');
    assert.equal(r.data.activeTurnPlayerId, p1.id, 'Active turn must move back to P1');
  }

  // Verify secret letter isolation: P1 (beneficiary of P2's timeout) gets 1 secret cell; P2 gets 0 secret cells
  const p1Sync = await apiPost('/api/rooms/speed-sync', { code: code2P, playerId: p1.id, username: p1.username }, p1.token);
  const p2Sync = await apiPost('/api/rooms/speed-sync', { code: code2P, playerId: p2.id, username: p2.username }, p2.token);
  assert.equal(p1Sync.data.myRevealedCells.length, 1, 'Beneficiary P1 must receive exactly 1 revealed secret cell');
  assert.equal(p2Sync.data.myRevealedCells.length, 0, 'Timed-out player P2 must NOT see P1 secret cell');
  assert.equal(p1Sync.data.room.secretRevealedLetters, undefined, 'secretRevealedLetters map must NEVER be exposed');
  assert.equal(p2Sync.data.room.secretRevealedLetters, undefined, 'secretRevealedLetters map must NEVER be exposed');
  console.log('   ✅ Timeout idempotency (5 concurrent requests -> 1 transition) & secret letter isolation verified.');

  // ----------------------------------------------------------------------------
  // TEST 3: Disconnect During Active Turn & Reconnect After Timeout
  // ----------------------------------------------------------------------------
  console.log('\n[3/8] Testing Disconnect During Active Turn & Reconnect After Timeout...');
  wsConn1.ws.close();
  const p1NewDeadline = Number(p1Sync.data.playerDeadlines[p1.id]);
  assert.ok(p1NewDeadline > 0);

  // While P1 is disconnected, P1's 20s turn expires
  const afterP1Timeout = p1NewDeadline + 500;
  const p2SyncAfterP1DisconnectTimeout = await apiPost(
    '/api/rooms/speed-sync',
    { code: code2P, playerId: p2.id, username: p2.username },
    p2.token,
    { 'x-test-speed-now-ms': String(afterP1Timeout) }
  );
  assert.equal(p2SyncAfterP1DisconnectTimeout.data.activeTurnPlayerId, p2.id, 'Turn must advance to P2 when disconnected P1 times out');
  assert.equal(p2SyncAfterP1DisconnectTimeout.data.speedTurnSeq, 4);
  assert.equal(p2SyncAfterP1DisconnectTimeout.data.myRevealedCells.length, 1, 'P2 must receive their own secret letter');

  // P1 reconnects via REST /api/rooms/rejoin and WS ROOM_REJOIN
  const p1RejoinRest = await apiPost('/api/rooms/rejoin', { code: code2P, playerId: p1.id, username: p1.username }, p1.token);
  assert.equal(p1RejoinRest.status, 200);
  assert.equal(p1RejoinRest.data.room.activeTurnPlayerId, p2.id, 'Reconnected P1 must see P2 as active turn player');
  assert.equal(p1RejoinRest.data.room.speedTurnSeq, 4, 'Reconnected P1 must receive updated speedTurnSeq=4');
  assert.equal(p1RejoinRest.data.room.myRevealedCells.length, 1, 'Reconnected P1 must retain their 1 previously revealed secret cell without seeing P2 cell');
  assert.notDeepEqual(
    p1RejoinRest.data.room.myRevealedCells,
    p2SyncAfterP1DisconnectTimeout.data.myRevealedCells,
    'P1 and P2 secret cells must remain isolated after reconnect'
  );
  wsConn2.ws.close();
  console.log('   ✅ Disconnect during turn & reconnect after timeout verified.');

  // ----------------------------------------------------------------------------
  // TEST 4: 3-Player & 4-Player SPEED_REVEAL_20S Turn Rotation & Player Leave Fix
  // ----------------------------------------------------------------------------
  console.log('\n[4/8] Testing 3-Player and 4-Player SPEED_REVEAL_20S Turn Rotation & Player Leave...');
  const { code: code3P, room: room3P } = await createAndStartSpeedRoom([p1, p2, p3], 3, true);
  assert.deepEqual(room3P.turnOrder, [p1.id, p2.id, p3.id], '3P turnOrder must be [P1, P2, P3]');
  assert.equal(room3P.activeTurnPlayerId, p1.id);

  // Timeout P1 -> turn goes to P2 (only P2 gets secret letter; P1 and P3 get 0)
  const dl3P_1 = Number(room3P.playerDeadlines[p1.id]);
  await apiPost(
    '/api/rooms/speed-sync',
    { code: code3P, playerId: p2.id, username: p2.username },
    p2.token,
    { 'x-test-speed-now-ms': String(dl3P_1 + 100) }
  );
  const s3_p1 = await apiGet(`/api/rooms/${code3P}`, p1.token);
  const s3_p2 = await apiGet(`/api/rooms/${code3P}`, p2.token);
  const s3_p3 = await apiGet(`/api/rooms/${code3P}`, p3.token);
  assert.equal(s3_p2.data.room.activeTurnPlayerId, p2.id, '3P turn must advance P1 -> P2');
  assert.equal(s3_p1.data.room.myRevealedCells.length, 0, 'P1 must have 0 secret cells');
  assert.equal(s3_p2.data.room.myRevealedCells.length, 1, 'Beneficiary P2 must have 1 secret cell');
  assert.equal(s3_p3.data.room.myRevealedCells.length, 0, 'Third player P3 must have 0 secret cells');

  // Now create 4-Player SPEED_REVEAL_20S room and test P1 -> P2 -> P3 -> P4 rotation and active player leaving
  const { code: code4P, room: room4P } = await createAndStartSpeedRoom([p1, p2, p3, p4], 4, true);
  assert.deepEqual(room4P.turnOrder, [p1.id, p2.id, p3.id, p4.id], '4P turnOrder must be [P1, P2, P3, P4]');
  assert.equal(room4P.activeTurnPlayerId, p1.id);

  // P1 claims word 0 -> turn rotates to P2
  const w4_0 = room4P.wordPlacements[0];
  const c4_1 = await apiPost('/api/rooms/claim-word', { code: code4P, word: w4_0.word, cells: w4_0.cells, playerId: p1.id, username: p1.username }, p1.token);
  assert.equal(c4_1.status, 200);
  assert.equal(c4_1.data.room.activeTurnPlayerId, p2.id, '4P: P1 claim -> P2 turn');

  // P2 leaves the room during P2's active turn -> Fix #8: advanceSpeedTurnOnPlayerRemoval mutates room directly and moves turn to P3!
  const leaveP2 = await apiPost('/api/rooms/leave', { code: code4P, playerId: p2.id, username: p2.username }, p2.token);
  assert.equal(leaveP2.status, 200);

  const afterP2Leave = await apiGet(`/api/rooms/${code4P}`, p3.token);
  assert.deepEqual(afterP2Leave.data.room.turnOrder, [p1.id, p3.id, p4.id], '4P turnOrder after P2 leave must be [P1, P3, P4]');
  assert.equal(afterP2Leave.data.room.activeTurnPlayerId, p3.id, 'Active turn must immediately advance to P3 when active player P2 leaves');
  assert.ok(Number(afterP2Leave.data.room.playerDeadlines[p3.id]) > 0, 'P3 must have a valid 20s deadline');

  // P3 claims word 1 -> turn rotates to P4
  const w4_1 = room4P.wordPlacements[1];
  const c4_3 = await apiPost('/api/rooms/claim-word', { code: code4P, word: w4_1.word, cells: w4_1.cells, playerId: p3.id, username: p3.username }, p3.token);
  assert.equal(c4_3.status, 200);
  assert.equal(c4_3.data.room.activeTurnPlayerId, p4.id, '4P: P3 claim -> P4 turn');

  // P4 claims word 2 -> turn wraps around to P1
  const w4_2 = room4P.wordPlacements[2];
  const c4_4 = await apiPost('/api/rooms/claim-word', { code: code4P, word: w4_2.word, cells: w4_2.cells, playerId: p4.id, username: p4.username }, p4.token);
  assert.equal(c4_4.status, 200);
  assert.equal(c4_4.data.room.activeTurnPlayerId, p1.id, '4P: P4 claim -> wraps around to P1 turn');
  console.log('   ✅ 3-Player & 4-Player rotation + active player leave direct mutation verified.');

  // ----------------------------------------------------------------------------
  // TEST 5: Message Forgery & Spoofing Rejection (WS & MQTT verify endpoint)
  // ----------------------------------------------------------------------------
  console.log('\n[5/8] Testing Message Forgery & Spoofing Rejection...');
  const wsForger = await connectWs(p4.token);
  wsForger.ws.send(JSON.stringify({ type: 'ROOM_REJOIN', payload: { code: code4P, playerId: p4.id, username: p4.username, authToken: p4.token } }));
  await waitForWsMessage(wsForger.messages, m => m.type === 'ROOM_REJOINED');

  // 5A: P4 tries to spoof P1's playerId in WORD_FOUND
  wsForger.messages.length = 0;
  const w4_3 = room4P.wordPlacements[3];
  wsForger.ws.send(
    JSON.stringify({
      type: 'WORD_FOUND',
      payload: {
        code: code4P,
        word: w4_3.word,
        cells: w4_3.cells,
        playerId: p1.id, // Spoofing P1!
        username: p4.username,
        authToken: p4.token
      }
    })
  );
  const spoofErr = await waitForWsMessage(wsForger.messages, m => m.type === 'ERROR');
  assert.equal(spoofErr.payload.code, 'FORBIDDEN_PLAYER_SPOOF', 'Spoofing another playerId over WS must be rejected with FORBIDDEN_PLAYER_SPOOF');

  // 5B: P4 sends forged client turn-control packets (SPEED_TIMEOUT_PENALTY, SPEED_TURN_TIMEOUT, SECRET_LETTER_REVEALED, FORCE_SPEED_TURN)
  const beforeForgeryState = (await apiGet(`/api/rooms/${code4P}`, p1.token)).data.room;
  for (const forgedType of ['SPEED_TIMEOUT_PENALTY', 'SPEED_TURN_TIMEOUT', 'SECRET_LETTER_REVEALED', 'FORCE_SPEED_TURN']) {
    wsForger.ws.send(
      JSON.stringify({
        type: forgedType,
        payload: {
          code: code4P,
          activeTurnPlayerId: p4.id,
          nextTurnPlayerId: p4.id,
          speedTurnSeq: 999,
          playerDeadlines: { [p4.id]: Date.now() + 999000 }
        }
      })
    );
  }
  await new Promise(r => setTimeout(r, 150));
  const afterForgeryState = (await apiGet(`/api/rooms/${code4P}`, p1.token)).data.room;
  assert.equal(afterForgeryState.activeTurnPlayerId, beforeForgeryState.activeTurnPlayerId, 'Forged turn messages must not change activeTurnPlayerId');
  assert.equal(afterForgeryState.speedTurnSeq, beforeForgeryState.speedTurnSeq, 'Forged turn messages must not change speedTurnSeq');

  // 5C: Forged MQTT / Broadcast WORD_FOUND verification via /api/rooms/verify-mqtt-message
  const forgedMqttRes = await apiPost('/api/rooms/verify-mqtt-message', {
    code: code4P,
    type: 'WORD_CLAIMED',
    word: w4_3.word,
    playerId: p4.id,
    wordScore: 9999,
    signature: 'forged_hmac_signature_12345'
  });
  assert.equal(forgedMqttRes.status, 403, 'Forged MQTT signature must be rejected with HTTP 403');
  assert.equal(forgedMqttRes.data.valid, false);
  wsForger.ws.close();
  console.log('   ✅ Message forgery, playerId spoofing, and unsigned MQTT rejection verified.');

  // ----------------------------------------------------------------------------
  // TEST 6: Server Bot Compliance with Turn Ownership in SPEED_REVEAL_20S
  // ----------------------------------------------------------------------------
  console.log('\n[6/8] Testing Server Bot Turn Ownership Compliance in SPEED_REVEAL_20S...');
  const createBotRoom = await apiPost(
    '/api/rooms/create',
    {
      roomName: 'غرفة ضد البوت',
      isPublic: false,
      maxPlayers: 2,
      gameMode: 'SPEED_REVEAL_20S',
      difficulty: 'MEDIUM',
      stagesCount: 1,
      categoryId: 'kuwait_heritage',
      player: {
        id: p1.id,
        username: p1.username,
        displayName: p1.displayName,
        avatar: p1.avatar
      }
    },
    p1.token
  );
  const botRoomCode = createBotRoom.data.room.code;
  const addRivalRes = await apiPost('/api/rooms/add-rival', { code: botRoomCode, username: p1.username }, p1.token);
  assert.equal(addRivalRes.status, 200);
  const botId = Object.keys(addRivalRes.data.room.players).find(id => id.startsWith('bot_rival_'));
  assert.ok(botId, 'Bot rival must be added');
  assert.equal(addRivalRes.data.room.activeTurnPlayerId, p1.id, 'Human host P1 must have turn 1');

  // Wait 3.2 seconds while it is P1's turn: confirm bot does NOT claim any word out of turn
  await new Promise(r => setTimeout(r, 3200));
  const checkBotRoom = await apiGet(`/api/rooms/${botRoomCode}`, p1.token);
  assert.equal(checkBotRoom.data.room.players[botId].score, 0, 'Bot must NOT claim any word while it is P1 turn');
  assert.equal(checkBotRoom.data.room.activeTurnPlayerId, p1.id, 'Turn must remain P1');
  await apiPost('/api/rooms/leave', { code: botRoomCode, playerId: p1.id, username: p1.username }, p1.token);
  console.log('   ✅ Server bot strictly respects turn ownership in SPEED_REVEAL_20S.');

  // ----------------------------------------------------------------------------
  // TEST 7: Real Room Protection Against Test Headers & /api/test/reset-isolated-db
  // ----------------------------------------------------------------------------
  console.log('\n[7/8] Testing Real Room Protection Against Test Headers (x-test-speed-now-ms, x-test-db-isolation) & Reset...');
  // Create a REAL room (without x-test-db-isolation header -> isTestIsolatedRoom === false)
  const { code: realRoomCode, room: realRoom } = await createAndStartSpeedRoom([p1, p2], 2, false);
  assert.equal(realRoom.gameMode, 'SPEED_REVEAL_20S');
  assert.equal(realRoom.activeTurnPlayerId, p1.id);
  const realSeqBefore = realRoom.speedTurnSeq;
  const realP1Deadline = Number(realRoom.playerDeadlines[p1.id]);

  // 7A: Attempt to tamper with server clock on the real room using x-test-speed-now-ms (with and without x-test-db-isolation)
  const clockTamper1 = await apiPost(
    '/api/rooms/speed-sync',
    { code: realRoomCode, playerId: p1.id, username: p1.username },
    p1.token,
    { 'x-test-speed-now-ms': String(realP1Deadline + 60000) },
    false
  );
  assert.equal(clockTamper1.status, 403, 'x-test-speed-now-ms on a real room without isolation header must be rejected with 403');
  assert.equal(clockTamper1.data.code, 'FORBIDDEN_TEST_CLOCK_TAMPER');

  const clockTamper2 = await apiPost(
    '/api/rooms/speed-sync',
    { code: realRoomCode, playerId: p1.id, username: p1.username },
    p1.token,
    { 'x-test-speed-now-ms': String(realP1Deadline + 60000) },
    true // Even if attacker sends x-test-db-isolation: 1!
  );
  assert.equal(clockTamper2.status, 403, 'x-test-speed-now-ms on a real room WITH x-test-db-isolation: 1 must STILL be rejected with 403');
  assert.equal(clockTamper2.data.code, 'FORBIDDEN_TEST_CLOCK_TAMPER');

  // 7B: Attempt to send test headers from an external/proxied IP (x-forwarded-for)
  const externalResetAttempt = await apiPost(
    '/api/test/reset-isolated-db',
    {},
    '',
    { 'x-forwarded-for': '203.0.113.55' },
    true
  );
  assert.equal(externalResetAttempt.status, 403, 'External client (x-forwarded-for) calling /api/test/reset-isolated-db must be rejected with 403');

  const externalCreateAttempt = await apiPost(
    '/api/rooms/create',
    {
      roomName: 'غرفة خارجية',
      isPublic: false,
      gameMode: 'SPEED_REVEAL_20S',
      player: { id: p1.id, username: p1.username, displayName: p1.displayName }
    },
    p1.token,
    { 'x-forwarded-for': '203.0.113.55' },
    true
  );
  assert.equal(externalCreateAttempt.status, 403, 'External client sending x-test-db-isolation must be rejected with 403');

  // 7C: Call /api/test/reset-isolated-db legitimately from local test runner and verify the real room is NOT deleted or affected!
  const legitimateReset = await apiPost('/api/test/reset-isolated-db', {}, '', {}, true);
  assert.equal(legitimateReset.status, 200);

  const realRoomAfterReset = await apiGet(`/api/rooms/${realRoomCode}`, p1.token, {}, false);
  assert.equal(realRoomAfterReset.status, 200, 'Real room must survive /api/test/reset-isolated-db untouched');
  assert.equal(realRoomAfterReset.data.room.activeTurnPlayerId, p1.id, 'Real room activeTurnPlayerId must remain P1');
  assert.equal(realRoomAfterReset.data.room.speedTurnSeq, realSeqBefore, 'Real room speedTurnSeq must remain unchanged');

  // Clean up the real room by having P1 and P2 leave normally (without test headers)
  await apiPost('/api/rooms/leave', { code: realRoomCode, playerId: p1.id, username: p1.username }, p1.token, {}, false);
  await apiPost('/api/rooms/leave', { code: realRoomCode, playerId: p2.id, username: p2.username }, p2.token, {}, false);
  console.log('   ✅ Real rooms are 100% immune to x-test-speed-now-ms, x-test-db-isolation, and /api/test/reset-isolated-db.');

  // ----------------------------------------------------------------------------
  // TEST 8: Verify Production Database & Secret Files Integrity (Zero Touch)
  // ----------------------------------------------------------------------------
  console.log('\n[8/8] Verifying Production Database & Server Secrets SHA-256 Integrity...');
  const finalProdDbHash = sha256File(PROD_DB_PATH);
  const finalAuthSecretHash = sha256File(AUTH_SECRET_PATH);
  const finalAdminSecretHash = sha256File(ADMIN_SECRET_PATH);

  assert.equal(finalProdDbHash, initialProdDbHash, 'data/database.json SHA-256 hash MUST NOT change!');
  assert.equal(finalAuthSecretHash, initialAuthSecretHash, 'data/.auth-secret SHA-256 hash MUST NOT change!');
  assert.equal(finalAdminSecretHash, initialAdminSecretHash, 'data/.admin-secret SHA-256 hash MUST NOT change!');
  console.log(`   ✅ data/database.json SHA-256 unchanged: ${finalProdDbHash}`);
  console.log(`   ✅ data/.auth-secret SHA-256 unchanged:  ${finalAuthSecretHash}`);
  console.log(`   ✅ data/.admin-secret SHA-256 unchanged: ${finalAdminSecretHash}`);

  console.log('\n================================================================================');
  console.log('🎉 ALL SPEED_REVEAL_20S SECURITY TESTS PASSED (8/8 SUITES - 100% VERIFIED)');
  console.log('================================================================================');
}

runSpeedRevealSecurityVerification().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
