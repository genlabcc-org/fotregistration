import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import type { AttendeeInput, EventConfig } from '../types';
import { api } from '../lib/api';
import { StepIndicator } from '../components/register/StepIndicator';
import { Step1Attendees } from '../components/register/Step1Attendees';
import { Step3Review } from '../components/register/Step3Review';
import { StepPaymentRazorpay } from '../components/register/StepPaymentRazorpay';
import { OrderSummaryCard } from '../components/register/OrderSummaryCard';
import { PublicFooter } from '../components/public/PublicFooter';
import { AmbientGlow } from '../components/common/AmbientGlow';

const STEPS = [
  { step: 1, title: 'Attendees', description: 'Participant details' },
  { step: 2, title: 'Review', description: 'Verify participants' },
  { step: 3, title: 'Payment', description: 'Razorpay & instant pass' },
];

const DEFAULT_EVENT_CONFIG: EventConfig = {
  id: 1,
  name: 'Friends of Tech',
  tagline: 'Where builders meet.',
  description: 'A full day of hands-on building, keynote talks, team sprints, and honest conversations with India’s best tech community. Presented by GenLab Pvt Ltd.',
  banner_url: '',
  logo_url: '',
  genlab_logo_url: '',
  date_text: 'Saturday, October 24, 2026',
  time_text: '08:30 AM - 06:00 PM IST',
  venue_name: 'Auditorium 01, Tech Innovation Center',
  venue_address: '100 Feet Road, Koramangala 4th Block, Bengaluru, Karnataka 560034',
  price_per_person: 99,
  upi_id: 'genlab.fot@upi',
  upi_name: 'GenLab Pvt Ltd - Friends of Tech',
  gpay_qr_url: '',
  guidelines: [],
  schedule: [],
  prizes: [],
  faq: [],
  contact: [],
  google_sheet_url: '',
  google_sheet_status: 'Unconfigured',
};

export const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const [config, setConfig] = useState<EventConfig>(DEFAULT_EVENT_CONFIG);

  const [currentStep, setCurrentStep] = useState<number>(1);
  const [attendees, setAttendees] = useState<AttendeeInput[]>([
    {
      id: 'att-1',
      name: '',
      email: '',
      phone: '',
      category: 'SOLO',
    },
  ]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentStep]);

  useEffect(() => {
    // Non-blocking background fetch - updates UI dynamically without blocking first render
    api.getEventConfig()
      .then((data) => {
        if (data && data.name) {
          setConfig(data);
        }
      })
      .catch((err) => {
        console.warn('Could not fetch remote event config, using cached defaults:', err);
      });
  }, []);

  const activeConfig = config;

  const handlePaymentSuccess = (registrationId: string, email: string) => {
    navigate(`/register/success?ref=${registrationId}&email=${encodeURIComponent(email)}`);
  };

  const totalAmount = attendees.length * (activeConfig.price_per_person || 99);

  return (
    <div className="min-h-screen bg-canvas text-ink flex flex-col justify-between transition-colors relative">
      <AmbientGlow />
      {/* Top Header Bar */}
      <header className="sticky top-0 z-30 bg-surface/90 backdrop-blur-md border-b border-hairline transition-colors">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link
            to="/"
            className="flex items-center gap-3 group"
          >
            <span className="font-display font-bold text-2xl tracking-tight text-ink">
              FOT<span className="text-[#C2E600]">.</span>
            </span>
            <span className="hidden sm:inline-block text-xs text-muted font-medium border-l border-hairline pl-3">
              Presented by GenLab
            </span>
          </Link>

          <div className="flex items-center gap-3">
            <div className="hidden sm:inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface border border-hairline text-xs font-mono font-medium text-body shadow-xs">
              <span className="w-2 h-2 rounded-full bg-[#C2E600] animate-pulse" />
              <span>{activeConfig.date_text}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Registration Layout */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-16 w-full flex-1">
        {/* Progress Stepper */}
        <div className="mb-10 sm:mb-14">
          <StepIndicator
            steps={STEPS}
            currentStep={currentStep}
            onStepClick={(step) => {
              if (step < currentStep) {
                setCurrentStep(step);
              }
            }}
          />
        </div>

        {/* 2-Column Grid: Form (7 cols) + Summary (5 cols) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-start pb-20 lg:pb-0">
          <div className="lg:col-span-7">
            {currentStep === 1 && (
              <Step1Attendees
                attendees={attendees}
                pricePerPerson={activeConfig.price_per_person || 99}
                onUpdateAttendees={setAttendees}
                onNext={() => setCurrentStep(2)}
              />
            )}

            {currentStep === 2 && (
              <Step3Review
                attendees={attendees}
                totalAmount={totalAmount}
                onProceed={() => setCurrentStep(3)}
                onBack={() => setCurrentStep(1)}
              />
            )}

            {currentStep === 3 && (
              <StepPaymentRazorpay
                attendees={attendees}
                totalAmount={totalAmount}
                config={activeConfig}
                onSuccess={handlePaymentSuccess}
                onBack={() => setCurrentStep(2)}
              />
            )}
          </div>

          <div className="lg:col-span-5">
            <OrderSummaryCard
              attendees={attendees}
              config={activeConfig}
              step={currentStep}
            />
          </div>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
};
