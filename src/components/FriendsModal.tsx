import React, { useState, useEffect, useCallback } from 'react';
import {
  FriendProfileSummary,
  PlayerProfile,
  RoomInviteNotification
} from '../types/game';
import {
  X,
  UserPlus,
  Users,
  Search,
  Copy,
  Check,
  Send,
  Trash2,
  Play,
  Lock,
  RefreshCw,
  Sparkles,
  Wifi
} from 'lucide-react';
import { sounds } from '../utils/audio';

interface FriendsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: PlayerProfile | null;
  activeRoomCode?: string;
  activeRoomName?: string;
  activeCategoryId?: string;
  activeStagesCount?: number;
  onJoinRoomCode?: (roomCode: string) => void;
  onCreatePrivateRoomAndInvite?: (friend: FriendProfileSummary) => void;
  onUpdateUser?: (user: PlayerProfile) => void;
}

export const FriendsModal: React.FC<FriendsModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  activeRoomCode,
  activeRoomName,
  activeCategoryId = 'kuwait_heritage',
  activeStagesCount = 50,
  onJoinRoomCode,
  onCreatePrivateRoomAndInvite,
  onUpdateUser
}) => {
  const [friends, setFriends] = useState<FriendProfileSummary[]>([]);
  const [suggestions, setSuggestions] = useState<FriendProfileSummary[]>([]);
  const [pendingInvites, setPendingInvites] = useState<RoomInviteNotification[]>([]);
  const [usernameInput, setUsernameInput] = useState('');
  const [searchResults, setSearchResults] = useState<(FriendProfileSummary & { isFriend?: boolean })[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [copiedMyUsername, setCopiedMyUsername] = useState(false);
  const [invitedUsernames, setInvitedUsernames] = useState<Record<string, boolean>>({});

  const myUsername = currentUser?.username || 'ahmad_kwt';
  const myDisplayName = currentUser?.displayName || 'أحمد الكندري';

  const fetchFriendsData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/friends?username=${encodeURIComponent(myUsername)}`);
      const data = await res.json();
      if (data.success) {
        setFriends(data.friends || []);
        setSuggestions(data.suggestions || []);
        setPendingInvites(data.pendingInvites || []);
      }
    } catch {
      // Ignore network error
    } finally {
      setLoading(false);
    }
  }, [myUsername]);

  useEffect(() => {
    if (!isOpen) return;
    fetchFriendsData();
    const interval = setInterval(fetchFriendsData, 5000);
    return () => clearInterval(interval);
  }, [isOpen, fetchFriendsData]);

  // Live search when typing a unique username
  useEffect(() => {
    const q = usernameInput.trim().replace(/^@+/, '');
    if (!q) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/friends/search?q=${encodeURIComponent(q)}&username=${encodeURIComponent(myUsername)}`
        );
        const data = await res.json();
        if (data.success) {
          setSearchResults(data.results || []);
        }
      } catch {
        // Ignore
      }
    }, 180);

    return () => clearTimeout(timer);
  }, [usernameInput, myUsername]);

  if (!isOpen) return null;

  const handleCopyMyUsername = () => {
    sounds.playTap();
    navigator.clipboard.writeText(myUsername);
    setCopiedMyUsername(true);
    setTimeout(() => setCopiedMyUsername(false), 2000);
  };

  const handleAddFriend = async (targetUsername?: string) => {
    const rawTarget = (targetUsername ?? usernameInput).trim().replace(/^@+/, '').toLowerCase();
    if (!rawTarget) {
      sounds.playError();
      setStatusMsg({ text: 'يرجى كتابة اسم المستخدم الفريد للصديق أولاً', type: 'error' });
      return;
    }

    sounds.playTap();
    setStatusMsg(null);

    try {
      const res = await fetch('/api/friends/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: myUsername,
          friendUsername: rawTarget
        })
      });
      const data = await res.json();
      if (data.success) {
        sounds.playMultiplayerWordScore(2, 0);
        setFriends(data.friends || []);
        setSuggestions(data.suggestions || []);
        setUsernameInput('');
        setSearchResults([]);
        if (data.user && onUpdateUser) {
          onUpdateUser(data.user);
        }
        setStatusMsg({
          text: `تمت إضافة «${data.addedFriend?.displayName || rawTarget}» (@${rawTarget}) إلى قائمة أصدقائك بنجاح! 🎉`,
          type: 'success'
        });
      } else {
        sounds.playError();
        setStatusMsg({
          text: data.error || 'تعذر إضافة الصديق، تأكد من اسم المستخدم',
          type: 'error'
        });
      }
    } catch {
      sounds.playError();
      setStatusMsg({ text: 'تعذر الاتصال بالخادم حالياً', type: 'error' });
    }
  };

  const handleRemoveFriend = async (friendUsername: string, friendDisplayName: string) => {
    sounds.playTap();
    try {
      const res = await fetch('/api/friends/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: myUsername,
          friendUsername
        })
      });
      const data = await res.json();
      if (data.success) {
        setFriends(data.friends || []);
        setSuggestions(data.suggestions || []);
        if (data.user && onUpdateUser) {
          onUpdateUser(data.user);
        }
        setStatusMsg({
          text: `تمت إزالة «${friendDisplayName}» من قائمة الأصدقاء`,
          type: 'success'
        });
      }
    } catch {
      // Ignore
    }
  };

  const handleSendDirectInvite = async (friend: FriendProfileSummary) => {
    sounds.playTap();

    // If user is not currently inside a waiting room, offer one-click private room creation + invite
    if (!activeRoomCode && onCreatePrivateRoomAndInvite) {
      onCreatePrivateRoomAndInvite(friend);
      onClose();
      return;
    }

    const codeToInvite = activeRoomCode || 'KWT55';
    try {
      const res = await fetch('/api/friends/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromUsername: myUsername,
          toUsername: friend.username,
          roomCode: codeToInvite,
          roomName: activeRoomName || `غرفة ${myDisplayName}`,
          categoryId: activeCategoryId,
          stagesCount: activeStagesCount
        })
      });
      const data = await res.json();
      if (data.success) {
        sounds.playMultiplayerWordScore(2, 0);
        setInvitedUsernames(prev => ({ ...prev, [friend.username]: true }));
        setStatusMsg({
          text: `📩 تم إرسال دعوة مباشرة إلى «${friend.displayName}» (@${friend.username}) للانضمام إلى الغرفة الخاصة #${codeToInvite}!`,
          type: 'success'
        });
      } else {
        sounds.playError();
        setStatusMsg({ text: data.error || 'تعذر إرسال الدعوة', type: 'error' });
      }
    } catch {
      sounds.playError();
      setStatusMsg({ text: 'تعذر إرسال الدعوة حالياً', type: 'error' });
    }
  };

  const handleAcceptInvite = async (invite: RoomInviteNotification) => {
    sounds.playVictory();
    try {
      await fetch('/api/friends/invites/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: myUsername,
          inviteId: invite.id,
          roomCode: invite.roomCode
        })
      });
    } catch {
      // Ignore
    }
    if (onJoinRoomCode) {
      onJoinRoomCode(invite.roomCode);
      onClose();
    }
  };

  const renderStatusBadge = (friend: FriendProfileSummary) => {
    switch (friend.onlineStatus) {
      case 'IN_ROOM':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-400/20 border border-amber-400/50 text-amber-300 text-[11px] font-black">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            <span>بانتظار منافس في غرفة #{friend.activeRoomCode}</span>
          </span>
        );
      case 'IN_GAME':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-purple-500/20 border border-purple-400/50 text-purple-300 text-[11px] font-black">
            <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
            <span>يلعب مباراة الآن 🎮</span>
          </span>
        );
      case 'ONLINE':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-lime-400/20 border border-lime-400/50 text-lime-300 text-[11px] font-black">
            <span className="w-2 h-2 rounded-full bg-lime-400 shadow-[0_0_8px_#a3e635]" />
            <span>متصل الآن • جاهز للتحدي</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-400 text-[11px] font-bold">
            <span className="w-2 h-2 rounded-full bg-slate-500" />
            <span>غير متصل حالياً</span>
          </span>
        );
    }
  };

  const onlineFriendsCount = friends.filter(f => f.onlineStatus !== 'OFFLINE').length;

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-50 bg-[#010a12]/85 backdrop-blur-md flex items-center justify-center p-2.5 sm:p-5 overflow-y-auto select-none"
    >
      <div
        className="relative w-full max-w-[620px] rounded-[30px] sm:rounded-[36px] overflow-hidden animate-in zoom-in-95 duration-200 my-auto max-h-[92dvh] flex flex-col"
        style={{
          background: 'linear-gradient(180deg, #07253a 0%, #041624 50%, #020d16 100%)',
          border: '2.5px solid #38bdf8',
          boxShadow:
            '0 0 42px rgba(56, 189, 248, 0.4), inset 0 0 24px rgba(14, 165, 233, 0.2), 0 20px 60px rgba(0, 0, 0, 0.9)'
        }}
      >
        {/* Top Specular Neon Highlight */}
        <div
          className="pointer-events-none absolute inset-x-16 top-0 h-[3px] rounded-full"
          style={{
            background: 'linear-gradient(90deg, transparent 0%, #bae6fd 50%, transparent 100%)',
            boxShadow: '0 0 18px 3px #38bdf8'
          }}
        />

        {/* ==================== 1. HEADER ==================== */}
        <div className="px-4 sm:px-6 pt-4 sm:pt-5 pb-3 border-b border-sky-500/25 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-b from-sky-400 to-blue-600 p-0.5 shadow-[0_0_15px_rgba(56,189,248,0.45)]">
              <div className="w-full h-full rounded-[14px] bg-[#061e30] flex items-center justify-center text-sky-300">
                <Users className="w-6 h-6" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-black text-white">الأصدقاء والدعوات</h2>
                <span className="px-2.5 py-0.5 rounded-full bg-lime-400/20 border border-lime-400/40 text-lime-300 text-xs font-black">
                  {onlineFriendsCount} متصل الآن
                </span>
              </div>
              <p className="text-xs text-sky-200/80 font-bold">
                أضف أصدقاءك بمعرفهم الفريد وادعهم مباشرة إلى غرفتك الخاصة!
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                sounds.playTap();
                fetchFriendsData();
              }}
              className="w-9 h-9 rounded-full bg-[#0b2b40] hover:bg-[#123d59] border border-sky-400/40 flex items-center justify-center text-sky-300 transition-all cursor-pointer"
              title="تحديث الحالة"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => {
                sounds.playTap();
                onClose();
              }}
              className="w-10 h-10 rounded-full bg-[#0d3349] hover:bg-[#144763] border border-[#5299be] flex items-center justify-center text-white transition-all cursor-pointer"
              title="إغلاق"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ==================== SCROLLABLE BODY ==================== */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
          {/* My Unique Username Banner */}
          <div className="p-3.5 rounded-2xl bg-[#041421]/90 border border-sky-400/35 flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-bold text-slate-300">اسم المستخدم الفريد الخاص بك:</span>
              <span
                dir="ltr"
                className="px-3 py-1 rounded-xl bg-sky-500/20 border border-sky-400/50 text-sky-200 font-mono font-black text-sm"
              >
                @{myUsername}
              </span>
            </div>
            <button
              type="button"
              onClick={handleCopyMyUsername}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white flex items-center gap-1.5 border border-slate-600 transition-all cursor-pointer"
            >
              {copiedMyUsername ? (
                <>
                  <Check className="w-3.5 h-3.5 text-lime-400" />
                  <span className="text-lime-400">تم نسخ المعرف</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-sky-400" />
                  <span>نسخ المعرف لمشاركته</span>
                </>
              )}
            </button>
          </div>

          {/* Active Private Room Notice if user is currently hosting/waiting */}
          {activeRoomCode && (
            <div className="p-3 rounded-2xl bg-lime-500/15 border border-lime-400/40 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-black text-lime-200">
                <Lock className="w-4 h-4 text-lime-400 shrink-0" />
                <span>
                  غرفتك الحالية جاهزة (#{activeRoomCode}) — اضغط «دعوة للغرفة» بجانب أي صديق لإرسال دعوة فورية!
                </span>
              </div>
            </div>
          )}

          {/* Incoming Direct Room Invitations */}
          {pendingInvites.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-black text-amber-300 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>دعوات الغرف الخاصة الواردة ({pendingInvites.length}):</span>
              </div>
              {pendingInvites.map(inv => (
                <div
                  key={inv.id}
                  className="p-3.5 rounded-2xl bg-gradient-to-r from-amber-500/20 via-emerald-500/15 to-sky-500/20 border-2 border-amber-400/60 flex items-center justify-between gap-3 flex-wrap shadow-lg"
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={inv.fromAvatar}
                      alt={inv.fromDisplayName}
                      className="w-11 h-11 rounded-full object-cover border-2 border-amber-400"
                    />
                    <div>
                      <div className="text-sm font-black text-white">
                        {inv.fromDisplayName}{' '}
                        <span dir="ltr" className="text-xs font-mono text-amber-300">
                          (@{inv.fromUsername})
                        </span>
                      </div>
                      <div className="text-xs text-slate-200 font-bold">
                        يدعوك إلى «{inv.roomName}» • رمز الغرفة:{' '}
                        <span className="font-mono font-black text-sky-300">#{inv.roomCode}</span>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAcceptInvite(inv)}
                    className="px-4 py-2 rounded-xl bg-gradient-to-b from-[#d9ff43] to-[#65a30d] text-slate-950 font-black text-xs flex items-center gap-1.5 shadow-md hover:brightness-105 active:scale-95 transition-all cursor-pointer"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>قبول والانضمام فوراً</span>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add Friend by Unique Username Input */}
          <div className="p-4 rounded-2xl bg-[#051a2b] border border-sky-400/40 space-y-3">
            <label className="block text-xs sm:text-sm font-black text-white flex items-center gap-1.5">
              <UserPlus className="w-4 h-4 text-sky-400" />
              <span>إضافة صديق عبر اسم المستخدم الفريد (Username):</span>
            </label>

            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-sky-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  dir="ltr"
                  value={usernameInput}
                  onChange={e => setUsernameInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      handleAddFriend();
                    }
                  }}
                  placeholder="dana_q8, fahad_q8, sara_kwt..."
                  className="w-full h-11 pr-10 pl-3 rounded-xl bg-[#03111c] border border-sky-500/45 focus:border-sky-300 text-white font-mono text-sm focus:outline-none"
                />
              </div>
              <button
                type="button"
                onClick={() => handleAddFriend()}
                className="h-11 px-4 sm:px-5 rounded-xl bg-gradient-to-b from-[#a3e635] to-[#4d7c0f] hover:brightness-110 text-slate-950 font-black text-xs sm:text-sm flex items-center gap-1.5 shadow-lg active:scale-95 transition-all cursor-pointer shrink-0"
              >
                <UserPlus className="w-4 h-4" />
                <span>إضافة صديق</span>
              </button>
            </div>

            {/* Live Search Autocomplete Matches */}
            {searchResults.length > 0 && (
              <div className="rounded-xl bg-[#03101a] border border-sky-500/30 divide-y divide-slate-800/80 overflow-hidden">
                {searchResults.map(sr => (
                  <div
                    key={sr.username}
                    className="p-2.5 flex items-center justify-between gap-2 hover:bg-sky-500/10 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <img
                        src={sr.avatar}
                        alt={sr.displayName}
                        className="w-9 h-9 rounded-full object-cover border border-sky-400"
                      />
                      <div>
                        <div className="text-xs font-black text-white">{sr.displayName}</div>
                        <div dir="ltr" className="text-[11px] font-mono text-sky-400">
                          @{sr.username}
                        </div>
                      </div>
                    </div>
                    {sr.isFriend ? (
                      <span className="text-[11px] font-bold text-lime-400 px-2.5 py-1 rounded-lg bg-lime-400/10">
                        ✓ صديق بالفعل
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleAddFriend(sr.username)}
                        className="px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-black text-xs flex items-center gap-1 cursor-pointer"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>إضافة @{sr.username}</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Status Feedback Message */}
            {statusMsg && (
              <div
                className={`p-2.5 rounded-xl text-xs font-bold border ${
                  statusMsg.type === 'success'
                    ? 'bg-emerald-500/15 border-emerald-400/50 text-emerald-200'
                    : 'bg-rose-500/15 border-rose-400/50 text-rose-200'
                }`}
              >
                {statusMsg.text}
              </div>
            )}
          </div>

          {/* ==================== MY FRIENDS LIST ==================== */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-white flex items-center gap-1.5">
                <Users className="w-4 h-4 text-sky-400" />
                <span>قائمة أصدقائك ({friends.length})</span>
              </h3>
              <span className="text-[11px] text-slate-400 font-bold">
                تتحدث حالة الاتصال والغرف تلقائياً
              </span>
            </div>

            {friends.length === 0 ? (
              <div className="p-6 rounded-2xl bg-[#041421]/60 border border-dashed border-slate-700 text-center text-xs text-slate-400">
                لا يوجد أصدقاء مضافون بعد. أضف أصدقاءك عبر اسم المستخدم الفريد في الأعلى أو من المقترحات بالأسفل!
              </div>
            ) : (
              <div className="space-y-2.5">
                {friends.map(friend => {
                  const wasInvited = invitedUsernames[friend.username];
                  return (
                    <div
                      key={friend.username}
                      className="p-3.5 rounded-2xl bg-[#051a2b]/95 border border-sky-500/35 hover:border-sky-400/60 transition-all flex items-center justify-between gap-3 flex-wrap"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="relative shrink-0">
                          <img
                            src={friend.avatar}
                            alt={friend.displayName}
                            className="w-12 h-12 rounded-full object-cover border-2 border-sky-400"
                          />
                          <span
                            className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-[#051a2b] ${
                              friend.onlineStatus === 'ONLINE'
                                ? 'bg-lime-400'
                                : friend.onlineStatus === 'IN_ROOM'
                                ? 'bg-amber-400'
                                : friend.onlineStatus === 'IN_GAME'
                                ? 'bg-purple-400'
                                : 'bg-slate-500'
                            }`}
                          />
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-black text-white truncate">
                              {friend.displayName}
                            </span>
                            <span
                              dir="ltr"
                              className="px-2 py-0.5 rounded-md bg-slate-900 border border-slate-700 text-[11px] font-mono font-bold text-sky-300"
                            >
                              @{friend.username}
                            </span>
                            <span className="text-[11px] font-bold text-amber-300">
                              🏆 {friend.multiplayerWins} فوز
                            </span>
                          </div>
                          <div className="mt-1">{renderStatusBadge(friend)}</div>
                        </div>
                      </div>

                      {/* Friend Action Buttons: Join their Room OR Invite to Private Room */}
                      <div className="flex items-center gap-2 mr-auto">
                        {friend.onlineStatus === 'IN_ROOM' &&
                          friend.activeRoomCode &&
                          friend.activeRoomCode !== activeRoomCode &&
                          onJoinRoomCode && (
                            <button
                              type="button"
                              onClick={() => {
                                sounds.playTap();
                                onJoinRoomCode(friend.activeRoomCode!);
                                onClose();
                              }}
                              className="px-3 py-2 rounded-xl bg-gradient-to-b from-amber-300 to-amber-500 text-slate-950 font-black text-xs flex items-center gap-1.5 shadow-md hover:brightness-105 active:scale-95 transition-all cursor-pointer"
                            >
                              <Wifi className="w-3.5 h-3.5" />
                              <span>انضم لغرفته #{friend.activeRoomCode}</span>
                            </button>
                          )}

                        <button
                          type="button"
                          onClick={() => handleSendDirectInvite(friend)}
                          className={`px-3.5 py-2 rounded-xl font-black text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                            wasInvited
                              ? 'bg-emerald-500/25 border border-emerald-400 text-emerald-200'
                              : 'bg-gradient-to-b from-[#38bdf8] to-[#0284c7] hover:brightness-110 text-slate-950 shadow-md active:scale-95'
                          }`}
                        >
                          {wasInvited ? (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              <span>تم إرسال الدعوة</span>
                            </>
                          ) : (
                            <>
                              <Send className="w-3.5 h-3.5" />
                              <span>
                                {activeRoomCode
                                  ? `دعوة للغرفة #${activeRoomCode}`
                                  : 'دعوة لغرفة خاصة 🔒'}
                              </span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleRemoveFriend(friend.username, friend.displayName)}
                          className="p-2 rounded-xl bg-slate-900 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border border-slate-800 transition-colors cursor-pointer"
                          title="إزالة من الأصدقاء"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ==================== SUGGESTED PLAYERS TO ADD ==================== */}
          {suggestions.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-slate-800/80">
              <span className="text-xs font-black text-sky-300 block">
                لاعبون مقترحون في فتّشها (إضافة سريعة بالمعرف الفريد):
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {suggestions.map(sug => (
                  <div
                    key={sug.username}
                    className="p-2.5 rounded-2xl bg-[#04131f] border border-slate-800 flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img
                        src={sug.avatar}
                        alt={sug.displayName}
                        className="w-9 h-9 rounded-full object-cover border border-sky-400/60 shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-black text-white truncate">
                          {sug.displayName}
                        </div>
                        <div dir="ltr" className="text-[11px] font-mono text-sky-400 truncate">
                          @{sug.username}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAddFriend(sug.username)}
                      className="px-3 py-1.5 rounded-xl bg-sky-500/20 hover:bg-sky-500/35 border border-sky-400/50 text-sky-200 font-black text-xs flex items-center gap-1 shrink-0 transition-all cursor-pointer"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>إضافة</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
