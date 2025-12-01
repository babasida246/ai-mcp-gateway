import { useState, useEffect, useRef } from 'react';
import { Download, Trash2, Pause, Play } from 'lucide-react';

interface LogEntry {
  timestamp: string;
  container: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
}

export default function Logs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [selectedContainer, setSelectedContainer] = useState('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [filter, setFilter] = useState('');
  const logsEndRef = useRef<HTMLDivElement>(null);

  const containers = ['all', 'ai-mcp-gateway', 'ai-mcp-postgres', 'ai-mcp-redis', 'ai-mcp-dashboard'];

  useEffect(() => {
    // Simulate log streaming
    if (!isPaused) {
      const interval = setInterval(() => {
        const newLog: LogEntry = {
          timestamp: new Date().toISOString(),
          container: containers[Math.floor(Math.random() * (containers.length - 1)) + 1],
          level: ['info', 'warn', 'error', 'debug'][Math.floor(Math.random() * 4)] as LogEntry['level'],
          message: generateRandomLogMessage(),
        };
        
        setLogs((prev) => [...prev.slice(-99), newLog]); // Keep last 100 logs
      }, 2000);

      return () => clearInterval(interval);
    }
  }, [isPaused]);

  useEffect(() => {
    if (autoScroll) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  function generateRandomLogMessage(): string {
    const messages = [
      'Processing request...',
      'Database connection established',
      'Cache hit for key: user:123',
      'API request received: POST /v1/chat/completions',
      'Model response received in 1.23s',
      'Cost tracking updated: $0.0023',
      'Layer escalation triggered: L0 -> L1',
      'Health check completed successfully',
      'Redis connection pool active: 5/10',
      'Request completed: 200 OK',
    ];
    return messages[Math.floor(Math.random() * messages.length)];
  }

  function clearLogs() {
    setLogs([]);
  }

  function downloadLogs() {
    const content = logs.map(log => 
      `[${log.timestamp}] [${log.container}] [${log.level.toUpperCase()}] ${log.message}`
    ).join('\n');
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `logs-${new Date().toISOString()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const filteredLogs = logs.filter(log => {
    const matchesContainer = selectedContainer === 'all' || log.container === selectedContainer;
    const matchesFilter = !filter || log.message.toLowerCase().includes(filter.toLowerCase());
    return matchesContainer && matchesFilter;
  });

  const getLevelColor = (level: LogEntry['level']) => {
    switch (level) {
      case 'error': return 'text-red-400';
      case 'warn': return 'text-yellow-400';
      case 'info': return 'text-blue-400';
      case 'debug': return 'text-slate-400';
      default: return 'text-white';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-white">Docker Logs</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsPaused(!isPaused)}
            className={`btn-secondary flex items-center gap-2 ${isPaused ? 'bg-yellow-500/20 text-yellow-400' : ''}`}
          >
            {isPaused ? (
              <>
                <Play className="w-4 h-4" />
                Resume
              </>
            ) : (
              <>
                <Pause className="w-4 h-4" />
                Pause
              </>
            )}
          </button>
          <button onClick={downloadLogs} className="btn-secondary flex items-center gap-2">
            <Download className="w-4 h-4" />
            Download
          </button>
          <button onClick={clearLogs} className="btn-danger flex items-center gap-2">
            <Trash2 className="w-4 h-4" />
            Clear
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="card p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2">
              Container
            </label>
            <select
              value={selectedContainer}
              onChange={(e) => setSelectedContainer(e.target.value)}
              className="input w-full"
            >
              {containers.map((container) => (
                <option key={container} value={container}>
                  {container === 'all' ? 'All Containers' : container}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2">
              Filter
            </label>
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search logs..."
              className="input w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2">
              Options
            </label>
            <label className="flex items-center gap-2 text-white cursor-pointer">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
                className="w-4 h-4 text-blue-500 rounded focus:ring-2 focus:ring-blue-500"
              />
              Auto-scroll
            </label>
          </div>
        </div>
      </div>

      {/* Logs Display */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm text-slate-400">
            Showing {filteredLogs.length} log{filteredLogs.length !== 1 ? 's' : ''}
          </div>
          {isPaused && (
            <div className="badge badge-warning">
              <Pause className="w-3 h-3 mr-1" />
              Paused
            </div>
          )}
        </div>

        <div className="bg-slate-950 rounded-lg p-4 h-[600px] overflow-y-auto font-mono text-sm">
          {filteredLogs.length === 0 ? (
            <div className="flex items-center justify-center h-full text-slate-400">
              No logs to display
            </div>
          ) : (
            <div className="space-y-1">
              {filteredLogs.map((log, index) => (
                <div key={index} className="flex gap-3 hover:bg-slate-800/50 px-2 py-1 rounded">
                  <span className="text-slate-500 shrink-0">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  <span className="text-purple-400 shrink-0 w-40 truncate">
                    {log.container}
                  </span>
                  <span className={`${getLevelColor(log.level)} shrink-0 w-16 uppercase`}>
                    {log.level}
                  </span>
                  <span className="text-slate-300 break-all">
                    {log.message}
                  </span>
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
