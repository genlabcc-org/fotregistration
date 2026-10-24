import React from 'react';
import { Link } from 'react-router-dom';
import { IconShield, IconShieldCheck, IconLock } from '../../lib/icons';

export const PublicFooter: React.FC = () => {
  return (
    <footer className="w-full bg-surface hairline-t py-16 px-4 sm:px-6 select-none transition-colors">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-12 mb-16">
          {/* Brand & Corporate Presence (2 cols) */}
          <div className="md:col-span-2 space-y-4">
            <Link to="/" className="inline-block font-display text-2xl font-bold tracking-tight text-ink">
              Friends of Tech<span className="text-[#C2E600]">.</span>
            </Link>
            <p className="text-sm text-body max-w-sm leading-relaxed">
              India’s premier annual convention for engineers, systems architects, and founders building high-scale technology. Presented by GenLab Pvt Ltd.
            </p>
            {/* Trust Badges */}
            <div className="pt-2 flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sunken border border-hairline text-[11px] font-mono text-muted">
                <IconShield size={12} className="text-[#10B981]" />
                <span>256-bit TLS Encryption</span>
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sunken border border-hairline text-[11px] font-mono text-muted">
                <IconShieldCheck size={12} className="text-[#D4AF37]" />
                <span>PCI-DSS Verified Razorpay</span>
              </span>
            </div>
          </div>

          {/* Event Quick Details */}
          <div className="space-y-3 text-sm font-medium">
            <span className="text-xs text-muted uppercase tracking-wider block font-semibold font-mono">
              Event Details
            </span>
            <div className="text-xs text-body font-mono">Saturday, October 24, 2026</div>
            <div className="text-xs text-body font-mono">08:30 AM - 06:00 PM IST</div>
            <div className="text-xs text-body">Auditorium 01, Tech Innovation Center</div>
            <div className="text-xs text-muted">100 Feet Rd, Koramangala 4th Block, Bengaluru</div>
          </div>

          {/* Direct Navigation */}
          <div className="space-y-3 text-sm font-medium">
            <span className="text-xs text-muted uppercase tracking-wider block font-semibold font-mono">
              Quick Links
            </span>
            <div>
              <Link to="/" className="text-body hover:text-ink transition-colors text-xs">
                Registration & Passes
              </Link>
            </div>
            <div>
              <Link to="/terms" className="text-body hover:text-ink transition-colors text-xs">
                Terms of Service
              </Link>
            </div>
            <div>
              <Link to="/privacy" className="text-body hover:text-ink transition-colors text-xs">
                Privacy Policy & Security
              </Link>
            </div>
          </div>

          {/* Enterprise & Security */}
          <div className="space-y-3 text-sm font-medium">
            <span className="text-xs text-muted uppercase tracking-wider block font-semibold font-mono">
              Admin & Display
            </span>
            <div>
              <Link to="/admin/login" className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-ink transition-colors font-mono">
                <IconLock size={12} />
                <span>Organiser Portal &rarr;</span>
              </Link>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="hairline-t pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-mono text-muted">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
            <span>Systems operational · Cryptographic tickets verified</span>
          </div>
          <div>
            &copy; 2026 GenLab Pvt Ltd. All rights reserved. Bengaluru, Karnataka, India.
          </div>
        </div>
      </div>
    </footer>
  );
};
