import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, DollarSign, Zap, Clock, Activity } from 'lucide-react';

interface TimeSeriesData {
  timestamp: string;
  requests: number;
  cost: number;
  avgLatency: number;
}

interface ModelUsage {
  model: string;
  requests: number;
  cost: number;
  avgLatency: number;
}

export default function Analytics() {
  const [timeRange, setTimeRange] = useState<'1h' | '24h' | '7d' | '30d'>('24h');
  const [timeSeriesData, setTimeSeriesData] = useState<TimeSeriesData[]>([]);
  const [modelUsage] = useState<ModelUsage[]>([
    { model: 'openrouter-gpt-4o', requests: 1250, cost: 12.45, avgLatency: 1.2 },
    { model: 'openrouter-claude-sonnet', requests: 890, cost: 18.90, avgLatency: 1.5 },
    { model: 'openrouter-claude-haiku', requests: 2340, cost: 4.68, avgLatency: 0.8 },
    { model: 'openrouter-llama-3.3-70b-free', requests: 3450, cost: 0, avgLatency: 2.1 },
  ]);
  const [metrics] = useState({
    totalRequests: 7930,
    totalCost: 35.03,
    avgLatency: 1.35,
    successRate: 98.5,
    requestsChange: 12.5,
    costChange: -5.2,
    latencyChange: -3.1,
    successRateChange: 0.8,
  });

  useEffect(() => {
    generateTimeSeriesData();
  }, [timeRange]);

  function generateTimeSeriesData() {
    const now = Date.now();
    const intervals = timeRange === '1h' ? 12 : timeRange === '24h' ? 24 : timeRange === '7d' ? 7 : 30;
    const data: TimeSeriesData[] = [];

    for (let i = intervals; i >= 0; i--) {
      const timestamp = new Date(now - i * (timeRange === '1h' ? 5 * 60 * 1000 : timeRange === '24h' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000)).toISOString();
      data.push({
        timestamp,
        requests: Math.floor(Math.random() * 500) + 100,
        cost: Math.random() * 5 + 1,
        avgLatency: Math.random() * 2 + 0.5,
      });
    }

    setTimeSeriesData(data);
  }

  const maxRequests = Math.max(...timeSeriesData.map(d => d.requests));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-white">Analytics</h1>
        <div className="flex items-center gap-2">
          {(['1h', '24h', '7d', '30d'] as const).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-4 py-2 rounded-lg transition-colors ${
                timeRange === range
                  ? 'bg-blue-500 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {range}
            </button>
          ))}
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-blue-500/20 rounded-lg">
              <Activity className="w-6 h-6 text-blue-400" />
            </div>
            <div className={`flex items-center gap-1 text-sm ${metrics.requestsChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {metrics.requestsChange >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              {Math.abs(metrics.requestsChange)}%
            </div>
          </div>
          <div className="text-3xl font-bold text-white mb-1">{metrics.totalRequests.toLocaleString()}</div>
          <div className="text-sm text-slate-400">Total Requests</div>
        </div>

        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-green-500/20 rounded-lg">
              <DollarSign className="w-6 h-6 text-green-400" />
            </div>
            <div className={`flex items-center gap-1 text-sm ${metrics.costChange >= 0 ? 'text-red-400' : 'text-green-400'}`}>
              {metrics.costChange >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              {Math.abs(metrics.costChange)}%
            </div>
          </div>
          <div className="text-3xl font-bold text-white mb-1">${metrics.totalCost.toFixed(2)}</div>
          <div className="text-sm text-slate-400">Total Cost</div>
        </div>

        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-yellow-500/20 rounded-lg">
              <Clock className="w-6 h-6 text-yellow-400" />
            </div>
            <div className={`flex items-center gap-1 text-sm ${metrics.latencyChange >= 0 ? 'text-red-400' : 'text-green-400'}`}>
              {metrics.latencyChange >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              {Math.abs(metrics.latencyChange)}%
            </div>
          </div>
          <div className="text-3xl font-bold text-white mb-1">{metrics.avgLatency.toFixed(2)}s</div>
          <div className="text-sm text-slate-400">Avg Latency</div>
        </div>

        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-purple-500/20 rounded-lg">
              <Zap className="w-6 h-6 text-purple-400" />
            </div>
            <div className={`flex items-center gap-1 text-sm ${metrics.successRateChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {metrics.successRateChange >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              {Math.abs(metrics.successRateChange)}%
            </div>
          </div>
          <div className="text-3xl font-bold text-white mb-1">{metrics.successRate}%</div>
          <div className="text-sm text-slate-400">Success Rate</div>
        </div>
      </div>

      {/* Request Timeline */}
      <div className="card p-6">
        <h2 className="text-xl font-bold text-white mb-6">Request Timeline</h2>
        <div className="space-y-2">
          <div className="flex items-end gap-1 h-64">
            {timeSeriesData.map((data, index) => (
              <div key={index} className="flex-1 flex flex-col justify-end">
                <div
                  className="bg-blue-500 rounded-t hover:bg-blue-400 transition-colors cursor-pointer"
                  style={{ height: `${(data.requests / maxRequests) * 100}%` }}
                  title={`${new Date(data.timestamp).toLocaleString()}\n${data.requests} requests\n$${data.cost.toFixed(2)}\n${data.avgLatency.toFixed(2)}s`}
                />
              </div>
            ))}
          </div>
          <div className="flex justify-between text-xs text-slate-400 mt-2">
            <span>{new Date(timeSeriesData[0]?.timestamp).toLocaleString()}</span>
            <span>{new Date(timeSeriesData[timeSeriesData.length - 1]?.timestamp).toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Model Usage */}
      <div className="card p-6">
        <h2 className="text-xl font-bold text-white mb-6">Model Usage</h2>
        <div className="space-y-4">
          {modelUsage.map((model) => {
            const totalRequests = modelUsage.reduce((sum, m) => sum + m.requests, 0);
            const percentage = (model.requests / totalRequests) * 100;

            return (
              <div key={model.model}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <span className="text-white font-medium">{model.model}</span>
                    <span className="badge badge-info text-xs">{model.requests.toLocaleString()} requests</span>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-slate-400">
                      ${model.cost.toFixed(2)}
                    </span>
                    <span className="text-slate-400">
                      {model.avgLatency.toFixed(2)}s
                    </span>
                  </div>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-2">
                  <div
                    className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full transition-all duration-500"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  {percentage.toFixed(1)}% of total requests
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Cost Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card p-6">
          <h2 className="text-xl font-bold text-white mb-6">Cost by Layer</h2>
          <div className="space-y-3">
            {[
              { layer: 'L0 - Free Tier', cost: 0, percentage: 0 },
              { layer: 'L1 - Low Cost', cost: 4.68, percentage: 13.4 },
              { layer: 'L2 - Balanced', cost: 12.45, percentage: 35.5 },
              { layer: 'L3 - Premium', cost: 18.90, percentage: 54.1 },
            ].map((item) => (
              <div key={item.layer} className="flex items-center justify-between">
                <span className="text-slate-300">{item.layer}</span>
                <div className="flex items-center gap-3">
                  <div className="w-32 bg-slate-700 rounded-full h-2">
                    <div
                      className="bg-green-500 h-2 rounded-full"
                      style={{ width: `${item.percentage}%` }}
                    />
                  </div>
                  <span className="text-white font-medium w-16 text-right">${item.cost.toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-6">
          <h2 className="text-xl font-bold text-white mb-6">Top Errors</h2>
          <div className="space-y-3">
            {[
              { error: 'Rate limit exceeded', count: 45, percentage: 65 },
              { error: 'Timeout', count: 18, percentage: 26 },
              { error: 'Invalid API key', count: 6, percentage: 9 },
            ].map((item) => (
              <div key={item.error} className="flex items-center justify-between">
                <span className="text-slate-300">{item.error}</span>
                <div className="flex items-center gap-3">
                  <div className="w-32 bg-slate-700 rounded-full h-2">
                    <div
                      className="bg-red-500 h-2 rounded-full"
                      style={{ width: `${item.percentage}%` }}
                    />
                  </div>
                  <span className="text-white font-medium w-12 text-right">{item.count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
