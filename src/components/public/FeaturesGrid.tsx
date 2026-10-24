import React from 'react';
import { motion } from 'framer-motion';
import { IconShield, IconUsers, IconSparkles, IconCheck } from '../../lib/icons';

const FEATURES = [
  {
    icon: <IconSparkles size={22} className="text-[#C2E600]" />,
    badge: 'Core Track',
    title: 'Architectural Keynotes & Deep Dives',
    description:
      'Zero marketing slides. Unfiltered systems breakdowns from engineers running production microservices and large-scale AI models at Indian tech scaleups.',
    points: ['Production post-mortems', 'Distributed systems patterns', 'Real-world benchmarking data'],
  },
  {
    icon: <IconUsers size={22} className="text-[#D4AF37]" />,
    badge: 'Competitive Sprint',
    title: '2-Person Live Builder Sprint',
    description:
      'Enter as a duo or pair up on the floor. Build working prototypes under time pressure with instant judging and cash prizes presented on the main stage.',
    points: ['₹50,000+ in sponsor prizes', 'Live code evaluation', 'Direct feedback from senior mentors'],
  },
  {
    icon: <IconCheck size={22} className="text-[#10B981]" />,
    badge: 'Networking',
    title: 'Founder & Staff Engineer Office Hours',
    description:
      'Structured 1-on-1 and small pod roundtables. Discuss career inflection points, system scaling bottlenecks, and seed funding insights with vetted operators.',
    points: ['Curated 1:1 matchmaking', 'Zero corporate gatekeeping', 'Direct VC & angel presence'],
  },
  {
    icon: <IconShield size={22} className="text-[#C2E600]" />,
    badge: 'Security Tier',
    title: 'Instant Cryptographic Verification',
    description:
      'Every registration pass is generated with an SHA-256 HMAC digital signature and encoded into an encrypted QR ticket emailed immediately upon payment.',
    points: ['Real-time scanner validation', 'Zero paper, zero ticket loss', 'Verified identity pass'],
  },
];

export const FeaturesGrid: React.FC = () => {
  return (
    <section id="features" className="py-24 sm:py-32 px-4 sm:px-6 max-w-7xl mx-auto hairline-t select-none">
      <div className="max-w-3xl mb-16 space-y-4">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-surface border border-hairline text-xs font-mono font-bold text-muted shadow-xs"
        >
          <span className="w-2 h-2 rounded-full bg-[#C2E600]" />
          <span>The Experience Architecture</span>
        </motion.div>

        <h2 className="font-display text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-ink leading-[1.05]">
          Engineered for depth.{' '}
          <span className="text-[#8C8C85] dark:text-[#70706A] font-normal">
            Designed for impact.
          </span>
        </h2>
        <p className="text-body text-base sm:text-lg leading-relaxed max-w-2xl">
          Everything at Friends of Tech is calibrated to deliver maximum return on your time as a builder.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {FEATURES.map((feature, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.1, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="p-8 sm:p-10 rounded-3xl bg-surface border border-hairline shadow-card hover:shadow-luxury hover:-translate-y-1.5 transition-all duration-300 space-y-6 relative group overflow-hidden"
          >
            <div className="flex items-center justify-between">
              <div className="w-12 h-12 rounded-2xl bg-sunken border border-hairline flex items-center justify-center">
                {feature.icon}
              </div>
              <span className="text-xs font-mono font-bold text-muted bg-sunken px-3 py-1 rounded-full border border-hairline">
                {feature.badge}
              </span>
            </div>

            <div className="space-y-2">
              <h3 className="font-display text-2xl font-bold text-ink tracking-tight">
                {feature.title}
              </h3>
              <p className="text-body text-sm leading-relaxed">
                {feature.description}
              </p>
            </div>

            <ul className="space-y-2.5 pt-4 border-t border-hairline">
              {feature.points.map((pt, ptIdx) => (
                <li key={ptIdx} className="flex items-center gap-2.5 text-xs font-mono text-ink">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#C2E600]" />
                  <span>{pt}</span>
                </li>
              ))}
            </ul>
          </motion.div>
        ))}
      </div>
    </section>
  );
};
