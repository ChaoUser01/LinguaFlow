import React, { useEffect, useMemo } from 'react';
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
    <div className="flex-col gap-6 animate-fade-in">
      {/* Top Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="h1" style={{ marginBottom: '4px', fontSize: '28px' }}>
            Welcome back, {user?.user_metadata?.username || user?.email?.split('@')[0] || 'Scholar'}!
          </h1>
          <p className="text-secondary" style={{ fontSize: '15px' }}>
            {flashcardsToReview > 0
              ? `You have ${flashcardsToReview} cards waiting for review`
              : "You're all caught up! Start learning new words."}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="badge-orange flex items-center gap-1" style={{ padding: '8px 14px', fontSize: '14px', fontWeight: 600 }}>
            <Flame size={16} /> {profile?.streak_days || 0} Day Streak
          </div>
          {user?.user_metadata?.avatar_url ? (
            <img
              src={user.user_metadata.avatar_url}
              alt="Profile"
              style={{ width: '44px', height: '44px', borderRadius: '50%', border: '3px solid #E2E8F0' }}
            />
          ) : (
            <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'linear-gradient(135deg, #6366F1, #8B5CF6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: 'white', fontSize: '18px' }}>
              {user?.email?.charAt(0).toUpperCase() || 'U'}
            </div>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px' }}>
        <div className="card flex-col" style={{ padding: '24px' }}>
          <div className="flex justify-between items-center" style={{ marginBottom: '12px' }}>
            <span className="text-secondary font-medium" style={{ fontSize: '13px' }}>Mastered</span>
            <CheckCircle2 size={22} style={{ color: '#059669' }} />
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: '#0F172A', lineHeight: 1 }}>{profile?.words_mastered || 0}</div>
          <span className="text-secondary" style={{ fontSize: '12px', marginTop: '6px' }}>{masteredPct}% of your cards</span>
        </div>

        <div className="card flex-col" style={{ padding: '24px' }}>
          <div className="flex justify-between items-center" style={{ marginBottom: '12px' }}>
            <span className="text-secondary font-medium" style={{ fontSize: '13px' }}>Learning</span>
            <BookOpen size={22} style={{ color: '#6366F1' }} />
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: '#0F172A', lineHeight: 1 }}>{learningCount}</div>
          <span className="text-secondary" style={{ fontSize: '12px', marginTop: '6px' }}>Active cards</span>
        </div>

        <div className="card flex-col" style={{ padding: '24px' }}>
          <div className="flex justify-between items-center" style={{ marginBottom: '12px' }}>
            <span className="text-secondary font-medium" style={{ fontSize: '13px' }}>Study Time</span>
            <Clock size={22} style={{ color: '#8B5CF6' }} />
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: '#0F172A', lineHeight: 1 }}>
            {studyHours > 0 ? `${studyHours}h` : ''}{studyMins}<span style={{ fontSize: '16px', fontWeight: 500, color: '#64748B' }}>m</span>
          </div>
          <span className="text-secondary" style={{ fontSize: '12px', marginTop: '6px' }}>Total practice</span>
        </div>

        <div className="card flex-col" style={{ padding: '24px' }}>
          <div className="flex justify-between items-center" style={{ marginBottom: '12px' }}>
            <span className="text-secondary font-medium" style={{ fontSize: '13px' }}>Due Today</span>
            <Zap size={22} style={{ color: '#F59E0B' }} />
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: flashcardsToReview > 0 ? '#DC2626' : '#059669', lineHeight: 1 }}>{flashcardsToReview}</div>
          <span className="text-secondary" style={{ fontSize: '12px', marginTop: '6px' }}>Cards to review</span>
        </div>
      </div>

      {/* Action Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        {/* Spaced Repetition Card */}
        <div className="purple-card justify-between" style={{ minHeight: '280px' }}>
          <div>
            <div className="flex items-center gap-2 mb-4" style={{ opacity: 0.9 }}>
              <TrendingUp size={20} />
              <h3 style={{ fontSize: '18px', fontWeight: 600 }}>Spaced Repetition</h3>
            </div>
            <div style={{ fontSize: '72px', fontWeight: 800, lineHeight: 1, marginBottom: '8px' }}>{flashcardsToReview}</div>
            <p style={{ fontSize: '15px', opacity: 0.85, lineHeight: 1.5 }}>
              {flashcardsToReview > 0
                ? 'Flashcards are ready for review. The algorithm has optimized your schedule for maximum retention.'
                : 'All caught up! New cards will appear as your intervals expire.'}
            </p>
          </div>
          <button
            className="btn w-full"
            style={{ padding: '16px', fontSize: '15px', borderRadius: '12px', backgroundColor: 'white', color: '#6366F1', fontWeight: 700, marginTop: '16px' }}
            onClick={() => navigate('/flashcards?mode=daily_review')}
          >
            Start Review Session
          </button>
        </div>

        {/* Quick Actions Card */}
        <div className="card flex-col justify-between" style={{ minHeight: '280px', padding: '28px' }}>
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Target size={20} className="text-brand" />
              <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#0F172A' }}>Quick Actions</h3>
            </div>
            <div className="flex-col gap-3" style={{ marginTop: '8px' }}>
              <button
                className="btn w-full flex items-center justify-center gap-2"
                style={{ padding: '14px', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', color: '#0F172A', fontWeight: 600, borderRadius: '10px' }}
                onClick={() => navigate('/dictionary')}
              >
                <BookOpen size={18} /> Browse Dictionary
              </button>
              <button
                className="btn w-full flex items-center justify-center gap-2"
                style={{ padding: '14px', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', color: '#0F172A', fontWeight: 600, borderRadius: '10px' }}
                onClick={() => navigate('/flashcards')}
              >
                <Zap size={18} /> Manage Flashcard Decks
              </button>
              <button
                className="btn w-full flex items-center justify-center gap-2"
                style={{ padding: '14px', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', color: '#0F172A', fontWeight: 600, borderRadius: '10px' }}
                onClick={() => navigate('/stories')}
              >
                <TrendingUp size={18} /> Generate AI Story
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
