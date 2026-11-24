import React, { useState, useEffect, useCallback } from 'react';
import { PlayerProfile, ScreenState } from '../types/game';
import {
  Volume2,
  VolumeX,
  Tv,
  Eye,
  Sun,
  HelpCircle,
  ArrowRight,
  CheckCircle2,
  ShieldCheck,
  Trash2,
  FileText,
  AlertTriangle,
  X,
  LogOut,
  Ban,
  ShieldOff
} from 'lucide-react';
import { sounds } from '../utils/audio';
import { apiFetch, deletePlayerAccountPermanently } from '../services/supabaseClient';

export type EyeComfortIntensity = 'SOFT' | 'WARM' | 'DEEP';

interface SettingsScreenProps {
  isMuted: boolean;
  onToggleMute: () => void;
  tvMode: boolean;
  onToggleTV: () => void;
  eyeComfortMode?: boolean;
  onToggleEyeComfort?: () => void;
  eyeComfortIntensity?: EyeComfortIntensity;
  onChangeEyeComfortIntensity?: (intensity: EyeComfortIntensity) => void;
  onNavigate: (screen: ScreenState) => void;
  user?: PlayerProfile | null;
  onUpdateUser?: (user: PlayerProfile) => void;
  onAccountDeleted?: () => void;
  onLogout?: () => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  isMuted,
  onToggleMute,
  tvMode,
  onToggleTV,
  eyeComfortMode = false,
  onToggleEyeComfort,
  eyeComfortIntensity = 'WARM',
  onChangeEyeComfortIntensity,
  onNavigate,
  user,
  onUpdateUser,
  onAccountDeleted,
  onLogout
}) => {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [legalModal, setLegalModal] = useState<'PRIVACY' | 'TERMS' | null>(null);
  const [blockedList, setBlockedList] = useState<
    { username: string; displayName: string; avatar: string }[]
  >([]);

  const fetchBlockedList = useCallback(async () => {
    if (!user?.username) return;
    try {
      const res = await apiFetch(`/api/moderation/blocked?username=${encodeURIComponent(user.username)}`);
      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.success && Array.isArray(data.blockedDetails)) {
          setBlockedList(data.blockedDetails);
        }
      }
    } catch {
      // ignore offline
    }
  }, [user?.username]);

  useEffect(() => {
    fetchBlockedList();
  }, [fetchBlockedList]);

  const handleUnblockUser = async (targetUsername: string) => {
    if (!user?.username) return;
    sounds.playTap();
    try {
      const res = await apiFetch('/api/moderation/unblock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: user.username,
          targetUsername
        })
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        sounds.playVictory();
        if (data.user && onUpdateUser) onUpdateUser(data.user);
        setBlockedList(prev => prev.filter(b => b.username !== targetUsername));
      }
    } catch {
      sounds.playError();
    }
  };

  const handleConfirmDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    sounds.playTap();
    if (!user?.username) return;

    const cleanConfirm = deleteConfirmText.trim().toUpperCase();
    if (cleanConfirm !== 'DELETE' && cleanConfirm !== 'حذف') {
      sounds.playError();
      setDeleteError('يرجى كتابة كلمة «حذف» أو «DELETE» للتأكيد النهائي');
      return;
    }

    setDeleting(true);
    setDeleteError('');
    try {
      const res = await deletePlayerAccountPermanently(user.username);
      if (!res.success) {
        sounds.playError();
        setDeleteError(res.error || 'تعذر حذف الحساب، يرجى المحاولة مرة أخرى');
        setDeleting(false);
        return;
      }
      setShowDeleteModal(false);
      if (onAccountDeleted) {
        onAccountDeleted();
      } else {
        onNavigate('AUTH');
      }
    } catch {
      sounds.playError();
      setDeleteError('حدث خطأ أثناء حذف الحساب، يرجى المحاولة مرة أخرى');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="safe-screen max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <button
          onClick={() => {
            sounds.playTap();
            onNavigate('HOME');
          }}
          className="text-xs text-slate-400 hover:text-white flex items-center gap-1.5 p-2 rounded-xl bg-slate-900 border border-slate-800 transition-colors cursor-pointer"
        >
          <ArrowRight className="w-4 h-4" />
          <span>رجوع للرئيسية</span>
        </button>

        <span className="text-xs font-bold text-amber-400 bg-amber-400/10 px-2.5 py-1 rounded-full border border-amber-400/20">
          الإعدادات والتحكم
        </span>
      </div>

      {/* Audio & TV Settings */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-6">
        <h3 className="text-lg font-black text-white text-right">خيارات اللعبة الأساسية</h3>

        {/* Audio Toggle */}
        <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-950 border border-slate-800">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                onToggleMute();
                sounds.playWordFound();
              }}
              className={`w-12 h-7 rounded-full p-1 transition-colors cursor-pointer ${
                !isMuted ? 'bg-emerald-500' : 'bg-slate-700'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white transition-transform ${
                  !isMuted ? 'translate-x-[-20px]' : 'translate-x-0'
                }`}
              />
            </button>
            <button
              onClick={() => sounds.playWordFound()}
              className="text-xs text-amber-400 hover:underline font-bold cursor-pointer"
            >
              تجربة الصوت
            </button>
          </div>

          <div className="text-right">
            <div className="flex items-center justify-end gap-2 text-sm font-bold text-white">
              <span>المؤثرات الصوتية والاهتزاز التفاعلي</span>
              {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              أصوات النقر والاحتفال التفاعلية مع دعم استجابة اللمس Haptics على iPhone
            </p>
          </div>
        </div>

        {/* TV Mode Toggle */}
        <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-950 border border-slate-800">
          <button
            onClick={() => {
              sounds.playTap();
              onToggleTV();
            }}
            className={`w-12 h-7 rounded-full p-1 transition-colors cursor-pointer ${
              tvMode ? 'bg-sky-500' : 'bg-slate-700'
            }`}
          >
            <div
              className={`w-5 h-5 rounded-full bg-white transition-transform ${
                tvMode ? 'translate-x-[-20px]' : 'translate-x-0'
              }`}
            />
          </button>

          <div className="text-right">
            <div className="flex items-center justify-end gap-2 text-sm font-bold text-white">
              <span>وضع الشاشات الكبيرة والريموت كنترول</span>
              <Tv className="w-4 h-4 text-sky-400" />
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              تفعيل مؤشر التنقل بالأسهم واختيار الكلمات بزر OK دون لمس
            </p>
          </div>
        </div>

        {/* Eye Comfort Mode (وضع الراحة البصرية) */}
        <div
          className={`p-4 rounded-2xl border transition-all space-y-3.5 ${
            eyeComfortMode
              ? 'bg-[#1c140a]/95 border-amber-500/50 shadow-[0_0_24px_rgba(245,158,11,0.15)]'
              : 'bg-slate-950 border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              aria-label="تفعيل وضع الراحة البصرية"
              onClick={() => {
                sounds.playTap();
                onToggleEyeComfort?.();
              }}
              className={`w-12 h-7 rounded-full p-1 transition-colors cursor-pointer shrink-0 ${
                eyeComfortMode ? 'bg-amber-500' : 'bg-slate-700'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white transition-transform ${
                  eyeComfortMode ? 'translate-x-[-20px]' : 'translate-x-0'
                }`}
              />
            </button>

            <div className="text-right">
              <div className="flex items-center justify-end gap-2 text-sm font-bold text-white">
                <span>وضع الراحة البصرية (Eye Comfort Mode)</span>
                <Eye className={`w-4 h-4 ${eyeComfortMode ? 'text-amber-400' : 'text-slate-400'}`} />
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                تعديل درجة حرارة ألوان الواجهة إلى درجات أدفأ وتقليل سطوع الخلفية الصارخ عند تفعيل وضع اللعب الطويل
              </p>
            </div>
          </div>

          {/* Warmth & Dimming Level Selector */}
          <div className="pt-2.5 border-t border-slate-800/80" dir="rtl">
            <div className="flex items-center justify-between text-xs font-bold text-amber-200/90 mb-2">
              <span className="flex items-center gap-1.5">
                <Sun className="w-3.5 h-3.5 text-amber-400" />
                <span>درجة دفء الألوان وتخفيف السطوع للعب الطويل:</span>
              </span>
              <span className="text-[11px] text-slate-400">
                {eyeComfortMode ? 'مفعّل لحماية العين' : 'اضغط على أي درجة للتفعيل الفوري'}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  {
                    id: 'SOFT' as const,
                    label: 'دافئ خفيف',
                    sub: 'تخفيف السطوع 8%'
                  },
                  {
                    id: 'WARM' as const,
                    label: 'لعب طويل (موصى به)',
                    sub: 'دفء متوازن • تخفيف 14%'
                  },
                  {
                    id: 'DEEP' as const,
                    label: 'حماية ليلية قصوى',
                    sub: 'دفء عميق • تخفيف 22%'
                  }
                ]
              ).map(preset => {
                const isSelected = eyeComfortMode && eyeComfortIntensity === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      sounds.playTap();
                      onChangeEyeComfortIntensity?.(preset.id);
                      if (!eyeComfortMode) {
                        onToggleEyeComfort?.();
                      }
                    }}
                    className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-amber-500/20 border-amber-400 text-amber-200 shadow-sm'
                        : 'bg-slate-900/90 border-slate-800 text-slate-300 hover:border-amber-500/40'
                    }`}
                  >
                    <div className="text-xs font-black whitespace-nowrap">{preset.label}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{preset.sub}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Game Rules */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-3 text-right">
        <div className="flex items-center justify-end gap-2 text-lg font-black text-white">
          <span>قواعد لعبة فتّشها</span>
          <HelpCircle className="w-5 h-5 text-amber-400" />
        </div>

        <ul className="space-y-2 text-xs text-slate-300 leading-relaxed">
          <li className="flex items-start gap-2 justify-end">
            <span>الكلمات تتواجد في 8 اتجاهات: أفقياً (من اليمين أو اليسار)، رأسياً، وقطرياً.</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          </li>
          <li className="flex items-start gap-2 justify-end">
            <span>يمكنك تحديد الكلمة بالسحب المتواصل باللمس أو الماوس، أو بالضغط على أول حرف ثم آخر حرف.</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          </li>
          <li className="flex items-start gap-2 justify-end">
            <span>في اللعب أونلاين، أول لاعب يعثر على الكلمة يسجل نقاطها وتُقفل أمام الخصم!</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          </li>
          <li className="flex items-start gap-2 justify-end">
            <span>التلميحات تضيء لك الحرف الأول من كلمة لم تكتشفها بعد لتسهيل العثور عليها.</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          </li>
        </ul>
      </div>

      {/* Privacy Policy, Terms & Account Deletion (Apple App Store Guideline 5.1.1) */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4 text-right">
        <div className="flex items-center justify-end gap-2 text-lg font-black text-white">
          <span>الخصوصية وإدارة الحساب</span>
          <ShieldCheck className="w-5 h-5 text-cyan-400" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => {
              sounds.playTap();
              setLegalModal('PRIVACY');
            }}
            className="p-3.5 rounded-2xl bg-slate-950 hover:bg-slate-900 border border-slate-800 flex items-center justify-between transition-colors cursor-pointer"
          >
            <FileText className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-black text-white">سياسة الخصوصية (Privacy Policy)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              sounds.playTap();
              setLegalModal('TERMS');
            }}
            className="p-3.5 rounded-2xl bg-slate-950 hover:bg-slate-900 border border-slate-800 flex items-center justify-between transition-colors cursor-pointer"
          >
            <FileText className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-black text-white">شروط الاستخدام (Terms of Use)</span>
          </button>
        </div>

        {user && (
          <div className="pt-3 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="w-full sm:w-auto flex flex-col sm:flex-row items-center gap-2">
              {onLogout && (
                <button
                  type="button"
                  onClick={() => {
                    sounds.playTap();
                    onLogout();
                  }}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/50 text-amber-200 text-xs font-black flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  <span>تسجيل الخروج</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  sounds.playTap();
                  setDeleteConfirmText('');
                  setDeleteError('');
                  setShowDeleteModal(true);
                }}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-300 text-xs font-black flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>حذف الحساب نهائياً (Delete Account)</span>
              </button>
            </div>

            <div className="text-right">
              <div className="text-xs font-black text-slate-200">
                الحساب المسجل حالياً: {user.displayName} (@{user.username})
              </div>
              <p className="text-[11px] text-slate-400">
                يمكنك تسجيل الخروج أو طلب حذف حسابك وجميع بيانات تقدمك نهائياً في أي وقت.
              </p>
            </div>
          </div>
        )}

        {user && (
          <div className="pt-3 border-t border-slate-800 space-y-2.5">
            <div className="flex items-center justify-end gap-2 text-xs font-black text-white">
              <span>الحسابات المحظورة والسلامة (UGC Safety) ({blockedList.length})</span>
              <Ban className="w-4 h-4 text-rose-400" />
            </div>
            {blockedList.length === 0 ? (
              <p className="text-[11px] text-slate-400">
                لا يوجد لاعبون محظورون حالياً. يمكنك حظر أو الإبلاغ عن أي لاعب من صالة الأونلاين أو شاشة الأصدقاء.
              </p>
            ) : (
              <div className="space-y-2">
                {blockedList.map(b => (
                  <div
                    key={b.username}
                    className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-2"
                  >
                    <button
                      type="button"
                      onClick={() => handleUnblockUser(b.username)}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-emerald-500/20 border border-slate-700 hover:border-emerald-400/50 text-xs font-black text-slate-200 flex items-center gap-1 cursor-pointer"
                    >
                      <ShieldOff className="w-3.5 h-3.5" />
                      <span>إلغاء الحظر</span>
                    </button>
                    <div className="text-right">
                      <div className="text-xs font-black text-white">{b.displayName}</div>
                      <div dir="ltr" className="text-[11px] font-mono text-slate-400">
                        @{b.username}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Permanent Account Deletion Modal */}
      {showDeleteModal && user && (
        <div
          dir="rtl"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
        >
          <div className="bg-[#072233] border-2 border-rose-500/60 rounded-3xl p-6 max-w-md w-full text-right shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2 text-rose-400">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <h3 className="text-base font-black text-white">تأكيد حذف الحساب نهائياً</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed font-bold">
              أنت على وشك حذف حساب «{user.displayName}» (@{user.username}) نهائياً من خادم لعبة فتّشها. سيتم مسح جميع مراحل التقدم، النجوم، العملات، الألقاب، وقائمة الأصدقاء المرتبطة بهذا الحساب بشكل دائم ولا يمكن التراجع عن هذا الإجراء.
            </p>

            {deleteError && (
              <div className="p-3 rounded-xl bg-rose-500/20 border border-rose-500/50 text-rose-200 text-xs font-bold">
                {deleteError}
              </div>
            )}

            <form onSubmit={handleConfirmDeleteAccount} className="space-y-3">
              <div>
                <label className="block text-xs font-black text-rose-300 mb-1.5">
                  اكتب كلمة «حذف» أو «DELETE» لتأكيد حذف الحساب نهائياً:
                </label>
                <input
                  type="text"
                  required
                  value={deleteConfirmText}
                  onChange={e => setDeleteConfirmText(e.target.value)}
                  placeholder="حذف / DELETE"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#03131d] border border-rose-500/50 text-white text-xs font-bold focus:outline-none focus:border-rose-400"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="submit"
                  disabled={deleting}
                  className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs cursor-pointer disabled:opacity-60"
                >
                  {deleting ? 'جارٍ حذف الحساب...' : 'تأكيد الحذف النهائي'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Privacy & Terms Modal */}
      {legalModal && (
        <div
          dir="rtl"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
        >
          <div className="bg-[#072233] border-2 border-cyan-400/50 rounded-3xl p-6 max-w-md w-full text-right shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-black text-white">
                {legalModal === 'PRIVACY' ? 'سياسة الخصوصية - لعبة فتّشها' : 'شروط الاستخدام - لعبة فتّشها'}
              </h3>
              <button
                type="button"
                onClick={() => setLegalModal(null)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs text-slate-300 leading-relaxed space-y-2.5">
              {legalModal === 'PRIVACY' ? (
                <>
                  <p>1. البيانات المحفوظة: تحفظ لعبة «فتّشها» اسم المستخدم، التقدم في المراحل، النجوم، العملات الافتراضية، والألقاب داخل التطبيق لمزامنة حسابك عبر أجهزتك.</p>
                  <p>2. عدم التتبع الإعلاني: لا يستخدم التطبيق أي أدوات تتبع إعلانية خارجية (Zero Third-Party Ad Tracking) ولا يبيع أو يشارك بياناتك مع أي طرف ثالث.</p>
                  <p>3. حذف الحساب والبيانات: يمكنك في أي وقت حذف حسابك وجميع بياناتك المرتبطة به نهائياً وفوراً من داخل التطبيق عبر خيار «حذف الحساب نهائياً» في الإعدادات أو الملف الشخصي.</p>
                </>
              ) : (
                <>
                  <p>1. قواعد اللعب النزيه: تُحتسب جميع النقاط والنجوم والمكافآت والعملات الافتراضية عبر الخادم الرسمي للعبة لضمان عدالة المنافسة.</p>
                  <p>2. الغرف الجماعية: يرجى الالتزام بالاحترام المتبادل عند اختيار أسماء الغرف وإرسال الرسائل داخل الغرف الجماعية.</p>
                  <p>3. العملات والعناصر: جميع العملات والألقاب والمظاهر داخل اللعبة هي عناصر افتراضية مخصصة للمتعة والتنافس داخل اللعبة فقط.</p>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={() => setLegalModal(null)}
              className="w-full py-2.5 rounded-xl bg-white text-slate-950 font-black text-xs cursor-pointer"
            >
              إغلاق
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
