import React, { useState } from 'react';
import { PlayerProfile, ScreenState } from '../types/game';
import { X, Lock, User, Mail, KeyRound } from 'lucide-react';
import { sounds } from '../utils/audio';
import loginMascotImage from '../assets/images/login_kuwaiti_mascot_1794483388654.jpg';
import { isNativeIOSApp } from '../utils/iosNative';
import { checkTextModeration } from '../engine/moderation';

import {
  loginAsGuestAccount,
  signInWithRealGoogleOAuth,
  signInWithAppleOAuth,
  loginWithUsernameAndPassword,
  registerNewAccountWithEmail
} from '../services/supabaseClient';

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env || {};
const ENABLE_GOOGLE_OAUTH = env.VITE_ENABLE_GOOGLE_OAUTH === 'true' && !isNativeIOSApp();

interface AuthScreenProps {
  onLoginSuccess: (user: PlayerProfile) => void;
  onNavigate: (screen: ScreenState) => void;
  initialError?: string;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({
  onLoginSuccess,
  onNavigate,
  initialError = ''
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(initialError);

  React.useEffect(() => {
    if (initialError) {
      setError(initialError);
    }
  }, [initialError]);

  // Modal state for "متابعة بإسم المستخدم وكلمة المرور"
  const [showCredentialsModal, setShowCredentialsModal] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');

  // State when account is not registered yet -> shows prompt with "اضغط هنا" -> then shows email field
  const [unregisteredPrompt, setUnregisteredPrompt] = useState(false);
  const [registerStepWithEmail, setRegisterStepWithEmail] = useState(false);
  const [modalError, setModalError] = useState('');

  const [legalModal, setLegalModal] = useState<'TERMS' | 'PRIVACY' | null>(null);

  // Reliable image source with bundled Vite import and public fallback
  const mascotSrc = loginMascotImage || '/assets/images/login_kuwaiti_mascot_1794483388654.jpg';

  // 1. Official Google Sign-In (only visible when VITE_ENABLE_GOOGLE_OAUTH === 'true' on non-iOS web)
  const handleGoogleSignIn = async () => {
    sounds.playTap();
    setLoading(true);
    setError('');

    const result = await signInWithRealGoogleOAuth();
    if (!result.redirected) {
      sounds.playError();
      setLoading(false);
      setError(result.error || 'تسجيل الدخول بحساب Google غير مفعل في هذه البيئة، يمكنك الدخول باسم المستخدم أو كضيف');
      return;
    }
    if (result.isPopup) {
      setTimeout(() => {
        setLoading(false);
      }, 3500);
    }
  };

  // 1B. Official Apple Sign-In (Native iOS Face ID / Touch ID system sheet on iPhone or verified Apple OAuth)
  const handleAppleSignIn = async () => {
    sounds.playTap();
    setLoading(true);
    setError('');

    const result = await signInWithAppleOAuth();
    if (result.profile) {
      sounds.playVictory();
      setLoading(false);
      onLoginSuccess(result.profile);
      return;
    }
    if (result.canceled) {
      setLoading(false);
      return;
    }
    if (result.nativeError || result.error) {
      sounds.playError();
      setLoading(false);
      setError(result.nativeError || result.error || 'تعذر تسجيل الدخول بحساب Apple');
      return;
    }
    if (!result.redirected) {
      sounds.playError();
      setLoading(false);
      setError('تسجيل الدخول بحساب Apple متاح رسمياً عبر تطبيق الآيفون، يمكنك حالياً المتابعة باسم المستخدم أو كضيف');
    }
  };

  // 2. Handle "متابعة بإسم المستخدم وكلمة المرور" form submission
  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    sounds.playTap();
    setModalError('');

    const cleanUser = username.trim();
    const cleanPass = password;

    if (!cleanUser || !cleanPass) {
      setModalError('يرجى إدخال اسم المستخدم وكلمة المرور');
      return;
    }

    // If user already clicked "اضغط هنا" and is now submitting their Email to register & enter the game:
    if (registerStepWithEmail) {
      const userMod = checkTextModeration(cleanUser, 'اسم المستخدم');
      if (!userMod.allowed) {
        setModalError(userMod.reason || 'اسم المستخدم غير لائق');
        return;
      }
      const cleanMail = email.trim();
      if (!cleanMail || !cleanMail.includes('@')) {
        setModalError('يرجى إدخال بريد إلكتروني صحيح لإتمام تسجيل حسابك');
        return;
      }

      setLoading(true);
      try {
        const newProfile = await registerNewAccountWithEmail({
          username: cleanUser,
          password: cleanPass,
          email: cleanMail
        });
        sounds.playVictory();
        setShowCredentialsModal(false);
        onLoginSuccess(newProfile);
      } catch (err: any) {
        sounds.playError();
        setModalError(err?.message || 'تعذر تسجيل الحساب الجديد، يرجى المحاولة مرة أخرى');
      } finally {
        setLoading(false);
      }
      return;
    }

    // Step 1: Check if username + password is registered
    setLoading(true);
    try {
      const res = await loginWithUsernameAndPassword(cleanUser, cleanPass);

      if (res.status === 'SUCCESS') {
        sounds.playVictory();
        setShowCredentialsModal(false);
        onLoginSuccess(res.profile);
        return;
      }

      if (res.status === 'UNREGISTERED') {
        sounds.playError();
        setUnregisteredPrompt(true);
        return;
      }

      if (res.status === 'WRONG_PASSWORD' || res.status === 'SERVER_UNREACHABLE') {
        sounds.playError();
        setUnregisteredPrompt(false);
        setModalError(res.message);
      }
    } catch (err: any) {
      sounds.playError();
      setModalError(err?.message || 'حدث خطأ أثناء التحقق من الحساب، يرجى المحاولة مرة أخرى');
    } finally {
      setLoading(false);
    }
  };

  // 3. Continue as Guest
  const handleContinueAsGuest = async () => {
    sounds.playTap();
    setLoading(true);
    setError('');

    try {
      const guestUser = await loginAsGuestAccount();
      sounds.playVictory();
      onLoginSuccess(guestUser);
    } catch {
      onNavigate('HOME');
    } finally {
      setLoading(false);
    }
  };

  const openCredentialsModal = () => {
    sounds.playTap();
    setError('');
    setModalError('');
    setUnregisteredPrompt(false);
    setRegisterStepWithEmail(false);
    setShowCredentialsModal(true);
  };

  return (
    <div
      dir="rtl"
      className="safe-screen min-h-dvh w-full bg-[#02131e] flex flex-col items-center justify-between overflow-y-auto overflow-x-hidden select-none relative"
    >
      {/* ===================================================================== */}
      {/* BACKGROUND DECORATIONS: KUWAIT CITY SKYLINE & WAVING FLAGS            */}
      {/* ===================================================================== */}
      <div className="pointer-events-none absolute top-4 -right-12 w-64 h-20 opacity-80 rotate-12 z-0 hidden sm:block">
        <svg viewBox="0 0 240 80" className="w-full h-full drop-shadow-[0_6px_16px_rgba(0,0,0,0.6)]">
          <path d="M0,15 Q120,-5 240,25 L240,42 Q120,12 0,32 Z" fill="#007A3D" />
          <path d="M0,32 Q120,12 240,42 L240,58 Q120,28 0,48 Z" fill="#FFFFFF" />
          <path d="M0,48 Q120,28 240,58 L240,75 Q120,45 0,65 Z" fill="#CE1126" />
          <polygon points="0,15 55,28 55,52 0,65" fill="#000000" />
        </svg>
      </div>

      {/* Bottom Kuwait Towers Skyline Silhouette */}
      <div className="pointer-events-none absolute bottom-0 inset-x-0 h-48 sm:h-64 z-0 opacity-45 overflow-hidden">
        <svg viewBox="0 0 1200 240" className="w-full h-full object-cover">
          <defs>
            <linearGradient id="loginSkylineGlow" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#0369a1" stopOpacity="0.05" />
            </linearGradient>
          </defs>
          <g fill="url(#loginSkylineGlow)">
            <rect x="60" y="110" width="28" height="130" rx="2" />
            <rect x="95" y="80" width="34" height="160" rx="2" />
            <polygon points="145,50 160,20 175,50 175,240 145,240" />
            <rect x="190" y="100" width="36" height="140" rx="2" />
            <rect x="235" y="125" width="30" height="115" rx="2" />

            <g transform="translate(520, 10)">
              <polygon points="98,10 102,10 106,230 94,230" />
              <circle cx="100" cy="85" r="24" fill="#38bdf8" stroke="#bae6fd" strokeWidth="2" />
              <circle cx="100" cy="46" r="14" fill="#7dd3fc" stroke="#e0f2fe" strokeWidth="1.5" />
              <polygon points="55,40 59,40 63,230 51,230" />
              <circle cx="57" cy="110" r="17" fill="#38bdf8" stroke="#bae6fd" strokeWidth="1.8" />
              <polygon points="25,65 27,65 30,230 22,230" />
            </g>

            <rect x="920" y="120" width="30" height="120" rx="2" />
            <rect x="960" y="90" width="35" height="150" rx="2" />
            <rect x="1005" y="70" width="40" height="170" rx="2" />
            <polygon points="1060,40 1075,15 1090,40 1090,240 1060,240" />
            <rect x="1105" y="115" width="32" height="125" rx="2" />
          </g>
        </svg>
      </div>

      {/* ===================================================================== */}
      {/* MAIN CONTAINER: RESPONSIVE PHONE + CENTERED DESKTOP / TV CARD         */}
      {/* ===================================================================== */}
      <div className="relative z-10 w-full min-h-dvh flex items-center justify-center px-3 sm:p-6 lg:p-8 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div
          className="w-full max-w-md lg:max-w-4xl rounded-[32px] sm:rounded-[38px] overflow-hidden flex flex-col lg:flex-row items-center justify-between border-2 border-cyan-400/40 shadow-[0_0_50px_rgba(14,165,233,0.25)] transition-all"
          style={{
            background: 'linear-gradient(180deg, rgba(4, 27, 43, 0.96) 0%, rgba(2, 18, 29, 0.98) 100%)',
            backdropFilter: 'blur(16px)'
          }}
        >
          {/* =================================================================== */}
          {/* RIGHT / TOP: KUWAITI MASCOT ARTWORK SHOWCASE SECTION               */}
          {/* =================================================================== */}
          <div className="relative w-full lg:w-1/2 h-[320px] sm:h-[380px] lg:h-[600px] shrink-0 overflow-hidden bg-[#021824] flex items-center justify-center">
            <img
              src={mascotSrc}
              alt="شخصية فتّشها الكويتية"
              referrerPolicy="no-referrer"
              onError={(e) => {
                e.currentTarget.src = '/assets/images/login_kuwaiti_mascot_1794483388654.jpg';
              }}
              className="w-full h-full object-cover object-top scale-100 transition-transform duration-500 hover:scale-105"
            />

            <div
              className="absolute inset-x-0 bottom-0 h-32 lg:hidden pointer-events-none"
              style={{
                background: 'linear-gradient(to top, rgba(4, 27, 43, 1) 10%, rgba(4, 27, 43, 0.8) 50%, transparent 100%)'
              }}
            />
            <div
              className="hidden lg:block absolute inset-y-0 left-0 w-24 pointer-events-none"
              style={{
                background: 'linear-gradient(to right, rgba(4, 27, 43, 1) 0%, transparent 100%)'
              }}
            />

            <div
              className="absolute top-4 right-4 z-20 px-3.5 py-1.5 rounded-full flex items-center gap-2 text-xs font-black text-amber-300 shadow-lg border border-amber-400/40"
              style={{
                background: 'rgba(4, 20, 32, 0.85)',
                backdropFilter: 'blur(8px)'
              }}
            >
              <span>🇰🇼</span>
              <span>لعبة فتّشها الكويتية</span>
            </div>
          </div>

          {/* =================================================================== */}
          {/* LEFT / BOTTOM: APP BRANDING & LOGIN ACTIONS SECTION                */}
          {/* =================================================================== */}
          <div className="relative z-20 w-full lg:w-1/2 flex flex-col items-center justify-between p-6 sm:p-8 lg:p-10 text-center">
            {/* Top Emblem Logo */}
            <div className="flex flex-col items-center mb-4 sm:mb-5">
              <div className="flex items-center gap-2.5 mb-1.5">
                <span className="text-3xl sm:text-4xl">🔍</span>
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-[#a3e635] tracking-tight drop-shadow-[0_0_15px_rgba(163,230,53,0.45)]">
                  فتّشها
                </h2>
              </div>
              <span className="text-xs sm:text-sm font-extrabold text-cyan-300 tracking-wider">
                تحدّاك في كل كلمة • لعبة البحث عن الكلمات
              </span>
            </div>

            {/* Card Header: تسجيل الدخول */}
            <div className="w-full mb-5 sm:mb-6">
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-white tracking-tight mb-2 drop-shadow-[0_2px_10px_rgba(0,0,0,0.6)]">
                تسجيل الدخول
              </h1>
              <p className="text-xs sm:text-sm text-slate-300 font-bold leading-relaxed max-w-sm mx-auto">
                سجّل دخولك لحفظ النجوم، الأوسمة، وخوض التحديات والمنافسات الأونلاين!
              </p>
            </div>

            {error && (
              <div className="w-full mb-4 px-4 py-2.5 rounded-2xl bg-rose-500/20 border border-rose-500/50 text-rose-200 text-xs font-bold animate-in fade-in">
                {error}
              </div>
            )}

            {/* Action Buttons Stack */}
            <div className="w-full max-w-sm space-y-3 sm:space-y-3.5 mb-6">
              {/* Button 1: متابعة بحساب Apple (Apple App Store Guideline 4.8) */}
              <button
                type="button"
                disabled={loading}
                onClick={handleAppleSignIn}
                className="w-full h-14 sm:h-15 rounded-full bg-black hover:bg-neutral-900 active:scale-[0.98] transition-all px-5 sm:px-6 shadow-[0_8px_25px_rgba(0,0,0,0.65)] flex items-center justify-between cursor-pointer disabled:opacity-60 border border-white/25 group"
              >
                <svg className="w-6 h-6 sm:w-7 sm:h-7 text-white shrink-0 transition-transform group-hover:scale-110" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
                </svg>

                <span className="text-white font-black text-base sm:text-lg tracking-tight whitespace-nowrap">
                  متابعة بحساب Apple
                </span>

                <span className="w-6 sm:w-7 shrink-0" aria-hidden="true" />
              </button>

              {/* Button 1B: متابعة بحساب Google (only when enabled & not on native iOS) */}
              {ENABLE_GOOGLE_OAUTH && (
                <button
                  type="button"
                  disabled={loading}
                  onClick={handleGoogleSignIn}
                  className="w-full h-14 sm:h-15 rounded-full bg-[#f8fafc] hover:bg-white active:scale-[0.98] transition-all px-5 sm:px-6 shadow-[0_8px_25px_rgba(0,0,0,0.45)] hover:shadow-[0_8px_30px_rgba(255,255,255,0.25)] flex items-center justify-between cursor-pointer disabled:opacity-60 border border-slate-200 group"
                >
                  <svg className="w-7 h-7 sm:w-8 sm:h-8 shrink-0 transition-transform group-hover:scale-110" viewBox="0 0 48 48">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                  </svg>

                  <span className="text-[#0f172a] font-black text-base sm:text-lg tracking-tight whitespace-nowrap">
                    متابعة بحساب Google
                  </span>

                  <span className="w-7 sm:w-8 shrink-0" aria-hidden="true" />
                </button>
              )}

              {/* Button 2: متابعة بإسم المستخدم وكلمة المرور (Matches Neon Design) */}
              <button
                type="button"
                disabled={loading}
                onClick={openCredentialsModal}
                className="w-full h-14 sm:h-15 rounded-full bg-gradient-to-r from-[#072a40] via-[#062336] to-[#072a40] hover:from-[#0b3854] hover:to-[#0b3854] active:scale-[0.98] transition-all border-2 border-[#a3e635] px-4 sm:px-6 shadow-[0_0_24px_rgba(163,230,53,0.28)] hover:shadow-[0_0_32px_rgba(163,230,53,0.48)] flex items-center justify-between cursor-pointer disabled:opacity-60 group"
              >
                <div className="w-8 h-8 rounded-full bg-[#a3e635]/20 border border-[#a3e635]/60 flex items-center justify-center text-[#a3e635] shrink-0 group-hover:scale-110 transition-transform">
                  <KeyRound className="w-4 h-4 text-[#a3e635]" />
                </div>

                <span className="text-[#a3e635] font-black text-sm sm:text-base lg:text-lg tracking-tight whitespace-nowrap drop-shadow-[0_0_10px_rgba(163,230,53,0.3)]">
                  متابعة بإسم المستخدم وكلمة المرور
                </span>

                <span className="w-8 shrink-0" aria-hidden="true" />
              </button>

              {/* Button 3: متابعة كضيف */}
              <button
                type="button"
                disabled={loading}
                onClick={handleContinueAsGuest}
                className="w-full h-14 sm:h-15 rounded-full bg-[#031d2e]/90 hover:bg-[#072a40] active:scale-[0.98] transition-all border-2 border-cyan-400 px-5 sm:px-6 shadow-[0_8px_25px_rgba(14,165,233,0.3)] hover:shadow-[0_8px_30px_rgba(14,165,233,0.5)] flex items-center justify-between cursor-pointer disabled:opacity-60 group"
              >
                <div className="w-8 h-8 rounded-full bg-cyan-500/20 border border-cyan-400/50 flex items-center justify-center text-cyan-300 shrink-0 group-hover:scale-110 transition-transform">
                  <User className="w-5 h-5 text-cyan-300" />
                </div>

                <span className="text-white font-black text-base sm:text-lg tracking-tight whitespace-nowrap">
                  {loading ? 'جارٍ تسجيل الدخول...' : 'متابعة كضيف ⚡'}
                </span>

                <span className="w-8 shrink-0" aria-hidden="true" />
              </button>
            </div>

            {/* Footer Legal Links */}
            <div className="pt-2 flex items-center justify-center gap-3 text-xs sm:text-sm font-bold text-slate-400">
              <button
                type="button"
                onClick={() => {
                  sounds.playTap();
                  setLegalModal('TERMS');
                }}
                className="hover:text-cyan-300 transition-colors cursor-pointer"
              >
                شروط الاستخدام
              </button>
              <span className="text-slate-600 select-none">•</span>
              <button
                type="button"
                onClick={() => {
                  sounds.playTap();
                  setLegalModal('PRIVACY');
                }}
                className="hover:text-cyan-300 transition-colors cursor-pointer"
              >
                سياسة الخصوصية
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* USERNAME & PASSWORD MODAL (Matches Screenshot Neon Box Design)        */}
      {/* ===================================================================== */}
      {showCredentialsModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#072233] border-2 border-[#38bdf8]/60 rounded-3xl p-6 max-w-sm w-full text-right shadow-[0_0_40px_rgba(56,189,248,0.3)] animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-full bg-lime-400/20 border border-lime-400/50 flex items-center justify-center text-lime-400 shrink-0">
                  <KeyRound className="w-4 h-4" />
                </div>
                <h3 className="text-sm sm:text-base font-black text-white">
                  متابعة بإسم المستخدم وكلمة المرور
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCredentialsModal(false)}
                className="p-1.5 rounded-lg bg-slate-800/80 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* General Error Notice */}
            {modalError && (
              <div className="mb-3.5 px-3.5 py-2.5 rounded-xl bg-rose-500/20 border border-rose-500/50 text-rose-200 text-xs font-bold leading-relaxed">
                {modalError}
              </div>
            )}

            {/* Unregistered Account Prompt with interactive "اضغط هنا" button */}
            {unregisteredPrompt && !registerStepWithEmail && (
              <div className="mb-4 p-3.5 rounded-2xl bg-amber-500/15 border-2 border-amber-400/60 text-amber-100 text-xs font-bold leading-relaxed animate-in fade-in">
                <span>هذا الحساب غير مسجل مسبقا اذا رغبت بتسجيل حساب جديد </span>
                <button
                  type="button"
                  onClick={() => {
                    sounds.playTap();
                    setUnregisteredPrompt(false);
                    setRegisterStepWithEmail(true);
                    setModalError('');
                  }}
                  className="inline-block mr-1 px-2.5 py-0.5 rounded-lg bg-[#a3e635] hover:bg-lime-300 text-slate-950 font-black underline decoration-slate-950 cursor-pointer transition-transform active:scale-95"
                >
                  اضغط هنا
                </button>
              </div>
            )}

            <form onSubmit={handleCredentialsSubmit} className="space-y-3">
              {/* Username Input */}
              <div className="relative">
                <User className="w-4 h-4 text-slate-500 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    if (unregisteredPrompt) setUnregisteredPrompt(false);
                  }}
                  placeholder="اسم المستخدم"
                  className="w-full pr-10 pl-3.5 py-3 rounded-xl bg-[#03131d] border border-[#25465c] text-white placeholder-slate-500 text-xs focus:outline-none focus:border-[#a3e635] transition-colors"
                />
              </div>

              {/* Password Input */}
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (unregisteredPrompt) setUnregisteredPrompt(false);
                  }}
                  placeholder="كلمة المرور"
                  className="w-full pr-10 pl-3.5 py-3 rounded-xl bg-[#03131d] border border-[#25465c] text-white placeholder-slate-500 text-xs focus:outline-none focus:border-[#a3e635] transition-colors"
                />
              </div>

              {/* Email Input (Appears immediately when user clicks "اضغط هنا" to register a new account) */}
              {registerStepWithEmail && (
                <div className="pt-2 border-t border-slate-800 space-y-2 animate-in fade-in">
                  <span className="block text-xs font-black text-[#a3e635]">
                    أدخل البريد الإلكتروني لإتمام تسجيل حسابك الجديد:
                  </span>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-lime-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="email"
                      required
                      autoFocus
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="البريد الإلكتروني (name@gmail.com)"
                      dir="ltr"
                      className="w-full pr-10 pl-3.5 py-3 rounded-xl bg-[#03131d] border-2 border-[#a3e635] text-white placeholder-slate-500 text-xs text-left focus:outline-none shadow-[0_0_15px_rgba(163,230,53,0.2)]"
                    />
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl bg-[#a3e635] hover:bg-lime-300 text-slate-950 font-black text-xs sm:text-sm transition-all cursor-pointer disabled:opacity-60 shadow-[0_4px_20px_rgba(163,230,53,0.3)]"
              >
                {loading
                  ? 'جارٍ المعالجة...'
                  : registerStepWithEmail
                  ? 'تسجيل الحساب والدخول للعبة'
                  : 'متابعة بالحساب'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TERMS & PRIVACY POLICY MODAL                                          */}
      {/* ===================================================================== */}
      {legalModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#072233] border-2 border-cyan-400/50 rounded-3xl p-6 max-w-md w-full text-right shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
              <h3 className="text-base font-black text-white">
                {legalModal === 'TERMS' ? 'شروط الاستخدام - لعبة فتّشها' : 'سياسة الخصوصية - لعبة فتّشها'}
              </h3>
              <button
                type="button"
                onClick={() => setLegalModal(null)}
                className="p-1.5 rounded-lg bg-slate-800/80 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs text-slate-300 leading-relaxed space-y-2.5 mb-5">
              {legalModal === 'TERMS' ? (
                <>
                  <p>مرحباً بك في لعبة «فتّشها - لعبة البحث عن الكلمات». استخدامك للتطبيق يعني موافقتك على قواعد اللعب النزيه والاحترام المتبادل في الغرف الجماعية.</p>
                  <p>تُحتسب النقاط والنجوم والأوسمة تلقائياً عبر الخادم بناءً على سرعتك ودقتك في اكتشاف الكلمات داخل الشبكة.</p>
                </>
              ) : (
                <>
                  <p>نحن نحترم خصوصيتك بالكامل. يتم حفظ بيانات تقدمك في المراحل، النجوم، ونقاط الخبرة XP لمزامنة حسابك عبر أجهزتك.</p>
                  <p>لا نقوم بمشاركة بريدك الإلكتروني أو بياناتك الشخصية مع أي أطراف خارجية، ويمكنك اللعب كضيف في أي وقت.</p>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={() => setLegalModal(null)}
              className="w-full py-2.5 rounded-xl bg-white text-slate-950 font-extrabold text-xs hover:bg-slate-100 transition-colors cursor-pointer"
            >
              إغلاق
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
