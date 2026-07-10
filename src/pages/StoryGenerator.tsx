import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { useAuthStore } from '../store/useAuthStore';
import { useDataStore } from '../store/useDataStore';
import { BookOpen, Loader2, Volume2, Type, Languages, RefreshCw } from 'lucide-react';

interface StoryWord {
  zh: string;
  py: string;
  en: string;
}

interface Story {
  title: string;
  words: StoryWord[];
  english_translation: string;
  generated_at: string;
}

export const StoryGenerator: React.FC = () => {
  const { user } = useAuthStore();

  const [story, setStory] = useState<Story | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  useEffect(() => {
    if (user) {
      useDataStore.getState().startStudySession(user.id);
    }
    return () => useDataStore.getState().stopStudySession();
  }, [user]);
  
  // Reading Aids
  const [showPinyin, setShowPinyin] = useState(true);
  const [showEnglish, setShowEnglish] = useState(false);
  const [selectedWord, setSelectedWord] = useState<StoryWord | null>(null);

  useEffect(() => {
    checkAndLoadStory();
  }, []);

  const checkAndLoadStory = async () => {
    setLoading(true);
    setError('');
    try {
      const cachedStory = localStorage.getItem('lingua_daily_story');
      if (cachedStory) {
        const parsed: Story = JSON.parse(cachedStory);
        const ageInDays = (Date.now() - new Date(parsed.generated_at).getTime()) / (1000 * 60 * 60 * 24);
        
        if (ageInDays < 3) {
          setStory(parsed);
          setLoading(false);
          return;
        }
      }

      await generateNewStory();
    } catch (e) {
      console.error(e);
      setError("Failed to load your reading material.");
      setLoading(false);
    }
  };

  const generateNewStory = async () => {
    if (!user) return;
    try {
      // 1. Fetch Known Words
      const { data: userCards } = await supabase.from('user_flashcards').select('vocab_id').eq('user_id', user.id);
      const knownIds = userCards ? userCards.map(c => c.vocab_id) : [];
      let knownWords: any[] = [];
      
      if (knownIds.length > 0) {
        const { data: knownData } = await supabase.from('flashcard_view').select('simplified, pinyin').in('vocab_id', knownIds).limit(50);
        if (knownData) knownWords = knownData;
      }

      // 2. Fetch Target Words
      const { data: pool } = await supabase.from('flashcard_view').select('vocab_id, simplified, pinyin, meanings').order('frequency_rank', { ascending: true }).limit(50);
      const targetWords = pool ? pool.filter(w => !knownIds.includes(w.vocab_id)).slice(0, 5) : [];

      const knownList = knownWords.map(w => w.simplified);
      const targetList = targetWords.map(w => `${w.simplified} (${w.pinyin})`);

      const res = await fetch('/api/story', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetWords: targetList, knownWords: knownList })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to generate story');
      }

      const parsed = await res.json();
      const newStory: Story = {
        ...parsed,
        generated_at: new Date().toISOString()
      };

      localStorage.setItem('lingua_daily_story', JSON.stringify(newStory));
      setStory(newStory);
    } catch (e) {
      console.error(e);
      setError("We encountered an issue preparing your story. Please try again later.");
    } finally {
      setLoading(false);
    }
  };

  const playAudio = (text: string) => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'zh-CN';
      utterance.rate = 0.85;
      window.speechSynthesis.speak(utterance);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto flex flex-col gap-8 transition-all pb-12 mt-12">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 flex items-center gap-3"><BookOpen className="text-indigo-600" size={32} /> Reading Practice</h1>
        </div>
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col items-center justify-center min-h-[400px] text-indigo-600">
          <Loader2 size={64} className="animate-spin mb-6" strokeWidth={1.5} />
          <h3 className="text-2xl font-extrabold tracking-tight text-slate-900">Curating your personalized reading...</h3>
          <p className="text-slate-500 font-medium text-lg mt-3">Integrating your recent vocabulary</p>
        </div>
      </div>
    );
  }

  if (!story) {
    return (
      <div className="max-w-4xl mx-auto flex flex-col gap-8 transition-all pb-12 mt-12">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 flex items-center gap-3"><BookOpen className="text-indigo-600" size={32} /> Reading Practice</h1>
        </div>
        <div className="bg-slate-50 rounded-3xl border border-slate-200 shadow-sm flex items-start gap-6 p-8">
          <div className="flex-1">
            <h3 className="font-extrabold text-xl text-slate-900 tracking-tight">Could Not Load Story</h3>
            <p className="text-slate-600 font-medium text-lg mt-2 leading-relaxed">
              We encountered an issue generating your personalized reading material. Please try again later.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-8 transition-all pb-12">
      
      <div className="flex justify-between items-center bg-white p-6 md:p-8 rounded-3xl border border-slate-200 shadow-sm mt-8 flex-wrap gap-6">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 flex items-center gap-3"><BookOpen className="text-indigo-600" size={32} /> Reading Practice</h1>
          <p className="text-slate-500 font-medium text-lg mt-2">Contextual reading tailored to your vocabulary level.</p>
        </div>
        
        {/* Reading Aids Toolbar */}
        <div className="flex gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-200">
          <button 
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold transition-all cursor-pointer ${showPinyin ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'}`}
            onClick={() => setShowPinyin(!showPinyin)}
          >
            <Type size={18} /> Pinyin
          </button>
          <button 
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold transition-all cursor-pointer ${showEnglish ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'}`}
            onClick={() => setShowEnglish(!showEnglish)}
          >
            <Languages size={18} /> Translation
          </button>
          <button 
            className="p-3 bg-white text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-100 hover:text-indigo-600 transition-all cursor-pointer"
            onClick={() => checkAndLoadStory()}
            title="Force refresh story"
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-6 bg-rose-50 text-rose-600 rounded-2xl border border-rose-200 font-bold shadow-sm">
          {error}
        </div>
      )}

      {story && (
        <div className="grid gap-8 lg:grid-cols-3">
          
          {/* Main Story Content */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col gap-8 p-8 md:p-12 lg:col-span-2 transition-all">
            <div className="flex justify-between items-start border-b border-slate-100 pb-6">
              <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">{story.title}</h2>
              <button 
                onClick={() => playAudio(story.words.map(w => w.zh).join(''))}
                className="text-indigo-600 bg-indigo-50 hover:bg-indigo-100 p-3 rounded-full transition-colors cursor-pointer"
              >
                <Volume2 size={24} />
              </button>
            </div>

            <div 
              className={`font-chinese text-3xl md:text-4xl text-slate-900 leading-loose ${showPinyin ? 'leading-[3.5]' : ''}`}
            >
              {story.words.map((w, i) => (
                <span 
                  key={i} 
                  className={`inline-block cursor-pointer px-1 mx-0.5 rounded-lg transition-colors ${selectedWord === w ? 'bg-indigo-100 text-indigo-700' : 'hover:bg-slate-50'}`}
                  onClick={() => w.en ? setSelectedWord(w) : setSelectedWord(null)}
                >
                  <ruby>
                    {w.zh}
                    {showPinyin && w.py && <rt className="text-sm text-indigo-500 font-medium tracking-wide select-none transform -translate-y-1">{w.py}</rt>}
                  </ruby>
                </span>
              ))}
            </div>

            {showEnglish && (
              <div className="mt-8 pt-8 border-t border-slate-100 animate-in fade-in duration-300">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Translation</h4>
                <p className="text-slate-600 text-xl font-medium leading-relaxed">{story.english_translation}</p>
              </div>
            )}
          </div>

          {/* Interactive Dictionary Panel */}
          <div className="flex flex-col gap-6">
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 sticky top-8 transition-all">
              <h3 className="font-bold text-slate-400 text-xs uppercase tracking-widest mb-6 border-b border-slate-100 pb-4">Word Details</h3>
              
              {selectedWord ? (
                <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-chinese font-extrabold text-indigo-600 text-6xl leading-none">{selectedWord.zh}</div>
                      <div className="text-slate-700 font-bold text-2xl mt-4 tracking-wide">{selectedWord.py}</div>
                    </div>
                    <button onClick={() => playAudio(selectedWord.zh)} className="text-indigo-400 hover:text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition-colors p-4 rounded-full cursor-pointer flex-shrink-0 ml-4"><Volume2 size={28} /></button>
                  </div>
                  
                  <div className="bg-slate-50 p-6 rounded-2xl mt-4 border border-slate-100">
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Meaning</div>
                    <div className="text-slate-900 font-medium text-xl leading-relaxed">{selectedWord.en}</div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-20 text-slate-400">
                  <BookOpen size={48} className="mx-auto mb-6 opacity-20" strokeWidth={1} />
                  <p className="text-lg font-medium leading-relaxed px-4">Click any word in the story to view its meaning and pronunciation.</p>
                </div>
              )}
            </div>
          </div>

        </div>
      )}
    </div>
  );
};
