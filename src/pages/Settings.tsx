import React, { useState } from 'react';
import { supabase } from '../services/supabase';
import { useAuthStore } from '../store/useAuthStore';
import { User, Lock, Image as ImageIcon, Key } from 'lucide-react';

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
  
  const [groqKey, setGroqKey] = useState(localStorage.getItem('lingua_groq_key') || '');

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

  const handleSaveAPIKey = () => {
    localStorage.setItem('lingua_groq_key', groqKey.trim());
    setMessage({ text: 'API Key saved locally for AI generation!', type: 'success' });
  };

  return (
    <div className="flex-col gap-6 animate-fade-in" style={{ maxWidth: '600px' }}>
      <h1 className="h2 mb-4">Account Settings</h1>
      
      {message.text && (
        <div style={{ 
          padding: '16px', 
          borderRadius: '8px', 
          backgroundColor: message.type === 'error' ? '#FEE2E2' : '#D1FAE5',
          color: message.type === 'error' ? '#DC2626' : '#059669',
          fontWeight: '500'
        }}>
          {message.text}
        </div>
      )}

      {/* Profile Settings */}
      <div className="card flex-col gap-6" style={{ animationDelay: '0.1s' }}>
        <h2 className="h3 flex items-center gap-2"><User size={20} /> Profile Information</h2>
        
        <div>
          <label className="text-secondary font-medium" style={{ display: 'block', marginBottom: '8px' }}>Username</label>
          <input 
            type="text" 
            className="input" 
            value={username} 
            onChange={(e) => setUsername(e.target.value)} 
          />
        </div>

        <div>
          <label className="text-secondary font-medium" style={{ display: 'block', marginBottom: '8px' }}>Avatar</label>
          <div className="flex gap-4 items-center mb-4 flex-wrap">
            {AVATARS.map((url) => (
              <img 
                key={url}
                src={url} 
                className="hover-scale"
                alt="Avatar option"
                onClick={() => setAvatarUrl(url)}
                style={{ 
                  width: '60px', height: '60px', borderRadius: '50%', cursor: 'pointer',
                  border: avatarUrl === url ? '4px solid #6366f1' : '4px solid transparent',
                  backgroundColor: '#F8FAFC'
                }}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <ImageIcon size={18} className="text-secondary" />
            <input 
              type="text" 
              className="input" 
              placeholder="Or paste an image URL here..." 
              value={avatarUrl} 
              onChange={(e) => setAvatarUrl(e.target.value)} 
            />
          </div>
        </div>

        <button className="btn btn-dark w-full" onClick={handleUpdateProfile} disabled={loading}>
          {loading ? 'Saving...' : 'Save Profile'}
        </button>
      </div>

      {/* Security Settings */}
      <div className="card flex-col gap-6">
        <h2 className="h3 flex items-center gap-2"><Lock size={20} /> Security</h2>
        
        <div>
          <label className="text-secondary font-medium" style={{ display: 'block', marginBottom: '8px' }}>New Password</label>
          <input 
            type="password" 
            className="input" 
            placeholder="Leave blank to keep current password"
            value={password} 
            onChange={(e) => setPassword(e.target.value)} 
          />
        </div>

        <button className="btn w-full" style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', color: '#0F172A', fontWeight: 'bold' }} onClick={handleUpdatePassword} disabled={loading}>
          {loading ? 'Updating...' : 'Update Password'}
        </button>
      </div>

      {/* API Key Settings */}
      <div className="card flex-col gap-6">
        <h2 className="h3 flex items-center gap-2"><Key size={20} /> AI Features (BYOK)</h2>
        <p className="text-secondary text-sm">
          LinguaFlow uses a "Bring Your Own Key" architecture to power crowdsourced AI generations without expensive server costs.
        </p>
        
        <div>
          <label className="text-secondary font-medium" style={{ display: 'block', marginBottom: '8px' }}>Groq API Key (Llama-3)</label>
          <input 
            type="password" 
            className="input" 
            placeholder="gsk_..."
            value={groqKey} 
            onChange={(e) => setGroqKey(e.target.value)} 
          />
        </div>

        <button className="btn w-full" style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', color: '#0F172A', fontWeight: 'bold' }} onClick={handleSaveAPIKey}>
          Save API Key to LocalStorage
        </button>
      </div>
    </div>
  );
};
