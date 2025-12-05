import { useEffect, useState } from 'react';
import { Database, Key, RefreshCw, Search, Info } from 'lucide-react';
import api from '../lib/api';

interface RedisInfo {
  version: string;
  uptime_in_seconds: number;
  connected_clients: number;
  used_memory_human: string;
  total_keys: number;
}

interface RedisKey {
  key: string;
  type: string;
  ttl: number;
}

interface RedisValue {
  key: string;
  type: string;
  ttl: number;
  value: string | string[] | Record<string, string>;
}

export default function Redis() {
  const [info, setInfo] = useState<RedisInfo | null>(null);
  const [keys, setKeys] = useState<RedisKey[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [keyValue, setKeyValue] = useState<RedisValue | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchPattern, setSearchPattern] = useState('*');
  const [currentPattern, setCurrentPattern] = useState('*');

  useEffect(() => {
    loadInfo();
    loadKeys(currentPattern);
  }, []);

  useEffect(() => {
    if (selectedKey) {
      loadKeyValue(selectedKey);
    }
  }, [selectedKey]);

  async function loadInfo() {
    try {
      setLoading(true);
      const res = await api.get(`/v1/redis/info`);
      setInfo(res.data);
      setLoading(false);
    } catch (err) {
      console.error('Failed to load Redis info:', err);
      setLoading(false);
    }
  }

  async function loadKeys(pattern: string) {
    try {
      const res = await api.get(`/v1/redis/keys`, {
        params: { pattern, limit: 100 }
      });
      setKeys(res.data.keys || []);
    } catch (err) {
      console.error('Failed to load keys:', err);
    }
  }

  async function loadKeyValue(key: string) {
    try {
      const res = await api.get(`/v1/redis/key/${encodeURIComponent(key)}`);
      setKeyValue(res.data);
    } catch (err) {
      console.error('Failed to load key value:', err);
    }
  }

  function handleSearch() {
    setCurrentPattern(searchPattern);
    loadKeys(searchPattern);
  }

  function formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${mins}m`;
  }

  function formatTTL(ttl: number): string {
    if (ttl === -1) return 'No expiry';
    if (ttl === -2) return 'Key not found';
    return `${ttl}s`;
  }

  function renderValue(value: RedisValue) {
    if (value.type === 'string') {
      return (
        <pre className="p-4 bg-slate-900 rounded-lg text-slate-300 whitespace-pre-wrap break-all">
          {String(value.value)}
        </pre>
      );
    }

    if (value.type === 'list') {
      const list = value.value as string[];
      return (
        <div className="space-y-2">
          {list.map((item, idx) => (
            <div key={idx} className="flex items-start gap-3 p-3 bg-slate-900 rounded-lg">
              <span className="text-xs text-slate-500 font-mono">{idx}</span>
              <span className="text-slate-300 break-all">{item}</span>
            </div>
          ))}
        </div>
      );
    }

    if (value.type === 'set') {
      const set = value.value as string[];
      return (
        <div className="space-y-2">
          {set.map((item, idx) => (
            <div key={idx} className="p-3 bg-slate-900 rounded-lg text-slate-300 break-all">
              {item}
            </div>
          ))}
        </div>
      );
    }

    if (value.type === 'hash') {
      const hash = value.value as Record<string, string>;
      return (
        <table className="w-full">
          <thead className="bg-slate-900">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">
                Field
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">
                Value
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            {Object.entries(hash).map(([field, val]) => (
              <tr key={field} className="hover:bg-slate-700/50">
                <td className="px-4 py-3 text-sm font-medium text-blue-400">{field}</td>
                <td className="px-4 py-3 text-sm text-slate-300 break-all">{val}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    }

    if (value.type === 'zset') {
      const zset = value.value as string[];
      return (
        <div className="space-y-2">
          {zset.map((item, idx) => (
            <div key={idx} className="p-3 bg-slate-900 rounded-lg text-slate-300 break-all">
              {item}
            </div>
          ))}
        </div>
      );
    }

    return <div className="text-slate-400">Unknown type</div>;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Database className="w-8 h-8 text-red-500" />
          <div>
            <h1 className="text-2xl font-bold text-white">Redis Management</h1>
            <p className="text-sm text-slate-400">Browse and view Redis keys</p>
          </div>
        </div>
        <button
          onClick={() => {
            loadInfo();
            loadKeys(currentPattern);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Redis Info */}
      {info && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Info className="w-4 h-4 text-blue-400" />
              <span className="text-xs text-slate-400 uppercase">Version</span>
            </div>
            <div className="text-2xl font-bold text-white">{info.version}</div>
          </div>
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Info className="w-4 h-4 text-green-400" />
              <span className="text-xs text-slate-400 uppercase">Uptime</span>
            </div>
            <div className="text-2xl font-bold text-white">
              {formatUptime(info.uptime_in_seconds)}
            </div>
          </div>
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Info className="w-4 h-4 text-yellow-400" />
              <span className="text-xs text-slate-400 uppercase">Clients</span>
            </div>
            <div className="text-2xl font-bold text-white">{info.connected_clients}</div>
          </div>
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Info className="w-4 h-4 text-purple-400" />
              <span className="text-xs text-slate-400 uppercase">Memory</span>
            </div>
            <div className="text-2xl font-bold text-white">{info.used_memory_human}</div>
          </div>
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Key className="w-4 h-4 text-red-400" />
              <span className="text-xs text-slate-400 uppercase">Total Keys</span>
            </div>
            <div className="text-2xl font-bold text-white">{info.total_keys}</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Keys List */}
        <div className="lg:col-span-1">
          <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
            <div className="p-4 border-b border-slate-700">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Pattern (e.g. user:*)"
                    value={searchPattern}
                    onChange={(e) => setSearchPattern(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
                <button
                  onClick={handleSearch}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                >
                  Search
                </button>
              </div>
            </div>
            <div className="max-h-[600px] overflow-y-auto">
              {keys.map((keyObj) => (
                <button
                  key={keyObj.key}
                  onClick={() => setSelectedKey(keyObj.key)}
                  className={`w-full flex items-center justify-between p-4 border-b border-slate-700 hover:bg-slate-700 transition-colors ${
                    selectedKey === keyObj.key ? 'bg-slate-700' : ''
                  }`}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Key className="w-4 h-4 text-red-400 flex-shrink-0" />
                    <div className="text-left flex-1 min-w-0">
                      <div className="text-white font-medium truncate">{keyObj.key}</div>
                      <div className="text-xs text-slate-400">
                        {keyObj.type} · TTL: {formatTTL(keyObj.ttl)}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
              {keys.length === 0 && (
                <div className="p-8 text-center text-slate-400">
                  No keys found
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Key Details */}
        <div className="lg:col-span-2">
          {selectedKey && keyValue ? (
            <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
              <div className="p-4 border-b border-slate-700">
                <h2 className="text-lg font-semibold text-white mb-2">{keyValue.key}</h2>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-slate-400">
                    Type: <span className="text-blue-400 font-medium">{keyValue.type}</span>
                  </span>
                  <span className="text-slate-400">
                    TTL: <span className="text-yellow-400 font-medium">{formatTTL(keyValue.ttl)}</span>
                  </span>
                </div>
              </div>
              <div className="p-4 max-h-[600px] overflow-y-auto">
                {renderValue(keyValue)}
              </div>
            </div>
          ) : (
            <div className="bg-slate-800 rounded-lg border border-slate-700 p-12 text-center">
              <Key className="w-12 h-12 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400">Select a key to view its value</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

