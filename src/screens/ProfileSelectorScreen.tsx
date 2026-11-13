import React, { useState, useEffect } from 'react';
import { PlayerProfile, ScreenState } from '../types/game';
import { Check, Plus, ArrowRight, Star, RotateCcw } from 'lucide-react';
import { sounds } from '../utils/audio';

interface ProfileSelectorScreenProps {
  currentProfile: PlayerProfile | null;
  onSelectProfile: (profile: PlayerProfile) => void;
  onNavigate: (screen: ScreenState) => void;
}

export const ProfileSelectorScreen: React.FC<ProfileSelectorScreenProps> = ({
  currentProfile,
  onSelectProfile,
  onNavigate
}) => {
  const [profiles, setProfiles] = useState<PlayerProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [newProfileName, setNewProfileName] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/users');
      const data = await res.json();
      if (data.success && Array.isArray(data.users)) {
        setProfiles(data.users);
      }
    } catch (err) {
      console.error('Failed to fetch users:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleSelect = async (profile: PlayerProfile) => {
    sounds.playTap();
    try {
      const res = await fetch('/api/auth/me', {
        headers: { 'x-user-id': profile.username }
      });
      const data = await res.json();
      if (data.success && data.user) {
        onSelectProfile(data.user);
      } else {
        onSelectProfile(profile);
      }
    } catch {
      onSelectProfile(profile);
    }
    onNavigate('HOME');
  };

  const handleCreateNew = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProfileName.trim()) return;
    setErrorMsg('');

    const cleanUsername = `player_${Date.now()}`;
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: cleanUsername,
          displayName: newProfileName.trim(),
          password: '123456',
          avatar: '/assets/images/avatar_kuwaiti_boy_1794404782928.jpg'
        })
      });
      const data = await res.json();
      if (data.success && data.user) {
        sounds.playVictory();
        setProfiles(prev => [...prev, data.user]);
        setNewProfileName('');
        setShowAddModal(false);
        onSelectProfile(data.user);
        onNavigate('HOME');
      } else {
        setErrorMsg(data.error || 'تعذر إنشاء الحساب');
      }
    } catch {
      setErrorMsg('تعذر الاتصال بالخادم');
    }
  };

  const handleResetProfile = async (e: React.MouseEvent, profile: PlayerProfile) => {
    e.stopPropagation();
    sounds.playTap();
    try {
      const res = await fetch('/api/progress/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: profile.username })
      });
      const data = await res.json();
      if (data.success && data.user) {
        setProfiles(prev => prev.map(p => (p.username === profile.username ? data.user : p)));
        if (currentProfile?.username === profile.username) {
          onSelectProfile(data.user);
        }
      }
    } catch (err) {
      console.error('Reset failed:', err);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 my-6">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl backdrop-blur-md">
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => onNavigate('HOME')}
            className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
          >
            <ArrowRight className="w-4 h-4" />
            <span>رجوع</span>
          </button>
          <span className="text-xs font-bold text-amber-400 bg-amber-400/10 px-2.5 py-1 rounded-full border border-amber-400/20">
            حسابات اللاعبين وبياناتهم الفعلية المستقلة
          </span>
        </div>

        <h2 className="text-2xl font-black text-white text-center mb-1">
          من يلعب الآن؟
        </h2>
        <p className="text-xs text-slate-400 text-center mb-8">
          كل لاعب يمتلك سجلاً مستقلاً بالكامل للنجوم والمراحل المفتوحة والعملات والإحصائيات
        </p>

        {errorMsg && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-bold text-center">
            {errorMsg}
          </div>
        )}

        {loading ? (
          <div className="py-12 text-center text-xs text-slate-400 font-bold">
            جار تحميل حسابات اللاعبين من قاعدة البيانات...
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
            {profiles.map(profile => {
              const isActive = currentProfile?.username === profile.username;
              const completedCount = Object.keys(profile.completedLevels || {}).length;
              const totalStars = Object.values(profile.completedLevels || {}).reduce(
                (acc, lvl) => acc + (lvl.stars || 0),
                0
              );

              return (
                <div
                  key={profile.username}
                  onClick={() => handleSelect(profile)}
                  className={`flex flex-col justify-between p-4 rounded-2xl cursor-pointer border-2 transition-all ${
                    isActive
                      ? 'border-amber-400 bg-amber-500/10 shadow-lg shadow-amber-500/10'
                      : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <img
                        src={profile.avatar}
                        alt={profile.displayName}
                        referrerPolicy="no-referrer"
                        className="w-12 h-12 rounded-full object-cover border-2 border-slate-700"
                      />
                      <div className="text-right">
                        <div className="text-sm font-bold text-white flex items-center gap-2">
                          <span>{profile.displayName}</span>
                          {isActive && (
                            <span className="text-[10px] text-amber-400 font-bold bg-amber-400/20 px-1.5 py-0.5 rounded">
                              النشط
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5 tabular-nums">
                          <span>المستوى {profile.level}</span>
                          <span className="mx-1.5">·</span>
                          <span>{profile.xp} XP</span>
                        </div>
                      </div>
                    </div>

                    {isActive && (
                      <div className="w-6 h-6 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center shrink-0">
                        <Check className="w-4 h-4 stroke-[3]" />
                      </div>
                    )}
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1 font-bold text-amber-400 tabular-nums">
                        <Star className="w-3.5 h-3.5 fill-current" />
                        <span>{totalStars} نجمة</span>
                      </span>
                      <span className="text-slate-500">·</span>
                      <span className="text-slate-300 tabular-nums">{completedCount} مراحل</span>
                    </div>

                    {totalStars > 0 && (
                      <button
                        type="button"
                        onClick={(e) => handleResetProfile(e, profile)}
                        className="text-[11px] text-slate-400 hover:text-rose-400 flex items-center gap-1 transition-colors"
                        title="تصفير نجوم ومراحل هذا اللاعب"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>تصفير</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Add profile trigger */}
        {!showAddModal ? (
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => {
                sounds.playTap();
                setShowAddModal(true);
              }}
              className="px-5 py-2.5 rounded-xl border border-dashed border-slate-700 hover:border-amber-400 text-slate-300 hover:text-amber-300 text-xs font-bold flex items-center gap-2 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>إنشاء حساب لاعب جديد (يبدأ من 0 نجمة)</span>
            </button>
          </div>
        ) : (
          <form onSubmit={handleCreateNew} className="p-4 rounded-2xl bg-slate-950 border border-slate-800 animate-in fade-in">
            <h4 className="text-sm font-bold text-white mb-2 text-right">إضافة حساب لاعب جديد</h4>
            <div className="flex gap-2">
              <input
                type="text"
                required
                value={newProfileName}
                onChange={(e) => setNewProfileName(e.target.value)}
                placeholder="اسم اللاعب الجديد..."
                className="flex-1 px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm focus:outline-none focus:border-amber-400 text-right"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl"
              >
                إضافة
              </button>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-3 py-2 bg-slate-800 text-slate-400 text-xs rounded-xl hover:text-white"
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
