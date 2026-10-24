import React from 'react';
import { Skeleton } from './Skeleton';

interface LoadingStateProps {
  message?: string;
  variant?: 'card' | 'table' | 'form' | 'full';
  count?: number;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  message = 'Loading verified data...',
  variant = 'card',
  count = 3,
}) => {
  if (variant === 'full') {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center p-8 space-y-6">
        <div className="w-16 h-16 rounded-2xl skeleton-shimmer border border-[#E6E6DF] dark:border-[#262626] flex items-center justify-center">
          <div className="w-6 h-6 rounded-full border-2 border-[#C2E600] border-t-transparent animate-spin" />
        </div>
        <div className="space-y-2 text-center max-w-sm">
          <Skeleton variant="text" className="w-48 mx-auto" />
          <p className="text-xs font-mono text-[#8C8C85] dark:text-[#70706A]">{message}</p>
        </div>
      </div>
    );
  }

  if (variant === 'form') {
    return (
      <div className="space-y-6 p-6 sm:p-8 rounded-2xl bg-surface border border-hairline shadow-card">
        <div className="space-y-2">
          <Skeleton variant="text" className="w-40 h-6" />
          <Skeleton variant="text" className="w-64 h-3.5" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4">
          <Skeleton variant="rectangular" className="h-12" />
          <Skeleton variant="rectangular" className="h-12" />
          <Skeleton variant="rectangular" className="h-12" />
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="p-6 rounded-2xl bg-surface border border-hairline shadow-card space-y-4"
        >
          <div className="flex items-center justify-between">
            <Skeleton variant="circular" className="w-10 h-10" />
            <Skeleton variant="text" className="w-16 h-5" />
          </div>
          <Skeleton variant="text" className="w-3/4 h-5" />
          <Skeleton variant="text" className="w-full h-3.5" />
          <Skeleton variant="text" className="w-2/3 h-3.5" />
          <div className="pt-4 border-t border-hairline flex items-center justify-between">
            <Skeleton variant="text" className="w-20 h-4" />
            <Skeleton variant="rectangular" className="w-24 h-8" />
          </div>
        </div>
      ))}
    </div>
  );
};
