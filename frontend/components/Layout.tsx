
import React from 'react';
import { useAuth } from '../hooks/useAuth';
import { AdminSidebar } from './AdminSidebar';
import { UserSidebar } from './UserSidebar';
import { Header } from './Header';
import { SidebarProvider, useSidebar } from '../hooks/useSidebar';

interface LayoutProps {
  children: React.ReactNode;
}

const LayoutContent: React.FC<LayoutProps> = ({ children }) => {
  const { user } = useAuth();
  const { collapsed } = useSidebar();

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <Header />
      <div className="flex">
        {(user?.role === 'admin' || user?.role === 'qvp') ? <AdminSidebar /> : <UserSidebar />}
        <main className={`flex-1 p-6 ${collapsed ? 'ml-16' : 'ml-64'} mt-16 pb-8 transition-all duration-300 overflow-y-auto`}>
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <SidebarProvider>
      <LayoutContent>{children}</LayoutContent>
    </SidebarProvider>
  );
};
