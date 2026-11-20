import type { Direction, WordPlacement } from '../types/game.ts';

// Clean Arabic letters normalization
export function normalizeArabicWord(word: string): string {
  if (!word) return '';
  return word
    .trim()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '') // remove tashkeel & tatweel
    .replace(/[أإآ]/g, 'ا') // normalize alef
    .replace(/ة/g, 'ه') // normalize ta marbouta for grid consistency
    .replace(/ى/g, 'ي') // normalize alef maqsoura
    .replace(/\s+/g, ''); // remove spaces
}

// Frequent Arabic letters for realistic grid filling
const ARABIC_LETTERS_WEIGHTED = [
  'ا', 'ا', 'ا', 'ا', 'ل', 'ل', 'ل', 'م', 'م', 'ن', 'ن', 
  'ي', 'ي', 'ر', 'ر', 'ب', 'ب', 'ت', 'ت', 'د', 'د', 
  'س', 'س', 'ه', 'ه', 'و', 'و', 'ع', 'ع', 'ك', 'ك', 
  'ف', 'ف', 'ق', 'ق', 'ح', 'ج', 'ش', 'ص', 'ط', 'خ', 
  'ث', 'ذ', 'ض', 'ظ', 'ز'
];

// Color palette for discovered words (high contrast, delightful)
export const WORD_COLORS = [
  '#0284c7', // Sky blue
  '#059669', // Emerald
  '#d97706', // Amber
  '#7c3aed', // Purple
  '#db2777', // Pink
  '#dc2626', // Red
  '#0d9488', // Teal
  '#ea580c', // Orange
  '#4f46e5', // Indigo
  '#65a30d', // Lime
];

const DIRECTIONS: { name: Direction; dr: number; dc: number }[] = [
  { name: 'RIGHT_TO_LEFT', dr: 0, dc: -1 }, // Arabic natural horizontal
  { name: 'LEFT_TO_RIGHT', dr: 0, dc: 1 },
  { name: 'TOP_TO_BOTTOM', dr: 1, dc: 0 },
  { name: 'BOTTOM_TO_TOP', dr: -1, dc: 0 },
  { name: 'DIAG_DOWN_LEFT', dr: 1, dc: -1 },
  { name: 'DIAG_DOWN_RIGHT', dr: 1, dc: 1 },
  { name: 'DIAG_UP_LEFT', dr: -1, dc: -1 },
  { name: 'DIAG_UP_RIGHT', dr: -1, dc: 1 },
];

export interface GeneratedBoard {
  grid: string[][];
  wordPlacements: WordPlacement[];
  gridSize: number;
}

export function generateWordSearchGrid(
  rawWords: string[],
  size: number,
  allowedDirections?: Direction[]
): GeneratedBoard {
  const activeDirections =
    allowedDirections && allowedDirections.length > 0
      ? DIRECTIONS.filter(d => allowedDirections.includes(d.name))
      : DIRECTIONS;
  const dirsPool = activeDirections.length > 0 ? activeDirections : DIRECTIONS;

  // Try up to 100 times to place all words cleanly
  for (let attempt = 0; attempt < 100; attempt++) {
    const grid: (string | null)[][] = Array.from({ length: size }, () =>
      Array.from({ length: size }, () => null)
    );

    const placements: WordPlacement[] = [];
    let allPlaced = true;

    // Sort words by length descending for best packing
    const sortedWords = [...rawWords].sort((a, b) => b.length - a.length);

    for (let i = 0; i < sortedWords.length; i++) {
      const rawWord = sortedWords[i];
      const normalized = normalizeArabicWord(rawWord);
      if (normalized.length > size) {
        continue;
      }

      // Shuffle allowed directions, favoring horizontal Arabic right-to-left when available
      const shuffledDirs = [...dirsPool].sort(() => Math.random() - 0.5);
      if (Math.random() < 0.4) {
        const rtlIdx = shuffledDirs.findIndex(d => d.name === 'RIGHT_TO_LEFT');
        if (rtlIdx > -1) {
          const [rtl] = shuffledDirs.splice(rtlIdx, 1);
          shuffledDirs.unshift(rtl);
        }
      }

      let placed = false;
      const possiblePositions: { r: number; c: number; dir: typeof DIRECTIONS[0] }[] = [];

      for (const dir of shuffledDirs) {
        for (let r = 0; r < size; r++) {
          for (let c = 0; c < size; c++) {
            // Check boundary
            const endR = r + dir.dr * (normalized.length - 1);
            const endC = c + dir.dc * (normalized.length - 1);

            if (endR >= 0 && endR < size && endC >= 0 && endC < size) {
              // Check collision
              let valid = true;
              for (let k = 0; k < normalized.length; k++) {
                const checkR = r + dir.dr * k;
                const checkC = c + dir.dc * k;
                const existing = grid[checkR][checkC];
                if (existing !== null && existing !== normalized[k]) {
                  valid = false;
                  break;
                }
              }
              if (valid) {
                possiblePositions.push({ r, c, dir });
              }
            }
          }
        }
      }

      if (possiblePositions.length > 0) {
        // Pick one at random
        const chosen = possiblePositions[Math.floor(Math.random() * possiblePositions.length)];
        const cells: { row: number; col: number }[] = [];

        for (let k = 0; k < normalized.length; k++) {
          const cellR = chosen.r + chosen.dir.dr * k;
          const cellC = chosen.c + chosen.dir.dc * k;
          grid[cellR][cellC] = normalized[k];
          cells.push({ row: cellR, col: cellC });
        }

        placements.push({
          word: normalized,
          displayWord: rawWord,
          cells,
          direction: chosen.dir.name,
          color: WORD_COLORS[i % WORD_COLORS.length]
        });
        placed = true;
      }

      if (!placed) {
        allPlaced = false;
        break;
      }
    }

    if (allPlaced && placements.length === rawWords.length) {
      // Fill remaining empty cells with random letters
      const finalGrid: string[][] = grid.map(row =>
        row.map(cell => cell || ARABIC_LETTERS_WEIGHTED[Math.floor(Math.random() * ARABIC_LETTERS_WEIGHTED.length)])
      );

      return {
        grid: finalGrid,
        wordPlacements: placements,
        gridSize: size
      };
    }
  }

  // Fallback: guaranteed place
  const fallbackGrid: string[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => ARABIC_LETTERS_WEIGHTED[Math.floor(Math.random() * ARABIC_LETTERS_WEIGHTED.length)])
  );
  const fallbackPlacements: WordPlacement[] = [];
  const preferRtl = dirsPool.some(d => d.name === 'RIGHT_TO_LEFT') && !dirsPool.some(d => d.name === 'LEFT_TO_RIGHT');

  rawWords.forEach((word, idx) => {
    const norm = normalizeArabicWord(word);
    const row = idx % size;
    const cells: { row: number; col: number }[] = [];

    if (preferRtl) {
      const startCol = Math.min(size - 1, Math.max(norm.length - 1, Math.floor((size + norm.length) / 2)));
      for (let k = 0; k < norm.length; k++) {
        const c = startCol - k;
        if (c >= 0 && c < size && row < size) {
          fallbackGrid[row][c] = norm[k];
          cells.push({ row, col: c });
        }
      }
      fallbackPlacements.push({
        word: norm,
        displayWord: word,
        cells,
        direction: 'RIGHT_TO_LEFT',
        color: WORD_COLORS[idx % WORD_COLORS.length]
      });
    } else {
      const startCol = Math.min(size - norm.length, Math.max(0, Math.floor((size - norm.length) / 2)));
      for (let k = 0; k < norm.length; k++) {
        const c = startCol + k;
        if (c < size && row < size) {
          fallbackGrid[row][c] = norm[k];
          cells.push({ row, col: c });
        }
      }
      fallbackPlacements.push({
        word: norm,
        displayWord: word,
        cells,
        direction: 'LEFT_TO_RIGHT',
        color: WORD_COLORS[idx % WORD_COLORS.length]
      });
    }
  });

  return {
    grid: fallbackGrid,
    wordPlacements: fallbackPlacements,
    gridSize: size
  };
}

// Given two coordinates on the grid, calculate if they form a valid line
export function getLineBetweenCells(
  r1: number, 
  c1: number, 
  r2: number, 
  c2: number
): { row: number; col: number }[] | null {
  const dr = r2 - r1;
  const dc = c2 - c1;

  // Same cell
  if (dr === 0 && dc === 0) {
    return [{ row: r1, col: c1 }];
  }

  const stepR = dr === 0 ? 0 : dr / Math.abs(dr);
  const stepC = dc === 0 ? 0 : dc / Math.abs(dc);

  // Must be horizontal, vertical, or 45-degree diagonal
  const isHorizontal = dr === 0 && dc !== 0;
  const isVertical = dc === 0 && dr !== 0;
  const isDiagonal = Math.abs(dr) === Math.abs(dc);

  if (!isHorizontal && !isVertical && !isDiagonal) {
    return null;
  }

  const length = Math.max(Math.abs(dr), Math.abs(dc)) + 1;
  const line: { row: number; col: number }[] = [];

  for (let i = 0; i < length; i++) {
    line.push({
      row: r1 + stepR * i,
      col: c1 + stepC * i
    });
  }

  return line;
}

// Magnetic 8-direction line helper so slight touch/finger drift of 1 cell still selects cleanly
export function getSnappedLineBetweenCells(
  r1: number,
  c1: number,
  r2: number,
  c2: number,
  gridSize: number
): { row: number; col: number }[] | null {
  const exact = getLineBetweenCells(r1, c1, r2, c2);
  if (exact) return exact;

  const dr = r2 - r1;
  const dc = c2 - c1;
  const absDr = Math.abs(dr);
  const absDc = Math.abs(dc);

  // Near-horizontal drag (drifted by 1 row while dragging >= 2 columns)
  if (absDr === 1 && absDc >= 2) {
    return getLineBetweenCells(r1, c1, r1, c2);
  }
  // Near-vertical drag (drifted by 1 column while dragging >= 2 rows)
  if (absDc === 1 && absDr >= 2) {
    return getLineBetweenCells(r1, c1, r2, c1);
  }
  // Near-diagonal drag (drifted by 1 cell off 45-degree diagonal)
  if (Math.abs(absDr - absDc) === 1 && Math.max(absDr, absDc) >= 2) {
    const signR = dr > 0 ? 1 : -1;
    const signC = dc > 0 ? 1 : -1;
    const maxSteps = Math.max(absDr, absDc);
    const minSteps = Math.min(absDr, absDc);
    for (const dist of [maxSteps, minSteps]) {
      const snapR = r1 + signR * dist;
      const snapC = c1 + signC * dist;
      if (snapR >= 0 && snapR < gridSize && snapC >= 0 && snapC < gridSize) {
        const diag = getLineBetweenCells(r1, c1, snapR, snapC);
        if (diag) return diag;
      }
    }
  }

  return null;
}

// Locate the exact cell coordinates of a target word on a generated grid
export function findWordCellsInGrid(
  grid: string[][],
  rawTargetWord: string
): { row: number; col: number }[] | null {
  const cleanTarget = normalizeArabicWord(rawTargetWord);
  const size = grid.length;
  if (!cleanTarget || size === 0) return null;

  const len = cleanTarget.length;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (normalizeArabicWord(grid[r]?.[c] || '') !== cleanTarget[0]) continue;
      for (const dir of DIRECTIONS) {
        const endR = r + dir.dr * (len - 1);
        const endC = c + dir.dc * (len - 1);
        if (endR < 0 || endR >= size || endC < 0 || endC >= size) continue;

        const cells: { row: number; col: number }[] = [];
        let matches = true;
        for (let i = 0; i < len; i++) {
          const nr = r + dir.dr * i;
          const nc = c + dir.dc * i;
          if (normalizeArabicWord(grid[nr]?.[nc] || '') !== cleanTarget[i]) {
            matches = false;
            break;
          }
          cells.push({ row: nr, col: nc });
        }
        if (matches) {
          return cells;
        }
      }
    }
  }
  return null;
}

// Extract string from path of cells
export function getStringFromCells(grid: string[][], cells: { row: number; col: number }[]): string {
  return cells.map(cell => grid[cell.row]?.[cell.col] || '').join('');
}

