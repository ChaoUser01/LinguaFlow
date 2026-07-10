import React, { useState } from 'react';
import { supabase } from '../services/supabase';
import { Mail, Lock } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';

export const Auth: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const { session } = useAuthStore();

  if (session) {
    return <Navigate to="/" replace />;
  }

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setSuccess('Registration successful! Please check your email to verify your account.');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during authentication.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-screen bg-slate-50 items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-10 border border-slate-200 shadow-sm w-full max-w-md flex flex-col gap-8 transition-all hover:shadow-md">
        <div className="flex flex-col items-center gap-3">
          <div className="w-14 h-14 bg-indigo-600 text-white rounded-2xl flex items-center justify-center font-chinese text-3xl font-bold shadow-sm">
            汉
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 mt-2">LinguaFlow</h1>
          <p className="text-slate-500 font-medium">{isLogin ? 'Sign in to continue your journey' : 'Create an account to start learning'}</p>
        </div>

        {error && <div className="p-4 bg-rose-50 text-rose-600 rounded-2xl border border-rose-200 font-bold text-sm shadow-sm">{error}</div>}
        {success && <div className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl border border-emerald-200 font-bold text-sm shadow-sm">{success}</div>}

        <form onSubmit={handleAuth} className="flex flex-col gap-5">
          <div>
            <label className="block mb-2 text-slate-500 font-bold text-xs uppercase tracking-widest">Email Address</label>
            <div className="relative">
              <Mail size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="email" 
                required 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="scholar@example.com"
                className="w-full pl-12 pr-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-slate-900 font-medium focus:outline-none focus:ring-4 focus:ring-indigo-50 focus:border-indigo-500 transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block mb-2 text-slate-500 font-bold text-xs uppercase tracking-widest">Password</label>
            <div className="relative">
              <Lock size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="password" 
                required 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-12 pr-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-slate-900 font-medium focus:outline-none focus:ring-4 focus:ring-indigo-50 focus:border-indigo-500 transition-all"
              />
            </div>
          </div>

          <button 
            type="submit" 
            className="w-full bg-indigo-600 text-white font-bold py-4 rounded-2xl shadow-sm mt-4 hover:-translate-y-0.5 hover:shadow-md transition-all disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer" 
            disabled={loading}
          >
            {loading ? 'Processing...' : (isLogin ? 'Sign In' : 'Create Account')}
          </button>
        </form>

        <div className="text-center text-sm font-medium">
          <span className="text-slate-500">{isLogin ? "Don't have an account? " : "Already have an account? "}</span>
          <button 
            type="button" 
            onClick={() => setIsLogin(!isLogin)}
            className="text-indigo-600 font-bold hover:text-indigo-700 transition-colors ml-1 cursor-pointer bg-transparent border-none"
          >
            {isLogin ? 'Sign up' : 'Sign in'}
          </button>
        </div>
      </div>
    </div>
  );
};
