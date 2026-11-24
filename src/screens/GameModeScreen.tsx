import React from 'react';
import { ScreenState } from '../types/game';
import { Play, Users, Wifi, ArrowRight, ChevronLeft } from 'lucide-react';
import { sounds } from '../utils/audio';

interface GameModeScreenProps {
  onNavigate: (screen: ScreenState) => void;
}

export const GameModeScreen: React.FC<GameModeScreenProps> = ({ onNavigate }) => {
  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
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
          اختر نمط التحدي
        </span>
      </div>

      <h2 className="text-2xl sm:text-3xl font-black text-white text-right">
        أوضاع لعبة فتّشها
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Solo */}
        <div
          onClick={() => {
            sounds.playTap();
            onNavigate('CATEGORIES');
          }}
          className="group bg-slate-900 border border-slate-800 hover:border-sky-400 rounded-3xl p-6 shadow-xl cursor-pointer transition-all duration-300 hover:-translate-y-1 flex flex-col justify-between"
        >
          <div>
            <div className="w-14 h-14 rounded-2xl bg-sky-500/20 text-sky-400 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
              <Play className="w-7 h-7 fill-current" />
            </div>
            <h3 className="text-xl font-black text-white mb-2">اللعب الفردي</h3>
            <p className="text-xs text-slate-400 leading-relaxed mb-4">
              خض رحلة الـ 450 مرحلة في 9 تصنيفات تراثية وعلمية وثقافية، واجمع النجوم والأوسمة.
            </p>
          </div>
          <div className="flex items-center justify-between pt-4 border-t border-slate-800 text-xs font-bold text-sky-400">
            <span>ابدأ الآن</span>
            <ChevronLeft className="w-4 h-4" />
          </div>
        </div>

        {/* Local Multi */}
        <div
          onClick={() => {
            sounds.playTap();
            onNavigate('GAME_LOCAL');
          }}
          className="group bg-slate-900 border border-slate-800 hover:border-purple-400 rounded-3xl p-6 shadow-xl cursor-pointer transition-all duration-300 hover:-translate-y-1 flex flex-col justify-between"
        >
          <div>
            <div className="w-14 h-14 rounded-2xl bg-purple-500/20 text-purple-400 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
              <Users className="w-7 h-7" />
            </div>
            <h3 className="text-xl font-black text-white mb-2">اللعب المحلي</h3>
            <p className="text-xs text-slate-400 leading-relaxed mb-4">
              شارك أصدقاءك في الديوانية أو العائلة على نفس الجهاز، وتناوبوا على اكتشاف الكلمات.
            </p>
          </div>
          <div className="flex items-center justify-between pt-4 border-t border-slate-800 text-xs font-bold text-purple-400">
            <span>تحدي 2-4 لاعبين</span>
            <ChevronLeft className="w-4 h-4" />
          </div>
        </div>

        {/* Online Multi */}
        <div
          onClick={() => {
            sounds.playTap();
            onNavigate('ONLINE_LOBBY');
          }}
          className="group bg-slate-900 border border-slate-800 hover:border-emerald-400 rounded-3xl p-6 shadow-xl cursor-pointer transition-all duration-300 hover:-translate-y-1 flex flex-col justify-between"
        >
          <div>
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
              <Wifi className="w-7 h-7" />
            </div>
            <h3 className="text-xl font-black text-white mb-2">اللعب أونلاين</h3>
            <p className="text-xs text-slate-400 leading-relaxed mb-4">
              أنشئ غرفة أو انضم برمز مباشر، وتنافس في الوقت الفعلي مع أول من يقتنص الكلمة.
            </p>
          </div>
          <div className="flex items-center justify-between pt-4 border-t border-slate-800 text-xs font-bold text-emerald-400">
            <span>مباراة أونلاين</span>
            <ChevronLeft className="w-4 h-4" />
          </div>
        </div>
      </div>
    </div>
  );
};
