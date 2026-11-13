import React from 'react';
import { ScreenState } from '../types/game';
import { Volume2, VolumeX, Tv, HelpCircle, ArrowRight, CheckCircle2, RotateCcw } from 'lucide-react';
import { sounds } from '../utils/audio';

interface SettingsScreenProps {
  isMuted: boolean;
  onToggleMute: () => void;
  tvMode: boolean;
  onToggleTV: () => void;
  onNavigate: (screen: ScreenState) => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  isMuted,
  onToggleMute,
  tvMode,
  onToggleTV,
  onNavigate
}) => {
  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <button
          onClick={() => {
            sounds.playTap();
            onNavigate('HOME');
          }}
          className="text-xs text-slate-400 hover:text-white flex items-center gap-1.5 p-2 rounded-xl bg-slate-900 border border-slate-800 transition-colors"
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
              className={`w-12 h-7 rounded-full p-1 transition-colors ${
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
              className="text-xs text-amber-400 hover:underline font-bold"
            >
              تجربة الصوت
            </button>
          </div>

          <div className="text-right">
            <div className="flex items-center justify-end gap-2 text-sm font-bold text-white">
              <span>المؤثرات الصوتية</span>
              {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              أصوات النقر والاحتفال التفاعلية المخصصة
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
            className={`w-12 h-7 rounded-full p-1 transition-colors ${
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
              <span>وضع Android TV والريموت كنترول</span>
              <Tv className="w-4 h-4 text-sky-400" />
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              تفعيل مؤشر التنقل بالأسهم واختيار الكلمات بزر OK دون لمس
            </p>
          </div>
        </div>
      </div>

      {/* Android TV Remote Guide */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-end gap-2 text-lg font-black text-white">
          <span>دليل تحكم التلفزيون (Android TV)</span>
          <Tv className="w-5 h-5 text-sky-400" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-right">
          <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800">
            <span className="text-xs font-bold text-amber-400 block mb-1">أزرار الأسهم (D-Pad)</span>
            <p className="text-xs text-slate-400">
              استخدم أسهم الريموت (▲▼◀▶) للتنقل بين حروف الشبكة أو أزرار القائمة.
            </p>
          </div>

          <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800">
            <span className="text-xs font-bold text-amber-400 block mb-1">زر OK / الاختيار</span>
            <p className="text-xs text-slate-400">
              اضغط OK عند الحرف الأول، ثم حرّك السهم لنهاية الكلمة واضغط OK مجدداً للتأكيد.
            </p>
          </div>

          <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800">
            <span className="text-xs font-bold text-amber-400 block mb-1">زر الرجوع (Back / Esc)</span>
            <p className="text-xs text-slate-400">
              اضغط زر الرجوع في الريموت لإلغاء التحديد الجاري أو الرجوع للشاشة السابقة.
            </p>
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
    </div>
  );
};
