import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ScreenState, PlayerProfile } from '../types/game';
import { sounds } from '../utils/audio';
import { resolveApiUrl } from '../utils/iosNative';

interface SplashScreenProps {
  onStart: (screen: ScreenState) => void;
  activeProfile: PlayerProfile | null;
  onToggleTV: () => void;
  tvMode: boolean;
}

const SPLASH_IMAGE_URL = '/assets/aistudio/fatteshha_subtitle_corrected_0e680fbf.png';

export const SplashScreen: React.FC<SplashScreenProps> = ({ onStart, activeProfile }) => {
  const [progress, setProgress] = useState(14);
  const [isReady, setIsReady] = useState(false);
  const [statusLabel, setStatusLabel] = useState('جار التحميل ...');
  const targetScreen: ScreenState = activeProfile ? 'HOME' : 'AUTH';

  const targetProgressRef = useRef(20);
  const enteredRef = useRef(false);

  const handleEnterGame = useCallback(() => {
    if (enteredRef.current) return;
    enteredRef.current = true;
    sounds.resumeIfNeeded();
    sounds.playTap();
    onStart(targetScreen);
  }, [onStart, targetScreen]);

  // Real readiness checks: artwork image preload + fonts + /api/health check
  useEffect(() => {
    let cancelled = false;
    let imageDone = false;
    let fontsDone = false;
    let apiDone = false;

    const recomputeTarget = () => {
      if (cancelled) return;
      const total =
        18 +
        (imageDone ? 38 : 0) +
        (fontsDone ? 20 : 0) +
        (apiDone ? 24 : 0);
      targetProgressRef.current = Math.min(100, total);
      if (imageDone && fontsDone && apiDone) {
        setStatusLabel('جاهز للعب!');
      }
    };

    // 1. Preload hero artwork
    const img = new Image();
    const markImageDone = () => {
      if (imageDone) return;
      imageDone = true;
      recomputeTarget();
    };
    img.onload = markImageDone;
    img.onerror = markImageDone;
    img.src = SPLASH_IMAGE_URL;
    if (img.complete) {
      markImageDone();
    }

    // 2. Document fonts readiness (with safety timeout)
    const fontsReadyPromise =
      typeof document !== 'undefined' && document.fonts?.ready
        ? Promise.race([
            document.fonts.ready.then(() => undefined),
            new Promise<void>(resolve => window.setTimeout(resolve, 1200))
          ])
        : Promise.resolve();
    void fontsReadyPromise.then(() => {
      fontsDone = true;
      recomputeTarget();
    });

    // 3. Backend readiness check (with short timeout fallback for offline/static hosting)
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const apiTimeout = window.setTimeout(() => {
      controller?.abort();
      if (!apiDone) {
        apiDone = true;
        recomputeTarget();
      }
    }, 1500);

    fetch(resolveApiUrl('/api/health'), {
      cache: 'no-store',
      signal: controller?.signal
    })
      .catch(() => undefined)
      .finally(() => {
        window.clearTimeout(apiTimeout);
        if (!apiDone) {
          apiDone = true;
          recomputeTarget();
        }
      });

    // 4. Hard safety cap so splash never stalls
    const safetyTimer = window.setTimeout(() => {
      if (cancelled) return;
      imageDone = true;
      fontsDone = true;
      apiDone = true;
      targetProgressRef.current = 100;
      setStatusLabel('جاهز للعب!');
    }, 2400);

    // Smooth visual interpolation toward targetProgressRef
    const animTimer = window.setInterval(() => {
      setProgress(prev => {
        const target = targetProgressRef.current;
        if (prev >= 100 && target >= 100) {
          window.clearInterval(animTimer);
          setIsReady(true);
          return 100;
        }
        const diff = target - prev;
        if (diff <= 0.4) {
          const snapped = Math.min(100, target);
          if (snapped >= 100) {
            setIsReady(true);
          }
          return snapped;
        }
        return Math.min(100, prev + Math.max(1.2, diff * 0.22));
      });
    }, 30);

    return () => {
      cancelled = true;
      controller?.abort();
      window.clearTimeout(apiTimeout);
      window.clearTimeout(safetyTimer);
      window.clearInterval(animTimer);
    };
  }, []);

  // Allow Enter / Space key on desktop & Smart TV remote once ready (or anytime)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleEnterGame();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleEnterGame]);

  const roundedProgress = Math.max(10, Math.min(100, Math.round(progress)));

  return (
    <div
      aria-label="شاشة التحميل - فتّشها لعبة البحث عن الكلمات"
      className="safe-screen fixed inset-0 z-50 w-full h-dvh bg-[#030e21] flex flex-col items-center justify-between overflow-hidden select-none"
    >
      {/* Full-bleed atmospheric skyline backdrop on wide screens (Laptop / TV / iPad) */}
      <div
        className="absolute inset-0 bg-cover bg-center scale-105 blur-xl opacity-65 pointer-events-none"
        style={{
          backgroundImage: `url('${SPLASH_IMAGE_URL}')`
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-[#041229]/45 via-transparent to-[#020a18]/90 pointer-events-none" />

      {/* Adaptive Artwork Container */}
      <div className="relative w-full h-full flex flex-col justify-between overflow-hidden">
        <img
          src={SPLASH_IMAGE_URL}
          alt="فتّشها - لعبة البحث عن الكلمات"
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover md:object-contain object-top pointer-events-none"
        />

        {/* Seamless water-reflection gradient masking static lower bar zone */}
        <div
          className="absolute inset-x-0 bottom-0 h-[34%] pointer-events-none"
          style={{
            background:
              'linear-gradient(to top, #031024 0%, #041733 62%, rgba(4, 23, 51, 0.92) 82%, transparent 100%)'
          }}
        />

        {/* Real Interactive Loading & Start Button */}
        <div className="relative z-10 mt-auto pb-8 sm:pb-10 lg:pb-12 pt-6 px-6 sm:px-10 flex flex-col items-center justify-end w-full">
          <p
            dir="rtl"
            className="text-white font-extrabold text-lg sm:text-xl lg:text-2xl tracking-wide mb-3 drop-shadow-[0_2px_8px_rgba(0,0,0,0.95)]"
          >
            {isReady ? 'اكتمل التجهيز — اضغط للبدء' : `${statusLabel} ${roundedProgress}%`}
          </p>

          <button
            type="button"
            onClick={handleEnterGame}
            aria-busy={!isReady}
            dir="rtl"
            className={`group relative w-[78%] sm:w-[60%] max-w-[320px] sm:max-w-[380px] lg:max-w-[440px] h-12 sm:h-14 rounded-full bg-[#061224]/95 border-2 p-1 shadow-[0_6px_24px_rgba(0,0,0,0.85),inset_0_2px_4px_rgba(0,0,0,0.9)] flex items-center justify-center overflow-hidden cursor-pointer transition-all duration-200 active:scale-[0.97] focus:outline-none focus-visible:ring-4 focus-visible:ring-lime-300/70 ${
              isReady
                ? 'border-lime-300 shadow-[0_0_28px_rgba(154,240,26,0.55)] hover:brightness-110'
                : 'border-[#3e5c7e]/90 hover:border-lime-400/80'
            }`}
          >
            {/* Dynamic progress fill inside the real button */}
            <div
              className="absolute inset-y-1 left-1 rounded-full transition-all duration-100 ease-out pointer-events-none overflow-hidden"
              style={{
                width: `calc(${roundedProgress}% - 8px)`,
                background: 'linear-gradient(180deg, #b8ff33 0%, #8ee60e 55%, #61ad00 100%)',
                boxShadow: '0 0 14px rgba(154, 240, 26, 0.75)'
              }}
            >
              <div className="absolute inset-x-2 top-[2px] h-[35%] rounded-full bg-white/35 pointer-events-none" />
            </div>

            <span className="relative z-10 font-black text-base sm:text-lg lg:text-xl tracking-wide text-slate-950 drop-shadow-[0_1px_1px_rgba(255,255,255,0.45)] flex items-center gap-2">
              {isReady ? (
                <>
                  <span>ابدأ اللعب الآن</span>
                  <span aria-hidden="true">🚀</span>
                </>
              ) : (
                <span className="text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)]">
                  دخول سريع ({roundedProgress}%)
                </span>
              )}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
