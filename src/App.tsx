/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  ScreenState,
  PlayerProfile,
  Category,
  LevelInfo,
  OnlineRoom,
  FriendProfileSummary,
  RoomInviteNotification
} from './types/game';
import { CATEGORIES, getLevelConfig } from './engine/gameCategories';
import { Navbar } from './components/Navbar';
import { SplashScreen } from './screens/SplashScreen';
import { AuthScreen } from './screens/AuthScreen';
import { ProfileSelectorScreen } from './screens/ProfileSelectorScreen';
import { HomeScreen } from './screens/HomeScreen';
import { GameModeScreen } from './screens/GameModeScreen';
import { CategoryScreen } from './screens/CategoryScreen';
import { LevelSelectScreen } from './screens/LevelSelectScreen';
import { SoloGameScreen } from './screens/SoloGameScreen';
import { LocalMultiGameScreen } from './screens/LocalMultiGameScreen';
import { OnlineLobbyScreen } from './screens/OnlineLobbyScreen';
import { OnlineGameScreen } from './screens/OnlineGameScreen';
import { LeaderboardScreen } from './screens/LeaderboardScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { ResultsModal } from './screens/ResultsModal';
import { sounds } from './utils/audio';
import {
  saveUserToLocalMap,
  getLocalUserProfile,
  safeApiJson,
  supabase,
  buildProfileFromSupabaseUser
} from './services/supabaseClient';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<ScreenState>('SPLASH');
  const [activeProfile, setActiveProfile] = useState<PlayerProfile | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<Category>(CATEGORIES[0]);
  const [selectedLevelInfo, setSelectedLevelInfo] = useState<LevelInfo>(getLevelConfig(CATEGORIES[0].id, 1));

  // Audio & TV Mode State
  const [isMuted, setIsMuted] = useState(false);
  const [tvMode, setTvMode] = useState(false);

  // Online Multiplayer active room, socket & unique session player ID
  const [onlineRoom, setOnlineRoom] = useState<OnlineRoom | null>(null);
  const [onlineSocket, setOnlineSocket] = useState<WebSocket | null>(null);
  const [onlinePlayerId, setOnlinePlayerId] = useState<string>('');

  // Friend System & Direct Room Invitation Routing State
  const [pendingJoinRoomCode, setPendingJoinRoomCode] = useState<string | null>(null);
  const [pendingInviteFriend, setPendingInviteFriend] = useState<FriendProfileSummary | null>(null);
  const [liveRoomInvite, setLiveRoomInvite] = useState<RoomInviteNotification | null>(null);
  const presenceWsRef = useRef<WebSocket | null>(null);

  // Results Modal State
  const [resultsData, setResultsData] = useState<{
    stars: number;
    timeSpent: number;
    score: number;
    earnedXP: number;
    earnedCoins: number;
    levelUp: boolean;
    wordsFoundCount: number;
    totalWordsCount: number;
    streakReward?: { currentStreak: number; bonusCoins: number; longestStreak: number } | null;
    completedDailyTasks?: import('./types/game').DailyChallengeTask[];
    hintsUsedCount?: number;
  } | null>(null);

  // Helper to update active profile and persist in localStorage / Supabase
  const handleSelectActiveProfile = (profile: PlayerProfile | null) => {
    setActiveProfile(profile);
    if (profile?.username) {
      saveUserToLocalMap(profile);
    }
  };

  // Load initial player on start & listen for verified Supabase OAuth / OTP sessions
  useEffect(() => {
    let authSub: { unsubscribe: () => void } | null = null;

    if (supabase) {
      supabase.auth.getSession().then(async ({ data }) => {
        if (data?.session?.user) {
          const verifiedProfile = await buildProfileFromSupabaseUser(data.session.user);
          handleSelectActiveProfile(verifiedProfile);
          setCurrentScreen(prev => (prev === 'AUTH' || prev === 'SPLASH' ? 'HOME' : prev));
        }
      });

      const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
        if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user) {
          const verifiedProfile = await buildProfileFromSupabaseUser(session.user);
          handleSelectActiveProfile(verifiedProfile);
          setCurrentScreen(prev => (prev === 'AUTH' || prev === 'SPLASH' ? 'HOME' : prev));
        }
      });
      authSub = listener.subscription;
    }

    const fetchUser = async () => {
      try {
        let savedUser = '';
        try {
          savedUser = localStorage.getItem('fatteshha_active_user') || '';
        } catch {
          savedUser = '';
        }
        const headers: Record<string, string> = {};
        if (savedUser) {
          headers['x-user-id'] = savedUser;
        }
        const data = await safeApiJson<{ success?: boolean; user?: PlayerProfile }>('/api/auth/me', { headers });
        if (data?.success && data.user) {
          handleSelectActiveProfile(data.user);
          return;
        }
        const localFallback = getLocalUserProfile(savedUser);
        if (localFallback) {
          setActiveProfile(localFallback);
        }
      } catch {
        const localFallback = getLocalUserProfile();
        if (localFallback) {
          setActiveProfile(localFallback);
        }
      }
    };
    fetchUser();

    return () => {
      authSub?.unsubscribe();
    };
  }, []);

  // Maintain global WebSocket presence so friends see online status & receive instant private room invites
  useEffect(() => {
    const uname = activeProfile?.username;
    if (!uname) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);
    presenceWsRef.current = ws;

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: 'REGISTER_PRESENCE',
          payload: { username: uname }
        })
      );
    };

    ws.onmessage = event => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'ROOM_INVITE_RECEIVED' && msg.payload?.invite) {
          sounds.playMultiplayerWordScore(2, 0);
          setLiveRoomInvite(msg.payload.invite);
        }
      } catch {
        // Ignore
      }
    };

    return () => {
      try {
        ws.close();
      } catch {
        // Ignore
      }
    };
  }, [activeProfile?.username]);

  const handleToggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    sounds.setMuted(next);
  };

  const handleToggleTV = () => {
    setTvMode(prev => !prev);
  };

  // Solo level completion
  const handleSoloLevelComplete = async (
    stars: number,
    timeSpent: number,
    score: number,
    accuracy: number = 100,
    wordsFoundCount: number = 5,
    hintsUsedCount: number = 0
  ) => {
    try {
      const data = await safeApiJson<{
        success?: boolean;
        user?: PlayerProfile;
        earnedXP?: number;
        earnedCoins?: number;
        levelUp?: boolean;
        streakReward?: { currentStreak: number; bonusCoins: number; longestStreak: number } | null;
        completedDailyTasks?: import('./types/game').DailyChallengeTask[];
      }>('/api/progress/complete-level', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: activeProfile?.username || 'ahmad_kwt',
          categoryId: selectedCategory.id,
          levelNumber: selectedLevelInfo.levelNumber,
          timeSpent,
          stars,
          score,
          accuracy,
          wordsFoundCount,
          hintsUsedCount
        })
      });

      if (data?.success && data.user) {
        handleSelectActiveProfile(data.user);
        setResultsData({
          stars,
          timeSpent,
          score,
          earnedXP: data.earnedXP || 140,
          earnedCoins: data.earnedCoins || 175,
          levelUp: data.levelUp || false,
          wordsFoundCount,
          totalWordsCount: selectedLevelInfo.words.length || wordsFoundCount,
          streakReward: data.streakReward || null,
          completedDailyTasks: data.completedDailyTasks || [],
          hintsUsedCount
        });
        return;
      }
    } catch {
      // Fallback to local calculation below
    }

    // Local / Static host (Vercel / Netlify) progression update
    const earnedXP = 50 + stars * 20 + Math.max(0, 100 - Math.floor(timeSpent));
    const earnedCoins = 10 + stars * 5;
    if (activeProfile) {
      const levelKey = `${selectedCategory.id}_${selectedLevelInfo.levelNumber}`;
      const existing = activeProfile.completedLevels?.[levelKey];
      const nextCompleted = {
        ...(activeProfile.completedLevels || {}),
        [levelKey]: {
          stars: Math.max(existing?.stars || 0, stars),
          bestTime: existing ? Math.min(existing.bestTime, timeSpent) : timeSpent,
          score: existing ? Math.max(existing.score, score) : score,
          accuracy: existing?.accuracy ? Math.max(existing.accuracy, accuracy) : accuracy,
          completedAt: new Date().toISOString()
        }
      };
      const nextXP = (activeProfile.xp || 0) + earnedXP;
      const prevLevel = Math.floor((activeProfile.xp || 0) / 300) + 1;
      const nextLevel = Math.floor(nextXP / 300) + 1;
      const updatedUser: PlayerProfile = {
        ...activeProfile,
        xp: nextXP,
        level: nextLevel,
        coins: (activeProfile.coins || 0) + earnedCoins,
        completedLevels: nextCompleted,
        completedLevelsCount: Object.keys(nextCompleted).length
      };
      handleSelectActiveProfile(updatedUser);
      setResultsData({
        stars,
        timeSpent,
        score,
        earnedXP,
        earnedCoins,
        levelUp: nextLevel > prevLevel,
        wordsFoundCount,
        totalWordsCount: selectedLevelInfo.words.length || wordsFoundCount,
        streakReward: null,
        completedDailyTasks: [],
        hintsUsedCount
      });
    } else {
      setResultsData({
        stars,
        timeSpent,
        score,
        earnedXP,
        earnedCoins,
        levelUp: false,
        wordsFoundCount,
        totalWordsCount: selectedLevelInfo.words.length || wordsFoundCount,
        streakReward: null,
        completedDailyTasks: [],
        hintsUsedCount
      });
    }
  };

  const [soloReplayTrigger, setSoloReplayTrigger] = useState(0);

  const handleNextLevel = () => {
    const nextNum = Math.min(50, selectedLevelInfo.levelNumber + 1);
    setSelectedLevelInfo(getLevelConfig(selectedCategory.id, nextNum));
    setResultsData(null);
    setCurrentScreen('GAME_SOLO');
  };

  const handleReplay = () => {
    setResultsData(null);
    setSoloReplayTrigger(prev => prev + 1);
    setCurrentScreen('GAME_SOLO');
  };

  const handleStartOnlineMatch = (room: OnlineRoom, ws: WebSocket, _isHost: boolean, myPid?: string) => {
    setOnlineRoom(room);
    setOnlineSocket(ws);
    if (myPid) {
      setOnlinePlayerId(myPid);
    }
    setCurrentScreen('GAME_ONLINE');
  };

  const isFullScreenHub =
    currentScreen === 'SPLASH' ||
    currentScreen === 'AUTH' ||
    currentScreen === 'HOME' ||
    currentScreen === 'MODE_SELECT' ||
    currentScreen === 'CATEGORIES' ||
    currentScreen === 'LEVELS' ||
    currentScreen === 'PROFILE' ||
    currentScreen === 'GAME_SOLO' ||
    currentScreen === 'ONLINE_LOBBY' ||
    currentScreen === 'ONLINE_JOIN' ||
    currentScreen === 'GAME_ONLINE' ||
    currentScreen === 'LEADERBOARD';

  return (
    <div className={`min-h-screen bg-slate-950 text-slate-100 flex flex-col ${tvMode ? 'tv-mode-active text-lg' : ''}`}>
      {/* Top Bar Navigation (shown on inner game/category/profile screens) */}
      {!isFullScreenHub && (
        <Navbar
          currentScreen={currentScreen}
          onNavigate={setCurrentScreen}
          user={activeProfile}
          tvMode={tvMode}
          onToggleTV={handleToggleTV}
          isMuted={isMuted}
          onToggleMute={handleToggleMute}
        />
      )}

      {/* Screen Router */}
      <main className={isFullScreenHub ? 'flex-1' : 'flex-1 pb-10'}>
        {currentScreen === 'SPLASH' && (
          <SplashScreen
            onStart={setCurrentScreen}
            activeProfile={activeProfile}
            onToggleTV={handleToggleTV}
            tvMode={tvMode}
          />
        )}

        {currentScreen === 'AUTH' && (
          <AuthScreen
            onLoginSuccess={(user) => {
              handleSelectActiveProfile(user);
              setCurrentScreen('HOME');
            }}
            onNavigate={setCurrentScreen}
          />
        )}

        {currentScreen === 'PROFILES' && (
          <ProfileSelectorScreen
            currentProfile={activeProfile}
            onSelectProfile={handleSelectActiveProfile}
            onNavigate={setCurrentScreen}
          />
        )}

        {(currentScreen === 'HOME' || currentScreen === 'MODE_SELECT') && (
          <HomeScreen
            user={activeProfile}
            onNavigate={setCurrentScreen}
            onUpdateUser={handleSelectActiveProfile}
            onJoinFriendRoom={(code) => {
              setPendingJoinRoomCode(code);
              setCurrentScreen('ONLINE_JOIN');
            }}
            onInviteFriendToNewPrivateRoom={(friend) => {
              setPendingInviteFriend(friend);
              setCurrentScreen('ONLINE_LOBBY');
            }}
            onStartCategory={(catId) => {
              const cat = CATEGORIES.find(c => c.id === catId) || CATEGORIES[0];
              setSelectedCategory(cat);
              setSelectedLevelInfo(getLevelConfig(cat.id, 1));
              setCurrentScreen('GAME_SOLO');
            }}
          />
        )}

        {currentScreen === 'CATEGORIES' && (
          <CategoryScreen
            user={activeProfile}
            onSelectCategory={(category) => {
              setSelectedCategory(category);
              setCurrentScreen('LEVELS');
            }}
            onNavigate={setCurrentScreen}
          />
        )}

        {currentScreen === 'LEVELS' && (
          <LevelSelectScreen
            category={selectedCategory}
            user={activeProfile}
            onSelectLevel={(levelNum) => {
              setSelectedLevelInfo(getLevelConfig(selectedCategory.id, levelNum));
              setCurrentScreen('GAME_SOLO');
            }}
            onNavigate={setCurrentScreen}
          />
        )}

        {currentScreen === 'GAME_SOLO' && (
          <SoloGameScreen
            category={selectedCategory}
            levelInfo={selectedLevelInfo}
            user={activeProfile}
            onUpdateUser={handleSelectActiveProfile}
            onNavigate={setCurrentScreen}
            isMuted={isMuted}
            onToggleMute={handleToggleMute}
            onToggleTV={handleToggleTV}
            onLevelComplete={handleSoloLevelComplete}
            onExit={() => setCurrentScreen('LEVELS')}
            tvMode={tvMode}
            replayTrigger={soloReplayTrigger}
          />
        )}

        {currentScreen === 'GAME_LOCAL' && (
          <LocalMultiGameScreen
            onNavigate={setCurrentScreen}
            tvMode={tvMode}
          />
        )}

        {(currentScreen === 'ONLINE_LOBBY' || currentScreen === 'ONLINE_JOIN') && (
          <OnlineLobbyScreen
            user={activeProfile}
            initialMode={currentScreen === 'ONLINE_JOIN' ? 'JOIN' : 'CREATE'}
            initialJoinCode={pendingJoinRoomCode}
            initialInviteFriend={pendingInviteFriend}
            onClearInitialLobbyAction={() => {
              setPendingJoinRoomCode(null);
              setPendingInviteFriend(null);
            }}
            onUpdateUser={handleSelectActiveProfile}
            onNavigate={setCurrentScreen}
            onStartOnlineGame={handleStartOnlineMatch}
          />
        )}

        {currentScreen === 'GAME_ONLINE' && onlineRoom && onlineSocket && (
          <OnlineGameScreen
            initialRoom={onlineRoom}
            socket={onlineSocket}
            currentUser={activeProfile}
            myPlayerId={onlinePlayerId}
            onExit={() => setCurrentScreen('ONLINE_LOBBY')}
            tvMode={tvMode}
          />
        )}

        {currentScreen === 'LEADERBOARD' && (
          <LeaderboardScreen
            user={activeProfile}
            onNavigate={setCurrentScreen}
            onBack={() => setCurrentScreen('HOME')}
          />
        )}

        {currentScreen === 'PROFILE' && activeProfile && (
          <ProfileScreen
            user={activeProfile}
            onUpdateUser={handleSelectActiveProfile}
            onNavigate={setCurrentScreen}
          />
        )}

        {currentScreen === 'SETTINGS' && (
          <SettingsScreen
            isMuted={isMuted}
            onToggleMute={handleToggleMute}
            tvMode={tvMode}
            onToggleTV={handleToggleTV}
            onNavigate={setCurrentScreen}
          />
        )}
      </main>

      {/* Global Real-Time Private Room Invitation Toast */}
      {liveRoomInvite && (
        <div
          dir="rtl"
          className="fixed top-4 inset-x-3 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 z-[70] w-auto sm:w-full sm:max-w-lg rounded-3xl p-4 bg-[#062338]/95 border-2 border-amber-400 shadow-[0_0_35px_rgba(251,191,36,0.45)] backdrop-blur-md flex items-center justify-between gap-3 flex-wrap animate-in slide-in-from-top duration-200"
        >
          <div className="flex items-center gap-3">
            <img
              src={liveRoomInvite.fromAvatar}
              alt={liveRoomInvite.fromDisplayName}
              className="w-11 h-11 rounded-full object-cover border-2 border-amber-400 shrink-0"
            />
            <div>
              <div className="text-xs font-black text-amber-300">
                📩 دعوة غرفة خاصة من صديقك!
              </div>
              <div className="text-sm font-black text-white">
                {liveRoomInvite.fromDisplayName}{' '}
                <span dir="ltr" className="text-xs font-mono text-sky-300">
                  (@{liveRoomInvite.fromUsername})
                </span>
              </div>
              <div className="text-xs text-slate-200 font-bold">
                الغرفة: {liveRoomInvite.roomName} • الرمز:{' '}
                <span className="font-mono font-black text-lime-300">#{liveRoomInvite.roomCode}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 mr-auto">
            <button
              type="button"
              onClick={() => {
                sounds.playVictory();
                const code = liveRoomInvite.roomCode;
                setLiveRoomInvite(null);
                setPendingJoinRoomCode(code);
                setCurrentScreen('ONLINE_JOIN');
              }}
              className="px-4 py-2 rounded-xl bg-gradient-to-b from-[#d9ff43] to-[#65a30d] text-slate-950 font-black text-xs shadow-lg cursor-pointer"
            >
              قبول والانضمام ⚡
            </button>
            <button
              type="button"
              onClick={() => setLiveRoomInvite(null)}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold cursor-pointer"
            >
              تجاهل
            </button>
          </div>
        </div>
      )}

      {/* Results Celebration Modal */}
      {resultsData && (
        <ResultsModal
          stars={resultsData.stars}
          timeSpent={resultsData.timeSpent}
          score={resultsData.score}
          earnedXP={resultsData.earnedXP}
          earnedCoins={resultsData.earnedCoins}
          levelUp={resultsData.levelUp}
          levelNumber={selectedLevelInfo.levelNumber}
          totalLevels={selectedCategory.totalLevels}
          wordsFoundCount={resultsData.wordsFoundCount}
          totalWordsCount={resultsData.totalWordsCount}
          playerName={activeProfile?.displayName}
          categoryName={selectedCategory.name}
          streakReward={resultsData.streakReward}
          completedDailyTasks={resultsData.completedDailyTasks}
          hintsUsedCount={resultsData.hintsUsedCount}
          onNextLevel={handleNextLevel}
          onReplay={handleReplay}
          onExit={() => {
            setResultsData(null);
            setCurrentScreen('LEVELS');
          }}
          onHome={() => {
            setResultsData(null);
            setCurrentScreen('HOME');
          }}
        />
      )}
    </div>
  );
}
