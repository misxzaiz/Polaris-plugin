import { useState, useCallback, useEffect } from 'react';
import { ArrowRightLeft, Copy, Send, Trash2, Clock, Languages, Loader2, Check } from 'lucide-react';
import { callTranslate } from './bridge';

export interface TranslatePanelProps {
  pluginId?: string;
  onSendToChat?: (message: string) => void | Promise<void>;
}

interface HistoryItem {
  id: string;
  sourceText: string;
  translatedText: string;
  direction: string;
  timestamp: number;
}

const DIRECTIONS = [
  { id: 'toEn', label: '中 → 英', to: 'en' },
  { id: 'toZh', label: '英 → 中', to: 'zh' },
];

function loadHistory(): HistoryItem[] {
  try {
    const raw = localStorage.getItem('translate-history');
    return raw ? (JSON.parse(raw) as HistoryItem[]) : [];
  } catch {
    return [];
  }
}

export function TranslatePanel({ onSendToChat }: TranslatePanelProps) {
  const [sourceText, setSourceText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [direction, setDirection] = useState('toEn');
  const [isTranslating, setIsTranslating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  const persistHistory = (items: HistoryItem[]) => {
    setHistory(items);
    try { localStorage.setItem('translate-history', JSON.stringify(items.slice(0, 50))); } catch { /* ignore */ }
  };

  const handleTranslate = useCallback(async () => {
    const text = sourceText.trim();
    if (!text) return;
    setIsTranslating(true);
    setError(null);
    try {
      const to = direction === 'toEn' ? 'en' : 'zh';
      const out = await callTranslate(text, to);
      if (out.success && out.result) {
        setTranslatedText(out.result);
        persistHistory([
          { id: `${Date.now()}`, sourceText: text, translatedText: out.result, direction, timestamp: Date.now() },
          ...history,
        ]);
      } else {
        setError(out.error || '翻译失败');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsTranslating(false);
    }
  }, [sourceText, direction, history]);

  const handleCopy = async () => {
    if (translatedText) {
      await navigator.clipboard.writeText(translatedText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSendToChat = () => {
    if (translatedText && onSendToChat) void onSendToChat(translatedText);
  };

  const dirLabel = DIRECTIONS.find((d) => d.id === direction)?.label || '';

  return (
    <div className="tp-root">
      <div className="tp-header">
        <div className="tp-title">
          <Languages size={16} className="text-primary" />
          <span>翻译</span>
        </div>
        <button type="button" className="tp-btn" style={{ flex: 'none', padding: '2px 8px' }} onClick={() => setShowHistory((v) => !v)} title="历史记录">
          <Clock size={13} />
        </button>
      </div>

      <div className="tp-dir">
        {DIRECTIONS.map((d) => (
          <button
            key={d.id}
            type="button"
            className={`tp-dir-btn ${direction === d.id ? 'tp-dir-on' : ''}`}
            onClick={() => setDirection(d.id)}
          >
            {d.label}
          </button>
        ))}
        <ArrowRightLeft size={12} className="text-text-tertiary" />
      </div>

      <div className="tp-body">
        <textarea
          value={sourceText}
          onChange={(e) => setSourceText(e.target.value)}
          placeholder={direction === 'toEn' ? '输入中文…' : '输入英文…'}
          className="tp-area"
        />
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <button
            type="button"
            className="tp-btn tp-primary"
            style={{ flex: 'none', padding: '6px 16px' }}
            onClick={() => void handleTranslate()}
            disabled={isTranslating || !sourceText.trim()}
          >
            {isTranslating ? <Loader2 size={13} className="animate-spin" /> : <ArrowRightLeft size={13} />}
            翻译（{dirLabel}）
          </button>
        </div>
        <div className="tp-out">
          {translatedText || <span className="text-text-tertiary">译文</span>}
        </div>

        {error && <div className="tp-error">{error}</div>}

        <div className="tp-actions">
          <button type="button" className="tp-btn" onClick={() => void handleCopy()} disabled={!translatedText}>
            {copied ? <Check size={13} className="text-status-success" /> : <Copy size={13} />}
            复制译文
          </button>
          <button type="button" className="tp-btn" onClick={handleSendToChat} disabled={!translatedText || !onSendToChat}>
            <Send size={13} />
            送回会话
          </button>
          <button
            type="button"
            className="tp-btn"
            style={{ flex: 'none', padding: '6px 10px' }}
            onClick={() => { setSourceText(''); setTranslatedText(''); setError(null); }}
          >
            <Trash2 size={13} />
          </button>
        </div>

        {showHistory && (
          <div className="tp-hist">
            {history.length === 0 && <div style={{ padding: '12px', fontSize: 12, color: 'rgb(var(--c-text-tertiary))' }}>暂无历史</div>}
            {history.map((h) => (
              <button
                key={h.id}
                type="button"
                className="tp-hist-item"
                onClick={() => { setSourceText(h.sourceText); setTranslatedText(h.translatedText); setShowHistory(false); }}
              >
                <div style={{ fontSize: 12, color: 'rgb(var(--c-text-primary))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.sourceText}</div>
                <div style={{ fontSize: 11, color: 'rgb(var(--c-text-tertiary))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.translatedText}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
