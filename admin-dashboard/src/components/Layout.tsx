import type { ReactNode } from 'react';
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Key, Terminal, Users, Cpu, Settings as SettingsIcon, Menu, X, BarChart3, Bell, Database, Zap, MessageSquare, SquareTerminal, MessagesSquare, LogOut, User, Wrench, Server, Network } from 'lucide-react';

interface LayoutProps {
  children: ReactNode;
  onLogout?: () => void;
  user?: any;
  authEnabled?: boolean;
}

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'AI Chat', href: '/chat', icon: MessagesSquare },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
  { name: 'Gateway Tokens', href: '/tokens', icon: Key },
  { name: 'Docker Logs', href: '/logs', icon: Terminal },
  { name: 'Providers', href: '/providers', icon: Users },
  { name: 'Models', href: '/models', icon: Cpu },
  { name: 'Database', href: '/database', icon: Database },
  { name: 'Redis', href: '/redis', icon: Database },
  { name: 'OpenRouter Info', href: '/openrouter', icon: Zap },
  { name: 'GPT Plus', href: '/gpt-plus', icon: MessageSquare },
  { name: 'Web Terminal', href: '/terminal', icon: SquareTerminal },
  { name: 'MCP Tools', href: '/mcp-tools', icon: Wrench },
  { name: 'MikroTik', href: '/mikrotik', icon: Network },
  { name: 'Backends', href: '/backends', icon: Server },
  { name: 'Alerts', href: '/alerts', icon: Bell },
  { name: 'Settings', href: '/settings', icon: SettingsIcon },
];

export default function Layout({ children, onLogout, user, authEnabled }: LayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    if (onLogout) {
      onLogout();
    }
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Mobile menu */}
      <div className={`fixed inset-0 z-50 lg:hidden ${mobileMenuOpen ? '' : 'hidden'}`}>
        <div className="fixed inset-0 bg-black/50" onClick={() => setMobileMenuOpen(false)}></div>
        <div className="fixed left-0 top-0 bottom-0 w-64 bg-slate-800 shadow-xl">
          <div className="flex items-center justify-between p-4 border-b border-slate-700">
            <h2 className="text-lg font-semibold text-white">AI MCP Gateway</h2>
            <button onClick={() => setMobileMenuOpen(false)} className="text-slate-400 hover:text-white">
              <X className="w-6 h-6" />
            </button>
          </div>
          <nav className="p-4">
            <ul className="space-y-2">
              {navigation.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.href;
                return (
                  <li key={item.name}>
                    <Link
                      to={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                        isActive
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      {item.name}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:w-64 lg:block">
        <div className="flex flex-col h-full bg-slate-800 shadow-xl">
          <div className="flex items-center p-6 border-b border-slate-700">
            <h1 className="text-xl font-bold text-white">AI MCP Gateway</h1>
          </div>
          <nav className="flex-1 p-4 overflow-y-auto">
            <ul className="space-y-2">
              {navigation.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.href;
                return (
                  <li key={item.name}>
                    <Link
                      to={item.href}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                        isActive
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      {item.name}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          
          {/* User info & Logout (only show when auth is enabled) */}
          {authEnabled && user && (
            <div className="p-4 border-t border-slate-700">
              <div className="flex items-center gap-3 mb-3 px-3">
                <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                  <User className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">
                    {user.display_name || user.username}
                  </p>
                  <p className="text-xs text-slate-400 truncate">{user.role}</p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-slate-300 hover:bg-red-600/20 hover:text-red-400 transition-colors"
              >
                <LogOut className="w-5 h-5" />
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Mobile header */}
        <div className="sticky top-0 z-40 lg:hidden">
          <div className="flex items-center justify-between p-4 bg-slate-800 border-b border-slate-700">
            <h1 className="text-lg font-semibold text-white">AI MCP Gateway</h1>
            <button onClick={() => setMobileMenuOpen(true)} className="text-slate-400 hover:text-white">
              <Menu className="w-6 h-6" />
            </button>
          </div>
        </div>

        <main className="p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
