import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute, { useAuthStatus } from './components/ProtectedRoute';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import GatewayTokens from './pages/GatewayTokens';
import Logs from './pages/Logs';
import Providers from './pages/Providers';
import Models from './pages/Models';
import Settings from './pages/Settings';
import Analytics from './pages/Analytics';
import Alerts from './pages/Alerts';
import Database from './pages/Database';
import Redis from './pages/Redis';
import OpenRouterInfo from './pages/OpenRouterInfo';
import GPTPlus from './pages/GPTPlus';
import WebTerminal from './pages/WebTerminal';
import Chat from './pages/Chat';

function App() {
  const { authEnabled, isAuthenticated, loading, login, logout, user } = useAuthStatus();

  // Show loading spinner while checking auth status
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        {/* Login page - always accessible */}
        <Route 
          path="/login" 
          element={
            isAuthenticated && authEnabled !== false ? (
              <Navigate to="/" replace />
            ) : (
              <Login onLogin={login} />
            )
          } 
        />

        {/* Protected routes */}
        <Route
          path="/*"
          element={
            <ProtectedRoute authEnabled={authEnabled ?? false} isAuthenticated={isAuthenticated}>
              <Layout onLogout={logout} user={user} authEnabled={authEnabled ?? false}>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/chat" element={<Chat />} />
                  <Route path="/analytics" element={<Analytics />} />
                  <Route path="/tokens" element={<GatewayTokens />} />
                  <Route path="/logs" element={<Logs />} />
                  <Route path="/providers" element={<Providers />} />
                  <Route path="/models" element={<Models />} />
                  <Route path="/database" element={<Database />} />
                  <Route path="/redis" element={<Redis />} />
                  <Route path="/openrouter" element={<OpenRouterInfo />} />
                  <Route path="/gpt-plus" element={<GPTPlus />} />
                  <Route path="/terminal" element={<WebTerminal />} />
                  <Route path="/alerts" element={<Alerts />} />
                  <Route path="/settings" element={<Settings />} />
                </Routes>
              </Layout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </Router>
  );
}

export default App;
