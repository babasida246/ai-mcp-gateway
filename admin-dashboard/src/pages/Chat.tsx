import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../lib/api';
import { 
  MessageSquare, Send, Settings, Trash2, Copy, Check, Bot, User, Loader2, 
  Plus, ChevronLeft, ChevronRight, Edit2, Clock, X 
} from 'lucide-react';

const STORAGE_KEY = 'ai-mcp-chat-history';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  model?: string;
  layer?: string;
  tokens?: {
    input: number;
    output: number;
  };
  latency?: number;
  contextOptimization?: {
    strategy?: string;
    tokens_saved?: number;
    summary_included?: boolean;
    spans_retrieved?: number;
    recent_messages_included?: number;
  } | null;
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
  settings: {
    systemPrompt: string;
    temperature: number;
    maxTokens: number;
    selectedLayer: string;
    selectedModel: string;
  };
}

interface Model {
  id: string;
  provider: string;
  apiModelName: string;
  enabled: boolean;
  priority: number;
}

interface Layer {
  enabled: boolean;
  models: Model[];
  providers: string[];
}

// Helper to load conversations from localStorage
function loadConversations(): Conversation[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed.map((conv: any) => ({
        ...conv,
        createdAt: new Date(conv.createdAt),
        updatedAt: new Date(conv.updatedAt),
        messages: conv.messages.map((m: any) => ({
          ...m,
          timestamp: new Date(m.timestamp),
        })),
      }));
    }
  } catch (err) {
    console.error('Failed to load conversations:', err);
  }
  return [];
}

// Helper to save conversations to localStorage
function saveConversations(conversations: Conversation[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
  } catch (err) {
    console.error('Failed to save conversations:', err);
  }
}

// Generate conversation title from first message
function generateTitle(content: string): string {
  const maxLength = 30;
  const cleaned = content.trim().replace(/\n/g, ' ');
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.substring(0, maxLength) + '...';
}

export default function Chat() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [editingConvId, setEditingConvId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  
  // Settings
  const [showSettings, setShowSettings] = useState(false);
  const [layers, setLayers] = useState<Record<string, Layer>>({});
  const [selectedLayer, setSelectedLayer] = useState<string>('auto');
  const [selectedModel, setSelectedModel] = useState<string>('auto');
  const [systemPrompt, setSystemPrompt] = useState('You are a helpful AI assistant.');
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(4096);
  // Context optimization settings
  const [contextStrategy, setContextStrategy] = useState<'full' | 'last-n' | 'summary+recent' | 'span-retrieval'>('summary+recent');
  const [maxContextTokens, setMaxContextTokens] = useState<number | undefined>(undefined);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load conversations and layers on mount
  useEffect(() => {
    const loadedConversations = loadConversations();
    setConversations(loadedConversations);
    
    // Set last conversation as active
    if (loadedConversations.length > 0) {
      const lastConv = loadedConversations.sort((a, b) => 
        b.updatedAt.getTime() - a.updatedAt.getTime()
      )[0];
      setActiveConversationId(lastConv.id);
      
      // Restore settings from conversation
      setSystemPrompt(lastConv.settings.systemPrompt);
      setTemperature(lastConv.settings.temperature);
      setMaxTokens(lastConv.settings.maxTokens);
      setSelectedLayer(lastConv.settings.selectedLayer);
      setSelectedModel(lastConv.settings.selectedModel);
    }
    
    loadLayers();
  }, []);

  // Save conversations whenever they change
  useEffect(() => {
    if (conversations.length > 0) {
      saveConversations(conversations);
    }
  }, [conversations]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConversationId, conversations]);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 200) + 'px';
    }
  }, [input]);

  // Focus input when conversation changes
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [activeConversationId]);

  const activeConversation = conversations.find(c => c.id === activeConversationId);
  const messages = activeConversation?.messages || [];

  async function loadLayers() {
    try {
      const response = await api.get('/v1/models/layers');
      setLayers(response.data.layers);
    } catch (err) {
      console.error('Failed to load layers:', err);
    }
  }

  // Create a new conversation
  const createNewConversation = useCallback(() => {
    const newConv: Conversation = {
      id: `conv-${Date.now()}`,
      title: 'New Chat',
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      settings: {
        systemPrompt,
        temperature,
        maxTokens,
        selectedLayer,
        selectedModel,
      },
    };
    
    setConversations(prev => [newConv, ...prev]);
    setActiveConversationId(newConv.id);
    setError(null);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [systemPrompt, temperature, maxTokens, selectedLayer, selectedModel]);

  // Update conversation
  const updateConversation = useCallback((convId: string, updates: Partial<Conversation>) => {
    setConversations(prev => prev.map(c => 
      c.id === convId 
        ? { ...c, ...updates, updatedAt: new Date() }
        : c
    ));
  }, []);

  // Delete conversation
  const deleteConversation = useCallback((convId: string) => {
    setConversations(prev => {
      const filtered = prev.filter(c => c.id !== convId);
      if (activeConversationId === convId) {
        setActiveConversationId(filtered.length > 0 ? filtered[0].id : null);
      }
      if (filtered.length === 0) {
        localStorage.removeItem(STORAGE_KEY);
      }
      return filtered;
    });
  }, [activeConversationId]);

  // Select conversation
  const selectConversation = useCallback((conv: Conversation) => {
    setActiveConversationId(conv.id);
    // Restore settings
    setSystemPrompt(conv.settings.systemPrompt);
    setTemperature(conv.settings.temperature);
    setMaxTokens(conv.settings.maxTokens);
    setSelectedLayer(conv.settings.selectedLayer);
    setSelectedModel(conv.settings.selectedModel);
    setError(null);
  }, []);

  // Rename conversation
  const renameConversation = useCallback((convId: string, newTitle: string) => {
    if (newTitle.trim()) {
      updateConversation(convId, { title: newTitle.trim() });
    }
    setEditingConvId(null);
    setEditingTitle('');
  }, [updateConversation]);

  async function sendMessage() {
    if (!input.trim() || isLoading) return;

    const userContent = input.trim();
    setInput('');
    
    // Create conversation if none active
    let currentConvId = activeConversationId;
    if (!currentConvId) {
      const newConv: Conversation = {
        id: `conv-${Date.now()}`,
        title: generateTitle(userContent),
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        settings: {
          systemPrompt,
          temperature,
          maxTokens,
          selectedLayer,
          selectedModel,
        },
      };
      setConversations(prev => [newConv, ...prev]);
      setActiveConversationId(newConv.id);
      currentConvId = newConv.id;
    }

    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: userContent,
      timestamp: new Date(),
    };

    // Add user message to conversation
    setConversations(prev => prev.map(c => 
      c.id === currentConvId 
        ? { 
            ...c, 
            messages: [...c.messages, userMessage],
            title: c.messages.length === 0 ? generateTitle(userContent) : c.title,
            updatedAt: new Date(),
          }
        : c
    ));

    setIsLoading(true);
    setError(null);

    const startTime = Date.now();
    const currentConv = conversations.find(c => c.id === currentConvId);
    const currentMessages = currentConv?.messages || [];

    try {
      // Build request based on settings
      const requestBody: any = {
        messages: [
          { role: 'system', content: systemPrompt },
          ...currentMessages.map(m => ({ role: m.role, content: m.content })),
          { role: 'user', content: userContent },
        ],
        temperature,
        max_tokens: maxTokens,
        // include conversation id for server-side context management
        conversation_id: currentConvId,
        // include context optimization options
        context_strategy: contextStrategy,
        ...(maxContextTokens ? { max_context_tokens: maxContextTokens } : {}),
      };

      // Add layer/model selection if not auto
      if (selectedLayer !== 'auto') {
        requestBody.layer = selectedLayer;
      }
      if (selectedModel !== 'auto') {
        requestBody.model = selectedModel;
      }

      // Use the chat completions endpoint
      const response = await api.post('/v1/chat/completions', requestBody);

      const latency = Date.now() - startTime;

      const assistantMessage: Message = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: response.data.content || response.data.message || response.data.choices?.[0]?.message?.content || 'No response',
        timestamp: new Date(),
        model: response.data.model,
        layer: response.data.layer,
        tokens: response.data.usage ? {
          input: response.data.usage.prompt_tokens || 0,
          output: response.data.usage.completion_tokens || 0,
        } : undefined,
        latency,
        contextOptimization: response.data.context_optimization || null,
      };

      // Add assistant message to conversation
      setConversations(prev => prev.map(c => 
        c.id === currentConvId 
          ? { 
              ...c, 
              messages: [...c.messages, assistantMessage],
              updatedAt: new Date(),
              settings: { systemPrompt, temperature, maxTokens, selectedLayer, selectedModel },
            }
          : c
      ));
    } catch (err: any) {
      setError(err.response?.data?.error || err.response?.data?.message || err.message || 'Failed to send message');
      
      // Add error message
      const errorMessage: Message = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: `Error: ${err.response?.data?.error || err.message}`,
        timestamp: new Date(),
      };
      
      setConversations(prev => prev.map(c => 
        c.id === currentConvId 
          ? { ...c, messages: [...c.messages, errorMessage], updatedAt: new Date() }
          : c
      ));
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function clearChat() {
    if (activeConversationId) {
      updateConversation(activeConversationId, { messages: [] });
    }
    setError(null);
  }

  async function copyToClipboard(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }

  function getAvailableModels(): Model[] {
    if (selectedLayer === 'auto') {
      // Return all enabled models from all layers
      return Object.values(layers)
        .flatMap(layer => layer.models)
        .filter(model => model.enabled);
    }
    return layers[selectedLayer]?.models.filter(m => m.enabled) || [];
  }

  function formatLatency(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  function formatDate(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return date.toLocaleDateString();
  }

  // Group conversations by date
  const groupedConversations = conversations.reduce((acc, conv) => {
    const dateKey = formatDate(conv.updatedAt);
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(conv);
    return acc;
  }, {} as Record<string, Conversation[]>);

  return (
    <div className="flex h-[calc(100vh-120px)]">
      {/* Sidebar - Conversation History */}
      <div className={`${sidebarCollapsed ? 'w-0' : 'w-72'} transition-all duration-300 overflow-hidden bg-slate-900 border-r border-slate-700 flex flex-col`}>
        {/* New Chat Button */}
        <div className="p-3 border-b border-slate-700">
          <button
            onClick={createNewConversation}
            className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-medium transition-colors"
          >
            <Plus className="w-5 h-5" />
            New Chat
          </button>
        </div>

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto py-2">
          {Object.entries(groupedConversations).map(([dateKey, convs]) => (
            <div key={dateKey}>
              <div className="px-4 py-2 text-xs text-slate-500 font-medium flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {dateKey}
              </div>
              {convs.map(conv => (
                <div
                  key={conv.id}
                  onClick={() => selectConversation(conv)}
                  className={`mx-2 px-3 py-2 rounded-lg cursor-pointer group flex items-center justify-between ${
                    activeConversationId === conv.id 
                      ? 'bg-slate-700 text-white' 
                      : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  {editingConvId === conv.id ? (
                    <input
                      type="text"
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onBlur={() => renameConversation(conv.id, editingTitle)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') renameConversation(conv.id, editingTitle);
                        if (e.key === 'Escape') { setEditingConvId(null); setEditingTitle(''); }
                      }}
                      onClick={(e) => e.stopPropagation()}
                      autoFocus
                      className="flex-1 bg-slate-600 px-2 py-1 rounded text-sm text-white"
                    />
                  ) : (
                    <>
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <MessageSquare className="w-4 h-4 flex-shrink-0" />
                        <span className="truncate text-sm">{conv.title}</span>
                      </div>
                      <div className="hidden group-hover:flex items-center gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingConvId(conv.id);
                            setEditingTitle(conv.title);
                          }}
                          className="p-1 hover:bg-slate-600 rounded"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteConversation(conv.id);
                          }}
                          className="p-1 hover:bg-red-600 rounded"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          ))}
          
          {conversations.length === 0 && (
            <div className="px-4 py-8 text-center text-slate-500 text-sm">
              No conversations yet.<br />Start a new chat!
            </div>
          )}
        </div>
      </div>

      {/* Sidebar Toggle */}
      <button
        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        className="absolute left-0 top-1/2 -translate-y-1/2 z-10 p-1 bg-slate-700 hover:bg-slate-600 rounded-r-lg text-slate-400"
        style={{ marginLeft: sidebarCollapsed ? 0 : '18rem' }}
      >
        {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <MessageSquare className="w-6 h-6" />
            {activeConversation?.title || 'AI Chat'}
          </h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`btn-secondary flex items-center gap-2 ${showSettings ? 'bg-blue-600' : ''}`}
            >
              <Settings className="w-4 h-4" />
              Settings
            </button>
            {activeConversation && (
              <button
                onClick={clearChat}
                className="btn-secondary flex items-center gap-2 text-red-400 hover:text-red-300"
              >
                <Trash2 className="w-4 h-4" />
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Settings Panel */}
        {showSettings && (
          <div className="bg-slate-800 p-4 space-y-4 border-b border-slate-700">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Layer Selection */}
              <div>
                <label className="block text-sm text-slate-400 mb-1">Layer</label>
                <select
                  value={selectedLayer}
                  onChange={(e) => {
                    setSelectedLayer(e.target.value);
                    setSelectedModel('auto');
                  }}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                >
                  <option value="auto">Auto (Router decides)</option>
                  {Object.entries(layers).map(([name, layer]) => (
                    <option key={name} value={name} disabled={!layer.enabled}>
                      {name} {!layer.enabled && '(Disabled)'}
                    </option>
                  ))}
                </select>
              </div>

              {/* Model Selection */}
              <div>
                <label className="block text-sm text-slate-400 mb-1">Model</label>
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                >
                  <option value="auto">Auto (Best available)</option>
                  {getAvailableModels().map(model => (
                    <option key={model.id} value={model.apiModelName}>
                      {model.apiModelName} ({model.provider})
                    </option>
                  ))}
                </select>
              </div>

              {/* Temperature */}
              <div>
                <label className="block text-sm text-slate-400 mb-1">Temperature: {temperature}</label>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value))}
                  className="w-full"
                />
              </div>

              {/* Max Tokens */}
              <div>
                <label className="block text-sm text-slate-400 mb-1">Max Tokens: {maxTokens}</label>
                <input
                  type="range"
                  min="256"
                  max="16384"
                  step="256"
                  value={maxTokens}
                  onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                  className="w-full"
                />
              </div>

              {/* Context Strategy */}
              <div>
                <label className="block text-sm text-slate-400 mb-1">Context Strategy</label>
                <select
                  value={contextStrategy}
                  onChange={(e) => setContextStrategy(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                >
                  <option value="summary+recent">Summary + Recent (default)</option>
                  <option value="span-retrieval">Span Retrieval (semantic)</option>
                  <option value="last-n">Last N messages</option>
                  <option value="full">Full (no optimization)</option>
                </select>
              </div>

              {/* Max Context Tokens */}
              <div>
                <label className="block text-sm text-slate-400 mb-1">Max Context Tokens</label>
                <input
                  type="number"
                  min={256}
                  max={200000}
                  step={256}
                  placeholder="Auto"
                  value={maxContextTokens ?? ''}
                  onChange={(e) => setMaxContextTokens(e.target.value ? parseInt(e.target.value) : undefined)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                />
              </div>
            </div>

            {/* System Prompt */}
            <div>
              <label className="block text-sm text-slate-400 mb-1">System Prompt</label>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white resize-none"
              />
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="mx-4 mt-4 p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-300">
            {error}
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500">
              <Bot className="w-16 h-16 mb-4 opacity-50" />
              <p className="text-xl font-medium">How can I help you today?</p>
              <p className="text-sm mt-2">Start typing to begin a conversation</p>
            </div>
          ) : (
            messages.map(message => (
              <div
                key={message.id}
                className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {message.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-5 h-5 text-white" />
                  </div>
                )}

                <div className={`max-w-[80%] ${message.role === 'user' ? 'order-first' : ''}`}>
                  <div
                    className={`rounded-lg p-3 ${
                      message.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-700 text-slate-100'
                    }`}
                  >
                    <pre className="whitespace-pre-wrap font-sans text-sm">{message.content}</pre>
                  </div>
                  
                  <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                    <span>{new Date(message.timestamp).toLocaleTimeString()}</span>
                    {message.model && <span>• {message.model}</span>}
                    {message.layer && <span>• {message.layer}</span>}
                    {message.latency && <span>• {formatLatency(message.latency)}</span>}
                    {message.tokens && (
                      <span>• {message.tokens.input + message.tokens.output} tokens</span>
                    )}
                    {message.contextOptimization && (
                      <span className="ml-2">• Context: {message.contextOptimization.tokens_saved ?? 0} saved • spans: {message.contextOptimization.spans_retrieved ?? 0}</span>
                    )}
                    <button
                      onClick={() => copyToClipboard(message.content, message.id)}
                      className="ml-auto hover:text-slate-300"
                    >
                      {copiedId === message.id ? (
                        <Check className="w-3 h-3 text-green-400" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                </div>

                {message.role === 'user' && (
                  <div className="w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center flex-shrink-0">
                    <User className="w-5 h-5 text-white" />
                  </div>
                )}
              </div>
            ))
          )}
          
          {/* Loading indicator */}
          {isLoading && (
            <div className="flex gap-3 justify-start">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div className="bg-slate-700 rounded-lg p-3 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                <span className="text-slate-400">Thinking...</span>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="border-t border-slate-700 p-4">
          <div className="flex gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your message... (Enter to send, Shift+Enter for new line)"
              disabled={isLoading}
              rows={1}
              className="flex-1 px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white resize-none focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={sendMessage}
              disabled={isLoading || !input.trim()}
              className="px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed rounded-lg text-white transition-colors"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </div>
          
          {/* Quick actions */}
          <div className="flex items-center gap-2 mt-2 text-xs text-slate-500">
            <span>Quick:</span>
            <button
              onClick={() => setInput('Explain this code: ')}
              className="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded"
            >
              Explain code
            </button>
            <button
              onClick={() => setInput('Write a function that ')}
              className="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded"
            >
              Write function
            </button>
            <button
              onClick={() => setInput('Debug this error: ')}
              className="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded"
            >
              Debug error
            </button>
            <button
              onClick={() => setInput('Summarize: ')}
              className="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded"
            >
              Summarize
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
