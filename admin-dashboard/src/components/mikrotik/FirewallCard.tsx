import React, { useState } from 'react';
import { Copy, Shield, CheckCircle } from 'lucide-react';

interface FirewallParams {
  preset: 'basic' | 'standard' | 'strict';
  wanInterfaces: string[];
  lanInterfaces: string[];
  mgmtSubnets: string[];
  enableFastTrack: boolean;
}

interface FirewallCardProps {
  onCompile?: (params: FirewallParams) => Promise<string[]>;
}

export const FirewallCard: React.FC<FirewallCardProps> = ({ onCompile }) => {
  const [preset, setPreset] = useState<'basic' | 'standard' | 'strict'>('standard');
  const [wanInterfaces, setWanInterfaces] = useState('ether1');
  const [lanInterfaces, setLanInterfaces] = useState('bridge-lan');
  const [mgmtSubnets, setMgmtSubnets] = useState('192.168.1.0/24');
  const [enableFastTrack, setEnableFastTrack] = useState(true);
  const [commands, setCommands] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  const presetDescriptions = {
    basic: 'Allow all outbound, block inbound from WAN, allow LAN to router',
    standard: 'Basic + established/related, drop invalid, ICMP rate limit',
    strict: 'Standard + advanced protections, port scanning detection, SYN flood protection',
  };

  const handleGenerate = async () => {
    const params: FirewallParams = {
      preset,
      wanInterfaces: wanInterfaces.split(',').map(s => s.trim()).filter(Boolean),
      lanInterfaces: lanInterfaces.split(',').map(s => s.trim()).filter(Boolean),
      mgmtSubnets: mgmtSubnets.split(',').map(s => s.trim()).filter(Boolean),
      enableFastTrack,
    };

    if (onCompile) {
      const result = await onCompile(params);
      setCommands(result);
    } else {
      // Fallback: generate sample commands
      const cmds: string[] = [];
      
      // Interface lists
      cmds.push('# Create interface lists');
      params.wanInterfaces.forEach(iface => {
        cmds.push(`/interface list member add list=WAN interface=${iface}`);
      });
      params.lanInterfaces.forEach(iface => {
        cmds.push(`/interface list member add list=LAN interface=${iface}`);
      });

      cmds.push('');
      cmds.push('# Input chain rules');
      cmds.push('/ip firewall filter add chain=input action=accept connection-state=established,related comment="Accept established/related"');
      cmds.push('/ip firewall filter add chain=input action=drop connection-state=invalid comment="Drop invalid"');
      
      if (preset === 'standard' || preset === 'strict') {
        cmds.push('/ip firewall filter add chain=input action=accept protocol=icmp limit=5,5:packet comment="ICMP rate limit"');
      }
      
      params.mgmtSubnets.forEach(subnet => {
        cmds.push(`/ip firewall filter add chain=input action=accept src-address=${subnet} comment="Allow management subnet"`);
      });
      
      cmds.push('/ip firewall filter add chain=input action=accept in-interface-list=LAN comment="Allow LAN"');
      cmds.push('/ip firewall filter add chain=input action=drop in-interface-list=WAN comment="Drop WAN"');

      cmds.push('');
      cmds.push('# Forward chain rules');
      if (enableFastTrack) {
        cmds.push('/ip firewall filter add chain=forward action=fasttrack-connection connection-state=established,related comment="FastTrack"');
      }
      cmds.push('/ip firewall filter add chain=forward action=accept connection-state=established,related comment="Accept established/related"');
      cmds.push('/ip firewall filter add chain=forward action=drop connection-state=invalid comment="Drop invalid"');
      cmds.push('/ip firewall filter add chain=forward action=drop connection-state=new connection-nat-state=!dstnat in-interface-list=WAN comment="Drop WAN not dstnat"');

      if (preset === 'strict') {
        cmds.push('');
        cmds.push('# Strict mode: port scan detection');
        cmds.push('/ip firewall filter add chain=forward action=add-src-to-address-list address-list=port-scanners address-list-timeout=2w connection-state=new protocol=tcp psd=21,3s,3,1 comment="Port scan detect"');
        cmds.push('/ip firewall filter add chain=forward action=drop src-address-list=port-scanners comment="Drop port scanners"');
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
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-800">Firewall Rules</h3>
        </div>
        <span className="px-2 py-1 bg-orange-100 text-orange-700 text-xs font-medium rounded">
          High Risk
        </span>
      </div>

      <div className="space-y-4 mb-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Security Preset
          </label>
          <div className="space-y-2">
            {(['basic', 'standard', 'strict'] as const).map((level) => (
              <label key={level} className="flex items-start p-3 border rounded cursor-pointer hover:bg-gray-50 transition-colors">
                <input
                  type="radio"
                  name="preset"
                  value={level}
                  checked={preset === level}
                  onChange={(e) => setPreset(e.target.value as any)}
                  className="mt-0.5 mr-3 h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                />
                <div>
                  <div className="font-medium text-sm text-gray-800 capitalize">{level}</div>
                  <div className="text-xs text-gray-600 mt-0.5">{presetDescriptions[level]}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            WAN Interfaces (comma-separated)
          </label>
          <input
            type="text"
            value={wanInterfaces}
            onChange={(e) => setWanInterfaces(e.target.value)}
            placeholder="ether1, ether2"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            LAN Interfaces (comma-separated)
          </label>
          <input
            type="text"
            value={lanInterfaces}
            onChange={(e) => setLanInterfaces(e.target.value)}
            placeholder="bridge-lan"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Management Subnets (comma-separated)
          </label>
          <input
            type="text"
            value={mgmtSubnets}
            onChange={(e) => setMgmtSubnets(e.target.value)}
            placeholder="192.168.1.0/24"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <p className="text-xs text-gray-500 mt-1">
            These subnets will have full access to the router
          </p>
        </div>

        <div className="flex items-center">
          <input
            type="checkbox"
            id="fasttrack"
            checked={enableFastTrack}
            onChange={(e) => setEnableFastTrack(e.target.checked)}
            className="mr-2 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
          />
          <label htmlFor="fasttrack" className="text-sm text-gray-700">
            Enable FastTrack (improves throughput for established connections)
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
          <pre className="bg-gray-50 p-3 rounded text-xs font-mono overflow-x-auto border border-gray-200 max-h-96">
            {commands.join('\n')}
          </pre>
        </div>
      )}
    </div>
  );
};
