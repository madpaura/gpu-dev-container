import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Download, Minimize2, Maximize2, X, RefreshCw, Filter } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { userServicesApi, LogEntry } from '../lib/api';

interface LogsWindowProps {
  isMinimized: boolean;
  onMinimize: () => void;
  onClose: () => void;
}

export const LogsWindow: React.FC<LogsWindowProps> = ({ isMinimized, onMinimize, onClose }) => {
  const { user } = useAuth();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [levelFilter, setLevelFilter] = useState<string>('');
  const [limit, setLimit] = useState(50);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const fetchLogs = async () => {
    if (!user?.token) return;
    
    try {
      setLoading(true);
      setError(null);
      
      const data = await userServicesApi.getLogs(user.token, limit, levelFilter || undefined);
      
      if (data && data.success) {
        // Backend returns logs nested under data.logs
        const logsArray = data.data?.logs || [];
        setLogs(logsArray);
      } else {
        setError(data?.error || 'Failed to fetch logs');
      }
    } catch (err) {
      setError('Failed to fetch logs');
    } finally {
      setLoading(false);
    }
  };

  const downloadLogs = async () => {
    if (!user?.token) return;
    
    try {
      const blob = await userServicesApi.downloadLogs(user.token);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `logs_${user.name || 'user'}_${new Date().toISOString().split('T')[0]}.txt`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      setError('Failed to download logs');
      console.error('Error downloading logs:', err);
    }
  };

  const scrollToBottom = () => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const getLogLevelColor = (level: string) => {
    switch (level) {
      case 'ERROR':
        return 'text-red-400';
      case 'WARNING':
        return 'text-yellow-400';
      case 'INFO':
        return 'text-blue-400';
      default:
        return 'text-gray-400';
    }
  };

  const formatTimestamp = (timestamp: string) => {
    try {
      return new Date(timestamp).toLocaleString();
    } catch {
      return timestamp;
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [levelFilter, limit]);

  useEffect(() => {
    if (!autoRefresh) return;
    
    const interval = setInterval(() => {
      fetchLogs();
    }, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, [autoRefresh, levelFilter, limit]);

  useEffect(() => {
    if (!isMinimized) {
      scrollToBottom();
    }
  }, [logs, isMinimized]);

  if (isMinimized) {
    return (
      <div className="fixed bottom-6 right-4 bg-card border border-border rounded-lg shadow-lg z-40">
        <div className="flex items-center gap-2 p-2 cursor-pointer" onClick={onMinimize}>
          <Terminal className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Logs</span>
          <div className="flex items-center gap-1 ml-2">
            <Maximize2 className="w-3 h-3 text-muted-foreground" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-6 right-4 w-96 h-80 bg-card border border-border rounded-lg shadow-lg z-40 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Logs</span>
          {loading && <RefreshCw className="w-3 h-3 animate-spin text-muted-foreground" />}
        </div>
        <div className="flex items-center gap-1">
          {/* Auto-refresh toggle */}
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`p-1 rounded text-xs ${autoRefresh ? 'bg-green-100 text-green-600 dark:bg-green-900/20 dark:text-green-400' : 'text-muted-foreground hover:text-foreground'}`}
            title={autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
          >
            <RefreshCw className="w-3 h-3" />
          </button>
          
          {/* Level filter */}
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="text-xs bg-background border border-border rounded px-1 py-0.5"
          >
            <option value="">All</option>
            <option value="INFO">INFO</option>
            <option value="WARNING">WARNING</option>
            <option value="ERROR">ERROR</option>
          </select>
          
          {/* Download button */}
          <button
            onClick={downloadLogs}
            className="p-1 text-muted-foreground hover:text-foreground"
            title="Download logs"
          >
            <Download className="w-3 h-3" />
          </button>
          
          {/* Minimize button */}
          <button
            onClick={onMinimize}
            className="p-1 text-muted-foreground hover:text-foreground"
            title="Minimize"
          >
            <Minimize2 className="w-3 h-3" />
          </button>
          
          {/* Close button */}
          <button
            onClick={onClose}
            className="p-1 text-muted-foreground hover:text-foreground"
            title="Close"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {error ? (
          <div className="p-3 text-center">
            <div className="text-red-500 text-sm mb-2">{error}</div>
            <button
              onClick={fetchLogs}
              className="text-xs text-primary hover:text-primary/80"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="h-full overflow-y-auto p-2 font-mono text-xs">
            {logs.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                {loading ? 'Loading logs...' : `No logs available (${logs.length} entries)`}
                <div className="text-xs mt-2">Debug: logs array = {JSON.stringify(logs)}</div>
              </div>
            ) : (
              <div className="space-y-1">
                {logs.map((log, index) => (
                  <div key={index} className="flex gap-2 text-xs">
                    <span className="text-muted-foreground whitespace-nowrap">
                      {formatTimestamp(log.timestamp)}
                    </span>
                    <span className={`font-medium whitespace-nowrap ${getLogLevelColor(log.level)}`}>
                      {log.level}:
                    </span>
                    <span className="text-foreground break-words">
                      {log.message}
                    </span>
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between p-2 border-t border-border text-xs text-muted-foreground">
        <span>{logs.length} entries</span>
        <div className="flex items-center gap-2">
          <span>Limit:</span>
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="bg-background border border-border rounded px-1 py-0.5 text-xs"
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
          </select>
        </div>
      </div>
    </div>
  );
};
