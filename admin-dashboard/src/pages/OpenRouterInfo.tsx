import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { 
  Zap, 
  DollarSign, 
  Activity, 
  List,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Clock,
  Pause,
  Play
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

interface Model {
  id: string;
  name: string;
  description?: string;
  context_length?: number;
  pricing?: {
    prompt: string;
    completion: string;
  };
}

interface Limits {
  limit: number;
  usage: number;
  is_free_tier: boolean;
  rate_limit?: {
    requests: number;
    interval: string;
  };
}

interface Credits {
  balance: number;
  limit: number;
  usage: number;
}

interface ActivityItem {
  id: string;
  created_at: string;
  model: string;
  total_cost: number;
  generations: number;
}

interface CachedData<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

// Cache duration: 10 seconds
const CACHE_DURATION = 10 * 1000;

export default function OpenRouterInfo() {
  const [activeTab, setActiveTab] = useState<'models' | 'limits' | 'credits' | 'activity'>('models');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const [models, setModels] = useState<Model[]>([]);
  const [limits, setLimits] = useState<Limits | null>(null);
  const [credits, setCredits] = useState<Credits | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);

  const [searchTerm, setSearchTerm] = useState('');

  // Cache for API responses
  const cacheRef = useRef<{
    models: CachedData<Model[]> | null;
    limits: CachedData<Limits> | null;
    credits: CachedData<Credits> | null;
    activity: CachedData<ActivityItem[]> | null;
  }>({
    models: null,
    limits: null,
    credits: null,
    activity: null
  });

  // Auto-refresh timer
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    loadData();
    
    // Set up auto-refresh if enabled
    if (autoRefresh) {
      startAutoRefresh();
    }

    // Cleanup timer on unmount
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [activeTab, autoRefresh]);

  function startAutoRefresh() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    
    timerRef.current = window.setInterval(() => {
      loadData();
    }, 10000); // 10 seconds
  }

  function stopAutoRefresh() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function toggleAutoRefresh() {
    setAutoRefresh(!autoRefresh);
    if (!autoRefresh) {
      startAutoRefresh();
    } else {
      stopAutoRefresh();
    }
  }

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      switch (activeTab) {
        case 'models':
          await loadModels();
          break;
        case 'limits':
          await loadLimits();
          break;
        case 'credits':
          await loadCredits();
          break;
        case 'activity':
          await loadActivity();
          break;
      }
      setLastUpdate(new Date());
    } catch (err: any) {
      setError(err.response?.data?.error?.message || err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }

  function isDataFresh<T>(cached: CachedData<T> | null): boolean {
    if (!cached) return false;
    return Date.now() < cached.expiresAt;
  }

  async function loadModels() {
    const cached = cacheRef.current.models;
    
    if (cached && isDataFresh(cached)) {
      setModels(cached.data);
      return;
    }

    const response = await axios.get(`${API_BASE}/v1/openrouter/models`);
    const data = response.data.models || [];
    
    // Cache the response
    cacheRef.current.models = {
      data,
      timestamp: Date.now(),
      expiresAt: Date.now() + CACHE_DURATION
    };
    
    setModels(data);
  }

  async function loadLimits() {
    const cached = cacheRef.current.limits;
    
    if (cached && isDataFresh(cached)) {
      setLimits(cached.data);
      return;
    }

    const response = await axios.get(`${API_BASE}/v1/openrouter/limits`);
    const data = response.data.limits || null;
    
    // Cache the response
    cacheRef.current.limits = {
      data,
      timestamp: Date.now(),
      expiresAt: Date.now() + CACHE_DURATION
    };
    
    setLimits(data);
  }

  async function loadCredits() {
    const cached = cacheRef.current.credits;
    
    if (cached && isDataFresh(cached)) {
      setCredits(cached.data);
      return;
    }

    const response = await axios.get(`${API_BASE}/v1/openrouter/credits`);
    const data = response.data.credits || null;
    
    // Cache the response
    cacheRef.current.credits = {
      data,
      timestamp: Date.now(),
      expiresAt: Date.now() + CACHE_DURATION
    };
    
    setCredits(data);
  }

  async function loadActivity() {
    const cached = cacheRef.current.activity;
    
    if (cached && isDataFresh(cached)) {
      setActivity(cached.data);
      return;
    }

    const response = await axios.get(`${API_BASE}/v1/openrouter/activity`);
    const data = response.data.activity || [];
    
    // Cache the response
    cacheRef.current.activity = {
      data,
      timestamp: Date.now(),
      expiresAt: Date.now() + CACHE_DURATION
    };
    
    setActivity(data);
  }

  const filteredModels = models.filter(m => 
    m.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-white">OpenRouter Info</h1>
        <div className="flex items-center gap-3">
          {lastUpdate && (
            <div className="text-xs text-slate-400 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Last updated: {lastUpdate.toLocaleTimeString()}
            </div>
          )}
          <button
            onClick={toggleAutoRefresh}
            className={`btn-secondary flex items-center gap-2 ${autoRefresh ? 'text-green-400' : 'text-slate-400'}`}
            title={autoRefresh ? 'Auto-refresh enabled (10s)' : 'Auto-refresh disabled'}
          >
            {autoRefresh ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {autoRefresh ? 'Auto' : 'Manual'}
          </button>
          <button
            onClick={loadData}
            className="btn-secondary flex items-center gap-2"
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="card p-4 border-red-500/50 bg-red-500/10">
          <div className="flex items-center gap-2 text-red-400">
            <AlertCircle className="w-5 h-5" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Cache Status */}
      {autoRefresh && (
        <div className="card p-3 border-blue-500/30 bg-blue-500/10">
          <div className="flex items-center gap-2 text-blue-400 text-sm">
            <CheckCircle className="w-4 h-4" />
            <span>Auto-refresh enabled (10 second intervals) • Data cached for performance</span>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-700">
        <button
          onClick={() => setActiveTab('models')}
          className={`px-4 py-2 font-semibold ${
            activeTab === 'models'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <div className="flex items-center gap-2">
            <List className="w-4 h-4" />
            Models
          </div>
        </button>
        <button
          onClick={() => setActiveTab('limits')}
          className={`px-4 py-2 font-semibold ${
            activeTab === 'limits'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4" />
            Limits
          </div>
        </button>
        <button
          onClick={() => setActiveTab('credits')}
          className={`px-4 py-2 font-semibold ${
            activeTab === 'credits'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4" />
            Credits
          </div>
        </button>
        <button
          onClick={() => setActiveTab('activity')}
          className={`px-4 py-2 font-semibold ${
            activeTab === 'activity'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Activity
          </div>
        </button>
      </div>

      {/* Content */}
      {loading && (
        <div className="card p-12 text-center">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-400 mx-auto mb-4" />
          <p className="text-slate-400">Loading...</p>
        </div>
      )}

      {!loading && activeTab === 'models' && (
        <div className="space-y-4">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search models..."
            className="input w-full"
          />
          
          <div className="card p-4">
            <p className="text-sm text-slate-400 mb-4">
              Found {filteredModels.length} models
            </p>
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {filteredModels.map((model) => (
                <div key={model.id} className="p-3 bg-slate-800/50 rounded border border-slate-700 hover:border-blue-500/50">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-white">{model.name || model.id}</h3>
                      <p className="text-xs text-slate-400 font-mono mt-1">{model.id}</p>
                      {model.description && (
                        <p className="text-sm text-slate-300 mt-2 line-clamp-2">{model.description}</p>
                      )}
                    </div>
                    {model.pricing && (
                      <div className="text-right ml-4">
                        <p className="text-xs text-slate-400">Pricing</p>
                        <p className="text-xs text-green-400">Prompt: ${model.pricing.prompt}</p>
                        <p className="text-xs text-yellow-400">Completion: ${model.pricing.completion}</p>
                      </div>
                    )}
                  </div>
                  {model.context_length && (
                    <div className="mt-2 text-xs text-slate-400">
                      Context: {model.context_length.toLocaleString()} tokens
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {!loading && activeTab === 'limits' && limits && (
        <div className="card p-6">
          <h2 className="text-xl font-bold text-white mb-4">API Key Limits</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded">
              <span className="text-slate-400">Tier</span>
              <span className={`font-semibold ${limits.is_free_tier ? 'text-yellow-400' : 'text-green-400'}`}>
                {limits.is_free_tier ? 'Free' : 'Paid'}
              </span>
            </div>
            <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded">
              <span className="text-slate-400">Usage</span>
              <span className="text-white font-semibold">{limits.usage.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded">
              <span className="text-slate-400">Limit</span>
              <span className="text-white font-semibold">{limits.limit.toLocaleString()}</span>
            </div>
            {limits.rate_limit && (
              <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded">
                <span className="text-slate-400">Rate Limit</span>
                <span className="text-white font-semibold">
                  {limits.rate_limit.requests} requests / {limits.rate_limit.interval}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {!loading && activeTab === 'credits' && credits && (
        <div className="card p-6">
          <h2 className="text-xl font-bold text-white mb-4">Credits</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded">
              <span className="text-slate-400">Balance</span>
              <span className="text-green-400 font-semibold text-xl">${credits.balance.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded">
              <span className="text-slate-400">Usage</span>
              <span className="text-red-400 font-semibold">${credits.usage.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded">
              <span className="text-slate-400">Limit</span>
              <span className="text-white font-semibold">${credits.limit.toFixed(2)}</span>
            </div>
            <div className="mt-4">
              <div className="w-full bg-slate-700 rounded-full h-3">
                <div
                  className="bg-gradient-to-r from-green-500 to-blue-500 h-3 rounded-full"
                  style={{ width: `${Math.min((credits.usage / credits.limit) * 100, 100)}%` }}
                />
              </div>
              <p className="text-xs text-slate-400 mt-2 text-center">
                {((credits.usage / credits.limit) * 100).toFixed(1)}% used
              </p>
            </div>
          </div>
        </div>
      )}

      {!loading && activeTab === 'activity' && (
        <div className="card p-6">
          <h2 className="text-xl font-bold text-white mb-4">Recent Activity</h2>
          {activity.length === 0 ? (
            <p className="text-slate-400 text-center py-8">No activity yet</p>
          ) : (
            <div className="space-y-2">
              {activity.map((item) => (
                <div key={item.id} className="p-3 bg-slate-800/50 rounded border border-slate-700">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white font-semibold">{item.model}</p>
                      <p className="text-xs text-slate-400 flex items-center gap-1 mt-1">
                        <Clock className="w-3 h-3" />
                        {new Date(item.created_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-green-400 font-semibold">${item.total_cost.toFixed(4)}</p>
                      <p className="text-xs text-slate-400">{item.generations} generations</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
