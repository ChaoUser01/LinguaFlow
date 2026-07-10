import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { useAuthStore } from '../store/useAuthStore';
import { BookOpen, Key, Loader2, Volume2, Type, Languages, RefreshCw } from 'lucide-react';
import Groq from 'groq-sdk';

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
  
  const [apiKey, setApiKey] = useState('');
  const [story, setStory] = useState<Story | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Reading Aids
  const [showPinyin, setShowPinyin] = useState(true);
  const [showEnglish, setShowEnglish] = useState(false);
  const [selectedWord, setSelectedWord] = useState<StoryWord | null>(null);

  useEffect(() => {
    const savedKey = localStorage.getItem('lingua_groq_key');
    if (savedKey) setApiKey(savedKey);
    checkAndLoadStory(savedKey);
  }, []);

  const checkAndLoadStory = async (key: string | null) => {
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

      // Need new story
      if (key) {
        await generateNewStory(key);
      } else {
        setLoading(false); // Can't generate without key
      }
    } catch (e) {
      console.error(e);
      setError("Failed to load your reading material.");
      setLoading(false);
    }
  };

  const generateNewStory = async (key: string) => {
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

      const knownList = knownWords.map(w => w.simplified).join(', ');
      const targetList = targetWords.map(w => `${w.simplified} (${w.pinyin})`).join(', ');

      const groq = new Groq({ apiKey: key, dangerouslyAllowBrowser: true });
      
      const prompt = `You are an expert Chinese language teacher creating Comprehensible Input material.
Write a short, engaging story in Simplified Chinese (about 150-200 characters).

Constraints:
1. Use these specific new target words organically: [${targetList}].
2. Also try to use these known words: [${knownList}]. If empty, use basic HSK 1/2 words.
3. Segment EVERY SINGLE word or punctuation mark in the story into an array of objects. Do not group entire sentences. Each object should represent a single word or punctuation mark.

Return ONLY a valid JSON object in this exact format:
{
  "title": "Story Title in English",
  "words": [
    { "zh": "我", "py": "wǒ", "en": "I" },
    { "zh": "喜欢", "py": "xǐhuan", "en": "like" },
    { "zh": "喝", "py": "hē", "en": "drink" },
    { "zh": "水", "py": "shuǐ", "en": "water" },
    { "zh": "。", "py": "", "en": "" }
  ],
  "english_translation": "I like to drink water."
}`;

      const completion = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
      });

      let content = completion.choices[0]?.message?.content || '';
      if (content.startsWith('```json')) content = content.replace('```json', '').replace('```', '');
      else if (content.startsWith('```')) content = content.replace('```', '');
      
      const parsed = JSON.parse(content.trim());
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
      <div className="flex-col gap-6 animate-fade-in" style={{ maxWidth: '800px', margin: '0 auto' }}>
        <div className="flex justify-between items-center mb-4">
          <h1 className="h2 flex items-center gap-2"><BookOpen className="text-brand" /> Reading Practice</h1>
        </div>
        <div className="card flex-col items-center justify-center min-h-[400px] text-brand">
          <Loader2 size={48} className="animate-spin mb-4" />
          <h3 className="text-lg font-bold">Curating your personalized reading...</h3>
          <p className="text-secondary mt-2">Integrating your recent vocabulary</p>
        </div>
      </div>
    );
  }

  if (!apiKey && !story) {
    return (
      <div className="flex-col gap-6 animate-fade-in" style={{ maxWidth: '800px', margin: '0 auto' }}>
        <div className="flex justify-between items-center mb-4">
          <h1 className="h2 flex items-center gap-2"><BookOpen className="text-brand" /> Reading Practice</h1>
        </div>
        <div className="card flex items-start gap-4" style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
          <Key size={24} className="text-brand mt-1" />
          <div className="flex-1">
            <h3 className="font-bold text-lg text-slate-800">Unlock Personalized Reading</h3>
            <p className="text-slate-600 mt-1">
              To automatically receive new, level-appropriate reading materials every few days, please configure your API Key in the Settings.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-col gap-6 animate-fade-in" style={{ maxWidth: '800px', margin: '0 auto' }}>
      
      <div className="flex justify-between items-center">
        <div>
          <h1 className="h2 flex items-center gap-2"><BookOpen className="text-brand" /> Reading Practice</h1>
          <p className="text-secondary mt-1">Contextual reading tailored to your vocabulary level.</p>
        </div>
        
        {/* Reading Aids Toolbar */}
        <div className="flex gap-2 bg-white p-2 rounded-lg border border-slate-200 shadow-sm">
          <button 
            className={`btn ${showPinyin ? 'btn-dark' : 'btn-secondary'} flex items-center gap-2`}
            onClick={() => setShowPinyin(!showPinyin)}
            style={{ padding: '8px 16px', fontSize: '13px' }}
          >
            <Type size={16} /> Pinyin
          </button>
          <button 
            className={`btn ${showEnglish ? 'btn-dark' : 'btn-secondary'} flex items-center gap-2`}
            onClick={() => setShowEnglish(!showEnglish)}
            style={{ padding: '8px 16px', fontSize: '13px' }}
          >
            <Languages size={16} /> Translation
          </button>
          <button 
            className="btn btn-secondary"
            onClick={() => checkAndLoadStory(apiKey)}
            title="Force refresh story"
            style={{ padding: '8px' }}
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: '16px', backgroundColor: '#FEE2E2', color: '#DC2626', borderRadius: '8px', fontWeight: 'bold' }}>
          {error}
        </div>
      )}

      {story && (
        <div className="grid gap-6" style={{ gridTemplateColumns: '2fr 1fr' }}>
          
          {/* Main Story Content */}
          <div className="card flex-col gap-6" style={{ padding: '40px' }}>
            <div className="flex justify-between items-start border-b border-slate-100 pb-4">
              <h2 className="text-2xl font-bold text-slate-800">{story.title}</h2>
              <button 
                onClick={() => playAudio(story.words.map(w => w.zh).join(''))}
                className="text-brand hover-scale p-2 rounded-full hover:bg-slate-50"
              >
                <Volume2 size={24} />
              </button>
            </div>

            <div 
              className="chinese-text" 
              style={{ fontSize: '24px', lineHeight: showPinyin ? '2.5' : '1.8', color: '#0F172A' }}
            >
              {story.words.map((w, i) => (
                <span 
                  key={i} 
                  className={`inline-block cursor-pointer hover:bg-indigo-50 rounded transition-colors ${selectedWord === w ? 'bg-indigo-100 text-brand' : ''}`}
                  onClick={() => w.en ? setSelectedWord(w) : setSelectedWord(null)}
                  style={{ margin: '0 2px', padding: '0 2px' }}
                >
                  <ruby>
                    {w.zh}
                    {showPinyin && w.py && <rt style={{ fontSize: '12px', color: '#6366F1', fontWeight: 'normal', userSelect: 'none' }}>{w.py}</rt>}
                  </ruby>
                </span>
              ))}
            </div>

            {showEnglish && (
              <div className="mt-8 pt-6 border-t border-slate-100 animate-fade-in">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Translation</h4>
                <p className="text-slate-600 text-lg leading-relaxed">{story.english_translation}</p>
              </div>
            )}
          </div>

          {/* Interactive Dictionary Panel */}
          <div className="flex-col gap-4">
            <div className="card sticky top-6">
              <h3 className="h3 font-bold text-secondary text-sm uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">Word Details</h3>
              
              {selectedWord ? (
                <div className="flex-col gap-4 animate-fade-in">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="chinese-text font-bold text-brand" style={{ fontSize: '48px', lineHeight: 1 }}>{selectedWord.zh}</div>
                      <div className="text-slate-600 font-medium text-lg mt-2">{selectedWord.py}</div>
                    </div>
                    <button onClick={() => playAudio(selectedWord.zh)} className="text-slate-400 hover:text-brand transition-colors p-2"><Volume2 size={20} /></button>
                  </div>
                  
                  <div className="bg-slate-50 p-4 rounded-lg mt-2 border border-slate-100">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">Meaning</span>
                    <span className="text-slate-800 font-medium">{selectedWord.en}</span>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-slate-400">
                  <BookOpen size={32} className="mx-auto mb-3 opacity-20" />
                  <p className="text-sm">Click any word in the story to view its meaning and pronunciation.</p>
                </div>
              )}
            </div>
          </div>

        </div>
      )}
    </div>
  );
};
