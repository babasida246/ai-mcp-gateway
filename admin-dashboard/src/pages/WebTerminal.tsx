/**
 * @file WebTerminal Component - Interactive Terminal for AI MCP Gateway
 * @description Full-featured web terminal with SSH, Telnet, and Local shell support.
 * 
 * **Features:**
 * - **Multi-session support**: Multiple terminal tabs with different connection types
 * - **Connection types**: Local shell, SSH (password/key), Telnet
 * - **Quick Actions**: One-click CLI commands for gateway management
 * - **Smart Autocomplete**: Tab completion for common commands
 * - **Command History**: Up/Down arrow navigation through previous commands
 * - **Saved Connections**: Store and reuse connection configurations
 * - **xterm.js Integration**: Full terminal emulation with colors, cursor, etc.
 * 
 * **Keyboard Shortcuts:**
 * - `Tab` - Autocomplete current command
 * - `Up/Down` - Navigate command history
 * - `Enter` - Execute command
 * - `Ctrl+C` - Interrupt current command
 * 
 * **Quick Actions Toolbar:**
 * - Help, Status, Models, Providers, DB Status, Config
 * - Each button sends pre-configured command to terminal
 * 
 * @see {@link ../components/XTerminal.tsx} for terminal rendering
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { Terminal as TerminalIcon, Plus, X, Play, Server, Globe, Monitor, Trash2, RefreshCw, Save, Bookmark, Star, Edit2, Zap, HelpCircle, Activity, Settings, Database, List, ChevronUp, ChevronDown } from 'lucide-react';
import XTerminal, { type XTerminalRef } from '../components/XTerminal';

/** API base URL - configured via environment variable or defaults to localhost */
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

/**
 * Quick CLI command buttons for the terminal toolbar.
 * Each button sends a pre-configured command when clicked.
 */
const CLI_QUICK_COMMANDS = [
  { label: 'Help', command: 'ai-mcp-gateway --help', icon: HelpCircle, color: 'blue' },
  { label: 'Status', command: 'ai-mcp-gateway status', icon: Activity, color: 'green' },
  { label: 'Models', command: 'ai-mcp-gateway models list', icon: List, color: 'purple' },
  { label: 'Providers', command: 'ai-mcp-gateway providers', icon: Server, color: 'orange' },
  { label: 'DB Status', command: 'ai-mcp-gateway db status', icon: Database, color: 'cyan' },
  { label: 'Config', command: 'ai-mcp-gateway config show', icon: Settings, color: 'gray' },
];

/**
 * Autocomplete suggestions for Tab completion.
 * Includes AI MCP Gateway commands and common shell commands.
 * Sorted by relevance when displayed to user.
 */
const CLI_AUTOCOMPLETE = [
  // AI MCP Gateway CLI commands
  'ai-mcp-gateway',
  'ai-mcp-gateway --help',
  'ai-mcp-gateway --version',
  'ai-mcp-gateway status',
  'ai-mcp-gateway models',
  'ai-mcp-gateway models list',
  'ai-mcp-gateway models info',
  'ai-mcp-gateway providers',
  'ai-mcp-gateway db',
  'ai-mcp-gateway db status',
  'ai-mcp-gateway config',
  'ai-mcp-gateway config show',
  'ai-mcp-gateway config set',
  // Common shell commands
  'ls', 'ls -la', 'ls -lah',
  'cd', 'pwd', 'echo',
  'cat', 'head', 'tail',
  'grep', 'find', 'which',
  'docker ps', 'docker logs', 'docker exec',
  'npm', 'npm run', 'npm install',
  'node', 'node --version',
  'curl', 'curl -X GET', 'curl -X POST',
];

/**
 * Terminal session state interface.
 * Represents an active terminal connection.
 */
interface TerminalSession {
  /** Unique session identifier */
  id: string;
  /** Connection type: local shell, SSH, or Telnet */
  type: 'local' | 'ssh' | 'telnet';
  /** ISO timestamp when session was created */
  createdAt: string;
  /** ISO timestamp of last activity */
  lastActivity: string;
  /** Whether the connection is currently active */
  connected: boolean;
  /** Remote host (for SSH/Telnet) */
  host?: string;
  /** Port number (default: 22 for SSH, 23 for Telnet) */
  port?: number;
  /** Username for authentication */
  username?: string;
}

/**
 * Saved connection configuration interface.
 * Used for storing and reusing connection settings.
 */
interface SavedConnection {
  id: string;
  name: string;
  type: 'local' | 'ssh' | 'telnet';
  host?: string;
  port?: number;
  username?: string;
  auth_type?: 'password' | 'private_key' | 'agent' | 'none';
  is_default?: boolean;
  notes?: string;
  created_at: string;
  updated_at: string;
}

type ConnectionType = 'local' | 'ssh' | 'telnet';

/** Helper type for axios error responses */
interface ApiError {
  response?: {
    data?: {
      error?: string;
      details?: string;
    };
  };
  message?: string;
}

/**
 * Extract error message from API error response.
 * @param err - Unknown error object
 * @param defaultMsg - Default message if extraction fails
 * @returns Human-readable error message
 */
function getErrorMessage(err: unknown, defaultMsg: string): string {
  const error = err as ApiError;
  return error.response?.data?.error || error.response?.data?.details || error.message || defaultMsg;
}

/**
 * WebTerminal Component
 * 
 * Main terminal interface component providing multi-session terminal
 * with SSH, Telnet, and Local shell support.
 */
export default function WebTerminal() {
  // Session management state
  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showNewSessionModal, setShowNewSessionModal] = useState(false);
  const [newSessionType, setNewSessionType] = useState<ConnectionType>('local');
  
  // Saved connections state
  const [savedConnections, setSavedConnections] = useState<SavedConnection[]>([]);
  const [showSavedConnections, setShowSavedConnections] = useState(true);
  const [saveConnectionName, setSaveConnectionName] = useState('');
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [editingConnection, setEditingConnection] = useState<SavedConnection | null>(null);
  
  // SSH/Telnet connection form
  const [sshHost, setSshHost] = useState('');
  const [sshPort, setSshPort] = useState('22');
  const [sshUsername, setSshUsername] = useState('');
  const [sshPassword, setSshPassword] = useState('');
  const [sshPrivateKey, setSshPrivateKey] = useState('');
  const [telnetHost, setTelnetHost] = useState('');
  const [telnetPort, setTelnetPort] = useState('23');

  // XTerminal refs - one per session
  const terminalRefs = useRef<Map<string, XTerminalRef>>(new Map());
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Local command buffer for local sessions
  const localCommandBuffer = useRef<Map<string, string>>(new Map());
  
  // Command history for each session
  const commandHistory = useRef<Map<string, string[]>>(new Map());
  const historyIndex = useRef<Map<string, number>>(new Map());
  const tempBuffer = useRef<Map<string, string>>(new Map()); // Store current input when browsing history
  
  // Tab completion state
  const tabCompletionIndex = useRef<Map<string, number>>(new Map());
  const lastTabInput = useRef<Map<string, string>>(new Map());
  
  // Store sessions in ref for use in callbacks without causing re-renders
  const sessionsRef = useRef<TerminalSession[]>([]);
  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  // Function declarations (before useEffect to avoid hoisting issues)
  async function loadSessions() {
    try {
      const response = await axios.get(`${API_BASE}/v1/terminal/sessions`);
      setSessions(response.data.sessions);
    } catch (err) {
      console.error('Failed to load sessions:', err);
    }
  }

  async function loadSavedConnections() {
    try {
      const response = await axios.get(`${API_BASE}/v1/terminal/connections`);
      setSavedConnections(response.data.connections || []);
    } catch (err) {
      console.error('Failed to load saved connections:', err);
    }
  }

  // Load sessions on mount
  useEffect(() => {
    loadSessions();
    loadSavedConnections();
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  // Focus terminal when active session changes
  useEffect(() => {
    if (activeSession) {
      setTimeout(() => {
        const termRef = terminalRefs.current.get(activeSession);
        termRef?.focus();
        termRef?.fit();
      }, 50);
    }
  }, [activeSession]);

  // Poll for output from SSH/Telnet sessions (realtime output)
  useEffect(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    if (!activeSession) return;
    
    const session = sessions.find(s => s.id === activeSession);
    if (!session || session.type === 'local') return;

    console.log('[Terminal] Starting output polling for session:', activeSession, 'type:', session.type);

    // Track last received output length to avoid re-displaying same content
    let lastOutputLength = 0;

    // Start polling for SSH/Telnet sessions
    pollIntervalRef.current = setInterval(async () => {
      try {
        // Don't clear immediately - let server accumulate data
        const response = await axios.get(`${API_BASE}/v1/terminal/${activeSession}/output`);
        const output = response.data.output;
        if (output && output.length > 0) {
          const outputText = output.join('');
          // Only process new content
          if (outputText.length > lastOutputLength) {
            const newContent = outputText.substring(lastOutputLength);
            console.log('[Terminal] Received NEW output from poll:', { 
              sessionId: activeSession, 
              totalLength: outputText.length,
              newLength: newContent.length,
              preview: newContent.substring(0, 100) 
            });
            lastOutputLength = outputText.length;
            
            const termRef = terminalRefs.current.get(activeSession);
            if (termRef) {
              termRef.write(newContent);
            } else {
              console.warn('[Terminal] termRef is null for session:', activeSession);
            }
          }
          
          // DISABLED: Auto-clear temporarily for debugging
          // Clear buffer on server only after we've accumulated some data
          // and displayed it (avoid clearing during rapid typing)
          // if (outputText.length > 1000) {
          //   await axios.get(`${API_BASE}/v1/terminal/${activeSession}/output?clear=true`);
          //   lastOutputLength = 0;
          // }
        }
      } catch (err) {
        // Ignore errors during polling - session might be closed
        console.warn('[Terminal] Poll error:', err);
      }
    }, 50); // Poll every 50ms for better responsiveness

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [activeSession, sessions]);

  async function saveConnection() {
    if (!saveConnectionName.trim()) {
      setError('Connection name is required');
      return;
    }

    try {
      const connectionData: Record<string, string | number> = {
        name: saveConnectionName.trim(),
        type: newSessionType,
      };

      if (newSessionType === 'ssh') {
        connectionData.host = sshHost;
        connectionData.port = parseInt(sshPort) || 22;
        connectionData.username = sshUsername;
        if (sshPassword) {
          connectionData.password = sshPassword;
          connectionData.auth_type = 'password';
        } else if (sshPrivateKey) {
          connectionData.private_key = sshPrivateKey;
          connectionData.auth_type = 'private_key';
        }
      } else if (newSessionType === 'telnet') {
        connectionData.host = telnetHost;
        connectionData.port = parseInt(telnetPort) || 23;
        connectionData.auth_type = 'none';
      }

      if (editingConnection) {
        await axios.put(`${API_BASE}/v1/terminal/connections/${editingConnection.id}`, connectionData);
      } else {
        await axios.post(`${API_BASE}/v1/terminal/connections`, connectionData);
      }

      await loadSavedConnections();
      setShowSaveDialog(false);
      setSaveConnectionName('');
      setEditingConnection(null);
      setError(null);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to save connection'));
    }
  }

  async function deleteSavedConnection(connectionId: string) {
    if (!confirm('Are you sure you want to delete this saved connection?')) {
      return;
    }
    try {
      await axios.delete(`${API_BASE}/v1/terminal/connections/${connectionId}`);
      await loadSavedConnections();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to delete connection'));
    }
  }

  async function connectWithSaved(connection: SavedConnection) {
    try {
      setError(null);
      const response = await axios.post(`${API_BASE}/v1/terminal/connections/${connection.id}/connect`);
      const session = response.data.session;
      // Update ref immediately so setTerminalRef can find the session
      const newSessions = [...sessionsRef.current, session];
      sessionsRef.current = newSessions;
      setSessions(newSessions);
      setActiveSession(session.id);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to connect'));
    }
  }

  function editConnection(connection: SavedConnection) {
    setEditingConnection(connection);
    setSaveConnectionName(connection.name);
    setNewSessionType(connection.type);
    if (connection.type === 'ssh') {
      setSshHost(connection.host || '');
      setSshPort(String(connection.port || 22));
      setSshUsername(connection.username || '');
      setSshPassword('');
      setSshPrivateKey('');
    } else if (connection.type === 'telnet') {
      setTelnetHost(connection.host || '');
      setTelnetPort(String(connection.port || 23));
    }
    setShowNewSessionModal(true);
    setShowSaveDialog(true);
  }

  async function createLocalSession() {
    try {
      setError(null);
      const response = await axios.post(`${API_BASE}/v1/terminal/local`);
      const session = response.data.session;
      // Update ref immediately so setTerminalRef can find the session
      const newSessions = [...sessionsRef.current, session];
      sessionsRef.current = newSessions;
      setSessions(newSessions);
      setActiveSession(session.id);
      setShowNewSessionModal(false);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to create local session'));
    }
  }

  async function createSSHSession() {
    try {
      setError(null);
      if (!sshHost || !sshUsername) {
        setError('Host and username are required');
        return;
      }
      if (!sshPassword && !sshPrivateKey) {
        setError('Password or private key is required');
        return;
      }

      const response = await axios.post(`${API_BASE}/v1/terminal/ssh`, {
        host: sshHost,
        port: parseInt(sshPort) || 22,
        username: sshUsername,
        password: sshPassword || undefined,
        privateKey: sshPrivateKey || undefined,
      });

      const session = response.data.session;
      // Update ref immediately so setTerminalRef can find the session
      const newSessions = [...sessionsRef.current, session];
      sessionsRef.current = newSessions;
      setSessions(newSessions);
      setActiveSession(session.id);
      setShowNewSessionModal(false);
      
      // Clear form
      setSshHost('');
      setSshPort('22');
      setSshUsername('');
      setSshPassword('');
      setSshPrivateKey('');
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to create SSH session'));
    }
  }

  async function createTelnetSession() {
    try {
      setError(null);
      if (!telnetHost) {
        setError('Host is required');
        return;
      }

      const response = await axios.post(`${API_BASE}/v1/terminal/telnet`, {
        host: telnetHost,
        port: parseInt(telnetPort) || 23,
      });

      const session = response.data.session;
      // Update ref immediately so setTerminalRef can find the session
      const newSessions = [...sessionsRef.current, session];
      sessionsRef.current = newSessions;
      setSessions(newSessions);
      setActiveSession(session.id);
      setShowNewSessionModal(false);
      
      // Clear form
      setTelnetHost('');
      setTelnetPort('23');
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to create Telnet session'));
    }
  }

  async function closeSession(sessionId: string) {
    try {
      await axios.delete(`${API_BASE}/v1/terminal/${sessionId}`);
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      terminalRefs.current.delete(sessionId);
      localCommandBuffer.current.delete(sessionId);
      // Clean up history and completion state
      commandHistory.current.delete(sessionId);
      historyIndex.current.delete(sessionId);
      tempBuffer.current.delete(sessionId);
      tabCompletionIndex.current.delete(sessionId);
      lastTabInput.current.delete(sessionId);
      if (activeSession === sessionId) {
        const remaining = sessions.filter(s => s.id !== sessionId);
        setActiveSession(remaining.length > 0 ? remaining[0].id : null);
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to close session'));
    }
  }

  // Handle terminal data input
  const handleTerminalData = useCallback(async (sessionId: string, data: string) => {
    // Debug log to verify input is received
    console.log('[Terminal Input]', { 
      sessionId, 
      data: JSON.stringify(data), 
      charCodes: [...data].map(c => c.charCodeAt(0)),
      sessionsCount: sessionsRef.current.length,
      sessionIds: sessionsRef.current.map(s => s.id)
    });
    
    const session = sessionsRef.current.find(s => s.id === sessionId);
    if (!session) {
      console.warn('[Terminal] Session not found:', sessionId, 'Available:', sessionsRef.current.map(s => s.id));
      return;
    }
    
    console.log('[Terminal] Session found:', { id: session.id, type: session.type, connected: session.connected });

    const termRef = terminalRefs.current.get(sessionId);
    if (!termRef) {
      console.warn('[Terminal] Terminal ref not found:', sessionId);
      return;
    }

    // Helper to clear current line and rewrite
    const rewriteLine = (newText: string) => {
      // Move cursor to start, clear line, write prompt and new text
      termRef.write('\r\x1b[K'); // Carriage return + clear line
      termRef.write('\x1b[34m$\x1b[0m '); // Prompt
      termRef.write(newText);
      localCommandBuffer.current.set(sessionId, newText);
    };

    if (session.type === 'local') {
      // For local sessions, we need to buffer commands and execute on Enter
      // Handle special characters
      if (data === '\r') {
        // Enter pressed - execute command
        const command = localCommandBuffer.current.get(sessionId) || '';
        localCommandBuffer.current.set(sessionId, '');
        termRef.write('\r\n');
        
        // Reset history navigation
        historyIndex.current.delete(sessionId);
        tempBuffer.current.delete(sessionId);
        tabCompletionIndex.current.delete(sessionId);
        lastTabInput.current.delete(sessionId);
        
        if (command.trim()) {
          // Add to history
          const history = commandHistory.current.get(sessionId) || [];
          // Don't add duplicates consecutively
          if (history.length === 0 || history[history.length - 1] !== command.trim()) {
            history.push(command.trim());
            // Keep max 100 commands in history
            if (history.length > 100) history.shift();
            commandHistory.current.set(sessionId, history);
          }
          
          try {
            const response = await axios.post(`${API_BASE}/v1/terminal/${sessionId}/execute`, {
              command: command.trim(),
            });
            const output = response.data.result.stdout || response.data.result.stderr || '';
            if (output) {
              termRef.write(output.replace(/\n/g, '\r\n'));
              if (!output.endsWith('\n')) {
                termRef.write('\r\n');
              }
            }
            const exitCode = response.data.result.exitCode;
            if (exitCode !== 0) {
              termRef.write(`\x1b[31mExit code: ${exitCode}\x1b[0m\r\n`);
            }
          } catch (err: unknown) {
            termRef.write(`\x1b[31mError: ${getErrorMessage(err, 'Command failed')}\x1b[0m\r\n`);
          }
        }
        // Show new prompt
        termRef.write('\x1b[34m$\x1b[0m ');
      } else if (data === '\x7f') {
        // Backspace
        const buffer = localCommandBuffer.current.get(sessionId) || '';
        if (buffer.length > 0) {
          localCommandBuffer.current.set(sessionId, buffer.slice(0, -1));
          termRef.write('\b \b');
        }
        // Reset tab completion on edit
        tabCompletionIndex.current.delete(sessionId);
        lastTabInput.current.delete(sessionId);
      } else if (data === '\x03') {
        // Ctrl+C - cancel current command
        localCommandBuffer.current.set(sessionId, '');
        historyIndex.current.delete(sessionId);
        tempBuffer.current.delete(sessionId);
        tabCompletionIndex.current.delete(sessionId);
        lastTabInput.current.delete(sessionId);
        termRef.write('^C\r\n');
        termRef.write('\x1b[34m$\x1b[0m ');
      } else if (data === '\x0c') {
        // Ctrl+L - clear screen
        termRef.clear();
        termRef.write('\x1b[34m$\x1b[0m ');
        termRef.write(localCommandBuffer.current.get(sessionId) || '');
      } else if (data === '\x09') {
        // Tab - autocomplete
        const buffer = localCommandBuffer.current.get(sessionId) || '';
        if (buffer.length === 0) return;
        
        // Find matching commands
        const lastTab = lastTabInput.current.get(sessionId);
        const isRepeatedTab = lastTab === buffer;
        
        // Get matches from CLI_AUTOCOMPLETE and history
        const history = commandHistory.current.get(sessionId) || [];
        const allSuggestions = [...new Set([...CLI_AUTOCOMPLETE, ...history])];
        const matches = allSuggestions.filter(cmd => 
          cmd.toLowerCase().startsWith(buffer.toLowerCase()) && cmd !== buffer
        ).sort();
        
        if (matches.length === 0) {
          // No matches - bell sound
          termRef.write('\x07');
          return;
        }
        
        if (matches.length === 1) {
          // Single match - complete it
          rewriteLine(matches[0]);
          tabCompletionIndex.current.delete(sessionId);
          lastTabInput.current.delete(sessionId);
        } else if (isRepeatedTab) {
          // Cycle through matches
          let idx = (tabCompletionIndex.current.get(sessionId) || 0) + 1;
          if (idx >= matches.length) idx = 0;
          tabCompletionIndex.current.set(sessionId, idx);
          rewriteLine(matches[idx]);
        } else {
          // First tab with multiple matches - show options
          tabCompletionIndex.current.set(sessionId, 0);
          lastTabInput.current.set(sessionId, buffer);
          
          // Find common prefix
          let commonPrefix = matches[0];
          for (const match of matches) {
            while (!match.toLowerCase().startsWith(commonPrefix.toLowerCase())) {
              commonPrefix = commonPrefix.slice(0, -1);
            }
          }
          
          if (commonPrefix.length > buffer.length) {
            // Complete to common prefix
            rewriteLine(commonPrefix);
            lastTabInput.current.set(sessionId, commonPrefix);
          } else {
            // Show all matches
            termRef.write('\r\n');
            termRef.write('\x1b[33m' + matches.join('  ') + '\x1b[0m\r\n');
            termRef.write('\x1b[34m$\x1b[0m ' + buffer);
          }
        }
      } else if (data === '\x1b[A') {
        // Up arrow - previous command in history
        const history = commandHistory.current.get(sessionId) || [];
        if (history.length === 0) return;
        
        let idx = historyIndex.current.get(sessionId);
        const currentBuffer = localCommandBuffer.current.get(sessionId) || '';
        
        if (idx === undefined) {
          // First up press - save current buffer and go to last history item
          tempBuffer.current.set(sessionId, currentBuffer);
          idx = history.length - 1;
        } else if (idx > 0) {
          idx--;
        } else {
          // At beginning of history
          return;
        }
        
        historyIndex.current.set(sessionId, idx);
        rewriteLine(history[idx]);
      } else if (data === '\x1b[B') {
        // Down arrow - next command in history
        const history = commandHistory.current.get(sessionId) || [];
        let idx = historyIndex.current.get(sessionId);
        
        if (idx === undefined) return;
        
        if (idx < history.length - 1) {
          idx++;
          historyIndex.current.set(sessionId, idx);
          rewriteLine(history[idx]);
        } else {
          // Back to original input
          historyIndex.current.delete(sessionId);
          const original = tempBuffer.current.get(sessionId) || '';
          tempBuffer.current.delete(sessionId);
          rewriteLine(original);
        }
      } else if (data >= ' ') {
        // Normal character - add to buffer and echo
        const buffer = localCommandBuffer.current.get(sessionId) || '';
        localCommandBuffer.current.set(sessionId, buffer + data);
        termRef.write(data);
        // Reset tab completion on new input
        tabCompletionIndex.current.delete(sessionId);
        lastTabInput.current.delete(sessionId);
      }
    } else {
      // For SSH/Telnet - send data directly to server
      console.log('[Terminal SSH/Telnet] Sending data to server:', { sessionId, data: JSON.stringify(data) });
      try {
        const response = await axios.post(`${API_BASE}/v1/terminal/${sessionId}/send`, {
          data: data,
        });
        console.log('[Terminal SSH/Telnet] Send response:', response.data);
      } catch (err) {
        console.error('[Terminal SSH/Telnet] Failed to send data:', err);
      }
    }
  }, []); // Empty deps - use sessionsRef instead

  // Create terminal ref callback
  const setTerminalRef = useCallback((sessionId: string, ref: XTerminalRef | null) => {
    if (ref) {
      terminalRefs.current.set(sessionId, ref);
      // Initialize local session with prompt
      const session = sessionsRef.current.find(s => s.id === sessionId);
      if (session?.type === 'local') {
        setTimeout(() => {
          ref.write('\x1b[32m[Local Shell]\x1b[0m\r\n');
          ref.write('\x1b[34m$\x1b[0m ');
          localCommandBuffer.current.set(sessionId, '');
        }, 100);
      }
    } else {
      terminalRefs.current.delete(sessionId);
    }
  }, []); // Empty deps - use sessionsRef instead

  const activeSessionData = sessions.find(s => s.id === activeSession);

  function getSessionIcon(type: string) {
    switch (type) {
      case 'ssh': return <Server className="w-4 h-4" />;
      case 'telnet': return <Globe className="w-4 h-4" />;
      default: return <Monitor className="w-4 h-4" />;
    }
  }

  function getSessionLabel(session: TerminalSession) {
    if (session.type === 'local') return 'Local Shell';
    if (session.type === 'ssh') return `SSH: ${session.username}@${session.host}`;
    if (session.type === 'telnet') return `Telnet: ${session.host}:${session.port}`;
    return session.id;
  }

  function clearTerminal() {
    if (activeSession) {
      const termRef = terminalRefs.current.get(activeSession);
      termRef?.clear();
      const session = sessions.find(s => s.id === activeSession);
      if (session?.type === 'local') {
        termRef?.write('\x1b[34m$\x1b[0m ');
      }
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-white flex items-center gap-3">
          <TerminalIcon className="w-8 h-8" />
          Web Terminal
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={loadSessions}
            className="btn-secondary flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <button
            onClick={() => setShowNewSessionModal(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            New Session
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/50 border border-red-500 rounded-lg p-4 text-red-200">
          {error}
          <button 
            onClick={() => setError(null)} 
            className="ml-2 text-red-400 hover:text-white"
          >
            <X className="w-4 h-4 inline" />
          </button>
        </div>
      )}

      <div className="flex gap-4 h-[calc(100vh-200px)]">
        {/* Session List */}
        <div className="w-72 bg-slate-800 rounded-lg p-4 space-y-4 flex-shrink-0 overflow-y-auto">
          {/* Saved Connections Section */}
          <div>
            <div 
              className="flex items-center justify-between cursor-pointer mb-2"
              onClick={() => setShowSavedConnections(!showSavedConnections)}
            >
              <h3 className="text-sm font-medium text-slate-400 flex items-center gap-2">
                <Bookmark className="w-4 h-4" />
                Saved Connections ({savedConnections.length})
              </h3>
              <span className="text-slate-500 text-xs">{showSavedConnections ? '▼' : '▶'}</span>
            </div>
            {showSavedConnections && (
              <div className="space-y-1">
                {savedConnections.length === 0 ? (
                  <p className="text-slate-500 text-xs pl-6">No saved connections</p>
                ) : (
                  savedConnections.map(conn => (
                    <div
                      key={conn.id}
                      className="group flex items-center gap-2 p-2 rounded-lg bg-slate-700/50 hover:bg-slate-600 cursor-pointer transition-colors"
                    >
                      <div className="flex-shrink-0">
                        {conn.is_default && <Star className="w-3 h-3 text-yellow-400" />}
                        {!conn.is_default && getSessionIcon(conn.type)}
                      </div>
                      <div 
                        className="flex-1 min-w-0"
                        onClick={() => connectWithSaved(conn)}
                      >
                        <div className="text-sm text-white truncate">{conn.name}</div>
                        <div className="text-xs text-slate-400 truncate">
                          {conn.type === 'local' ? 'Local Shell' : 
                           conn.type === 'ssh' ? `${conn.username}@${conn.host}:${conn.port}` :
                           `${conn.host}:${conn.port}`}
                        </div>
                      </div>
                      <div className="hidden group-hover:flex items-center gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); editConnection(conn); }}
                          className="p-1 hover:bg-slate-500 rounded"
                          title="Edit"
                        >
                          <Edit2 className="w-3 h-3 text-slate-300" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteSavedConnection(conn.id); }}
                          className="p-1 hover:bg-red-500 rounded"
                          title="Delete"
                        >
                          <X className="w-3 h-3 text-slate-300" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="border-t border-slate-700" />

          {/* Active Sessions Section */}
          <div>
            <h3 className="text-sm font-medium text-slate-400 mb-2">Active Sessions ({sessions.length})</h3>
            {sessions.length === 0 ? (
              <p className="text-slate-500 text-xs">No active sessions</p>
            ) : (
              <div className="space-y-1">
                {sessions.map(session => (
                  <div
                    key={session.id}
                    className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${
                      activeSession === session.id
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                    onClick={() => setActiveSession(session.id)}
                  >
                    {getSessionIcon(session.type)}
                    <span className="flex-1 text-sm truncate">{getSessionLabel(session)}</span>
                    <span className={`w-2 h-2 rounded-full ${session.connected ? 'bg-green-400' : 'bg-red-400'}`} />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        closeSession(session.id);
                      }}
                      className="p-1 hover:bg-red-500 rounded"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Terminal Area */}
        <div className="flex-1 bg-black rounded-lg flex flex-col overflow-hidden border border-slate-700">
          {activeSession && activeSessionData ? (
            <>
              {/* Terminal Header */}
              <div className="flex items-center justify-between px-4 py-2 bg-slate-800 border-b border-slate-700 flex-shrink-0">
                <div className="flex items-center gap-2 text-sm text-slate-300">
                  {getSessionIcon(activeSessionData.type)}
                  <span>{getSessionLabel(activeSessionData)}</span>
                  <span className={`px-2 py-0.5 rounded text-xs ${
                    activeSessionData.connected ? 'bg-green-600' : 'bg-red-600'
                  }`}>
                    {activeSessionData.connected ? 'Connected' : 'Disconnected'}
                  </span>
                </div>
                <button
                  onClick={clearTerminal}
                  className="text-slate-400 hover:text-white text-sm flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" />
                  Clear
                </button>
              </div>

              {/* CLI Quick Actions Bar (only for local sessions) */}
              {activeSessionData.type === 'local' && (
                <div className="px-4 py-2 bg-slate-800/50 border-b border-slate-700/50 flex-shrink-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                      <Zap className="w-3 h-3" />
                      Quick Commands:
                    </span>
                    {CLI_QUICK_COMMANDS.map((cmd) => {
                      const Icon = cmd.icon;
                      const colorClass = {
                        blue: 'hover:bg-blue-600/20 hover:text-blue-400',
                        green: 'hover:bg-green-600/20 hover:text-green-400',
                        purple: 'hover:bg-purple-600/20 hover:text-purple-400',
                        orange: 'hover:bg-orange-600/20 hover:text-orange-400',
                        cyan: 'hover:bg-cyan-600/20 hover:text-cyan-400',
                        gray: 'hover:bg-slate-600/20 hover:text-slate-300',
                      }[cmd.color] || 'hover:bg-slate-600/20';
                      
                      return (
                        <button
                          key={cmd.label}
                          onClick={() => {
                            // Execute command in terminal
                            const termRef = terminalRefs.current.get(activeSession);
                            if (termRef) {
                              // Set buffer and execute
                              localCommandBuffer.current.set(activeSession, cmd.command);
                              termRef.write(cmd.command);
                              handleTerminalData(activeSession, '\r');
                            }
                          }}
                          className={`px-2 py-1 rounded text-xs bg-slate-700/50 text-slate-300 flex items-center gap-1 transition-colors ${colorClass}`}
                          title={cmd.command}
                        >
                          <Icon className="w-3 h-3" />
                          {cmd.label}
                        </button>
                      );
                    })}
                    {/* Keyboard shortcuts hint */}
                    <div className="ml-auto flex items-center gap-3 text-xs text-slate-500">
                      <span className="flex items-center gap-1" title="Tab to autocomplete">
                        <kbd className="px-1.5 py-0.5 bg-slate-700 rounded text-slate-400">Tab</kbd>
                        Autocomplete
                      </span>
                      <span className="flex items-center gap-1" title="Up/Down arrows to browse history">
                        <ChevronUp className="w-3 h-3" /><ChevronDown className="w-3 h-3" />
                        History
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* XTerminal */}
              <div className="flex-1 p-2 overflow-hidden">
                {activeSession && (
                  <XTerminal
                    key={activeSession}
                    ref={(ref) => setTerminalRef(activeSession, ref)}
                    onData={(data) => {
                      console.log('[WebTerminal] onData received from XTerminal:', { activeSession, data: JSON.stringify(data) });
                      handleTerminalData(activeSession, data);
                    }}
                    className="h-full w-full"
                  />
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-500">
              <div className="text-center">
                <TerminalIcon className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <p>Select a session or create a new one to start</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* New Session Modal */}
      {showNewSessionModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-lg p-6 w-full max-w-lg">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">New Terminal Session</h2>
              <button
                onClick={() => {
                  setShowNewSessionModal(false);
                  setError(null);
                }}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Connection Type Tabs */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setNewSessionType('local')}
                className={`flex-1 py-2 px-4 rounded-lg flex items-center justify-center gap-2 ${
                  newSessionType === 'local'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                <Monitor className="w-4 h-4" />
                Local
              </button>
              <button
                onClick={() => setNewSessionType('ssh')}
                className={`flex-1 py-2 px-4 rounded-lg flex items-center justify-center gap-2 ${
                  newSessionType === 'ssh'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                <Server className="w-4 h-4" />
                SSH
              </button>
              <button
                onClick={() => setNewSessionType('telnet')}
                className={`flex-1 py-2 px-4 rounded-lg flex items-center justify-center gap-2 ${
                  newSessionType === 'telnet'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                <Globe className="w-4 h-4" />
                Telnet
              </button>
            </div>

            {error && (
              <div className="bg-red-900/50 border border-red-500 rounded-lg p-3 text-red-200 text-sm mb-4">
                {error}
              </div>
            )}

            {/* Local Form */}
            {newSessionType === 'local' && (
              <div className="space-y-4">
                <p className="text-slate-400 text-sm">
                  Create a local shell session on the gateway server.
                </p>
                <button
                  onClick={createLocalSession}
                  className="w-full btn-primary flex items-center justify-center gap-2"
                >
                  <Play className="w-4 h-4" />
                  Create Local Session
                </button>
              </div>
            )}

            {/* SSH Form */}
            {newSessionType === 'ssh' && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="block text-sm text-slate-400 mb-1">Host</label>
                    <input
                      type="text"
                      value={sshHost}
                      onChange={(e) => setSshHost(e.target.value)}
                      placeholder="192.168.1.1 or hostname"
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">Port</label>
                    <input
                      type="text"
                      value={sshPort}
                      onChange={(e) => setSshPort(e.target.value)}
                      placeholder="22"
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Username</label>
                  <input
                    type="text"
                    value={sshUsername}
                    onChange={(e) => setSshUsername(e.target.value)}
                    placeholder="root"
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Password</label>
                  <input
                    type="password"
                    value={sshPassword}
                    onChange={(e) => setSshPassword(e.target.value)}
                    placeholder="Enter password"
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">
                    Private Key (optional, use instead of password)
                  </label>
                  <textarea
                    value={sshPrivateKey}
                    onChange={(e) => setSshPrivateKey(e.target.value)}
                    placeholder="-----BEGIN RSA PRIVATE KEY-----"
                    rows={4}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white font-mono text-xs"
                  />
                </div>

                {/* Save Connection Toggle */}
                {showSaveDialog ? (
                  <div className="bg-slate-700/50 rounded-lg p-3 space-y-2">
                    <label className="block text-sm text-slate-400 mb-1">Connection Name</label>
                    <input
                      type="text"
                      value={saveConnectionName}
                      onChange={(e) => setSaveConnectionName(e.target.value)}
                      placeholder="My SSH Server"
                      className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded-lg text-white"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={saveConnection}
                        className="flex-1 btn-secondary flex items-center justify-center gap-2"
                      >
                        <Save className="w-4 h-4" />
                        {editingConnection ? 'Update' : 'Save'}
                      </button>
                      <button
                        onClick={() => { setShowSaveDialog(false); setSaveConnectionName(''); setEditingConnection(null); }}
                        className="px-3 py-2 bg-slate-600 hover:bg-slate-500 rounded-lg text-slate-300"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowSaveDialog(true)}
                    className="w-full py-2 px-4 bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-300 flex items-center justify-center gap-2"
                  >
                    <Bookmark className="w-4 h-4" />
                    Save Connection for Later
                  </button>
                )}

                <button
                  onClick={createSSHSession}
                  className="w-full btn-primary flex items-center justify-center gap-2"
                >
                  <Server className="w-4 h-4" />
                  Connect via SSH
                </button>
              </div>
            )}

            {/* Telnet Form */}
            {newSessionType === 'telnet' && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="block text-sm text-slate-400 mb-1">Host</label>
                    <input
                      type="text"
                      value={telnetHost}
                      onChange={(e) => setTelnetHost(e.target.value)}
                      placeholder="192.168.1.1 or hostname"
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">Port</label>
                    <input
                      type="text"
                      value={telnetPort}
                      onChange={(e) => setTelnetPort(e.target.value)}
                      placeholder="23"
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                    />
                  </div>
                </div>
                <p className="text-amber-400 text-sm">
                  ⚠️ Telnet is unencrypted. Use SSH for secure connections.
                </p>

                {/* Save Connection Toggle for Telnet */}
                {showSaveDialog ? (
                  <div className="bg-slate-700/50 rounded-lg p-3 space-y-2">
                    <label className="block text-sm text-slate-400 mb-1">Connection Name</label>
                    <input
                      type="text"
                      value={saveConnectionName}
                      onChange={(e) => setSaveConnectionName(e.target.value)}
                      placeholder="My Telnet Device"
                      className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded-lg text-white"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={saveConnection}
                        className="flex-1 btn-secondary flex items-center justify-center gap-2"
                      >
                        <Save className="w-4 h-4" />
                        {editingConnection ? 'Update' : 'Save'}
                      </button>
                      <button
                        onClick={() => { setShowSaveDialog(false); setSaveConnectionName(''); setEditingConnection(null); }}
                        className="px-3 py-2 bg-slate-600 hover:bg-slate-500 rounded-lg text-slate-300"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowSaveDialog(true)}
                    className="w-full py-2 px-4 bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-300 flex items-center justify-center gap-2"
                  >
                    <Bookmark className="w-4 h-4" />
                    Save Connection for Later
                  </button>
                )}

                <button
                  onClick={createTelnetSession}
                  className="w-full btn-primary flex items-center justify-center gap-2"
                >
                  <Globe className="w-4 h-4" />
                  Connect via Telnet
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
