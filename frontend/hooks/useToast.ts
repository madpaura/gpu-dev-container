import { useState, useCallback } from 'react';

export interface Toast {
  id: string;
  title: string;
  description?: string;
  type: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).substr(2, 9);
    const newToast = { ...toast, id };
    
    setToasts(prev => [...prev, newToast]);
    
    // Auto remove after duration (default 5 seconds)
    const duration = toast.duration ?? 5000;
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration);
    
    return id;
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const toast = useCallback((toast: Omit<Toast, 'id'>) => {
    return addToast(toast);
  }, [addToast]);

  return {
    toasts,
    toast,
    removeToast,
    success: (title: string, description?: string) => toast({ title, description, type: 'success' }),
    error: (title: string, description?: string) => toast({ title, description, type: 'error' }),
    warning: (title: string, description?: string) => toast({ title, description, type: 'warning' }),
    info: (title: string, description?: string) => toast({ title, description, type: 'info' }),
  };
}
