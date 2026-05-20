import React from 'react';

interface JupyterIconProps {
  className?: string;
}

export const JupyterIcon: React.FC<JupyterIconProps> = ({ className = "w-5 h-5" }) => {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm-1.5 4.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm3 15a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm-7.5-1.5a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0zm0-12a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0zm6 6a3 3 0 1 1 0-6 3 3 0 0 1 0 6z" />
    </svg>
  );
};
