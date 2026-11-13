import React, { useState, useEffect } from 'react';
import { ScreenState, PlayerProfile } from '../types/game';
import { sounds } from '../utils/audio';

interface SplashScreenProps {
  onStart: (screen: ScreenState) => void;
  activeProfile: PlayerProfile | null;
  onToggleTV: () => void;
  tvMode: boolean;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onStart }) => {
  const [progress, setProgress] = useState(12);

  useEffect(() => {
    const duration = 3400; // 3.4s smooth loading animation
    const intervalTime = 40;
    const increment = (88 / (duration / intervalTime));

    const timer = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(timer);
          return 100;
        }
        return Math.min(100, prev + increment);
      });
    }, intervalTime);

    return () => clearInterval(timer);
  }, []);

  // Automatically navigate to AUTH (Login screen) once loading reaches 100%
  useEffect(() => {
    if (progress >= 100) {
      const redirectTimer = setTimeout(() => {
        onStart('AUTH');
      }, 650);
      return () => clearTimeout(redirectTimer);
    }
  }, [progress, onStart]);

  // Allow user to tap/click or press Enter/OK on TV remote to enter immediately
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        sounds.playTap();
        onStart('AUTH');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onStart]);

  const handleSkipToAuth = () => {
    sounds.playTap();
    onStart('AUTH');
  };

  return (
    <div
      onClick={handleSkipToAuth}
      role="button"
      tabIndex={0}
      aria-label="شاشة التحميل - فتّشها لعبة البحث عن الكلمات"
      className="safe-screen fixed inset-0 z-50 w-full h-dvh bg-[#030e21] flex flex-col items-center justify-between overflow-hidden cursor-pointer select-none"
    >
      {/* Full-bleed atmospheric skyline backdrop on wide screens (Laptop / TV / iPad) */}
      <div
        className="absolute inset-0 bg-cover bg-center scale-105 blur-xl opacity-65 pointer-events-none"
        style={{
          backgroundImage: `url('/assets/aistudio/______________fbc01b96.png')`
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-[#041229]/50 via-transparent to-[#020a18]/90 pointer-events-none" />

      {/* Adaptive Artwork Container: Full-bleed edge-to-edge on every phone (iPhone 14, 17 Pro Max, etc.), and expansive centered hero on Laptop & TV */}
      <div className="relative w-full h-full flex flex-col justify-between overflow-hidden">
        <img
          src="/assets/aistudio/______________fbc01b96.png"
          alt="فتّشها - لعبة البحث عن الكلمات"
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover md:object-contain object-top pointer-events-none"
        />

        {/* Seamless water-reflection gradient over the bottom 25% */}
        <div
          className="absolute inset-x-0 bottom-0 h-[28%] pointer-events-none"
          style={{
            background:
              'linear-gradient(to top, #031024 0%, #041733 58%, rgba(4, 23, 51, 0.85) 78%, transparent 100%)'
          }}
        />

        {/* Bottom Progress Bar & Loading Label scaling with device viewport */}
        <div className="relative z-10 mt-auto pb-8 sm:pb-10 lg:pb-12 pt-6 px-6 sm:px-10 flex flex-col items-center justify-end w-full">
          <p
            dir="rtl"
            className="text-white font-extrabold text-xl sm:text-2xl lg:text-3xl tracking-wide mb-3.5 drop-shadow-[0_2px_8px_rgba(0,0,0,0.95)]"
          >
            جار التحميل ...
          </p>

          <div
            dir="ltr"
            className="w-[68%] sm:w-[55%] max-w-[280px] sm:max-w-[360px] lg:max-w-[440px] h-5 sm:h-6 lg:h-7 rounded-full bg-[#061224]/95 border-2 border-[#3e5c7e]/85 p-[3px] shadow-[0_4px_16px_rgba(0,0,0,0.8),inset_0_2px_4px_rgba(0,0,0,0.9)] flex items-center"
          >
            <div
              className="h-full rounded-full transition-all duration-75 ease-out relative overflow-hidden"
              style={{
                width: `${Math.max(8, Math.min(100, progress))}%`,
                background: 'linear-gradient(180deg, #b8ff33 0%, #8ee60e 55%, #61ad00 100%)',
                boxShadow: '0 0 14px rgba(154, 240, 26, 0.75)'
              }}
            >
              <div className="absolute inset-x-1 top-[1px] h-[35%] rounded-full bg-white/35 pointer-events-none" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
