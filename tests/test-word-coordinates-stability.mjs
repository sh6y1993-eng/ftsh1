import assert from 'node:assert';
import { verifyWordOnServerBoard } from '../src/engine/serverAuthoritativeEngine.ts';
import { findWordCellsInGrid } from '../src/engine/wordSearch.ts';

console.log('🧪 Starting Word Selection Coordinates & Stability Verification...');

// 1. Unit Test: verifyWordOnServerBoard preserves player coordinates
console.log('▶ Test 1: verifyWordOnServerBoard returns player coordinates when valid...');

const testGrid = [
  ['د', 'ر', 'ب', 'ا', 'ل', 'س', 'و', 'ق'], // 'سوق' on right: cols 5, 6, 7
  ['م', 'ر', 'ك', 'ب', 'ا', 'ل', 'ك', 'و'],
  ['ب', 'ح', 'ر', 'ق', 'ر', 'ي', 'ش', 'ت'],
  ['س', 'و', 'ق', 'ف', 'ن', 'ط', 'ا', 'س'], // 'سوق' on left: cols 0, 1, 2
  ['ك', 'و', 'ت', 'ج', 'ب', 'ل', 'ه', 'م'],
  ['د', 'س', 'م', 'ا', 'ن', 'خ', 'ي', 'ر'],
  ['س', 'ي', 'ف', 'ع', 'و', 'ا', 'ف', 'ي'],
  ['ح', 'ب', 'ا', 'ل', 'د', 'و', 'ه', 'ن']
];

const secretPlacements = [
  {
    word: 'سوق',
    displayWord: 'سوق',
    cells: [{ row: 0, col: 5 }, { row: 0, col: 6 }, { row: 0, col: 7 }], // Original on the right
    direction: 'LEFT_TO_RIGHT',
    color: '#0284c7'
  },
  {
    word: 'كوت',
    displayWord: 'كوت',
    cells: [{ row: 4, col: 0 }, { row: 4, col: 1 }, { row: 4, col: 2 }],
    direction: 'LEFT_TO_RIGHT',
    color: '#059669'
  }
];

// Player selected 'سوق' on the left: row 3, cols 0, 1, 2
const leftCells = [{ row: 3, col: 0 }, { row: 3, col: 1 }, { row: 3, col: 2 }];
const matchResult = verifyWordOnServerBoard(testGrid, secretPlacements, 'سوق', leftCells);

assert(matchResult !== null, 'verifyWordOnServerBoard should match the valid word');
assert.strictEqual(matchResult.word, 'سوق');
assert.deepStrictEqual(
  matchResult.cells,
  leftCells,
  'verifyWordOnServerBoard MUST return the exact coordinates where the player highlighted on the left, NOT the right!'
);
console.log('✅ Test 1 Passed: verifyWordOnServerBoard preserves player-selected coordinates!');

// 2. Integration Test: Live Server Room Word Claiming
console.log('▶ Test 2: Live Room Word Claiming preserves player-selected cells on the server...');

const BASE_URL = 'http://localhost:3000';

async function runLiveRoomTest() {
  // Step 1: Login host and guest
  const hostLoginRes = await fetch(`${BASE_URL}/api/auth/guest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName: 'مضيف الإحداثيات' })
  });
  assert(hostLoginRes.ok, 'Host login failed');
  const hostAuth = await hostLoginRes.json();
  const hostToken = hostAuth.authToken || hostAuth.token;
  const hostUser = hostAuth.user;

  const guestLoginRes = await fetch(`${BASE_URL}/api/auth/guest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName: 'ضيف الإحداثيات' })
  });
  assert(guestLoginRes.ok, 'Guest login failed');
  const guestAuth = await guestLoginRes.json();
  const guestToken = guestAuth.authToken || guestAuth.token;
  const guestUser = guestAuth.user;

  const hostPlayerId = `p_coord_host_${Date.now()}`;
  const guestPlayerId = `p_coord_guest_${Date.now()}`;

  // Step 2: Create room
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
      roomName: 'غرفة فحص إحداثيات الكلمات',
      categoryId: 'kuwait_landmarks',
      difficulty: 'MEDIUM',
      stagesCount: 3
    })
  });
  assert(createRoomRes.ok, 'Room creation failed');
  const createData = await createRoomRes.json();
  const roomCode = createData.room.code;

  // Step 3: Join guest
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
  assert(joinRes.ok, 'Room join failed');

  // Step 4: Start room
  const startRes = await fetch(`${BASE_URL}/api/rooms/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${hostToken}`
    },
    body: JSON.stringify({
      code: roomCode,
      playerId: hostPlayerId
    })
  });
  assert(startRes.ok, 'Room start failed');
  const startData = await startRes.json();
  const activeRoom = startData.room;
  assert.strictEqual(activeRoom.state, 'PLAYING');

  // Step 5: Claim word with custom valid cells
  // Step 5: Claim word with valid cells from the grid
  // Pick first word
  const targetPlacement = activeRoom.wordPlacements[0];
  const targetWord = targetPlacement.word;
  
  // Find where this word is on activeRoom.grid
  const foundCellsOnGrid = findWordCellsInGrid(activeRoom.grid, targetWord);
  assert(foundCellsOnGrid && foundCellsOnGrid.length >= 2, `Word ${targetWord} must be found on room grid`);

  const claimRes = await fetch(`${BASE_URL}/api/rooms/claim-word`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${hostToken}`
    },
    body: JSON.stringify({
      code: roomCode,
      word: targetWord,
      playerId: hostPlayerId,
      username: hostUser.username,
      cells: foundCellsOnGrid
    })
  });

  assert(claimRes.ok, 'Claim word request failed');
  const claimData = await claimRes.json();
  assert.strictEqual(claimData.success, true);
  assert.strictEqual(claimData.claimed, true);
  assert.deepStrictEqual(claimData.cells, foundCellsOnGrid, 'Claim response cells must match foundCellsOnGrid');

  const updatedRoomPlacement = claimData.room.wordPlacements.find(p => p.word === targetWord);
  assert(updatedRoomPlacement, 'Claimed word placement must be present in room.wordPlacements');
  assert.deepStrictEqual(
    updatedRoomPlacement.cells,
    foundCellsOnGrid,
    'Room wordPlacements cells MUST match claimant cells'
  );

  console.log('✅ Test 2 Passed: Server authoritatively stores and broadcasts exact claimant cells!');
}

runLiveRoomTest()
  .then(() => {
    console.log('🎉 ALL WORD SELECTION COORDINATE VERIFICATION TESTS PASSED!');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Test Failure:', err);
    process.exit(1);
  });
