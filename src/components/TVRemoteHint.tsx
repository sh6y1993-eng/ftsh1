import React from 'react';
import { Tv } from 'lucide-react';

export const TVRemoteHint: React.FC = () => {
  return (
    <div className="w-full bg-slate-900/95 border-t border-sky-500/30 px-4 py-2 flex items-center justify-between text-xs text-slate-300">
      <div className="flex items-center gap-2 text-sky-400 font-bold">
        <Tv className="w-4 h-4" />
        <span>تحكم الريموت / الأسهم</span>
      </div>
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-1.5">
          <kbd className="px-2 py-0.5 bg-slate-800 rounded border border-slate-700 text-amber-300 font-mono text-[11px]">▲▼◀▶</kbd>
          <span>تحريك</span>
        </div>
        <div className="flex items-center gap-1.5">
          <kbd className="px-2 py-0.5 bg-slate-800 rounded border border-slate-700 text-amber-300 font-mono text-[11px]">OK / Enter</kbd>
          <span>بدء / تأكيد التحديد</span>
        </div>
        <div className="flex items-center gap-1.5">
          <kbd className="px-2 py-0.5 bg-slate-800 rounded border border-slate-700 text-amber-300 font-mono text-[11px]">Esc / Back</kbd>
          <span>إلغاء</span>
        </div>
      </div>
    </div>
  );
};
