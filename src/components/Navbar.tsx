import React from 'react';
import { ScreenState, PlayerProfile } from '../types/game';
import { Sparkles, Lightbulb, Coins, Tv, Volume2, VolumeX, User, ArrowRight } from 'lucide-react';
import { sounds } from '../utils/audio';

interface NavbarProps {
  currentScreen: ScreenState;
  onNavigate: (screen: ScreenState) => void;
  user: PlayerProfile | null;
  tvMode: boolean;
  onToggleTV: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentScreen,
  onNavigate,
  user,
  tvMode,
  onToggleTV,
  isMuted,
  onToggleMute
}) => {
  const showBack = currentScreen !== 'HOME' && currentScreen !== 'SPLASH';

  const handleBack = () => {
    sounds.playTap();
    if (currentScreen === 'GAME_SOLO' || currentScreen === 'LEVELS') {
      onNavigate('CATEGORIES');
    } else if (currentScreen === 'CATEGORIES' || currentScreen === 'GAME_LOCAL' || currentScreen === 'ONLINE_LOBBY') {
      onNavigate('MODE_SELECT');
    } else if (currentScreen === 'MODE_SELECT' || currentScreen === 'PROFILE' || currentScreen === 'LEADERBOARD' || currentScreen === 'SETTINGS') {
      onNavigate('HOME');
    } else {
      onNavigate('HOME');
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 md:px-8 py-3 transition-colors">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
        {/* Brand Zone */}
        <div className="flex items-center gap-3">
          {showBack && (
            <button
              onClick={handleBack}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
              title="رجوع"
              aria-label="رجوع"
            >
              <ArrowRight className="w-5 h-5" />
            </button>
          )}
          <button
            onClick={() => {
              sounds.playTap();
              onNavigate('HOME');
            }}
            className="flex items-center gap-2 group text-right"
          >
            <span className="text-2xl font-black tracking-tight text-white group-hover:text-amber-400 transition-colors">
              فتّشها
            </span>
            <span className="hidden sm:inline text-xs font-semibold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/20">
              تحداك في كل كلمة
            </span>
          </button>
        </div>

        {/* Center Nav Links */}
        <nav className="hidden lg:flex items-center gap-6 text-sm font-medium text-slate-300">
          <button
            onClick={() => {
              sounds.playTap();
              onNavigate('MODE_SELECT');
            }}
            className={`hover:text-amber-400 transition-colors whitespace-nowrap ${currentScreen === 'MODE_SELECT' ? 'text-amber-400 font-bold' : ''}`}
          >
            العب الآن
          </button>
          <button
            onClick={() => {
              sounds.playTap();
              onNavigate('CATEGORIES');
            }}
            className={`hover:text-amber-400 transition-colors whitespace-nowrap ${currentScreen === 'CATEGORIES' ? 'text-amber-400 font-bold' : ''}`}
          >
            المراحل
          </button>
          <button
            onClick={() => {
              sounds.playTap();
              onNavigate('LEADERBOARD');
            }}
            className={`hover:text-amber-400 transition-colors whitespace-nowrap ${currentScreen === 'LEADERBOARD' ? 'text-amber-400 font-bold' : ''}`}
          >
            المتصدرين
          </button>
          <button
            onClick={() => {
              sounds.playTap();
              onNavigate('SETTINGS');
            }}
            className={`hover:text-amber-400 transition-colors whitespace-nowrap ${currentScreen === 'SETTINGS' ? 'text-amber-400 font-bold' : ''}`}
          >
            الإعدادات
          </button>
        </nav>

        {/* User Stats & Controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          {user && (
            <div className="hidden sm:flex items-center gap-3 bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700/60 text-xs">
              <div className="flex items-center gap-1.5 text-amber-300 font-bold" title="العملات الذهبية">
                <Coins className="w-3.5 h-3.5 text-amber-400" />
                <span>{user.coins}</span>
              </div>
              <span className="text-slate-600">|</span>
              <div className="flex items-center gap-1.5 text-cyan-300 font-bold" title="التلميحات المتبقية">
                <Lightbulb className="w-3.5 h-3.5 text-cyan-400" />
                <span>{user.hintsRemaining}</span>
              </div>
            </div>
          )}

          {/* TV Mode Toggle */}
          <button
            onClick={() => {
              sounds.playTap();
              onToggleTV();
            }}
            className={`p-2 rounded-lg border text-xs font-semibold transition-all flex items-center gap-1.5 ${
              tvMode 
                ? 'bg-sky-500/20 text-sky-300 border-sky-500/40' 
                : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
            }`}
            title="وضع التلفزيون والريموت"
          >
            <Tv className="w-4 h-4" />
            <span className="hidden md:inline">{tvMode ? 'وضع التلفزيون: مفعل' : 'وضع TV'}</span>
          </button>

          {/* Mute Toggle */}
          <button
            onClick={() => {
              sounds.playTap();
              onToggleMute();
            }}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white transition-colors"
            title={isMuted ? 'تشغيل الصوت' : 'كتم الصوت'}
            aria-label={isMuted ? 'تشغيل الصوت' : 'كتم الصوت'}
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
          </button>

          {/* Profile Shortcut */}
          {user ? (
            <button
              onClick={() => {
                sounds.playTap();
                onNavigate('PROFILE');
              }}
              className="flex items-center gap-2 p-1 pr-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 transition-colors"
            >
              <img
                src={user.avatar}
                alt={user.displayName}
                className="w-7 h-7 rounded-full object-cover border border-amber-400"
              />
              <span className="hidden sm:inline text-xs font-bold text-amber-300 truncate max-w-[90px]">
                {user.displayName}
              </span>
            </button>
          ) : (
            <button
              onClick={() => {
                sounds.playTap();
                onNavigate('AUTH');
              }}
              className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-colors"
            >
              <User className="w-4 h-4" />
              <span>دخول</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
