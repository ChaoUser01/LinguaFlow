import React, { useState } from 'react';
import hskData from '../data/hsk.json';

export const HSKLibrary: React.FC = () => {
  return (
    <div className="flex-col gap-6">
      <h1 className="h2">HSK Library</h1>
      <p className="text-secondary">Browse vocabulary, grammar, and exercises organized by HSK level.</p>
      <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 'var(--spacing-4)' }}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((level) => (
          <div key={level} className="card card-hoverable text-center" style={{ cursor: 'pointer' }}>
            <div className="h3 text-primary mb-2">HSK {level}</div>
            <div className="text-small text-secondary">{level <= 3 ? 'Beginner' : level <= 6 ? 'Intermediate' : 'Advanced'}</div>
          </div>
        ))}
      </div>
    </div>
  );
};



export const Dictionary: React.FC = () => {
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState<number | 'ALL'>('ALL');

  const filteredWords = search === '' && levelFilter === 'ALL' ? [] : hskData.map(word => {
    let score = 0;
    const s = search.toLowerCase().trim();
    const sNoSpaces = s.replace(/\s+/g, '');
    
    const pinyinLower = (word.pinyin || '').toLowerCase();
    const pinyinNoTones = pinyinLower.replace(/[0-9]/g, ''); 
    const pinyinNoSpaces = pinyinNoTones.replace(/\s+/g, '');
    
    const meaningLower = (word.meaning || '').toLowerCase();
    const simplified = word.simplified || '';

    // If searching nothing but filtering by level
    if (s === '') {
      score = 50; 
    } else {
      // 1. Exact character match
      if (simplified === s) score += 100;
      else if (simplified.startsWith(s)) score += 80;
      else if (simplified.includes(s)) score += 60;

      // 2. Exact pinyin match (handles "ni hao" and "nihao")
      if (pinyinLower === s || pinyinNoTones === s || pinyinNoSpaces === sNoSpaces) score += 90;
      else if (pinyinNoTones.startsWith(s) || pinyinNoSpaces.startsWith(sNoSpaces)) score += 70;
      else if (pinyinNoSpaces.includes(sNoSpaces)) score += 50;

      // 3. Meaning exact word match
      const wordsInMeaning = meaningLower.split(/[\s;,\/]+/);
      if (wordsInMeaning.includes(s)) score += 65;
      else if (meaningLower.includes(s)) score += 10;
    }

    return { word, score };
  })
  .filter(item => {
    if (item.score <= 0) return false;
    if (levelFilter !== 'ALL' && item.word.hsk_level !== levelFilter) return false;
    return true;
  })
  .sort((a, b) => b.score - a.score || a.word.hsk_level - b.word.hsk_level)
  .map(item => item.word)
  .slice(0, 50);

  return (
    <div className="flex-col gap-6">
      <h1 className="h2">Dictionary</h1>
      
      <div className="flex gap-4">
        <input 
          type="text" 
          className="input" 
          style={{ flex: 1, padding: '16px', fontSize: '16px' }}
          placeholder="Search Chinese, Pinyin, or English (e.g. nihao, 你好, hello)..." 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        
        <select 
          className="input" 
          style={{ width: '150px', padding: '16px', fontSize: '16px', cursor: 'pointer' }}
          value={levelFilter}
          onChange={(e) => setLevelFilter(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))}
        >
          <option value="ALL">All Levels</option>
          <option value={1}>HSK 1</option>
          <option value={2}>HSK 2</option>
          <option value={3}>HSK 3</option>
          <option value={4}>HSK 4</option>
          <option value={5}>HSK 5</option>
          <option value={6}>HSK 6</option>
        </select>
      </div>
      
      <div className="flex-col gap-4">
        {search === '' && levelFilter === 'ALL' ? (
          <div className="card text-center py-8">
            <p className="text-secondary">Start typing or select a level to browse {hskData.length} words.</p>
          </div>
        ) : filteredWords.length > 0 ? (
          filteredWords.map(word => (
            <div key={word.id} className="card flex items-center justify-between">
              <div className="flex items-center gap-6">
                <div className="h1 chinese-text text-brand">{word.simplified}</div>
                <div>
                  <div className="font-medium text-large">{word.pinyin}</div>
                  <div className="text-secondary">{word.meaning}</div>
                </div>
              </div>
              <div className="badge-orange">HSK {word.hsk_level}</div>
            </div>
          ))
        ) : (
          <div className="card text-center py-8">
            <p className="text-secondary">No results found for "{search}"</p>
          </div>
        )}
      </div>
    </div>
  );
};

export const Stories: React.FC = () => {
  return (
    <div className="flex-col gap-6">
      <h1 className="h2">Story Library</h1>
      <p className="text-secondary">Read stories matched to your HSK level to build vocabulary in context.</p>
      <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 'var(--spacing-4)' }}>
        <div className="card card-hoverable">
          <div className="badge badge-primary mb-2">HSK 2</div>
          <h3 className="h4 mb-1">A Trip to Beijing</h3>
          <p className="text-small text-secondary mb-4">Follow Li Ming as he explores the capital city...</p>
          <button className="btn btn-secondary w-full">Read Story</button>
        </div>
        <div className="card card-hoverable">
          <div className="badge badge-success mb-2">HSK 3</div>
          <h3 className="h4 mb-1">The Coffee Shop</h3>
          <p className="text-small text-secondary mb-4">Ordering coffee and meeting friends...</p>
          <button className="btn btn-secondary w-full">Read Story</button>
        </div>
      </div>
    </div>
  );
};
