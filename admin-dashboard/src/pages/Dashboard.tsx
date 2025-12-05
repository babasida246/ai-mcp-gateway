import { useEffect, useState } from 'react';
import { Activity, DollarSign, Zap, TrendingUp } from 'lucide-react';
import api from '../lib/api';

interface Stats {
  requests: { total: number; averageDuration: number };
  llm: {
    totalCalls: number;
    tokens: { input: number; output: number; total: number };
    cost: { total: number; currency: string };
  };
}

interface Health {
  status: string;
  redis: boolean;
  database: boolean;
  healthyProviders: string[];
  layers: Record<string, { enabled: boolean; models: string[] }>;
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, []);

  async function loadData() {
    try {
      const [statsRes, healthRes] = await Promise.all([
        api.get(`/v1/server-stats`),
        api.get(`/health`),
      ]);
      setStats(statsRes.data);
      setHealth(healthRes.data);
      setLoading(false);
    } catch (err) {
      console.error('Failed to load data:', err);
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-white">Dashboard</h1>

      {/* System Status */}
      <div className="flex items-center gap-2">
        <span className={`badge ${health?.status === 'ok' ? 'badge-success' : 'badge-error'}`}>
          {health?.status === 'ok' ? '● System Healthy' : '● System Error'}
        </span>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-400">Total Requests</p>
              <p className="text-2xl font-bold text-white mt-2">
                {stats?.requests?.total?.toLocaleString() || 0}
              </p>
            </div>
            <Activity className="w-8 h-8 text-blue-500" />
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-400">Total Cost</p>
              <p className="text-2xl font-bold text-white mt-2">
                ${(stats?.llm?.cost?.total || 0).toFixed(4)}
              </p>
            </div>
            <DollarSign className="w-8 h-8 text-green-500" />
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-400">Total Tokens</p>
              <p className="text-2xl font-bold text-white mt-2">
                {stats?.llm?.tokens?.total?.toLocaleString() || 0}
              </p>
            </div>
            <Zap className="w-8 h-8 text-yellow-500" />
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-400">Avg Latency</p>
              <p className="text-2xl font-bold text-white mt-2">
                {stats?.requests?.averageDuration?.toFixed(0) || 0}ms
              </p>
            </div>
            <TrendingUp className="w-8 h-8 text-purple-500" />
          </div>
        </div>
      </div>

      {/* Layers Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-6">
          <h2 className="text-xl font-bold text-white mb-4">Layer Status</h2>
          <div className="space-y-3">
            {health?.layers && Object.entries(health.layers).map(([name, info]) => (
              <div key={name} className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg">
                <div>
                  <span className="font-semibold text-white">{name}</span>
                  <span className="text-sm text-slate-400 ml-2">
                    {info.models.length} model(s)
                  </span>
                </div>
                <span className={`badge ${info.enabled ? 'badge-success' : 'badge-error'}`}>
                  {info.enabled ? '● Enabled' : '○ Disabled'}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-6">
          <h2 className="text-xl font-bold text-white mb-4">Service Status</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg">
              <span className="text-white">Database</span>
              <span className={health?.database ? 'text-green-400' : 'text-red-400'}>
                {health?.database ? '✓ Connected' : '✗ Disconnected'}
              </span>
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg">
              <span className="text-white">Redis</span>
              <span className={health?.redis ? 'text-green-400' : 'text-red-400'}>
                {health?.redis ? '✓ Connected' : '✗ Disconnected'}
              </span>
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg">
              <span className="text-white">Providers</span>
              <span className="text-green-400">
                {health?.healthyProviders?.length || 0} Active
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

