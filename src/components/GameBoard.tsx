import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Eye, Sun, Moon, Hash } from 'lucide-react';
import { WordPlacement } from '../types/game';
import {
  getLineBetweenCells,
  getSnappedLineBetweenCells,
  getStringFromCells,
  normalizeArabicWord
} from '../engine/wordSearch';
import { getBoardThemeById, getTrailStyleById } from '../engine/gameCategories';
import { sounds } from '../utils/audio';

interface GameBoardProps {
  grid: string[][];
  gridSize: number;
  wordPlacements: WordPlacement[];
  foundWords: string[];
  playerColorMap?: Record<string, string>; // Map of word -> player color
  opponentPath?: { row: number; col: number }[];
  opponentColor?: string;
  opponentName?: string;
  onSelectionDrag?: (cells: { row: number; col: number }[]) => void;
  onWordSelected: (word: string, cells: { row: number; col: number }[]) => void;
  onWordMistake?: () => void;
  hintCell?: { row: number; col: number } | null;
  hintPlacement?: WordPlacement | null;
  revealedCells?: { row: number; col: number; label?: string }[];
  dimUnusedCells?: boolean;
  boardThemeId?: string;
  trailStyleId?: string;
  frozenSeconds?: number;
  sandstormSeconds?: number;
  tvMode?: boolean;
}

export const GameBoard: React.FC<GameBoardProps> = ({
  grid,
  gridSize,
  wordPlacements,
  foundWords,
  playerColorMap = {},
  opponentPath = [],
  opponentColor = '#ec4899',
  opponentName,
  onSelectionDrag,
  onWordSelected,
  onWordMistake,
  hintCell,
  hintPlacement,
  revealedCells = [],
  dimUnusedCells = false,
  boardThemeId,
  trailStyleId,
  frozenSeconds = 0,
  sandstormSeconds = 0,
  tvMode = false
}) => {
  const activeBoardTheme = getBoardThemeById(boardThemeId);
  const activeTrailStyle = getTrailStyleById(trailStyleId);
  const isBoardFrozen = frozenSeconds > 0;
  const isSandstormActive = sandstormSeconds > 0;
  const [paperMode, setPaperMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('fatteshha_board_comfort_mode') === 'paper';
    } catch {
      return false;
    }
  });
  const [eyeComfortActive, setEyeComfortActive] = useState<boolean>(() => {
    try {
      return localStorage.getItem('fatteshha_eye_comfort_mode') === '1';
    } catch {
      return false;
    }
  });
  const [showCellNumbers, setShowCellNumbers] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('fatteshha_board_show_numbers');
      return saved === null ? true : saved === '1';
    } catch {
      return true;
    }
  });

  useEffect(() => {
    const onComfortChanged = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (detail && typeof detail.enabled === 'boolean') {
        setEyeComfortActive(detail.enabled);
      }
    };
    window.addEventListener('fatteshha:eye-comfort-changed', onComfortChanged);
    return () => window.removeEventListener('fatteshha:eye-comfort-changed', onComfortChanged);
  }, []);

  const toggleGlobalEyeComfort = () => {
    sounds.playTap();
    const next = !eyeComfortActive;
    setEyeComfortActive(next);
    try {
      localStorage.setItem('fatteshha_eye_comfort_mode', next ? '1' : '0');
      window.dispatchEvent(
        new CustomEvent('fatteshha:eye-comfort-changed', {
          detail: { enabled: next }
        })
      );
    } catch {
      // ignore
    }
  };

  const togglePaperMode = (usePaper: boolean) => {
    sounds.playTap();
    setPaperMode(usePaper);
    try {
      localStorage.setItem('fatteshha_board_comfort_mode', usePaper ? 'paper' : 'dark');
      if (!usePaper && eyeComfortActive) {
        setEyeComfortActive(false);
        localStorage.setItem('fatteshha_eye_comfort_mode', '0');
        window.dispatchEvent(
          new CustomEvent('fatteshha:eye-comfort-changed', {
            detail: { enabled: false }
          })
        );
      }
    } catch {
      // ignore
    }
  };

  const toggleCellNumbers = () => {
    sounds.playTap();
    setShowCellNumbers(prev => {
      const next = !prev;
      try {
        localStorage.setItem('fatteshha_board_show_numbers', next ? '1' : '0');
      } catch {
        // ignore
      }
      return next;
    });
  };
  const [isDragging, setIsDragging] = useState(false);
  const [startCell, setStartCell] = useState<{ row: number; col: number } | null>(null);
  const [currentPath, setCurrentPath] = useState<{ row: number; col: number }[]>([]);

  // Synchronous refs so high-frequency iOS touchmove/pointermove events never read stale state
  const isDraggingRef = useRef(false);
  const startCellRef = useRef<{ row: number; col: number } | null>(null);
  const currentPathRef = useRef<{ row: number; col: number }[]>([]);
  const lastHoverKeyRef = useRef<string>('');
  const tapAnchorRef = useRef<{ row: number; col: number } | null>(null);
  const tapAnchorTimerRef = useRef<number | null>(null);
  const localFoundCellsMapRef = useRef<Map<string, { row: number; col: number }[]>>(new Map());

  const clearTapAnchor = useCallback(() => {
    if (tapAnchorTimerRef.current !== null) {
      window.clearTimeout(tapAnchorTimerRef.current);
      tapAnchorTimerRef.current = null;
    }
    tapAnchorRef.current = null;
  }, []);

  const setTapAnchor = useCallback((cell: { row: number; col: number } | null) => {
    if (tapAnchorTimerRef.current !== null) {
      window.clearTimeout(tapAnchorTimerRef.current);
      tapAnchorTimerRef.current = null;
    }
    tapAnchorRef.current = cell;
    // In TV mode, never expire the first-letter anchor on a short timer because moving a TV cursor takes several seconds.
    // In standard mode, allow a generous 12-second window for 2-tap selection.
    if (cell && !tvMode) {
      tapAnchorTimerRef.current = window.setTimeout(() => {
        tapAnchorRef.current = null;
        tapAnchorTimerRef.current = null;
      }, 12000);
    }
  }, [tvMode]);

  useEffect(() => {
    return () => {
      if (tapAnchorTimerRef.current !== null) {
        window.clearTimeout(tapAnchorTimerRef.current);
      }
    };
  }, []);

  // TV remote navigation coordinates
  const [tvFocus, setTvFocus] = useState<{ row: number; col: number }>({ row: 0, col: 0 });
  const [tvSelecting, setTvSelecting] = useState(false);

  const boardRef = useRef<HTMLDivElement>(null);

  // Reset active selection when board words or foundWords reset
  useEffect(() => {
    isDraggingRef.current = false;
    startCellRef.current = null;
    currentPathRef.current = [];
    clearTapAnchor();
    lastHoverKeyRef.current = '';
    localFoundCellsMapRef.current.clear();
    setIsDragging(false);
    setTvSelecting(false);
    setStartCell(null);
    setCurrentPath([]);
  }, [grid, gridSize, clearTapAnchor]);

  // Map of cells already found and their colors
  const cellColorMap = React.useMemo(() => {
    const map = new Map<string, string>();
    wordPlacements.forEach(placement => {
      if (foundWords.includes(placement.word)) {
        const color = playerColorMap[placement.word] || placement.color;
        const norm = normalizeArabicWord(placement.word);
        const customCells =
          localFoundCellsMapRef.current.get(placement.word) ||
          localFoundCellsMapRef.current.get(norm);
        const cellsToHighlight =
          customCells && customCells.length >= 2 ? customCells : placement.cells;
        if (Array.isArray(cellsToHighlight)) {
          cellsToHighlight.forEach(c => {
            map.set(`${c.row},${c.col}`, color);
          });
        }
      }
    });
    return map;
  }, [wordPlacements, foundWords, playerColorMap]);

  // Set of cells belonging to any remaining unfound word (used when dimUnusedCells === true)
  const activeWordCellsSet = React.useMemo(() => {
    const set = new Set<string>();
    wordPlacements.forEach(placement => {
      if (!foundWords.includes(placement.word)) {
        placement.cells.forEach(c => {
          set.add(`${c.row},${c.col}`);
        });
      }
    });
    return set;
  }, [wordPlacements, foundWords]);

  // Map of cells revealed by SINGLE_LETTER or WORD_START hints
  const revealedCellMap = React.useMemo(() => {
    const map = new Map<string, string>();
    revealedCells.forEach(rc => {
      const key = `${rc.row},${rc.col}`;
      if (!cellColorMap.has(key)) {
        map.set(key, rc.label || '💡');
      }
    });
    return map;
  }, [revealedCells, cellColorMap]);

  // Map of cells belonging to the active Hint word placement (cellKey -> 0-based letter index in word)
  const hintCellIndexMap = React.useMemo(() => {
    const map = new Map<string, number>();
    if (hintPlacement && !foundWords.includes(hintPlacement.word)) {
      hintPlacement.cells.forEach((c, idx) => {
        map.set(`${c.row},${c.col}`, idx);
      });
    } else if (hintCell) {
      map.set(`${hintCell.row},${hintCell.col}`, 0);
    }
    return map;
  }, [hintPlacement, hintCell, foundWords]);

  // Check whether a candidate path is a COMPLETE target word, a valid partial PREFIX of a target word, or NONE.
  // This enables both 2-Click selection (First letter -> Last letter) AND Step-by-Step clicking (Letter 1 -> Letter 2 -> Letter 3...) on TV!
  const inspectPathMatch = useCallback(
    (candidatePath: { row: number; col: number }[]): 'COMPLETE' | 'PREFIX' | 'NONE' => {
      if (!candidatePath || candidatePath.length < 2) return 'NONE';
      const rawFwd = getStringFromCells(grid, candidatePath);
      const rawRev = getStringFromCells(grid, [...candidatePath].reverse());
      const normFwd = normalizeArabicWord(rawFwd);
      const normRev = normalizeArabicWord(rawRev);

      const isComplete = wordPlacements.some(p => {
        const pw = normalizeArabicWord(p.word);
        const pd = normalizeArabicWord(p.displayWord || p.word);
        return (
          p.word === rawFwd ||
          p.word === rawRev ||
          pw === normFwd ||
          pw === normRev ||
          pd === normFwd ||
          pd === normRev
        );
      });
      if (isComplete) return 'COMPLETE';

      const isPrefix = wordPlacements.some(p => {
        if (foundWords.includes(p.word)) return false;
        const pw = normalizeArabicWord(p.word);
        const pd = normalizeArabicWord(p.displayWord || p.word);
        if (candidatePath.length < pw.length) {
          if (
            pw.startsWith(normFwd) ||
            pw.startsWith(normRev) ||
            pw.endsWith(normFwd) ||
            pw.endsWith(normRev) ||
            pd.startsWith(normFwd) ||
            pd.startsWith(normRev)
          ) {
            return true;
          }
        }
        // Also check exact cell coordinates prefix (forward or backward) along placement.cells
        if (Array.isArray(p.cells) && candidatePath.length < p.cells.length) {
          const matchesFwdCells = candidatePath.every(
            (c, idx) => p.cells[idx]?.row === c.row && p.cells[idx]?.col === c.col
          );
          const revCells = [...p.cells].reverse();
          const matchesRevCells = candidatePath.every(
            (c, idx) => revCells[idx]?.row === c.row && revCells[idx]?.col === c.col
          );
          if (matchesFwdCells || matchesRevCells) return true;
        }
        return false;
      });

      return isPrefix ? 'PREFIX' : 'NONE';
    },
    [grid, wordPlacements, foundWords]
  );

  // Handle cell selection submit
  const finishSelection = useCallback((path: { row: number; col: number }[]) => {
    onSelectionDrag?.([]);
    if (path.length < 2) {
      currentPathRef.current = [];
      startCellRef.current = null;
      setCurrentPath([]);
      setStartCell(null);
      return;
    }

    const matchPathAgainstPlacements = (candidatePath: { row: number; col: number }[]) => {
      const rawFwd = getStringFromCells(grid, candidatePath);
      const rawRev = getStringFromCells(grid, [...candidatePath].reverse());
      const normFwd = normalizeArabicWord(rawFwd);
      const normRev = normalizeArabicWord(rawRev);

      const found = wordPlacements.find(p => {
        const pw = normalizeArabicWord(p.word);
        const pd = normalizeArabicWord(p.displayWord || p.word);
        return (
          p.word === rawFwd ||
          p.word === rawRev ||
          pw === normFwd ||
          pw === normRev ||
          pd === normFwd ||
          pd === normRev
        );
      });
      if (!found) return null;
      // Ensure path orientation matches forward word order if reversed
      const isReverseMatch =
        found.word === rawRev ||
        normalizeArabicWord(found.word) === normRev ||
        normalizeArabicWord(found.displayWord || found.word) === normRev;
      return {
        placement: found,
        resolvedPath:
          isReverseMatch && normalizeArabicWord(found.word) !== normFwd
            ? [...candidatePath].reverse()
            : candidatePath
      };
    };

    let matchResult = matchPathAgainstPlacements(path);

    // Tolerance fallback: if player dragged across a word and their finger lifted 1 cell off at the end or start
    if (!matchResult && path.length >= 2) {
      const first = path[0];
      const last = path[path.length - 1];
      const neighborOffsets = [
        [-1, -1], [-1, 0], [-1, 1],
        [0, -1],           [0, 1],
        [1, -1],  [1, 0],  [1, 1]
      ];
      for (const [dr, dc] of neighborOffsets) {
        const altLastR = last.row + dr;
        const altLastC = last.col + dc;
        if (altLastR >= 0 && altLastR < gridSize && altLastC >= 0 && altLastC < gridSize) {
          const altLine = getLineBetweenCells(first.row, first.col, altLastR, altLastC);
          if (altLine && altLine.length >= 2) {
            const candidate = matchPathAgainstPlacements(altLine);
            if (candidate && !foundWords.includes(candidate.placement.word)) {
              matchResult = candidate;
              break;
            }
          }
        }
      }
    }

    if (matchResult) {
      const cleanWord = matchResult.placement.word;
      const normWord = normalizeArabicWord(cleanWord);
      localFoundCellsMapRef.current.set(cleanWord, matchResult.resolvedPath);
      localFoundCellsMapRef.current.set(normWord, matchResult.resolvedPath);
      clearTapAnchor();
      setTvSelecting(false);
      onWordSelected(matchResult.placement.word, matchResult.resolvedPath);
    } else {
      sounds.playError();
      onWordMistake?.();
    }

    currentPathRef.current = [];
    startCellRef.current = null;
    clearTapAnchor();
    setTvSelecting(false);
    lastHoverKeyRef.current = '';
    setCurrentPath([]);
    setStartCell(null);
  }, [grid, gridSize, wordPlacements, foundWords, onWordSelected, onWordMistake, onSelectionDrag, clearTapAnchor]);

  // Resolve (row, col) from screen (clientX, clientY) for iPhone / iOS Safari / Android touch & mouse
  const resolveCellFromClientPoint = useCallback((clientX: number, clientY: number): { row: number; col: number } | null => {
    if (typeof document === 'undefined') return null;

    // 1. Direct DOM hit-test via data-cell-row & data-cell-col
    const hitEl = document.elementFromPoint(clientX, clientY);
    if (hitEl) {
      const cellEl = hitEl.closest('[data-cell-row][data-cell-col]') as HTMLElement | null;
      if (cellEl) {
        const r = Number(cellEl.getAttribute('data-cell-row'));
        const c = Number(cellEl.getAttribute('data-cell-col'));
        if (Number.isInteger(r) && Number.isInteger(c) && r >= 0 && r < gridSize && c >= 0 && c < gridSize) {
          return { row: r, col: c };
        }
      }
    }

    // 2. Geometric fallback when finger is over the gap between tiles inside the grid
    const boardEl = boardRef.current;
    if (!boardEl) return null;
    const rect = boardEl.getBoundingClientRect();
    if (
      clientX < rect.left - 8 ||
      clientX > rect.right + 8 ||
      clientY < rect.top - 8 ||
      clientY > rect.bottom + 8
    ) {
      return null;
    }

    const computedStyle = window.getComputedStyle(boardEl);
    const padLeft = parseFloat(computedStyle.paddingLeft) || 12;
    const padRight = parseFloat(computedStyle.paddingRight) || 12;
    const padTop = parseFloat(computedStyle.paddingTop) || 12;
    const padBottom = parseFloat(computedStyle.paddingBottom) || 12;
    const isRtl = computedStyle.direction === 'rtl';

    const innerWidth = Math.max(1, rect.width - padLeft - padRight);
    const innerHeight = Math.max(1, rect.height - padTop - padBottom);

    const relX = Math.max(0, Math.min(innerWidth - 0.01, clientX - rect.left - padLeft));
    const relY = Math.max(0, Math.min(innerHeight - 0.01, clientY - rect.top - padTop));

    const rawCol = Math.floor((relX / innerWidth) * gridSize);
    const row = Math.max(0, Math.min(gridSize - 1, Math.floor((relY / innerHeight) * gridSize)));
    const col = isRtl
      ? Math.max(0, Math.min(gridSize - 1, gridSize - 1 - rawCol))
      : Math.max(0, Math.min(gridSize - 1, rawCol));

    return { row, col };
  }, [gridSize]);

  const touchDownCellRef = useRef<{ row: number; col: number } | null>(null);
  const usedTapAnchorRef = useRef(false);

  // Start selection on a cell
  const beginCellSelection = useCallback((row: number, col: number) => {
    if (isBoardFrozen) {
      sounds.playError();
      return;
    }

    touchDownCellRef.current = { row, col };
    if (tvMode) {
      setTvFocus({ row, col });
    }

    // If user previously tapped/clicked a start cell and now clicks another cell,
    // form the snapped line between them so both 2-Click (first -> last) and Step-by-Step clicking work seamlessly!
    if (tapAnchorRef.current && (tapAnchorRef.current.row !== row || tapAnchorRef.current.col !== col)) {
      const anchor = tapAnchorRef.current;
      const lineFromAnchor = getSnappedLineBetweenCells(anchor.row, anchor.col, row, col, gridSize);
      if (lineFromAnchor && lineFromAnchor.length >= 2) {
        sounds.playTap();
        usedTapAnchorRef.current = true;
        isDraggingRef.current = true;
        startCellRef.current = anchor;
        currentPathRef.current = lineFromAnchor;
        lastHoverKeyRef.current = `${row},${col}`;
        setIsDragging(true);
        setStartCell(anchor);
        setCurrentPath(lineFromAnchor);
        onSelectionDrag?.(lineFromAnchor);
        return;
      }
    }

    sounds.playTap();
    usedTapAnchorRef.current = false;
    clearTapAnchor();
    const start = { row, col };
    const nextPath = [start];
    isDraggingRef.current = true;
    startCellRef.current = start;
    currentPathRef.current = nextPath;
    lastHoverKeyRef.current = `${row},${col}`;
    setIsDragging(true);
    setTvSelecting(true);
    setStartCell(start);
    setCurrentPath(nextPath);
    onSelectionDrag?.(nextPath);
  }, [isBoardFrozen, gridSize, tvMode, onSelectionDrag, clearTapAnchor]);

  // Extend selection as finger/cursor moves to (row, col)
  const updateCellSelection = useCallback((row: number, col: number) => {
    if (isBoardFrozen) return;
    if (tvMode) {
      setTvFocus({ row, col });
    }

    // In TV mode (when player clicked the first letter and is moving the TV pointer without holding the button down),
    // show a live visual preview ONLY if they are not doing step-by-step clicking, by keeping tapAnchorRef intact.
    if (!isDraggingRef.current || !startCellRef.current) return;

    const key = `${row},${col}`;
    if (lastHoverKeyRef.current === key) return;

    // If the user is actively dragging from the newly touched cell rather than completing a 2-tap,
    // switch the drag origin to the cell where this touch started
    if (
      usedTapAnchorRef.current &&
      touchDownCellRef.current &&
      (touchDownCellRef.current.row !== row || touchDownCellRef.current.col !== col)
    ) {
      usedTapAnchorRef.current = false;
      clearTapAnchor();
      startCellRef.current = touchDownCellRef.current;
      setStartCell(touchDownCellRef.current);
    }

    const origin = startCellRef.current;
    const line = getSnappedLineBetweenCells(origin.row, origin.col, row, col, gridSize);
    if (line) {
      lastHoverKeyRef.current = key;
      clearTapAnchor();
      currentPathRef.current = line;
      setCurrentPath(line);
      onSelectionDrag?.(line);
      sounds.playTap();
    }
  }, [isBoardFrozen, gridSize, tvMode, onSelectionDrag, clearTapAnchor]);

  // Complete selection when finger/mouse/TV-remote button is lifted
  const endCellSelection = useCallback(() => {
    if (!isDraggingRef.current) return;
    const wasTapAnchorExtension = usedTapAnchorRef.current;
    const clickedCell = touchDownCellRef.current;
    isDraggingRef.current = false;
    usedTapAnchorRef.current = false;
    setIsDragging(false);

    if (isBoardFrozen) {
      currentPathRef.current = [];
      startCellRef.current = null;
      clearTapAnchor();
      setTvSelecting(false);
      setCurrentPath([]);
      setStartCell(null);
      return;
    }

    const activePath = currentPathRef.current;
    if (activePath.length >= 2) {
      if (wasTapAnchorExtension) {
        const matchState = inspectPathMatch(activePath);
        if (matchState === 'COMPLETE') {
          clearTapAnchor();
          finishSelection(activePath);
          return;
        }
        if (matchState === 'PREFIX') {
          // Player is clicking letters one by one (Letter 1 -> Letter 2 -> Letter 3...)!
          // Keep the anchor at the first letter and keep the partial word highlighted so they can click the next letter.
          setTapAnchor(activePath[0]);
          startCellRef.current = activePath[0];
          setStartCell(activePath[0]);
          setTvSelecting(true);
          return;
        }
        if (tvMode && clickedCell) {
          // In TV mode, if the newly clicked cell didn't match a word with the previous anchor,
          // treat the newly clicked cell as a fresh start letter instead of throwing a mistake error!
          setTapAnchor(clickedCell);
          startCellRef.current = clickedCell;
          currentPathRef.current = [clickedCell];
          setStartCell(clickedCell);
          setCurrentPath([clickedCell]);
          setTvSelecting(true);
          onSelectionDrag?.([clickedCell]);
          return;
        }
      }
      clearTapAnchor();
      finishSelection(activePath);
    } else if (activePath.length === 1) {
      // Keep the single tapped cell highlighted as a tap-anchor
      setTapAnchor(activePath[0]);
      setTvSelecting(true);
    } else {
      clearTapAnchor();
      setTvSelecting(false);
      onSelectionDrag?.([]);
    }
  }, [isBoardFrozen, tvMode, inspectPathMatch, finishSelection, onSelectionDrag, clearTapAnchor, setTapAnchor]);

  // Pointer event handlers for desktop, Smart TV browsers & modern pointer browsers
  const handleCellPointerDown = (e: React.PointerEvent<HTMLDivElement>, row: number, col: number) => {
    // Blur any active top-bar button so TV remote Enter/OK keys go to the board instead of toggling buttons
    if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
      document.activeElement.blur();
    }
    // Release implicit iOS/WebKit touch pointer capture so pointermove/elementFromPoint works freely across cells
    try {
      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore if not captured
    }
    if (e.pointerType === 'touch' && isDraggingRef.current) {
      return;
    }
    beginCellSelection(row, col);
  };

  const handleBoardPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    const cell = resolveCellFromClientPoint(e.clientX, e.clientY);
    if (cell) {
      updateCellSelection(cell.row, cell.col);
    }
  };

  // Native non-passive Touch listeners on the grid container for iPhone / iOS Safari
  useEffect(() => {
    const boardEl = boardRef.current;
    if (!boardEl) return;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      if (e.cancelable) e.preventDefault();
      const touch = e.touches[0];
      const cell = resolveCellFromClientPoint(touch.clientX, touch.clientY);
      if (cell && !isDraggingRef.current) {
        beginCellSelection(cell.row, cell.col);
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!isDraggingRef.current || e.touches.length === 0) return;
      if (e.cancelable) e.preventDefault();
      const touch = e.touches[0];
      const cell = resolveCellFromClientPoint(touch.clientX, touch.clientY);
      if (cell) {
        updateCellSelection(cell.row, cell.col);
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!isDraggingRef.current) return;
      if (e.cancelable) e.preventDefault();
      endCellSelection();
    };

    boardEl.addEventListener('touchstart', onTouchStart, { passive: false });
    boardEl.addEventListener('touchmove', onTouchMove, { passive: false });
    boardEl.addEventListener('touchend', onTouchEnd, { passive: false });
    boardEl.addEventListener('touchcancel', onTouchEnd, { passive: false });

    const onWindowPointerUp = () => {
      if (isDraggingRef.current) {
        endCellSelection();
      }
    };
    window.addEventListener('pointerup', onWindowPointerUp);
    window.addEventListener('pointercancel', onWindowPointerUp);

    return () => {
      boardEl.removeEventListener('touchstart', onTouchStart);
      boardEl.removeEventListener('touchmove', onTouchMove);
      boardEl.removeEventListener('touchend', onTouchEnd);
      boardEl.removeEventListener('touchcancel', onTouchEnd);
      window.removeEventListener('pointerup', onWindowPointerUp);
      window.removeEventListener('pointercancel', onWindowPointerUp);
    };
  }, [resolveCellFromClientPoint, beginCellSelection, updateCellSelection, endCellSelection]);

  // Keyboard / Smart TV Remote Navigation (D-Pad Arrows + OK/Enter/Select)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input or textarea
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }

      const { row, col } = tvFocus;
      const isOkKey =
        e.key === 'Enter' ||
        e.key === ' ' ||
        e.key === 'Select' ||
        e.key === 'OK' ||
        e.keyCode === 13 ||
        e.keyCode === 23;

      if (e.key === 'ArrowUp' || e.key === 'Up') {
        e.preventDefault();
        sounds.playTick();
        const newR = Math.max(0, row - 1);
        setTvFocus({ row: newR, col });
        const anchor = startCell || tapAnchorRef.current;
        if ((tvSelecting || tapAnchorRef.current) && anchor) {
          const line = getSnappedLineBetweenCells(anchor.row, anchor.col, newR, col, gridSize);
          if (line) {
            currentPathRef.current = line;
            setCurrentPath(line);
          }
        }
      } else if (e.key === 'ArrowDown' || e.key === 'Down') {
        e.preventDefault();
        sounds.playTick();
        const newR = Math.min(gridSize - 1, row + 1);
        setTvFocus({ row: newR, col });
        const anchor = startCell || tapAnchorRef.current;
        if ((tvSelecting || tapAnchorRef.current) && anchor) {
          const line = getSnappedLineBetweenCells(anchor.row, anchor.col, newR, col, gridSize);
          if (line) {
            currentPathRef.current = line;
            setCurrentPath(line);
          }
        }
      } else if (e.key === 'ArrowRight' || e.key === 'Right') {
        // Note: Board is RTL (dir="rtl"), so column 0 is on the RIGHT and column (gridSize - 1) is on the LEFT!
        e.preventDefault();
        sounds.playTick();
        const newC = Math.max(0, col - 1);
        setTvFocus({ row, col: newC });
        const anchor = startCell || tapAnchorRef.current;
        if ((tvSelecting || tapAnchorRef.current) && anchor) {
          const line = getSnappedLineBetweenCells(anchor.row, anchor.col, row, newC, gridSize);
          if (line) {
            currentPathRef.current = line;
            setCurrentPath(line);
          }
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'Left') {
        // In RTL, moving LEFT increases column index toward (gridSize - 1)
        e.preventDefault();
        sounds.playTick();
        const newC = Math.min(gridSize - 1, col + 1);
        setTvFocus({ row, col: newC });
        const anchor = startCell || tapAnchorRef.current;
        if ((tvSelecting || tapAnchorRef.current) && anchor) {
          const line = getSnappedLineBetweenCells(anchor.row, anchor.col, row, newC, gridSize);
          if (line) {
            currentPathRef.current = line;
            setCurrentPath(line);
          }
        }
      } else if (isOkKey) {
        e.preventDefault();
        if (target && target.tagName === 'BUTTON') {
          target.blur();
        }
        const anchor = startCell || tapAnchorRef.current;
        if (!tvSelecting || !anchor) {
          sounds.playTap();
          const start = { row, col };
          setTvSelecting(true);
          setTapAnchor(start);
          startCellRef.current = start;
          currentPathRef.current = [start];
          setStartCell(start);
          setCurrentPath([start]);
        } else if (anchor.row === row && anchor.col === col && currentPath.length <= 1) {
          // Pressing OK again on the exact same starting cell cancels the anchor
          sounds.playTap();
          clearTapAnchor();
          setTvSelecting(false);
          startCellRef.current = null;
          currentPathRef.current = [];
          setStartCell(null);
          setCurrentPath([]);
        } else {
          const candidateLine =
            getSnappedLineBetweenCells(anchor.row, anchor.col, row, col, gridSize) || currentPath;
          const matchState = inspectPathMatch(candidateLine);
          if (matchState === 'COMPLETE') {
            clearTapAnchor();
            setTvSelecting(false);
            finishSelection(candidateLine);
          } else if (matchState === 'PREFIX') {
            // Player pressed OK on the 2nd/3rd letter of the word step-by-step: keep selection active!
            sounds.playTap();
            setTapAnchor(anchor);
            currentPathRef.current = candidateLine;
            setCurrentPath(candidateLine);
          } else if (candidateLine.length >= 2) {
            clearTapAnchor();
            setTvSelecting(false);
            finishSelection(candidateLine);
          }
        }
      } else if (e.key === 'Escape' || e.key === 'Backspace' || e.key === 'GoBack') {
        if (tvSelecting || tapAnchorRef.current) {
          e.preventDefault();
          sounds.playTap();
          clearTapAnchor();
          setTvSelecting(false);
          startCellRef.current = null;
          currentPathRef.current = [];
          setStartCell(null);
          setCurrentPath([]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tvFocus, tvSelecting, startCell, currentPath, gridSize, inspectPathMatch, finishSelection, setTapAnchor, clearTapAnchor]);

  // Is cell currently in the drag path?
  const isInCurrentPath = (r: number, c: number) => {
    return currentPath.some(cell => cell.row === r && cell.col === c);
  };

  // Is cell currently in opponent's live drag path?
  const isInOpponentPath = (r: number, c: number) => {
    return opponentPath.some(cell => cell.row === r && cell.col === c);
  };

  // Determine cell classes & styles matching طاوله اللعب.png
  const getCellClasses = (r: number, c: number) => {
    const key = `${r},${c}`;
    const isSelected = isInCurrentPath(r, c);
    const isOpponentScanning = isInOpponentPath(r, c);
    const isTvFocused = tvMode && tvFocus.row === r && tvFocus.col === c;
    const hintIdx = hintCellIndexMap.get(key);
    const isHint = hintIdx !== undefined;
    const isRevealedHint = revealedCellMap.has(key);
    const foundColor = cellColorMap.get(key);
    const isUnusedDimmed = dimUnusedCells && !foundColor && !activeWordCellsSet.has(key);

    let base =
      'relative flex flex-col items-center justify-center font-bold select-none cursor-pointer transition-transform transition-colors duration-150 rounded-xl touch-none leading-none ';

    // Generous proportional tile sizing so letters have clear breathing room on iPhone & Desktop
    if (gridSize <= 8) {
      base += 'text-xl sm:text-2xl md:text-[26px] w-full aspect-square min-h-[40px] ';
    } else if (gridSize <= 10) {
      base += 'text-[17px] sm:text-xl md:text-2xl w-full aspect-[1/1.04] min-h-[34px] ';
    } else {
      base += 'text-[14px] sm:text-lg md:text-xl w-full aspect-[1/1.05] min-h-[29px] ';
    }

    if (isSelected) {
      base += `${activeTrailStyle.selectedTextClass} scale-[1.03] z-10 font-extrabold `;
    } else if (isHint || isRevealedHint) {
      base += 'text-slate-950 font-extrabold z-20 ring-2 ring-amber-400 ';
    } else if (foundColor) {
      base += 'text-white font-bold ';
    } else if (isUnusedDimmed) {
      base += paperMode ? 'text-slate-400 opacity-30 scale-95 ' : 'text-slate-500 opacity-30 scale-95 ';
    } else {
      base += paperMode
        ? 'text-slate-800 hover:brightness-95 '
        : 'text-[#eef2f7] hover:brightness-105 ';
    }

    if (isOpponentScanning && !isSelected) {
      base += 'ring-2 ring-pink-400/80 scale-[1.03] z-10 ';
    }

    if (isTvFocused) {
      base += 'tv-focused z-20 ring-2 ring-amber-400 ';
    }

    return base;
  };

  const lastPointerDownTsRef = useRef<number>(0);

  const handleCellClick = (rIdx: number, cIdx: number) => {
    // Fallback for Smart TV browsers (WebOS / Tizen / Android TV spatial navigation)
    // that dispatch synthetic 'click' on remote OK press without pointerdown/pointerup
    if (Date.now() - lastPointerDownTsRef.current < 450) {
      return;
    }
    beginCellSelection(rIdx, cIdx);
    endCellSelection();
  };

  const activeHintWordLabel =
    hintPlacement && !foundWords.includes(hintPlacement.word) ? hintPlacement.displayWord : null;
  const currentSelectedText = currentPath.length > 0 ? getStringFromCells(grid, currentPath) : '';

  return (
    <div
      className="w-full flex flex-col items-center justify-center select-none relative touch-none"
      onPointerUp={endCellSelection}
    >
      {/* Eye-Comfort Display Controls (Global Eye Comfort Warmth + Calm Matte Dark / Warm Paper Light + Numbers Toggle) */}
      <div
        className="w-full max-w-[min(96vw,540px)] flex flex-wrap items-center justify-between gap-1.5 mb-2 px-1"
        dir="rtl"
      >
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-slate-300">
          <button
            type="button"
            onClick={toggleGlobalEyeComfort}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
              eyeComfortActive
                ? 'bg-amber-500/25 border-amber-400/70 text-amber-200'
                : 'bg-slate-900/85 border-slate-700/75 text-slate-300 hover:text-white'
            }`}
            title="تعديل حرارة الألوان لدرجات أدفأ وتقليل سطوع الخلفية للعب الطويل"
          >
            <Eye className={`w-3.5 h-3.5 ${eyeComfortActive ? 'text-amber-300' : 'text-emerald-400'}`} />
            <span>{eyeComfortActive ? 'وضع الراحة البصرية: مفعّل' : 'وضع الراحة البصرية'}</span>
          </button>

          <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-900/85 border border-slate-700/70">
            <button
              type="button"
              onClick={() => togglePaperMode(false)}
              className={`px-2 py-1 rounded-md text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap ${
                !paperMode
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Moon className="w-3 h-3" />
              <span>داكن هادئ</span>
            </button>
            <button
              type="button"
              onClick={() => togglePaperMode(true)}
              className={`px-2 py-1 rounded-md text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap ${
                paperMode
                  ? 'bg-[#f5f0e1] text-slate-900'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sun className="w-3 h-3" />
              <span>ورقي فاتح</span>
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={toggleCellNumbers}
          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap ${
            showCellNumbers
              ? 'bg-slate-900/80 border-slate-700/80 text-slate-300 hover:text-white'
              : 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
          }`}
        >
          <Hash className="w-3 h-3" />
          <span>{showCellNumbers ? 'إخفاء الأرقام' : 'إظهار الأرقام'}</span>
        </button>
      </div>

      {/* TV Mode Selection Helper & Live Selected Letters Bar */}
      {tvMode && (
        <div
          className="w-full max-w-[min(96vw,540px)] mb-2 px-3 py-2 rounded-2xl bg-slate-900/90 border border-amber-400/50 text-xs font-bold text-slate-200 flex flex-wrap items-center justify-between gap-2 shadow-md"
          dir="rtl"
        >
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-lg bg-amber-400 text-slate-950 font-black text-[11px]">
              📺 تحكم التلفزيون
            </span>
            {currentSelectedText ? (
              <span className="text-amber-300 font-black text-sm">
                الحروف المحددة: «{currentSelectedText}»
              </span>
            ) : (
              <span className="text-slate-300 text-[11px]">
                اضغط على <strong className="text-amber-300">أول حرف</strong> ثم <strong className="text-amber-300">آخر حرف</strong> من الكلمة (أو حرفاً تلو الآخر)
              </span>
            )}
          </div>
          {currentPath.length > 0 && (
            <div className="flex items-center gap-1.5">
              {currentPath.length >= 2 && (
                <button
                  type="button"
                  onClick={() => {
                    clearTapAnchor();
                    setTvSelecting(false);
                    finishSelection(currentPath);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-[11px] cursor-pointer"
                >
                  تأكيد الكلمة ✓
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  clearTapAnchor();
                  setTvSelecting(false);
                  startCellRef.current = null;
                  currentPathRef.current = [];
                  setStartCell(null);
                  setCurrentPath([]);
                }}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-rose-300 border border-rose-500/30 font-black text-[11px] cursor-pointer"
              >
                إلغاء التحديد ✕
              </button>
            </div>
          )}
        </div>
      )}

      {/* Floating Hint Reveal Banner when Hint is triggered */}
      {activeHintWordLabel && (
        <div
          className="mb-2.5 px-5 py-2 rounded-2xl border-2 border-amber-300/90 bg-slate-950/95 text-white shadow-[0_0_28px_rgba(251,191,36,0.55)] flex flex-col items-center gap-1.5 z-30 animate-in zoom-in-95 duration-200"
          dir="rtl"
        >
          <div className="flex items-center gap-2 text-xs sm:text-sm font-black">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-400 text-slate-950 font-black shadow">
              💡
            </span>
            <span className="text-amber-300">كشف التلميح المؤقت:</span>
            <span className="px-2.5 py-0.5 rounded-lg bg-gradient-to-r from-amber-400 to-cyan-400 text-slate-950 font-black">
              «{activeHintWordLabel}»
            </span>
            <span className="text-[11px] text-cyan-200 font-bold hidden sm:inline">
              (اسحب الحروف المرقمة من 1 بالترتيب!)
            </span>
          </div>
          <div className="w-full h-1 rounded-full bg-slate-800 overflow-hidden">
            <div className="h-full bg-gradient-to-l from-amber-400 via-lime-400 to-cyan-400 hint-timer-bar" />
          </div>
        </div>
      )}

      <div
        ref={boardRef}
        className="letter-grid w-full max-w-[min(96vw,540px)] p-2 sm:p-4 rounded-3xl relative overflow-hidden touch-none"
        onPointerMove={handleBoardPointerMove}
        onPointerUp={endCellSelection}
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))`,
          gap: gridSize > 10 ? '4px' : '6px',
          touchAction: 'none',
          WebkitUserSelect: 'none',
          userSelect: 'none',
          background: paperMode ? '#ebe4d3' : activeBoardTheme.boardBackground,
          border: isBoardFrozen
            ? '2px solid rgba(56, 189, 248, 0.85)'
            : isSandstormActive
            ? '2px solid rgba(245, 158, 11, 0.85)'
            : paperMode
            ? '1.5px solid #cfc5ae'
            : activeBoardTheme.boardBorder,
          boxShadow: isBoardFrozen
            ? '0 0 24px rgba(56, 189, 248, 0.35)'
            : paperMode
            ? '0 10px 26px rgba(15, 23, 42, 0.25)'
            : activeBoardTheme.boardShadow
        }}
      >
        {/* Battle Card Effect Overlay: Frozen Board (❄️ تجميد الخصم) */}
        {isBoardFrozen && (
          <div className="absolute inset-0 z-40 bg-cyan-950/70 backdrop-blur-[3px] flex flex-col items-center justify-center gap-2 text-center p-4 pointer-events-auto">
            <div className="text-5xl animate-bounce">❄️</div>
            <div className="px-4 py-1.5 rounded-full bg-cyan-400 text-slate-950 font-black text-sm shadow-lg">
              لوحتك متجمدة بفعل كرت الخصم!
            </div>
            <div className="text-xs font-black text-cyan-200 font-mono">
              ينفك التجميد خلال {frozenSeconds} ثانية...
            </div>
          </div>
        )}

        {/* Battle Card Effect Overlay: Kuwaiti Sandstorm (🌫️ عاصفة رملية) */}
        {isSandstormActive && !isBoardFrozen && (
          <div className="pointer-events-none absolute inset-x-0 top-2 z-30 flex justify-center">
            <span className="px-3 py-1 rounded-full bg-amber-500/90 text-slate-950 text-[11px] font-black shadow-lg animate-pulse">
              🌫️ عاصفة رملية على لوحتك! ({sandstormSeconds}ث)
            </span>
          </div>
        )}

        {grid.map((row, rIdx) =>
          row.map((letter, cIdx) => {
            const key = `${rIdx},${cIdx}`;
            const foundColor = cellColorMap.get(key);
            const isSelected = isInCurrentPath(rIdx, cIdx);
            const isOpponentScanning = isInOpponentPath(rIdx, cIdx);
            const hintIdx = hintCellIndexMap.get(key);
            const isHint = hintIdx !== undefined;
            const isHintStart = hintIdx === 0;
            const revealedBadge = revealedCellMap.get(key);
            const isRevealedHint = revealedBadge !== undefined;
            const isOpponentLeadCell =
              opponentPath.length > 0 &&
              opponentPath[opponentPath.length - 1].row === rIdx &&
              opponentPath[opponentPath.length - 1].col === cIdx;
            const isSandBlurred =
              isSandstormActive && !foundColor && !isSelected && (rIdx + cIdx) % 2 === 0;

            let cellStyle: React.CSSProperties;
            if (isSelected) {
              cellStyle = {
                background: activeTrailStyle.selectedBackground,
                border: activeTrailStyle.selectedBorder,
                boxShadow: '0 2px 6px rgba(15, 23, 42, 0.28)',
                touchAction: 'none',
                WebkitUserSelect: 'none'
              };
            } else if (isHint || isRevealedHint) {
              cellStyle = {
                background: isHintStart || isRevealedHint
                  ? 'linear-gradient(135deg, #fde047 0%, #f59e0b 100%)'
                  : 'linear-gradient(135deg, #67e8f9 0%, #38bdf8 55%, #facc15 100%)',
                border: '1.5px solid #ffffff',
                animationDelay: `${(hintIdx || 0) * 85}ms`,
                touchAction: 'none',
                WebkitUserSelect: 'none'
              };
            } else if (foundColor) {
              cellStyle = {
                backgroundColor: foundColor,
                border: paperMode
                  ? '1px solid rgba(15, 23, 42, 0.14)'
                  : '1px solid rgba(255, 255, 255, 0.22)',
                boxShadow: 'none',
                touchAction: 'none',
                WebkitUserSelect: 'none'
              };
            } else if (isOpponentScanning) {
              cellStyle = {
                backgroundColor: `${opponentColor}40`,
                border: `1.5px solid ${opponentColor}`,
                boxShadow: 'none',
                touchAction: 'none',
                WebkitUserSelect: 'none'
              };
            } else {
              cellStyle = paperMode
                ? {
                    background: '#fcfaf4',
                    border: '1px solid #dfd7c2',
                    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.06)',
                    touchAction: 'none',
                    WebkitUserSelect: 'none'
                  }
                : {
                    background: activeBoardTheme.cellBackground,
                    border: activeBoardTheme.cellBorder,
                    boxShadow: '0 1px 2px rgba(2, 6, 23, 0.25)',
                    touchAction: 'none',
                    WebkitUserSelect: 'none'
                  };
            }

              const cellNumber = rIdx * gridSize + cIdx + 1;

              return (
                <div
                  key={`${rIdx}-${cIdx}`}
                  data-cell-row={rIdx}
                  data-cell-col={cIdx}
                  className={`${getCellClasses(rIdx, cIdx)} ${isSandBlurred ? 'blur-[4px] opacity-45' : ''}`}
                  style={cellStyle}
                  onPointerDown={(e) => {
                    lastPointerDownTsRef.current = Date.now();
                    handleCellPointerDown(e, rIdx, cIdx);
                  }}
                  onPointerEnter={() => updateCellSelection(rIdx, cIdx)}
                  onClick={() => handleCellClick(rIdx, cIdx)}
                >
                  <span
                    className={`pointer-events-none leading-none font-bold ${
                      showCellNumbers ? 'pb-2 sm:pb-2.5' : ''
                    }`}
                  >
                    {letter}
                  </span>
                  {showCellNumbers && (
                    <span
                      dir="ltr"
                      className={`pointer-events-none absolute bottom-[2px] inset-x-0 text-center leading-none font-mono font-semibold tabular-nums ${
                        gridSize <= 8
                          ? 'text-[8.5px] sm:text-[9.5px]'
                          : gridSize <= 10
                          ? 'text-[7.5px] sm:text-[8.5px]'
                          : 'text-[6.5px] sm:text-[7.5px]'
                      } ${
                        isHint || isRevealedHint || isSelected
                          ? 'text-slate-900/75'
                          : foundColor
                          ? 'text-white/75'
                          : paperMode
                          ? 'text-slate-500/70'
                          : 'text-slate-400/60'
                      }`}
                    >
                      {cellNumber}
                    </span>
                  )}

                {/* Step badge during Hint Reveal so the player sees the exact letter order */}
                {isHint && (
                  <span
                    className={`pointer-events-none absolute -top-2 -right-1.5 px-1.5 py-0.2 rounded-full text-[9px] font-black shadow-md z-30 ${
                      isHintStart
                        ? 'bg-slate-950 text-amber-300 border border-amber-300'
                        : 'bg-slate-900/90 text-cyan-200 border border-cyan-300/60'
                    }`}
                  >
                    {isHintStart ? '1 • ابدأ' : (hintIdx || 0) + 1}
                  </span>
                )}

                {!isHint && isRevealedHint && (
                  <span className="pointer-events-none absolute -top-2 -right-1.5 px-1.5 py-0.2 rounded-full text-[8px] font-black shadow-md z-30 bg-slate-950 text-amber-300 border border-amber-300 whitespace-nowrap">
                    {revealedBadge}
                  </span>
                )}

                {isOpponentLeadCell && opponentName && (
                  <span
                    className="pointer-events-none absolute -top-2.5 -right-2 px-1 py-0.2 rounded text-[8px] font-black text-white shadow-md whitespace-nowrap z-30"
                    style={{ backgroundColor: opponentColor }}
                  >
                    {opponentName.split(' ')[0]}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
