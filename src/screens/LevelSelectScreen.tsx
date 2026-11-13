import React from 'react';
import { Category, LevelInfo, PlayerProfile, ScreenState } from '../types/game';
import { getLevelConfig } from '../engine/gameCategories';
import { sounds } from '../utils/audio';

interface LevelSelectScreenProps {
  category: Category;
  user: PlayerProfile | null;
  onSelectLevel: (levelNum: number) => void;
  onNavigate: (screen: ScreenState) => void;
}

export const LevelSelectScreen: React.FC<LevelSelectScreenProps> = ({
  category,
  user,
  onSelectLevel,
  onNavigate
}) => {
  // Build the 50 levels with real lock/unlock status and real earned stars from active player's record
  const levels: LevelInfo[] = React.useMemo(() => {
    const list: LevelInfo[] = [];
    const completedMap = user?.completedLevels || {};

    let previousCompleted = true; // Stage 1 is always unlocked

    for (let i = 1; i <= 50; i++) {
      const cfg = getLevelConfig(category.id, i);
      const record = completedMap[`${category.id}_${i}`];

      const unlocked = previousCompleted || i === 1;
      const completed = !!record;
      const stars = record ? record.stars : 0;
      const bestTime = record ? record.bestTime : undefined;
      const bestScore = record ? record.score : undefined;

      list.push({
        ...cfg,
        unlocked,
        completed,
        stars,
        bestTime,
        bestScore
      });

      // Next stage unlocks only when this stage is completed
      previousCompleted = completed;
    }
    return list;
  }, [category.id, user]);

  return (
    <div
      dir="rtl"
      className="safe-screen fixed inset-0 z-40 w-full h-dvh bg-[#02131f] flex flex-col overflow-y-auto overflow-x-hidden select-none"
    >
      {/* Ambient blurred dark-teal backdrop for all device viewports */}
      <div
        className="fixed inset-0 bg-cover bg-center scale-110 blur-3xl opacity-30 pointer-events-none"
        style={{
          backgroundImage: `url('/assets/images/login_kuwaiti_mascot_1794483388654.jpg')`
        }}
      />
      <div className="fixed inset-0 bg-gradient-to-b from-[#031d2e]/90 via-[#021420]/95 to-[#010c14] pointer-events-none" />

      {/* Main Responsive Frame matching the Levels screenshot across phones, laptops & TVs */}
      <div className="relative z-10 w-full flex-1 flex flex-col bg-gradient-to-b from-[#031a28]/90 via-[#021420]/95 to-[#010d15]">
        
        {/* Top Skyline & Waving Kuwait Flag Header */}
        <div className="relative w-full h-48 sm:h-56 lg:h-64 shrink-0 overflow-hidden">
          <svg
            viewBox="0 0 500 225"
            className="absolute inset-0 w-full h-full object-cover"
            preserveAspectRatio="xMidYMid slice"
          >
            <defs>
              <linearGradient id="lvlSkyGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#02121d" />
                <stop offset="55%" stopColor="#062c43" />
                <stop offset="85%" stopColor="#0a4668" />
                <stop offset="100%" stopColor="#031826" />
              </linearGradient>
              <radialGradient id="centerTowerGlow" cx="48%" cy="55%" r="42%">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.45" />
                <stop offset="60%" stopColor="#0284c7" stopOpacity="0.15" />
                <stop offset="100%" stopColor="#02121d" stopOpacity="0" />
              </radialGradient>
              <linearGradient id="towerColumn" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#7dd3fc" />
                <stop offset="50%" stopColor="#e0f2fe" />
                <stop offset="100%" stopColor="#fde68a" />
              </linearGradient>
              <linearGradient id="flagGreen" x1="0" y1="0" x2="1" y2="0.3">
                <stop offset="0%" stopColor="#007a2f" />
                <stop offset="55%" stopColor="#00a642" />
                <stop offset="100%" stopColor="#006b29" />
              </linearGradient>
              <linearGradient id="flagWhite" x1="0" y1="0" x2="1" y2="0.2">
                <stop offset="0%" stopColor="#cbd5e1" />
                <stop offset="55%" stopColor="#ffffff" />
                <stop offset="100%" stopColor="#94a3b8" />
              </linearGradient>
              <linearGradient id="flagRed" x1="0" y1="0" x2="1" y2="0.3">
                <stop offset="0%" stopColor="#990f1c" />
                <stop offset="55%" stopColor="#d91629" />
                <stop offset="100%" stopColor="#7f0c17" />
              </linearGradient>
            </defs>

            {/* Night Sky Background */}
            <rect width="500" height="225" fill="url(#lvlSkyGrad)" />
            <rect width="500" height="225" fill="url(#centerTowerGlow)" />

            {/* Left Horizon City Silhouette */}
            <g fill="#083a57" opacity="0.85">
              <rect x="8" y="152" width="12" height="35" />
              <rect x="23" y="144" width="14" height="43" />
              <rect x="40" y="155" width="12" height="32" />
              {/* Left Distant Tower */}
              <polygon points="64,95 67,185 61,185" fill="#0d4e73" />
              <circle cx="64" cy="142" r="5.5" fill="#0d4e73" />
              <rect x="76" y="142" width="14" height="45" />
              <rect x="93" y="150" width="15" height="37" />
              <rect x="112" y="158" width="16" height="29" />
            </g>

            {/* Right Horizon City Silhouette */}
            <g fill="#052336" opacity="0.9">
              <rect x="392" y="148" width="14" height="38" />
              <rect x="410" y="138" width="16" height="48" />
              {/* Right Distant Kuwait Tower */}
              <polygon points="442,92 445,185 439,185" fill="#0a3954" />
              <circle cx="442" cy="138" r="7" fill="#0a3954" />
              <polygon points="462,76 466,185 458,185" fill="#0d496b" />
              <circle cx="462" cy="126" r="10.5" fill="#0d496b" />
              <circle cx="462" cy="103" r="6.5" fill="#0d496b" />
              <rect x="478" y="135" width="16" height="50" />
            </g>

            {/* Center Illuminated Kuwait Towers Island Cluster */}
            <g>
              {/* Center-Left Buildings */}
              <rect x="148" y="122" width="14" height="30" rx="1" fill="#0d4f75" />
              <rect x="163" y="88" width="24" height="58" rx="2" fill="#156794" stroke="#38bdf8" strokeWidth="0.8" />
              <rect x="190" y="114" width="14" height="32" fill="#0e547c" />

              {/* Left Kuwait Tower in Center Cluster */}
              <polygon points="216,24 222,145 210,145" fill="url(#towerColumn)" />
              <circle cx="216" cy="76" r="10.5" fill="#156794" stroke="#7dd3fc" strokeWidth="1.5" />

              {/* Middle Needle Tower */}
              <polygon points="234,62 238,145 230,145" fill="url(#towerColumn)" />
              <circle cx="234" cy="104" r="6" fill="#156794" stroke="#7dd3fc" strokeWidth="1.2" />

              {/* Main Tall Kuwait Tower with Glowing Sphere */}
              <polygon points="264,16 272,145 256,145" fill="url(#towerColumn)" />
              <circle cx="264" cy="56" r="6" fill="#38bdf8" />
              {/* Large Main Sphere with Textured Blue & Flag Accent */}
              <circle cx="264" cy="82" r="20" fill="#0e5882" stroke="#7dd3fc" strokeWidth="1.5" />
              <path d="M245,82 Q264,68 283,82 Q264,94 245,82 Z" fill="#38bdf8" opacity="0.45" />
              {/* Glowing Flag Emblem on Right Side of Sphere */}
              <path d="M268,74 Q282,72 290,78 L288,85 Q278,82 268,84 Z" fill="#009639" />
              <path d="M268,81 Q280,80 291,84 L290,90 Q278,88 268,89 Z" fill="#ffffff" />
              <path d="M268,87 Q280,86 289,91 L286,97 Q276,94 268,94 Z" fill="#ef4444" />

              {/* Right Thin Spire in Center Cluster */}
              <polygon points="286,78 290,145 282,145" fill="url(#towerColumn)" />

              {/* Dark Island Base Under Center Towers */}
              <path d="M132,145 Q235,138 320,146 L310,165 L142,165 Z" fill="#041c2c" stroke="#1e6087" strokeWidth="1" />
            </g>

            {/* Waving 3D Kuwait Flag on Top-Right with Red Ribbon Tail */}
            <g>
              {/* Trailing Red Ribbon Swooping Behind Title */}
              <path
                d="M312,155 C342,145 362,118 378,94 L402,112 C382,138 355,160 322,168 Z"
                fill="#991b1b"
                opacity="0.85"
              />
              {/* Green Top Band */}
              <path
                d="M352,44 C395,12 448,2 505,12 L505,45 C455,34 408,45 375,70 Z"
                fill="url(#flagGreen)"
              />
              {/* White Middle Band */}
              <path
                d="M375,70 C408,45 455,34 505,45 L505,78 C458,68 415,78 392,98 Z"
                fill="url(#flagWhite)"
              />
              {/* Red Bottom Band */}
              <path
                d="M392,98 C415,78 458,68 505,78 L505,112 C462,102 422,112 378,132 Z"
                fill="url(#flagRed)"
              />
              {/* Black Left Trapezoid */}
              <polygon
                points="352,44 375,70 392,98 378,132 346,96"
                fill="#070b10"
              />
            </g>

            {/* Curved Dark Navy Horizon Blending Into Grid */}
            <path d="M0,192 Q250,170 500,192 L500,225 L0,225 Z" fill="#031a28" />
            <path d="M0,204 Q250,186 500,204 L500,225 L0,225 Z" fill="#021420" />
          </svg>

          {/* Top-Left Circular Back Button */}
          <div dir="ltr" className="relative z-20 w-full max-w-6xl mx-auto px-5 sm:px-8 pt-5 flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                sounds.playTap();
                onNavigate('CATEGORIES');
              }}
              className="w-13 h-13 sm:w-14 sm:h-14 rounded-full bg-[#134663]/90 hover:bg-[#1a5b80] active:scale-95 transition-all border border-[#2f6e91] shadow-[0_6px_18px_rgba(0,0,0,0.6)] flex items-center justify-center text-white cursor-pointer"
              title="رجوع للتصنيفات"
            >
              <svg className="w-7 h-7 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="12 19 5 12 12 5" />
              </svg>
            </button>
          </div>

          {/* Centered Title: "مراحل الكويت" (or active category name) */}
          <div className="absolute inset-x-0 bottom-5 z-20 flex items-center justify-center text-center pointer-events-none px-4">
            <h1
              className="text-3xl sm:text-5xl font-black text-white tracking-tight"
              style={{
                textShadow: '0 4px 12px rgba(0,0,0,0.95), 0 2px 0 #021019, -2px -2px 0 #021019, 2px -2px 0 #021019, -2px 2px 0 #021019, 2px 2px 0 #021019'
              }}
            >
              {`مراحل ${category.name}`}
            </h1>
          </div>
        </div>

        {/* Adaptive Grid of Level Tiles (4 cols on phones, expanding up to 8-10 cols on laptops & TVs) */}
        <div
          dir="ltr"
          className="relative z-20 flex-1 w-full max-w-6xl xl:max-w-7xl mx-auto px-4 sm:px-8 pb-8 pt-2 grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-3 sm:gap-4 content-start"
        >
          {levels.map(lvl => {
            if (lvl.unlocked) {
              return (
                <button
                  key={lvl.levelNumber}
                  type="button"
                  onClick={() => {
                    sounds.playTap();
                    onSelectLevel(lvl.levelNumber);
                  }}
                  className="group relative aspect-square rounded-[22px] p-2 flex flex-col items-center justify-between transition-all duration-150 hover:-translate-y-0.5 active:scale-95 cursor-pointer"
                  style={{
                    background: 'linear-gradient(180deg, #062635 0%, #031520 65%, #020e16 100%)',
                    border: '2.5px solid #8ce619',
                    boxShadow:
                      '0 0 12px rgba(140, 230, 25, 0.25), inset 0 1.5px 3px rgba(190, 242, 100, 0.35), 0 6px 14px rgba(0, 0, 0, 0.65)'
                  }}
                >
                  {/* Level Number */}
                  <div className="flex-1 flex items-center justify-center pt-1">
                    <span className="text-2xl sm:text-[28px] font-black text-white tabular-nums leading-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
                      {lvl.levelNumber}
                    </span>
                  </div>

                  {/* 3 Stars Row at Bottom */}
                  <div className="w-full flex items-center justify-center gap-0.5 pb-0.5">
                    {[1, 2, 3].map(s => {
                      const isEarned = s <= lvl.stars;
                      return (
                        <svg
                          key={s}
                          className={`w-6 h-6 sm:w-6.5 sm:h-6.5 shrink-0 transition-transform ${
                            isEarned
                              ? 'drop-shadow-[0_0_6px_rgba(226,255,36,0.75)] scale-105'
                              : 'opacity-45'
                          }`}
                          viewBox="0 0 32 32"
                        >
                          {isEarned ? (
                            <>
                              {/* Glowing Yellow-Lime Earned Star */}
                              <path
                                d="M16 2.5 L20.2 10.6 L29.2 12.1 L22.8 18.5 L24.2 27.5 L16 23.4 L7.8 27.5 L9.2 18.5 L2.8 12.1 L11.8 10.6 Z"
                                fill="#dff916"
                                stroke="#4d7c0f"
                                strokeWidth="1.5"
                                strokeLinejoin="round"
                              />
                              {/* Bright Center Highlight */}
                              <circle cx="15" cy="14.5" r="3.2" fill="#fef9c3" opacity="0.85" />
                            </>
                          ) : (
                            /* Unearned Star Slot on Unlocked Stage */
                            <path
                              d="M16 2.5 L20.2 10.6 L29.2 12.1 L22.8 18.5 L24.2 27.5 L16 23.4 L7.8 27.5 L9.2 18.5 L2.8 12.1 L11.8 10.6 Z"
                              fill="#0a2838"
                              stroke="#2d6342"
                              strokeWidth="1.5"
                              strokeLinejoin="round"
                            />
                          )}
                        </svg>
                      );
                    })}
                  </div>
                </button>
              );
            }

            // Locked Stage Tile
            return (
              <button
                key={lvl.levelNumber}
                type="button"
                onClick={() => sounds.playError()}
                className="relative aspect-square rounded-[22px] p-2 flex items-center justify-center cursor-not-allowed transition-opacity active:scale-95"
                style={{
                  background: 'linear-gradient(180deg, #1b3649 0%, #132838 100%)',
                  border: '2px solid #395a70',
                  boxShadow:
                    'inset 0 1.5px 2px rgba(255, 255, 255, 0.2), 0 6px 14px rgba(0, 0, 0, 0.55)'
                }}
                title={`المرحلة ${lvl.levelNumber} مقفلة - أكمل المرحلة السابقة لفتحها`}
              >
                {/* Steel-Blue Padlock Icon with Keyhole matching the reference screenshot */}
                <svg className="w-10 h-10 sm:w-11 sm:h-11 drop-shadow-[0_3px_6px_rgba(0,0,0,0.45)]" viewBox="0 0 48 48">
                  {/* Shackle */}
                  <path
                    d="M16,22 V15 C16,10.5 19.5,7 24,7 C28.5,7 32,10.5 32,15 V22"
                    fill="none"
                    stroke="#8daec4"
                    strokeWidth="4.2"
                    strokeLinecap="round"
                  />
                  {/* Padlock Body */}
                  <rect
                    x="11"
                    y="21"
                    width="26"
                    height="20"
                    rx="4.5"
                    fill="#8daec4"
                  />
                  {/* Keyhole */}
                  <circle cx="24" cy="29.5" r="2.6" fill="#132838" />
                  <path d="M22.8,31 L22.2,36 H25.8 L25.2,31 Z" fill="#132838" />
                </svg>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
