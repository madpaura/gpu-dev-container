
import React, { useState } from 'react';
import { Settings, User, LogOut, Cpu, KeyRound } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { ThemeToggle } from './ThemeToggle';
import { PasswordResetNotifications } from './PasswordResetNotifications';
import { UserPasswordResetRequestDialog } from './UserPasswordResetRequestDialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { userServicesApi } from '../lib/api';

export const Header: React.FC = () => {
  const { user, logout } = useAuth();
  const [isPasswordResetDialogOpen, setIsPasswordResetDialogOpen] = useState(false);
  const [resetRequestSuccess, setResetRequestSuccess] = useState(false);

  const handlePasswordResetRequest = async (reason: string) => {
    if (!user?.token) return;

    try {
      const response = await userServicesApi.requestPasswordReset(user.token, reason);
      if (response.success) {
        setResetRequestSuccess(true);
        setTimeout(() => setResetRequestSuccess(false), 5000);
      }
    } catch (err) {
      console.error('Error requesting password reset:', err);
    }
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-sm border-b border-border">
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-black dark:bg-white rounded-lg flex items-center justify-center">
              <Cpu className="w-8 h-8 text-white dark:text-black" />
            </div>
            <h1 className="text-xl font-bold text-foreground">GPU Dashboard</h1>
          </div>
          <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-muted rounded-full">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
            <span className="text-sm text-muted-foreground">Connected</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <PasswordResetNotifications />
          <ThemeToggle />
          
          {/* Settings Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors">
                <Settings className="w-5 h-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {user?.role === 'user' && (
                <DropdownMenuItem onClick={() => setIsPasswordResetDialogOpen(true)}>
                  <KeyRound className="w-4 h-4 mr-2" />
                  Request Password Reset
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          
          <div className="flex items-center gap-3 pl-4 border-l border-border">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-black dark:bg-white rounded-full flex items-center justify-center">
                <User className="w-4 h-4 text-white dark:text-black" />
              </div>
              <div className="hidden md:block">
                <p className="text-sm font-medium text-foreground">{user?.name}</p>
                <p className="text-xs text-muted-foreground capitalize">{user?.role}</p>
              </div>
            </div>
            <button 
              onClick={logout}
              className="p-2 text-muted-foreground hover:text-red-400 hover:bg-accent rounded-lg transition-colors"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Password Reset Request Dialog */}
      <UserPasswordResetRequestDialog
        isOpen={isPasswordResetDialogOpen}
        onClose={() => setIsPasswordResetDialogOpen(false)}
        onSubmit={handlePasswordResetRequest}
      />
    </header>
  );
};
