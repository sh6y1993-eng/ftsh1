import WebSocket from 'ws';
import assert from 'node:assert';

const BASE_URL = 'http://localhost:3000';
const WS_URL = 'ws://localhost:3000/ws';

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  console.log('--- STARTING MULTIPLAYER ROOM START SYNCHRONIZATION TEST ---');

  // Step 1: Create 2 test users (or use test tokens)
  // Let's authenticate 2 test users via /api/auth/login or guest registration
  const hostLoginRes = await fetch(`${BASE_URL}/api/auth/guest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName: 'مضيف الاختبار' })
  });
  assert(hostLoginRes.ok, 'Host guest login should succeed');
  const hostAuth = await hostLoginRes.json();
  const hostUser = hostAuth.user;
  const hostToken = hostAuth.authToken || hostAuth.token;
  console.log('✅ Host user registered:', hostUser.username, 'token:', Boolean(hostToken));

  const guestLoginRes = await fetch(`${BASE_URL}/api/auth/guest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName: 'ضيف الاختبار' })
  });
  assert(guestLoginRes.ok, 'Guest login should succeed');
  const guestAuth = await guestLoginRes.json();
  const guestUser = guestAuth.user;
  const guestToken = guestAuth.authToken || guestAuth.token;
  console.log('✅ Guest user registered:', guestUser.username, 'token:', Boolean(guestToken));

  // Step 2: Open WebSocket connections for both
  const hostWs = new WebSocket(`${WS_URL}?token=${encodeURIComponent(hostToken)}`);
  const guestWs = new WebSocket(`${WS_URL}?token=${encodeURIComponent(guestToken)}`);

  await Promise.all([
    new Promise((resolve, reject) => {
      hostWs.on('open', resolve);
      hostWs.on('error', reject);
    }),
    new Promise((resolve, reject) => {
      guestWs.on('open', resolve);
      guestWs.on('error', reject);
    })
  ]);
  console.log('✅ Both WebSockets connected');

  const hostMessages = [];
  hostWs.on('message', data => {
    try {
      hostMessages.push(JSON.parse(data.toString()));
    } catch {}
  });

  const guestMessages = [];
  guestWs.on('message', data => {
    try {
      guestMessages.push(JSON.parse(data.toString()));
    } catch {}
  });

  const hostPlayerId = `p_host_${Date.now()}`;
  const guestPlayerId = `p_guest_${Date.now()}`;

  // Step 3: Host creates room via HTTP
  const createRoomRes = await fetch(`${BASE_URL}/api/rooms/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${hostToken}`
    },
    body: JSON.stringify({
      player: {
        id: hostPlayerId,
        username: hostUser.username,
        displayName: hostUser.displayName
      },
      roomName: 'غرفة التحقق التزامني',
      categoryId: 'kuwait_landmarks',
      difficulty: 'MEDIUM',
      stagesCount: 5
    })
  });
  if (!createRoomRes.ok) {
    const errText = await createRoomRes.text();
    console.error('Room create failed:', createRoomRes.status, errText);
  }
  assert(createRoomRes.ok, 'Room creation should succeed');
  const createRoomData = await createRoomRes.json();
  const roomCode = createRoomData.room.code;
  console.log(`✅ Room created: ${roomCode} by host: ${hostPlayerId}`);

  // Register host in room WS
  hostWs.send(JSON.stringify({
    type: 'ROOM_JOIN',
    authToken: hostToken,
    payload: {
      code: roomCode,
      player: {
        id: hostPlayerId,
        username: hostUser.username,
        displayName: hostUser.displayName
      }
    }
  }));
  await delay(100);

  // Step 4: Guest joins room via HTTP
  const joinRes = await fetch(`${BASE_URL}/api/rooms/join`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${guestToken}`
    },
    body: JSON.stringify({
      code: roomCode,
      player: {
        id: guestPlayerId,
        username: guestUser.username,
        displayName: guestUser.displayName
      }
    })
  });
  if (!joinRes.ok) {
    const errText = await joinRes.text();
    console.error('Guest join failed:', joinRes.status, errText);
  }
  assert(joinRes.ok, 'Guest join should succeed');
  console.log(`✅ Guest joined room: ${guestPlayerId}`);

  // Register guest in room WS
  guestWs.send(JSON.stringify({
    type: 'ROOM_JOIN',
    authToken: guestToken,
    payload: {
      code: roomCode,
      player: {
        id: guestPlayerId,
        username: guestUser.username,
        displayName: guestUser.displayName
      }
    }
  }));
  await delay(200);

  // Clear previous messages before starting match
  hostMessages.length = 0;
  guestMessages.length = 0;

  // Step 5: Simulate the EXACT race condition reported by the user:
  // Host fires BOTH WebSocket ROOM_START AND HTTP POST /api/rooms/start simultaneously
  console.log('⚡ Triggering concurrent start (WS ROOM_START + HTTP POST /api/rooms/start)...');
  hostWs.send(JSON.stringify({
    type: 'ROOM_START',
    authToken: hostToken,
    payload: {
      code: roomCode,
      playerId: hostPlayerId,
      username: hostUser.username
    }
  }));

  const startHttpPromise = fetch(`${BASE_URL}/api/rooms/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${hostToken}`
    },
    body: JSON.stringify({
      code: roomCode,
      username: hostUser.username,
      playerId: hostPlayerId
    })
  });

  const startHttpRes = await startHttpPromise;
  assert(startHttpRes.ok, 'HTTP room start should succeed');
  const startHttpData = await startHttpRes.json();

  // Wait for WS messages to arrive
  await delay(300);

  // Step 6: Validate synchronization
  const hostGameStarted = hostMessages.find(m => m.type === 'GAME_STARTED');
  const guestGameStarted = guestMessages.find(m => m.type === 'GAME_STARTED');

  assert(hostGameStarted, 'Host should receive GAME_STARTED over WS');
  assert(guestGameStarted, 'Guest should receive GAME_STARTED over WS');

  const hostWsWords = hostGameStarted.payload.room.words;
  const guestWsWords = guestGameStarted.payload.room.words;
  const httpWords = startHttpData.room.words;

  console.log('Host WS words:', hostWsWords);
  console.log('Guest WS words:', guestWsWords);
  console.log('HTTP response words:', httpWords);

  assert.deepStrictEqual(hostWsWords, guestWsWords, 'Host and Guest MUST receive identical words!');
  assert.deepStrictEqual(hostWsWords, httpWords, 'WS words and HTTP response words MUST be identical!');

  // Validate grid is identical
  const hostGrid = hostGameStarted.payload.room.grid;
  const guestGrid = guestGameStarted.payload.room.grid;
  assert.deepStrictEqual(hostGrid, guestGrid, 'Host and Guest MUST receive identical grid!');

  // Step 7: Test idempotency on repeated start calls
  console.log('⚡ Testing idempotency against repeated start calls...');
  const repeatStartRes = await fetch(`${BASE_URL}/api/rooms/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${hostToken}`
    },
    body: JSON.stringify({
      code: roomCode,
      username: hostUser.username,
      playerId: hostPlayerId
    })
  });
  assert(repeatStartRes.ok, 'Repeat start should succeed');
  const repeatData = await repeatStartRes.json();
  assert.strictEqual(repeatData.alreadyStarted, true, 'Repeat start should return alreadyStarted: true');
  assert.deepStrictEqual(repeatData.room.words, hostWsWords, 'Words must not change upon repeat start!');

  // Step 8: Test word claiming synchronization
  console.log('⚡ Testing word claiming synchronization across host and guest...');
  hostMessages.length = 0;
  guestMessages.length = 0;

  const firstWord = hostWsWords[0];
  console.log(`Host claiming word 1: «${firstWord}»`);
  hostWs.send(JSON.stringify({
    type: 'WORD_FOUND',
    authToken: hostToken,
    payload: {
      code: roomCode,
      word: firstWord,
      playerId: hostPlayerId
    }
  }));

  await delay(200);

  const hostClaimed = hostMessages.find(m => m.type === 'WORD_CLAIMED');
  const guestClaimed = guestMessages.find(m => m.type === 'WORD_CLAIMED');
  assert(hostClaimed, 'Host should receive WORD_CLAIMED broadcast');
  assert(guestClaimed, 'Guest should receive WORD_CLAIMED broadcast');
  assert.strictEqual(hostClaimed.payload.word, firstWord);
  assert.strictEqual(guestClaimed.payload.word, firstWord);
  assert.strictEqual(guestClaimed.payload.playerId, hostPlayerId);
  console.log(`✅ Word «${firstWord}» successfully claimed by Host and broadcast to Guest`);

  // Step 9: Guest claims second word
  const secondWord = hostWsWords[1];
  console.log(`Guest claiming word 2: «${secondWord}»`);
  guestWs.send(JSON.stringify({
    type: 'WORD_FOUND',
    authToken: guestToken,
    payload: {
      code: roomCode,
      word: secondWord,
      playerId: guestPlayerId
    }
  }));

  await delay(200);

  const guestSecondClaim = guestMessages.find(m => m.type === 'WORD_CLAIMED' && m.payload.word === secondWord);
  const hostSecondClaim = hostMessages.find(m => m.type === 'WORD_CLAIMED' && m.payload.word === secondWord);
  assert(guestSecondClaim, 'Guest should receive second WORD_CLAIMED broadcast');
  assert(hostSecondClaim, 'Host should receive second WORD_CLAIMED broadcast');
  assert.strictEqual(hostSecondClaim.payload.playerId, guestPlayerId);
  console.log(`✅ Word «${secondWord}» successfully claimed by Guest and broadcast to Host`);

  // Step 10: Clean up sockets
  hostWs.close();
  guestWs.close();

  console.log('🎉 ALL MULTIPLAYER SYNCHRONIZATION TESTS PASSED SUCCESSFULLY!');
}

run().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
