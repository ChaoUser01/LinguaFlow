import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Auth } from './pages/Auth';
import { Flashcards } from './pages/Flashcards';
import { HSKLibrary } from './pages/PlaceholderPages';
import { Dictionary } from './pages/Dictionary';
import { StoryGenerator } from './pages/StoryGenerator';
import { Settings } from './pages/Settings';
import { useAuthStore } from './store/useAuthStore';

// A wrapper component to protect routes that require authentication
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, loading } = useAuthStore();
  
  if (loading) {
    return <div style={{ display: 'flex', height: '100vh', justifyContent: 'center', alignItems: 'center' }}>Loading...</div>;
  }
  
  if (!session) {
    return <Navigate to="/auth" replace />;
  }
  
  return <>{children}</>;
};

function App() {
  const { initialize } = useAuthStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/auth" element={<Auth />} />
        
        <Route path="/" element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }>
          <Route index element={<Dashboard />} />
          <Route path="hsk" element={<HSKLibrary />} />
          <Route path="flashcards" element={<Flashcards />} />
          <Route path="dictionary" element={<Dictionary />} />
          <Route path="stories" element={<StoryGenerator />} />
          <Route path="settings" element={<Settings />} />
          <Route path="ai-tutor" element={<div style={{ padding: '24px' }}>AI Tutor placeholder</div>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
