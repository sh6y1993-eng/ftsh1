import React, { useState } from 'react';
import { PlayerProfile, ReportReason } from '../types/game';
import { REPORT_REASONS } from '../engine/moderation';
import { apiFetch } from '../services/supabaseClient';
import { sounds } from '../utils/audio';
import { Flag, X, ShieldAlert, Ban, CheckCircle2 } from 'lucide-react';

interface ReportPlayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: PlayerProfile | null;
  targetUsername: string;
  targetDisplayName: string;
  roomCode?: string;
  context?: 'ONLINE_GAME' | 'ONLINE_LOBBY' | 'FRIENDS' | 'PUBLIC_ROOM';
  onReported?: (updatedUser?: PlayerProfile, blockedTarget?: boolean) => void;
}

export const ReportPlayerModal: React.FC<ReportPlayerModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  targetUsername,
  targetDisplayName,
  roomCode,
  context = 'ONLINE_GAME',
  onReported
}) => {
  const [reason, setReason] = useState<ReportReason>(REPORT_REASONS[0]);
  const [details, setDetails] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    sounds.playTap();
    setErrorMsg('');
    setSuccessMsg('');

    if (!currentUser?.username) {
      sounds.playError();
      setErrorMsg('يرجى تسجيل الدخول لإرسال البلاغ');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch('/api/moderation/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reporterUsername: currentUser.username,
          targetUsername,
          targetDisplayName,
          reason,
          details: details.trim(),
          roomCode,
          context,
          alsoBlock
        })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        sounds.playError();
        setErrorMsg(data?.error || 'تعذر إرسال البلاغ حالياً، يرجى المحاولة لاحقاً');
        return;
      }

      sounds.playVictory();
      setSuccessMsg(
        data.message || 'تم استلام البلاغ بنجاح وسيتم مراجعته من فريق الإشراف خلال 24 ساعة'
      );
      if (onReported) {
        onReported(data.user, alsoBlock);
      }
      setTimeout(() => {
        setDetails('');
        setSuccessMsg('');
        onClose();
      }, 1400);
    } catch {
      sounds.playError();
      setErrorMsg('تعذر الاتصال بالخادم حالياً');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-3xl p-5 sm:p-6 bg-[#072233] border-2 border-rose-500/60 shadow-2xl text-right space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2 text-rose-300">
            <Flag className="w-5 h-5 shrink-0" />
            <h3 className="text-base font-black text-white">الإبلاغ عن لاعب</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3 rounded-2xl bg-[#041420] border border-slate-800 flex items-center justify-between gap-2">
          <div>
            <div className="text-xs text-slate-400 font-bold">اللاعب المُبلَّغ عنه:</div>
            <div className="text-sm font-black text-white">{targetDisplayName}</div>
            <div dir="ltr" className="text-[11px] font-mono text-sky-400">
              @{targetUsername}
            </div>
          </div>
          <ShieldAlert className="w-7 h-7 text-rose-400/80 shrink-0" />
        </div>

        {successMsg ? (
          <div className="p-4 rounded-2xl bg-emerald-500/20 border border-emerald-400/60 text-emerald-200 text-xs font-black flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>{successMsg}</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label className="block text-xs font-black text-slate-200 mb-2">
                سبب البلاغ:
              </label>
              <div className="grid grid-cols-2 gap-2">
                {REPORT_REASONS.map(r => {
                  const selected = reason === r;
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() => {
                        sounds.playTap();
                        setReason(r);
                      }}
                      className={`px-3 py-2 rounded-xl text-xs font-black border text-right transition-all cursor-pointer ${
                        selected
                          ? 'bg-rose-500/25 border-rose-400 text-white shadow'
                          : 'bg-slate-900/90 border-slate-800 text-slate-300 hover:border-rose-400/40'
                      }`}
                    >
                      {r}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-black text-slate-200 mb-1.5">
                تفاصيل إضافية (اختياري):
              </label>
              <textarea
                value={details}
                onChange={e => setDetails(e.target.value)}
                maxLength={300}
                rows={3}
                placeholder="اكتب وصفاً مختصراً للمخالفة لمساعدة فريق الإشراف..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#03121c] border border-slate-700 focus:border-rose-400 text-white text-xs font-medium focus:outline-none resize-none"
              />
            </div>

            <label className="flex items-center gap-2.5 p-3 rounded-xl bg-[#041420] border border-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={alsoBlock}
                onChange={e => setAlsoBlock(e.target.checked)}
                className="w-4 h-4 accent-rose-500 rounded cursor-pointer"
              />
              <Ban className="w-4 h-4 text-rose-400 shrink-0" />
              <span className="text-xs font-bold text-slate-200">
                حظر هذا اللاعب فوراً ومنعه من الظهور أو اللعب معي
              </span>
            </label>

            {errorMsg && (
              <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-200 text-xs font-bold">
                {errorMsg}
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs cursor-pointer disabled:opacity-60"
              >
                {submitting ? 'جارٍ إرسال البلاغ...' : 'إرسال البلاغ الآن'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
