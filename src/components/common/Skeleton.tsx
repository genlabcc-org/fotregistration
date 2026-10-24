import React from 'react';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'rectangular' | 'circular' | 'card';
  width?: string | number;
  height?: string | number;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className = '',
  variant = 'rectangular',
  width,
  height,
}) => {
  const variantStyles = {
    text: 'h-4 rounded-md',
    rectangular: 'rounded-xl',
    circular: 'rounded-full',
    card: 'h-48 rounded-2xl',
  }[variant];

  return (
    <div
      role="status"
      aria-label="Loading content..."
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
      }}
      className={`skeleton-shimmer border border-[#E6E6DF]/30 dark:border-[#262626] ${variantStyles} ${className}`}
    >
      <span className="sr-only">Loading...</span>
    </div>
  );
};
