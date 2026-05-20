import React from 'react';

interface GpuIconProps {
  className?: string;
  size?: number;
}

export const GpuIcon: React.FC<GpuIconProps> = ({ className = '', size = 24 }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
      <path d="M6 7h12v6H6z" />
      <path d="M8 9h2v2H8z" />
      <path d="M14 9h2v2h-2z" />
    </svg>
  );
};
