import React, { useState } from 'react';
import { Copy, CheckCircle, Plus, Trash2 } from 'lucide-react';

interface PortForward {
  protocol: 'tcp' | 'udp';
  dstPort: number;
  toAddress: string;
  toPort: number;
  comment?: string;
}

interface NatParams {
  wanInterface: string;
  masquerade: boolean;
  portForwards: PortForward[];
  hairpinNat: boolean;
}

interface NatCardProps {
  onCompile?: (params: NatParams) => Promise<string[]>;
}

export const NatCard: React.FC<NatCardProps> = ({ onCompile }) => {
  const [wanInterface, setWanInterface] = useState('ether1');
  const [masquerade, setMasquerade] = useState(true);
  const [hairpinNat, setHairpinNat] = useState(true);
  const [portForwards, setPortForwards] = useState<PortForward[]>([]);
  const [commands, setCommands] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  const addPortForward = () => {
    setPortForwards([
      ...portForwards,
      {
        protocol: 'tcp',
        dstPort: 80,
        toAddress: '192.168.1.10',
        toPort: 80,
        comment: '',
      },
    ]);
  };

  const removePortForward = (index: number) => {
    setPortForwards(portForwards.filter((_, i) => i !== index));
  };

  const updatePortForward = (index: number, field: keyof PortForward, value: any) => {
    const updated = [...portForwards];
    updated[index] = { ...updated[index], [field]: value };
    setPortForwards(updated);
  };

  const handleGenerate = async () => {
    const params: NatParams = {
      wanInterface,
      masquerade,
      portForwards,
      hairpinNat,
    };

    if (onCompile) {
      const result = await onCompile(params);
      setCommands(result);
    } else {
      // Fallback: generate commands locally
      const cmds: string[] = [];
      
      if (masquerade) {
        cmds.push(`/ip firewall nat add chain=srcnat out-interface=${wanInterface} action=masquerade comment="Masquerade WAN"`);
      }

      portForwards.forEach(pf => {
        const commentStr = pf.comment ? ` comment="${pf.comment}"` : '';
        cmds.push(`/ip firewall nat add chain=dstnat in-interface=${wanInterface} protocol=${pf.protocol} dst-port=${pf.dstPort} action=dst-nat to-addresses=${pf.toAddress} to-ports=${pf.toPort}${commentStr}`);
      });

      if (hairpinNat && portForwards.length > 0) {
        cmds.push('');
        cmds.push('# Hairpin NAT (access from LAN using public IP)');
        portForwards.forEach(pf => {
          const commentStr = pf.comment ? ` comment="Hairpin: ${pf.comment}"` : ' comment="Hairpin NAT"';
          cmds.push(`/ip firewall nat add chain=srcnat protocol=${pf.protocol} dst-address=${pf.toAddress} dst-port=${pf.toPort} action=masquerade${commentStr}`);
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
        <h3 className="text-lg font-semibold text-gray-800">NAT Configuration</h3>
        <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs font-medium rounded">
          Medium Risk
        </span>
      </div>

      <div className="space-y-4 mb-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            WAN Interface
          </label>
          <input
            type="text"
            value={wanInterface}
            onChange={(e) => setWanInterface(e.target.value)}
            placeholder="ether1"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div className="flex items-center">
          <input
            type="checkbox"
            id="masquerade"
            checked={masquerade}
            onChange={(e) => setMasquerade(e.target.checked)}
            className="mr-2 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
          />
          <label htmlFor="masquerade" className="text-sm text-gray-700">
            Enable Masquerade (required for internet access)
          </label>
        </div>

        <div className="border-t pt-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-gray-800">Port Forwarding</h4>
            <button
              onClick={addPortForward}
              className="flex items-center gap-1 px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Rule
            </button>
          </div>

          {portForwards.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">No port forwarding rules</p>
          ) : (
            <div className="space-y-3">
              {portForwards.map((pf, index) => (
                <div key={index} className="border border-gray-200 rounded p-3 relative">
                  <button
                    onClick={() => removePortForward(index)}
                    className="absolute top-2 right-2 text-red-500 hover:text-red-700"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>

                  <div className="grid grid-cols-2 gap-2 pr-8">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Protocol</label>
                      <select
                        value={pf.protocol}
                        onChange={(e) => updatePortForward(index, 'protocol', e.target.value)}
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="tcp">TCP</option>
                        <option value="udp">UDP</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">External Port</label>
                      <input
                        type="number"
                        value={pf.dstPort}
                        onChange={(e) => updatePortForward(index, 'dstPort', parseInt(e.target.value))}
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Internal IP</label>
                      <input
                        type="text"
                        value={pf.toAddress}
                        onChange={(e) => updatePortForward(index, 'toAddress', e.target.value)}
                        placeholder="192.168.1.10"
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Internal Port</label>
                      <input
                        type="number"
                        value={pf.toPort}
                        onChange={(e) => updatePortForward(index, 'toPort', parseInt(e.target.value))}
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-gray-700 mb-1">Comment (optional)</label>
                      <input
                        type="text"
                        value={pf.comment || ''}
                        onChange={(e) => updatePortForward(index, 'comment', e.target.value)}
                        placeholder="e.g., Web Server"
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {portForwards.length > 0 && (
          <div className="flex items-center">
            <input
              type="checkbox"
              id="hairpin"
              checked={hairpinNat}
              onChange={(e) => setHairpinNat(e.target.checked)}
              className="mr-2 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label htmlFor="hairpin" className="text-sm text-gray-700">
              Enable Hairpin NAT (access forwarded services from LAN using public IP)
            </label>
          </div>
        )}
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
