import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { useAuthStore } from '../store/useAuthStore';
import { useDataStore } from '../store/useDataStore';
import { useDeckStore } from '../store/useDeckStore';
import type { Deck } from '../store/useDeckStore';

import { calculateFSRS } from '../utils/fsrs';
import { CardSelector } from '../utils/cardSelector';
import { getExtraDetails } from '../services/aiGenerator';
import { Trash2, Plus, Clock, Play, BrainCircuit, Infinity as InfinityIcon, Volume2, Bookmark, Heart, BookOpen } from 'lucide-react';

type ViewMode = 'list' | 'create' | 'review' | 'summary';

export const Flashcards: React.FC = () => {
  const { user } = useAuthStore();
  const { fetchDashboardData } = useDataStore();
  const { decks, addDeck, deleteDeck } = useDeckStore();
  
  const [searchParams, setSearchParams] = useSearchParams();
  const [mode, setMode] = useState<ViewMode>('list');
  const [, setActiveDeck] = useState<Deck | null>(null);
  
  // Create Deck Form State
  const [newName, setNewName] = useState('');
  const [newTime, setNewTime] = useState<number | null>(5);
  const [newLevels, setNewLevels] = useState<number[]>([1]);

  // Review Session State
  const selectorRef = useRef<CardSelector | null>(null);
  const [currentCard, setCurrentCard] = useState<any | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [loading, setLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [cardsReviewed, setCardsReviewed] = useState(0);

  // Extra Details State
  const [extraDetailsLoading, setExtraDetailsLoading] = useState(false);
  const [aiDetails, setAiDetails] = useState<{ sentence: any; compounds: any; meaning: any; pos: string | null } | null>(null);

  // Global Study Session Timer
  useEffect(() => {
    if (mode === 'review' && user) {
      useDataStore.getState().startStudySession(user.id);
    } else {
      useDataStore.getState().stopStudySession();
    }
    return () => useDataStore.getState().stopStudySession();
  }, [mode, user]);

  const endSession = () => {
    setMode('summary');
  };

  // Auto-fetch extra details when card changes
  useEffect(() => {
    if (!currentCard) return;
    const vocab = currentCard.vocab;
    const hasDbSentence = vocab.sentences && vocab.sentences.length > 0 && vocab.sentences[0];
    const hasDbCompounds = vocab.compounds && vocab.compounds.length > 0 && vocab.compounds[0];
    
    if (!hasDbSentence || !hasDbCompounds) {
      setExtraDetailsLoading(true);
      getExtraDetails(vocab).then(details => {
        setAiDetails(details);
        setExtraDetailsLoading(false);
      });
    } else {
      setAiDetails(null);
      setExtraDetailsLoading(false);
    }
  }, [currentCard]);

  // Filter out junk CEDICT meanings
  const JUNK_PREFIXES = ['variant of', 'old variant of', 'archaic variant of', 'surname ', 'see also', 'CL:'];
  const filterMeanings = (meanings: any[] | undefined): any[] => {
    if (!meanings || meanings.length === 0) return [];
    const filtered = meanings.filter((m: any) => {
      const text = (m.meaning || '').trim();
      return !JUNK_PREFIXES.some(prefix => text.startsWith(prefix));
    });
    // If ALL meanings were filtered out, just return the empty array so the Meaning block is hidden
    return filtered;
  };

  // Auto-start Daily Review from Dashboard URL
  useEffect(() => {
    if (searchParams.get('mode') === 'daily_review' && user) {
      setSearchParams({});
      startDailyReview();
    }
  }, [searchParams, user]);

  // Timer Effect
  useEffect(() => {
    if (mode === 'review' && timeLeft !== null && timeLeft > 0) {
      const timer = setInterval(() => setTimeLeft(prev => (prev !== null ? prev - 1 : null)), 1000);
      return () => clearInterval(timer);
    } else if (mode === 'review' && timeLeft === 0) {
      endSession();
    }
  }, [mode, timeLeft]);

  const toggleLevel = (level: number) => {
    if (newLevels.includes(level)) {
      if (newLevels.length > 1) setNewLevels(newLevels.filter(l => l !== level));
    } else {
      setNewLevels([...newLevels, level]);
    }
  };

  const handleCreateDeck = () => {
    if (!newName.trim()) return;
    addDeck({ name: newName, levels: newLevels, timeLimitMinutes: newTime });
    setMode('list');
    setNewName('');
    setNewLevels([1]);
    setNewTime(5);
  };

  const startDailyReview = async () => {
    const deck: Deck = {
      id: 'system_daily',
      name: 'Daily Review',
      levels: [1, 2, 3, 4, 5, 6],
      timeLimitMinutes: null
    };
    await startSession(deck, true, false);
  };

  const startSavedWordsReview = async () => {
    const deck: Deck = {
      id: 'system_saved',
      name: 'My Saved Words',
      levels: [], // ignored for saved words
      timeLimitMinutes: null
    };
    await startSession(deck, false, true);
  };

  const startSession = async (deck: Deck, isSystemDeck: boolean = false, isSavedWordsDeck: boolean = false) => {
    setActiveDeck(deck);
    setLoading(true);
    setMode('review');
    setCardsReviewed(0);
    setTimeLeft(deck.timeLimitMinutes ? deck.timeLimitMinutes * 60 : null);

    const now = new Date().toISOString();

    // 1. Fetch ALL user flashcards in one query
    const { data: allUserCards } = await supabase
      .from('user_flashcards')
      .select('*')
      .eq('user_id', user!.id);

    const userCards = allUserCards || [];
    const knownIds = new Set(userCards.map(c => c.vocab_id));

    // Partition into due vs not-due
    const dueRaw = userCards.filter(c => c.next_review_date <= now);
    const notDueRaw = userCards.filter(c => c.next_review_date > now);

    // Fetch vocab data for all known cards that match deck levels
    const allKnownIds = userCards.map(c => c.vocab_id);
    let vocabLookup: Record<string, any> = {};

    if (allKnownIds.length > 0) {
      const { data: vocabData } = await supabase
        .from('flashcard_view')
        .select('*')
        .in('vocab_id', allKnownIds);

      if (vocabData) {
        for (const v of vocabData) {
          vocabLookup[v.vocab_id] = v;
        }
      }
    }

    // Helper to enrich a user_flashcard row with its vocab data
    const enrich = (c: any) => {
      const vocab = vocabLookup[c.vocab_id];
      return vocab ? { ...c, vocab } : null;
    };

    // Due cards — reviewed before, now due
    const dueMapped = dueRaw
      .map(enrich)
      .filter((c): c is any => c !== null && deck.levels.includes(c.vocab.hsk_level));

    // FSRS Priority Sort for due cards
    dueMapped.sort((a, b) => {
      const freqA = a.vocab.frequency_rank || 50000;
      const freqB = b.vocab.frequency_rank || 50000;
      return freqA - freqB;
    });

    // Learning cards — reviewed, not due, interval < 8
    const learningMapped = notDueRaw
      .filter(c => (c.interval || 0) < 8)
      .map(enrich)
      .filter((c): c is any => c !== null && deck.levels.includes(c.vocab.hsk_level));

    // Mature cards — reviewed, not due, interval >= 8
    const matureMapped = notDueRaw
      .filter(c => (c.interval || 0) >= 8)
      .map(enrich)
      .filter((c): c is any => c !== null && deck.levels.includes(c.vocab.hsk_level));

    // 2. Fetch new cards to inject
    let newWords: any[] = [];
    
    if (!isSavedWordsDeck) {
      let newWordsQuery = supabase
        .from('flashcard_view')
        .select('*')
        .in('hsk_level', deck.levels)
        .limit(100);
        
      if (isSystemDeck) {
        newWordsQuery = newWordsQuery.order('frequency_rank', { ascending: true });
      }
      
      const { data: fetchedNewWords } = await newWordsQuery;
      
      newWords = (fetchedNewWords || [])
        .filter(w => !knownIds.has(w.vocab_id))
        .slice(0, isSystemDeck ? 10 : 20);
    }

    const newQueue = newWords.map(w => ({
      isNew: true,
      vocab_id: w.vocab_id,
      vocab: w,
      status: 'new'
    }));

    // 3. Create the CardSelector
    const selector = new CardSelector(dueMapped, learningMapped, newQueue, matureMapped);
    selectorRef.current = selector;

    const firstCard = selector.pickNextCard();
    setCurrentCard(firstCard);
    setLoading(false);
    setShowAnswer(false);

    if (!firstCard) {
      endSession();
    }
  };

  const handleRating = async (quality: number) => {
    if (!currentCard || !selectorRef.current) return;
    const card = currentCard;
    const selector = selectorRef.current;

    let stability = 0;
    let difficulty = 0;
    
    if (!card.isNew) {
      stability = card.ease_factor || 0;
      difficulty = card.repetitions || 0;
    }

    const fsrs = calculateFSRS(quality, stability, difficulty, card.vocab?.frequency_rank || 50000);
    
    let status = 'learning';
    if (fsrs.interval > 21) status = 'mastered';
    else if (fsrs.interval > 0) status = 'reviewing';

    if (card.isNew) {
      await supabase.from('user_flashcards').insert({
        user_id: user!.id,
        vocab_id: card.vocab_id,
        ease_factor: fsrs.easeFactor,
        interval: fsrs.interval,
        repetitions: fsrs.repetitions,
        next_review_date: fsrs.nextReviewDate,
        status
      });
      // Report new card introduction for momentum re-showing
      selector.reportNewCardIntroduced(card);
      card.isNew = false;
    } else {
      await supabase.from('user_flashcards')
        .update({
          ease_factor: fsrs.easeFactor,
          interval: fsrs.interval,
          repetitions: fsrs.repetitions,
          next_review_date: fsrs.nextReviewDate,
          status,
          updated_at: new Date().toISOString()
        })
        .eq('id', card.id);
    }
    
    if (status === 'mastered' && card.status !== 'mastered') {
      const { data: profileData } = await supabase.from('profiles').select('words_mastered').eq('id', user!.id).single();
      if (profileData) {
        await supabase.from('profiles').update({ words_mastered: profileData.words_mastered + 1 }).eq('id', user!.id);
      }
    }

    // Report rating to selector (handles retry queue for "Again")
    selector.reportRating(card.vocab_id, quality);
    setCardsReviewed(prev => prev + 1);

    // Pick next card — session ends when null
    const nextCard = selector.pickNextCard();
    if (nextCard) {
      setCurrentCard(nextCard);
      setShowAnswer(false);
      setAiDetails(null);
    } else {
      endSession();
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center p-12 text-slate-400 mt-20">
      <BrainCircuit size={64} className="animate-pulse mb-6 text-indigo-300" strokeWidth={1.5} />
      <h3 className="text-xl font-bold tracking-tight text-slate-900">Building Deck...</h3>
    </div>
  );

  // --- MODE: LIST & CREATE ---
  if (mode === 'list') {
    return (
      <div className="max-w-5xl mx-auto flex flex-col gap-8 transition-all pb-12">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Flashcard Decks</h1>
          <button 
            className="flex items-center gap-2 bg-slate-900 text-white font-bold py-3 px-6 rounded-2xl shadow-sm hover:-translate-y-0.5 hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer" 
            onClick={() => setMode('create')} 
            disabled={decks.length >= 5}
          >
            <Plus size={20} /> Create Set ({decks.length}/5)
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="bg-gradient-to-br from-indigo-600 to-purple-600 rounded-3xl p-8 text-white flex flex-col gap-4 shadow-sm transition-all hover:-translate-y-1 hover:shadow-md">
            <h3 className="text-xl font-extrabold tracking-tight flex items-center gap-3"><BrainCircuit size={24} /> Daily Review</h3>
            <p className="text-indigo-100 font-medium leading-relaxed mt-2 flex-1">Automated spaced repetition feed prioritizing due cards and auto-injecting new vocabulary.</p>
            <div className="flex gap-2 mt-4">
              <span className="bg-white/20 text-white px-3 py-1 text-xs font-bold uppercase tracking-widest rounded-lg border border-white/30 backdrop-blur-sm">Smart Queue</span>
            </div>
            <button 
              className="w-full bg-white text-indigo-700 font-bold py-4 rounded-2xl flex items-center justify-center gap-3 mt-4 transition-all hover:bg-indigo-50 hover:shadow-sm cursor-pointer" 
              onClick={startDailyReview}
            >
              <Play size={20} className="fill-current" /> Start System Review
            </button>
          </div>
          
          <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm flex flex-col gap-4 transition-all hover:-translate-y-1 hover:shadow-md">
            <h3 className="text-xl font-extrabold tracking-tight flex items-center gap-3 text-slate-900"><Bookmark size={24} className="text-indigo-600" /> Saved Words</h3>
            <p className="text-slate-500 font-medium leading-relaxed mt-2 flex-1">Review your entire vocabulary collection without the system automatically adding new words.</p>
            <div className="flex gap-2 mt-4">
              <span className="bg-indigo-50 text-indigo-600 px-3 py-1 text-xs font-bold uppercase tracking-widest rounded-lg border border-indigo-100">Custom Queue</span>
            </div>
            <button 
              className="w-full bg-slate-50 text-slate-800 border border-slate-200 font-bold py-4 rounded-2xl flex items-center justify-center gap-3 mt-4 transition-all hover:bg-white hover:border-indigo-200 hover:text-indigo-600 hover:shadow-sm cursor-pointer" 
              onClick={startSavedWordsReview}
            >
              <Play size={20} className="fill-current" /> Start Custom Review
            </button>
          </div>
          
          {decks.map(deck => (
            <div key={deck.id} className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm flex flex-col gap-4 transition-all hover:-translate-y-1 hover:shadow-md">
              <div className="flex justify-between items-start">
                <h3 className="text-xl font-extrabold tracking-tight text-slate-900 truncate">{deck.name}</h3>
                <button 
                  className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all cursor-pointer" 
                  onClick={() => deleteDeck(deck.id)}
                >
                  <Trash2 size={20} />
                </button>
              </div>
              <div className="flex flex-wrap gap-2 mt-4 flex-1">
                <span className="bg-amber-50 text-amber-600 px-3 py-1 text-xs font-bold uppercase tracking-widest rounded-lg border border-amber-100 flex items-center gap-1.5 h-max">
                  {deck.timeLimitMinutes ? <><Clock size={16} /> {deck.timeLimitMinutes} min</> : <><InfinityIcon size={16} /> No Limit</>}
                </span>
                <span className="bg-slate-100 text-slate-600 px-3 py-1 text-xs font-bold uppercase tracking-widest rounded-lg border border-slate-200 h-max">
                  HSK {deck.levels.join(', ')}
                </span>
              </div>
              <button 
                className="w-full bg-slate-50 text-slate-800 border border-slate-200 font-bold py-4 rounded-2xl flex items-center justify-center gap-3 mt-4 transition-all hover:bg-white hover:border-indigo-200 hover:text-indigo-600 hover:shadow-sm cursor-pointer" 
                onClick={() => startSession(deck)}
              >
                <Play size={20} className="fill-current" /> Start Session
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (mode === 'create') {
    return (
      <div className="max-w-2xl mx-auto flex flex-col gap-8 transition-all pb-12">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Create Custom Deck</h1>
        <div className="bg-white rounded-3xl p-8 md:p-10 border border-slate-200 shadow-sm flex flex-col gap-8">
          <div>
            <label className="text-slate-500 font-bold text-xs uppercase tracking-widest block mb-3">Deck Name</label>
            <input 
              type="text" 
              className="w-full px-5 py-4 rounded-2xl bg-slate-50 border border-slate-200 text-slate-900 text-lg font-medium focus:outline-none focus:ring-4 focus:ring-indigo-50 focus:border-indigo-500 transition-all shadow-sm" 
              placeholder="e.g. HSK 1 & 2 Vocab" 
              value={newName} 
              onChange={e => setNewName(e.target.value)} 
            />
          </div>
          <div>
            <label className="text-slate-500 font-bold text-xs uppercase tracking-widest block mb-3">Time Limit (Minutes)</label>
            <div className="flex gap-3 flex-wrap">
              {[1, 5, 10, 15, 30].map(t => (
                <button 
                  key={t} 
                  className={`px-5 py-3 rounded-xl font-bold transition-all cursor-pointer ${
                    newTime === t ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100'
                  }`} 
                  onClick={() => setNewTime(t)}
                >
                  {t} min
                </button>
              ))}
              <button 
                className={`px-5 py-3 rounded-xl font-bold transition-all cursor-pointer ${
                  newTime === null ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100'
                }`} 
                onClick={() => setNewTime(null)}
              >
                No Limit
              </button>
            </div>
          </div>
          <div>
            <label className="text-slate-500 font-bold text-xs uppercase tracking-widest block mb-3">Include HSK Levels</label>
            <div className="flex gap-3 flex-wrap">
              {[1, 2, 3, 4, 5, 6].map(lvl => (
                <button 
                  key={lvl} 
                  className={`px-5 py-3 rounded-xl font-bold transition-all cursor-pointer ${
                    newLevels.includes(lvl) ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100'
                  }`} 
                  onClick={() => toggleLevel(lvl)}
                >
                  HSK {lvl}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-4 mt-4 pt-8 border-t border-slate-100">
            <button className="flex-1 bg-indigo-600 text-white font-bold py-4 rounded-2xl shadow-sm hover:-translate-y-0.5 hover:shadow-md transition-all cursor-pointer" onClick={handleCreateDeck}>Save Deck</button>
            <button className="flex-1 bg-white text-slate-700 border border-slate-200 font-bold py-4 rounded-2xl shadow-sm hover:bg-slate-50 transition-all cursor-pointer" onClick={() => setMode('list')}>Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'summary') {
    return (
      <div className="max-w-lg mx-auto flex flex-col gap-6 text-center transition-all pt-20">
        <div className="text-[80px] mb-4 animate-bounce">🎉</div>
        <h1 className="text-4xl font-extrabold tracking-tight text-slate-900">Session Complete!</h1>
        <div className="bg-white rounded-3xl p-10 border border-slate-200 shadow-sm mt-8 flex flex-col items-center justify-center">
          <div className="text-6xl font-extrabold text-indigo-600 leading-none">{cardsReviewed}</div>
          <div className="text-slate-500 font-bold text-sm uppercase tracking-widest mt-4">Cards Reviewed</div>
        </div>
        <button 
          className="w-full bg-slate-900 text-white font-bold py-4 rounded-2xl shadow-sm hover:-translate-y-0.5 hover:shadow-md transition-all mt-6 cursor-pointer" 
          onClick={() => { setMode('list'); fetchDashboardData(user!.id); }}
        >
          Back to Decks
        </button>
      </div>
    );
  }

  // --- MODE: REVIEW ---
  if (!currentCard) return (
    <div className="max-w-lg mx-auto bg-white rounded-3xl p-12 border border-slate-200 shadow-sm text-center mt-20">
      <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 mb-8">No cards due!</h2>
      <button className="w-full bg-slate-900 text-white font-bold py-4 rounded-2xl shadow-sm hover:-translate-y-0.5 hover:shadow-md transition-all cursor-pointer" onClick={() => setMode('summary')}>End Session</button>
    </div>
  );

  const vocab = currentCard.vocab;

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6 transition-all pb-12">
      <div className="flex justify-between items-center p-5 bg-white rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3 font-extrabold text-indigo-600 text-xl tracking-tight">
          {timeLeft !== null ? <><Clock size={24} /> {formatTime(timeLeft)}</> : <><InfinityIcon size={24} /> Endless</>}
        </div>
        <div className="text-slate-500 font-bold text-sm uppercase tracking-widest">Reviewed: <span className="text-slate-900">{cardsReviewed}</span></div>
        <button className="text-rose-500 hover:text-rose-600 font-bold text-sm uppercase tracking-widest transition-colors cursor-pointer" onClick={() => setMode('summary')}>End Early</button>
      </div>
      
      {/* PROFESSIONAL PLECO-STYLE FLASHCARD */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-md flex flex-col min-h-[600px] overflow-hidden transition-all relative">
        
        {/* FRONT / HEADER */}
        <div 
          onClick={() => !showAnswer && setShowAnswer(true)}
          className={`px-8 pt-16 pb-12 text-center transition-all duration-300 relative ${!showAnswer ? 'cursor-pointer hover:bg-slate-50 flex-1 flex flex-col justify-center' : 'bg-slate-50/50 border-b border-slate-100'}`}
        >
          <div className="absolute top-6 left-6 right-6 flex justify-between items-start">
             {currentCard.isNew 
               ? <span className="bg-amber-100 text-amber-700 px-3 py-1 text-xs font-bold uppercase tracking-widest rounded-lg border border-amber-200">New Word</span> 
               : <span className="bg-slate-100 text-slate-500 px-3 py-1 text-xs font-bold uppercase tracking-widest rounded-lg border border-slate-200">Review</span>}
             <span className="bg-indigo-50 text-indigo-600 px-3 py-1 text-xs font-bold uppercase tracking-widest rounded-lg border border-indigo-100">HSK {vocab.hsk_level}</span>
          </div>
          
          <h2 className={`font-chinese font-extrabold text-slate-900 leading-none ${vocab.simplified.length > 3 ? 'text-6xl' : 'text-8xl'}`}>
            {vocab.simplified}
          </h2>
          
          <div className="h-16 mt-8">
            {showAnswer && (
              <div className="flex justify-center items-center gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <p className="text-indigo-600 font-extrabold text-3xl tracking-wide">{vocab.pinyin}</p>
                {(aiDetails?.pos || vocab.pos) && (
                  <span className="bg-purple-100 text-purple-700 px-3 py-1 text-xs font-bold uppercase tracking-widest rounded-lg border border-purple-200">
                    {aiDetails?.pos || vocab.pos}
                  </span>
                )}
              </div>
            )}
          </div>

          {!showAnswer && <p className="text-slate-400 font-bold uppercase tracking-widest text-sm absolute bottom-8 left-0 right-0 animate-pulse">Tap anywhere to reveal</p>}
        </div>

        {/* BACK / DETAILS */}
        {showAnswer && (
          <div className="flex flex-col flex-1 bg-white p-8 animate-in fade-in duration-300">
            
            {/* Meanings */}
            {(filterMeanings(vocab.meanings).length > 0 || aiDetails?.meaning) && (
              <div className="mb-8">
                <h4 className="text-slate-400 font-bold text-xs uppercase tracking-widest mb-4">Meaning</h4>
                <ul className="pl-5 text-xl font-medium text-slate-900 leading-relaxed marker:text-slate-300 space-y-2">
                  {filterMeanings(vocab.meanings).length > 0 ? filterMeanings(vocab.meanings).slice(0, 4).map((d: any, i: number) => (
                    <li key={i}>{d.meaning}</li>
                  )) : (
                    <li>{aiDetails?.meaning} <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest rounded ml-2 align-middle border border-indigo-100">AI</span></li>
                  )}
                </ul>
              </div>
            )}

             {/* AI Details Auto-Load */}
              <div className="flex flex-col gap-8 pt-6 border-t border-slate-100">
                
                {extraDetailsLoading && (
                  <div className="animate-pulse space-y-4">
                    <div className="h-4 w-1/3 bg-slate-100 rounded-lg"></div>
                    <div className="h-24 w-full bg-slate-50 rounded-2xl"></div>
                    <div className="h-4 w-2/5 bg-slate-100 rounded-lg mt-6"></div>
                    <div className="flex gap-3">
                      <div className="h-10 w-24 bg-slate-50 rounded-xl"></div>
                      <div className="h-10 w-24 bg-slate-50 rounded-xl"></div>
                    </div>
                  </div>
                )}
                
                {/* Sentences */}
                {!extraDetailsLoading && (aiDetails?.sentence || (vocab.sentences && vocab.sentences.length > 0 && vocab.sentences[0])) && (
                  <div>
                    <h4 className="text-slate-400 font-bold text-xs uppercase tracking-widest mb-4">Example Sentence</h4>
                    <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                      <p className="font-chinese text-2xl text-slate-900 mb-2 leading-relaxed font-medium">{aiDetails?.sentence?.chinese || vocab.sentences[0].chinese}</p>
                      {(aiDetails?.sentence?.pinyin || vocab.sentences[0].pinyin) && <p className="text-indigo-600 font-bold mb-3">{aiDetails?.sentence?.pinyin || vocab.sentences[0].pinyin}</p>}
                      <p className="text-slate-600 font-medium text-lg">{aiDetails?.sentence?.english || vocab.sentences[0].english}</p>
                    </div>
                  </div>
                )}

                {/* Compounds */}
                {!extraDetailsLoading && (aiDetails?.compounds || (vocab.compounds && vocab.compounds.length > 0 && vocab.compounds[0])) && (
                  <div>
                    <h4 className="text-slate-400 font-bold text-xs uppercase tracking-widest mb-4">Compound Words</h4>
                    <div className="flex flex-wrap gap-3">
                      {(aiDetails?.compounds || vocab.compounds).slice(0, 4).map((comp: any, i: number) => (
                        <div key={i} className="bg-white border border-slate-200 rounded-xl px-4 py-2 shadow-sm flex items-center gap-2 hover:border-indigo-200 transition-colors">
                          <span className="font-chinese font-extrabold text-slate-900 text-lg">{comp.simplified}</span> 
                          <span className="text-slate-500 font-bold text-sm">{comp.pinyin}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Character Breakdown */}
                {vocab.characters && vocab.characters.length > 0 && vocab.characters[0] && (
                  <div>
                    <h4 className="text-slate-400 font-bold text-xs uppercase tracking-widest mb-4">Character Breakdown</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {vocab.characters.map((c: any, i: number) => (
                        <div key={i} className="flex flex-col items-center p-4 bg-slate-50 rounded-2xl border border-slate-100">
                          <span className="font-chinese font-extrabold text-3xl text-indigo-600 mb-2">{c.character}</span>
                          <span className="text-slate-500 font-bold text-[10px] uppercase tracking-widest">Radical: {c.radical}</span>
                          <span className="text-slate-500 font-bold text-[10px] uppercase tracking-widest">Strokes: {c.stroke_count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Learning Stats */}
                {!currentCard.isNew && (
                  <div className="flex justify-between items-center px-5 py-4 bg-slate-50 rounded-xl border border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-widest mt-4">
                    <span>Seen: {currentCard.repetitions} times</span>
                    <span>Ease: {currentCard.ease_factor?.toFixed(1)}</span>
                    <span>Interval: {currentCard.interval} days</span>
                  </div>
                )}

              </div>

            {/* Quick Actions & Ratings */}
            <div className="flex flex-col gap-6 mt-10 pt-8 border-t border-slate-100">
              <div className="flex justify-center gap-8 mb-4">
                <button 
                  className="p-3 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-all cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    if ('speechSynthesis' in window) {
                      const u = new SpeechSynthesisUtterance(vocab.simplified);
                      u.lang = 'zh-CN'; u.rate = 0.9;
                      window.speechSynthesis.speak(u);
                    }
                  }}
                ><Volume2 size={28} /></button>
                <button className="p-3 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-all cursor-pointer"><Bookmark size={28} /></button>
                <button className="p-3 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-full transition-all cursor-pointer"><Heart size={28} /></button>
                <button className="p-3 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-all cursor-pointer"><BookOpen size={28} /></button>
              </div>

              <div className="flex gap-4 w-full justify-between">
                <button className="flex-1 py-4 rounded-2xl font-bold text-lg bg-rose-50 text-rose-600 border border-rose-200 shadow-sm hover:bg-rose-100 hover:-translate-y-0.5 hover:shadow-md transition-all cursor-pointer" onClick={() => handleRating(1)}>Again</button>
                <button className="flex-1 py-4 rounded-2xl font-bold text-lg bg-amber-50 text-amber-600 border border-amber-200 shadow-sm hover:bg-amber-100 hover:-translate-y-0.5 hover:shadow-md transition-all cursor-pointer" onClick={() => handleRating(3)}>Hard</button>
                <button className="flex-1 py-4 rounded-2xl font-bold text-lg bg-emerald-50 text-emerald-600 border border-emerald-200 shadow-sm hover:bg-emerald-100 hover:-translate-y-0.5 hover:shadow-md transition-all cursor-pointer" onClick={() => handleRating(4)}>Good</button>
                <button className="flex-1 py-4 rounded-2xl font-bold text-lg bg-indigo-600 text-white shadow-sm hover:bg-indigo-700 hover:-translate-y-0.5 hover:shadow-md transition-all cursor-pointer" onClick={() => handleRating(5)}>Easy</button>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
};
