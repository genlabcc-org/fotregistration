import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { IconArrowRight } from '../../lib/icons';

export const PublicNavbar: React.FC = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      setIsScrolled(currentScrollY > 30);

      // Hide on scroll down, show on scroll up
      if (currentScrollY > lastScrollY && currentScrollY > 120) {
        setIsVisible(false);
      } else {
        setIsVisible(true);
      }
      setLastScrollY(currentScrollY);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [lastScrollY]);

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <header
      className={`fixed top-0 left-0 w-full z-40 transition-transform duration-300 py-4 px-4 sm:px-6 flex justify-center ${
        isVisible ? 'translate-y-0' : '-translate-y-full'
      }`}
    >
      <div
        className={`w-full max-w-6xl mx-auto rounded-full px-5 py-3 flex items-center justify-between transition-all duration-300 ${
          isScrolled
            ? 'bg-surface/95 backdrop-blur-md border border-hairline shadow-luxury'
            : 'bg-surface/80 backdrop-blur-sm border border-hairline/80 shadow-xs'
        }`}
      >
        {/* Brand Logo & Presenter */}
        <Link to="/" className="flex items-center gap-3 group">
          <span className="font-display text-2xl font-bold tracking-tight text-ink">
            FOT<span className="text-[#C2E600]">.</span>
          </span>
          <span className="text-xs text-muted font-medium pl-3 border-l border-hairline hidden sm:inline-block">
            Presented by GenLab
          </span>
        </Link>

        {/* Section Navigation Links */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-[#55554F]">
          <button
            onClick={() => scrollToSection('about')}
            className="hover:text-[#0A0A0A] transition-colors cursor-pointer"
          >
            About
          </button>
          <button
            onClick={() => scrollToSection('schedule')}
            className="hover:text-[#0A0A0A] transition-colors cursor-pointer"
          >
            Schedule
          </button>
          <button
            onClick={() => scrollToSection('prizes')}
            className="hover:text-[#0A0A0A] transition-colors cursor-pointer"
          >
            Prizes
          </button>
          <button
            onClick={() => scrollToSection('guidelines')}
            className="hover:text-[#0A0A0A] transition-colors cursor-pointer"
          >
            Guidelines
          </button>
          <button
            onClick={() => scrollToSection('faq')}
            className="hover:text-[#0A0A0A] transition-colors cursor-pointer"
          >
            FAQ
          </button>
        </nav>

        {/* CTA Button */}
        <div className="flex items-center gap-3">
          <Link
            to="/register"
            data-cursor="Register"
            className="h-10 px-5 rounded-xl bg-ink text-canvas text-xs font-semibold inline-flex items-center gap-2 hover:opacity-90 transition-all group shadow-sm btn-luxury-glow"
          >
            <span>Register</span>
            <span className="w-5 h-5 rounded-full bg-[#C2E600] text-[#0A0A0A] flex items-center justify-center transition-transform group-hover:translate-x-0.5">
              <IconArrowRight size={12} />
            </span>
          </Link>
        </div>
      </div>
    </header>
  );
};
