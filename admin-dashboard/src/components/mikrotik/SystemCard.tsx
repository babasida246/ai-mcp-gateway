import React, { useState } from 'react';
import { Copy, CheckCircle } from 'lucide-react';

interface SystemParams {
  identity?: string;
  note?: string;
  timezone?: string;
  ntpServers?: string[];
  ntpEnabled?: boolean;
}

interface SystemCardProps {
  onCompile?: (params: SystemParams) => Promise<string[]>;
}

export const SystemCard: React.FC<SystemCardProps> = ({ onCompile }) => {
  const [identity, setIdentity] = useState('');
  const [note, setNote] = useState('');
  const [timezone, setTimezone] = useState('Asia/Ho_Chi_Minh');
  const [ntpServers, setNtpServers] = useState('216.239.35.0,216.239.35.4');
  const [ntpEnabled, setNtpEnabled] = useState(true);
  const [commands, setCommands] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    const params: SystemParams = {
      identity: identity || undefined,
      note: note || undefined,
      timezone,
      ntpServers: ntpServers.split(',').map(s => s.trim()).filter(Boolean),
      ntpEnabled,
    };

    if (onCompile) {
      const result = await onCompile(params);
      setCommands(result);
    } else {
      // Fallback: generate commands locally
      const cmds: string[] = [];
      if (identity) cmds.push(`/system identity set name="${identity}"`);
      if (note) cmds.push(`/system note set note="${note}"`);
      if (timezone) cmds.push(`/system clock set time-zone-name="${timezone}"`);
      if (ntpEnabled && params.ntpServers && params.ntpServers.length > 0) {
        cmds.push(`/system ntp client set enabled=yes`);
        params.ntpServers.forEach(server => {
          cmds.push(`/system ntp client servers add address=${server}`);
        });
      }
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
        <h3 className="text-lg font-semibold text-gray-800">System Basics</h3>
        <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded">
          Low Risk
        </span>
      </div>

      <div className="space-y-4 mb-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Identity (Router Name)
          </label>
          <input
            type="text"
            value={identity}
            onChange={(e) => setIdentity(e.target.value)}
            placeholder="e.g., Gateway-CCR2116"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Note
          </label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g., Main office gateway"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Timezone
          </label>
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="Asia/Ho_Chi_Minh">Asia/Ho_Chi_Minh (GMT+7)</option>
            <option value="UTC">UTC</option>
            <option value="America/New_York">America/New_York</option>
            <option value="Europe/London">Europe/London</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            NTP Servers (comma-separated)
          </label>
          <input
            type="text"
            value={ntpServers}
            onChange={(e) => setNtpServers(e.target.value)}
            placeholder="216.239.35.0, 216.239.35.4"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div className="flex items-center">
          <input
            type="checkbox"
            id="ntpEnabled"
            checked={ntpEnabled}
            onChange={(e) => setNtpEnabled(e.target.checked)}
            className="mr-2 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
          />
          <label htmlFor="ntpEnabled" className="text-sm text-gray-700">
            Enable NTP Client
          </label>
        </div>
      </div>

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
