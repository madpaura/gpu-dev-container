import React, { useState, useEffect } from 'react';
import { Bell, KeyRound, X, Check, RefreshCw } from 'lucide-react';
import { adminApi, type PasswordResetRequest } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { PasswordResetDialog } from './PasswordResetDialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from './ui/popover';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';

export const PasswordResetNotifications: React.FC = () => {
  const { user } = useAuth();
  const [requests, setRequests] = useState<PasswordResetRequest[]>([]);
  const [count, setCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<PasswordResetRequest | null>(null);
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);

  const fetchRequests = async () => {
    if (!user?.token || user?.role !== 'admin') {
      console.log('PasswordResetNotifications: Skipping fetch - not admin or no token');
      return;
    }

    try {
      console.log('PasswordResetNotifications: Fetching password reset requests...');
      const response = await adminApi.getPasswordResetRequests(user.token);
      console.log('PasswordResetNotifications: Response:', response);
      
      if (response.success && response.data) {
        setRequests(response.data.requests);
        setCount(response.data.count);
        console.log('PasswordResetNotifications: Set requests:', response.data.requests.length, 'count:', response.data.count);
      } else {
        console.error('PasswordResetNotifications: Failed response:', response.error);
      }
    } catch (error) {
      console.error('PasswordResetNotifications: Exception:', error);
    }
  };

  useEffect(() => {
    fetchRequests();
    // Poll every 30 seconds
    const interval = setInterval(fetchRequests, 30000);
    return () => clearInterval(interval);
  }, [user?.token, user?.role]);

  const handleResetPassword = (request: PasswordResetRequest) => {
    setSelectedRequest(request);
    setIsResetDialogOpen(true);
    setIsOpen(false);
  };

  const handlePasswordResetSubmit = async (newPassword: string) => {
    if (!user?.token || !selectedRequest) return;

    try {
      await adminApi.resetUserPassword(selectedRequest.user_id.toString(), newPassword, user.token);
      // Refresh the requests list
      await fetchRequests();
      setIsResetDialogOpen(false);
      setSelectedRequest(null);
    } catch (error) {
      console.error('Failed to reset password:', error);
      throw error;
    }
  };

  const handleReject = async (requestId: number) => {
    if (!user?.token) return;

    try {
      await adminApi.rejectPasswordResetRequest(requestId, user.token);
      // Refresh the requests list
      await fetchRequests();
    } catch (error) {
      console.error('Failed to reject request:', error);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  // Only show for admin users
  if (!user || user.role !== 'admin') return null;

  return (
    <>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <button className="relative p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors">
            <Bell className="w-5 h-5" />
            {count > 0 && (
              <Badge 
                variant="destructive" 
                className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
              >
                {count}
              </Badge>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-96 p-0" align="end">
          <div className="flex items-center justify-between p-4 border-b">
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4" />
              <h3 className="font-semibold">Password Reset Requests</h3>
            </div>
            <div className="flex items-center gap-2">
              {count > 0 && (
                <Badge variant="secondary">{count}</Badge>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => fetchRequests()}
                className="h-6 w-6 p-0"
                title="Refresh"
              >
                <RefreshCw className="w-3 h-3" />
              </Button>
            </div>
          </div>
          
          {requests.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Bell className="w-12 h-12 mx-auto mb-2 opacity-20" />
              <p className="text-sm">No pending requests</p>
            </div>
          ) : (
            <ScrollArea className="max-h-96">
              <div className="divide-y">
                {requests.map((request) => (
                  <div key={request.id} className="p-4 hover:bg-accent/50 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium text-sm truncate">{request.username}</p>
                          <Badge variant="outline" className="text-xs">
                            {formatDate(request.requested_at)}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{request.email}</p>
                        {request.reason && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            Reason: {request.reason}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <Button
                        size="sm"
                        variant="default"
                        className="flex-1"
                        onClick={() => handleResetPassword(request)}
                      >
                        <KeyRound className="w-3 h-3 mr-1" />
                        Reset
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleReject(request.id)}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </PopoverContent>
      </Popover>

      {/* Password Reset Dialog */}
      {selectedRequest && (
        <PasswordResetDialog
          isOpen={isResetDialogOpen}
          onClose={() => {
            setIsResetDialogOpen(false);
            setSelectedRequest(null);
          }}
          onReset={handlePasswordResetSubmit}
          userName={selectedRequest.username}
          userEmail={selectedRequest.email}
        />
      )}
    </>
  );
};
