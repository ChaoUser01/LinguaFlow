import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { Search, Loader2, Volume2, Bookmark, Sparkles, ChevronDown, ChevronUp, Filter } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { getExtraDetails } from '../services/aiGenerator';
import hskData from '../data/hsk.json';

// Filter out junk meanings like "variant of", "surname", etc.
const JUNK_PREFIXES = ['variant of', 'old variant of', 'archaic variant of', 'surname ', 'see also', 'CL:', 'used in'];
function filterMeanings(meanings: any[]): any[] {
  if (!meanings || meanings.length === 0) return [];
  const filtered = meanings.filter((d: any) => {
    const m = (d.meaning || d).toLowerCase().trim();
    return !JUNK_PREFIXES.some(prefix => m.startsWith(prefix));
  });
  return filtered.length > 0 ? filtered : [meanings[0]]; // Keep at least one
}

export const Dictionary: React.FC = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [savedWords, setSavedWords] = useState<Set<string>>(new Set());
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [levelFilter, setLevelFilter] = useState<number | 'ALL'>('ALL');
  const [showFilters, setShowFilters] = useState(false);
  const [useLocalFallback, setUseLocalFallback] = useState(false);
  const { user } = useAuthStore();

  useEffect(() => {
    fetchSavedWords();
  }, []);

  const fetchSavedWords = async () => {
    if (!user) return;
    const { data } = await supabase.from('user_flashcards').select('vocab_id').eq('user_id', user.id);
    if (data) setSavedWords(new Set(data.map(d => d.vocab_id)));
  };

  // Local fallback search using hsk.json
  const searchLocal = useCallback((q: string): any[] => {
    const s = q.toLowerCase().trim();
    const sNoSpaces = s.replace(/\s+/g, '');

    return hskData
      .map(word => {
        let score = 0;
        const pinyinLower = (word.pinyin || '').toLowerCase();
        const pinyinNoTones = pinyinLower.replace(/[0-9]/g, '');
        const pinyinNoSpaces = pinyinNoTones.replace(/\s+/g, '');
        const meaningLower = (word.meaning || '').toLowerCase();
        const simplified = word.simplified || '';

        if (simplified === s) score += 100;
        else if (simplified.startsWith(s)) score += 80;
        else if (simplified.includes(s)) score += 60;

        if (pinyinLower === s || pinyinNoTones === s || pinyinNoSpaces === sNoSpaces) score += 90;
        else if (pinyinNoTones.startsWith(s) || pinyinNoSpaces.startsWith(sNoSpaces)) score += 70;
        else if (pinyinNoSpaces.includes(sNoSpaces)) score += 50;

        const wordsInMeaning = meaningLower.split(/[\s;,\/]+/);
        if (wordsInMeaning.includes(s)) score += 65;
        else if (meaningLower.includes(s)) score += 10;

        return { word, score };
      })
      .filter(item => {
        if (item.score <= 0) return false;
        if (levelFilter !== 'ALL' && item.word.hsk_level !== levelFilter) return false;
        return true;
      })
      .sort((a, b) => b.score - a.score || a.word.hsk_level - b.word.hsk_level)
      .map(item => ({
        vocab_id: item.word.id,
        simplified: item.word.simplified,
        traditional: item.word.simplified,
        pinyin: item.word.pinyin,
        hsk_level: item.word.hsk_level,
        frequency_rank: null,
        meanings: item.word.meaning
          ? item.word.meaning.split(/[\/]/).map((m: string) => ({ meaning: m.trim() }))
          : [],
        sentences: [],
        characters: [],
        compounds: [],
      }))
      .slice(0, 50);
  }, [levelFilter]);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setExpandedCard(null);

    if (useLocalFallback) {
      setResults(searchLocal(query));
      setLoading(false);
      return;
    }

    // Try the custom RPC function first
    const { data, error } = await supabase.rpc('search_dictionary', {
      search_query: query.trim(),
      max_results: 50,
    });

    if (error) {
      console.warn('RPC search failed, falling back to local hsk.json:', error.message);
      setUseLocalFallback(true);
      setResults(searchLocal(query));
    } else {
      setResults(data || []);
    }

    setLoading(false);
  };

  // Re-search when level filter changes
  useEffect(() => {
    if (query.trim()) {
      handleSearch();
    }
  }, [levelFilter]);



  const playAudio = (text: string) => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'zh-CN';
      utterance.rate = 0.9;
      window.speechSynthesis.speak(utterance);
    }
  };

  const toggleSaveWord = async (vocab_id: string) => {
    if (!user) return;
    const isSaved = savedWords.has(vocab_id);

    if (isSaved) {
      await supabase.from('user_flashcards').delete().eq('vocab_id', vocab_id).eq('user_id', user.id);
      const next = new Set(savedWords);
      next.delete(vocab_id);
      setSavedWords(next);
    } else {
      await supabase.from('user_flashcards').insert({
        user_id: user.id,
        vocab_id,
        ease_factor: 2.5,
        interval: 0,
        repetitions: 0,
        status: 'new',
      });
      const next = new Set(savedWords);
      next.add(vocab_id);
      setSavedWords(next);
    }
  };

  const toggleExpand = async (index: number) => {
    const vocab = results[index];
    const id = vocab.vocab_id;
    const isExpanding = expandedCard !== id;
    setExpandedCard(isExpanding ? id : null);

    if (isExpanding && (!vocab.sentences?.[0] || !vocab.compounds?.[0]) && !vocab._aiDetails) {
      setResults(prev => {
        const next = [...prev];
        next[index] = { ...vocab, _aiLoading: true };
        return next;
      });

      const details = await getExtraDetails(vocab);

      setResults(prev => {
        const next = [...prev];
        if (details.sentence || details.compounds) {
          next[index] = {
            ...next[index],
            _aiLoading: false,
            _aiDetails: true,
            pos: details.pos || null,
            sentences: details.sentence ? [details.sentence] : next[index].sentences,
            compounds: details.compounds ? details.compounds : next[index].compounds,
          };
        } else {
          next[index] = { ...next[index], _aiLoading: false, _aiDetails: true };
        }
        return next;
      });
    }
  };

  return (
    <div className="flex-col gap-6 animate-fade-in" style={{ maxWidth: '850px', margin: '0 auto' }}>
      {/* Header */}
      <div className="flex-col gap-2 text-center py-6">
        <h1 className="h1" style={{ fontSize: '36px', letterSpacing: '-0.03em' }}>Knowledge Base</h1>
        <p className="text-secondary" style={{ fontSize: '16px' }}>
          Search across {hskData.length.toLocaleString()} Chinese words by character, pinyin, or English
        </p>
      </div>

      {/* Search Bar */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="flex-1" style={{ position: 'relative' }}>
          <Search size={20} className="text-secondary" style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            className="input w-full"
            placeholder="Search e.g. 'hello', 'ni hao', or '你好'"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ paddingLeft: '48px', fontSize: '18px', padding: '16px 16px 16px 48px', borderRadius: '12px' }}
          />
        </div>
        <button
          type="button"
          className={`btn ${showFilters ? 'btn-dark' : 'btn-secondary'}`}
          onClick={() => setShowFilters(!showFilters)}
          style={{ padding: '0 16px' }}
        >
          <Filter size={20} />
        </button>
        <button type="submit" className="btn btn-dark" disabled={loading} style={{ padding: '0 32px', borderRadius: '12px' }}>
          {loading ? <Loader2 className="animate-spin" /> : 'Search'}
        </button>
      </form>

      {/* Filters */}
      {showFilters && (
        <div className="flex gap-2 flex-wrap animate-fade-in" style={{ padding: '12px 16px', backgroundColor: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
          <span className="text-secondary font-medium text-sm" style={{ lineHeight: '32px' }}>HSK Level:</span>
          <button className={`btn ${levelFilter === 'ALL' ? 'btn-dark' : 'btn-secondary'}`} style={{ padding: '4px 12px', fontSize: '13px' }} onClick={() => setLevelFilter('ALL')}>All</button>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(lvl => (
            <button key={lvl} className={`btn ${levelFilter === lvl ? 'btn-dark' : 'btn-secondary'}`} style={{ padding: '4px 12px', fontSize: '13px' }} onClick={() => setLevelFilter(lvl)}>
              HSK {lvl}
            </button>
          ))}
        </div>
      )}

      {/* Local fallback notice */}
      {useLocalFallback && (
        <div style={{ padding: '12px 16px', backgroundColor: '#FEF3C7', borderRadius: '8px', fontSize: '13px', color: '#92400E', border: '1px solid #FDE68A' }}>
          ⚠️ Using offline dictionary. Deploy the <code>search_dictionary</code> RPC to unlock the full database.
        </div>
      )}

      {/* Results */}
      <div className="flex-col gap-4 mt-2">
        {results.length > 0 && (
          <div className="text-secondary text-sm font-medium" style={{ paddingLeft: '4px' }}>
            {results.length} result{results.length !== 1 ? 's' : ''} found
          </div>
        )}
        {results.map((vocab, idx) => {
          const isExpanded = expandedCard === vocab.vocab_id;
          const cleanMeanings = filterMeanings(vocab.meanings || []);

          return (
            <div key={vocab.vocab_id || idx} className="card flex-col animate-fade-in" style={{ padding: 0, overflow: 'hidden' }}>
              {/* Main Row */}
              <div
                className="flex justify-between items-center"
                style={{ padding: '20px 24px', cursor: 'pointer' }}
                onClick={() => toggleExpand(idx)}
              >
                <div className="flex items-center gap-6" style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ flexShrink: 0, minWidth: '110px', display: 'flex', alignItems: 'center' }}>
                    <h2 className="chinese-text font-bold text-brand" style={{ fontSize: vocab.simplified.length > 2 ? '34px' : '46px', lineHeight: 1, whiteSpace: 'nowrap' }}>
                      {vocab.simplified}
                    </h2>
                  </div>
                  <div className="flex-col gap-2" style={{ flex: 1, minWidth: 0, paddingRight: '16px' }}>
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-bold" style={{ fontSize: '18px', color: '#334155' }}>{vocab.pinyin}</span>
                      {vocab.pos && <span className="badge-purple" style={{ padding: '2px 8px', fontSize: '12px', borderRadius: '4px', backgroundColor: '#EDE9FE', color: '#6D28D9', border: '1px solid #DDD6FE' }}>{vocab.pos}</span>}
                    </div>
                    <span className="text-secondary" style={{ fontSize: '15px', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {cleanMeanings.slice(0, 3).map((d: any) => d.meaning || d).join('; ')}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="badge-orange" style={{ padding: '3px 10px', fontSize: '12px' }}>HSK {vocab.hsk_level}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); playAudio(vocab.simplified); }}
                    className="hover-scale"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', padding: '4px' }}
                  >
                    <Volume2 size={20} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleSaveWord(vocab.vocab_id); }}
                    className="hover-scale"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
                  >
                    <Bookmark size={20} className={savedWords.has(vocab.vocab_id) ? 'text-brand' : 'text-secondary'} fill={savedWords.has(vocab.vocab_id) ? 'currentColor' : 'none'} />
                  </button>
                  {isExpanded ? <ChevronUp size={20} className="text-secondary" /> : <ChevronDown size={20} className="text-secondary" />}
                </div>
              </div>

              {/* Expanded Details */}
              {isExpanded && (
                <div className="flex-col gap-5 animate-fade-in" style={{ padding: '0 24px 24px', borderTop: '1px solid #E2E8F0' }}>
                  {/* All Meanings */}
                  <div style={{ paddingTop: '20px' }}>
                    <h4 className="text-secondary font-bold mb-2" style={{ textTransform: 'uppercase', fontSize: '11px', letterSpacing: '0.1em' }}>Definitions</h4>
                    <ol style={{ paddingLeft: '20px', fontSize: '16px', color: '#0F172A', lineHeight: '1.8' }}>
                      {cleanMeanings.map((d: any, i: number) => (
                        <li key={i}>{d.meaning || d}</li>
                      ))}
                    </ol>
                  </div>

                  {/* Traditional Character */}
                  {vocab.traditional && vocab.traditional !== vocab.simplified && (
                    <div className="flex items-center gap-2">
                      <span className="text-secondary text-sm font-medium">Traditional:</span>
                      <span className="chinese-text font-bold" style={{ fontSize: '20px' }}>{vocab.traditional}</span>
                    </div>
                  )}

                  {/* Frequency Rank */}
                  {vocab.frequency_rank && (
                    <div className="flex items-center gap-2">
                      <span className="text-secondary text-sm font-medium">Frequency Rank:</span>
                      <span className="badge-white" style={{ padding: '2px 8px', fontSize: '12px', border: '1px solid #E2E8F0' }}>#{vocab.frequency_rank}</span>
                    </div>
                  )}

                  {/* Example Sentence */}
                  {vocab.sentences && vocab.sentences.length > 0 && vocab.sentences[0] && (
                    <div>
                      <h4 className="text-secondary font-bold mb-3" style={{ textTransform: 'uppercase', fontSize: '11px', letterSpacing: '0.1em' }}>Example Sentence</h4>
                      <div style={{ backgroundColor: '#F8FAFC', padding: '16px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                        <div className="flex justify-between items-start">
                          <p className="chinese-text" style={{ fontSize: '18px', color: '#0F172A', lineHeight: 1.6 }}>{vocab.sentences[0].chinese}</p>
                          <button onClick={() => playAudio(vocab.sentences[0].chinese)} className="text-brand hover-scale" style={{ background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0, padding: '4px' }}><Volume2 size={16} /></button>
                        </div>
                        {vocab.sentences[0].pinyin && <p className="text-brand mt-1" style={{ fontSize: '14px' }}>{vocab.sentences[0].pinyin}</p>}
                        <p className="text-secondary mt-1" style={{ fontSize: '14px' }}>{vocab.sentences[0].english}</p>
                      </div>
                    </div>
                  )}

                  {/* Compounds */}
                  {vocab.compounds && vocab.compounds.length > 0 && vocab.compounds[0] && (
                    <div>
                      <h4 className="text-secondary font-bold mb-3" style={{ textTransform: 'uppercase', fontSize: '11px', letterSpacing: '0.1em' }}>Related Compounds</h4>
                      <div className="flex gap-2 flex-wrap">
                        {vocab.compounds.slice(0, 6).map((comp: any, i: number) => (
                          <div key={i} style={{ padding: '8px 14px', backgroundColor: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                            <span className="font-bold chinese-text" style={{ fontSize: '16px' }}>{comp.simplified}</span>
                            <span className="text-secondary" style={{ fontSize: '12px', marginLeft: '6px' }}>{comp.pinyin}</span>
                            {comp.english && <span className="text-secondary" style={{ fontSize: '11px', marginLeft: '6px' }}>({comp.english})</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Characters */}
                  {vocab.characters && vocab.characters.length > 0 && vocab.characters[0] && (
                    <div>
                      <h4 className="text-secondary font-bold mb-3" style={{ textTransform: 'uppercase', fontSize: '11px', letterSpacing: '0.1em' }}>Character Breakdown</h4>
                      <div className="flex gap-3 flex-wrap">
                        {vocab.characters.map((c: any, i: number) => (
                          <div key={i} className="flex-col items-center" style={{ padding: '12px 16px', backgroundColor: '#F8FAFC', borderRadius: '10px', border: '1px solid #E2E8F0', minWidth: '90px' }}>
                            <span className="chinese-text font-bold" style={{ fontSize: '28px' }}>{c.character}</span>
                            <span className="text-secondary" style={{ fontSize: '11px', marginTop: '4px' }}>Radical: {c.radical}</span>
                            <span className="text-secondary" style={{ fontSize: '11px' }}>{c.stroke_count} strokes</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Skeleton Loading State */}
                  {vocab._aiLoading && (
                    <div className="animate-pulse" style={{ paddingTop: '16px', borderTop: '1px solid #F1F5F9' }}>
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
                </div>
              )}
            </div>
          );
        })}

        {/* Empty State */}
        {results.length === 0 && !query && !loading && (
          <div className="flex-col items-center text-center py-16 text-secondary">
            <Search size={48} style={{ opacity: 0.2, marginBottom: '16px' }} />
            <p style={{ fontSize: '16px' }}>Start typing to search the dictionary</p>
            <p style={{ fontSize: '13px', marginTop: '4px' }}>Supports Chinese characters, pinyin, and English</p>
          </div>
        )}
        {results.length === 0 && query && !loading && (
          <div className="flex-col items-center text-center py-12 text-secondary">
            <p style={{ fontSize: '16px' }}>No results found for "<strong>{query}</strong>"</p>
            <p style={{ fontSize: '13px', marginTop: '4px' }}>Try a different search term or adjust your HSK filter</p>
          </div>
        )}
      </div>
    </div>
  );
};
