import React from 'react';
import { motion } from 'framer-motion';
import { IconStar, IconQuote, IconShieldCheck } from '../../lib/icons';

const TESTIMONIALS = [
  {
    quote:
      'Friends of Tech felt entirely different from typical commercial tech events. The curated team sprints and unvarnished candid talks gave our engineering team actionable architecture breakthroughs.',
    author: 'Aarav Deshmukh',
    role: 'Principal Architect',
    company: 'Fintech Scaleup (Bengaluru)',
    tag: 'Attended 2024 & 2025',
    rating: 5,
  },
  {
    quote:
      'Met my co-founder during the 2-person sprint track last year. 8 months later, our AI infrastructure startup closed our seed round. If you build real things in India, you have to be in this room.',
    author: 'Neha Sundaram',
    role: 'Co-Founder & CTO',
    company: 'NexusDB Labs',
    tag: 'Sprint Winner 2025',
    rating: 5,
  },
  {
    quote:
      'Zero fluff, zero marketing decks disguised as keynotes. Raw, deep dives into distributed systems and production AI models. The ticketing and verification passes were issued instantly.',
    author: 'Vikramaditya Rao',
    role: 'Staff Systems Engineer',
    company: 'Global Cloud Systems',
    tag: 'Keynote Speaker & Builder',
    rating: 5,
  },
];

const METRICS = [
  { value: '1,400+', label: 'Verified Alumni Builders' },
  { value: '4.95 / 5', label: 'Average Event Satisfaction' },
  { value: '38+', label: 'Funded Startups Seeded' },
  { value: '100%', label: 'Cryptographically Verified Entry' },
];

export const TestimonialsSection: React.FC = () => {
  return (
    <section id="community" className="py-24 sm:py-32 px-4 sm:px-6 max-w-7xl mx-auto relative select-none">
      {/* Header */}
      <div className="max-w-3xl mb-16 space-y-4">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-surface border border-hairline text-xs font-mono font-bold text-muted shadow-xs"
        >
          <span className="w-2 h-2 rounded-full bg-[#D4AF37]" />
          <span>Proof of Community & Trust</span>
        </motion.div>

        <h2 className="font-display text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-ink leading-[1.05]">
          Built with builders.{' '}
          <span className="text-[#8C8C85] dark:text-[#70706A] font-normal">
            Proven by leaders.
          </span>
        </h2>
        <p className="text-body text-base sm:text-lg leading-relaxed max-w-2xl">
          Hear from founders, staff engineers, and systems builders who have experienced Friends of Tech firsthand.
        </p>
      </div>

      {/* Metrics Banner */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6 mb-16">
        {METRICS.map((metric, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.1, duration: 0.5 }}
            className="p-6 rounded-2xl bg-surface border border-hairline shadow-card text-center sm:text-left space-y-1 hover:-translate-y-1 transition-transform"
          >
            <div className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-ink font-mono">
              {metric.value}
            </div>
            <div className="text-xs font-mono font-medium text-muted">
              {metric.label}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Testimonials 3-Column Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {TESTIMONIALS.map((t, idx) => (
          <motion.article
            key={idx}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: idx * 0.12, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="p-8 rounded-3xl bg-surface border border-hairline shadow-card hover:shadow-luxury hover:-translate-y-1.5 transition-all duration-300 flex flex-col justify-between space-y-6 relative group overflow-hidden"
          >
            {/* Top Accent line on hover */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#C2E600] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

            {/* Stars & Verification Tag */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 text-[#D4AF37]">
                  {Array.from({ length: t.rating }).map((_, starIdx) => (
                    <IconStar key={starIdx} size={14} />
                  ))}
                </div>
                <div className="inline-flex items-center gap-1 text-[11px] font-mono font-bold text-muted bg-sunken px-2.5 py-0.5 rounded-full border border-hairline">
                  <IconShieldCheck size={12} className="text-[#10B981]" />
                  <span>{t.tag}</span>
                </div>
              </div>

              {/* Quote */}
              <blockquote className="text-sm sm:text-[15px] text-body leading-relaxed relative">
                <IconQuote
                  size={32}
                  className="absolute -top-3 -left-2 text-hairline/50 dark:text-hairline/20 -z-10 select-none"
                />
                "{t.quote}"
              </blockquote>
            </div>

            {/* Author */}
            <div className="pt-4 border-t border-hairline flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-sunken border border-hairline flex items-center justify-center font-mono font-bold text-xs text-ink">
                {t.author.charAt(0)}
              </div>
              <div>
                <h3 className="text-xs font-bold text-ink">
                  {t.author}
                </h3>
                <p className="text-[11px] text-muted font-medium">
                  {t.role} · {t.company}
                </p>
              </div>
            </div>
          </motion.article>
        ))}
      </div>
    </section>
  );
};
