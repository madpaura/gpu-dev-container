import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { 
  Download, 
  Trash2, 
  Search,
  Eye,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  RefreshCw,
  AlertTriangle
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { adminApi, type AuditLog } from '../lib/api';

type SortField = 'timestamp' | 'level' | 'user' | 'source';
type SortDirection = 'asc' | 'desc';

interface SortConfig {
  field: SortField;
  direction: SortDirection;
}

interface LogEntry {
  id: string;
  level: 'ERROR' | 'WARN' | 'INFO' | 'DEBUG';
  timestamp: string;
  user: string;
  source: string;
  message: string;
}

const getLogLevelColor = (level: string) => {
  switch (level) {
    case 'ERROR':
      return 'bg-red-500/10 text-red-700 border-red-500/20';
    case 'WARN':
      return 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20';
    case 'INFO':
      return 'bg-blue-500/10 text-blue-700 border-blue-500/20';
    case 'DEBUG':
      return 'bg-green-500/10 text-green-700 border-green-500/20';
    default:
      return 'bg-gray-500/10 text-gray-700 border-gray-500/20';
  }
};

export function AdminLogs() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [logLevel, setLogLevel] = useState('all');
  const [userFilter, setUserFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [sortConfig, setSortConfig] = useState<SortConfig>({ field: 'timestamp', direction: 'desc' });
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [clearing, setClearing] = useState(false);
  const logsPerPage = 10;

  // Fetch logs from backend
  const fetchLogs = async () => {
    if (!user?.token) return;
    
    try {
      setLoading(true);
      setError(null);
      const response = await adminApi.getAuditLogs(user.token);
      
      if (response.success && response.data) {
        setLogs(response.data.logs);
      } else {
        setError(response.error || 'Failed to fetch logs');
      }
    } catch (err) {
      setError('Network error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [user?.token]);

  // Get unique users and sources for filters
  const uniqueUsers = useMemo(() => {
    const users = [...new Set(logs.map(log => log.user))].sort();
    return users;
  }, [logs]);

  const uniqueSources = useMemo(() => {
    const sources = [...new Set(logs.map(log => log.source))].sort();
    return sources;
  }, [logs]);

  // Filter and sort logs
  const filteredLogs = useMemo(() => {
    let filtered = logs.filter(log => {
      const matchesSearch = log.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           log.user.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           log.source.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           (log.ip_address && log.ip_address.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesLevel = logLevel === 'all' || log.level.toLowerCase() === logLevel;
      const matchesUser = userFilter === 'all' || log.user === userFilter;
      const matchesSource = sourceFilter === 'all' || log.source === sourceFilter;
      
      return matchesSearch && matchesLevel && matchesUser && matchesSource;
    });

    // Sort logs
    filtered.sort((a, b) => {
      let aValue: string | number;
      let bValue: string | number;

      switch (sortConfig.field) {
        case 'timestamp':
          aValue = new Date(a.timestamp).getTime();
          bValue = new Date(b.timestamp).getTime();
          break;
        case 'level':
          const levelOrder = { 'ERROR': 0, 'WARN': 1, 'INFO': 2, 'DEBUG': 3 };
          aValue = levelOrder[a.level as keyof typeof levelOrder] ?? 4;
          bValue = levelOrder[b.level as keyof typeof levelOrder] ?? 4;
          break;
        case 'user':
          aValue = a.user.toLowerCase();
          bValue = b.user.toLowerCase();
          break;
        case 'source':
          aValue = a.source.toLowerCase();
          bValue = b.source.toLowerCase();
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [logs, searchQuery, logLevel, userFilter, sourceFilter, sortConfig]);

  // Pagination
  const totalPages = Math.ceil(filteredLogs.length / logsPerPage);
  const startIndex = (currentPage - 1) * logsPerPage;
  const paginatedLogs = filteredLogs.slice(startIndex, startIndex + logsPerPage);

  const handleSort = (field: SortField) => {
    setSortConfig(prev => ({
      field,
      direction: prev.field === field && prev.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  const exportLogs = () => {
    const csvContent = "data:text/csv;charset=utf-8," + 
      "Level,Timestamp,User,Source,Message,IP Address,Action Type\n" +
      filteredLogs.map(log => 
        `${log.level},${log.timestamp},${log.user},${log.source},"${log.message}",${log.ip_address || ''},${log.action_type || ''}`
      ).join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `audit-logs-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const clearAllLogs = async () => {
    if (!user?.token) return;
    
    if (window.confirm('Are you sure you want to clear all logs? This action cannot be undone.')) {
      try {
        setClearing(true);
        const response = await adminApi.clearAuditLogs(user.token);
        
        if (response.success) {
          setLogs([]);
          setCurrentPage(1);
        } else {
          setError(response.error || 'Failed to clear logs');
        }
      } catch (err) {
        setError('Network error occurred');
      } finally {
        setClearing(false);
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin" />
        <span className="ml-2">Loading audit logs...</span>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-foreground">System Logs</h1>
          <p className="text-muted-foreground mt-1">Monitor and analyze system activity ({filteredLogs.length} logs)</p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            className="gap-2" 
            onClick={fetchLogs}
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button 
            variant="outline" 
            className="gap-2" 
            onClick={exportLogs}
            disabled={filteredLogs.length === 0}
          >
            <Download className="w-4 h-4" />
            Export
          </Button>
          <Button 
            variant="destructive" 
            className="gap-2" 
            onClick={clearAllLogs}
            disabled={clearing || logs.length === 0}
          >
            <Trash2 className="w-4 h-4" />
            {clearing ? 'Clearing...' : 'Clear All'}
          </Button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-4 h-4" />
              <span>{error}</span>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={fetchLogs}
                className="ml-auto"
              >
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex gap-4 items-center flex-wrap">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input 
                placeholder="Search logs..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            
            <Select value={logLevel} onValueChange={setLogLevel}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Log Level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Levels</SelectItem>
                <SelectItem value="error">ERROR</SelectItem>
                <SelectItem value="warn">WARN</SelectItem>
                <SelectItem value="info">INFO</SelectItem>
                <SelectItem value="debug">DEBUG</SelectItem>
              </SelectContent>
            </Select>

            <Select value={userFilter} onValueChange={setUserFilter}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="User" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Users</SelectItem>
                {uniqueUsers.map(user => (
                  <SelectItem key={user} value={user}>{user}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                {uniqueSources.map(source => (
                  <SelectItem key={source} value={source}>{source}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Logs Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="cursor-pointer" onClick={() => handleSort('level')}>
                  <div className="flex items-center gap-1">
                    Level
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer" onClick={() => handleSort('timestamp')}>
                  <div className="flex items-center gap-1">
                    Timestamp
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer" onClick={() => handleSort('user')}>
                  <div className="flex items-center gap-1">
                    User
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer" onClick={() => handleSort('source')}>
                  <div className="flex items-center gap-1">
                    Source
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </TableHead>
                <TableHead>Message</TableHead>
                <TableHead>IP Address</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedLogs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    {loading ? 'Loading logs...' : 'No logs found'}
                  </TableCell>
                </TableRow>
              ) : (
                paginatedLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>
                      <Badge className={getLogLevelColor(log.level)}>
                        {log.level}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {log.timestamp}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                          {log.user === 'System' ? 'SY' : log.user.split(' ').map(n => n[0]).join('')}
                        </div>
                        <span>{log.user}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      {log.source}
                    </TableCell>
                    <TableCell className="max-w-md">
                      <span className="text-sm">{log.message}</span>
                    </TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      {log.ip_address || 'N/A'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-8 w-8 p-0"
                        onClick={() => {
                          setSelectedLog(log);
                          setShowDetails(true);
                        }}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Showing {startIndex + 1}-{Math.min(startIndex + logsPerPage, filteredLogs.length)} of {filteredLogs.length} logs
          </div>
          
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(currentPage - 1)}
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </Button>
            
            <div className="flex gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const page = Math.max(1, Math.min(totalPages - 4, currentPage - 2)) + i;
                return (
                  <Button
                    key={page}
                    variant={currentPage === page ? "default" : "outline"}
                    size="sm"
                    className="w-8 h-8 p-0"
                    onClick={() => setCurrentPage(page)}
                  >
                    {page}
                  </Button>
                );
              })}
            </div>
            
            <Button 
              variant="outline" 
              size="sm" 
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(currentPage + 1)}
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Log Details Modal */}
      {showDetails && selectedLog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowDetails(false)}>
          <Card className="w-full max-w-2xl max-h-[80vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <CardContent className="p-6">
              <div className="flex justify-between items-start mb-4">
                <h2 className="text-xl font-semibold">Log Details</h2>
                <Button variant="ghost" size="sm" onClick={() => setShowDetails(false)}>
                  ×
                </Button>
              </div>
              
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Level</label>
                    <div className="mt-1">
                      <Badge className={getLogLevelColor(selectedLog.level)}>
                        {selectedLog.level}
                      </Badge>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Timestamp</label>
                    <div className="mt-1 font-mono text-sm">{selectedLog.timestamp}</div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">User</label>
                    <div className="mt-1">{selectedLog.user}</div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Source</label>
                    <div className="mt-1 font-mono text-sm">{selectedLog.source}</div>
                  </div>
                  {selectedLog.ip_address && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">IP Address</label>
                      <div className="mt-1 font-mono text-sm">{selectedLog.ip_address}</div>
                    </div>
                  )}
                  {selectedLog.action_type && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Action Type</label>
                      <div className="mt-1">{selectedLog.action_type}</div>
                    </div>
                  )}
                </div>
                
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Message</label>
                  <div className="mt-1 p-3 bg-muted rounded-md text-sm">
                    {selectedLog.message}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}