import { create } from 'zustand';
import { supabase } from '../services/supabase';

interface UserProfile {
  id: string;
  streak_days: number;
  words_mastered: number;
  study_time_minutes: number;
  daily_goal_minutes: number;
  created_at: string;
}

interface DataState {
  profile: UserProfile | null;
  flashcardsToReview: number;
  learningCount: number;
  totalCards: number;
  loading: boolean;
  error: string | null;
  fetchDashboardData: (userId: string) => Promise<void>;
  updateStudyTime: (userId: string, minutesAdded: number) => Promise<void>;
  updateDailyGoal: (userId: string, newGoal: number) => Promise<void>;
  
  // Timer State
  isStudying: boolean;
  studyIntervalId: any | null;
  startStudySession: (userId: string) => void;
  stopStudySession: () => void;
}

export const useDataStore = create<DataState>((set, get) => ({
  profile: null,
  flashcardsToReview: 0,
  learningCount: 0,
  totalCards: 0,
  loading: false,
  error: null,
  isStudying: false,
  studyIntervalId: null,
  
  fetchDashboardData: async (userId: string) => {
    set({ loading: true, error: null });
    try {
      // 1. Fetch user profile
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
        
      if (profileError) throw profileError;

      // 2. Fetch count of flashcards ready for review (next_review_date <= now)
      const { count: dueCount, error: countError } = await supabase
        .from('user_flashcards')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .lte('next_review_date', new Date().toISOString());

      if (countError) throw countError;

      // 3. Fetch learning count (cards in learning/reviewing status)
      const { count: learningCount } = await supabase
        .from('user_flashcards')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .in('status', ['learning', 'reviewing', 'new']);

      // 4. Fetch total cards
      const { count: totalCards } = await supabase
        .from('user_flashcards')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      set({ 
        profile: profileData, 
        flashcardsToReview: dueCount || 0,
        learningCount: learningCount || 0,
        totalCards: totalCards || 0,
        loading: false 
      });
      
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },

  updateStudyTime: async (userId: string, minutesAdded: number) => {
    const { profile } = get();
    if (!profile) return;
    
    const newTotal = profile.study_time_minutes + minutesAdded;
    
    const { error } = await supabase
      .from('profiles')
      .update({ study_time_minutes: newTotal })
      .eq('id', userId);
      
    if (!error) {
      set({ profile: { ...profile, study_time_minutes: newTotal } });
    }
  },

  updateDailyGoal: async (userId: string, newGoal: number) => {
    const { profile } = get();
    if (!profile) return;
    
    const { error } = await supabase
      .from('profiles')
      .update({ daily_goal_minutes: newGoal })
      .eq('id', userId);
      
    if (!error) {
      set({ profile: { ...profile, daily_goal_minutes: newGoal } });
    } else {
      throw error;
    }
  },

  startStudySession: (userId: string) => {
    const { isStudying, studyIntervalId, updateStudyTime } = get();
    if (isStudying) return;

    if (studyIntervalId) clearInterval(studyIntervalId);

    // Update study time every 60 seconds automatically
    const id = setInterval(() => {
      updateStudyTime(userId, 1);
    }, 60000);

    set({ isStudying: true, studyIntervalId: id });
  },

  stopStudySession: () => {
    const { studyIntervalId } = get();
    if (studyIntervalId) {
      clearInterval(studyIntervalId);
    }
    set({ isStudying: false, studyIntervalId: null });
  }
}));
