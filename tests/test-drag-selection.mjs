import assert from 'node:assert/strict';
import {
  getLineBetweenCells,
  getSnappedLineBetweenCells,
  getStringFromCells,
  normalizeArabicWord,
  generateWordSearchGrid
} from '../src/engine/wordSearch.ts';

console.log('🧪 ========================================================');
console.log('🧪 Comprehensive Drag-to-Select & 8-Direction Verification');
console.log('🧪 ========================================================\n');

// ----------------------------------------------------------------------------
// Test 1: Verify All 8 Directions in getLineBetweenCells
// ----------------------------------------------------------------------------
console.log('▶ Test 1: Testing all 8 directions with getLineBetweenCells...');

// 1. Horizontal Right (Left to Right)
const hR = getLineBetweenCells(2, 2, 2, 5);
assert.equal(hR.length, 4);
assert.deepEqual(hR, [{ row: 2, col: 2 }, { row: 2, col: 3 }, { row: 2, col: 4 }, { row: 2, col: 5 }]);

// 2. Horizontal Left (Right to Left)
const hL = getLineBetweenCells(2, 5, 2, 2);
assert.equal(hL.length, 4);
assert.deepEqual(hL, [{ row: 2, col: 5 }, { row: 2, col: 4 }, { row: 2, col: 3 }, { row: 2, col: 2 }]);

// 3. Vertical Down (Top to Bottom)
const vD = getLineBetweenCells(2, 2, 5, 2);
assert.equal(vD.length, 4);
assert.deepEqual(vD, [{ row: 2, col: 2 }, { row: 3, col: 2 }, { row: 4, col: 2 }, { row: 5, col: 2 }]);

// 4. Vertical Up (Bottom to Top)
const vU = getLineBetweenCells(5, 2, 2, 2);
assert.equal(vU.length, 4);
assert.deepEqual(vU, [{ row: 5, col: 2 }, { row: 4, col: 2 }, { row: 3, col: 2 }, { row: 2, col: 2 }]);

// 5. Diagonal Down-Right
const dDR = getLineBetweenCells(2, 2, 5, 5);
assert.equal(dDR.length, 4);
assert.deepEqual(dDR, [{ row: 2, col: 2 }, { row: 3, col: 3 }, { row: 4, col: 4 }, { row: 5, col: 5 }]);

// 6. Diagonal Down-Left
const dDL = getLineBetweenCells(2, 5, 5, 2);
assert.equal(dDL.length, 4);
assert.deepEqual(dDL, [{ row: 2, col: 5 }, { row: 3, col: 4 }, { row: 4, col: 3 }, { row: 5, col: 2 }]);

// 7. Diagonal Up-Right
const dUR = getLineBetweenCells(5, 2, 2, 5);
assert.equal(dUR.length, 4);
assert.deepEqual(dUR, [{ row: 5, col: 2 }, { row: 4, col: 3 }, { row: 3, col: 4 }, { row: 2, col: 5 }]);

// 8. Diagonal Up-Left
const dUL = getLineBetweenCells(5, 5, 2, 2);
assert.equal(dUL.length, 4);
assert.deepEqual(dUL, [{ row: 5, col: 5 }, { row: 4, col: 4 }, { row: 3, col: 3 }, { row: 2, col: 2 }]);

console.log('✅ Test 1 Passed: All 8 directions generate exact coordinates!\n');

// ----------------------------------------------------------------------------
// Test 2: Snapped Line Between Cells (Magnetic Jitter & Drift Tolerance)
// ----------------------------------------------------------------------------
console.log('▶ Test 2: Testing magnetic snapping for touch jitter and drift...');

// Near-horizontal drift by 1 row
const snapH = getSnappedLineBetweenCells(3, 1, 4, 5, 10);
assert(snapH !== null, 'Near horizontal must snap');
assert.equal(snapH.length, 5);
assert.equal(snapH[0].row, 3);
assert.equal(snapH[4].row, 3);
assert.equal(snapH[4].col, 5);

// Near-vertical drift by 1 col
const snapV = getSnappedLineBetweenCells(1, 4, 5, 5, 10);
assert(snapV !== null, 'Near vertical must snap');
assert.equal(snapV.length, 5);
assert.equal(snapV[0].col, 4);
assert.equal(snapV[4].col, 4);
assert.equal(snapV[4].row, 5);

// Near-diagonal drift by 1 cell off 45-degree
const snapD = getSnappedLineBetweenCells(2, 2, 5, 6, 10);
assert(snapD !== null, 'Near diagonal must snap');
assert.equal(snapD.length, 5);

console.log('✅ Test 2 Passed: Touch jitter snaps accurately to 8 directions!\n');

// ----------------------------------------------------------------------------
// Test 3: High-Precision Coordinate Resolution & Clamping
// ----------------------------------------------------------------------------
console.log('▶ Test 3: Testing cell resolution math and boundary clamping...');

function simulateCellResolution(clientX, clientY, rect, gridSize, isRtl) {
  const padLeft = 8, padRight = 8, padTop = 8, padBottom = 8;
  if (
    clientX < rect.left - 50 ||
    clientX > rect.right + 50 ||
    clientY < rect.top - 50 ||
    clientY > rect.bottom + 50
  ) {
    return null;
  }
  const innerWidth = Math.max(1, rect.width - padLeft - padRight);
  const innerHeight = Math.max(1, rect.height - padTop - padBottom);
  const gap = gridSize > 10 ? 4 : 6;
  const totalGaps = (gridSize - 1) * gap;
  const colWidth = Math.max(1, (innerWidth - totalGaps) / gridSize);
  const rowHeight = Math.max(1, (innerHeight - totalGaps) / gridSize);
  const stepX = colWidth + gap;
  const stepY = rowHeight + gap;

  const clampedX = Math.max(rect.left + padLeft, Math.min(rect.right - padRight, clientX));
  const clampedY = Math.max(rect.top + padTop, Math.min(rect.bottom - padBottom, clientY));

  let col;
  if (isRtl) {
    const distFromRight = rect.right - padRight - clampedX;
    col = Math.floor((distFromRight + gap / 2) / stepX);
  } else {
    const distFromLeft = clampedX - rect.left - padLeft;
    col = Math.floor((distFromLeft + gap / 2) / stepX);
  }
  const distFromTop = clampedY - rect.top - padTop;
  const row = Math.floor((distFromTop + gap / 2) / stepY);

  return {
    row: Math.max(0, Math.min(gridSize - 1, row)),
    col: Math.max(0, Math.min(gridSize - 1, col))
  };
}

const mockRect = { left: 20, right: 380, top: 150, bottom: 510, width: 360, height: 360 };
const resolvedCenter = simulateCellResolution(200, 330, mockRect, 10, true);
assert(resolvedCenter !== null);

// Test finger lifted past the bottom edge:
const liftedPastBottom = simulateCellResolution(200, 525, mockRect, 10, true);
assert.equal(liftedPastBottom.row, 9, 'Should clamp to row 9 (bottom-most cell)');

// Test finger lifted past the right edge (col 0 in RTL):
const liftedPastRight = simulateCellResolution(395, 330, mockRect, 10, true);
assert.equal(liftedPastRight.col, 0, 'Should clamp to col 0 (right-most cell in RTL)');

// Test finger lifted past the left edge (col 9 in RTL):
const liftedPastLeft = simulateCellResolution(10, 330, mockRect, 10, true);
assert.equal(liftedPastLeft.col, 9, 'Should clamp to col 9 (left-most cell in RTL)');

// Test finger lifted far outside (> 50px away):
const outOfBounds = simulateCellResolution(500, 330, mockRect, 10, true);
assert.equal(outOfBounds, null, 'Far touches outside the board should be null');

console.log('✅ Test 3 Passed: Boundary clamping and edge lifting work accurately!\n');

// ----------------------------------------------------------------------------
// Test 4: Word Matching Engine Verification (Forward, Reversed, Normalized)
// ----------------------------------------------------------------------------
console.log('▶ Test 4: Testing word matching across real generated game boards...');

const targetWords = ['الكويت', 'أبراج', 'دسمان', 'فيلكا', 'سوق'];
const board = generateWordSearchGrid(targetWords, 10);

assert.equal(board.gridSize, 10);
assert.equal(board.wordPlacements.length, targetWords.length);

// Verify every placed word can be formed and matched by dragging from cell[0] to cell[last]
for (const placement of board.wordPlacements) {
  const startCell = placement.cells[0];
  const endCell = placement.cells[placement.cells.length - 1];

  // Drag forward (first cell -> last cell)
  const lineFwd = getLineBetweenCells(startCell.row, startCell.col, endCell.row, endCell.col);
  assert(lineFwd !== null, `Line must exist for placement ${placement.word}`);
  const textFwd = getStringFromCells(board.grid, lineFwd);
  const normFwd = normalizeArabicWord(textFwd);

  // Drag backward (last cell -> first cell)
  const lineRev = getLineBetweenCells(endCell.row, endCell.col, startCell.row, startCell.col);
  assert(lineRev !== null);
  const textRev = getStringFromCells(board.grid, lineRev);
  const normRev = normalizeArabicWord(textRev);

  const matched =
    normFwd === normalizeArabicWord(placement.word) ||
    normRev === normalizeArabicWord(placement.word);

  assert(matched, `Word ${placement.word} must match in either drag direction`);
}

console.log('✅ Test 4 Passed: All target words on the board match in forward and reverse drag!\n');

// ----------------------------------------------------------------------------
// Test 5: Drag Selection Simulation (Start -> Move -> Lift -> Claim / Mistake)
// ----------------------------------------------------------------------------
console.log('▶ Test 5: Full simulation of touch drag lifecycle...');

class SimulatedDragSession {
  constructor(grid, wordPlacements) {
    this.grid = grid;
    this.wordPlacements = wordPlacements;
    this.foundWords = [];
    this.score = 0;
    this.isDragging = false;
    this.startCell = null;
    this.currentPath = [];
    this.mistakesCount = 0;
  }

  touchStart(row, col) {
    this.isDragging = true;
    this.startCell = { row, col };
    this.currentPath = [{ row, col }];
  }

  touchMove(row, col) {
    if (!this.isDragging || !this.startCell) return;
    const line = getSnappedLineBetweenCells(this.startCell.row, this.startCell.col, row, col, this.grid.length);
    if (line) {
      this.currentPath = line;
    }
  }

  touchEnd() {
    if (!this.isDragging) return;
    this.isDragging = false;
    const path = this.currentPath;
    if (path.length >= 2) {
      const rawFwd = getStringFromCells(this.grid, path);
      const rawRev = getStringFromCells(this.grid, [...path].reverse());
      const normFwd = normalizeArabicWord(rawFwd);
      const normRev = normalizeArabicWord(rawRev);

      const found = this.wordPlacements.find(p => {
        const pw = normalizeArabicWord(p.word);
        return pw === normFwd || pw === normRev;
      });

      if (found) {
        if (!this.foundWords.includes(found.word)) {
          this.foundWords.push(found.word);
          this.score += 100 + found.word.length * 15;
        }
      } else {
        this.mistakesCount++;
      }
    }
    this.currentPath = [];
    this.startCell = null;
  }
}

const session = new SimulatedDragSession(board.grid, board.wordPlacements);

// 1. Valid word drag
const word1 = board.wordPlacements[0];
session.touchStart(word1.cells[0].row, word1.cells[0].col);
assert.equal(session.currentPath.length, 1);
session.touchMove(word1.cells[1].row, word1.cells[1].col);
assert.equal(session.currentPath.length, 2);
session.touchMove(word1.cells[word1.cells.length - 1].row, word1.cells[word1.cells.length - 1].col);
assert.equal(session.currentPath.length, word1.cells.length);
session.touchEnd();
assert.equal(session.foundWords.length, 1);
assert.equal(session.foundWords[0], word1.word);
assert(session.score > 0);

// 2. Invalid word drag
session.touchStart(0, 0);
session.touchMove(0, 3);
session.touchEnd();
assert.equal(session.mistakesCount, 1);
assert.equal(session.currentPath.length, 0);

// 3. Re-selecting an already found word (idempotent, does not re-add or inflate score)
const prevScore = session.score;
session.touchStart(word1.cells[0].row, word1.cells[0].col);
session.touchMove(word1.cells[word1.cells.length - 1].row, word1.cells[word1.cells.length - 1].col);
session.touchEnd();
assert.equal(session.foundWords.length, 1);
assert.equal(session.score, prevScore, 'Re-selecting must not inflate score');

console.log('✅ Test 5 Passed: Drag lifecycle (start, drag trail, submit, mistake, re-select) verified!\n');

console.log('🎉 ALL TESTS PASSED SUCCESSFULLY! 100% VERIFIED!');
