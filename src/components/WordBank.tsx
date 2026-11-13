import React from 'react';
import { WordPlacement } from '../types/game';
import { Check, Zap, Lightbulb } from 'lucide-react';

interface WordBankProps {
  wordPlacements: WordPlacement[];
  foundWords: string[];
  playerColorMap?: Record<string, string>;
  playerNamesMap?: Record<string, string>;
  playerIdsMap?: Record<string, string>;
  currentPlayerId?: string;
  currentPlayerName?: string;
  hintWord?: string | null;
}

export const WordBank: React.FC<WordBankProps> = ({
  wordPlacements,
  foundWords,
  playerColorMap = {},
  playerNamesMap = {},
  playerIdsMap = {},
  currentPlayerId,
  currentPlayerName,
  hintWord
}) => {
  const remainingCount = Math.max(0, wordPlacements.length - foundWords.length);

  return (
    <div
      className="w-full rounded-2xl p-3.5 sm:p-4 backdrop-blur-md relative overflow-hidden"
      style={{
        background: 'linear-gradient(180deg, rgba(9, 32, 52, 0.92) 0%, rgba(4, 18, 32, 0.95) 100%)',
        border: '1.5px solid rgba(56, 189, 248, 0.45)',
        boxShadow: '0 0 24px rgba(14, 165, 233, 0.18), inset 0 1px 1px rgba(255, 255, 255, 0.14)'
      }}
      dir="rtl"
    >
      {/* Top Header Row */}
      <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-cyan-400/20 text-xs sm:text-sm flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="font-black text-white tracking-wide">الكلمات المطلوبة:</span>
          <span
            className="text-xs font-black text-amber-300 px-3 py-0.5 rounded-full tabular-nums"
            style={{
              background: 'rgba(245, 158, 11, 0.16)',
              border: '1px solid rgba(251, 191, 36, 0.65)',
              boxShadow: '0 0 10px rgba(245, 158, 11, 0.2)'
            }}
          >
            {foundWords.length} من {wordPlacements.length}
          </span>
        </div>

        <span className="text-xs sm:text-sm font-bold text-slate-200 tabular-nums">
          {remainingCount === 0 ? 'تم صيد جميع الكلمات! 🎉' : `متبقي ${remainingCount} كلمات للصيد`}
        </span>
      </div>

      {/* Centered Word Capsules */}
      <div className="flex flex-wrap gap-2.5 sm:gap-3 justify-center items-center py-0.5">
        {wordPlacements.map(placement => {
          const isFound = foundWords.includes(placement.word);
          const isHinted = !isFound && hintWord === placement.word;
          const color = playerColorMap[placement.word] || placement.color;
          const claimedBy = playerNamesMap[placement.word];
          const claimedById = playerIdsMap[placement.word] || placement.foundBy;
          const isMine = Boolean(
            claimedById && currentPlayerId
              ? claimedById === currentPlayerId
              : claimedBy && currentPlayerName && claimedBy === currentPlayerName
          );

          return (
            <div
              key={placement.word}
              className={`px-4 sm:px-5 py-1.5 rounded-full text-sm sm:text-base font-extrabold flex items-center gap-1.5 transition-all duration-200 select-none ${
                isFound
                  ? 'text-white scale-[0.98]'
                  : isHinted
                  ? 'text-slate-950 scale-110 ring-4 ring-amber-300/80 animate-pulse z-10'
                  : 'text-white hover:scale-105'
              }`}
              style={
                isFound
                  ? {
                      backgroundColor: color,
                      border: '1.5px solid rgba(255,255,255,0.55)',
                      boxShadow: `0 0 16px ${color}88, inset 0 1px 1px rgba(255,255,255,0.35)`
                    }
                  : isHinted
                  ? {
                      background: 'linear-gradient(135deg, #fde047 0%, #38bdf8 100%)',
                      border: '2px solid #ffffff',
                      boxShadow: '0 0 22px rgba(250, 204, 21, 0.85)'
                    }
                  : {
                      background: 'linear-gradient(180deg, #163854 0%, #0b2135 100%)',
                      border: '1.5px solid rgba(125, 211, 252, 0.45)',
                      boxShadow: '0 3px 8px rgba(0, 0, 0, 0.45), inset 0 1px 1px rgba(255, 255, 255, 0.22)'
                    }
              }
            >
              {isFound && (
                isMine ? (
                  <Check className="w-4 h-4 shrink-0 stroke-[3]" />
                ) : (
                  <Zap className="w-4 h-4 shrink-0 fill-current" />
                )
              )}
              {isHinted && <Lightbulb className="w-4 h-4 shrink-0 text-slate-950 fill-amber-400" />}
              <span className={isFound ? 'line-through decoration-2' : ''}>{placement.displayWord}</span>
              {isHinted && (
                <span className="text-[10px] bg-slate-950 text-amber-300 px-2 py-0.5 rounded-full mr-1 font-black">
                  تلميح 💡
                </span>
              )}
              {claimedBy && (
                <span className="text-[10px] sm:text-[11px] bg-black/40 px-2 py-0.5 rounded-full mr-1 font-black border border-white/25 whitespace-nowrap">
                  {isMine ? `✓ صدتها أنت` : `✗ صادها: ${claimedBy}`}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
