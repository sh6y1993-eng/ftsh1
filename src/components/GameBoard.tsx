import React, { useState, useRef, useEffect, useCallback } from 'react';
import { WordPlacement } from '../types/game';
import { getLineBetweenCells, getStringFromCells } from '../engine/wordSearch';
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
  tvMode = false
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [startCell, setStartCell] = useState<{ row: number; col: number } | null>(null);
  const [currentPath, setCurrentPath] = useState<{ row: number; col: number }[]>([]);

  // TV remote navigation coordinates
  const [tvFocus, setTvFocus] = useState<{ row: number; col: number }>({ row: 0, col: 0 });
  const [tvSelecting, setTvSelecting] = useState(false);

  const boardRef = useRef<HTMLDivElement>(null);

  // Map of cells already found and their colors
  const cellColorMap = React.useMemo(() => {
    const map = new Map<string, string>();
    wordPlacements.forEach(placement => {
      if (foundWords.includes(placement.word)) {
        const color = playerColorMap[placement.word] || placement.color;
        placement.cells.forEach(c => {
          map.set(`${c.row},${c.col}`, color);
        });
      }
    });
    return map;
  }, [wordPlacements, foundWords, playerColorMap]);

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

  // Handle cell selection submit
  const finishSelection = useCallback((path: { row: number; col: number }[]) => {
    onSelectionDrag?.([]);
    if (path.length < 2) {
      setCurrentPath([]);
      setStartCell(null);
      return;
    }

    const wordForward = getStringFromCells(grid, path);
    const wordReverse = getStringFromCells(grid, [...path].reverse());

    // Check if either direction matches
    const matched = wordPlacements.find(
      p => (p.word === wordForward || p.word === wordReverse)
    );

    if (matched) {
      onWordSelected(matched.word, path);
    } else {
      sounds.playError();
      onWordMistake?.();
    }

    setCurrentPath([]);
    setStartCell(null);
  }, [grid, wordPlacements, onWordSelected, onWordMistake, onSelectionDrag]);

  // Pointer event handlers for touch and mouse dragging
  const handlePointerDown = (row: number, col: number) => {
    sounds.playTap();
    setIsDragging(true);
    setStartCell({ row, col });
    const nextPath = [{ row, col }];
    setCurrentPath(nextPath);
    onSelectionDrag?.(nextPath);
  };

  const handlePointerEnter = (row: number, col: number) => {
    if (!isDragging || !startCell) return;
    const line = getLineBetweenCells(startCell.row, startCell.col, row, col);
    if (line) {
      setCurrentPath(line);
      onSelectionDrag?.(line);
      sounds.playTap();
    }
  };

  const handlePointerUp = () => {
    if (isDragging && currentPath.length > 0) {
      finishSelection(currentPath);
    } else if (isDragging) {
      onSelectionDrag?.([]);
    }
    setIsDragging(false);
  };

  // Keyboard / TV Remote Navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const { row, col } = tvFocus;

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        sounds.playTick();
        const newR = Math.max(0, row - 1);
        setTvFocus({ row: newR, col });
        if (tvSelecting && startCell) {
          const line = getLineBetweenCells(startCell.row, startCell.col, newR, col);
          if (line) setCurrentPath(line);
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        sounds.playTick();
        const newR = Math.min(gridSize - 1, row + 1);
        setTvFocus({ row: newR, col });
        if (tvSelecting && startCell) {
          const line = getLineBetweenCells(startCell.row, startCell.col, newR, col);
          if (line) setCurrentPath(line);
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        sounds.playTick();
        const newC = Math.max(0, col - 1);
        setTvFocus({ row, col: newC });
        if (tvSelecting && startCell) {
          const line = getLineBetweenCells(startCell.row, startCell.col, row, newC);
          if (line) setCurrentPath(line);
        }
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        sounds.playTick();
        const newC = Math.min(gridSize - 1, col + 1);
        setTvFocus({ row, col: newC });
        if (tvSelecting && startCell) {
          const line = getLineBetweenCells(startCell.row, startCell.col, row, newC);
          if (line) setCurrentPath(line);
        }
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (!tvSelecting) {
          sounds.playTap();
          setTvSelecting(true);
          setStartCell({ row, col });
          setCurrentPath([{ row, col }]);
        } else {
          setTvSelecting(false);
          if (currentPath.length > 0) {
            finishSelection(currentPath);
          }
        }
      } else if (e.key === 'Escape' || e.key === 'Backspace') {
        if (tvSelecting) {
          e.preventDefault();
          sounds.playTap();
          setTvSelecting(false);
          setStartCell(null);
          setCurrentPath([]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tvFocus, tvSelecting, startCell, currentPath, gridSize, finishSelection]);

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
    const isSelected = isInCurrentPath(r, c);
    const isOpponentScanning = isInOpponentPath(r, c);
    const isTvFocused = tvMode && tvFocus.row === r && tvFocus.col === c;
    const hintIdx = hintCellIndexMap.get(`${r},${c}`);
    const isHint = hintIdx !== undefined;
    const foundColor = cellColorMap.get(`${r},${c}`);

    let base =
      'relative flex items-center justify-center font-extrabold select-none cursor-pointer transition-transform duration-100 rounded-xl ';

    // Wide beveled pill-tile sizing based on gridSize
    if (gridSize <= 8) {
      base += 'text-lg sm:text-xl md:text-2xl w-10 h-9 sm:w-14 sm:h-11 md:w-16 md:h-12 ';
    } else if (gridSize <= 10) {
      base += 'text-base sm:text-lg md:text-xl w-8 h-8 sm:w-12 sm:h-10 md:w-14 md:h-11 ';
    } else {
      base += 'text-sm sm:text-base md:text-lg w-7 h-7 sm:w-10 sm:h-9 md:w-11 md:h-9 ';
    }

    if (isSelected) {
      base += 'text-slate-950 scale-105 z-10 font-black ';
    } else if (isHint) {
      base += 'text-slate-950 font-black z-20 hint-word-reveal-cell ring-2 ring-amber-300 ';
    } else if (foundColor) {
      base += 'text-white font-black ';
    } else {
      base += 'text-white hover:brightness-110 ';
    }

    if (isOpponentScanning && !isSelected) {
      base += 'ring-2 ring-pink-400/90 scale-105 z-10 ';
    }

    if (isTvFocused) {
      base += 'tv-focused z-20 ring-2 ring-amber-400 ';
    }

    return base;
  };

  const activeHintWordLabel =
    hintPlacement && !foundWords.includes(hintPlacement.word) ? hintPlacement.displayWord : null;

  return (
    <div
      className="flex flex-col items-center justify-center select-none relative"
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
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
        className="letter-grid p-3 sm:p-5 rounded-3xl backdrop-blur-md relative"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))`,
          gap: gridSize > 10 ? '5px' : '7px',
          background: 'linear-gradient(180deg, rgba(8, 30, 48, 0.94) 0%, rgba(4, 15, 26, 0.97) 100%)',
          border: '2px solid rgba(56, 189, 248, 0.65)',
          boxShadow:
            '0 0 36px rgba(14, 165, 233, 0.28), inset 0 0 24px rgba(14, 165, 233, 0.14), inset 0 1px 1px rgba(255, 255, 255, 0.2)'
        }}
      >
        {grid.map((row, rIdx) =>
          row.map((letter, cIdx) => {
            const foundColor = cellColorMap.get(`${rIdx},${cIdx}`);
            const isSelected = isInCurrentPath(rIdx, cIdx);
            const isOpponentScanning = isInOpponentPath(rIdx, cIdx);
            const hintIdx = hintCellIndexMap.get(`${rIdx},${cIdx}`);
            const isHint = hintIdx !== undefined;
            const isHintStart = hintIdx === 0;
            const isOpponentLeadCell =
              opponentPath.length > 0 &&
              opponentPath[opponentPath.length - 1].row === rIdx &&
              opponentPath[opponentPath.length - 1].col === cIdx;

            let cellStyle: React.CSSProperties;
            if (isSelected) {
              cellStyle = {
                background: 'linear-gradient(180deg, #fbbf24 0%, #f59e0b 100%)',
                border: '1.5px solid #fef08a',
                boxShadow: '0 0 16px rgba(245, 158, 11, 0.6), inset 0 1px 1px rgba(255,255,255,0.5)'
              };
            } else if (isHint) {
              cellStyle = {
                background: isHintStart
                  ? 'linear-gradient(135deg, #fde047 0%, #f59e0b 100%)'
                  : 'linear-gradient(135deg, #67e8f9 0%, #38bdf8 55%, #facc15 100%)',
                border: '2px solid #ffffff',
                animationDelay: `${(hintIdx || 0) * 85}ms`
              };
            } else if (foundColor) {
              cellStyle = {
                backgroundColor: foundColor,
                border: '1.5px solid rgba(255, 255, 255, 0.45)',
                boxShadow: `0 0 14px ${foundColor}80, inset 0 1px 1px rgba(255, 255, 255, 0.35)`
              };
            } else if (isOpponentScanning) {
              cellStyle = {
                backgroundColor: `${opponentColor}55`,
                border: `1.5px solid ${opponentColor}`,
                boxShadow: `0 0 12px ${opponentColor}66`
              };
            } else {
              cellStyle = {
                background: 'linear-gradient(180deg, #163a59 0%, #0b2136 100%)',
                border: '1.5px solid rgba(125, 211, 252, 0.42)',
                boxShadow: '0 3px 6px rgba(0, 0, 0, 0.45), inset 0 1px 1px rgba(255, 255, 255, 0.22)'
              };
            }

            return (
              <div
                key={`${rIdx}-${cIdx}`}
                className={getCellClasses(rIdx, cIdx)}
                style={cellStyle}
                onPointerDown={() => handlePointerDown(rIdx, cIdx)}
                onPointerEnter={() => handlePointerEnter(rIdx, cIdx)}
              >
                <span className={isHint || isSelected ? 'drop-shadow-none font-black' : 'drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)]'}>
                  {letter}
                </span>

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
