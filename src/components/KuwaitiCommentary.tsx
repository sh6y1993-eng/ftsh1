import React from 'react';
import { MessageSquareQuote, Sparkles } from 'lucide-react';

interface KuwaitiCommentaryProps {
  message: string;
  type?: 'praise' | 'mistake' | 'hint' | 'neutral';
}

export const KuwaitiCommentary: React.FC<KuwaitiCommentaryProps> = ({
  message,
  type = 'neutral'
}) => {
  if (!message) return null;

  const getBorderColor = () => {
    switch (type) {
      case 'praise':
        return 'border-amber-500/40 bg-amber-500/10 text-amber-200';
      case 'mistake':
        return 'border-rose-500/40 bg-rose-500/10 text-rose-200';
      case 'hint':
        return 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200';
      default:
        return 'border-slate-700 bg-slate-800/80 text-slate-200';
    }
  };

  return (
    <div className={`flex items-center gap-2.5 px-4 py-2.5 rounded-2xl border ${getBorderColor()} shadow-lg backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-300 max-w-md mx-auto text-sm font-semibold`}>
      <MessageSquareQuote className="w-4 h-4 shrink-0 text-amber-400" />
      <span className="flex-1">{message}</span>
      {type === 'praise' && <Sparkles className="w-4 h-4 shrink-0 text-amber-400 animate-spin" />}
    </div>
  );
};
