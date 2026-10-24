import React, { useState } from 'react';
import type { AttendeeInput } from '../../types';
import { computePairing } from '../../lib/teamPairing';
import { IconUser, IconUsers, IconAlertCircle, IconArrowRight, IconShield } from '../../lib/icons';

interface Step3ReviewProps {
  attendees: AttendeeInput[];
  totalAmount: number;
  onProceed: () => void;
  onBack: () => void;
}

export const Step3Review: React.FC<Step3ReviewProps> = ({
  attendees,
  totalAmount,
  onProceed,
  onBack,
}) => {
  const [error, setError] = useState<string | null>(null);

  const pairingResult = computePairing(attendees);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    onProceed();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="font-display text-3xl font-bold tracking-tight text-[#0A0A0A]">
          Review your registration
        </h2>
        <p className="text-[#55554F] text-sm mt-1">
          Please verify your participant details before proceeding to payment. Individual passes will be emailed immediately after payment.
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-[#FFF5F5] border border-[#E53935]/30 text-[#E53935] text-sm flex items-center gap-3">
          <IconAlertCircle size={18} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Booking Overview Card */}
      <div className="p-6 sm:p-8 rounded-2xl bg-[#FFFFFF] border border-[#E6E6DF] shadow-studio space-y-8">
        {/* Attendees Section */}
        <div>
          <div className="flex items-center justify-between pb-3 border-b border-[#E6E6DF] mb-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#8C8C85] font-mono">
              Attendees ({attendees.length})
            </h3>
            <span className="text-xs text-[#0A0A0A] font-bold font-mono bg-[#F2F2EC] px-3 py-1 rounded-full">
              {pairingResult.summaryText}
            </span>
          </div>

          {/* Teams Grouping */}
          {pairingResult.teams.length > 0 && (
            <div className="space-y-3 mb-4">
              {pairingResult.teams.map((team) => (
                <div key={team.teamNumber} className="p-5 rounded-xl bg-[#FAFAF7] border border-[#E6E6DF]">
                  <div className="flex items-center justify-between text-xs font-bold text-[#0A0A0A] mb-3">
                    <div className="flex items-center gap-2">
                      <IconUsers size={15} />
                      <span>{team.teamName ? `${team.teamName} · 2 People` : `${team.teamIdentifier} · 2 People`}</span>
                    </div>
                    <span className="text-[11px] font-mono font-bold text-[#0A0A0A] bg-[#FFFFFF] border border-[#E6E6DF] px-2.5 py-0.5 rounded-full">
                      Team Pass
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    {team.members.map((m, idx) => (
                      <div key={m.id} className="space-y-0.5 p-3 rounded-lg bg-[#FFFFFF] border border-[#E6E6DF]">
                        <div className="text-[10px] uppercase font-mono font-bold text-[#8C8C85]">
                          {idx === 0 ? 'Person 1 (Primary / Lead)' : 'Person 2'}
                        </div>
                        <div className="text-[#0A0A0A] font-bold">{m.name}</div>
                        <div className="text-[#55554F]">{m.email} · +91 {m.phone}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Solos Grouping */}
          {pairingResult.solos.length > 0 && (
            <div className="space-y-3">
              <div className="text-xs font-bold text-[#8C8C85] flex items-center gap-1.5 font-mono uppercase">
                <IconUser size={13} />
                <span>Solo Attendees</span>
              </div>
              <div className="space-y-2">
                {pairingResult.solos.map((s) => (
                  <div key={s.id} className="p-4 rounded-xl bg-[#FAFAF7] border border-[#E6E6DF] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                    <div>
                      <span className="text-[#0A0A0A] font-bold">{s.name}</span>
                      <span className="text-[#55554F] ml-2">{s.email} · +91 {s.phone}</span>
                    </div>
                    <span className="text-[11px] font-mono font-bold text-[#8C8C85] bg-[#FFFFFF] border border-[#E6E6DF] px-2.5 py-0.5 rounded-full self-start sm:self-auto">
                      Solo
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Amount Summary */}
        <div className="pt-6 border-t border-[#E6E6DF]">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#8C8C85] font-mono mb-4">
            Order breakdown
          </h3>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-xl bg-[#FAFAF7] border border-[#E6E6DF]">
            <div>
              <div className="text-xs text-[#8C8C85]">Total to be paid</div>
              <div className="text-3xl font-bold font-mono text-[#0A0A0A] mt-0.5">₹{totalAmount}</div>
              <div className="text-xs text-[#55554F] mt-1">
                ₹{Math.round(totalAmount / attendees.length)} &times; {attendees.length} attendee{attendees.length > 1 ? 's' : ''}
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-[#55554F] bg-[#FFFFFF] px-3.5 py-2.5 rounded-xl border border-[#E6E6DF]">
              <IconShield size={16} className="text-[#0A0A0A] shrink-0" />
              <span>Instant Razorpay Payment & Automatic Pass Delivery</span>
            </div>
          </div>
        </div>


      </div>

      {/* Actions */}
      <div className="pt-4 flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={onBack}
          className="h-12 px-6 rounded-xl bg-[#FFFFFF] border border-[#E6E6DF] hover:bg-[#F2F2EC] text-sm font-semibold text-[#0A0A0A] shadow-sm transition-colors cursor-pointer"
        >
          &larr; Back to Attendees
        </button>
        <button
          type="submit"
          className="h-12 px-8 bg-[#0A0A0A] hover:bg-[#222222] text-[#FAFAF7] text-sm font-semibold rounded-xl inline-flex items-center gap-2.5 shadow-md transition-all hover:scale-105 group cursor-pointer"
        >
          <span>Proceed to Payment</span>
          <span className="w-5 h-5 rounded-full bg-[#C2E600] text-[#0A0A0A] flex items-center justify-center transition-transform group-hover:translate-x-0.5">
            <IconArrowRight size={12} />
          </span>
        </button>
      </div>
    </form>
  );
};
