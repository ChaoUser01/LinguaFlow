import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { useAuthStore } from '../store/useAuthStore';
import { useDataStore } from '../store/useDataStore';
import { useDeckStore } from '../store/useDeckStore';
import type { Deck } from '../store/useDeckStore';
import type { DictWord, DictCharacter } from '../types/dictionary';
import { calculateFSRS } from '../utils/fsrs';
import { CardSelector } from '../utils/cardSelector';
import { getExtraDetails } from '../services/aiGenerator';
import { Trash2, Plus, Clock, Play, BrainCircuit, Infinity as InfinityIcon, Volume2, Bookmark, Heart, BookOpen, Loader2 } from 'lucide-react';

type ViewMode = 'list' | 'create' | 'review' | 'summary';

export const Flashcards: React.FC = () => {
  const { user } = useAuthStore();
  const { profile, fetchDashboardData } = useDataStore();
  const { decks, addDeck, deleteDeck } = useDeckStore();
  
  const [searchParams, setSearchParams] = useSearchParams();
  const [mode, setMode] = useState<ViewMode>('list');
  const [activeDeck, setActiveDeck] = useState<Deck | null>(null);
  
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
  const [aiDetails, setAiDetails] = useState<{ sentence: any; compounds: any } | null>(null);

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
    // If ALL meanings were filtered out, keep the first one
    return filtered.length > 0 ? filtered : [meanings[0]];
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
      setMode('summary');
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
    await startSession(deck, true);
  };

  const startSession = async (deck: Deck, isSystemDeck: boolean = false) => {
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
    let newWordsQuery = supabase
      .from('flashcard_view')
      .select('*')
      .in('hsk_level', deck.levels)
      .limit(100);
      
    if (isSystemDeck) {
      newWordsQuery = newWordsQuery.order('frequency_rank', { ascending: true });
    }
    
    const { data: fetchedNewWords } = await newWordsQuery;
    
    const newWords = (fetchedNewWords || [])
      .filter(w => !knownIds.has(w.vocab_id))
      .slice(0, isSystemDeck ? 10 : 20);

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
      setMode('summary');
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
    const next = selector.pickNextCard();
    if (next) {
      setCurrentCard(next);
      setShowAnswer(false);
      setAiDetails(null);
    } else {
      setMode('summary');
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (loading) return <div className="flex-col items-center justify-center p-12 text-secondary"><BrainCircuit size={48} className="animate-spin mb-4" /> <h3>Building Deck...</h3></div>;

  // --- MODE: LIST & CREATE ---
  // (Simplified for brevity as it's identical to the previous implementation, only review mode changed drastically)
  if (mode === 'list') {
    return (
      <div className="flex-col gap-6 animate-fade-in">
        <div className="flex justify-between items-center">
          <h1 className="h2">Flashcard Decks</h1>
          <button className="btn btn-dark" onClick={() => setMode('create')} disabled={decks.length >= 5}><Plus size={18} style={{ marginRight: '8px' }} /> Create Set ({decks.length}/5)</button>
        </div>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '24px' }}>
          <div className="purple-card flex-col gap-4 hover-scale">
            <h3 className="h3 flex items-center gap-2"><BrainCircuit size={20} /> Daily Review</h3>
            <p style={{ opacity: 0.9, fontSize: '14px', lineHeight: 1.5 }}>Automated spaced repetition feed prioritizing due cards and auto-injecting new vocabulary.</p>
            <div className="flex gap-2 mt-auto"><span className="badge-white" style={{ background: 'rgba(255,255,255,0.2)' }}>Smart Queue</span></div>
            <button className="btn w-full mt-4 flex items-center justify-center gap-2" style={{ backgroundColor: 'white', color: '#6366f1' }} onClick={startDailyReview}><Play size={18} /> Start System Review</button>
          </div>
          {decks.map(deck => (
            <div key={deck.id} className="card flex-col gap-4 hover-scale">
              <div className="flex justify-between items-start">
                <h3 className="h3">{deck.name}</h3>
                <button className="text-error" onClick={() => deleteDeck(deck.id)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><Trash2 size={18} /></button>
              </div>
              <div className="flex gap-2 mt-auto">
                <span className="badge-orange">{deck.timeLimitMinutes ? <><Clock size={14} style={{ marginRight: '4px' }}/> {deck.timeLimitMinutes} min</> : <><InfinityIcon size={14} style={{ marginRight: '4px' }}/> No Limit</>}</span>
                <span className="badge-orange">HSK {deck.levels.join(', ')}</span>
              </div>
              <button className="btn w-full mt-4 flex items-center justify-center gap-2" onClick={() => startSession(deck)}><Play size={18} /> Start Session</button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (mode === 'create') {
    return (
      <div className="flex-col gap-6 animate-fade-in" style={{ maxWidth: '600px', margin: '0 auto' }}>
        <h1 className="h2">Create Custom Deck</h1>
        <div className="card flex-col gap-6">
          <div>
            <label className="text-secondary font-medium" style={{ display: 'block', marginBottom: '8px' }}>Deck Name</label>
            <input type="text" className="input" placeholder="e.g. HSK 1 & 2 Vocab" value={newName} onChange={e => setNewName(e.target.value)} />
          </div>
          <div>
            <label className="text-secondary font-medium" style={{ display: 'block', marginBottom: '8px' }}>Time Limit (Minutes)</label>
            <div className="flex gap-4 flex-wrap">
              {[1, 5, 10, 15, 30].map(t => (<button key={t} className={`btn ${newTime === t ? 'btn-dark' : 'btn-secondary'}`} onClick={() => setNewTime(t)}>{t} min</button>))}
              <button className={`btn ${newTime === null ? 'btn-dark' : 'btn-secondary'}`} onClick={() => setNewTime(null)}>No Limit</button>
            </div>
          </div>
          <div>
            <label className="text-secondary font-medium" style={{ display: 'block', marginBottom: '8px' }}>Include HSK Levels</label>
            <div className="flex gap-2 flex-wrap">
              {[1, 2, 3, 4, 5, 6].map(lvl => (<button key={lvl} className={`btn ${newLevels.includes(lvl) ? 'btn-dark' : 'btn-secondary'}`} onClick={() => toggleLevel(lvl)}>HSK {lvl}</button>))}
            </div>
          </div>
          <div className="flex gap-4 mt-4">
            <button className="btn btn-dark w-full" onClick={handleCreateDeck}>Save Deck</button>
            <button className="btn btn-secondary w-full" onClick={() => setMode('list')}>Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'summary') {
    return (
      <div className="flex-col gap-6 text-center animate-fade-in" style={{ maxWidth: '500px', margin: '0 auto', paddingTop: '40px' }}>
        <div style={{ fontSize: '64px', marginBottom: '16px' }}>🎉</div>
        <h1 className="h1">Session Complete!</h1>
        <div className="card mt-8"><div className="h1 text-brand" style={{ fontSize: '48px' }}>{cardsReviewed}</div><div className="text-secondary font-medium mt-2">Cards Reviewed</div></div>
        <button className="btn btn-dark w-full mt-4" onClick={() => { setMode('list'); fetchDashboardData(user!.id); }}>Back to Decks</button>
      </div>
    );
  }

  // --- MODE: REVIEW ---
  if (!currentCard) return <div className="card text-center py-12"><h2 className="h3 mb-4">No cards due!</h2><button className="btn btn-dark" onClick={() => setMode('summary')}>End Session</button></div>;

  const vocab = currentCard.vocab;

  return (
    <div className="flex-col gap-6 animate-fade-in" style={{ maxWidth: '600px', margin: '0 auto' }}>
      <div className="flex justify-between items-center" style={{ padding: '16px', backgroundColor: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
        <div className="flex items-center gap-2 font-bold text-brand" style={{ fontSize: '20px' }}>
          {timeLeft !== null ? <><Clock size={24} /> {formatTime(timeLeft)}</> : <><InfinityIcon size={24} /> Endless</>}
        </div>
        <div className="text-secondary font-medium" style={{ fontSize: '14px' }}>Reviewed: {cardsReviewed}</div>
        <button className="text-error font-medium" style={{ background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setMode('summary')}>End Early</button>
      </div>
      
      {/* PROFESSIONAL PLECO-STYLE FLASHCARD */}
      <div className="card flex-col" style={{ minHeight: '550px', position: 'relative', padding: 0, overflow: 'hidden' }}>
        
        {/* FRONT / HEADER */}
        <div 
          onClick={() => !showAnswer && setShowAnswer(true)}
          style={{ padding: '40px 24px', textAlign: 'center', cursor: !showAnswer ? 'pointer' : 'default', backgroundColor: showAnswer ? '#F8FAFC' : 'white', borderBottom: showAnswer ? '1px solid #E2E8F0' : 'none', transition: 'background-color 0.3s' }}
        >
          <div className="flex justify-between items-start" style={{ position: 'absolute', top: '24px', left: '24px', right: '24px' }}>
             {currentCard.isNew ? <span className="badge-orange">New Word</span> : <span className="badge-red" style={{ backgroundColor: '#F1F5F9', color: '#64748B' }}>Review</span>}
             <span className="badge-orange" style={{ backgroundColor: '#F8FAFC', color: '#0F172A', border: '1px solid #E2E8F0' }}>HSK {vocab.hsk_level}</span>
          </div>
          
          <h2 className="chinese-text" style={{ fontSize: '96px', fontWeight: 'bold', color: '#0F172A', marginTop: '32px' }}>{vocab.simplified}</h2>
          
          <div style={{ height: '40px', marginTop: '16px' }}>
            {showAnswer && (
              <div className="flex justify-center items-center gap-3 animate-fade-in">
                <p className="text-brand font-bold" style={{ fontSize: '28px', letterSpacing: '0.05em' }}>{vocab.pinyin}</p>
                {(aiDetails?.pos || vocab.pos) && (
                  <span className="badge-purple" style={{ padding: '2px 8px', fontSize: '12px', borderRadius: '4px', backgroundColor: '#EDE9FE', color: '#6D28D9', border: '1px solid #DDD6FE' }}>
                    {aiDetails?.pos || vocab.pos}
                  </span>
                )}
              </div>
            )}
          </div>

          {!showAnswer && <p className="text-secondary mt-8 animate-pulse" style={{ fontSize: '15px', fontWeight: '500' }}>Tap anywhere to reveal</p>}
        </div>

        {/* BACK / DETAILS */}
        {showAnswer && (
          <div className="flex-col animate-fade-in" style={{ padding: '24px', flex: 1, backgroundColor: 'white' }}>
            
            {/* Meanings */}
            <div className="mb-6">
              <h4 className="text-secondary font-bold mb-2" style={{ textTransform: 'uppercase', fontSize: '12px', letterSpacing: '0.1em' }}>Meaning</h4>
              <ul style={{ paddingLeft: '20px', fontSize: '18px', color: '#0F172A', lineHeight: '1.6' }}>
                {filterMeanings(vocab.meanings).slice(0, 4).map((d: any, i: number) => (
                  <li key={i}>{d.meaning}</li>
                ))}
              </ul>
            </div>

             {/* AI Details Auto-Load */}
              <div className="flex-col gap-6 animate-fade-in" style={{ borderTop: '1px solid #E2E8F0', paddingTop: '24px' }}>
                
                {extraDetailsLoading && (
                  <div className="animate-pulse">
                    <div style={{ height: '14px', width: '30%', backgroundColor: '#E2E8F0', borderRadius: '4px', marginBottom: '12px' }}></div>
                    <div style={{ height: '60px', width: '100%', backgroundColor: '#F8FAFC', borderRadius: '8px', marginBottom: '16px' }}></div>
                    <div style={{ height: '14px', width: '40%', backgroundColor: '#E2E8F0', borderRadius: '4px', marginBottom: '12px' }}></div>
                    <div className="flex gap-2">
                      <div style={{ height: '36px', width: '100px', backgroundColor: '#F8FAFC', borderRadius: '8px' }}></div>
                      <div style={{ height: '36px', width: '100px', backgroundColor: '#F8FAFC', borderRadius: '8px' }}></div>
                      <div style={{ height: '36px', width: '100px', backgroundColor: '#F8FAFC', borderRadius: '8px' }}></div>
                    </div>
                  </div>
                )}
                
                {/* Sentences */}
                {!extraDetailsLoading && (aiDetails?.sentence || (vocab.sentences && vocab.sentences.length > 0 && vocab.sentences[0])) && (
                  <div>
                    <h4 className="text-secondary font-bold mb-3" style={{ textTransform: 'uppercase', fontSize: '12px', letterSpacing: '0.1em' }}>Example Sentence</h4>
                    <div style={{ backgroundColor: '#F8FAFC', padding: '16px', borderRadius: '8px' }}>
                      <p className="chinese-text mb-1" style={{ fontSize: '18px', color: '#0F172A' }}>{aiDetails?.sentence?.chinese || vocab.sentences[0].chinese}</p>
                      {(aiDetails?.sentence?.pinyin || vocab.sentences[0].pinyin) && <p className="text-brand mb-2" style={{ fontSize: '14px' }}>{aiDetails?.sentence?.pinyin || vocab.sentences[0].pinyin}</p>}
                      <p className="text-secondary" style={{ fontSize: '15px' }}>{aiDetails?.sentence?.english || vocab.sentences[0].english}</p>
                    </div>
                  </div>
                )}

                {/* Compounds */}
                {!extraDetailsLoading && (aiDetails?.compounds || (vocab.compounds && vocab.compounds.length > 0 && vocab.compounds[0])) && (
                  <div>
                    <h4 className="text-secondary font-bold mb-3" style={{ textTransform: 'uppercase', fontSize: '12px', letterSpacing: '0.1em' }}>Compound Words</h4>
                    <div className="flex gap-2 flex-wrap">
                      {(aiDetails?.compounds || vocab.compounds).slice(0, 4).map((comp: any, i: number) => (
                        <div key={i} className="badge-white" style={{ border: '1px solid #E2E8F0', padding: '8px 12px' }}>
                          <span className="font-bold chinese-text" style={{ fontSize: '16px' }}>{comp.simplified}</span> <span className="text-secondary" style={{ fontSize: '12px', marginLeft: '4px' }}>{comp.pinyin}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Character Breakdown */}
                {vocab.characters && vocab.characters.length > 0 && vocab.characters[0] && (
                  <div>
                    <h4 className="text-secondary font-bold mb-3" style={{ textTransform: 'uppercase', fontSize: '12px', letterSpacing: '0.1em' }}>Character Breakdown</h4>
                    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px' }}>
                      {vocab.characters.map((c: any, i: number) => (
                        <div key={i} className="flex-col items-center p-3" style={{ backgroundColor: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                          <span className="chinese-text font-bold mb-1" style={{ fontSize: '24px' }}>{c.character}</span>
                          <span className="text-secondary" style={{ fontSize: '12px' }}>Radical: {c.radical}</span>
                          <span className="text-secondary" style={{ fontSize: '12px' }}>Strokes: {c.stroke_count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Learning Stats */}
                {!currentCard.isNew && (
                  <div className="flex justify-between items-center" style={{ padding: '12px', backgroundColor: '#F1F5F9', borderRadius: '8px', fontSize: '12px', color: '#64748B' }}>
                    <span>Seen: {currentCard.repetitions} times</span>
                    <span>Ease: {currentCard.ease_factor?.toFixed(1)}</span>
                    <span>Interval: {currentCard.interval} days</span>
                  </div>
                )}

              </div>

            {/* Quick Actions & Ratings */}
            <div className="flex-col gap-4 mt-8 pt-6" style={{ borderTop: '1px solid #E2E8F0' }}>
              <div className="flex justify-center gap-6 mb-2">
                <button 
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }} 
                  className="hover-scale"
                  onClick={(e) => {
                    e.stopPropagation();
                    if ('speechSynthesis' in window) {
                      const u = new SpeechSynthesisUtterance(vocab.simplified);
                      u.lang = 'zh-CN'; u.rate = 0.9;
                      window.speechSynthesis.speak(u);
                    }
                  }}
                ><Volume2 size={24} /></button>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }} className="hover-scale"><Bookmark size={24} /></button>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }} className="hover-scale"><Heart size={24} /></button>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }} className="hover-scale"><BookOpen size={24} /></button>
              </div>

              <div className="flex gap-3 w-full justify-between">
                <button className="btn font-bold flex-1" style={{ backgroundColor: '#FEE2E2', color: '#DC2626' }} onClick={() => handleRating(1)}>Again</button>
                <button className="btn font-bold flex-1" style={{ backgroundColor: '#FFEDD5', color: '#EA580C' }} onClick={() => handleRating(3)}>Hard</button>
                <button className="btn font-bold flex-1" style={{ backgroundColor: '#D1FAE5', color: '#059669' }} onClick={() => handleRating(4)}>Good</button>
                <button className="btn btn-dark font-bold flex-1" onClick={() => handleRating(5)}>Easy</button>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
};
