import React from 'react';
import { motion } from 'framer-motion';
import { IconAlertCircle, IconArrowRight } from '../../lib/icons';

interface ErrorStateProps {
  title?: string;
  description?: string;
  retryText?: string;
  onRetry?: () => void;
  secondaryText?: string;
  onSecondary?: () => void;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Something went wrong',
  description = 'We encountered an unexpected error processing this request. Your data remains secure.',
  retryText = 'Try Again',
  onRetry,
  secondaryText,
  onSecondary,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className="p-8 sm:p-10 rounded-3xl bg-surface border border-hairline shadow-card text-center space-y-5 max-w-md mx-auto"
    >
      <div className="w-14 h-14 rounded-2xl bg-[#FFF5F5] dark:bg-[#2A1414] border border-[#E53935]/30 text-[#E53935] flex items-center justify-center mx-auto">
        <IconAlertCircle size={26} />
      </div>

      <div className="space-y-1.5">
        <h3 className="font-display text-xl font-bold tracking-tight text-ink">
          {title}
        </h3>
        <p className="text-body text-xs sm:text-sm leading-relaxed">
          {description}
        </p>
      </div>

      {(onRetry || onSecondary) && (
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="w-full sm:w-auto h-11 px-5 rounded-xl bg-ink text-canvas font-bold text-xs uppercase tracking-wider inline-flex items-center justify-center gap-2 hover:opacity-90 transition-all cursor-pointer"
            >
              <span>{retryText}</span>
              <IconArrowRight size={13} />
            </button>
          )}
          {onSecondary && (
            <button
              type="button"
              onClick={onSecondary}
              className="w-full sm:w-auto h-11 px-5 rounded-xl bg-surface hover:bg-sunken border border-hairline text-ink font-semibold text-xs tracking-wider inline-flex items-center justify-center transition-all cursor-pointer"
            >
              {secondaryText || 'Dismiss'}
            </button>
          )}
        </div>
      )}
    </motion.div>
  );
};
