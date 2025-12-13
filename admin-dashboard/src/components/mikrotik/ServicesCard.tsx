import React, { useState } from 'react';
import { Copy, AlertTriangle, CheckCircle } from 'lucide-react';

interface ServiceConfig {
  name: 'winbox' | 'ssh' | 'api' | 'api-ssl' | 'www' | 'www-ssl' | 'telnet' | 'ftp';
  disabled: boolean;
  port?: number;
  address?: string;
}

interface ServicesParams {
  services: ServiceConfig[];
}

interface ServicesCardProps {
  onCompile?: (params: ServicesParams) => Promise<string[]>;
}

export const ServicesCard: React.FC<ServicesCardProps> = ({ onCompile }) => {
  const [winboxEnabled, setWinboxEnabled] = useState(true);
  const [winboxAddress, setWinboxAddress] = useState('');
  const [sshEnabled, setSshEnabled] = useState(true);
  const [sshAddress, setSshAddress] = useState('');
  const [apiEnabled, setApiEnabled] = useState(false);
  const [apiAddress, setApiAddress] = useState('');
  const [wwwEnabled, setWwwEnabled] = useState(false);
  const [commands, setCommands] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    const services: ServiceConfig[] = [
      { name: 'winbox', disabled: !winboxEnabled, address: winboxAddress || undefined },
      { name: 'ssh', disabled: !sshEnabled, address: sshAddress || undefined },
      { name: 'api', disabled: !apiEnabled, address: apiAddress || undefined },
      { name: 'www', disabled: !wwwEnabled },
    ];

    const params: ServicesParams = { services };

    // Check for lockout risk
    const newWarnings: string[] = [];
    if (!winboxEnabled && !sshEnabled) {
      newWarnings.push('⚠️ LOCKOUT RISK: Disabling both Winbox and SSH will lock you out!');
    }
    if (winboxEnabled && !winboxAddress) {
      newWarnings.push('⚠️ Security: Winbox is enabled without address restriction. Recommended: restrict to management subnet.');
    }
    if (sshEnabled && !sshAddress) {
      newWarnings.push('⚠️ Security: SSH is enabled without address restriction. Recommended: restrict to management subnet.');
    }
    setWarnings(newWarnings);

    if (onCompile) {
      const result = await onCompile(params);
      setCommands(result);
    } else {
      // Fallback: generate commands locally
      const cmds: string[] = [];
      services.forEach(svc => {
        if (svc.disabled) {
          cmds.push(`/ip service set ${svc.name} disabled=yes`);
        } else {
          const parts = [`/ip service set ${svc.name} disabled=no`];
          if (svc.address) {
            parts[0] += ` address="${svc.address}"`;
          }
          cmds.push(parts[0]);
        }
      });
      setCommands(cmds);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(commands.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-800">Services Management</h3>
        <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs font-medium rounded">
          Medium Risk
        </span>
      </div>

      <div className="space-y-4 mb-4">
        <div className="border border-gray-200 rounded p-3">
          <div className="flex items-center justify-between mb-2">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={winboxEnabled}
                onChange={(e) => setWinboxEnabled(e.target.checked)}
                className="mr-2 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-gray-700">Enable Winbox</span>
            </label>
            <span className="text-xs text-gray-500">Port 8291</span>
          </div>
          {winboxEnabled && (
            <input
              type="text"
              value={winboxAddress}
              onChange={(e) => setWinboxAddress(e.target.value)}
              placeholder="Allowed addresses (e.g., 192.168.1.0/24)"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          )}
        </div>

        <div className="border border-gray-200 rounded p-3">
          <div className="flex items-center justify-between mb-2">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={sshEnabled}
                onChange={(e) => setSshEnabled(e.target.checked)}
                className="mr-2 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-gray-700">Enable SSH</span>
            </label>
            <span className="text-xs text-gray-500">Port 22</span>
          </div>
          {sshEnabled && (
            <input
              type="text"
              value={sshAddress}
              onChange={(e) => setSshAddress(e.target.value)}
              placeholder="Allowed addresses (e.g., 192.168.1.0/24)"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          )}
        </div>

        <div className="border border-gray-200 rounded p-3">
          <div className="flex items-center justify-between mb-2">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={apiEnabled}
                onChange={(e) => setApiEnabled(e.target.checked)}
                className="mr-2 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-gray-700">Enable API</span>
            </label>
            <span className="text-xs text-gray-500">Port 8728</span>
          </div>
          {apiEnabled && (
            <input
              type="text"
              value={apiAddress}
              onChange={(e) => setApiAddress(e.target.value)}
              placeholder="Allowed addresses (e.g., 192.168.1.0/24)"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          )}
        </div>

        <div className="border border-gray-200 rounded p-3">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={wwwEnabled}
              onChange={(e) => setWwwEnabled(e.target.checked)}
              className="mr-2 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <span className="text-sm font-medium text-gray-700">Enable WebFig (WWW)</span>
            <span className="ml-auto text-xs text-gray-500">Port 80</span>
          </label>
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              {warnings.map((warning, idx) => (
                <p key={idx} className="text-sm text-yellow-800">{warning}</p>
              ))}
            </div>
          </div>
        </div>
      )}

      <button
        onClick={handleGenerate}
        className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors mb-4"
      >
        Generate Commands
      </button>

      {commands.length > 0 && (
        <div className="mt-4 border-t pt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">
              Generated Commands ({commands.length})
            </span>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded transition-colors"
            >
              {copied ? (
                <>
                  <CheckCircle className="w-4 h-4" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
          <pre className="bg-gray-50 p-3 rounded text-xs font-mono overflow-x-auto border border-gray-200">
            {commands.join('\n')}
          </pre>
        </div>
      )}
    </div>
  );
};
