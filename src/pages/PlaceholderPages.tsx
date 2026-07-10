import React from 'react';
import { Link } from 'react-router-dom';

export const HSKLibrary: React.FC = () => {
  return (
    <div className="flex flex-col gap-8 animate-fade-in pb-12 mt-8">
      <div>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">HSK Library</h1>
        <p className="text-slate-500 font-medium text-lg mt-2">Browse vocabulary, grammar, and exercises organized by HSK level.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((level) => (
          <Link to={`/hsk/${level}`} key={level} className="bg-white rounded-3xl p-8 shadow-sm border border-slate-200 text-center hover:-translate-y-1 hover:shadow-md transition-all cursor-pointer block">
            <div className="text-3xl font-extrabold text-indigo-600 mb-2">HSK {level}</div>
            <div className="text-sm font-bold tracking-widest uppercase text-slate-400">{level <= 3 ? 'Beginner' : level <= 6 ? 'Intermediate' : 'Advanced'}</div>
          </Link>
        ))}
      </div>
    </div>
  );
};
