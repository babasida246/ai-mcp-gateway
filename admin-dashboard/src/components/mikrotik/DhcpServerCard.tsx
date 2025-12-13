import React, { useState } from 'react';
import { Copy, CheckCircle, Plus, Trash2 } from 'lucide-react';

interface DhcpServerConfig {
  name: string;
  interface: string;
  poolName: string;
  poolRange: string;
  network: string;
  gateway: string;
  dnsServers?: string[];
  leaseTime?: string;
}

interface DhcpServerParams {
  servers: DhcpServerConfig[];
}

interface DhcpServerCardProps {
  onCompile?: (params: DhcpServerParams) => Promise<string[]>;
}

export const DhcpServerCard: React.FC<DhcpServerCardProps> = ({ onCompile }) => {
  const [servers, setServers] = useState<DhcpServerConfig[]>([
    {
      name: 'dhcp-lan',
      interface: 'bridge-lan',
      poolName: 'pool-lan',
      poolRange: '192.168.1.100-192.168.1.200',
      network: '192.168.1.0/24',
      gateway: '192.168.1.1',
      dnsServers: ['8.8.8.8', '8.8.4.4'],
      leaseTime: '1d',
    },
  ]);
  const [commands, setCommands] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  const addServer = () => {
    setServers([
      ...servers,
      {
        name: `dhcp-vlan${servers.length + 1}`,
        interface: '',
        poolName: `pool-vlan${servers.length + 1}`,
        poolRange: '',
        network: '',
        gateway: '',
        dnsServers: ['8.8.8.8'],
        leaseTime: '1d',
      },
    ]);
  };

  const removeServer = (index: number) => {
    setServers(servers.filter((_, i) => i !== index));
  };

  const updateServer = (index: number, field: keyof DhcpServerConfig, value: any) => {
    const updated = [...servers];
    updated[index] = { ...updated[index], [field]: value };
    setServers(updated);
  };

  const handleGenerate = async () => {
    const params: DhcpServerParams = { servers };

    if (onCompile) {
      const result = await onCompile(params);
      setCommands(result);
    } else {
      // Fallback: generate commands locally
      const cmds: string[] = [];
      servers.forEach(srv => {
        // Create pool
        cmds.push(`/ip pool add name=${srv.poolName} ranges=${srv.poolRange}`);
        
        // Create DHCP network
        const dnsStr = srv.dnsServers && srv.dnsServers.length > 0 
          ? ` dns-server=${srv.dnsServers.join(',')}` 
          : '';
        cmds.push(`/ip dhcp-server network add address=${srv.network} gateway=${srv.gateway}${dnsStr}`);
        
        // Create DHCP server
        cmds.push(`/ip dhcp-server add name=${srv.name} interface=${srv.interface} address-pool=${srv.poolName} lease-time=${srv.leaseTime || '1d'} disabled=no`);
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
        <h3 className="text-lg font-semibold text-gray-800">DHCP Server</h3>
        <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded">
          Low Risk
        </span>
      </div>

      <div className="space-y-4 mb-4">
        {servers.map((server, index) => (
          <div key={index} className="border border-gray-200 rounded p-4 relative">
            {servers.length > 1 && (
              <button
                onClick={() => removeServer(index)}
                className="absolute top-2 right-2 text-red-500 hover:text-red-700"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={server.name}
                  onChange={(e) => updateServer(index, 'name', e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Interface</label>
                <input
                  type="text"
                  value={server.interface}
                  onChange={(e) => updateServer(index, 'interface', e.target.value)}
                  placeholder="bridge-lan"
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Pool Name</label>
                <input
                  type="text"
                  value={server.poolName}
                  onChange={(e) => updateServer(index, 'poolName', e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Pool Range</label>
                <input
                  type="text"
                  value={server.poolRange}
                  onChange={(e) => updateServer(index, 'poolRange', e.target.value)}
                  placeholder="192.168.1.100-192.168.1.200"
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Network (CIDR)</label>
                <input
                  type="text"
                  value={server.network}
                  onChange={(e) => updateServer(index, 'network', e.target.value)}
                  placeholder="192.168.1.0/24"
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Gateway</label>
                <input
                  type="text"
                  value={server.gateway}
                  onChange={(e) => updateServer(index, 'gateway', e.target.value)}
                  placeholder="192.168.1.1"
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">DNS Servers (comma-sep)</label>
                <input
                  type="text"
                  value={server.dnsServers?.join(',') || ''}
                  onChange={(e) => updateServer(index, 'dnsServers', e.target.value.split(',').map(s => s.trim()))}
                  placeholder="8.8.8.8, 8.8.4.4"
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Lease Time</label>
                <input
                  type="text"
                  value={server.leaseTime || '1d'}
                  onChange={(e) => updateServer(index, 'leaseTime', e.target.value)}
                  placeholder="1d"
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        ))}

        <button
          onClick={addServer}
          className="w-full py-2 border-2 border-dashed border-gray-300 rounded text-sm text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add DHCP Server
        </button>
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
