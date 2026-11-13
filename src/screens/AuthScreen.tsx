import React, { useState } from 'react';
import { PlayerProfile, ScreenState } from '../types/game';
import { X, Lock, Mail, KeyRound, ShieldCheck, ExternalLink, User } from 'lucide-react';
import { sounds } from '../utils/audio';
import loginMascotImage from '../assets/images/login_kuwaiti_mascot_1794483388654.jpg';

import {
  loginAsGuestAccount,
  signInWithRealGoogleOAuth,
  authenticateWithEmailPassword,
  sendEmailVerificationOtp,
  verifyEmailOtpCode,
  isSupabaseConfigured
} from '../services/supabaseClient';

interface AuthScreenProps {
  onLoginSuccess: (user: PlayerProfile) => void;
  onNavigate: (screen: ScreenState) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({
  onLoginSuccess,
  onNavigate
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [infoMsg, setInfoMsg] = useState('');
  const [showGoogleModal, setShowGoogleModal] = useState(false);

  // Verification Method inside Modal: 'PASSWORD' (Email + Password) or 'OTP' (Email Verification Code)
  const [verifyMethod, setVerifyMethod] = useState<'PASSWORD' | 'OTP'>('PASSWORD');
  const [authMode, setAuthMode] = useState<'LOGIN' | 'REGISTER'>('LOGIN');

  const [customEmail, setCustomEmail] = useState('');
  const [customName, setCustomName] = useState('');
  const [customPassword, setCustomPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);

  const [legalModal, setLegalModal] = useState<'TERMS' | 'PRIVACY' | null>(null);

  // Reliable image source with bundled Vite import and public fallback
  const mascotSrc = loginMascotImage || '/assets/images/login_kuwaiti_mascot_1794483388654.jpg';

  // 1. Official Google OAuth Redirect / Popup (goes to accounts.google.com via Supabase Auth)
  const handleOfficialGoogleSignIn = async () => {
    sounds.playTap();
    setLoading(true);
    setError('');
    setInfoMsg('');

    const result = await signInWithRealGoogleOAuth();
    if (!result.redirected) {
      setLoading(false);
      setError(
        result.error ||
          'لتفعيل التحويل المباشر إلى موقع Google، فعّل خيار Google داخل Supabase (Authentication -> Providers -> Google) أو ادخل بالبريد وكلمة المرور أدناه.'
      );
    }
  };

  // 2. Protected Email + Password Submit (prevents anyone else from entering your email without your password!)
  const handlePasswordAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    sounds.playTap();
    setLoading(true);
    setError('');
    setInfoMsg('');

    try {
      const profile = await authenticateWithEmailPassword({
        mode: authMode,
        email: customEmail,
        password: customPassword,
        displayName: customName
      });
      sounds.playVictory();
      setShowGoogleModal(false);
      onLoginSuccess(profile);
    } catch (err: any) {
      sounds.playError();
      setError(err?.message || 'تعذر التحقق من بيانات الحساب، تأكد من البريد وكلمة المرور');
    } finally {
      setLoading(false);
    }
  };

  // 3. Send Real OTP Code to Email Inbox via Supabase Auth
  const handleSendOtpCode = async (e: React.FormEvent) => {
    e.preventDefault();
    sounds.playTap();
    setLoading(true);
    setError('');
    setInfoMsg('');

    try {
      await sendEmailVerificationOtp(customEmail, customName);
      setOtpSent(true);
      setInfoMsg(`تم إرسال رمز/رابط التحقق الرسمي إلى البريد (${customEmail.trim()})! افتح بريدك الوارد وأدخل الرمز أو اضغط الرابط.`);
    } catch (err: any) {
      sounds.playError();
      setError(err?.message || 'تعذر إرسال رمز التحقق إلى البريد الإلكتروني');
    } finally {
      setLoading(false);
    }
  };

  // 4. Verify the 6-digit OTP Code entered by user
  const handleVerifyOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    sounds.playTap();
    setLoading(true);
    setError('');

    try {
      const profile = await verifyEmailOtpCode(customEmail, otpCode, customName);
      sounds.playVictory();
      setShowGoogleModal(false);
      onLoginSuccess(profile);
    } catch (err: any) {
      sounds.playError();
      setError(err?.message || 'رمز التحقق غير صحيح أو منتهي الصلاحية');
    } finally {
      setLoading(false);
    }
  };

  // Continue as Guest (creates or loads an isolated Guest account with a unique tag per session)
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
      <div className="relative z-10 w-full min-h-dvh flex items-center justify-center p-3 sm:p-6 lg:p-8">
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
          <div className="relative w-full lg:w-1/2 h-[340px] sm:h-[400px] lg:h-[580px] shrink-0 overflow-hidden bg-[#021824] flex items-center justify-center">
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
            <div className="flex flex-col items-center mb-5 sm:mb-6">
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

            <div className="w-full mb-6 sm:mb-8">
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-white tracking-tight mb-2 drop-shadow-[0_2px_10px_rgba(0,0,0,0.6)]">
                تسجيل الدخول الآمن
              </h1>
              <p className="text-xs sm:text-sm text-slate-300 font-bold leading-relaxed max-w-sm mx-auto">
                سجّل دخولك عبر مصادقة Google الرسمية أو حسابك المحمي بكلمة مرور لحفظ النجوم والأوسمة!
              </p>
            </div>

            {error && !showGoogleModal && (
              <div className="w-full mb-4 px-4 py-2.5 rounded-2xl bg-rose-500/20 border border-rose-500/50 text-rose-200 text-xs font-bold animate-in fade-in">
                {error}
              </div>
            )}

            <div className="w-full max-w-sm space-y-3.5 sm:space-y-4 mb-6 sm:mb-8">
              {/* Button 1: متابعة بحساب Google / البريد المحمي */}
              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  sounds.playTap();
                  setError('');
                  setInfoMsg('');
                  setShowGoogleModal(true);
                }}
                className="w-full h-14 sm:h-16 rounded-full bg-[#f8fafc] hover:bg-white active:scale-[0.98] transition-all px-5 sm:px-6 shadow-[0_8px_25px_rgba(0,0,0,0.45)] hover:shadow-[0_8px_30px_rgba(255,255,255,0.25)] flex items-center justify-between cursor-pointer disabled:opacity-60 border border-slate-200 group"
              >
                <svg className="w-7 h-7 sm:w-8 sm:h-8 shrink-0 transition-transform group-hover:scale-110" viewBox="0 0 48 48">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                </svg>

                <span className="text-[#0f172a] font-black text-base sm:text-lg lg:text-xl tracking-tight whitespace-nowrap">
                  متابعة بحساب Google / البريد
                </span>

                <span className="w-7 sm:w-8 shrink-0" aria-hidden="true" />
              </button>

              {/* Button 2: متابعة كضيف */}
              <button
                type="button"
                disabled={loading}
                onClick={handleContinueAsGuest}
                className="w-full h-14 sm:h-16 rounded-full bg-[#031d2e]/90 hover:bg-[#072a40] active:scale-[0.98] transition-all border-2 border-cyan-400 px-5 sm:px-6 shadow-[0_8px_25px_rgba(14,165,233,0.3)] hover:shadow-[0_8px_30px_rgba(14,165,233,0.5)] flex items-center justify-between cursor-pointer disabled:opacity-60 group"
              >
                <div className="w-8 h-8 rounded-full bg-cyan-500/20 border border-cyan-400/50 flex items-center justify-center text-cyan-300 shrink-0 group-hover:scale-110 transition-transform">
                  <User className="w-5 h-5 text-cyan-300" />
                </div>

                <span className="text-white font-black text-base sm:text-lg lg:text-xl tracking-tight whitespace-nowrap">
                  {loading ? 'جارٍ تسجيل الدخول...' : 'متابعة كضيف ⚡'}
                </span>

                <span className="w-8 shrink-0" aria-hidden="true" />
              </button>
            </div>

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
      {/* SECURE GOOGLE OAUTH + VERIFIED EMAIL / PASSWORD / OTP MODAL           */}
      {/* ===================================================================== */}
      {showGoogleModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#072233] border-2 border-[#38bdf8]/60 rounded-3xl p-5 sm:p-6 max-w-md w-full text-right shadow-[0_0_45px_rgba(56,189,248,0.35)] animate-in zoom-in-95 duration-150 my-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3.5 mb-4 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-6 h-6 text-lime-400 shrink-0" />
                <div>
                  <h3 className="text-base font-black text-white">المصادقة وتأكيد ملكية الحساب</h3>
                  <p className="text-[11px] text-slate-400 font-bold">
                    لا يمكن لأي شخص دخول حسابك بدون مصادقة Google أو كلمة مرورك
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGoogleModal(false)}
                className="p-1.5 rounded-lg bg-slate-800/80 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {error && (
              <div className="mb-3.5 px-3.5 py-2.5 rounded-xl bg-rose-500/20 border border-rose-500/50 text-rose-200 text-xs font-bold leading-relaxed">
                {error}
              </div>
            )}

            {infoMsg && (
              <div className="mb-3.5 px-3.5 py-2.5 rounded-xl bg-emerald-500/20 border border-emerald-400/50 text-emerald-200 text-xs font-bold leading-relaxed">
                {infoMsg}
              </div>
            )}

            {/* OPTION A: Official Google OAuth Redirect via Supabase */}
            <div className="mb-4">
              <button
                type="button"
                disabled={loading}
                onClick={handleOfficialGoogleSignIn}
                className="w-full py-3 px-4 rounded-2xl bg-white hover:bg-slate-100 text-slate-950 font-black text-xs sm:text-sm flex items-center justify-between shadow-lg transition-all active:scale-[0.98] cursor-pointer disabled:opacity-60"
              >
                <div className="flex items-center gap-2.5">
                  <svg className="w-5 h-5 shrink-0" viewBox="0 0 48 48">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                  </svg>
                  <span>الدخول الرسمي عبر موقع Google</span>
                </div>
                <ExternalLink className="w-4 h-4 text-slate-600 shrink-0" />
              </button>
              <p className="text-[10px] text-slate-400 mt-1.5 px-1">
                يحوّلك مباشرة لصفحة مصادقة Google الرسمية (يتطلب تفعيل Google Provider في Supabase).
              </p>
            </div>

            <div className="relative flex py-2 items-center mb-3">
              <div className="flex-grow border-t border-slate-800" />
              <span className="flex-shrink mx-3 text-[11px] font-bold text-slate-400">
                أو تأكيد ملكية البريد الإلكتروني
              </span>
              <div className="flex-grow border-t border-slate-800" />
            </div>

            {/* Method Selector Tabs: Password vs Email OTP Code */}
            <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[#03131d] border border-[#1e3a4c] mb-4">
              <button
                type="button"
                onClick={() => {
                  sounds.playTap();
                  setVerifyMethod('PASSWORD');
                  setError('');
                  setInfoMsg('');
                }}
                className={`py-2 px-3 rounded-lg text-xs font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  verifyMethod === 'PASSWORD'
                    ? 'bg-lime-400 text-slate-950 shadow'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Lock className="w-3.5 h-3.5" />
                <span>بكلمة المرور السرية</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  sounds.playTap();
                  setVerifyMethod('OTP');
                  setError('');
                  setInfoMsg('');
                }}
                className={`py-2 px-3 rounded-lg text-xs font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  verifyMethod === 'OTP'
                    ? 'bg-sky-400 text-slate-950 shadow'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>برمز تحقق للبريد (OTP)</span>
              </button>
            </div>

            {/* METHOD 1: EMAIL + PASSWORD (LOGIN OR REGISTER) */}
            {verifyMethod === 'PASSWORD' ? (
              <form onSubmit={handlePasswordAuthSubmit} className="space-y-3">
                {/* Sub-tabs: Login vs Create New Account */}
                <div className="flex items-center gap-2 text-xs font-bold mb-1">
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('LOGIN');
                      setError('');
                    }}
                    className={`flex-1 py-1.5 rounded-lg border transition-colors cursor-pointer ${
                      authMode === 'LOGIN'
                        ? 'bg-sky-500/20 border-sky-400 text-sky-300 font-black'
                        : 'bg-transparent border-slate-800 text-slate-400'
                    }`}
                  >
                    تسجيل دخول لحسابي
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('REGISTER');
                      setError('');
                    }}
                    className={`flex-1 py-1.5 rounded-lg border transition-colors cursor-pointer ${
                      authMode === 'REGISTER'
                        ? 'bg-lime-500/20 border-lime-400 text-lime-300 font-black'
                        : 'bg-transparent border-slate-800 text-slate-400'
                    }`}
                  >
                    حساب جديد (حماية بباسورد)
                  </button>
                </div>

                {authMode === 'REGISTER' && (
                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 mb-1">
                      الاسم الظاهر في اللعبة:
                    </label>
                    <input
                      type="text"
                      required
                      value={customName}
                      onChange={(e) => setCustomName(e.target.value)}
                      placeholder="مثال: أحمد الكندري"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#03131d] border border-[#25465c] text-white placeholder-slate-500 text-xs focus:outline-none focus:border-lime-400"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-bold text-slate-300 mb-1">
                    البريد الإلكتروني (الإيميل):
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      required
                      value={customEmail}
                      onChange={(e) => setCustomEmail(e.target.value)}
                      placeholder="name@gmail.com"
                      dir="ltr"
                      className="w-full pr-9 pl-3.5 py-2.5 rounded-xl bg-[#03131d] border border-[#25465c] text-white placeholder-slate-500 text-xs text-left focus:outline-none focus:border-lime-400"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-300 mb-1">
                    {authMode === 'LOGIN'
                      ? 'كلمة المرور الخاصة بك:'
                      : 'عيّن كلمة مرور سرية لحماية حسابك (6 خانات على الأقل):'}
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={customPassword}
                      onChange={(e) => setCustomPassword(e.target.value)}
                      placeholder="••••••••"
                      dir="ltr"
                      className="w-full pr-9 pl-3.5 py-2.5 rounded-xl bg-[#03131d] border border-[#25465c] text-white placeholder-slate-500 text-xs text-left focus:outline-none focus:border-lime-400"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 font-black text-xs sm:text-sm transition-colors cursor-pointer disabled:opacity-60 shadow-lg"
                >
                  {loading
                    ? 'جارٍ التحقق من الملكية...'
                    : authMode === 'LOGIN'
                    ? 'تحقق وتسجيل الدخول 🔒'
                    : 'إنشاء الحساب وتأمينه بكلمة المرور 🛡️'}
                </button>
              </form>
            ) : (
              /* METHOD 2: EMAIL OTP VERIFICATION CODE */
              <div className="space-y-3">
                {!otpSent ? (
                  <form onSubmit={handleSendOtpCode} className="space-y-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-300 mb-1">
                        الاسم الظاهر (اختياري):
                      </label>
                      <input
                        type="text"
                        value={customName}
                        onChange={(e) => setCustomName(e.target.value)}
                        placeholder="مثال: أحمد"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#03131d] border border-[#25465c] text-white placeholder-slate-500 text-xs focus:outline-none focus:border-sky-400"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-300 mb-1">
                        أدخل بريدك الإلكتروني لإرسال كود التحقق السري إليه:
                      </label>
                      <input
                        type="email"
                        required
                        value={customEmail}
                        onChange={(e) => setCustomEmail(e.target.value)}
                        placeholder="name@gmail.com"
                        dir="ltr"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#03131d] border border-[#25465c] text-white placeholder-slate-500 text-xs text-left focus:outline-none focus:border-sky-400"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={loading || !isSupabaseConfigured}
                      className="w-full py-3 rounded-xl bg-sky-400 hover:bg-sky-300 text-slate-950 font-black text-xs sm:text-sm transition-colors cursor-pointer disabled:opacity-60"
                    >
                      {loading ? 'جارٍ الإرسال لبريدك...' : 'إرسال رمز التحقق إلى البريد 📩'}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleVerifyOtpSubmit} className="space-y-3">
                    <div>
                      <label className="block text-[11px] font-bold text-sky-300 mb-1">
                        أدخل رمز التحقق المكوّن من 6 أرقام المرسل إلى ({customEmail}):
                      </label>
                      <input
                        type="text"
                        required
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value)}
                        placeholder="123456"
                        dir="ltr"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#03131d] border-2 border-sky-400 text-white text-center font-mono text-base tracking-widest focus:outline-none"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-3 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 font-black text-xs sm:text-sm transition-colors cursor-pointer"
                    >
                      {loading ? 'جارٍ مطابقة الرمز...' : 'تأكيد الرمز والدخول للحساب ✅'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setOtpSent(false);
                        setOtpCode('');
                      }}
                      className="w-full py-1.5 text-[11px] font-bold text-slate-400 hover:text-white cursor-pointer"
                    >
                      تغيير البريد الإلكتروني أو إعادة الإرسال
                    </button>
                  </form>
                )}
              </div>
            )}
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
