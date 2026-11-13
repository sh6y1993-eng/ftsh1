import React from 'react';
import { Category, PlayerProfile, ScreenState } from '../types/game';
import { CATEGORIES } from '../engine/gameCategories';
import { sounds } from '../utils/audio';

interface CategoryScreenProps {
  user: PlayerProfile | null;
  onSelectCategory: (category: Category) => void;
  onNavigate: (screen: ScreenState) => void;
}

const CategoryArtwork: React.FC<{ categoryId: string }> = ({ categoryId }) => {
  switch (categoryId) {
    case 'kuwait_heritage':
      // الكويت: Circular Kuwait Flag + Top-Left Sparkle + Top-Right Orange Star Badge
      return (
        <div className="relative w-20 h-20 sm:w-22 sm:h-22 flex items-center justify-center">
          {/* White 4-point sparkle top-left */}
          <svg className="absolute -top-0.5 left-0.5 w-4 h-4 text-white drop-shadow" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2 L14.5 9.5 L22 12 L14.5 14.5 L12 22 L9.5 14.5 L2 12 L9.5 9.5 Z" />
          </svg>
          {/* Orange circle with dark star top-right */}
          <div className="absolute -top-1 -right-1 z-10 w-6 h-6 rounded-full bg-gradient-to-b from-[#ff6b35] to-[#e04819] border border-[#ff9e75] shadow-md flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-[#082536]" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l2.9 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l7.1-1.01L12 2z" />
            </svg>
          </div>
          {/* Circular Kuwait Flag */}
          <svg className="w-18 h-18 sm:w-20 sm:h-20 drop-shadow-[0_6px_10px_rgba(0,0,0,0.6)]" viewBox="0 0 100 100">
            <defs>
              <clipPath id="kwFlagCircle">
                <circle cx="50" cy="50" r="44" />
              </clipPath>
              <radialGradient id="kwGloss" cx="35%" cy="25%" r="65%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.35" />
                <stop offset="60%" stopColor="#ffffff" stopOpacity="0.0" />
                <stop offset="100%" stopColor="#000000" stopOpacity="0.25" />
              </radialGradient>
            </defs>
            <g clipPath="url(#kwFlagCircle)">
              {/* Top Green Stripe */}
              <rect x="0" y="0" width="100" height="36" fill="#009639" />
              {/* Middle White Stripe */}
              <rect x="0" y="36" width="100" height="28" fill="#f8fafc" />
              {/* Bottom Red Stripe */}
              <rect x="0" y="64" width="100" height="36" fill="#ce1126" />
              {/* Left Black Trapezoid */}
              <polygon points="0,0 34,36 34,64 0,100" fill="#0a0a0a" />
              {/* 3D Gloss Overlay */}
              <circle cx="50" cy="50" r="44" fill="url(#kwGloss)" />
            </g>
            <circle cx="50" cy="50" r="44" fill="none" stroke="#041521" strokeWidth="4" />
          </svg>
        </div>
      );

    case 'geography_world':
      // معلومات عامة: Glowing Yellow Lightbulb with 6 rays
      return (
        <div className="relative w-20 h-20 sm:w-22 sm:h-22 flex items-center justify-center">
          <svg className="w-20 h-20 sm:w-22 sm:h-22 drop-shadow-[0_6px_12px_rgba(250,204,21,0.35)]" viewBox="0 0 100 100">
            <defs>
              <radialGradient id="bulbGrad" cx="45%" cy="38%" r="55%">
                <stop offset="0%" stopColor="#fef08a" />
                <stop offset="55%" stopColor="#facc15" />
                <stop offset="100%" stopColor="#eab308" />
              </radialGradient>
            </defs>
            {/* 6 Light Rays */}
            <line x1="16" y1="26" x2="25" y2="31" stroke="#facc15" strokeWidth="5" strokeLinecap="round" />
            <line x1="12" y1="45" x2="22" y2="45" stroke="#facc15" strokeWidth="5" strokeLinecap="round" />
            <line x1="84" y1="26" x2="75" y2="31" stroke="#facc15" strokeWidth="5" strokeLinecap="round" />
            <line x1="88" y1="45" x2="78" y2="45" stroke="#facc15" strokeWidth="5" strokeLinecap="round" />
            {/* Bulb Glass */}
            <path
              d="M50,14 C33,14 23,26 23,41 C23,51 30,58 35,65 C37,68 38,72 38,75 H62 C62,72 63,68 65,65 C70,58 77,51 77,41 C77,26 67,14 50,14 Z"
              fill="url(#bulbGrad)"
              stroke="#051824"
              strokeWidth="4"
              strokeLinejoin="round"
            />
            {/* Inner Filament */}
            <path
              d="M45,74 V54 C45,49 41,47 41,44 C41,41 44,39 46,42 L50,47 L54,42 C56,39 59,41 59,44 C59,47 55,49 55,54 V74"
              fill="none"
              stroke="#713f12"
              strokeWidth="2.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* White Specular Highlight */}
            <path d="M33,30 C30,35 29,41 31,46" fill="none" stroke="#ffffff" strokeWidth="3.5" strokeLinecap="round" opacity="0.7" />
            {/* Screw Base */}
            <rect x="38" y="75" width="24" height="7" rx="3" fill="#94a3b8" stroke="#051824" strokeWidth="3.5" />
            <rect x="40" y="82" width="20" height="6" rx="3" fill="#64748b" stroke="#051824" strokeWidth="3.5" />
            <path d="M44,88 C44,92 56,92 56,88 Z" fill="#334155" stroke="#051824" strokeWidth="3" />
          </svg>
        </div>
      );

    case 'sports_championships':
      // رياضة: Classic 3D Soccer Ball + Top-Left Sparkle + Top-Right Orange Star Badge
      return (
        <div className="relative w-20 h-20 sm:w-22 sm:h-22 flex items-center justify-center">
          {/* Gold 4-point sparkle top-left */}
          <svg className="absolute -top-0.5 left-0.5 w-4 h-4 text-[#fde047] drop-shadow" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2 L14.5 9.5 L22 12 L14.5 14.5 L12 22 L9.5 14.5 L2 12 L9.5 9.5 Z" />
          </svg>
          {/* Orange circle with dark star top-right */}
          <div className="absolute -top-1 -right-1 z-10 w-6 h-6 rounded-full bg-gradient-to-b from-[#ff6b35] to-[#e04819] border border-[#ff9e75] shadow-md flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-[#082536]" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l2.9 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l7.1-1.01L12 2z" />
            </svg>
          </div>
          {/* Soccer Ball SVG */}
          <svg className="w-18 h-18 sm:w-20 sm:h-20 drop-shadow-[0_6px_10px_rgba(0,0,0,0.65)]" viewBox="0 0 100 100">
            <defs>
              <radialGradient id="ballGrad" cx="38%" cy="30%" r="65%">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="70%" stopColor="#e2e8f0" />
                <stop offset="100%" stopColor="#94a3b8" />
              </radialGradient>
            </defs>
            <circle cx="50" cy="50" r="44" fill="url(#ballGrad)" stroke="#051824" strokeWidth="4" />
            {/* Center Black Pentagon */}
            <polygon points="50,33 66,44 60,63 40,63 34,44" fill="#0f172a" stroke="#0f172a" strokeWidth="1.5" />
            {/* Seam lines */}
            <line x1="50" y1="33" x2="50" y2="16" stroke="#0f172a" strokeWidth="3.5" />
            <line x1="66" y1="44" x2="83" y2="38" stroke="#0f172a" strokeWidth="3.5" />
            <line x1="60" y1="63" x2="73" y2="78" stroke="#0f172a" strokeWidth="3.5" />
            <line x1="40" y1="63" x2="27" y2="78" stroke="#0f172a" strokeWidth="3.5" />
            <line x1="34" y1="44" x2="17" y2="38" stroke="#0f172a" strokeWidth="3.5" />
            {/* Outer Black Patches */}
            <polygon points="38,10 50,17 62,10 57,6 43,6" fill="#0f172a" />
            <polygon points="82,25 82,40 93,46 92,33" fill="#0f172a" />
            <polygon points="18,25 18,40 7,46 8,33" fill="#0f172a" />
            <polygon points="69,77 83,73 87,82 74,90" fill="#0f172a" />
            <polygon points="31,77 17,73 13,82 26,90" fill="#0f172a" />
            <circle cx="50" cy="50" r="44" fill="none" stroke="#051824" strokeWidth="4" />
          </svg>
        </div>
      );

    case 'animals_nature':
      // أفلام ومسلسلات: Movie Clapperboard
      return (
        <div className="relative w-20 h-20 sm:w-22 sm:h-22 flex items-center justify-center">
          <svg className="w-19 h-19 sm:w-21 sm:h-21 drop-shadow-[0_6px_10px_rgba(0,0,0,0.65)]" viewBox="0 0 100 100">
            {/* Top Clapper Stick (Tilted) */}
            <g transform="rotate(-14 22 36)">
              <rect x="16" y="18" width="68" height="14" rx="3" fill="#1e293b" stroke="#051824" strokeWidth="3.5" />
              <polygon points="24,18 36,18 28,32 16,32" fill="#f8fafc" />
              <polygon points="46,18 58,18 50,32 38,32" fill="#f8fafc" />
              <polygon points="68,18 80,18 72,32 60,32" fill="#f8fafc" />
              <rect x="16" y="18" width="68" height="14" rx="3" fill="none" stroke="#051824" strokeWidth="3.5" />
            </g>
            {/* Bottom Board Base */}
            <rect x="16" y="36" width="68" height="50" rx="5" fill="#1e293b" stroke="#051824" strokeWidth="3.5" />
            {/* Top Stripe on Base */}
            <rect x="16" y="36" width="68" height="12" rx="2" fill="#0f172a" stroke="#051824" strokeWidth="3" />
            <polygon points="24,48 36,48 44,36 32,36" fill="#f8fafc" />
            <polygon points="46,48 58,48 66,36 54,36" fill="#f8fafc" />
            <polygon points="68,48 80,48 84,41 84,36 76,36" fill="#f8fafc" />
            {/* Slate Horizontal Lines */}
            <line x1="24" y1="60" x2="76" y2="60" stroke="#cbd5e1" strokeWidth="3" strokeLinecap="round" />
            <line x1="24" y1="71" x2="76" y2="71" stroke="#cbd5e1" strokeWidth="3" strokeLinecap="round" />
            <circle cx="27" cy="65.5" r="2.2" fill="#f8fafc" />
            <circle cx="27" cy="77.5" r="2.2" fill="#f8fafc" />
            {/* Hinge Triangle on Left */}
            <path d="M16,28 L30,36 L16,46 Z" fill="#0f172a" stroke="#051824" strokeWidth="3" strokeLinejoin="round" />
            <circle cx="20" cy="37" r="2" fill="#f8fafc" />
          </svg>
        </div>
      );

    case 'science_space':
      // تاريخ: Golden Sandstone Historical Castle / Fortress Gate
      return (
        <div className="relative w-20 h-20 sm:w-22 sm:h-22 flex items-center justify-center">
          <svg className="w-19 h-19 sm:w-21 sm:h-21 drop-shadow-[0_6px_10px_rgba(0,0,0,0.65)]" viewBox="0 0 100 100">
            <defs>
              <linearGradient id="sandstone" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#fcd34d" />
                <stop offset="50%" stopColor="#f59e0b" />
                <stop offset="100%" stopColor="#b45309" />
              </linearGradient>
            </defs>
            {/* Central Wall Body */}
            <rect x="28" y="30" width="44" height="56" fill="url(#sandstone)" stroke="#051824" strokeWidth="3.5" />
            {/* Center Crenellations */}
            <rect x="38" y="20" width="7" height="12" fill="#fbbf24" stroke="#051824" strokeWidth="3" />
            <rect x="47" y="20" width="6" height="12" fill="#fbbf24" stroke="#051824" strokeWidth="3" />
            <rect x="55" y="20" width="7" height="12" fill="#fbbf24" stroke="#051824" strokeWidth="3" />
            {/* Left Tower */}
            <polygon points="16,20 34,20 32,86 14,86" fill="url(#sandstone)" stroke="#051824" strokeWidth="3.5" strokeLinejoin="round" />
            <rect x="16" y="14" width="5" height="8" fill="#fde68a" stroke="#051824" strokeWidth="2.5" />
            <rect x="23" y="14" width="5" height="8" fill="#fde68a" stroke="#051824" strokeWidth="2.5" />
            <rect x="29" y="14" width="5" height="8" fill="#fde68a" stroke="#051824" strokeWidth="2.5" />
            {/* Right Tower */}
            <polygon points="66,20 84,20 86,86 68,86" fill="url(#sandstone)" stroke="#051824" strokeWidth="3.5" strokeLinejoin="round" />
            <rect x="66" y="14" width="5" height="8" fill="#fde68a" stroke="#051824" strokeWidth="2.5" />
            <rect x="72" y="14" width="5" height="8" fill="#fde68a" stroke="#051824" strokeWidth="2.5" />
            <rect x="79" y="14" width="5" height="8" fill="#fde68a" stroke="#051824" strokeWidth="2.5" />
            {/* Tower Windows */}
            <rect x="22" y="38" width="4" height="8" rx="2" fill="#451a03" />
            <rect x="74" y="38" width="4" height="8" rx="2" fill="#451a03" />
            <rect x="48" y="38" width="4" height="7" rx="2" fill="#451a03" />
            {/* Central Archway Gate */}
            <path d="M39,86 V64 C39,55 61,55 61,64 V86 Z" fill="#081c29" stroke="#051824" strokeWidth="3.5" />
          </svg>
        </div>
      );

    case 'islamic_values':
      // دين وثقافة: Golden Domed Mosque with 2 Minarets
      return (
        <div className="relative w-20 h-20 sm:w-22 sm:h-22 flex items-center justify-center">
          <svg className="w-20 h-20 sm:w-22 sm:h-22 drop-shadow-[0_6px_10px_rgba(0,0,0,0.65)]" viewBox="0 0 100 100">
            <defs>
              <linearGradient id="goldDome" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#fef08a" />
                <stop offset="50%" stopColor="#facc15" />
                <stop offset="100%" stopColor="#d97706" />
              </linearGradient>
            </defs>
            {/* Left Minaret */}
            <rect x="16" y="32" width="12" height="54" fill="#f1f5f9" stroke="#051824" strokeWidth="3" />
            <rect x="14" y="54" width="16" height="5" rx="1.5" fill="#f59e0b" stroke="#051824" strokeWidth="2.5" />
            <path d="M16,32 C16,22 28,22 28,32 Z" fill="url(#goldDome)" stroke="#051824" strokeWidth="2.8" />
            <line x1="22" y1="16" x2="22" y2="23" stroke="#facc15" strokeWidth="2.5" strokeLinecap="round" />
            {/* Right Minaret */}
            <rect x="72" y="32" width="12" height="54" fill="#f1f5f9" stroke="#051824" strokeWidth="3" />
            <rect x="70" y="54" width="16" height="5" rx="1.5" fill="#f59e0b" stroke="#051824" strokeWidth="2.5" />
            <path d="M72,32 C72,22 84,22 84,32 Z" fill="url(#goldDome)" stroke="#051824" strokeWidth="2.8" />
            <line x1="78" y1="16" x2="78" y2="23" stroke="#facc15" strokeWidth="2.5" strokeLinecap="round" />
            {/* Main Central Dome */}
            <path
              d="M27,54 C27,31 50,24 50,18 C50,24 73,31 73,54 Z"
              fill="url(#goldDome)"
              stroke="#051824"
              strokeWidth="3.5"
              strokeLinejoin="round"
            />
            <circle cx="50" cy="14" r="3" fill="#facc15" stroke="#051824" strokeWidth="2" />
            {/* Mosque Main White Building */}
            <rect x="25" y="54" width="50" height="32" rx="2" fill="#f8fafc" stroke="#051824" strokeWidth="3.5" />
            {/* Central Arch Doorway */}
            <path d="M40,86 V68 C40,59 60,59 60,68 V86 Z" fill="#1e3a5f" stroke="#051824" strokeWidth="3" />
            <line x1="50" y1="61" x2="50" y2="86" stroke="#051824" strokeWidth="2.5" />
            {/* Side Windows */}
            <rect x="30" y="64" width="5" height="12" rx="2.5" fill="#64748b" />
            <rect x="65" y="64" width="5" height="12" rx="2.5" fill="#64748b" />
          </svg>
        </div>
      );

    case 'food_cuisine':
      // طعام: Sesame Burger
      return (
        <div className="relative w-20 h-20 sm:w-22 sm:h-22 flex items-center justify-center">
          <svg className="w-20 h-20 sm:w-22 sm:h-22 drop-shadow-[0_6px_10px_rgba(0,0,0,0.65)]" viewBox="0 0 100 100">
            <defs>
              <linearGradient id="bunTop" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#fcd34d" />
                <stop offset="65%" stopColor="#f59e0b" />
                <stop offset="100%" stopColor="#d97706" />
              </linearGradient>
            </defs>
            {/* Top Sesame Bun */}
            <path
              d="M16,46 C16,22 84,22 84,46 Z"
              fill="url(#bunTop)"
              stroke="#051824"
              strokeWidth="3.5"
              strokeLinejoin="round"
            />
            {/* Sesame Seeds */}
            <ellipse cx="38" cy="32" rx="3" ry="1.5" fill="#fef3c7" transform="rotate(-15 38 32)" />
            <ellipse cx="50" cy="29" rx="3" ry="1.5" fill="#fef3c7" />
            <ellipse cx="62" cy="33" rx="3" ry="1.5" fill="#fef3c7" transform="rotate(15 62 33)" />
            <ellipse cx="45" cy="38" rx="3" ry="1.5" fill="#fef3c7" transform="rotate(10 45 38)" />
            <ellipse cx="57" cy="39" rx="3" ry="1.5" fill="#fef3c7" transform="rotate(-10 57 39)" />
            {/* Green Wavy Lettuce */}
            <path
              d="M12,48 Q20,43 28,49 T44,49 T60,49 T76,49 T88,48 C90,52 86,56 80,55 H20 C14,56 10,52 12,48 Z"
              fill="#84cc16"
              stroke="#051824"
              strokeWidth="3"
            />
            {/* Melted Yellow Cheese */}
            <polygon points="18,54 82,54 78,60 54,60 48,66 42,60 22,60" fill="#facc15" stroke="#051824" strokeWidth="2.8" strokeLinejoin="round" />
            {/* Grilled Burger Patty */}
            <rect x="15" y="59" width="70" height="12" rx="6" fill="#78350f" stroke="#051824" strokeWidth="3.5" />
            {/* Tomato / Sauce Strip */}
            <rect x="20" y="69" width="60" height="5" rx="2.5" fill="#ef4444" stroke="#051824" strokeWidth="2.5" />
            {/* Bottom Bun */}
            <path
              d="M18,73 H82 C82,84 72,87 50,87 C28,87 18,84 18,73 Z"
              fill="url(#bunTop)"
              stroke="#051824"
              strokeWidth="3.5"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      );

    case 'tech_future':
      // تكنولوجيا: Silver-Blue Open Laptop
      return (
        <div className="relative w-20 h-20 sm:w-22 sm:h-22 flex items-center justify-center">
          <svg className="w-20 h-20 sm:w-22 sm:h-22 drop-shadow-[0_6px_10px_rgba(0,0,0,0.65)]" viewBox="0 0 100 100">
            <defs>
              <linearGradient id="laptopScreen" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#60a5fa" />
                <stop offset="50%" stopColor="#3b82f6" />
                <stop offset="100%" stopColor="#1d4ed8" />
              </linearGradient>
            </defs>
            {/* Outer Lid Frame */}
            <rect x="20" y="20" width="60" height="44" rx="4" fill="#cbd5e1" stroke="#051824" strokeWidth="3.5" />
            {/* Inner Dark Bezel */}
            <rect x="24" y="24" width="52" height="36" rx="2" fill="#0f172a" />
            {/* Glowing Blue Display */}
            <rect x="26" y="26" width="48" height="32" rx="1.5" fill="url(#laptopScreen)" />
            {/* Diagonal Screen Reflection */}
            <polygon points="26,26 52,26 36,58 26,58" fill="#93c5fd" opacity="0.35" />
            {/* Keyboard Base Trapezoid */}
            <polygon
              points="20,64 80,64 90,77 10,77"
              fill="#e2e8f0"
              stroke="#051824"
              strokeWidth="3.5"
              strokeLinejoin="round"
            />
            {/* Keyboard Keys Grid */}
            <polygon points="24,67 76,67 81,72 19,72" fill="#475569" />
            {/* Trackpad */}
            <rect x="43" y="73" width="14" height="2.5" rx="1" fill="#64748b" />
            {/* Laptop Bottom Lip */}
            <rect x="10" y="77" width="80" height="5" rx="2.5" fill="#94a3b8" stroke="#051824" strokeWidth="3" />
          </svg>
        </div>
      );

    case 'kuwait_proverbs':
    default:
      // ألغاز ومعلومات: Glowing Blue Question Bubble + White Sparkle
      return (
        <div className="relative w-20 h-20 sm:w-22 sm:h-22 flex items-center justify-center">
          <svg className="w-20 h-20 sm:w-22 sm:h-22 drop-shadow-[0_6px_12px_rgba(14,165,233,0.4)]" viewBox="0 0 100 100">
            <defs>
              <radialGradient id="qBubble" cx="38%" cy="30%" r="65%">
                <stop offset="0%" stopColor="#7dd3fc" />
                <stop offset="45%" stopColor="#0ea5e9" />
                <stop offset="100%" stopColor="#0369a1" />
              </radialGradient>
            </defs>
            {/* Main Blue Circle */}
            <circle cx="50" cy="50" r="38" fill="url(#qBubble)" stroke="#051824" strokeWidth="4" />
            {/* Top-left Gloss Arc */}
            <path d="M26,34 A30,30 0 0,1 66,24" fill="none" stroke="#bae6fd" strokeWidth="4" strokeLinecap="round" opacity="0.65" />
            {/* White 4-point Sparkle on Top-Left Rim */}
            <path d="M22,14 L25,23 L34,26 L25,29 L22,38 L19,29 L10,26 L19,23 Z" fill="#ffffff" />
            {/* Small Speech Tail / Quote Blob on Bottom-Right */}
            <path
              d="M72,66 C79,66 84,71 84,77 C84,84 77,89 69,89 C66,89 65,86 68,84 C71,82 72,79 70,76 C67,73 67,66 72,66 Z"
              fill="#38bdf8"
              stroke="#051824"
              strokeWidth="3"
            />
            {/* Bold White Question Mark */}
            <path
              d="M41,38 C41,31 46,27 52,27 C58,27 63,31 63,37 C63,42 59,45 55,48 C52,50 51,52 51,56"
              fill="none"
              stroke="#ffffff"
              strokeWidth="7.5"
              strokeLinecap="round"
            />
            <circle cx="51" cy="68" r="4.5" fill="#ffffff" />
          </svg>
        </div>
      );
  }
};

export const CategoryScreen: React.FC<CategoryScreenProps> = ({
  user,
  onSelectCategory,
  onNavigate
}) => {
  // Calculate real completed levels & stars per category from active player's record
  const getCategoryStats = (catId: string) => {
    if (!user) return { completed: 0, stars: 0 };

    let completed = 0;
    let stars = 0;

    for (let i = 1; i <= 50; i++) {
      const key = `${catId}_${i}`;
      const record = user.completedLevels?.[key];
      if (record) {
        completed++;
        stars += record.stars;
      }
    }

    return { completed, stars };
  };

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

      {/* Main Responsive Container matching the Categories design across phones, laptops & TVs */}
      <div className="relative z-10 w-full flex-1 flex flex-col bg-gradient-to-b from-[#031b2b]/90 via-[#021522]/95 to-[#010e17]">
        
        {/* Top Skyline Header with Back Button & "التصنيفات" Title */}
        <div className="relative w-full h-44 sm:h-52 lg:h-60 shrink-0 overflow-hidden">
          {/* Kuwait Skyline & Glowing Towers Illustration */}
          <svg
            viewBox="0 0 500 210"
            className="absolute inset-0 w-full h-full object-cover"
            preserveAspectRatio="xMidYMid slice"
          >
            <defs>
              <linearGradient id="catSkyGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#02131f" />
                <stop offset="55%" stopColor="#062c43" />
                <stop offset="85%" stopColor="#0a4668" />
                <stop offset="100%" stopColor="#021522" />
              </linearGradient>
              <radialGradient id="cityGlow" cx="65%" cy="62%" r="45%">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.45" />
                <stop offset="60%" stopColor="#0284c7" stopOpacity="0.15" />
                <stop offset="100%" stopColor="#02131f" stopOpacity="0" />
              </radialGradient>
              <linearGradient id="spireGold" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#38bdf8" />
                <stop offset="55%" stopColor="#bae6fd" />
                <stop offset="100%" stopColor="#fef08a" />
              </linearGradient>
            </defs>

            {/* Night Sky Base */}
            <rect width="500" height="210" fill="url(#catSkyGrad)" />
            <rect width="500" height="210" fill="url(#cityGlow)" />

            {/* Distant Left Silhouette Buildings */}
            <g fill="#06263a" opacity="0.85">
              <rect x="35" y="128" width="16" height="45" />
              <rect x="54" y="118" width="14" height="55" />
              <rect x="72" y="134" width="18" height="39" />
              <rect x="175" y="115" width="18" height="55" />
              <rect x="196" y="102" width="22" height="68" />
              <rect x="222" y="120" width="15" height="50" />
            </g>

            {/* Center Kuwait Towers with Kuwait Flag Sphere */}
            <g>
              {/* Left thin spire in center cluster */}
              <polygon points="234,54 237,162 231,162" fill="url(#spireGold)" opacity="0.85" />
              <circle cx="234" cy="108" r="6" fill="#0d4a6e" stroke="#38bdf8" strokeWidth="1" />

              {/* Main Center Flag Tower */}
              <polygon points="256,14 261,162 251,162" fill="url(#spireGold)" />
              {/* Upper Sphere */}
              <circle cx="256" cy="68" r="9.5" fill="#0c4a6e" stroke="#7dd3fc" strokeWidth="1.2" />
              {/* Flag-Wrapped Main Sphere */}
              <g>
                <circle cx="262" cy="96" r="15" fill="#f8fafc" />
                <path d="M247,90 Q262,80 277,90 L277,81 L247,81 Z" fill="#009639" />
                <path d="M247,102 Q262,112 277,102 L277,111 L247,111 Z" fill="#ce1126" />
                <polygon points="247,83 256,91 256,101 247,109" fill="#0f172a" />
                <circle cx="262" cy="96" r="15" fill="none" stroke="#38bdf8" strokeWidth="1.2" />
              </g>

              {/* Secondary Center Tower */}
              <polygon points="272,42 276,162 268,162" fill="url(#spireGold)" />
            </g>

            {/* Right Illuminated Kuwait Towers & Skyline */}
            <g>
              <rect x="348" y="122" width="18" height="45" fill="#093854" />
              <rect x="370" y="112" width="15" height="55" fill="#0c4769" />
              {/* Right Tower 1 */}
              <polygon points="395,52 399,165 391,165" fill="url(#spireGold)" />
              <circle cx="395" cy="104" r="10.5" fill="#0d4a6e" stroke="#7dd3fc" strokeWidth="1.2" />
              <circle cx="395" cy="80" r="6.5" fill="#0d4a6e" stroke="#7dd3fc" strokeWidth="1" />
              {/* Middle needle */}
              <polygon points="413,74 416,165 410,165" fill="url(#spireGold)" />
              {/* Tallest Right Kuwait Tower */}
              <polygon points="432,12 438,165 426,165" fill="url(#spireGold)" />
              <circle cx="432" cy="86" r="16" fill="#0d4a6e" stroke="#7dd3fc" strokeWidth="1.5" />
              <circle cx="432" cy="54" r="10" fill="#0d4a6e" stroke="#7dd3fc" strokeWidth="1.2" />
              {/* Far Right Buildings */}
              <rect x="448" y="102" width="16" height="63" fill="#0c4769" />
              <rect x="467" y="114" width="20" height="51" fill="#08334c" />
            </g>

            {/* Dark Water Horizon Waves & Vignette Fade */}
            <path d="M0,158 Q140,144 280,156 T500,154 L500,210 L0,210 Z" fill="#031a28" />
            <path d="M0,174 Q250,162 500,174 L500,210 L0,210 Z" fill="#021522" />
          </svg>

          {/* Top-Left Circular Back Button matching the reference screenshot */}
          <div dir="ltr" className="relative z-20 w-full max-w-6xl mx-auto px-5 sm:px-8 pt-5 flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                sounds.playTap();
                onNavigate('HOME');
              }}
              className="w-13 h-13 sm:w-14 sm:h-14 rounded-full bg-[#134663]/90 hover:bg-[#1a5b80] active:scale-95 transition-all border border-[#2f6e91] shadow-[0_6px_18px_rgba(0,0,0,0.6)] flex items-center justify-center text-white cursor-pointer"
              title="رجوع للرئيسية"
            >
              <svg className="w-7 h-7 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="12 19 5 12 12 5" />
              </svg>
            </button>
          </div>

          {/* Centered "التصنيفات" Title overlapping the skyline base */}
          <div className="absolute inset-x-0 bottom-3 z-20 flex flex-col items-center justify-center text-center pointer-events-none">
            <h1 className="text-4xl sm:text-5xl font-black text-white tracking-tight drop-shadow-[0_4px_12px_rgba(0,0,0,0.95)]">
              التصنيفات
            </h1>
          </div>
        </div>

        {/* 3x3 Grid of 9 Category Cards matching the reference design across all viewports */}
        <div
          dir="ltr"
          className="relative z-20 flex-1 w-full max-w-5xl xl:max-w-6xl mx-auto px-4 sm:px-8 pb-8 pt-2 grid grid-cols-3 gap-3 sm:gap-5 lg:gap-6 content-start"
        >
          {CATEGORIES.map(category => {
            const stats = getCategoryStats(category.id);

            return (
              <button
                key={category.id}
                type="button"
                onClick={() => {
                  sounds.playTap();
                  onSelectCategory(category);
                }}
                className="group relative rounded-[24px] sm:rounded-[28px] p-2.5 sm:p-4 flex flex-col items-center justify-between min-h-[168px] sm:min-h-[195px] lg:min-h-[215px] transition-all duration-200 hover:-translate-y-1 active:scale-[0.97] cursor-pointer overflow-hidden"
                style={{
                  background: 'linear-gradient(180deg, #0b4666 0%, #062b41 52%, #031a29 100%)',
                  border: '2px solid #3c86ad',
                  boxShadow:
                    'inset 0 2px 3px rgba(186, 230, 253, 0.45), inset 0 -3px 6px rgba(2, 12, 20, 0.8), 0 8px 20px rgba(0, 0, 0, 0.65)'
                }}
              >
                {/* Top Glossy Specular Highlight Arc */}
                <div
                  className="absolute inset-x-3 top-0.5 h-6 rounded-t-full pointer-events-none opacity-35"
                  style={{
                    background: 'linear-gradient(180deg, rgba(255,255,255,0.45) 0%, transparent 100%)'
                  }}
                />

                {/* Real Earned Stars Pill if Player has completed stages in this category */}
                {stats.stars > 0 && (
                  <div className="absolute top-1.5 left-2 z-20 px-1.5 py-0.5 rounded-full bg-amber-400/95 text-slate-950 font-black text-[10px] sm:text-xs shadow flex items-center gap-0.5 tabular-nums">
                    <span>★</span>
                    <span>{stats.stars}</span>
                  </div>
                )}

                {/* Category Custom Artwork */}
                <div className="mt-1 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <CategoryArtwork categoryId={category.id} />
                </div>

                {/* Category Arabic Name & "50 مرحلة" Subtitle */}
                <div dir="rtl" className="w-full text-center mt-1 pb-0.5">
                  <h2 className="text-[15px] sm:text-xl lg:text-2xl font-black text-white leading-snug tracking-tight drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] line-clamp-1">
                    {category.name}
                  </h2>
                  <p className="text-xs sm:text-sm lg:text-base font-bold text-[#d1e5f0] mt-0.5 tabular-nums">
                    {stats.completed > 0 ? `${stats.completed} / 50 مرحلة` : '50 مرحلة'}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
