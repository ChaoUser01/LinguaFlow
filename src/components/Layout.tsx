import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Library, 
  BookOpen, 
  MessageSquareQuote,
  MessageCircle,
  LogOut,
  Settings,
  Menu
} from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { useDataStore } from '../store/useDataStore';

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/dictionary', icon: BookOpen, label: 'Dictionary' },
  { path: '/flashcards', icon: Library, label: 'Flashcards' },
  { path: '/stories', icon: MessageSquareQuote, label: 'Stories' },
  { path: '/ai-tutor', icon: MessageCircle, label: 'AI Tutor' },
  { path: '/settings', icon: Settings, label: 'Settings' },
];

export const Layout: React.FC = () => {
  const { signOut } = useAuthStore();
  const { profile } = useDataStore();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  const studyMins = profile?.study_time_minutes || 0;
  const goalMins = profile?.daily_goal_minutes || 60;
  const percent = Math.min(100, Math.round((studyMins / goalMins) * 100));

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-gray-50/50 text-slate-800">
      {/* Mobile Nav Toggle */}
      <div className="md:hidden fixed top-4 left-4 z-50">
        <button 
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 bg-white rounded-lg shadow-sm border border-slate-200 text-slate-600"
        >
          <Menu size={20} />
        </button>
      </div>

      {/* Sidebar */}
      <aside className={`
        fixed md:static inset-y-0 left-0 z-40
        w-64 bg-slate-50/50 border-r border-slate-200
        flex flex-col
        transition-transform duration-300 ease-in-out
        ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="p-8 flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 text-white flex items-center justify-center rounded-xl font-bold text-lg tracking-widest shadow-sm font-chinese">
            汉
          </div>
          <span className="text-2xl font-extrabold tracking-tight text-slate-900">LinguaFlow</span>
        </div>

        <nav className="flex-1 px-4 flex flex-col gap-2">
          {navItems.map((item) => (
            <NavLink 
              key={item.path} 
              to={item.path} 
              onClick={() => setMobileMenuOpen(false)}
              className={({ isActive }) => `
                flex items-center gap-3 px-4 py-3 rounded-2xl
                font-medium text-sm transition-all duration-200
                ${isActive 
                  ? 'bg-indigo-50 text-indigo-700 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.8)] border border-indigo-100 shadow-sm' 
                  : 'text-slate-500 hover:bg-white hover:text-slate-900 border border-transparent hover:shadow-sm'}
              `}
            >
              {({ isActive }) => (
                <>
                  <item.icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                  <span>{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="p-6">
          <div className="bg-slate-900 rounded-3xl p-6 text-white shadow-xl">
            <div className="text-xs font-bold text-slate-400 mb-3 tracking-widest uppercase">Daily Goal</div>
            <div className="flex justify-between items-end mb-3">
              <div className="text-sm font-semibold">
                {studyMins} <span className="text-slate-400 text-xs font-medium">/ {goalMins} min</span>
              </div>
              <div className="text-xs font-bold text-indigo-400">{percent}%</div>
            </div>
            <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-indigo-500 to-indigo-400 rounded-full transition-all duration-500 ease-out" 
                style={{ width: `${percent}%` }}
              ></div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-y-auto bg-slate-50">
        <header className="h-16 flex items-center justify-end px-6 sticky top-0 bg-slate-50/80 backdrop-blur-sm z-30">
          <div className="flex items-center gap-4">
            <button 
              onClick={signOut}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-white rounded-xl transition-all border border-transparent hover:border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-0.5"
              title="Sign Out"
            >
              <LogOut size={20} strokeWidth={2} />
            </button>
          </div>
        </header>

        <div className="p-8 md:p-10 max-w-5xl mx-auto w-full transition-all">
          <Outlet />
        </div>
      </main>

      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-30 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}
    </div>
  );
};
