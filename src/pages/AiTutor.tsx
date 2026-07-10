import React, { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { useDataStore } from '../store/useDataStore';
import { Send, Loader2, Volume2, User as UserIcon, Bot, Mic } from 'lucide-react';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export const AiTutor: React.FC = () => {
  const { user } = useAuthStore();
  
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user) {
      useDataStore.getState().startStudySession(user.id);
    }
    
    // Add initial greeting
    setMessages([
      { id: '1', role: 'assistant', content: '你好！我是你的中文老师。我们今天聊点什么？(Hello! I am your Chinese teacher. What shall we talk about today?)' }
    ]);
    
    return () => useDataStore.getState().stopStudySession();
  }, [user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const speakText = (text: string) => {
    if (!('speechSynthesis' in window)) return;
    
    // Extract Chinese part if there's English in parentheses
    const chineseText = text.replace(/\(.*\)/g, '').trim();
    
    const utterance = new SpeechSynthesisUtterance(chineseText || text);
    utterance.lang = 'zh-CN';
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  };

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);
    setError('');

    try {
      const apiMessages = messages.concat(userMessage).map(m => ({
        role: m.role,
        content: m.content
      }));

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          messages: apiMessages,
          userLevel: 'HSK 2' // Ideally fetched from profile or dynamically assessed
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to get response');
      }

      const data = await res.json();
      
      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.message
      };
      
      setMessages(prev => [...prev, assistantMessage]);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Error communicating with AI Tutor');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 flex items-center gap-3">
            <Bot size={32} className="text-indigo-600" />
            AI Tutor
          </h1>
          <p className="text-slate-500 font-medium mt-1">Practice conversational Chinese with real-time feedback.</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-rose-50 text-rose-700 rounded-2xl border border-rose-100 font-medium">
          {error}
        </div>
      )}

      <div className="flex-1 bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col relative">
        
        {/* Chat Messages Area */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
          {messages.map((msg) => (
            <div 
              key={msg.id} 
              className={`flex gap-4 max-w-[85%] ${msg.role === 'user' ? 'ml-auto flex-row-reverse' : ''}`}
            >
              <div className={`
                flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center shadow-sm
                ${msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-indigo-600 border border-slate-200'}
              `}>
                {msg.role === 'user' ? <UserIcon size={20} /> : <Bot size={20} />}
              </div>
              
              <div className={`
                px-5 py-4 rounded-3xl shadow-sm relative group text-base
                ${msg.role === 'user' 
                  ? 'bg-indigo-600 text-white rounded-tr-sm' 
                  : 'bg-slate-50 text-slate-900 border border-slate-200 rounded-tl-sm'}
              `}>
                <div className="whitespace-pre-wrap font-chinese leading-relaxed tracking-wide">
                  {msg.content}
                </div>
                
                {msg.role === 'assistant' && (
                  <button
                    onClick={() => speakText(msg.content)}
                    className="absolute -right-12 top-2 p-2 text-slate-400 hover:text-indigo-600 bg-white rounded-full shadow-sm border border-slate-100 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                    title="Listen to response"
                  >
                    <Volume2 size={16} />
                  </button>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex gap-4 max-w-[85%]">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-slate-100 text-indigo-600 border border-slate-200 flex items-center justify-center shadow-sm">
                <Bot size={20} />
              </div>
              <div className="px-5 py-4 rounded-3xl bg-slate-50 border border-slate-200 rounded-tl-sm flex items-center gap-2">
                <Loader2 size={18} className="animate-spin text-indigo-600" />
                <span className="text-sm font-medium text-slate-500">Thinking...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 bg-white border-t border-slate-100">
          <form 
            onSubmit={handleSend}
            className="flex items-center gap-2 bg-slate-50 p-2 rounded-2xl border border-slate-200 focus-within:border-indigo-500 focus-within:ring-4 focus-within:ring-indigo-50 transition-all shadow-sm"
          >
            <button 
              type="button"
              className="p-3 text-slate-400 hover:text-indigo-600 transition-colors"
              title="Voice Input (Coming Soon)"
            >
              <Mic size={20} />
            </button>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your message in Chinese or Pinyin..."
              className="flex-1 bg-transparent border-none focus:outline-none text-slate-900 font-medium px-2"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="p-3 bg-indigo-600 text-white rounded-xl shadow-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <Send size={20} />
            </button>
          </form>
        </div>
        
      </div>
    </div>
  );
};
