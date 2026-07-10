import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { Search, Loader2, Volume2, Bookmark, ChevronDown, ChevronUp, Filter } from 'lucide-react';
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
  return filtered;
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
            meaning_ai: details.meaning || null,
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
    <div className="max-w-4xl mx-auto flex flex-col gap-8 transition-all pb-12">
      {/* Header */}
      <div className="flex flex-col gap-3 text-center py-8">
        <h1 className="text-4xl font-extrabold tracking-tight text-slate-900">Knowledge Base</h1>
        <p className="text-slate-500 font-medium text-lg">
          Search across {hskData.length.toLocaleString()} Chinese words by character, pinyin, or English
        </p>
      </div>

      {/* Search Bar */}
      <form onSubmit={handleSearch} className="flex gap-4">
        <div className="flex-1 relative">
          <Search size={24} className="text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            className="w-full pl-14 pr-4 py-4 rounded-2xl bg-white border border-slate-200 text-slate-900 text-lg shadow-sm focus:outline-none focus:ring-4 focus:ring-indigo-50 focus:border-indigo-500 transition-all"
            placeholder="Search e.g. 'hello', 'ni hao', or '你好'"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button
          type="button"
          className={`flex items-center justify-center px-5 rounded-2xl transition-all border ${
            showFilters
              ? 'bg-indigo-600 text-white border-indigo-600 shadow-md'
              : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
          }`}
          onClick={() => setShowFilters(!showFilters)}
        >
          <Filter size={24} />
        </button>
        <button
          type="submit"
          className="px-8 bg-indigo-600 text-white font-bold rounded-2xl shadow-sm hover:-translate-y-0.5 hover:shadow-md transition-all flex items-center justify-center disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer"
          disabled={loading}
        >
          {loading ? <Loader2 className="animate-spin" size={24} /> : 'Search'}
        </button>
      </form>

      {/* Filters */}
      {showFilters && (
        <div className="flex flex-wrap gap-2 p-4 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-slate-500 font-bold text-xs uppercase tracking-widest flex items-center mr-2">HSK Level:</span>
          <button
            type="button"
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all cursor-pointer ${
              levelFilter === 'ALL'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
            onClick={() => setLevelFilter('ALL')}
          >
            All
          </button>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((lvl) => (
            <button
              key={lvl}
              type="button"
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-all cursor-pointer ${
                levelFilter === lvl
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
              onClick={() => setLevelFilter(lvl)}
            >
              HSK {lvl}
            </button>
          ))}
        </div>
      )}

      {/* Local fallback notice */}
      {useLocalFallback && (
        <div className="p-4 bg-amber-50 rounded-2xl text-amber-800 text-sm font-medium border border-amber-200 shadow-sm flex items-center gap-3">
          <span className="text-amber-500">⚠️</span> Using offline dictionary. Deploy the <code className="bg-amber-100 px-2 py-0.5 rounded text-amber-900">search_dictionary</code> RPC to unlock the full database.
        </div>
      )}

      {/* Results */}
      <div className="flex flex-col gap-6">
        {results.length > 0 && (
          <div className="text-slate-500 text-sm font-bold uppercase tracking-widest px-2">
            {results.length} result{results.length !== 1 ? 's' : ''} found
          </div>
        )}
        {results.map((vocab, idx) => {
          const isExpanded = expandedCard === vocab.vocab_id;
          const cleanMeanings = filterMeanings(vocab.meanings || []);

          return (
            <div
              key={vocab.vocab_id || idx}
              className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col transition-all hover:-translate-y-1 hover:shadow-md"
            >
              {/* Main Row */}
              <div
                className="flex justify-between items-center p-6 md:p-8 cursor-pointer select-none"
                onClick={() => toggleExpand(idx)}
              >
                <div className="flex items-center gap-6 flex-1 min-w-0">
                  <div className="flex-shrink-0 min-w-[120px] flex items-center justify-center">
                    <h2 className={`font-chinese font-extrabold text-indigo-600 leading-none whitespace-nowrap ${vocab.simplified.length > 2 ? 'text-4xl' : 'text-5xl'}`}>
                      {vocab.simplified}
                    </h2>
                  </div>
                  <div className="flex flex-col gap-2 flex-1 min-w-0 pr-4">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-bold text-xl text-slate-800">{vocab.pinyin}</span>
                      {isExpanded && vocab.pos && (
                        <span className="bg-indigo-50 text-indigo-600 px-3 py-1 text-xs font-bold uppercase tracking-widest rounded-lg border border-indigo-100">
                          {vocab.pos}
                        </span>
                      )}
                    </div>
                    <span className="text-slate-500 font-medium text-base leading-relaxed line-clamp-2">
                      {!isExpanded && (cleanMeanings.length > 0 ? cleanMeanings.slice(0, 3).map((d: any) => d.meaning || d).join('; ') : (vocab.meaning_ai || ''))}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="bg-amber-50 text-amber-600 px-3 py-1 text-xs font-bold uppercase tracking-widest rounded-full border border-amber-100">
                    HSK {vocab.hsk_level}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); playAudio(vocab.simplified); }}
                    className="p-2 text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 rounded-xl transition-all cursor-pointer"
                  >
                    <Volume2 size={24} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleSaveWord(vocab.vocab_id); }}
                    className={`p-2 rounded-xl transition-all cursor-pointer ${
                      savedWords.has(vocab.vocab_id)
                        ? 'text-indigo-600 bg-indigo-50'
                        : 'text-slate-400 hover:text-indigo-500 hover:bg-indigo-50'
                    }`}
                  >
                    <Bookmark size={24} fill={savedWords.has(vocab.vocab_id) ? 'currentColor' : 'none'} />
                  </button>
                  <div className="p-2 text-slate-400 bg-slate-50 rounded-xl">
                    {isExpanded ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
                  </div>
                </div>
              </div>

              {/* Expanded Details */}
              {isExpanded && (
                <div className="flex flex-col gap-8 p-6 md:p-8 bg-slate-50 border-t border-slate-100">
                  
                  {/* Meta Bar */}
                  {(vocab.traditional || vocab.frequency_rank) && (
                    <div className="flex gap-6 items-center flex-wrap p-4 bg-white rounded-2xl border border-slate-200 shadow-sm">
                      {vocab.traditional && vocab.traditional !== vocab.simplified && (
                        <div className="flex items-center gap-3">
                          <span className="text-slate-500 text-xs font-bold uppercase tracking-widest">Traditional</span>
                          <span className="font-chinese font-bold text-indigo-600 text-xl">{vocab.traditional}</span>
                        </div>
                      )}
                      {vocab.frequency_rank && (
                        <div className="flex items-center gap-3">
                          <span className="text-slate-500 text-xs font-bold uppercase tracking-widest">Frequency Rank</span>
                          <span className="bg-indigo-50 text-indigo-600 px-3 py-1 text-xs font-bold rounded-lg border border-indigo-100">
                            #{vocab.frequency_rank}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* All Meanings */}
                  {(cleanMeanings.length > 0 || vocab.meaning_ai) && (
                    <div>
                      <h4 className="text-slate-500 font-bold mb-4 text-xs uppercase tracking-widest">Definitions</h4>
                      <ol className={`pl-5 text-lg font-medium text-slate-800 leading-relaxed ${cleanMeanings.length > 5 ? 'columns-1 md:columns-2 gap-8' : ''}`}>
                        {cleanMeanings.length > 0 ? cleanMeanings.map((d: any, i: number) => (
                          <li key={i} className="mb-3 break-inside-avoid marker:text-slate-400">{d.meaning || d}</li>
                        )) : (
                          <li className="mb-3 marker:text-slate-400">
                            {vocab.meaning_ai} 
                            <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest rounded ml-2 align-middle border border-indigo-100">
                              AI Generated
                            </span>
                          </li>
                        )}
                      </ol>
                    </div>
                  )}

                  {/* Example Sentence */}
                  {vocab.sentences && vocab.sentences.length > 0 && vocab.sentences[0] && (
                    <div>
                      <h4 className="text-slate-500 font-bold mb-4 text-xs uppercase tracking-widest">Example Sentence</h4>
                      <div className="bg-white p-6 rounded-2xl border-l-4 border-l-indigo-600 shadow-sm transition-all hover:-translate-y-1 hover:shadow-md">
                        <div className="flex justify-between items-start mb-3">
                          <p className="font-chinese text-xl md:text-2xl text-slate-900 leading-relaxed font-medium">
                            {vocab.sentences[0].chinese}
                          </p>
                          <button 
                            onClick={() => playAudio(vocab.sentences[0].chinese)} 
                            className="text-indigo-600 bg-indigo-50 hover:bg-indigo-100 p-3 rounded-full transition-colors flex-shrink-0 ml-4 cursor-pointer"
                          >
                            <Volume2 size={20} />
                          </button>
                        </div>
                        {vocab.sentences[0].pinyin && (
                          <p className="text-indigo-600 font-bold text-lg mb-2">
                            {vocab.sentences[0].pinyin}
                          </p>
                        )}
                        <p className="text-slate-600 font-medium text-lg">
                          {vocab.sentences[0].english}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Compounds */}
                  {vocab.compounds && vocab.compounds.length > 0 && vocab.compounds[0] && (
                    <div>
                      <h4 className="text-slate-500 font-bold mb-4 text-xs uppercase tracking-widest">Related Compounds</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {vocab.compounds.slice(0, 6).map((comp: any, i: number) => (
                          <div 
                            key={i} 
                            className="flex flex-col p-5 bg-white rounded-2xl border border-slate-200 shadow-sm transition-all hover:-translate-y-1 hover:shadow-md"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-chinese font-bold text-xl text-slate-900">{comp.simplified}</span>
                              <span className="text-slate-500 font-bold">{comp.pinyin}</span>
                            </div>
                            {comp.english && <span className="text-slate-600 text-sm font-medium leading-relaxed line-clamp-2">{comp.english}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Characters */}
                  {vocab.characters && vocab.characters.length > 0 && vocab.characters[0] && (
                    <div>
                      <h4 className="text-slate-500 font-bold mb-4 text-xs uppercase tracking-widest">Character Breakdown</h4>
                      <div className="flex flex-wrap gap-4">
                        {vocab.characters.map((c: any, i: number) => (
                          <div key={i} className="flex items-center gap-5 p-4 pr-6 bg-white rounded-2xl border border-slate-200 shadow-sm">
                            <span className="font-chinese font-extrabold text-indigo-600 text-4xl leading-none">{c.character}</span>
                            <div className="flex flex-col">
                              <span className="text-slate-500 font-bold text-xs uppercase tracking-widest mb-1">Radical: {c.radical}</span>
                              <span className="text-slate-700 font-medium text-sm">{c.stroke_count} strokes</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Skeleton Loading State */}
                  {vocab._aiLoading && (
                    <div className="animate-pulse p-8 bg-white rounded-2xl border border-slate-200 mt-4 flex flex-col gap-6">
                      <div className="flex items-center gap-4">
                        <div className="h-8 w-8 bg-slate-200 rounded-full"></div>
                        <div className="h-4 w-40 bg-slate-200 rounded-lg"></div>
                      </div>
                      <div className="h-16 w-full bg-slate-100 rounded-xl"></div>
                      <div className="flex gap-4">
                        <div className="h-10 w-1/3 bg-slate-100 rounded-xl"></div>
                        <div className="h-10 w-1/3 bg-slate-100 rounded-xl"></div>
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
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <Search size={64} strokeWidth={1} className="mb-6 opacity-50 text-indigo-200" />
            <p className="text-xl font-medium text-slate-500 mb-2">Start typing to search the dictionary</p>
            <p className="text-sm font-bold uppercase tracking-widest">Supports Chinese characters, pinyin, and English</p>
          </div>
        )}
        {results.length === 0 && query && !loading && (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <p className="text-xl font-medium text-slate-500 mb-2">No results found for "<strong className="text-slate-800">{query}</strong>"</p>
            <p className="text-sm font-bold uppercase tracking-widest">Try a different search term or adjust your HSK filter</p>
          </div>
        )}
      </div>
    </div>
  );
};
