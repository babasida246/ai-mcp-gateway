import { useMemo, useState } from 'react';
import { Check, Copy, Network, PlugZap, Shield, SlidersHorizontal } from 'lucide-react';
import api from '../lib/api';
import { SystemCard, ServicesCard, DhcpServerCard, FirewallCard, NatCard } from '../components/mikrotik';

function buildBridgeCommand(name: string, vlanFiltering: boolean) {
  const cmds = [`/interface bridge add name=${name}`];
  if (vlanFiltering) cmds.push(`/interface bridge set [find name=${name}] vlan-filtering=yes`);
  return cmds;
}

function buildAccessCommands(bridge: string, iface: string, vlan: number) {
  return [
    `/interface bridge port add bridge=${bridge} interface=${iface}`,
    `/interface bridge port set [find interface=${iface}] pvid=${vlan} frame-types=admit-only-untagged-and-priority-tagged`,
    `/interface bridge vlan add bridge=${bridge} vlan-ids=${vlan} untagged=${iface}`,
  ];
}

function buildTrunkCommands(bridge: string, iface: string, vlans: number[]) {
  const base = [
    `/interface bridge port add bridge=${bridge} interface=${iface}`,
    `/interface bridge port set [find interface=${iface}] frame-types=admit-only-vlan-tagged`,
  ];
  const vlanCmds = vlans.map((v) => `/interface bridge vlan add bridge=${bridge} vlan-ids=${v} tagged=${iface}`);
  return [...base, ...vlanCmds];
}

function buildInterfaceState(iface: string, enabled: boolean) {
  return [`/interface set [find name=${iface}] disabled=${enabled ? 'no' : 'yes'}`];
}

function buildMtu(iface: string, mtu: number) {
  return [`/interface set [find name=${iface}] mtu=${mtu}`];
}

function buildBonding(name: string, slaves: string, mode: string) {
  const normalized = slaves.split(',').map((s) => s.trim()).filter(Boolean).join(',');
  return [`/interface bonding add name=${name} slaves=${normalized} mode=${mode || '802.3ad'}`];
}

function CommandBlock({ title, commands }: { title: string; commands: string[] }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!commands || commands.length === 0) return;
    await navigator.clipboard.writeText(commands.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  if (!commands || commands.length === 0) {
    return null;
  }

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 shadow-md">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <button
          onClick={handleCopy}
          className="flex items-center gap-2 text-xs px-2 py-1 rounded-md bg-slate-700 text-slate-200 hover:bg-blue-600 hover:text-white transition-colors"
        >
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} Copy
        </button>
      </div>
      <pre className="text-xs text-slate-200 bg-slate-900 rounded-lg p-3 whitespace-pre-wrap leading-5 font-mono">
        {commands.join('\n')}
      </pre>
    </div>
  );
}

export default function MikrotikPage() {
  // AI generation state
  const [promptText, setPromptText] = useState('');
  const [genLoading, setGenLoading] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [generation, setGeneration] = useState<{
    generationId?: string;
    sessionId?: string;
    display?: string;
    taskDescription?: string;
    commands?: Array<string | { title?: string; command?: string }>;
    // flags from backend to indicate if the LLM output was final or intermediate reasoning
    isFinal?: boolean;
    isReasoning?: boolean;
    reasoningText?: string | null;
  } | null>(null);
  const [fullCommands, setFullCommands] = useState<string[] | null>(null);

  // MikroTik Plan state
  const [mikrotikPlan, setMikrotikPlan] = useState<any>(null);
  const [compiledResult, setCompiledResult] = useState<any>(null);
  const [validationResult, setValidationResult] = useState<any>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);

  // Prompt Builder state
  const [deviceModel, setDeviceModel] = useState('CCR2116');
  const [routerOS, setRouterOS] = useState('7.16');
  const [wanConfig, setWanConfig] = useState('wan1: ether1 dhcp; wan2: ether2 pppoe');
  const [lbMethod, setLbMethod] = useState<'pcc' | 'ecmp' | 'failover'>('pcc');
  const [vlanListStr, setVlanListStr] = useState('10,20');
  const [bridgeLan, setBridgeLan] = useState('br-lan');
  const [securityProfile, setSecurityProfile] = useState<'strict' | 'standard' | 'relaxed'>('standard');
  const [extraGoals, setExtraGoals] = useState('ưu tiên ổn định, nhật ký cơ bản, hạn chế broadcast');
  const [includeFirewall, setIncludeFirewall] = useState(true);
  const [includeNat, setIncludeNat] = useState(true);
  const [includeMangle, setIncludeMangle] = useState(true);
  const [includeRouting, setIncludeRouting] = useState(true);
  const [includeDhcp, setIncludeDhcp] = useState(true);
  const [includePools, setIncludePools] = useState(true);
  const [includeNetworks, setIncludeNetworks] = useState(true);

  function buildPromptFromBuilder(): string {
    const vlans = vlanListStr.split(',').map(v => v.trim()).filter(Boolean).join(', ');
    const categories = [
      includeFirewall ? 'Firewall' : null,
      includeNat ? 'NAT' : null,
      includeMangle ? 'Mangle' : null,
      includeRouting ? 'Routing' : null,
      includeDhcp ? 'DHCP' : null,
      includePools ? 'IP Pools' : null,
      includeNetworks ? 'Networks' : null,
      'Bridge & VLANs',
    ].filter(Boolean).join(', ');

    const instructions = `Bạn là chuyên gia cấu hình MikroTik.
Thiết bị: ${deviceModel}, RouterOS ${routerOS}.
WAN & cân bằng tải: ${wanConfig}; phương pháp: ${lbMethod.toUpperCase()}.
LAN bridge: ${bridgeLan}; VLANs: ${vlans}.
Yêu cầu an toàn: ${securityProfile}; mục tiêu thêm: ${extraGoals}.

Hãy sinh tập lệnh đầy đủ theo nhóm phần: ${categories}.
- Mỗi nhóm gồm các lệnh RouterOS chuẩn, tối ưu cú pháp, có ghi chú ngắn.
- Nhất quán đặt tên interface/bridge/vlan theo yêu cầu.
- Trả về danh sách lệnh tuần tự để có thể dán trực tiếp.
- Nếu cần, tạo trước đối tượng phụ thuộc (interfaces/bridge/vlan/pools).
Kết quả: mô tả ngắn nhiệm vụ, rồi các lệnh theo nhóm.`;
    return instructions;
  }

  // Builder states
  const [bridgeName, setBridgeName] = useState('br-lan');
  const [vlanFiltering, setVlanFiltering] = useState(true);

  const [accessBridge, setAccessBridge] = useState('br-lan');
  const [accessIface, setAccessIface] = useState('ether2');
  const [accessVlan, setAccessVlan] = useState(10);

  const [trunkBridge, setTrunkBridge] = useState('br-lan');
  const [trunkIface, setTrunkIface] = useState('ether3');
  const [trunkVlans, setTrunkVlans] = useState('20,30,40');

  const [ifaceStateName, setIfaceStateName] = useState('ether5');
  const [ifaceEnabled, setIfaceEnabled] = useState(true);

  const [mtuIface, setMtuIface] = useState('ether6');
  const [mtuValue, setMtuValue] = useState(9000);

  const [bondName, setBondName] = useState('bond1');
  const [bondSlaves, setBondSlaves] = useState('ether7,ether8');
  const [bondMode, setBondMode] = useState('802.3ad');

  // Derived commands from builders
  const bridgeCmds = useMemo(() => buildBridgeCommand(bridgeName, vlanFiltering), [bridgeName, vlanFiltering]);
  const accessCmds = useMemo(() => buildAccessCommands(accessBridge, accessIface, accessVlan), [accessBridge, accessIface, accessVlan]);
  const trunkCmds = useMemo(() => {
    const vlanList = trunkVlans.split(',').map((v) => Number(v.trim())).filter((v) => !Number.isNaN(v));
    return buildTrunkCommands(trunkBridge, trunkIface, vlanList);
  }, [trunkBridge, trunkIface, trunkVlans]);
  const stateCmds = useMemo(() => buildInterfaceState(ifaceStateName, ifaceEnabled), [ifaceStateName, ifaceEnabled]);
  const mtuCmds = useMemo(() => buildMtu(mtuIface, mtuValue), [mtuIface, mtuValue]);
  const bondCmds = useMemo(() => buildBonding(bondName, bondSlaves, bondMode), [bondName, bondSlaves, bondMode]);

  async function handleGenerate() {
    setGenError(null);
    const msg = promptText.trim();
    if (!msg) {
      setGenError('Vui lòng nhập prompt trước khi gen.');
      return;
    }
    setGenLoading(true);
    try {
      const res = await api.post('/v1/deployments/generate', {
        message: msg,
        taskType: 'mikrotik-config',
        targetDevice: 'mikrotik',
      });
      const data = res.data || {};
      console.log('Legacy generation response:', data);
      
      // Extract commands - check multiple possible structures
      let commands = data.commands;
      if (!commands && data.deployment?.commands) {
        commands = data.deployment.commands;
      }
      if (!commands && data.result?.commands) {
        commands = data.result.commands;
      }
      
      setGeneration({
        generationId: data.generationId,
        sessionId: data.sessionId,
        display: data.display,
        taskDescription: data.taskDescription,
        commands: commands || [],
        // meta flags from backend to distinguish reasoning vs final output
        isFinal: !!data.isFinal,
        isReasoning: !!data.isReasoning,
        reasoningText: data.explanation || null,
      });
      if (data.sessionId) {
        await loadFullSession(data.sessionId);
      }
    } catch (err: any) {
      console.error('AI generate error:', err);
      const msg2 = err?.response?.data?.message || err?.message || 'Generate thất bại';
      setGenError(msg2);
    } finally {
      setGenLoading(false);
    }
  }

  async function loadFullSession(sessionId: string) {
    try {
      const res = await api.get(`/v1/deployments/${sessionId}`);
      const data = res.data || {};
      const cmds: string[] = Array.isArray(data.commands)
        ? data.commands.map((c: any) => (typeof c === 'string' ? c : c?.command).trim()).filter(Boolean)
        : [];
      if (cmds.length) setFullCommands(cmds);
    } catch (err) {
      console.warn('Load session commands failed:', err);
    }
  }

  async function handleConfirmExecution() {
    if (!generation?.sessionId) return;
    try {
      await api.post(`/v1/deployments/${generation.sessionId}/confirm`, { approved: true });
      alert('Đã xác nhận thực thi cho phiên AI.');
    } catch (err) {
      console.error('Confirm execution failed:', err);
      alert('Xác nhận thực thi thất bại.');
    }
  }

  // MikroTik Plan API functions
  async function handleGeneratePlanWithAI() {
    setPlanError(null);
    const intent = promptText.trim();
    if (!intent) {
      setPlanError('Vui lòng nhập prompt hoặc build từ Prompt Builder');
      return;
    }

    setPlanLoading(true);
    try {
      // Mock device facts (in production, get from router via API)
      const mockFacts = {
        deviceId: 'device-001',
        routeros: routerOS,
        model: deviceModel,
        interfaces: [
          { name: 'ether1', type: 'ether' as const, disabled: false },
          { name: 'ether2', type: 'ether' as const, disabled: false },
          { name: 'bridge-lan', type: 'bridge' as const, disabled: false },
        ],
        bridges: [],
        vlans: [],
        ipAddresses: [],
        services: [],
        routes: [],
      };

      const selectedModules = [];
      if (includeFirewall) selectedModules.push('firewall');
      if (includeNat) selectedModules.push('nat');
      if (includeMangle) selectedModules.push('mangle');
      if (includeRouting) selectedModules.push('routing');
      if (includeDhcp) selectedModules.push('dhcp-server', 'dhcp-client');

      const res = await api.post('/v1/mikrotik/plan', {
        intent,
        deviceId: 'device-001',
        facts: mockFacts,
        selectedModules,
      });

      const plan = res.data?.plan || res.data;
      setMikrotikPlan(plan);
      
      // Auto-compile plan
      await handleCompilePlan(plan, mockFacts);
    } catch (err: any) {
      console.error('Plan generation error:', err);
      const msg = err?.response?.data?.message || err?.message || 'Tạo Plan thất bại';
      setPlanError(msg);
    } finally {
      setPlanLoading(false);
    }
  }

  async function handleCompilePlan(plan?: any, facts?: any) {
    const planToCompile = plan || mikrotikPlan;
    if (!planToCompile) {
      setPlanError('Không có Plan để compile');
      return;
    }

    try {
      const mockFacts = facts || {
        deviceId: 'device-001',
        routeros: routerOS,
        model: deviceModel,
        interfaces: [
          { name: 'ether1', type: 'ether' as const, disabled: false },
          { name: 'ether2', type: 'ether' as const, disabled: false },
        ],
        bridges: [],
        vlans: [],
        ipAddresses: [],
        services: [],
        routes: [],
      };

      const res = await api.post('/v1/mikrotik/compile', {
        plan: planToCompile,
        facts: mockFacts,
      });

      const result = res.data?.result || res.data;
      setCompiledResult(result);
    } catch (err: any) {
      console.error('Compilation error:', err);
      setPlanError(err?.response?.data?.message || 'Compile Plan thất bại');
    }
  }

  async function handleValidatePlan() {
    if (!mikrotikPlan) {
      setPlanError('Không có Plan để validate');
      return;
    }

    try {
      const mockFacts = {
        deviceId: 'device-001',
        routeros: routerOS,
        model: deviceModel,
        interfaces: [
          { name: 'ether1', type: 'ether' as const, disabled: false },
          { name: 'ether2', type: 'ether' as const, disabled: false },
        ],
        bridges: [],
        vlans: [],
        ipAddresses: [],
        services: [],
        routes: [],
      };

      const res = await api.post('/v1/mikrotik/validate', {
        plan: mikrotikPlan,
        facts: mockFacts,
      });

      setValidationResult(res.data);
    } catch (err: any) {
      console.error('Validation error:', err);
      setPlanError(err?.response?.data?.message || 'Validate Plan thất bại');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-blue-600/20 text-blue-200">
          <Network className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-white">MikroTik Configuration</h1>
          <p className="text-slate-400 text-sm">Bridge, VLAN, interface state, MTU, bonding — sinh lệnh nhanh để dán vào RouterOS.</p>
          {/* AI Generation Controls */}
          <div className="mt-3 space-y-2">
            {/* Prompt Builder */}
            <div className="p-3 bg-slate-800 border border-slate-700 rounded-md space-y-2">
              <div className="text-xs text-slate-300 font-medium">Prompt Builder (AI)</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <label className="text-xs text-slate-300 space-y-1">
                  Model
                  <input value={deviceModel} onChange={(e)=>setDeviceModel(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-slate-100 text-sm"/>
                </label>
                <label className="text-xs text-slate-300 space-y-1">
                  RouterOS
                  <input value={routerOS} onChange={(e)=>setRouterOS(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-slate-100 text-sm"/>
                </label>
                <label className="text-xs text-slate-300 space-y-1">
                  Bridge LAN
                  <input value={bridgeLan} onChange={(e)=>setBridgeLan(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-slate-100 text-sm"/>
                </label>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <label className="text-xs text-slate-300 space-y-1 md:col-span-2">
                  WAN config
                  <input value={wanConfig} onChange={(e)=>setWanConfig(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-slate-100 text-sm"/>
                </label>
                <label className="text-xs text-slate-300 space-y-1">
                  LB Method
                  <select value={lbMethod} onChange={(e)=>setLbMethod(e.target.value as any)} className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-slate-100 text-sm">
                    <option value="pcc">PCC</option>
                    <option value="ecmp">ECMP</option>
                    <option value="failover">Failover</option>
                  </select>
                </label>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <label className="text-xs text-slate-300 space-y-1">
                  VLANs
                  <input value={vlanListStr} onChange={(e)=>setVlanListStr(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-slate-100 text-sm"/>
                </label>
                <label className="text-xs text-slate-300 space-y-1">
                  Security
                  <select value={securityProfile} onChange={(e)=>setSecurityProfile(e.target.value as any)} className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-slate-100 text-sm">
                    <option value="strict">Strict</option>
                    <option value="standard">Standard</option>
                    <option value="relaxed">Relaxed</option>
                  </select>
                </label>
                <label className="text-xs text-slate-300 space-y-1">
                  Goals
                  <input value={extraGoals} onChange={(e)=>setExtraGoals(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-slate-100 text-sm"/>
                </label>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-slate-300">
                <label className="inline-flex items-center gap-2"><input type="checkbox" checked={includeFirewall} onChange={(e)=>setIncludeFirewall(e.target.checked)} /> Firewall</label>
                <label className="inline-flex items-center gap-2"><input type="checkbox" checked={includeNat} onChange={(e)=>setIncludeNat(e.target.checked)} /> NAT</label>
                <label className="inline-flex items-center gap-2"><input type="checkbox" checked={includeMangle} onChange={(e)=>setIncludeMangle(e.target.checked)} /> Mangle</label>
                <label className="inline-flex items-center gap-2"><input type="checkbox" checked={includeRouting} onChange={(e)=>setIncludeRouting(e.target.checked)} /> Routing</label>
                <label className="inline-flex items-center gap-2"><input type="checkbox" checked={includeDhcp} onChange={(e)=>setIncludeDhcp(e.target.checked)} /> DHCP</label>
                <label className="inline-flex items-center gap-2"><input type="checkbox" checked={includePools} onChange={(e)=>setIncludePools(e.target.checked)} /> IP Pools</label>
                <label className="inline-flex items-center gap-2"><input type="checkbox" checked={includeNetworks} onChange={(e)=>setIncludeNetworks(e.target.checked)} /> Networks</label>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPromptText(buildPromptFromBuilder())}
                  className="px-3 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 transition-colors"
                >Build Prompt</button>
                <span className="text-slate-400 text-xs">Xem/sửa prompt ở ô bên dưới</span>
              </div>
            </div>
            <textarea
              placeholder="Nhập prompt AI, ví dụ: Tôi có 1 thiết bị router mikrotik mới RB5009, chạy cân bằng tải bằng pcc trên 2 wan với các VLAN 10,20,30..."
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-slate-100 text-sm min-h-[100px]"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={handleGenerate}
                disabled={genLoading}
                className="px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors inline-flex items-center gap-2"
              >
                {genLoading ? 'Generating…' : 'Generate with AI (Legacy)'}
              </button>
              <button
                onClick={handleGeneratePlanWithAI}
                disabled={planLoading}
                className="px-3 py-2 rounded-lg bg-green-600 text-white hover:bg-green-500 transition-colors inline-flex items-center gap-2"
              >
                {planLoading ? 'Generating Plan…' : '🚀 Generate Plan (Safe AI)'}
              </button>
              <button
                onClick={() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })}
                className="px-3 py-2 rounded-lg bg-slate-700 text-slate-200 hover:bg-slate-600 transition-colors"
              >
                Jump to commands
              </button>
              {genError && <span className="text-rose-400 text-sm ml-2">{genError}</span>}
              {planError && <span className="text-rose-400 text-sm ml-2">{planError}</span>}
            </div>
            {generation?.display && (
              <div className="p-3 bg-slate-800 border border-slate-700 rounded-md">
                <div className="text-xs text-slate-300 font-medium">AI Summary</div>
                <div className="text-sm text-slate-100 mt-1">{generation.display}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 shadow-md space-y-4">
          <div className="flex items-center gap-2 text-slate-200 text-sm font-semibold">
            <Shield className="w-5 h-5 text-blue-400" /> Bridge & VLAN Filtering
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="text-xs text-slate-300 space-y-1">
              Tên bridge
              <input value={bridgeName} onChange={(e) => setBridgeName(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-slate-100 text-sm" />
            </label>
            <label className="text-xs text-slate-300 space-y-1">
              VLAN Filtering
              <select value={vlanFiltering ? 'on' : 'off'} onChange={(e) => setVlanFiltering(e.target.value === 'on')} className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-slate-100 text-sm">
                <option value="on">Bật</option>
                <option value="off">Tắt</option>
              </select>
            </label>
          </div>
          <CommandBlock title="Bridge commands" commands={bridgeCmds} />
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 shadow-md space-y-4">
          <div className="flex items-center gap-2 text-slate-200 text-sm font-semibold">
            <SlidersHorizontal className="w-5 h-5 text-amber-300" /> Access Port (untagged)
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="text-xs text-slate-300 space-y-1">
              Bridge
              <input value={accessBridge} onChange={(e) => setAccessBridge(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-slate-100 text-sm" />
            </label>
            <label className="text-xs text-slate-300 space-y-1">
              Interface
              <input value={accessIface} onChange={(e) => setAccessIface(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-slate-100 text-sm" />
            </label>
            <label className="text-xs text-slate-300 space-y-1">
              VLAN (PVID)
              <input type="number" value={accessVlan} onChange={(e) => setAccessVlan(Number(e.target.value))} className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-slate-100 text-sm" />
            </label>
          </div>
          <CommandBlock title="Access commands" commands={accessCmds} />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 shadow-md space-y-4">
          <div className="flex items-center gap-2 text-slate-200 text-sm font-semibold">
            <SlidersHorizontal className="w-5 h-5 text-green-300" /> Trunk Port (tagged)
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="text-xs text-slate-300 space-y-1">
              Bridge
              <input value={trunkBridge} onChange={(e) => setTrunkBridge(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-slate-100 text-sm" />
            </label>
            <label className="text-xs text-slate-300 space-y-1">
              Interface
              <input value={trunkIface} onChange={(e) => setTrunkIface(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-slate-100 text-sm" />
            </label>
            <label className="text-xs text-slate-300 space-y-1">
              VLAN IDs (comma)
              <input value={trunkVlans} onChange={(e) => setTrunkVlans(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-slate-100 text-sm" />
            </label>
          </div>
          <CommandBlock title="Trunk commands" commands={trunkCmds} />
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 shadow-md space-y-4">
          <div className="flex items-center gap-2 text-slate-200 text-sm font-semibold">
            <PlugZap className="w-5 h-5 text-yellow-300" /> Interface State & MTU
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="text-xs text-slate-300 space-y-1">
              Interface
              <input value={ifaceStateName} onChange={(e) => setIfaceStateName(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-slate-100 text-sm" />
            </label>
            <label className="text-xs text-slate-300 space-y-1">
              Trạng thái
              <select value={ifaceEnabled ? 'enabled' : 'disabled'} onChange={(e) => setIfaceEnabled(e.target.value === 'enabled')} className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-slate-100 text-sm">
                <option value="enabled">Enable</option>
                <option value="disabled">Disable</option>
              </select>
            </label>
            <label className="text-xs text-slate-300 space-y-1">
              Interface (MTU)
              <input value={mtuIface} onChange={(e) => setMtuIface(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-slate-100 text-sm" />
            </label>
            <label className="text-xs text-slate-300 space-y-1">
              MTU
              <input type="number" value={mtuValue} onChange={(e) => setMtuValue(Number(e.target.value))} className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-slate-100 text-sm" />
            </label>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <CommandBlock title="Enable/Disable" commands={stateCmds} />
            <CommandBlock title="Set MTU" commands={mtuCmds} />
          </div>
        </div>
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 shadow-md space-y-4">
        <div className="flex items-center gap-2 text-slate-200 text-sm font-semibold">
          <SlidersHorizontal className="w-5 h-5 text-cyan-300" /> Bonding (LACP)
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="text-xs text-slate-300 space-y-1">
            Bond name
            <input value={bondName} onChange={(e) => setBondName(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-slate-100 text-sm" />
          </label>
          <label className="text-xs text-slate-300 space-y-1">
            Slaves (comma)
            <input value={bondSlaves} onChange={(e) => setBondSlaves(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-slate-100 text-sm" />
          </label>
          <label className="text-xs text-slate-300 space-y-1">
            Mode
            <select value={bondMode} onChange={(e) => setBondMode(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-slate-100 text-sm">
              <option value="802.3ad">802.3ad (LACP)</option>
              <option value="active-backup">active-backup</option>
              <option value="balance-rr">balance-rr</option>
              <option value="broadcast">broadcast</option>
            </select>
          </label>
        </div>
        <CommandBlock title="Bonding commands" commands={bondCmds} />
      </div>

      {/* NEW: MikroTik Command Builder Cards */}
      <div className="bg-gradient-to-r from-blue-900/30 to-purple-900/30 border border-blue-700/50 rounded-xl p-6 shadow-lg">
        <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
          <Shield className="w-6 h-6 text-blue-400" />
          MikroTik Command Builder
        </h2>
        <p className="text-slate-300 text-sm mb-4">
          Configure each module with forms below. Commands are generated deterministically - no AI hallucination.
        </p>
        
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <SystemCard />
          <ServicesCard />
          <DhcpServerCard />
          <FirewallCard />
          <NatCard />
        </div>
      </div>

      {/* AI Generated Commands (summary + full) */}
      {generation?.commands && Array.isArray(generation.commands) && (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 shadow-md space-y-3">
          <div className="text-slate-200 text-sm font-semibold">AI Command Summary (Legacy)</div>
          {generation?.isReasoning && (
            <div className="mt-2 mb-2 p-2 bg-yellow-900/20 border border-yellow-800 rounded-md text-yellow-200 text-xs">
              ⚠️ LLM returned intermediate reasoning instead of final commands. Use "Generate Plan (Safe AI)" for structured JSON output, or re-run generation.
            </div>
          )}
          {generation.commands.map((item, idx) => {
            if (typeof item === 'string') {
              return <CommandBlock key={idx} title={`AI Command ${idx + 1}`} commands={[item]} />;
            }
            const title = item?.title || `AI Command ${idx + 1}`;
            const cmd = item?.command ? [item.command] : [];
            return <CommandBlock key={idx} title={title} commands={cmd} />;
          })}
          {generation?.sessionId && (
            <div className="flex items-center gap-2">
              <button onClick={() => loadFullSession(generation.sessionId!)} className="px-3 py-2 rounded-md bg-slate-700 text-slate-200 hover:bg-slate-600">Tải đầy đủ lệnh</button>
              <button onClick={handleConfirmExecution} className="px-3 py-2 rounded-md bg-green-600 text-white hover:bg-green-500">Xác nhận thực thi</button>
            </div>
          )}
        </div>
      )}

      {/* MikroTik Plan JSON & Compiled Results */}
      {mikrotikPlan && (
        <div className="bg-gradient-to-r from-green-900/30 to-blue-900/30 border border-green-700/50 rounded-xl p-6 shadow-lg space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Shield className="w-6 h-6 text-green-400" />
              Generated Plan JSON (Safe AI Output)
            </h2>
            <div className="flex gap-2">
              <button
                onClick={handleValidatePlan}
                className="px-3 py-2 rounded-md bg-yellow-600 text-white hover:bg-yellow-500 text-sm"
              >
                🔍 Validate Plan
              </button>
              <button
                onClick={() => handleCompilePlan()}
                className="px-3 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-500 text-sm"
              >
                ⚙️ Compile to Commands
              </button>
            </div>
          </div>

          <div className="bg-slate-900 rounded-lg p-4 border border-slate-700">
            <div className="text-xs text-slate-400 mb-2">Target: {mikrotikPlan.target?.model} - RouterOS {mikrotikPlan.target?.routeros}</div>
            <div className="text-sm text-slate-200 mb-3">
              <strong>Description:</strong> {mikrotikPlan.description}
            </div>
            
            {mikrotikPlan.assumptions && mikrotikPlan.assumptions.length > 0 && (
              <div className="mb-3">
                <div className="text-xs text-slate-400 mb-1">Assumptions:</div>
                <ul className="text-xs text-slate-300 list-disc list-inside space-y-1">
                  {mikrotikPlan.assumptions.map((assumption: string, idx: number) => (
                    <li key={idx}>{assumption}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mb-3">
              <div className="text-xs text-slate-400 mb-1">Steps ({mikrotikPlan.steps?.length || 0}):</div>
              <div className="space-y-2">
                {mikrotikPlan.steps?.map((step: any, idx: number) => (
                  <div key={idx} className="bg-slate-800 rounded p-2 border border-slate-700">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-slate-200">
                        {idx + 1}. {step.title}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        step.risk === 'high' ? 'bg-red-600/30 text-red-300' :
                        step.risk === 'medium' ? 'bg-yellow-600/30 text-yellow-300' :
                        'bg-green-600/30 text-green-300'
                      }`}>
                        {step.risk}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400">Module: {step.module} | Action: {step.action}</div>
                  </div>
                ))}
              </div>
            </div>

            <details className="text-xs">
              <summary className="text-slate-400 cursor-pointer hover:text-slate-300">View Full Plan JSON</summary>
              <pre className="mt-2 bg-slate-950 p-3 rounded overflow-x-auto text-slate-300">
                {JSON.stringify(mikrotikPlan, null, 2)}
              </pre>
            </details>
          </div>
        </div>
      )}

      {/* Validation Result */}
      {validationResult && (
        <div className={`rounded-xl p-6 shadow-lg border ${
          validationResult.valid 
            ? 'bg-green-900/20 border-green-700/50' 
            : 'bg-red-900/20 border-red-700/50'
        }`}>
          <h3 className="text-lg font-bold text-white mb-3">
            {validationResult.valid ? '✅ Validation Passed' : '❌ Validation Failed'}
          </h3>
          
          {validationResult.errors && validationResult.errors.length > 0 && (
            <div className="mb-3">
              <div className="text-sm font-semibold text-red-300 mb-2">Errors:</div>
              {validationResult.errors.map((err: any, idx: number) => (
                <div key={idx} className="bg-red-950/50 border border-red-800 rounded p-2 mb-2">
                  <div className="text-sm text-red-200">{err.message}</div>
                  <div className="text-xs text-red-400">Step: {err.step} | Module: {err.module}</div>
                </div>
              ))}
            </div>
          )}

          {validationResult.warnings && validationResult.warnings.length > 0 && (
            <div className="mb-3">
              <div className="text-sm font-semibold text-yellow-300 mb-2">Warnings:</div>
              {validationResult.warnings.map((warn: any, idx: number) => (
                <div key={idx} className="bg-yellow-950/50 border border-yellow-800 rounded p-2 mb-2">
                  <div className="text-sm text-yellow-200">{warn.message}</div>
                  <div className="text-xs text-yellow-400">Level: {warn.level}</div>
                </div>
              ))}
            </div>
          )}

          {validationResult.policyViolations && validationResult.policyViolations.length > 0 && (
            <div>
              <div className="text-sm font-semibold text-orange-300 mb-2">Policy Violations:</div>
              {validationResult.policyViolations.map((violation: any, idx: number) => (
                <div key={idx} className="bg-orange-950/50 border border-orange-800 rounded p-2 mb-2">
                  <div className="text-sm text-orange-200">{violation.message}</div>
                  <div className="text-xs text-orange-400">Policy: {violation.policy} | Severity: {violation.severity}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Compiled Commands */}
      {compiledResult && (
        <div className="bg-gradient-to-r from-purple-900/30 to-pink-900/30 border border-purple-700/50 rounded-xl p-6 shadow-lg space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Network className="w-6 h-6 text-purple-400" />
              Compiled RouterOS Commands
            </h2>
            <div className="text-sm text-slate-400">
              Total: {compiledResult.allCommands?.length || 0} commands | 
              Duration: {compiledResult.estimatedDuration}
            </div>
          </div>

          {compiledResult.warnings && compiledResult.warnings.length > 0 && (
            <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-lg p-3">
              <div className="text-sm font-semibold text-yellow-300 mb-2">⚠️ Compilation Warnings:</div>
              {compiledResult.warnings.map((warn: any, idx: number) => (
                <div key={idx} className="text-xs text-yellow-200 mb-1">
                  • {warn.message} {warn.module && `(${warn.module})`}
                </div>
              ))}
            </div>
          )}

          {compiledResult.commandsByModule && Object.entries(compiledResult.commandsByModule).map(([module, moduleCmd]: [string, any]) => (
            <div key={module} className="bg-slate-900 rounded-lg p-4 border border-slate-700">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-white">{moduleCmd.title}</h3>
                <span className={`text-xs px-2 py-0.5 rounded ${
                  moduleCmd.risk === 'high' ? 'bg-red-600/30 text-red-300' :
                  moduleCmd.risk === 'medium' ? 'bg-yellow-600/30 text-yellow-300' :
                  'bg-green-600/30 text-green-300'
                }`}>
                  {moduleCmd.risk} risk
                </span>
              </div>
              <CommandBlock title={module} commands={moduleCmd.commands} />
            </div>
          ))}

          <div className="flex gap-2">
            <button
              onClick={() => {
                navigator.clipboard.writeText(compiledResult.allCommands.join('\n'));
                alert('Đã copy tất cả lệnh!');
              }}
              className="px-4 py-2 rounded-md bg-purple-600 text-white hover:bg-purple-500"
            >
              📋 Copy All Commands
            </button>
            <button
              onClick={() => {
                // TODO: Implement apply via RouterOS API
                alert('Chức năng Apply sẽ được triển khai với RouterOS API client');
              }}
              className="px-4 py-2 rounded-md bg-red-600 text-white hover:bg-red-500"
            >
              🚀 Apply to Router (Coming Soon)
            </button>
          </div>
        </div>
      )}

      {fullCommands && fullCommands.length > 0 && (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 shadow-md space-y-3">
          <div className="text-slate-200 text-sm font-semibold">AI Full Commands</div>
          <CommandBlock title="Full AI Commands" commands={fullCommands} />
        </div>
      )}
    </div>
  );
}
