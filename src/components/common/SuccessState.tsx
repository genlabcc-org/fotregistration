import React from 'react';
import { motion } from 'framer-motion';
import { IconCheck, IconArrowRight, IconShieldCheck } from '../../lib/icons';

interface SuccessStateProps {
  title?: string;
  description?: string;
  badge?: string;
  actionText?: string;
  onAction?: () => void;
  secondaryActionText?: string;
  onSecondaryAction?: () => void;
}

export const SuccessState: React.FC<SuccessStateProps> = ({
  title = 'Operation Successful',
  description = 'Your submission has been securely confirmed and recorded.',
  badge = 'Verified Pass',
  actionText,
  onAction,
  secondaryActionText,
  onSecondaryAction,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="p-8 sm:p-12 rounded-3xl bg-surface border border-hairline shadow-luxury text-center space-y-6 max-w-lg mx-auto relative overflow-hidden"
    >
      <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#D4AF37] via-[#C2E600] to-[#D4AF37]" />

      <div className="w-16 h-16 rounded-2xl bg-[#FAFCF0] dark:bg-[#1A2010] border border-[#C2E600]/40 text-[#0A0A0A] dark:text-[#C2E600] flex items-center justify-center mx-auto shadow-gold-glow">
        <IconCheck size={30} />
      </div>

      <div className="space-y-2">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FAFAF7] dark:bg-[#1C1C1C] border border-hairline text-[11px] font-mono font-bold text-[#8C8C85]">
          <IconShieldCheck size={13} className="text-[#10B981]" />
          <span>{badge}</span>
        </div>
        <h3 className="font-display text-2xl font-bold tracking-tight text-ink">
          {title}
        </h3>
        <p className="text-body text-sm leading-relaxed max-w-md mx-auto">
          {description}
        </p>
      </div>

      {(actionText || secondaryActionText) && (
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4">
          {actionText && (
            <button
              type="button"
              onClick={onAction}
              className="w-full sm:w-auto h-12 px-6 rounded-xl bg-ink text-canvas font-bold text-xs uppercase tracking-wider inline-flex items-center justify-center gap-2 hover:opacity-90 transition-all cursor-pointer shadow-md"
            >
              <span>{actionText}</span>
              <IconArrowRight size={13} />
            </button>
          )}
          {secondaryActionText && (
            <button
              type="button"
              onClick={onSecondaryAction}
              className="w-full sm:w-auto h-12 px-6 rounded-xl bg-surface hover:bg-sunken border border-hairline text-ink font-semibold text-xs tracking-wider inline-flex items-center justify-center transition-all cursor-pointer"
            >
              {secondaryActionText}
            </button>
          )}
        </div>
      )}
    </motion.div>
  );
};
