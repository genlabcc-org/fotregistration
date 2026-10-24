import React from 'react';
import { motion } from 'framer-motion';
import { IconPlus } from '../../lib/icons';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionText?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionText,
  onAction,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-10 sm:p-12 rounded-3xl bg-surface border-2 border-dashed border-hairline text-center space-y-4 max-w-md mx-auto"
    >
      <div className="w-14 h-14 rounded-2xl bg-sunken border border-hairline text-muted flex items-center justify-center mx-auto">
        {icon || <IconPlus size={22} />}
      </div>

      <div className="space-y-1">
        <h4 className="font-display text-base font-bold text-ink">
          {title}
        </h4>
        <p className="text-body text-xs leading-relaxed max-w-sm mx-auto">
          {description}
        </p>
      </div>

      {actionText && onAction && (
        <div className="pt-2">
          <button
            type="button"
            onClick={onAction}
            className="h-10 px-5 rounded-xl bg-ink text-canvas font-bold text-xs uppercase tracking-wider inline-flex items-center gap-2 hover:opacity-90 transition-all cursor-pointer"
          >
            <IconPlus size={13} />
            <span>{actionText}</span>
          </button>
        </div>
      )}
    </motion.div>
  );
};
