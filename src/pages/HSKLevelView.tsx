import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { useAuthStore } from '../store/useAuthStore';
import { ArrowLeft, BookOpen, PenTool, Layout, CheckCircle, Clock, Circle, Volume2, Plus } from 'lucide-react';

interface FlashcardViewItem {
  vocab_id: string;
  simplified: string;
  traditional: string;
  pinyin: string;
  meanings: { meaning: string }[];
  characters: { character: string; radical: string; stroke_count: number; decomposition: string }[];
}

interface UserCard {
  vocab_id: string;
  status: string;
}

export const HSKLevelView: React.FC = () => {
  const { level } = useParams<{ level: string }>();
  const { user } = useAuthStore();
  
  const [activeTab, setActiveTab] = useState<'vocab' | 'hanzi' | 'grammar'>('vocab');
  const [loading, setLoading] = useState(true);
  const [words, setWords] = useState<FlashcardViewItem[]>([]);
  const [userCards, setUserCards] = useState<UserCard[]>([]);
  const [grammarPoints, setGrammarPoints] = useState<any[]>([]);
  const [grammarLoading, setGrammarLoading] = useState(false);

  useEffect(() => {
    fetchData();
  }, [level]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch vocabulary for this HSK level
      const { data: vocabData } = await supabase
        .from('flashcard_view')
        .select('*')
        .eq('hsk_level', level)
        .order('frequency_rank', { ascending: true });
        
      if (vocabData) setWords(vocabData);

      // 2. Fetch user's flashcards to determine status
      if (user) {
        const { data: userCardData } = await supabase
          .from('user_flashcards')
          .select('vocab_id, status')
          .eq('user_id', user.id);
          
        if (userCardData) setUserCards(userCardData);
      }
    } catch (e) {
      console.error('Error fetching HSK data', e);
    } finally {
      setLoading(false);
    }
  };

  const loadGrammar = async () => {
    if (grammarPoints.length > 0 || grammarLoading) return;
    setGrammarLoading(true);
    try {
      const res = await fetch('/api/grammar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hskLevel: level })
      });
      if (res.ok) {
        const data = await res.json();
        setGrammarPoints(data.grammar_points || []);
      }
    } catch (e) {
      console.error('Error fetching grammar', e);
    } finally {
      setGrammarLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'grammar') {
      loadGrammar();
    }
  }, [activeTab]);

  // Derived state
  const masteredIds = useMemo(() => new Set(userCards.filter(c => c.status === 'mastered').map(c => c.vocab_id)), [userCards]);
  const learningIds = useMemo(() => new Set(userCards.filter(c => c.status !== 'mastered').map(c => c.vocab_id)), [userCards]);
  
  const masteredCount = words.filter(w => masteredIds.has(w.vocab_id)).length;
  const learningCount = words.filter(w => learningIds.has(w.vocab_id)).length;
  const unlearnedCount = words.length - masteredCount - learningCount;
  
  const percentMastered = words.length > 0 ? (masteredCount / words.length) * 100 : 0;
  const percentLearning = words.length > 0 ? (learningCount / words.length) * 100 : 0;

  // Extract unique characters
  const uniqueCharacters = useMemo(() => {
    const chars = new Map<string, any>();
    words.forEach(w => {
      if (w.characters) {
        w.characters.forEach(c => {
          if (c && c.character && !chars.has(c.character)) {
            chars.set(c.character, c);
          }
        });
      }
    });
    return Array.from(chars.values());
  }, [words]);

  const speakText = (text: string) => {
    if (!('speechSynthesis' in window)) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    window.speechSynthesis.speak(utterance);
  };

  const handleAddUnlearned = async () => {
    if (!user) return;
    
    // Find unlearned words
    const unlearnedWords = words.filter(w => !masteredIds.has(w.vocab_id) && !learningIds.has(w.vocab_id));
    if (unlearnedWords.length === 0) return;
    
    // We shouldn't add all at once if there are hundreds, let's limit to 20 for bulk add
    const toAdd = unlearnedWords.slice(0, 20);
    
    const newCards = toAdd.map(w => ({
      user_id: user.id,
      vocab_id: w.vocab_id,
      status: 'learning',
      interval: 0,
      repetitions: 0,
      ease_factor: 2.5
    }));
    
    const { error } = await supabase.from('user_flashcards').insert(newCards);
    if (!error) {
      fetchData(); // Refresh progress
    }
  };

  return (
    <div className="flex flex-col gap-6 animate-fade-in pb-12">
      <Link to="/hsk" className="inline-flex items-center gap-2 text-slate-500 hover:text-indigo-600 transition-colors font-medium w-fit">
        <ArrowLeft size={18} /> Back to Library
      </Link>
      
      {/* Header & Progress */}
      <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-4">
            HSK {level} <span className="px-3 py-1 bg-indigo-50 text-indigo-700 text-sm font-bold uppercase tracking-widest rounded-xl">Level {level}</span>
          </h1>
          <p className="text-slate-500 font-medium mt-2">{words.length} Vocabulary Words</p>
        </div>
        
        <div className="flex-1 max-w-md w-full">
          <div className="flex justify-between text-sm font-bold mb-2">
            <span className="text-emerald-600 flex items-center gap-1"><CheckCircle size={14} /> {masteredCount} Mastered</span>
            <span className="text-amber-500 flex items-center gap-1"><Clock size={14} /> {learningCount} Learning</span>
            <span className="text-slate-400 flex items-center gap-1"><Circle size={14} /> {unlearnedCount} New</span>
          </div>
          <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden flex">
            <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${percentMastered}%` }} />
            <div className="h-full bg-amber-400 transition-all duration-500" style={{ width: `${percentLearning}%` }} />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 p-2 bg-slate-200/50 rounded-2xl w-fit">
        <button
          onClick={() => setActiveTab('vocab')}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold transition-all ${
            activeTab === 'vocab' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <BookOpen size={18} /> Vocabulary
        </button>
        <button
          onClick={() => setActiveTab('hanzi')}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold transition-all ${
            activeTab === 'hanzi' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <PenTool size={18} /> Hanzi
        </button>
        <button
          onClick={() => setActiveTab('grammar')}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold transition-all ${
            activeTab === 'grammar' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Layout size={18} /> Grammar Points
        </button>
      </div>

      {/* Bulk Add Button for Vocab */}
      {activeTab === 'vocab' && unlearnedCount > 0 && (
        <div className="flex justify-end">
          <button 
            onClick={handleAddUnlearned}
            className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-3 rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-sm"
          >
            <Plus size={18} /> Add 20 New Words to Study Queue
          </button>
        </div>
      )}

      {/* Tab Content */}
      <div className="mt-4">
        {loading ? (
          <div className="text-center py-20 text-slate-500 font-medium">Loading contents...</div>
        ) : (
          <>
            {/* VOCABULARY TAB */}
            {activeTab === 'vocab' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {words.map((word) => {
                  const isMastered = masteredIds.has(word.vocab_id);
                  const isLearning = learningIds.has(word.vocab_id);
                  return (
                    <div key={word.vocab_id} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col gap-4 relative overflow-hidden group">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="text-3xl font-chinese font-bold text-slate-900 mb-1">{word.simplified}</div>
                          <div className="text-indigo-600 font-medium">{word.pinyin}</div>
                        </div>
                        <button 
                          onClick={() => speakText(word.simplified)}
                          className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all cursor-pointer opacity-0 group-hover:opacity-100"
                        >
                          <Volume2 size={20} />
                        </button>
                      </div>
                      <div className="text-slate-600 text-sm line-clamp-2">
                        {word.meanings?.[0]?.meaning || 'No definition available'}
                      </div>
                      
                      {/* Status Indicator */}
                      <div className="absolute top-0 right-0 w-16 h-16 pointer-events-none">
                        {isMastered && <div className="absolute top-2 right-2 w-3 h-3 bg-emerald-500 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.5)]" title="Mastered" />}
                        {isLearning && <div className="absolute top-2 right-2 w-3 h-3 bg-amber-400 rounded-full shadow-[0_0_10px_rgba(251,191,36,0.5)]" title="Learning" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* HANZI TAB */}
            {activeTab === 'hanzi' && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {uniqueCharacters.map((char, idx) => (
                  <div key={idx} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col items-center justify-center text-center hover:shadow-md hover:-translate-y-1 transition-all cursor-pointer group">
                    <div className="text-5xl font-chinese font-bold text-slate-900 mb-4">{char.character}</div>
                    <div className="flex flex-col gap-1 w-full opacity-70 group-hover:opacity-100 transition-opacity">
                      <div className="text-xs font-bold text-slate-400 uppercase tracking-widest flex justify-between">
                        <span>Radical</span>
                        <span className="text-slate-700">{char.radical || '-'}</span>
                      </div>
                      <div className="text-xs font-bold text-slate-400 uppercase tracking-widest flex justify-between">
                        <span>Strokes</span>
                        <span className="text-slate-700">{char.stroke_count || '-'}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* GRAMMAR TAB */}
            {activeTab === 'grammar' && (
              <div className="flex flex-col gap-6">
                {grammarLoading ? (
                  <div className="text-center py-20 text-slate-500 font-medium">Generating grammar points via AI...</div>
                ) : (
                  grammarPoints.map((gp, i) => (
                    <div key={i} className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm flex flex-col gap-4">
                      <h3 className="text-xl font-bold text-indigo-700">{gp.name}</h3>
                      <p className="text-slate-700 leading-relaxed font-medium">{gp.explanation}</p>
                      
                      {gp.examples && gp.examples.length > 0 && (
                        <div className="mt-4 bg-slate-50 p-6 rounded-2xl flex flex-col gap-6">
                          {gp.examples.map((ex: any, idx: number) => (
                            <div key={idx} className="flex flex-col gap-2 relative group">
                              <button 
                                onClick={() => speakText(ex.chinese)}
                                className="absolute right-0 top-0 p-2 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-xl transition-all cursor-pointer opacity-0 group-hover:opacity-100"
                              >
                                <Volume2 size={18} />
                              </button>
                              <div className="text-xl font-chinese font-bold text-slate-900 pr-10">{ex.chinese}</div>
                              <div className="text-indigo-600 font-medium">{ex.pinyin}</div>
                              <div className="text-slate-500 text-sm">{ex.english}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
