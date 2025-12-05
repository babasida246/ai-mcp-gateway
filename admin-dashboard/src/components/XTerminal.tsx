import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

export interface XTerminalRef {
  write: (data: string) => void;
  writeln: (data: string) => void;
  clear: () => void;
  focus: () => void;
  fit: () => void;
  getTerminal: () => Terminal | null;
}

interface XTerminalProps {
  onData?: (data: string) => void;
  onKey?: (key: string, ev: KeyboardEvent) => void;
  className?: string;
  fontSize?: number;
  fontFamily?: string;
  theme?: {
    background?: string;
    foreground?: string;
    cursor?: string;
    cursorAccent?: string;
    selection?: string;
    black?: string;
    red?: string;
    green?: string;
    yellow?: string;
    blue?: string;
    magenta?: string;
    cyan?: string;
    white?: string;
    brightBlack?: string;
    brightRed?: string;
    brightGreen?: string;
    brightYellow?: string;
    brightBlue?: string;
    brightMagenta?: string;
    brightCyan?: string;
    brightWhite?: string;
  };
}

const defaultTheme = {
  background: '#0d1117',
  foreground: '#c9d1d9',
  cursor: '#58a6ff',
  cursorAccent: '#0d1117',
  selection: 'rgba(88, 166, 255, 0.3)',
  black: '#0d1117',
  red: '#ff7b72',
  green: '#7ee787',
  yellow: '#d29922',
  blue: '#58a6ff',
  magenta: '#bc8cff',
  cyan: '#39c5cf',
  white: '#c9d1d9',
  brightBlack: '#484f58',
  brightRed: '#ffa198',
  brightGreen: '#a5d6ff',
  brightYellow: '#e3b341',
  brightBlue: '#79c0ff',
  brightMagenta: '#d2a8ff',
  brightCyan: '#56d4dd',
  brightWhite: '#f0f6fc',
};

const XTerminal = forwardRef<XTerminalRef, XTerminalProps>(({
  onData,
  onKey,
  className = '',
  fontSize = 14,
  fontFamily = 'Consolas, "Courier New", monospace',
  theme = defaultTheme,
}, ref) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminalInstanceRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  
  // Store callbacks in refs to avoid re-creating terminal on callback changes
  const onDataRef = useRef(onData);
  const onKeyRef = useRef(onKey);
  
  // Update refs when callbacks change
  useEffect(() => {
    onDataRef.current = onData;
  }, [onData]);
  
  useEffect(() => {
    onKeyRef.current = onKey;
  }, [onKey]);

  useEffect(() => {
    if (!terminalRef.current) return;

    // Create terminal instance
    const terminal = new Terminal({
      fontSize,
      fontFamily,
      theme: { ...defaultTheme, ...theme },
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 10000,
      convertEol: true,
      allowProposedApi: true,
      // Ensure terminal can receive input
      disableStdin: false,
    });

    console.log('[XTerminal] Terminal created with options:', {
      fontSize,
      fontFamily,
      disableStdin: false,
    });

    // Create and load addons
    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(webLinksAddon);

    // Open terminal in container
    terminal.open(terminalRef.current);

    // Fit to container
    fitAddon.fit();

    // Store references
    terminalInstanceRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Handle data input (user typing) - use ref to avoid dependency issues
    terminal.onData((data) => {
      console.log('[XTerminal onData]', { data: JSON.stringify(data), hasCallback: !!onDataRef.current });
      if (onDataRef.current) {
        onDataRef.current(data);
      }
    });

    // Handle key events - use ref to avoid dependency issues
    terminal.onKey(({ key, domEvent }) => {
      console.log('[XTerminal onKey]', { key: JSON.stringify(key), keyCode: domEvent.keyCode, hasCallback: !!onKeyRef.current });
      if (onKeyRef.current) {
        onKeyRef.current(key, domEvent);
      }
    });

    // Handle window resize
    const handleResize = () => {
      fitAddon.fit();
    };
    window.addEventListener('resize', handleResize);

    // Handle container resize with ResizeObserver
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
    });
    resizeObserver.observe(terminalRef.current);
    
    // Auto-focus terminal after mount
    setTimeout(() => {
      console.log('[XTerminal] Auto-focusing terminal after mount');
      terminal.focus();
    }, 100);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      terminal.dispose();
      terminalInstanceRef.current = null;
      fitAddonRef.current = null;
    };
  }, [fontSize, fontFamily, theme]); // Remove onData and onKey from deps - use refs instead

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    write: (data: string) => {
      console.log('[XTerminal] write called:', { dataLen: data.length, hasTerminal: !!terminalInstanceRef.current });
      if (terminalInstanceRef.current) {
        terminalInstanceRef.current.write(data);
      } else {
        console.warn('[XTerminal] Cannot write - terminal not initialized');
      }
    },
    writeln: (data: string) => {
      terminalInstanceRef.current?.writeln(data);
    },
    clear: () => {
      terminalInstanceRef.current?.clear();
    },
    focus: () => {
      terminalInstanceRef.current?.focus();
    },
    fit: () => {
      fitAddonRef.current?.fit();
    },
    getTerminal: () => terminalInstanceRef.current,
  }));

  // Handle click to focus terminal
  const handleContainerClick = () => {
    console.log('[XTerminal] Container clicked, focusing terminal');
    terminalInstanceRef.current?.focus();
  };

  return (
    <div
      ref={terminalRef}
      className={`xterm-container ${className}`}
      style={{ 
        width: '100%', 
        height: '100%',
        overflow: 'hidden',
      }}
      onClick={handleContainerClick}
      tabIndex={0}
    />
  );
});

XTerminal.displayName = 'XTerminal';

export default XTerminal;
