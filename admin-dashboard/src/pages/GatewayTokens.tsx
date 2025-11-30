import { useEffect, useState } from 'react';
import { Key, Plus, Trash2, Copy, Clock, Activity, CheckCircle, Terminal, Settings, Users } from 'lucide-react';
import axios from 'axios';

interface Token {
  id: string;
  name: string;
  token: string;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  requestCount: number;
  status: 'active' | 'expired' | 'revoked';
}

export default function GatewayTokens() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewTokenModal, setShowNewTokenModal] = useState(false);
  const [newTokenForm, setNewTokenForm] = useState({
    name: '',
    expiresInDays: 90,
  });
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadTokens();
  }, []);

  const loadTokens = async () => {
    setLoading(true);
    try {
      const response = await axios.get('http://localhost:3000/admin/gateway-tokens');
      setTokens(response.data.tokens || []);
    } catch (error) {
      console.error('Failed to load tokens:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateToken = async () => {
    if (!newTokenForm.name.trim()) {
      alert('Please enter a token name');
      return;
    }

    try {
      const response = await axios.post('http://localhost:3000/admin/gateway-tokens', {
        name: newTokenForm.name,
        expiryDays: newTokenForm.expiresInDays || null,
      });

      setGeneratedToken(response.data.token.token);

      // Reload tokens list
      await loadTokens();
    } catch (error) {
      console.error('Failed to generate token:', error);
      alert('Failed to generate token. See console for details.');
    }
  };

  const handleRevokeToken = async (tokenId: string) => {
    if (!confirm('Are you sure you want to revoke this token? This action cannot be undone.')) {
      return;
    }

    try {
      await axios.post(`http://localhost:3000/admin/gateway-tokens/${tokenId}/revoke`);
      await loadTokens();
      alert('Token revoked successfully');
    } catch (error) {
      console.error('Failed to revoke token:', error);
      alert('Failed to revoke token. See console for details.');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const closeModal = () => {
    setShowNewTokenModal(false);
    setGeneratedToken(null);
    setNewTokenForm({ name: '', expiresInDays: 90 });
  };

  const getStatusBadge = (status: Token['status']) => {
    switch (status) {
      case 'active':
        return <span className="badge-success flex items-center gap-1"><CheckCircle className="w-3 h-3" />Active</span>;
      case 'expired':
        return <span className="badge-warning flex items-center gap-1"><Clock className="w-3 h-3" />Expired</span>;
      case 'revoked':
        return <span className="badge-error flex items-center gap-1"><Trash2 className="w-3 h-3" />Revoked</span>;
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never expires';
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (loading) return <div className="text-white">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-white">Gateway API Tokens</h1>
        <button onClick={() => setShowNewTokenModal(true)}
          className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Generate New Token
        </button>
      </div>

      {/* Token Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm">Total Tokens</p>
              <p className="text-3xl font-bold text-white mt-1">{tokens.length}</p>
            </div>
            <Key className="w-12 h-12 text-blue-400" />
          </div>
        </div>
        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm">Active Tokens</p>
              <p className="text-3xl font-bold text-white mt-1">
                {tokens.filter((t) => t.status === 'active').length}
              </p>
            </div>
            <CheckCircle className="w-12 h-12 text-green-400" />
          </div>
        </div>
        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm">Total Requests</p>
              <p className="text-3xl font-bold text-white mt-1">
                {tokens.reduce((sum, t) => sum + t.requestCount, 0).toLocaleString()}
              </p>
            </div>
            <Activity className="w-12 h-12 text-purple-400" />
          </div>
        </div>
      </div>

      {/* Token List */}
      <div className="card p-6">
        <h2 className="text-xl font-bold text-white mb-4">Active Tokens</h2>
        <div className="space-y-4">
          {tokens.map((token) => (
            <div key={token.id} className="p-4 bg-slate-700/50 rounded-lg">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold text-white">{token.name}</h3>
                    {getStatusBadge(token.status)}
                  </div>
                  <div className="space-y-1 text-sm">
                    <div className="flex items-center gap-2">
                      <code className="text-slate-300 bg-slate-800 px-2 py-1 rounded font-mono">
                        {token.token}
                      </code>
                      <button onClick={() => copyToClipboard(token.token)}
                        className="text-blue-400 hover:text-blue-300">
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-2 text-slate-400 mt-3">
                      <div>
                        <span className="font-semibold">Created:</span> {formatDate(token.createdAt)}
                      </div>
                      <div>
                        <span className="font-semibold">Expires:</span> {formatDate(token.expiresAt)}
                      </div>
                      <div>
                        <span className="font-semibold">Last Used:</span> {formatDate(token.lastUsedAt)}
                      </div>
                      <div>
                        <span className="font-semibold">Requests:</span> {token.requestCount.toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
                {token.status === 'active' && (
                  <button onClick={() => handleRevokeToken(token.id)}
                    className="btn-danger flex items-center gap-2 ml-4">
                    <Trash2 className="w-4 h-4" />
                    Revoke
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* New Token Modal */}
      {showNewTokenModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-2xl font-bold text-white mb-4">Generate New Token</h2>

            {generatedToken ? (
              <div className="space-y-4">
                <div className="bg-green-900/20 border border-green-500 rounded p-4">
                  <p className="text-green-400 font-semibold mb-2">Token generated successfully!</p>
                  <p className="text-sm text-slate-300 mb-3">
                    Make sure to copy your token now. You won't be able to see it again!
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-sm text-white bg-slate-900 p-3 rounded font-mono break-all">
                      {generatedToken}
                    </code>
                    <button onClick={() => copyToClipboard(generatedToken)}
                      className="btn-primary flex items-center gap-2">
                      <Copy className="w-4 h-4" />
                      Copy
                    </button>
                  </div>
                </div>
                <button onClick={() => {
                  setGeneratedToken(null);
                  setShowNewTokenModal(false);
                }}
                  className="btn-primary w-full">
                  Done
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-white font-semibold mb-2">Token Name</label>
                  <input type="text" value={newTokenForm.name}
                    onChange={(e) => setNewTokenForm({ ...newTokenForm, name: e.target.value })}
                    placeholder="e.g., Production API"
                    className="input w-full" />
                </div>
                <div>
                  <label className="block text-white font-semibold mb-2">Expires In (Days)</label>
                  <input type="number" value={newTokenForm.expiresInDays}
                    onChange={(e) => setNewTokenForm({ ...newTokenForm, expiresInDays: parseInt(e.target.value) })}
                    className="input w-full" />
                  <p className="text-sm text-slate-400 mt-1">Set to 0 for no expiration</p>
                </div>
                <div className="flex gap-3">
                  <button onClick={handleGenerateToken}
                    className="btn-primary flex-1">
                    Generate Token
                  </button>
                  <button onClick={() => setShowNewTokenModal(false)}
                    className="btn-secondary flex-1">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}