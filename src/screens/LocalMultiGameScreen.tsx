import React, { useState } from 'react';
import { LocalPlayer, ScreenState } from '../types/game';
import { generateWordSearchGrid, GeneratedBoard } from '../engine/wordSearch';
import { CATEGORIES } from '../engine/gameCategories';
import { GameBoard } from '../components/GameBoard';
import { WordBank } from '../components/WordBank';
import { KuwaitiCommentary } from '../components/KuwaitiCommentary';
import { TVRemoteHint } from '../components/TVRemoteHint';
import { ResultsModal } from './ResultsModal';
import { Users, Play, RotateCcw, ArrowRight, Crown, Volume2, VolumeX, Zap } from 'lucide-react';
import { sounds } from '../utils/audio';

interface LocalMultiGameScreenProps {
  onNavigate: (screen: ScreenState) => void;
  tvMode: boolean;
}

const PLAYER_COLORS = [
  '#0ea5e9', // Blue
  '#ec4899', // Pink
  '#10b981', // Emerald
  '#f59e0b', // Amber
];

export const LocalMultiGameScreen: React.FC<LocalMultiGameScreenProps> = ({
  onNavigate,
  tvMode
}) => {
  const [inSetup, setInSetup] = useState(true);
  const [playerCount, setPlayerCount] = useState<number>(2);
  const [selectedCatId, setSelectedCatId] = useState<string>('kuwait_heritage');
  const [selectedGridSize, setSelectedGridSize] = useState<number>(10);

  const [players, setPlayers] = useState<LocalPlayer[]>([
    { id: 'p1', name: 'اللاعب 1 (فهد)', color: PLAYER_COLORS[0], score: 0, wordsFound: [] },
    { id: 'p2', name: 'اللاعب 2 (سارة)', color: PLAYER_COLORS[1], score: 0, wordsFound: [] },
    { id: 'p3', name: 'اللاعب 3 (عبدالله)', color: PLAYER_COLORS[2], score: 0, wordsFound: [] },
    { id: 'p4', name: 'اللاعب 4 (ريم)', color: PLAYER_COLORS[3], score: 0, wordsFound: [] },
  ]);

  const [board, setBoard] = useState<GeneratedBoard | null>(null);
  const [foundWords, setFoundWords] = useState<string[]>([]);
  const [wordPlayerMap, setWordPlayerMap] = useState<Record<string, string>>({}); // word -> player color
  const [wordPlayerNameMap, setWordPlayerNameMap] = useState<Record<string, string>>({}); // word -> player name
  const [currentTurnIdx, setCurrentTurnIdx] = useState(0);
  const [kuwaitiMsg, setKuwaitiMsg] = useState('انطلقت المنافسة! أول لاعب يعثر على كلمة يحصد نقاطها 🔥');
  const [gameOver, setGameOver] = useState(false);
  const [soundMuted, setSoundMuted] = useState(sounds.getMuted());
  const [scoreBanner, setScoreBanner] = useState<{
    playerName: string;
    playerColor: string;
    word: string;
    points: number;
    streak: number;
    tookLead: boolean;
  } | null>(null);

  const startMatch = () => {
    sounds.playVictory();
    // Pick 7 or 9 words for local multi
    const wordCount = selectedGridSize === 8 ? 5 : selectedGridSize === 10 ? 7 : 9;

    // Get words from category
    const catWords = ['كشخه', 'فنتك', 'غبقه', 'ابراج', 'كويت', 'فيلكا', 'نوخذه', 'دسمان', 'مجبوس', 'بلاليط', 'صقر', 'حباري'];
    const selectedWords = catWords.slice(0, wordCount);

    const generated = generateWordSearchGrid(selectedWords, selectedGridSize);
    setBoard(generated);
    setFoundWords([]);
    setWordPlayerMap({});
    setWordPlayerNameMap({});
    setCurrentTurnIdx(0);
    setGameOver(false);
    setScoreBanner(null);

    // Reset scores
    setPlayers(prev => prev.slice(0, playerCount).map(p => ({ ...p, score: 0, wordsFound: [] })));
    setInSetup(false);
  };

  const handleWordFound = (word: string) => {
    if (foundWords.includes(word)) {
      sounds.playError();
      return;
    }

    const activePlayer = players[currentTurnIdx];
    const newStreak = (activePlayer.wordsFound?.length || 0) + 1;
    const streakBonus = newStreak >= 2 ? (newStreak - 1) * 20 : 0;
    const points = 100 + word.length * 15 + streakBonus;

    // Determine if activePlayer just overtook the previous leader
    const activePlayersBefore = players.slice(0, playerCount);
    const highestOtherScore = Math.max(
      0,
      ...activePlayersBefore.filter((_, i) => i !== currentTurnIdx).map(p => p.score)
    );
    const newTotalScore = activePlayer.score + points;
    const tookLead =
      highestOtherScore > 0 &&
      activePlayer.score <= highestOtherScore &&
      newTotalScore > highestOtherScore;

    // Play enthusiastic multiplayer word discovery + point score fanfare
    sounds.playMultiplayerWordScore(newStreak, currentTurnIdx);
    if (tookLead) {
      setTimeout(() => sounds.playLeadChangeFanfare(), 240);
    }

    // Update active player's score and discovered words
    setPlayers(prev =>
      prev.map((p, idx) => {
        if (idx === currentTurnIdx) {
          return {
            ...p,
            score: p.score + points,
            wordsFound: [...p.wordsFound, word]
          };
        }
        return p;
      })
    );

    setFoundWords(prev => [...prev, word]);
    setWordPlayerMap(prev => ({ ...prev, [word]: activePlayer.color }));
    setWordPlayerNameMap(prev => ({ ...prev, [word]: activePlayer.name }));

    const leadLabel = tookLead ? ' • 👑 انتزع الصدارة!' : '';
    const streakLabel = newStreak >= 2 ? ` (سلسلة x${newStreak} 🔥)` : '';
    setKuwaitiMsg(
      `كفووو يا ${activePlayer.name}! جبت كلمة «${word}» وحصلت +${points} نقطة${streakLabel}${leadLabel} 👏`
    );

    setScoreBanner({
      playerName: activePlayer.name,
      playerColor: activePlayer.color,
      word,
      points,
      streak: newStreak,
      tookLead
    });
    setTimeout(() => setScoreBanner(null), 2400);

    // Rotate turn to next player
    const nextIdx = (currentTurnIdx + 1) % playerCount;
    setCurrentTurnIdx(nextIdx);

    // Check if match finished
    if (board && foundWords.length + 1 >= board.wordPlacements.length) {
      setTimeout(() => sounds.playVictory(), 320);
      setGameOver(true);
    }
  };

  // Setup View
  if (inSetup) {
    return (
      <div className="max-w-2xl mx-auto p-4 sm:p-6 my-4">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl backdrop-blur-md">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => onNavigate('MODE_SELECT')}
              className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
            >
              <ArrowRight className="w-4 h-4" />
              <span>رجوع لأوضاع اللعب</span>
            </button>
            <span className="text-xs font-bold text-purple-400 bg-purple-400/10 px-2.5 py-1 rounded-full border border-purple-400/20">
              اللعب المحلي (Party Mode)
            </span>
          </div>

          <h2 className="text-2xl font-black text-white text-center mb-1">
            إعداد التحدي المحلي
          </h2>
          <p className="text-xs text-slate-400 text-center mb-6">
            تنافسوا على نفس الشاشة، دور بعد دور أو بالسرعة!
          </p>

          {/* Number of players */}
          <div className="mb-6">
            <label className="block text-xs font-bold text-slate-300 mb-2 text-right">
              عدد اللاعبين
            </label>
            <div className="grid grid-cols-3 gap-3">
              {[2, 3, 4].map(num => (
                <button
                  key={num}
                  type="button"
                  onClick={() => {
                    sounds.playTap();
                    setPlayerCount(num);
                  }}
                  className={`py-3 rounded-2xl font-bold text-sm border-2 transition-all flex items-center justify-center gap-2 ${
                    playerCount === num
                      ? 'border-purple-400 bg-purple-500/20 text-white shadow-lg'
                      : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <Users className="w-4 h-4" />
                  <span>{num} لاعبين</span>
                </button>
              ))}
            </div>
          </div>

          {/* Player Names Input */}
          <div className="space-y-3 mb-6">
            <label className="block text-xs font-bold text-slate-300 text-right">
              أسماء المتنافسين وألوانهم
            </label>
            {players.slice(0, playerCount).map((p, idx) => (
              <div key={p.id} className="flex items-center gap-3 bg-slate-950 p-2.5 rounded-2xl border border-slate-800">
                <div
                  className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-xs font-black text-slate-950"
                  style={{ backgroundColor: p.color }}
                >
                  {idx + 1}
                </div>
                <input
                  type="text"
                  value={p.name}
                  onChange={(e) => {
                    const newName = e.target.value;
                    setPlayers(prev => prev.map((pl, i) => i === idx ? { ...pl, name: newName } : pl));
                  }}
                  className="flex-1 bg-transparent text-sm font-bold text-white focus:outline-none text-right px-2"
                />
              </div>
            ))}
          </div>

          {/* Category Select */}
          <div className="mb-6">
            <label className="block text-xs font-bold text-slate-300 mb-2 text-right">
              تصنيف الكلمات
            </label>
            <select
              value={selectedCatId}
              onChange={(e) => setSelectedCatId(e.target.value)}
              className="w-full px-4 py-3 rounded-2xl bg-slate-950 border border-slate-800 text-white text-sm focus:outline-none focus:border-purple-400 text-right"
            >
              {CATEGORIES.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Grid Size Select */}
          <div className="mb-8">
            <label className="block text-xs font-bold text-slate-300 mb-2 text-right">
              حجم الشبكة
            </label>
            <div className="grid grid-cols-3 gap-3">
              {[
                { size: 8, label: '8×8 (سريع)' },
                { size: 10, label: '10×10 (متوسط)' },
                { size: 12, label: '12×12 (تحدي كبير)' },
              ].map(opt => (
                <button
                  key={opt.size}
                  type="button"
                  onClick={() => {
                    sounds.playTap();
                    setSelectedGridSize(opt.size);
                  }}
                  className={`py-2.5 rounded-2xl font-bold text-xs border transition-all ${
                    selectedGridSize === opt.size
                      ? 'border-purple-400 bg-purple-500/20 text-white'
                      : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={startMatch}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-400 hover:to-indigo-400 text-white font-black text-sm shadow-xl shadow-purple-500/20 active:scale-98 flex items-center justify-center gap-2 transition-all"
          >
            <Play className="w-5 h-5 fill-current" />
            <span>انطلاق التحدي المحلي</span>
          </button>
        </div>
      </div>
    );
  }

  // Active Local Multiplayer View
  if (!board) return null;

  // Determine current winner
  const sortedPlayers = [...players.slice(0, playerCount)].sort((a, b) => b.score - a.score);
  const leadingPlayer = sortedPlayers[0];

  return (
    <div className="max-w-4xl mx-auto p-3 sm:p-5 space-y-4">
      {/* Header HUD with Live Scoreboard */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 shadow-xl">
        <div className="flex items-center justify-between mb-3 pb-3 border-b border-slate-800">
          <button
            onClick={() => {
              sounds.playTap();
              setInSetup(true);
            }}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center gap-1"
          >
            <ArrowRight className="w-4 h-4" />
            <span>إنهاء وإعداد جديد</span>
          </button>

          <div className="text-right">
            <span className="text-xs font-bold text-purple-400">اللعب المحلي</span>
            <span className="text-xs text-slate-400 mx-2">·</span>
            <span className="text-xs font-bold text-white">
              دور: <span style={{ color: players[currentTurnIdx]?.color }}>{players[currentTurnIdx]?.name}</span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const nextMuted = !soundMuted;
                sounds.setMuted(nextMuted);
                setSoundMuted(nextMuted);
                if (!nextMuted) {
                  sounds.playMultiplayerWordScore(2, currentTurnIdx);
                }
              }}
              className={`px-2.5 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-1 transition-all cursor-pointer ${
                soundMuted
                  ? 'bg-slate-800 border-slate-700 text-slate-400'
                  : 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300 hover:bg-emerald-500/25'
              }`}
              title="تفعيل أو تجربة المؤثرات الصوتية الحماسية"
            >
              {soundMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              <span>{soundMuted ? 'مكتوم' : 'صوت النقاط 🔊'}</span>
            </button>
            <button
              onClick={() => {
                sounds.playTap();
                startMatch();
              }}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white cursor-pointer"
              title="إعادة بدء الجولة"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Players Score Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {players.slice(0, playerCount).map((p, idx) => {
            const isTurn = idx === currentTurnIdx;
            return (
              <div
                key={p.id}
                className={`p-2.5 rounded-2xl border text-right transition-all ${
                  isTurn
                    ? 'border-purple-400 bg-purple-500/10 shadow-md ring-2 ring-purple-400/30'
                    : 'border-slate-800 bg-slate-950/60'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div
                    className="w-3.5 h-3.5 rounded-full"
                    style={{ backgroundColor: p.color }}
                  />
                  {leadingPlayer.id === p.id && leadingPlayer.score > 0 && (
                    <Crown className="w-4 h-4 text-amber-400" />
                  )}
                </div>
                <div className="text-xs font-bold text-white truncate">{p.name}</div>
                <div className="text-sm font-black text-amber-400 mt-0.5">
                  {p.score} <span className="text-[10px] text-slate-400 font-normal">نقطة</span>
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  {p.wordsFound.length} كلمات
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Live Enthusiastic Point & Word Discovery Banner */}
      {scoreBanner && (
        <div
          className="p-3 rounded-2xl border-2 text-center shadow-xl animate-bounce flex items-center justify-center gap-3 flex-wrap"
          style={{
            backgroundColor: `${scoreBanner.playerColor}22`,
            borderColor: scoreBanner.playerColor
          }}
        >
          <span className="inline-flex items-center gap-1 text-sm font-black text-white">
            <Zap className="w-4 h-4 text-amber-400 fill-amber-400" />
            <span>🔊 {scoreBanner.playerName} اكتشف كلمة «{scoreBanner.word}»!</span>
          </span>
          <span className="px-2.5 py-0.5 rounded-full bg-amber-400 text-slate-950 text-xs font-black">
            +{scoreBanner.points} نقطة {scoreBanner.streak >= 2 ? `• سلسلة x${scoreBanner.streak} 🔥` : ''}
          </span>
          {scoreBanner.tookLead && (
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-400 text-slate-950 text-xs font-black">
              👑 انتزع الصدارة!
            </span>
          )}
        </div>
      )}

      <KuwaitiCommentary message={kuwaitiMsg} type="praise" />

      {/* Target Word Bank */}
      <WordBank
        wordPlacements={board.wordPlacements}
        foundWords={foundWords}
        playerColorMap={wordPlayerMap}
        playerNamesMap={wordPlayerNameMap}
      />

      {/* Game Board */}
      <div className="flex justify-center py-2">
        <GameBoard
          grid={board.grid}
          gridSize={board.gridSize}
          wordPlacements={board.wordPlacements}
          foundWords={foundWords}
          playerColorMap={wordPlayerMap}
          onWordSelected={handleWordFound}
          tvMode={tvMode}
        />
      </div>

      {/* Winner Overlay Modal using Kuwait Neon Victory Screen */}
      {gameOver && (
        <ResultsModal
          stars={3}
          timeSpent={65}
          score={leadingPlayer.score}
          earnedXP={180}
          earnedCoins={150}
          levelNumber={1}
          totalLevels={playerCount}
          wordsFoundCount={leadingPlayer.wordsFound.length}
          totalWordsCount={board.wordPlacements.length}
          winnerName={leadingPlayer.name}
          isWinner={true}
          categoryName={CATEGORIES.find(c => c.id === selectedCatId)?.name || 'الكويت'}
          matchPlayers={sortedPlayers.map(p => ({
            name: p.name,
            score: p.score,
            wordsCount: p.wordsFound.length,
            color: p.color
          }))}
          primaryButtonLabel="المرحلة التالية"
          homeButtonLabel="الرئيسية"
          onNextLevel={startMatch}
          onReplay={startMatch}
          onExit={() => setInSetup(true)}
          onHome={() => onNavigate('HOME')}
        />
      )}

      {tvMode && <TVRemoteHint />}
    </div>
  );
};
