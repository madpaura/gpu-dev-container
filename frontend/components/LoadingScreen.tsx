import React from 'react';
import { Container } from 'lucide-react';

export const LoadingScreen: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center p-4">
      <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center mb-6">
        <Container className="w-8 h-8 text-white" />
      </div>
      
      <h1 className="text-2xl font-bold text-white mb-6">GPU Dashboard</h1>
      
      <div className="flex flex-col items-center">
        <div className="w-10 h-10 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mb-4"></div>
        <p className="text-slate-400">Loading application...</p>
      </div>
    </div>
  );
};
