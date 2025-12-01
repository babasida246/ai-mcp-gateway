import { useState } from 'react';
import { Bell, Mail, Slack, Webhook, Plus, Trash2 } from 'lucide-react';

interface Alert {
  id: string;
  name: string;
  type: 'cost' | 'latency' | 'errors' | 'uptime';
  condition: string;
  threshold: number;
  channels: ('email' | 'slack' | 'webhook')[];
  enabled: boolean;
}

export default function Alerts() {
  const [alerts, setAlerts] = useState<Alert[]>([
    {
      id: '1',
      name: 'High Cost Alert',
      type: 'cost',
      condition: 'greater_than',
      threshold: 10,
      channels: ['email', 'slack'],
      enabled: true,
    },
    {
      id: '2',
      name: 'Slow Response',
      type: 'latency',
      condition: 'greater_than',
      threshold: 5,
      channels: ['email'],
      enabled: true,
    },
    {
      id: '3',
      name: 'Error Rate Spike',
      type: 'errors',
      condition: 'greater_than',
      threshold: 5,
      channels: ['email', 'slack', 'webhook'],
      enabled: false,
    },
  ]);

  const [isCreating, setIsCreating] = useState(false);
  const [newAlert, setNewAlert] = useState<Omit<Alert, 'id'>>({
    name: '',
    type: 'cost',
    condition: 'greater_than',
    threshold: 0,
    channels: ['email'],
    enabled: true,
  });

  function createAlert() {
    if (!newAlert.name.trim()) return;

    const alert: Alert = {
      ...newAlert,
      id: Date.now().toString(),
    };

    setAlerts([...alerts, alert]);
    setNewAlert({
      name: '',
      type: 'cost',
      condition: 'greater_than',
      threshold: 0,
      channels: ['email'],
      enabled: true,
    });
    setIsCreating(false);
  }

  function deleteAlert(id: string) {
    if (confirm('Delete this alert?')) {
      setAlerts(alerts.filter(a => a.id !== id));
    }
  }

  function toggleAlert(id: string) {
    setAlerts(alerts.map(a => a.id === id ? { ...a, enabled: !a.enabled } : a));
  }

  function toggleChannel(id: string, channel: 'email' | 'slack' | 'webhook') {
    setAlerts(alerts.map(a => {
      if (a.id === id) {
        const channels = a.channels.includes(channel)
          ? a.channels.filter(c => c !== channel)
          : [...a.channels, channel];
        return { ...a, channels };
      }
      return a;
    }));
  }

  const typeLabels: Record<Alert['type'], string> = {
    cost: 'Cost ($)',
    latency: 'Latency (s)',
    errors: 'Error Rate (%)',
    uptime: 'Uptime (%)',
  };

  const typeIcons: Record<Alert['type'], string> = {
    cost: '💰',
    latency: '⏱️',
    errors: '⚠️',
    uptime: '✅',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-white">Alerts & Notifications</h1>
        <button
          onClick={() => setIsCreating(true)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Create Alert
        </button>
      </div>

      {/* Create Alert Form */}
      {isCreating && (
        <div className="card p-6">
          <h2 className="text-xl font-bold text-white mb-4">Create New Alert</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-2">
                Alert Name
              </label>
              <input
                type="text"
                value={newAlert.name}
                onChange={(e) => setNewAlert({ ...newAlert, name: e.target.value })}
                placeholder="e.g., High Cost Alert"
                className="input w-full"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">
                  Metric Type
                </label>
                <select
                  value={newAlert.type}
                  onChange={(e) => setNewAlert({ ...newAlert, type: e.target.value as Alert['type'] })}
                  className="input w-full"
                >
                  <option value="cost">Cost</option>
                  <option value="latency">Latency</option>
                  <option value="errors">Error Rate</option>
                  <option value="uptime">Uptime</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">
                  Condition
                </label>
                <select
                  value={newAlert.condition}
                  onChange={(e) => setNewAlert({ ...newAlert, condition: e.target.value })}
                  className="input w-full"
                >
                  <option value="greater_than">Greater than</option>
                  <option value="less_than">Less than</option>
                  <option value="equal_to">Equal to</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">
                  Threshold ({typeLabels[newAlert.type].split(' ')[1]})
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={newAlert.threshold}
                  onChange={(e) => setNewAlert({ ...newAlert, threshold: parseFloat(e.target.value) })}
                  className="input w-full"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-2">
                Notification Channels
              </label>
              <div className="flex gap-3">
                {(['email', 'slack', 'webhook'] as const).map((channel) => (
                  <label key={channel} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newAlert.channels.includes(channel)}
                      onChange={(e) => {
                        const channels = e.target.checked
                          ? [...newAlert.channels, channel]
                          : newAlert.channels.filter(c => c !== channel);
                        setNewAlert({ ...newAlert, channels });
                      }}
                      className="w-4 h-4 text-blue-500 rounded"
                    />
                    <span className="text-white capitalize">{channel}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button onClick={createAlert} className="btn-primary">
                Create Alert
              </button>
              <button
                onClick={() => setIsCreating(false)}
                className="btn-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Alerts List */}
      {alerts.length === 0 ? (
        <div className="card p-12 text-center">
          <Bell className="w-16 h-16 text-slate-600 mx-auto mb-4" />
          <div className="text-slate-400 text-lg mb-2">No alerts configured</div>
          <p className="text-slate-500 text-sm">
            Create alerts to get notified about important events
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {alerts.map((alert) => (
            <div key={alert.id} className="card p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-2xl">{typeIcons[alert.type]}</span>
                    <h3 className="text-xl font-bold text-white">{alert.name}</h3>
                    <span className={`badge ${alert.enabled ? 'badge-success' : 'badge-error'}`}>
                      {alert.enabled ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="text-slate-400 text-sm">
                    Triggers when {typeLabels[alert.type]} is {alert.condition.replace('_', ' ')} {alert.threshold}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleAlert(alert.id)}
                    className={`btn-secondary ${alert.enabled ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}
                  >
                    {alert.enabled ? 'Disable' : 'Enable'}
                  </button>
                  <button
                    onClick={() => deleteAlert(alert.id)}
                    className="btn-danger"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-700">
                <div className="text-sm font-semibold text-slate-400 mb-2">Notification Channels</div>
                <div className="flex gap-2">
                  {(['email', 'slack', 'webhook'] as const).map((channel) => {
                    const isActive = alert.channels.includes(channel);
                    const Icon = channel === 'email' ? Mail : channel === 'slack' ? Slack : Webhook;
                    
                    return (
                      <button
                        key={channel}
                        onClick={() => toggleChannel(alert.id, channel)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                          isActive
                            ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50'
                            : 'bg-slate-700 text-slate-400 border border-slate-600'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span className="capitalize">{channel}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
