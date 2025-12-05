import { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Key, 
  LogIn, 
  LogOut, 
  Shield, 
  Clock, 
  CheckCircle, 
  XCircle,
  AlertTriangle,
  RefreshCw,
  Copy,
  ExternalLink,
  Zap
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

interface SessionInfo {
  email: string;
  isPremium: boolean;
  expiresAt: string;
  expiresIn: number; // minutes
}

interface GPTPlusStatus {
  available: boolean;
  session: SessionInfo | null;
}

interface GPTPlusModel {
  id: string;
  name: string;
  description: string;
}

export default function GPTPlus() {
  const [status, setStatus] = useState<GPTPlusStatus | null>(null);
  const [models, setModels] = useState<GPTPlusModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Login form
  const [accessToken, setAccessToken] = useState('');
  const [email, setEmail] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  // Test chat
  const [testMessage, setTestMessage] = useState('');
  const [testResponse, setTestResponse] = useState('');
  const [testing, setTesting] = useState(false);
  const [selectedModel, setSelectedModel] = useState('gpt-4');

  useEffect(() => {
    loadStatus();
    loadModels();
  }, []);

  async function loadStatus() {
    try {
      const response = await axios.get(`${API_BASE}/v1/gpt-plus/status`);
      setStatus(response.data);
      setError(null);
    } catch (err) {
      console.error('Failed to load GPT Plus status:', err);
      setError('Failed to load status');
    } finally {
      setLoading(false);
    }
  }

  async function loadModels() {
    try {
      const response = await axios.get(`${API_BASE}/v1/gpt-plus/models`);
      setModels(response.data.models || []);
    } catch (err) {
      console.error('Failed to load GPT Plus models:', err);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!accessToken.trim() || !email.trim()) return;

    setLoggingIn(true);
    setError(null);

    try {
      const response = await axios.post(`${API_BASE}/v1/gpt-plus/login`, {
        accessToken: accessToken.trim(),
        email: email.trim(),
      });

      if (response.data.success) {
        setSuccess('Login successful! GPT Plus is now available.');
        setAccessToken('');
        setEmail('');
        loadStatus();
        setTimeout(() => setSuccess(null), 5000);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoggingIn(false);
    }
  }

  async function handleLogout() {
    if (!confirm('Are you sure you want to logout from GPT Plus?')) return;

    try {
      await axios.post(`${API_BASE}/v1/gpt-plus/logout`);
      setSuccess('Logged out successfully');
      loadStatus();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Logout failed');
    }
  }

  async function handleTestChat(e: React.FormEvent) {
    e.preventDefault();
    if (!testMessage.trim()) return;

    setTesting(true);
    setTestResponse('');
    setError(null);

    try {
      const response = await axios.post(`${API_BASE}/v1/gpt-plus/chat`, {
        messages: [{ role: 'user', content: testMessage }],
        model: selectedModel,
      });

      setTestResponse(response.data.response);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Chat failed');
    } finally {
      setTesting(false);
    }
  }

  const copyInstructions = `
1. Mở Chrome/Edge và truy cập https://chat.openai.com
2. Đăng nhập với tài khoản ChatGPT Plus
3. Mở Developer Tools (F12) → Network tab
4. Refresh trang và tìm request đến "session"
5. Trong Response, tìm và copy giá trị "accessToken"
`.trim();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <Zap className="w-8 h-8 text-green-400" />
            GPT Plus Integration
          </h1>
          <p className="text-slate-400 mt-1">
            Sử dụng tài khoản ChatGPT Plus của bạn như một LLM provider
          </p>
        </div>
        <button
          onClick={loadStatus}
          className="btn-secondary flex items-center gap-2"
          disabled={loading}
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Notifications */}
      {error && (
        <div className="card p-4 border-red-500/50 bg-red-500/10">
          <div className="flex items-center gap-2 text-red-400">
            <XCircle className="w-5 h-5" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {success && (
        <div className="card p-4 border-green-500/50 bg-green-500/10">
          <div className="flex items-center gap-2 text-green-400">
            <CheckCircle className="w-5 h-5" />
            <span>{success}</span>
          </div>
        </div>
      )}

      {/* Status Card */}
      <div className="card p-6">
        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <Shield className="w-5 h-5" />
          Session Status
        </h2>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="w-6 h-6 text-slate-400 animate-spin" />
          </div>
        ) : status?.available ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse" />
              <span className="text-green-400 font-semibold">Connected</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-slate-700/50 rounded-lg">
                <p className="text-xs text-slate-400 uppercase">Email</p>
                <p className="text-white font-semibold">{status.session?.email}</p>
              </div>
              <div className="p-4 bg-slate-700/50 rounded-lg">
                <p className="text-xs text-slate-400 uppercase">Plan</p>
                <p className="text-green-400 font-semibold flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  {status.session?.isPremium ? 'Plus' : 'Free'}
                </p>
              </div>
              <div className="p-4 bg-slate-700/50 rounded-lg">
                <p className="text-xs text-slate-400 uppercase">Session Expires</p>
                <p className="text-white font-semibold flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  {status.session?.expiresIn !== undefined 
                    ? status.session.expiresIn > 60 
                      ? `${Math.floor(status.session.expiresIn / 60)}h ${status.session.expiresIn % 60}m`
                      : `${status.session.expiresIn}m`
                    : 'N/A'
                  }
                </p>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="btn-secondary text-red-400 bg-red-500/20 hover:bg-red-500/30 flex items-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 bg-slate-400 rounded-full" />
            <span className="text-slate-400">Not connected</span>
          </div>
        )}
      </div>

      {/* Login Form (only show if not connected) */}
      {!status?.available && (
        <div className="card p-6">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <LogIn className="w-5 h-5" />
            Login with Access Token
          </h2>

          {/* Instructions */}
          <div className="mb-6 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-400 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="text-yellow-400 font-semibold mb-2">Cách lấy Access Token</h3>
                <pre className="text-xs text-slate-300 whitespace-pre-wrap">{copyInstructions}</pre>
                <div className="flex items-center gap-2 mt-3">
                  <button
                    onClick={() => navigator.clipboard.writeText(copyInstructions)}
                    className="btn-secondary text-xs flex items-center gap-1"
                  >
                    <Copy className="w-3 h-3" /> Copy
                  </button>
                  <a
                    href="https://chat.openai.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-secondary text-xs flex items-center gap-1"
                  >
                    <ExternalLink className="w-3 h-3" /> Open ChatGPT
                  </a>
                </div>
              </div>
            </div>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Email (ChatGPT account)
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="input w-full"
                disabled={loggingIn}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Access Token
              </label>
              <textarea
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                placeholder="eyJhbGciOiJSUzI1NiIsInR5cCI..."
                className="input w-full h-24 font-mono text-xs"
                disabled={loggingIn}
              />
            </div>

            <button
              type="submit"
              className="btn-primary flex items-center gap-2"
              disabled={loggingIn || !accessToken.trim() || !email.trim()}
            >
              {loggingIn ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <Key className="w-4 h-4" />
                  Connect GPT Plus
                </>
              )}
            </button>
          </form>
        </div>
      )}

      {/* Available Models */}
      <div className="card p-6">
        <h2 className="text-xl font-bold text-white mb-4">Available Models</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {models.map((model) => (
            <div
              key={model.id}
              className={`p-4 rounded-lg border transition-colors cursor-pointer ${
                selectedModel === model.id
                  ? 'border-green-500 bg-green-500/10'
                  : 'border-slate-600 bg-slate-700/50 hover:border-slate-500'
              }`}
              onClick={() => setSelectedModel(model.id)}
            >
              <h3 className="text-white font-semibold">{model.name}</h3>
              <p className="text-xs text-slate-400 mt-1">{model.description}</p>
              {selectedModel === model.id && (
                <span className="inline-block mt-2 text-xs text-green-400">
                  ✓ Selected
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Test Chat (only show if connected) */}
      {status?.available && (
        <div className="card p-6">
          <h2 className="text-xl font-bold text-white mb-4">Test Chat</h2>
          
          <form onSubmit={handleTestChat} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Message
              </label>
              <textarea
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
                placeholder="Enter a test message..."
                className="input w-full h-24"
                disabled={testing}
              />
            </div>

            <div className="flex items-center gap-4">
              <button
                type="submit"
                className="btn-primary flex items-center gap-2"
                disabled={testing || !testMessage.trim()}
              >
                {testing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  'Send Test Message'
                )}
              </button>
              <span className="text-sm text-slate-400">
                Using model: <span className="text-green-400">{selectedModel}</span>
              </span>
            </div>
          </form>

          {testResponse && (
            <div className="mt-4 p-4 bg-slate-700/50 rounded-lg">
              <h3 className="text-sm font-semibold text-slate-300 mb-2">Response:</h3>
              <p className="text-white whitespace-pre-wrap">{testResponse}</p>
            </div>
          )}
        </div>
      )}

      {/* Integration Info */}
      <div className="card p-6">
        <h2 className="text-xl font-bold text-white mb-4">How to Use</h2>
        <div className="space-y-4 text-slate-300">
          <p>
            Sau khi kết nối thành công, GPT Plus sẽ được thêm như một provider trong hệ thống.
            Bạn có thể:
          </p>
          <ul className="list-disc list-inside space-y-2 ml-4">
            <li>Thêm GPT Plus models vào các Layer (L0, L1, L2, L3)</li>
            <li>Sử dụng qua API endpoint: <code className="bg-slate-700 px-2 py-1 rounded">/v1/gpt-plus/chat</code></li>
            <li>Tích hợp vào routing system để tự động fallback</li>
          </ul>
          <div className="mt-4 p-3 bg-slate-700/50 rounded-lg">
            <p className="text-xs text-slate-400">
              <strong>Lưu ý:</strong> Session sẽ hết hạn sau ~2 tuần. Bạn sẽ cần login lại khi session hết hạn.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
