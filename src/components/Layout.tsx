import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Library, 
  BookOpen, 
  MessageSquareQuote,
  MessageCircle,
  LogOut,
  User,
  Settings
} from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { useDataStore } from '../store/useDataStore';
import './Layout.css';

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

  const studyMins = profile?.study_time_minutes || 0;
  const goalMins = 60; // Hardcoded goal for now
  const percent = Math.min(100, Math.round((studyMins / goalMins) * 100));

  return (
    <div className="layout-container">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="logo-box">汉</div>
          <span className="logo-text">LinguaFlow</span>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <NavLink 
              key={item.path} 
              to={item.path} 
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <item.icon size={20} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="daily-goal-card">
            <div className="goal-title">Daily Goal</div>
            <div className="goal-stats">
              <div className="goal-time">{studyMins} <span>/ {goalMins} min</span></div>
              <div className="goal-percent">{percent}%</div>
            </div>
            <div className="progress-bar-bg">
              <div className="progress-bar-fill" style={{ width: `${percent}%` }}></div>
            </div>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header style={{ height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '0 24px', borderBottom: '1px solid var(--color-border)' }}>
          <div className="flex items-center gap-4">
            <button 
              onClick={signOut}
              className="btn" 
              style={{ padding: '8px', backgroundColor: 'transparent', color: 'var(--color-text-secondary)' }}
              title="Sign Out"
            >
              <LogOut size={20} />
            </button>
          </div>
        </header>

        <div className="page-content">
          <Outlet />
        </div>
      </main>
    </div>
  );
};
