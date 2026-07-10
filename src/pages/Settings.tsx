import React, { useState } from 'react';
import { supabase } from '../services/supabase';
import { useAuthStore } from '../store/useAuthStore';
import { useDataStore } from '../store/useDataStore';
import { User, Lock, Image as ImageIcon, Target } from 'lucide-react';

const AVATARS = [
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Aneka',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Jack',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Mimi',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Oliver',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Sophie',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Zoe',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Leo',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Mia',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Lily',
  'https://api.dicebear.com/7.x/bottts/svg?seed=Robot',
  'https://api.dicebear.com/7.x/bottts/svg?seed=Tinker',
  'https://api.dicebear.com/7.x/shapes/svg?seed=Geometric',
  'https://api.dicebear.com/7.x/shapes/svg?seed=Abstract',
];

export const Settings: React.FC = () => {
  const { user, initialize } = useAuthStore();
  
  const [username, setUsername] = useState(user?.user_metadata?.username || user?.email?.split('@')[0] || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.user_metadata?.avatar_url || '');
  const [password, setPassword] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });
  
  const { profile, updateDailyGoal } = useDataStore();
  const [dailyGoal, setDailyGoal] = useState(profile?.daily_goal_minutes?.toString() || '60');

  const handleUpdateProfile = async () => {
    setLoading(true);
    setMessage({ text: '', type: '' });
    
    const { error } = await supabase.auth.updateUser({
      data: { username, avatar_url: avatarUrl }
    });
    
    if (error) {
      setMessage({ text: error.message, type: 'error' });
    } else {
      setMessage({ text: 'Profile updated successfully!', type: 'success' });
      await initialize(); // Refresh user context
    }
    setLoading(false);
  };

  const handleUpdatePassword = async () => {
    if (password.length < 6) {
      setMessage({ text: 'Password must be at least 6 characters', type: 'error' });
      return;
    }
    
    setLoading(true);
    setMessage({ text: '', type: '' });
    
    const { error } = await supabase.auth.updateUser({
      password: password
    });
    
    if (error) {
      setMessage({ text: error.message, type: 'error' });
    } else {
      setMessage({ text: 'Password updated successfully!', type: 'success' });
      setPassword('');
    }
    setLoading(false);
  };

  const handleSaveDailyGoal = async () => {
    setLoading(true);
    setMessage({ text: '', type: '' });
    try {
      const goal = parseInt(dailyGoal, 10);
      if (isNaN(goal) || goal <= 0) throw new Error("Please enter a valid number of minutes.");
      if (user) {
        await updateDailyGoal(user.id, goal);
        setMessage({ text: 'Daily study goal updated!', type: 'success' });
      }
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    }
    setLoading(false);
  };

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-8 transition-all pb-12 mt-8">
      <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 mb-2">Account Settings</h1>
      
      {message.text && (
        <div className={`p-4 rounded-2xl border font-bold text-sm shadow-sm ${message.type === 'error' ? 'bg-rose-50 text-rose-600 border-rose-200' : 'bg-emerald-50 text-emerald-600 border-emerald-200'}`}>
          {message.text}
        </div>
      )}

      {/* Profile Settings */}
      <div className="bg-white rounded-3xl p-8 md:p-10 border border-slate-200 shadow-sm flex flex-col gap-8 transition-all">
        <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 flex items-center gap-3"><User size={28} className="text-indigo-600" /> Profile Information</h2>
        
        <div>
          <label className="block mb-2 text-slate-500 font-bold text-xs uppercase tracking-widest">Username</label>
          <input 
            type="text" 
            className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-slate-900 font-medium focus:outline-none focus:ring-4 focus:ring-indigo-50 focus:border-indigo-500 transition-all" 
            value={username} 
            onChange={(e) => setUsername(e.target.value)} 
          />
        </div>

        <div>
          <label className="block mb-4 text-slate-500 font-bold text-xs uppercase tracking-widest">Avatar</label>
          <div className="flex gap-4 items-center mb-6 flex-wrap">
            {AVATARS.map((url) => (
              <img 
                key={url}
                src={url} 
                className={`w-16 h-16 rounded-full cursor-pointer transition-all hover:scale-110 hover:-translate-y-1 hover:shadow-md bg-slate-50 ${avatarUrl === url ? 'ring-4 ring-indigo-600 ring-offset-2' : 'border border-slate-200'}`}
                alt="Avatar option"
                onClick={() => setAvatarUrl(url)}
              />
            ))}
          </div>
          <div className="relative mt-2">
            <ImageIcon size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              className="w-full pl-12 pr-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-slate-900 font-medium focus:outline-none focus:ring-4 focus:ring-indigo-50 focus:border-indigo-500 transition-all" 
              placeholder="Or paste an image URL here..." 
              value={avatarUrl} 
              onChange={(e) => setAvatarUrl(e.target.value)} 
            />
          </div>
        </div>

        <button 
          className="w-full bg-indigo-600 text-white font-bold py-4 rounded-2xl shadow-sm hover:-translate-y-0.5 hover:shadow-md transition-all disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer" 
          onClick={handleUpdateProfile} 
          disabled={loading}
        >
          {loading ? 'Saving...' : 'Save Profile'}
        </button>
      </div>

      {/* Security Settings */}
      <div className="bg-white rounded-3xl p-8 md:p-10 border border-slate-200 shadow-sm flex flex-col gap-8 transition-all">
        <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 flex items-center gap-3"><Lock size={28} className="text-indigo-600" /> Security</h2>
        
        <div>
          <label className="block mb-2 text-slate-500 font-bold text-xs uppercase tracking-widest">New Password</label>
          <input 
            type="password" 
            className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-slate-900 font-medium focus:outline-none focus:ring-4 focus:ring-indigo-50 focus:border-indigo-500 transition-all" 
            placeholder="Leave blank to keep current password"
            value={password} 
            onChange={(e) => setPassword(e.target.value)} 
          />
        </div>

        <button 
          className="w-full bg-white text-slate-900 border border-slate-200 font-bold py-4 rounded-2xl shadow-sm hover:bg-slate-50 transition-all disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer" 
          onClick={handleUpdatePassword} 
          disabled={loading}
        >
          {loading ? 'Updating...' : 'Update Password'}
        </button>
      </div>

      {/* Study Preferences */}
      <div className="bg-white rounded-3xl p-8 md:p-10 border border-slate-200 shadow-sm flex flex-col gap-8 transition-all">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 flex items-center gap-3 mb-3"><Target size={28} className="text-indigo-600" /> Study Preferences</h2>
          <p className="text-slate-500 font-medium leading-relaxed">
            Set your daily study goal. We'll track your time and help you stay on target!
          </p>
        </div>
        
        <div>
          <label className="block mb-2 text-slate-500 font-bold text-xs uppercase tracking-widest">Daily Goal (Minutes)</label>
          <input 
            type="number" 
            className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-slate-900 font-medium focus:outline-none focus:ring-4 focus:ring-indigo-50 focus:border-indigo-500 transition-all" 
            placeholder="60"
            value={dailyGoal} 
            onChange={(e) => setDailyGoal(e.target.value)} 
            min="1"
            max="1440"
          />
        </div>

        <button 
          className="w-full bg-white text-slate-900 border border-slate-200 font-bold py-4 rounded-2xl shadow-sm hover:bg-slate-50 transition-all cursor-pointer disabled:opacity-70" 
          onClick={handleSaveDailyGoal}
          disabled={loading}
        >
          {loading ? 'Saving...' : 'Save Preferences'}
        </button>
      </div>
    </div>
  );
};
