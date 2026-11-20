import React, { useState, useCallback, useEffect } from 'react';
import { PlayerReport, ReportStatus } from '../types/game';
import { apiFetch } from '../services/supabaseClient';
import {
  ShieldCheck,
  ArrowRight,
  RefreshCw,
  CheckCircle2,
  Clock,
  XCircle,
  Search,
  Lock,
  LogOut,
  FileText
} from 'lucide-react';

interface AdminModerationScreenProps {
  onBack: () => void;
}

interface AdminAuditEntry {
  id: string;
  reportId?: string;
  action: string;
  note?: string;
  at?: string;
  createdAt?: number;
}

const ADMIN_TOKEN_STORAGE_KEY = 'fatteshha_admin_moderation_token';

const STATUS_LABELS: Record<ReportStatus, string> = {
  PENDING: 'قيد الانتظار',
  REVIEWING: 'قيد المراجعة',
  RESOLVED: 'تمت المعالجة',
  DISMISSED: 'مرفوض / لا مخالفة'
};

export const AdminModerationScreen: React.FC<AdminModerationScreenProps> = ({ onBack }) => {
  const [adminToken, setAdminToken] = useState<string>(() => {
    try {
      return sessionStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) || '';
    } catch {
      return '';
    }
  });
  const [secretInput, setSecretInput] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  const [reports, setReports] = useState<PlayerReport[]>([]);
  const [auditLog, setAuditLog] = useState<AdminAuditEntry[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [filterStatus, setFilterStatus] = useState<ReportStatus | 'ALL'>('ALL');
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState('');

  const fetchReports = useCallback(async (tokenToUse: string) => {
    if (!tokenToUse) return;
    setLoadingReports(true);
    try {
      const res = await apiFetch('/api/admin/reports', {
        headers: { 'x-admin-token': tokenToUse }
      });
      if (res.status === 401 || res.status === 403) {
        try {
          sessionStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
        } catch {
          // ignore
        }
        setAdminToken('');
        setLoginError('انتهت جلسة الإشراف أو أن الرمز غير صالح');
        return;
      }
      const data = await res.json().catch(() => null);
      if (data?.success) {
        setReports(Array.isArray(data.reports) ? data.reports : []);
        setAuditLog(Array.isArray(data.auditLog) ? data.auditLog : []);
      }
    } catch {
      setActionMsg('تعذر تحميل قائمة البلاغات من الخادم');
    } finally {
      setLoadingReports(false);
    }
  }, []);

  useEffect(() => {
    if (adminToken) {
      fetchReports(adminToken);
    }
  }, [adminToken, fetchReports]);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!secretInput.trim()) return;
    setLoginLoading(true);
    setLoginError('');
    try {
      const res = await apiFetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: secretInput.trim() })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success || !data?.adminToken) {
        setLoginError(data?.error || 'مفتاح الإدارة غير صحيح');
        return;
      }
      try {
        sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, data.adminToken);
      } catch {
        // ignore
      }
      setSecretInput('');
      setAdminToken(data.adminToken);
    } catch {
      setLoginError('تعذر الاتصال بخادم الإشراف');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleUpdateStatus = async (reportId: string, nextStatus: ReportStatus) => {
    if (!adminToken) return;
    setUpdatingId(reportId);
    setActionMsg('');
    try {
      const res = await apiFetch(`/api/admin/reports/${encodeURIComponent(reportId)}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': adminToken
        },
        body: JSON.stringify({
          status: nextStatus,
          actionNote: (noteDrafts[reportId] ?? '').trim()
        })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setActionMsg(data?.error || 'تعذر تحديث حالة البلاغ');
        return;
      }
      setActionMsg(`تم تحديث البلاغ ${reportId} إلى «${STATUS_LABELS[nextStatus]}»`);
      await fetchReports(adminToken);
    } catch {
      setActionMsg('حدث خطأ أثناء الاتصال بالخادم');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleAdminLogout = () => {
    try {
      sessionStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
    } catch {
      // ignore
    }
    setAdminToken('');
    setReports([]);
    setAuditLog([]);
  };

  const filteredReports =
    filterStatus === 'ALL' ? reports : reports.filter(r => r.status === filterStatus);

  return (
    <div dir="rtl" className="safe-screen min-h-dvh w-full max-w-4xl mx-auto p-4 sm:p-6 space-y-5">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onBack}
          className="text-xs text-slate-300 hover:text-white flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 cursor-pointer"
        >
          <ArrowRight className="w-4 h-4" />
          <span>العودة للعبة</span>
        </button>

        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded-full bg-cyan-500/15 border border-cyan-400/40 text-cyan-300 text-xs font-black flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4" />
            <span>لوحة مراجعة بلاغات المحتوى (UGC Moderation)</span>
          </span>
          {adminToken && (
            <button
              type="button"
              onClick={handleAdminLogout}
              className="px-3 py-1.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-200 text-xs font-bold flex items-center gap-1 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>خروج المشرف</span>
            </button>
          )}
        </div>
      </div>

      {!adminToken ? (
        <div className="max-w-md mx-auto mt-10 p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl space-y-4">
          <div className="flex items-center gap-2.5 text-white">
            <Lock className="w-6 h-6 text-cyan-400" />
            <h2 className="text-lg font-black">تسجيل دخول المشرفين</h2>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            هذه البوابة مخصصة لفريق إشراف «فتّشها» لمراجعة بلاغات اللاعبين خلال 24 ساعة وفق متطلبات الأمان. يتطلب الدخول مفتاح الإدارة المعتمد على الخادم.
          </p>

          <form onSubmit={handleAdminLogin} className="space-y-3">
            <input
              type="password"
              dir="ltr"
              value={secretInput}
              onChange={e => setSecretInput(e.target.value)}
              placeholder="FATTESHHA_ADMIN_SECRET"
              required
              className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-700 focus:border-cyan-400 text-white text-sm font-mono focus:outline-none"
            />
            {loginError && (
              <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-200 text-xs font-bold">
                {loginError}
              </div>
            )}
            <button
              type="submit"
              disabled={loginLoading}
              className="w-full py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-sm cursor-pointer disabled:opacity-60"
            >
              {loginLoading ? 'جارٍ التحقق...' : 'فتح لوحة المراجعة'}
            </button>
          </form>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Toolbar */}
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 flex-wrap">
              {(['ALL', 'PENDING', 'REVIEWING', 'RESOLVED', 'DISMISSED'] as const).map(st => {
                const count =
                  st === 'ALL' ? reports.length : reports.filter(r => r.status === st).length;
                const active = filterStatus === st;
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setFilterStatus(st)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black border cursor-pointer transition-all ${
                      active
                        ? 'bg-cyan-500 text-slate-950 border-cyan-400'
                        : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-cyan-500/40'
                    }`}
                  >
                    {st === 'ALL' ? 'الكل' : STATUS_LABELS[st]} ({count})
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => fetchReports(adminToken)}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingReports ? 'animate-spin' : ''}`} />
              <span>تحديث</span>
            </button>
          </div>

          {actionMsg && (
            <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-400/50 text-emerald-200 text-xs font-bold">
              {actionMsg}
            </div>
          )}

          {/* Reports List */}
          <div className="space-y-3">
            {filteredReports.length === 0 ? (
              <div className="p-8 rounded-2xl bg-slate-900/70 border border-dashed border-slate-800 text-center text-xs text-slate-400">
                لا توجد بلاغات ضمن هذا التصنيف حالياً
              </div>
            ) : (
              filteredReports.map(rep => (
                <div
                  key={rep.id}
                  className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3"
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2.5 py-0.5 rounded-full bg-rose-500/20 border border-rose-400/40 text-rose-200 text-xs font-black">
                          {rep.reason}
                        </span>
                        <span className="text-sm font-black text-white">
                          المُبلَّغ عنه: {rep.targetDisplayName} (@{rep.targetUsername})
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 font-bold">
                        المُبلِّغ: @{rep.reporterUsername} • السياق: {rep.context || 'ONLINE_GAME'}
                        {rep.roomCode ? ` • غرفة #${rep.roomCode}` : ''} •{' '}
                        {new Date(rep.createdAt).toLocaleString('ar-KW')}
                      </div>
                      {rep.details && (
                        <p className="text-xs text-slate-200 bg-slate-950 p-2.5 rounded-xl border border-slate-800 mt-1">
                          {rep.details}
                        </p>
                      )}
                    </div>

                    <span
                      className={`px-3 py-1 rounded-full text-xs font-black border shrink-0 ${
                        rep.status === 'PENDING'
                          ? 'bg-amber-500/20 border-amber-400/50 text-amber-200'
                          : rep.status === 'REVIEWING'
                          ? 'bg-sky-500/20 border-sky-400/50 text-sky-200'
                          : rep.status === 'RESOLVED'
                          ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200'
                          : 'bg-slate-800 border-slate-700 text-slate-300'
                      }`}
                    >
                      {STATUS_LABELS[rep.status]}
                    </span>
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-2 border-t border-slate-800">
                    <input
                      type="text"
                      value={noteDrafts[rep.id] ?? rep.actionNote ?? ''}
                      onChange={e =>
                        setNoteDrafts(prev => ({ ...prev, [rep.id]: e.target.value }))
                      }
                      placeholder="ملاحظة الإشراف / الإجراء المتخذ..."
                      className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-cyan-400"
                    />
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        disabled={updatingId === rep.id}
                        onClick={() => handleUpdateStatus(rep.id, 'REVIEWING')}
                        className="px-3 py-2 rounded-xl bg-sky-500/20 hover:bg-sky-500/35 border border-sky-400/40 text-sky-200 text-xs font-black flex items-center gap-1 cursor-pointer"
                      >
                        <Search className="w-3.5 h-3.5" />
                        <span>قيد المراجعة</span>
                      </button>
                      <button
                        type="button"
                        disabled={updatingId === rep.id}
                        onClick={() => handleUpdateStatus(rep.id, 'RESOLVED')}
                        className="px-3 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/35 border border-emerald-400/40 text-emerald-200 text-xs font-black flex items-center gap-1 cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>اعتماد المعالجة</span>
                      </button>
                      <button
                        type="button"
                        disabled={updatingId === rep.id}
                        onClick={() => handleUpdateStatus(rep.id, 'DISMISSED')}
                        className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-black flex items-center gap-1 cursor-pointer"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>إغلاق</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Audit Log */}
          {auditLog.length > 0 && (
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
              <div className="flex items-center gap-2 text-xs font-black text-slate-300">
                <FileText className="w-4 h-4 text-cyan-400" />
                <span>سجل تدقيق إجراءات المشرفين ({auditLog.length})</span>
              </div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {auditLog.map(entry => (
                  <div
                    key={entry.id}
                    className="text-[11px] text-slate-400 flex items-center justify-between gap-2 bg-slate-950 px-3 py-2 rounded-xl border border-slate-800/80"
                  >
                    <span className="font-mono text-slate-300">
                      [{entry.action}] {entry.reportId}
                      {entry.note ? ` — ${entry.note}` : ''}
                    </span>
                    <span className="flex items-center gap-1 shrink-0">
                      <Clock className="w-3 h-3" />
                      {new Date(entry.at || entry.createdAt || Date.now()).toLocaleString('ar-KW')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
