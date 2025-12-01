import { useState } from 'react';
import { Plus, Copy, Trash2, Eye, EyeOff } from 'lucide-react';

interface Token {
  id: string;
  name: string;
  token: string;
  createdAt: string;
  lastUsed: string | null;
}

export default function GatewayTokens() {
  const [tokens, setTokens] = useState<Token[]>([
    {
      id: '1',
      name: 'Production API',
      token: 'gmcp_1234567890abcdefghijklmnopqrstuvwxyz',
      createdAt: '2024-01-15T10:30:00Z',
      lastUsed: '2024-01-20T14:22:00Z',
    },
    {
      id: '2',
      name: 'Development',
      token: 'gmcp_abcdefghij1234567890klmnopqrstuvwxyz',
      createdAt: '2024-01-10T08:15:00Z',
      lastUsed: null,
    },
  ]);
  const [showTokens, setShowTokens] = useState<Record<string, boolean>>({});
  const [isCreating, setIsCreating] = useState(false);
  const [newTokenName, setNewTokenName] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  function generateToken(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let token = 'gmcp_';
    for (let i = 0; i < 40; i++) {
      token += chars[Math.floor(Math.random() * chars.length)];
    }
    return token;
  }

  function createToken() {
    if (!newTokenName.trim()) return;

    const newToken: Token = {
      id: Date.now().toString(),
      name: newTokenName,
      token: generateToken(),
      createdAt: new Date().toISOString(),
      lastUsed: null,
    };

    setTokens([...tokens, newToken]);
    setNewTokenName('');
    setIsCreating(false);
    setShowTokens({ ...showTokens, [newToken.id]: true });
  }

  function deleteToken(id: string) {
    if (confirm('Are you sure you want to delete this token? This action cannot be undone.')) {
      setTokens(tokens.filter(t => t.id !== id));
      const newShowTokens = { ...showTokens };
      delete newShowTokens[id];
      setShowTokens(newShowTokens);
    }
  }

  function toggleTokenVisibility(id: string) {
    setShowTokens({ ...showTokens, [id]: !showTokens[id] });
  }

  async function copyToken(token: string, id: string) {
    try {
      await navigator.clipboard.writeText(token);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    return date.toLocaleString();
  }

  function maskToken(token: string): string {
    return token.substring(0, 10) + '•'.repeat(30);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-white">Gateway Tokens</h1>
        <button
          onClick={() => setIsCreating(true)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Create Token
        </button>
      </div>

      {/* Create Token Form */}
      {isCreating && (
        <div className="card p-6">
          <h2 className="text-xl font-bold text-white mb-4">Create New Token</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-2">
                Token Name
              </label>
              <input
                type="text"
                value={newTokenName}
                onChange={(e) => setNewTokenName(e.target.value)}
                placeholder="e.g., Production API, Development, Testing"
                className="input w-full"
                autoFocus
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={createToken}
                disabled={!newTokenName.trim()}
                className="btn-primary"
              >
                Generate Token
              </button>
              <button
                onClick={() => {
                  setIsCreating(false);
                  setNewTokenName('');
                }}
                className="btn-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tokens List */}
      {tokens.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="text-slate-400 text-lg mb-4">No tokens created yet</div>
          <p className="text-slate-500 text-sm">
            Create a token to start using the AI MCP Gateway API
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {tokens.map((token) => (
            <div key={token.id} className="card p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-xl font-bold text-white mb-1">{token.name}</h3>
                  <div className="flex items-center gap-4 text-sm text-slate-400">
                    <span>Created {formatDate(token.createdAt)}</span>
                    <span>•</span>
                    <span>Last used {formatDate(token.lastUsed)}</span>
                  </div>
                </div>
                <button
                  onClick={() => deleteToken(token.id)}
                  className="btn-danger flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-semibold text-slate-300 mb-2">
                    Token
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 input font-mono text-sm">
                      {showTokens[token.id] ? token.token : maskToken(token.token)}
                    </div>
                    <button
                      onClick={() => toggleTokenVisibility(token.id)}
                      className="btn-secondary px-3"
                      title={showTokens[token.id] ? 'Hide token' : 'Show token'}
                    >
                      {showTokens[token.id] ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      onClick={() => copyToken(token.token, token.id)}
                      className="btn-secondary px-3"
                      title="Copy to clipboard"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                  {copiedId === token.id && (
                    <p className="text-green-400 text-sm mt-2">✓ Copied to clipboard</p>
                  )}
                </div>

                <div className="pt-4 border-t border-slate-700">
                  <h4 className="text-sm font-semibold text-slate-300 mb-2">Usage Example</h4>
                  <pre className="bg-slate-950 rounded p-3 text-xs text-slate-300 overflow-x-auto">
{`curl -X POST http://localhost:3000/v1/chat/completions \\
  -H "Authorization: Bearer ${showTokens[token.id] ? token.token : 'YOUR_TOKEN'}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "messages": [{"role": "user", "content": "Hello!"}]
  }'`}
                  </pre>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
