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
import { DailyChallengeScreen } from './screens/DailyChallengeScreen';
import { AdminModerationScreen } from './screens/AdminModerationScreen';
import { ResultsModal } from './screens/ResultsModal';
import { sounds } from './utils/audio';
import { realtimeSync } from './services/realtimeSync';
import { initializeIOSNativePlatform, resolveWebSocketUrl } from './utils/iosNative';
import {
  saveUserToLocalMap,
  syncProfileWithSupabase,
  getLocalUserProfile,
  getStoredAuthToken,
  extractTokenUsernameClient,
  safeApiJson,
  supabase,
  createQuickProfileFromSupabaseUser,
  buildProfileFromSupabaseUser,
  fetchCloudProfileFromSupabase,
  mergePlayerProfiles,
  logoutCurrentAccount
} from './services/supabaseClient';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<ScreenState>(() => {
    try {
      if (
        typeof window !== 'undefined' &&
        new URLSearchParams(window.location.search).get('admin') === 'moderation'
      ) {
        return 'ADMIN_MODERATION';
      }
    } catch {
      // ignore
    }
    return 'SPLASH';
  });
  const [activeProfile, setActiveProfile] = useState<PlayerProfile | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<Category>(CATEGORIES[0]);
  const [selectedLevelInfo, setSelectedLevelInfo] = useState<LevelInfo>(getLevelConfig(CATEGORIES[0].id, 1));

  // Audio, TV Mode & Global Eye Comfort Mode State
  const [isMuted, setIsMuted] = useState(false);
  const [tvMode, setTvMode] = useState(false);
  const [eyeComfortMode, setEyeComfortMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('fatteshha_eye_comfort_mode') === '1';
    } catch {
      return false;
    }
  });
  const [eyeComfortIntensity, setEyeComfortIntensity] = useState<'SOFT' | 'WARM' | 'DEEP'>(() => {
    try {
      const saved = localStorage.getItem('fatteshha_eye_comfort_intensity');
      if (saved === 'SOFT' || saved === 'WARM' || saved === 'DEEP') return saved;
      return 'WARM';
    } catch {
      return 'WARM';
    }
  });

  // Online Multiplayer active room, socket & unique session player ID
  const [onlineRoom, setOnlineRoom] = useState<OnlineRoom | null>(null);
  const [onlineSocket, setOnlineSocket] = useState<WebSocket | null>(null);
  const [onlinePlayerId, setOnlinePlayerId] = useState<string>('');

  // Friend System & Direct Room Invitation Routing State
  const [pendingJoinRoomCode, setPendingJoinRoomCode] = useState<string | null>(null);
  const [pendingInviteFriend, setPendingInviteFriend] = useState<FriendProfileSummary | null>(null);
  const [liveRoomInvite, setLiveRoomInvite] = useState<RoomInviteNotification | null>(null);
  const presenceWsRef = useRef<WebSocket | null>(null);

  const [oauthError, setOauthError] = useState('');
  const activeProfileRef = useRef<PlayerProfile | null>(null);
  const lastSyncedSbUserIdRef = useRef<string | null>(null);

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
    activeProfileRef.current = profile;
    setActiveProfile(profile);
    if (profile?.username) {
      saveUserToLocalMap(profile);
    }
  };

  const handleLogout = () => {
    sounds.playTap();
    void logoutCurrentAccount();
    activeProfileRef.current = null;
    lastSyncedSbUserIdRef.current = null;
    setActiveProfile(null);
    setOauthError('');
    setLiveRoomInvite(null);
    setPendingJoinRoomCode(null);
    setPendingInviteFriend(null);
    setOnlineRoom(null);
    try {
      onlineSocket?.close();
    } catch {
      // ignore
    }
    setOnlineSocket(null);
    try {
      presenceWsRef.current?.close();
      presenceWsRef.current = null;
    } catch {
      // ignore
    }
    setCurrentScreen('AUTH');
  };

  // Load initial player on start & listen for verified Supabase OAuth / OTP / PKCE sessions
  useEffect(() => {
    let isMounted = true;
    let authSub: { unsubscribe: () => void } | null = null;

    const cleanOAuthUrl = () => {
      try {
        const hasOAuthHash =
          window.location.hash.includes('access_token=') ||
          window.location.hash.includes('refresh_token=') ||
          window.location.hash.includes('error=');
        const searchParams = new URLSearchParams(window.location.search);
        const hasOAuthQuery =
          searchParams.has('code') || searchParams.has('error') || searchParams.has('error_description');
        if (hasOAuthHash || hasOAuthQuery) {
          window.history.replaceState({}, document.title, window.location.pathname || '/');
        }
      } catch {
        // ignore history API errors
      }
    };

    const applySupabaseSession = async (session: { user?: any } | null | undefined) => {
      const sbUser = session?.user;
      if (!sbUser || !isMounted) return;

      // 1. Immediately create & select quick profile so SplashScreen/AuthScreen route straight to HOME
      const quickProfile = createQuickProfileFromSupabaseUser(sbUser);
      if (!activeProfileRef.current || activeProfileRef.current.username !== quickProfile.username) {
        handleSelectActiveProfile(quickProfile);
      }
      setOauthError('');
      setCurrentScreen(prev => (prev === 'AUTH' || prev === 'SPLASH' ? 'HOME' : prev));
      cleanOAuthUrl();

      // 2. If running inside an OAuth popup (e.g. AI Studio iframe preview), notify opener and close
      try {
        if (
          window.opener &&
          (window.name === 'google_oauth_popup' || window.name === 'apple_oauth_popup')
        ) {
          window.opener.postMessage(
            { type: 'FATTESHHA_OAUTH_SUCCESS', userId: sbUser.id },
            window.location.origin
          );
          setTimeout(() => {
            try {
              window.close();
            } catch {
              // ignore
            }
          }, 150);
        }
      } catch {
        // ignore cross-origin opener access
      }

      // 3. Background-sync full cloud profile from Supabase 'profiles' table once per user session
      if (lastSyncedSbUserIdRef.current !== sbUser.id) {
        lastSyncedSbUserIdRef.current = sbUser.id;
        try {
          const verifiedProfile = await buildProfileFromSupabaseUser(sbUser);
          if (isMounted) {
            handleSelectActiveProfile(verifiedProfile);
            setCurrentScreen(prev => (prev === 'AUTH' || prev === 'SPLASH' ? 'HOME' : prev));
          }
        } catch {
          // Quick profile is already active and persisted locally
        }
      }
    };

    const readOAuthUrlError = (): string => {
      try {
        const searchParams = new URLSearchParams(window.location.search);
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        const errDesc =
          searchParams.get('error_description') ||
          hashParams.get('error_description') ||
          searchParams.get('error') ||
          hashParams.get('error');
        return errDesc ? `تعذر إكمال تسجيل الدخول: ${decodeURIComponent(errDesc.replace(/\+/g, ' '))}` : '';
      } catch {
        return '';
      }
    };

    const bootstrapSupabaseAuth = async () => {
      if (!supabase) return;

      const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
        if (
          (event === 'INITIAL_SESSION' ||
            event === 'SIGNED_IN' ||
            event === 'TOKEN_REFRESHED' ||
            event === 'USER_UPDATED') &&
          session?.user
        ) {
          void applySupabaseSession(session);
        }
      });
      authSub = listener.subscription;

      try {
        const { data } = await supabase.auth.getSession();
        if (data?.session?.user) {
          await applySupabaseSession(data.session);
          return;
        }

        // Explicitly support PKCE OAuth callbacks (?code=...)
        const searchParams = new URLSearchParams(window.location.search);
        const authCode = searchParams.get('code');
        if (authCode) {
          const { data: exchanged, error: exchangeErr } = await supabase.auth.exchangeCodeForSession(authCode);
          if (exchanged?.session?.user) {
            await applySupabaseSession(exchanged.session);
            return;
          }
          if (exchangeErr && isMounted) {
            setOauthError(`تعذر إكمال تسجيل الدخول: ${exchangeErr.message}`);
            cleanOAuthUrl();
            return;
          }
        }

        const urlErr = readOAuthUrlError();
        if (urlErr && isMounted) {
          setOauthError(urlErr);
          cleanOAuthUrl();
        }
      } catch {
        // Ignore transient auth check error
      }
    };

    void bootstrapSupabaseAuth();

    // Sync session immediately if OAuth completed in a popup window (same origin localStorage / postMessage)
    const handleOAuthMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === 'FATTESHHA_OAUTH_SUCCESS' && supabase) {
        supabase.auth.getSession().then(({ data }) => {
          if (data?.session?.user) {
            void applySupabaseSession(data.session);
          }
        });
      }
    };

    const handleStorageOrFocusSync = () => {
      if (!supabase || activeProfileRef.current) return;
      supabase.auth.getSession().then(({ data }) => {
        if (data?.session?.user) {
          void applySupabaseSession(data.session);
        }
      });
    };

    window.addEventListener('message', handleOAuthMessage);
    window.addEventListener('storage', handleStorageOrFocusSync);
    window.addEventListener('focus', handleStorageOrFocusSync);

    const fetchUser = async () => {
      try {
        if (activeProfileRef.current) return;
        let savedUser = '';
        try {
          savedUser = localStorage.getItem('fatteshha_active_user') || '';
        } catch {
          savedUser = '';
        }
        if (!savedUser || savedUser === 'ahmad_kwt' || savedUser === 'dana_q8') {
          try {
            localStorage.removeItem('fatteshha_active_user');
          } catch {
            // ignore
          }
          return;
        }
        const localFallback = getLocalUserProfile(savedUser);
        const storedToken = getStoredAuthToken(savedUser);
        if (storedToken) {
          const headers: Record<string, string> = { 'x-user-id': savedUser };
          const data = await safeApiJson<{ success?: boolean; user?: PlayerProfile }>('/api/auth/me', { headers });
          if (data?.success && data.user && !activeProfileRef.current) {
            const reconciled = localFallback ? mergePlayerProfiles(data.user, localFallback) : data.user;
            handleSelectActiveProfile(reconciled);
            return;
          }
        }
        if (localFallback && !activeProfileRef.current) {
          handleSelectActiveProfile(localFallback);
        }
        // Reconcile cloud stages from Supabase in the background so switching devices or returning later never misses progress
        const cloudProfile = await fetchCloudProfileFromSupabase(savedUser, localFallback?.email);
        if (cloudProfile && isMounted) {
          const current = activeProfileRef.current as PlayerProfile | null;
          if (!current || current.username === cloudProfile.username) {
            const merged = current
              ? mergePlayerProfiles(current, cloudProfile)
              : localFallback
                ? mergePlayerProfiles(localFallback, cloudProfile)
                : cloudProfile;
            handleSelectActiveProfile(merged);
          }
        }
      } catch {
        const localFallback = getLocalUserProfile();
        if (localFallback && !activeProfileRef.current) {
          handleSelectActiveProfile(localFallback);
        }
      }
    };
    fetchUser();

    return () => {
      isMounted = false;
      authSub?.unsubscribe();
      window.removeEventListener('message', handleOAuthMessage);
      window.removeEventListener('storage', handleStorageOrFocusSync);
      window.removeEventListener('focus', handleStorageOrFocusSync);
    };
  }, []);

  // Maintain global WebSocket presence so friends see online status & receive instant private room invites
  useEffect(() => {
    const uname = activeProfile?.username?.trim();
    if (!uname) return;

    const cleanUname = uname.replace(/^@+/, '').toLowerCase().replace(/\s+/g, '_');
    const resolveMatchedToken = (): string | null => {
      if (
        activeProfile?.authToken &&
        extractTokenUsernameClient(activeProfile.authToken) === cleanUname
      ) {
        return activeProfile.authToken;
      }
      return getStoredAuthToken(uname);
    };

    let isUnmounted = false;

    const connectPresenceSocket = () => {
      if (isUnmounted) return;
      const matchedToken = resolveMatchedToken();
      if (!matchedToken) return;

      if (
        presenceWsRef.current &&
        (presenceWsRef.current.readyState === WebSocket.OPEN ||
          presenceWsRef.current.readyState === WebSocket.CONNECTING)
      ) {
        if (presenceWsRef.current.readyState === WebSocket.OPEN) {
          presenceWsRef.current.send(
            JSON.stringify({
              type: 'REGISTER_PRESENCE',
              authToken: matchedToken,
              payload: { username: uname, authToken: matchedToken }
            })
          );
        }
        return;
      }

      const wsUrl = resolveWebSocketUrl(undefined, matchedToken, uname);
      const ws = new WebSocket(wsUrl);
      presenceWsRef.current = ws;

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: 'REGISTER_PRESENCE',
            authToken: matchedToken,
            payload: { username: uname, authToken: matchedToken }
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

      ws.onclose = () => {
        if (presenceWsRef.current === ws) {
          presenceWsRef.current = null;
        }
      };
    };

    connectPresenceSocket();

    const unsubCloudInvites = realtimeSync.subscribeToUserInvites(uname, invite => {
      if (!isUnmounted) {
        sounds.playMultiplayerWordScore(2, 0);
        setLiveRoomInvite(invite);
      }
    });

    let cleanupNative: (() => void) | null = null;
    initializeIOSNativePlatform({
      onResumeForeground: () => {
        sounds.resumeIfNeeded();
        connectPresenceSocket();
        window.dispatchEvent(new CustomEvent('fatteshha:app-resumed'));
      },
      onNetworkStatusChange: connected => {
        if (connected) {
          sounds.resumeIfNeeded();
          connectPresenceSocket();
          window.dispatchEvent(new CustomEvent('fatteshha:app-resumed'));
        }
      }
    }).then(fn => {
      cleanupNative = fn;
    });

    return () => {
      isUnmounted = true;
      unsubCloudInvites();
      cleanupNative?.();
      try {
        presenceWsRef.current?.close();
      } catch {
        // Ignore
      }
      presenceWsRef.current = null;
    };
  }, [activeProfile?.username, activeProfile?.authToken]);

  const handleToggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    sounds.setMuted(next);
  };

  const handleToggleTV = () => {
    setTvMode(prev => !prev);
  };

  const handleToggleEyeComfort = () => {
    setEyeComfortMode(prev => {
      const next = !prev;
      try {
        localStorage.setItem('fatteshha_eye_comfort_mode', next ? '1' : '0');
        window.dispatchEvent(
          new CustomEvent('fatteshha:eye-comfort-changed', {
            detail: { enabled: next, intensity: eyeComfortIntensity }
          })
        );
      } catch {
        // ignore
      }
      return next;
    });
  };

  const handleChangeEyeComfortIntensity = (intensity: 'SOFT' | 'WARM' | 'DEEP') => {
    setEyeComfortIntensity(intensity);
    try {
      localStorage.setItem('fatteshha_eye_comfort_intensity', intensity);
      window.dispatchEvent(
        new CustomEvent('fatteshha:eye-comfort-changed', {
          detail: { enabled: eyeComfortMode, intensity }
        })
      );
    } catch {
      // ignore
    }
  };

  // Sync Eye Comfort Mode classes on <html> and listen for in-game board toggle events
  useEffect(() => {
    const root = document.documentElement;
    if (eyeComfortMode) {
      root.classList.add('eye-comfort-active');
    } else {
      root.classList.remove('eye-comfort-active');
    }
  }, [eyeComfortMode]);

  useEffect(() => {
    const onExternalComfortToggle = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (detail && typeof detail.enabled === 'boolean') {
        setEyeComfortMode(detail.enabled);
      }
      if (detail?.intensity) {
        setEyeComfortIntensity(detail.intensity);
      }
    };
    window.addEventListener('fatteshha:eye-comfort-changed', onExternalComfortToggle);
    return () => window.removeEventListener('fatteshha:eye-comfort-changed', onExternalComfortToggle);
  }, []);

  // Solo level completion (Server is the sole authoritative source of truth for rewards & score)
  const handleSoloLevelComplete = async (
    stars: number,
    timeSpent: number,
    score: number,
    accuracy: number = 100,
    wordsFoundCount: number = 5,
    hintsUsedCount: number = 0,
    doubleBoostActive: boolean = false,
    sessionId?: string | null
  ) => {
    const rewardMultiplier = doubleBoostActive ? 2 : 1;
    try {
      const data = await safeApiJson<{
        success?: boolean;
        user?: PlayerProfile;
        earnedXP?: number;
        earnedCoins?: number;
        levelUp?: boolean;
        verifiedResult?: {
          stars: number;
          timeSpent: number;
          score: number;
          accuracy: number;
          wordsFoundCount: number;
          hintsUsedCount: number;
        };
        streakReward?: { currentStreak: number; bonusCoins: number; longestStreak: number } | null;
        completedDailyTasks?: import('./types/game').DailyChallengeTask[];
      }>('/api/progress/complete-level', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: activeProfile?.username || 'ahmad_kwt',
          sessionId: sessionId || undefined,
          requestId: sessionId ? `req_lvl_${sessionId}` : `req_lvl_${Date.now()}`,
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
        const verified = data.verifiedResult;
        const enrichedApiUser = saveUserToLocalMap(data.user);
        handleSelectActiveProfile(enrichedApiUser);
        syncProfileWithSupabase(enrichedApiUser);
        setResultsData({
          stars: verified?.stars ?? stars,
          timeSpent: verified?.timeSpent ?? timeSpent,
          score: verified?.score ?? score,
          earnedXP: data.earnedXP ?? 140,
          earnedCoins: data.earnedCoins ?? 175,
          levelUp: data.levelUp || false,
          wordsFoundCount: verified?.wordsFoundCount ?? wordsFoundCount,
          totalWordsCount: selectedLevelInfo.words.length || wordsFoundCount,
          streakReward: data.streakReward || null,
          completedDailyTasks: data.completedDailyTasks || [],
          hintsUsedCount: verified?.hintsUsedCount ?? hintsUsedCount
        });
        return;
      }
    } catch {
      // Fallback to local calculation below only when offline
    }

    // Local / Static host (Vercel / Netlify) progression update
    const earnedXP = (50 + stars * 20 + Math.max(0, 100 - Math.floor(timeSpent))) * rewardMultiplier;
    const earnedCoins = (10 + stars * 5) * rewardMultiplier;
    if (activeProfile) {
      const latestStored = getLocalUserProfile(activeProfile.username);
      const baseProfile = latestStored ? mergePlayerProfiles(activeProfile, latestStored) : activeProfile;
      const levelKey = `${selectedCategory.id}_${selectedLevelInfo.levelNumber}`;
      const existing = baseProfile.completedLevels?.[levelKey];
      const nextCompleted = {
        ...(baseProfile.completedLevels || {}),
        [levelKey]: {
          stars: Math.max(existing?.stars || 0, stars),
          bestTime: existing ? Math.min(existing.bestTime, timeSpent) : timeSpent,
          score: existing ? Math.max(existing.score, score) : score,
          accuracy: existing?.accuracy ? Math.max(existing.accuracy, accuracy) : accuracy,
          completedAt: new Date().toISOString()
        }
      };
      const nextXP = (baseProfile.xp || 0) + earnedXP;
      const prevLevel = Math.floor((baseProfile.xp || 0) / 300) + 1;
      const nextLevel = Math.floor(nextXP / 300) + 1;
      const updatedUser: PlayerProfile = saveUserToLocalMap({
        ...baseProfile,
        xp: nextXP,
        seasonXp: (baseProfile.seasonXp || baseProfile.xp || 0) + earnedXP,
        level: nextLevel,
        coins: (baseProfile.coins || 0) + earnedCoins,
        totalScore: (baseProfile.totalScore || 0) + score,
        totalWordsFound: (baseProfile.totalWordsFound || 0) + wordsFoundCount,
        fastStagesCount: (baseProfile.fastStagesCount || 0) + (timeSpent < 45 ? 1 : 0),
        perfectStagesCount: (baseProfile.perfectStagesCount || 0) + (accuracy >= 100 ? 1 : 0),
        completedLevels: nextCompleted,
        completedLevelsCount: Object.keys(nextCompleted).length
      });
      handleSelectActiveProfile(updatedUser);
      syncProfileWithSupabase(updatedUser);
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
    currentScreen === 'DAILY_CHALLENGE' ||
    currentScreen === 'LEADERBOARD' ||
    currentScreen === 'ADMIN_MODERATION';

  return (
    <div
      className={`min-h-screen bg-slate-950 text-slate-100 flex flex-col ${
        tvMode ? 'tv-mode-active text-lg' : ''
      }`}
    >
      {/* Global Eye Comfort Optical Filter Shield (Warm Color Temperature + Reduced Glare for Long Play) */}
      {eyeComfortMode && (
        <div
          aria-hidden="true"
          className={`eye-comfort-shield ${
            eyeComfortIntensity === 'SOFT'
              ? 'intensity-soft'
              : eyeComfortIntensity === 'DEEP'
              ? 'intensity-deep'
              : 'intensity-warm'
          }`}
        />
      )}

      {/* Top Bar Navigation (shown on inner game/category/profile screens) */}
      {!isFullScreenHub && (
        <Navbar
          currentScreen={currentScreen}
          onNavigate={setCurrentScreen}
          user={activeProfile}
          tvMode={tvMode}
          onToggleTV={handleToggleTV}
          eyeComfortMode={eyeComfortMode}
          onToggleEyeComfort={handleToggleEyeComfort}
          isMuted={isMuted}
          onToggleMute={handleToggleMute}
          onLogout={handleLogout}
        />
      )}

      {/* Screen Router */}
      <main className={isFullScreenHub ? 'flex-1' : 'flex-1 pb-10'}>
        {currentScreen === 'SPLASH' && (
          <SplashScreen
            onStart={(screen) => {
              setCurrentScreen(activeProfileRef.current ? 'HOME' : screen);
            }}
            activeProfile={activeProfile}
            onToggleTV={handleToggleTV}
            tvMode={tvMode}
          />
        )}

        {currentScreen === 'AUTH' && (
          <AuthScreen
            initialError={oauthError}
            onLoginSuccess={(user) => {
              setOauthError('');
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
            onLogout={handleLogout}
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
            initialMode={
              currentScreen === 'ONLINE_JOIN'
                ? 'JOIN'
                : pendingInviteFriend
                ? 'CREATE'
                : 'ENTRY'
            }
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
            key={`${onlineRoom.code}_${onlinePlayerId}`}
            initialRoom={onlineRoom}
            socket={onlineSocket}
            currentUser={activeProfile}
            onUpdateUser={handleSelectActiveProfile}
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

        {currentScreen === 'DAILY_CHALLENGE' && (
          <DailyChallengeScreen
            user={activeProfile}
            onUpdateUser={handleSelectActiveProfile}
            onNavigate={setCurrentScreen}
            tvMode={tvMode}
          />
        )}

        {currentScreen === 'PROFILE' && activeProfile && (
          <ProfileScreen
            user={activeProfile}
            onUpdateUser={handleSelectActiveProfile}
            onNavigate={setCurrentScreen}
            onLogout={handleLogout}
            onAccountDeleted={() => {
              setActiveProfile(null);
              setCurrentScreen('AUTH');
            }}
          />
        )}

        {currentScreen === 'SETTINGS' && (
          <SettingsScreen
            isMuted={isMuted}
            onToggleMute={handleToggleMute}
            tvMode={tvMode}
            onToggleTV={handleToggleTV}
            eyeComfortMode={eyeComfortMode}
            onToggleEyeComfort={handleToggleEyeComfort}
            eyeComfortIntensity={eyeComfortIntensity}
            onChangeEyeComfortIntensity={handleChangeEyeComfortIntensity}
            onNavigate={setCurrentScreen}
            user={activeProfile}
            onUpdateUser={handleSelectActiveProfile}
            onLogout={handleLogout}
            onAccountDeleted={() => {
              setActiveProfile(null);
              setCurrentScreen('AUTH');
            }}
          />
        )}

        {currentScreen === 'ADMIN_MODERATION' && (
          <AdminModerationScreen
            onBack={() => setCurrentScreen(activeProfile ? 'HOME' : 'AUTH')}
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
