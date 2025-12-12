import { useMemo, useState } from 'react';
import { Network, PlugZap, Shield, SlidersHorizontal } from 'lucide-react';
import CommandBlock from '../components/mikrotik/CommandBlock';
import {
  buildBridge,
  buildAccessPort,
  buildTrunkPort,
  buildInterfaceState,
  buildMtu,
  buildBonding,
} from '../lib/mikrotik/builders';

export default function MikrotikPage() {
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

  const bridgeCmds = useMemo(() => buildBridge(bridgeName, vlanFiltering), [bridgeName, vlanFiltering]);
  const accessCmds = useMemo(() => buildAccessPort(accessBridge, accessIface, accessVlan), [accessBridge, accessIface, accessVlan]);
  const trunkCmds = useMemo(() => {
    const vlanList = trunkVlans.split(',').map((v) => Number(v.trim())).filter((v) => !Number.isNaN(v));
    return buildTrunkPort(trunkBridge, trunkIface, vlanList);
  }, [trunkBridge, trunkIface, trunkVlans]);
  const stateCmds = useMemo(() => buildInterfaceState(ifaceStateName, ifaceEnabled), [ifaceStateName, ifaceEnabled]);
  const mtuCmds = useMemo(() => buildMtu(mtuIface, mtuValue), [mtuIface, mtuValue]);
  const bondCmds = useMemo(() => buildBonding(bondName, bondSlaves, bondMode), [bondName, bondSlaves, bondMode]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-blue-600/20 text-blue-200">
          <Network className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-white">MikroTik Configuration</h1>
          <p className="text-slate-400 text-sm">Bridge, VLAN, interface state, MTU, bonding — sinh lệnh nhanh để dán vào RouterOS.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 shadow-lg space-y-4">
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

        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 shadow-lg space-y-4">
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
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 shadow-lg space-y-4">
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

        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 shadow-lg space-y-4">
          <div className="flex items-center gap-2 text-slate-200 text-sm font-semibold">
            <PlugZap className="w-5 h-5 text-purple-300" /> Interface State & MTU
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

      <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 shadow-lg space-y-4">
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
    </div>
  );
}
