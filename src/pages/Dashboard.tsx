import React, { useEffect } from 'react';
import { CheckCircle2, BookOpen, Clock, Flame, TrendingUp, Zap, Target } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { useDataStore } from '../store/useDataStore';
import { useNavigate } from 'react-router-dom';

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { profile, flashcardsToReview, learningCount, totalCards, fetchDashboardData } = useDataStore();

  useEffect(() => {
    if (user) {
      fetchDashboardData(user.id);
    }
  }, [user, fetchDashboardData]);

  // Compute derived stats
  const masteredPct = totalCards > 0 ? Math.round(((profile?.words_mastered || 0) / totalCards) * 100) : 0;
  const studyHours = Math.floor((profile?.study_time_minutes || 0) / 60);
  const studyMins = (profile?.study_time_minutes || 0) % 60;

  return (
    <div className="flex flex-col gap-8 transition-all">
      {/* Top Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 mb-1">
            Welcome back, {user?.user_metadata?.username || user?.email?.split('@')[0] || 'Scholar'}!
          </h1>
          <p className="text-slate-500 font-medium text-lg">
            {flashcardsToReview > 0
              ? `You have ${flashcardsToReview} cards waiting for review`
              : "You're all caught up! Start learning new words."}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="bg-amber-50 text-amber-600 px-4 py-2 rounded-2xl font-bold flex items-center gap-1.5 shadow-sm border border-amber-100">
            <Flame size={18} /> {profile?.streak_days || 0} Day Streak
          </div>
          {user?.user_metadata?.avatar_url ? (
            <img
              src={user.user_metadata.avatar_url}
              alt="Profile"
              className="w-12 h-12 rounded-full border-4 border-white shadow-sm"
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center font-bold text-white text-xl shadow-sm border-2 border-white">
              {user?.email?.charAt(0).toUpperCase() || 'U'}
            </div>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-6">
        <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm flex flex-col transition-all hover:-translate-y-1 hover:shadow-md">
          <div className="flex justify-between items-center mb-4">
            <span className="text-slate-500 font-bold text-xs uppercase tracking-widest">Mastered</span>
            <CheckCircle2 size={24} className="text-emerald-500" />
          </div>
          <div className="text-4xl font-extrabold text-slate-900 leading-none">{profile?.words_mastered || 0}</div>
          <span className="text-slate-500 text-sm mt-2 font-medium">{masteredPct}% of your cards</span>
        </div>

        <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm flex flex-col transition-all hover:-translate-y-1 hover:shadow-md">
          <div className="flex justify-between items-center mb-4">
            <span className="text-slate-500 font-bold text-xs uppercase tracking-widest">Learning</span>
            <BookOpen size={24} className="text-indigo-500" />
          </div>
          <div className="text-4xl font-extrabold text-slate-900 leading-none">{learningCount}</div>
          <span className="text-slate-500 text-sm mt-2 font-medium">Active cards</span>
        </div>

        <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm flex flex-col transition-all hover:-translate-y-1 hover:shadow-md">
          <div className="flex justify-between items-center mb-4">
            <span className="text-slate-500 font-bold text-xs uppercase tracking-widest">Study Time</span>
            <Clock size={24} className="text-purple-500" />
          </div>
          <div className="text-4xl font-extrabold text-slate-900 leading-none flex items-baseline gap-1">
            {studyHours > 0 && <>{studyHours}<span className="text-xl font-medium text-slate-400">h</span></>}
            {studyMins}<span className="text-xl font-medium text-slate-400">m</span>
          </div>
          <span className="text-slate-500 text-sm mt-2 font-medium">Total practice</span>
        </div>

        <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm flex flex-col transition-all hover:-translate-y-1 hover:shadow-md">
          <div className="flex justify-between items-center mb-4">
            <span className="text-slate-500 font-bold text-xs uppercase tracking-widest">Due Today</span>
            <Zap size={24} className="text-amber-500" />
          </div>
          <div className={`text-4xl font-extrabold leading-none ${flashcardsToReview > 0 ? 'text-rose-600' : 'text-emerald-500'}`}>
            {flashcardsToReview}
          </div>
          <span className="text-slate-500 text-sm mt-2 font-medium">Cards to review</span>
        </div>
      </div>

      {/* Action Cards */}
      <div className="grid grid-cols-2 gap-6">
        {/* Spaced Repetition Card */}
        <div className="bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-3xl p-10 text-white flex flex-col justify-between shadow-md transition-all hover:-translate-y-1 hover:shadow-lg min-h-[320px]">
          <div>
            <div className="flex items-center gap-2 mb-6 opacity-90">
              <TrendingUp size={24} />
              <h3 className="text-xl font-bold tracking-tight">Spaced Repetition</h3>
            </div>
            <div className="text-7xl font-extrabold leading-none mb-4">{flashcardsToReview}</div>
            <p className="text-indigo-100 text-lg font-medium max-w-sm leading-relaxed">
              {flashcardsToReview > 0
                ? 'Flashcards are ready for review. The algorithm has optimized your schedule for maximum retention.'
                : 'All caught up! New cards will appear as your intervals expire.'}
            </p>
          </div>
          <button
            className="w-full bg-white text-indigo-700 font-bold text-lg py-4 px-6 rounded-2xl mt-6 transition-all hover:bg-indigo-50 hover:shadow-md cursor-pointer"
            onClick={() => navigate('/flashcards?mode=daily_review')}
          >
            Start Review Session
          </button>
        </div>

        {/* Quick Actions Card */}
        <div className="bg-white rounded-3xl p-10 border border-slate-200 shadow-sm flex flex-col justify-between min-h-[320px]">
          <div>
            <div className="flex items-center gap-2 mb-6">
              <Target size={24} className="text-indigo-600" />
              <h3 className="text-xl font-bold tracking-tight text-slate-900">Quick Actions</h3>
            </div>
            <div className="flex flex-col gap-4 mt-2">
              <button
                className="w-full flex items-center justify-center gap-3 bg-slate-50 border border-slate-200 text-slate-800 font-bold py-4 px-6 rounded-2xl transition-all hover:bg-white hover:border-indigo-200 hover:text-indigo-600 hover:shadow-sm cursor-pointer"
                onClick={() => navigate('/dictionary')}
              >
                <BookOpen size={20} /> Browse Dictionary
              </button>
              <button
                className="w-full flex items-center justify-center gap-3 bg-slate-50 border border-slate-200 text-slate-800 font-bold py-4 px-6 rounded-2xl transition-all hover:bg-white hover:border-indigo-200 hover:text-indigo-600 hover:shadow-sm cursor-pointer"
                onClick={() => navigate('/flashcards')}
              >
                <Zap size={20} /> Manage Flashcard Decks
              </button>
              <button
                className="w-full flex items-center justify-center gap-3 bg-slate-50 border border-slate-200 text-slate-800 font-bold py-4 px-6 rounded-2xl transition-all hover:bg-white hover:border-indigo-200 hover:text-indigo-600 hover:shadow-sm cursor-pointer"
                onClick={() => navigate('/stories')}
              >
                <TrendingUp size={20} /> Generate AI Story
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
