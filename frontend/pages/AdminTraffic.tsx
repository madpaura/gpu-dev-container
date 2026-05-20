import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  LineChart, Line, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from 'recharts';
import { 
  Activity, Users, Globe, Clock, TrendingUp, Filter, RefreshCw, 
  Download, Calendar, Eye, AlertTriangle 
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { trafficApi, TrafficAnalytics, RealTimeStats } from '@/lib/api';

interface FilterState {
  period: 'daily' | 'weekly' | 'monthly';
  days: number;
  ipFilter: string;
  userFilter: string;
}

const AdminTraffic: React.FC = () => {
  const { user } = useAuth();
  const [analytics, setAnalytics] = useState<TrafficAnalytics | null>(null);
  const [realTimeStats, setRealTimeStats] = useState<RealTimeStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>({
    period: 'daily',
    days: 30,
    ipFilter: '',
    userFilter: ''
  });
  // Local state for text inputs (only apply on Enter)
  const [ipFilterInput, setIpFilterInput] = useState('');
  const [userFilterInput, setUserFilterInput] = useState('');
  const [activeTab, setActiveTab] = useState('overview');

  const fetchTrafficData = async () => {
    if (!user?.token) return;

    setLoading(true);
    setError(null);

    try {
      const [analyticsRes, realTimeRes] = await Promise.all([
        trafficApi.getTrafficAnalytics(
          user.token,
          filters.period,
          filters.days,
          filters.ipFilter || undefined,
          filters.userFilter || undefined
        ),
        trafficApi.getRealTimeStats(user.token)
      ]);

      if (!analyticsRes.success) {
        throw new Error(analyticsRes.error || 'Failed to fetch analytics');
      }

      if (!realTimeRes.success) {
        throw new Error(realTimeRes.error || 'Failed to fetch real-time stats');
      }

      setAnalytics(analyticsRes.data!);
      setRealTimeStats(realTimeRes.data!);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch traffic data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrafficData();
    // Only trigger on period/days changes, not on text filter changes
  }, [filters.period, filters.days, user?.token]);

  const handleFilterChange = (key: keyof FilterState, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setFilters({
      period: 'daily',
      days: 30,
      ipFilter: '',
      userFilter: ''
    });
    setIpFilterInput('');
    setUserFilterInput('');
  };

  const handleFilterKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, field: 'ipFilter' | 'userFilter') => {
    if (e.key === 'Enter') {
      const value = field === 'ipFilter' ? ipFilterInput : userFilterInput;
      setFilters(prev => ({ ...prev, [field]: value }));
      fetchTrafficData();
    }
  };

  const exportData = () => {
    if (!analytics) return;
    
    const dataStr = JSON.stringify(analytics, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `traffic-analytics-${new Date().toISOString().split('T')[0]}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    return `${Math.round(seconds / 3600)}h`;
  };

  const getChartData = () => {
    if (!analytics) {
      console.log('No analytics data available');
      return [];
    }
    
    // Access the nested data structure - analytics.data.daily_stats
    const data = analytics.data?.daily_stats || analytics.daily_stats || [];
    
    if (!Array.isArray(data) || data.length === 0) {
      console.log('No chart data available or data is not an array');
      return [];
    }
    
    // Format the data for better chart display
    const formattedData = data.map((item, index) => {
      const formattedItem = {
        ...item,
        date: item.date ? new Date(item.date).toLocaleDateString() : `Day ${index + 1}`,
        total_requests: Number(item.total_requests) || 0,
        unique_ips: Number(item.unique_ips) || 0,
        unique_users: Number(item.unique_users) || 0,
        error_count: Number(item.error_count) || 0
      };
      return formattedItem;
    });
    
    return formattedData;
  };

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading traffic analytics...</span>
      </div>
    );
  }

  if (error) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          Error loading traffic data: {error}
          <Button 
            variant="outline" 
            size="sm" 
            className="ml-2" 
            onClick={fetchTrafficData}
          >
            <RefreshCw className="h-4 w-4 mr-1" />
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Traffic Analytics</h1>
          <p className="text-muted-foreground">
            Monitor user access patterns and system usage
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={fetchTrafficData}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline" onClick={exportData}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Period</label>
              <Select 
                value={filters.period} 
                onValueChange={(value) => handleFilterChange('period', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Days Range</label>
              <Select 
                value={filters.days.toString()} 
                onValueChange={(value) => handleFilterChange('days', parseInt(value))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">IP Filter</label>
              <Input
                placeholder="Filter by IP (press Enter)"
                value={ipFilterInput}
                onChange={(e) => setIpFilterInput(e.target.value)}
                onKeyDown={(e) => handleFilterKeyDown(e, 'ipFilter')}
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">User Filter</label>
              <Input
                placeholder="Filter by username (press Enter)"
                value={userFilterInput}
                onChange={(e) => setUserFilterInput(e.target.value)}
                onKeyDown={(e) => handleFilterKeyDown(e, 'userFilter')}
              />
            </div>
          </div>
          
          <div className="flex items-center gap-2 mt-4">
            <Button onClick={() => {
              setFilters(prev => ({ ...prev, ipFilter: ipFilterInput, userFilter: userFilterInput }));
              fetchTrafficData();
            }}>
              <Eye className="h-4 w-4 mr-2" />
              Apply Filters
            </Button>
            <Button variant="outline" onClick={clearFilters}>
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Summary Stats */}
      {(analytics?.data?.summary || analytics?.summary) && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Requests</p>
                  <p className="text-2xl font-bold">
                    {(analytics.data?.summary || analytics.summary)?.total_requests?.toLocaleString() || '0'}
                  </p>
                </div>
                <Activity className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Unique IPs</p>
                  <p className="text-2xl font-bold">
                    {(analytics.data?.summary || analytics.summary)?.total_unique_ips?.toLocaleString() || '0'}
                  </p>
                </div>
                <Globe className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Unique Users</p>
                  <p className="text-2xl font-bold">
                    {(analytics.data?.summary || analytics.summary)?.total_unique_users?.toLocaleString() || '0'}
                  </p>
                </div>
                <Users className="h-8 w-8 text-purple-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Avg Session</p>
                  <p className="text-2xl font-bold">
                    {formatDuration(parseFloat((analytics.data?.summary || analytics.summary)?.avg_session_duration || '0'))}
                  </p>
                </div>
                <Clock className="h-8 w-8 text-orange-500" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Analytics */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="endpoints">Endpoints</TabsTrigger>
          <TabsTrigger value="patterns">Patterns</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Traffic Trends</CardTitle>
              <CardDescription>
                Request volume over time ({filters.period} view)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <AreaChart data={getChartData()}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey={filters.period === 'monthly' ? 'month' : 
                            filters.period === 'weekly' ? 'week_start' : 'date'} 
                  />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Area 
                    type="monotone" 
                    dataKey="total_requests" 
                    stroke="#8884d8" 
                    fill="#8884d8" 
                    fillOpacity={0.6}
                    name="Total Requests"
                  />
                  <Area 
                    type="monotone" 
                    dataKey="unique_ips" 
                    stroke="#82ca9d" 
                    fill="#82ca9d" 
                    fillOpacity={0.6}
                    name="Unique IPs"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {analytics && (
            <Card>
              <CardHeader>
                <CardTitle>Hourly Distribution</CardTitle>
                <CardDescription>
                  Request patterns throughout the day
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={(analytics?.data?.hourly_distribution || analytics?.hourly_distribution) || []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="hour" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="request_count" fill="#8884d8" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="users" className="space-y-6">
          {analytics && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Top Users by Requests</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {((analytics?.data?.top_users || analytics?.top_users) || []).slice(0, 10).map((user, index) => (
                      <div key={user.username} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Badge variant="outline">{index + 1}</Badge>
                          <div>
                            <p className="font-medium">{user.username}</p>
                            <p className="text-sm text-muted-foreground">
                              {user.request_count?.toLocaleString() || '0'} requests
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Last: {user.last_access ? new Date(user.last_access).toLocaleDateString() : 'N/A'}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-medium">{user.unique_ips || 0}</p>
                          <p className="text-sm text-muted-foreground">unique IPs</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Top IPs by Requests</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {((analytics?.data?.top_ips || analytics?.top_ips) || []).slice(0, 10).map((ip, index) => (
                      <div key={ip.ip_address} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Badge variant="outline">{index + 1}</Badge>
                          <div>
                            <p className="font-medium font-mono">{ip.ip_address}</p>
                            <p className="text-sm text-muted-foreground">
                              {ip.request_count?.toLocaleString() || '0'} requests
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-medium">{ip.unique_users || 0}</p>
                          <p className="text-sm text-muted-foreground">
                            {ip.unique_users === 1 ? 'user' : 'users'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="endpoints" className="space-y-6">
          {analytics && (
            <Card>
              <CardHeader>
                <CardTitle>Endpoint Statistics</CardTitle>
                <CardDescription>
                  Most accessed API endpoints and their performance
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {((analytics?.data?.endpoint_stats || analytics?.endpoint_stats) || []).map((endpoint, index) => (
                    <div key={endpoint.endpoint} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline">{index + 1}</Badge>
                        <div>
                          <p className="font-medium font-mono">{endpoint.endpoint}</p>
                          <p className="text-sm text-muted-foreground">
                            {formatDuration(endpoint.avg_duration || 0)} average duration
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">{endpoint.request_count?.toLocaleString() || '0'} requests</p>
                        <div className="flex items-center gap-2">
                          {(endpoint.error_count || 0) > 0 && (
                            <Badge variant="destructive" className="text-xs">
                              {endpoint.error_count || 0} errors
                            </Badge>
                          )}
                          <Badge variant="secondary" className="text-xs">
                            {(((endpoint.error_count || 0) / (endpoint.request_count || 1)) * 100).toFixed(1)}% error rate
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="patterns" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Error Analysis</CardTitle>
                <CardDescription>
                  Request success and error rates
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {(analytics?.data?.summary || analytics?.summary) && (
                    <>
                      <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                        <div>
                          <p className="font-medium text-green-800">Successful Requests</p>
                          <p className="text-sm text-green-600">No errors reported</p>
                        </div>
                        <Badge variant="secondary" className="bg-green-100 text-green-800">
                          {(((analytics.data?.summary || analytics.summary).total_requests - (analytics.data?.summary || analytics.summary).total_errors) / (analytics.data?.summary || analytics.summary).total_requests * 100).toFixed(1)}%
                        </Badge>
                      </div>
                      
                      <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                        <div>
                          <p className="font-medium text-red-800">Error Requests</p>
                          <p className="text-sm text-red-600">Failed requests</p>
                        </div>
                        <Badge variant="destructive" className="bg-red-100 text-red-800">
                          {(analytics.data?.summary || analytics.summary)?.error_rate?.toFixed(1) || '0.0'}%
                        </Badge>
                      </div>
                      
                      <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                        <div>
                          <p className="font-medium text-blue-800">Total Errors</p>
                          <p className="text-sm text-blue-600">Error count</p>
                        </div>
                        <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                          {(analytics.data?.summary || analytics.summary)?.total_errors || 0}
                        </Badge>
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Data Transfer</CardTitle>
                <CardDescription>
                  Bandwidth usage patterns
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {(analytics?.data?.daily_stats || analytics?.daily_stats)?.[0] && (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Total Data Sent</span>
                        <span className="font-mono">
                          {formatBytes(parseInt((analytics.data?.daily_stats || analytics.daily_stats)[0].total_bytes_sent || '0'))}
                        </span>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Total Data Received</span>
                        <span className="font-mono">
                          {formatBytes(parseInt((analytics.data?.daily_stats || analytics.daily_stats)[0].total_bytes_received || '0'))}
                        </span>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Average per Request</span>
                        <span className="font-mono">
                          {formatBytes(
                            (analytics.data?.daily_stats || analytics.daily_stats)[0].total_requests > 0 
                              ? parseInt((analytics.data?.daily_stats || analytics.daily_stats)[0].total_bytes_sent || '0') / (analytics.data?.daily_stats || analytics.daily_stats)[0].total_requests
                              : 0
                          )}
                        </span>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Daily Requests</span>
                        <span className="font-mono">
                          {(analytics.data?.summary || analytics.summary)?.avg_daily_requests?.toFixed(0) || '0'}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminTraffic;