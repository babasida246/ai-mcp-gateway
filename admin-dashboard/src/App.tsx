import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import GatewayTokens from './pages/GatewayTokens';
import Logs from './pages/Logs';
import ProviderManagement from './pages/ProviderManagement';
import Settings from './pages/Settings';
import Models from './pages/Models';

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/gateway-tokens" element={<GatewayTokens />} />
          <Route path="/logs" element={<Logs />} />
          <Route path="/providers" element={<ProviderManagement />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/models" element={<Models />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;