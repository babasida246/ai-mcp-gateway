import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

export interface CommandBlockProps {
  title: string;
  commands: string[];
  disabled?: boolean;
}

/**
 * Reusable component for displaying RouterOS command outputs
 * Shows commands with syntax highlighting and a copy button
 */
export default function CommandBlock({ title, commands, disabled }: CommandBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (disabled) return;
    await navigator.clipboard.writeText(commands.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 shadow-lg">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <button
          onClick={handleCopy}
          disabled={disabled}
          className={`flex items-center gap-2 text-xs px-2 py-1 rounded-md ${
            disabled
              ? 'bg-slate-700/60 text-slate-500 cursor-not-allowed'
              : 'bg-slate-700 text-slate-200 hover:bg-blue-600 hover:text-white transition-colors'
          }`}
        >
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} Copy
        </button>
      </div>
      <pre className="text-xs text-slate-200 bg-slate-900 rounded-lg p-3 whitespace-pre-wrap leading-5">
        {commands.join('\n')}
      </pre>
    </div>
  );
}
