import React, { useState, useEffect } from 'react';
import type { AttendeeInput, EventConfig } from '../../types';
import { api } from '../../lib/api';
import { loadRazorpayScript } from '../../lib/razorpay';
import { IconShield, IconAlertCircle, IconArrowRight } from '../../lib/icons';

interface StepPaymentRazorpayProps {
  attendees: AttendeeInput[];
  totalAmount: number;
  config: EventConfig;
  onSuccess: (registrationId: string, email: string) => void;
  onBack: () => void;
}

export const StepPaymentRazorpay: React.FC<StepPaymentRazorpayProps> = ({
  attendees,
  totalAmount,
  config,
  onSuccess,
  onBack,
}) => {
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [razorpayConfig, setRazorpayConfig] = useState<{ keyId: string; isConfigured: boolean }>({
    keyId: '',
    isConfigured: false,
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const primaryAttendee = attendees[0] || { name: '', email: '', phone: '' };

  useEffect(() => {
    api.getPaymentConfig()
      .then((cfg) => {
        setRazorpayConfig(cfg);
        setLoadingConfig(false);
      })
      .catch((err) => {
        console.warn('Could not fetch payment config:', err);
        setLoadingConfig(false);
      });
  }, []);

  const handlePay = async () => {
    setError(null);
    setIsProcessing(true);

    try {
      // 1. Ensure Razorpay checkout script is loaded
      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded && razorpayConfig.isConfigured) {
        throw new Error('Unable to load Razorpay payment gateway. Please check your internet connection.');
      }

      // 2. Request backend to create Razorpay Order
      const order = await api.createRazorpayOrder({
        payerName: primaryAttendee.name.trim(),
        payerEmail: primaryAttendee.email.trim(),
        payerPhone: primaryAttendee.phone.trim(),
        attendees,
      });

      const orderId = order.order_id || order.orderId;
      if (!order.success || !orderId) {
        throw new Error('Failed to create payment order. Please try again.');
      }

      // 3. If keys are not configured or simulated in dev mode
      if (!razorpayConfig.isConfigured || orderId.startsWith('order_sim_')) {
        setIsVerifying(true);
        // Simulate successful payment verification for testing
        const verifyRes = await api.verifyRazorpayPayment({
          registrationId: order.registrationId || '',
          razorpay_order_id: orderId,
          razorpay_payment_id: `pay_sim_${Date.now()}`,
          razorpay_signature: 'simulated_signature',
        });

        if (verifyRes.success) {
          onSuccess(verifyRes.registrationId || order.registrationId || '', primaryAttendee.email.trim());
          return;
        } else {
          throw new Error(verifyRes.message || 'Payment simulation verification failed.');
        }
      }

      // 4. Launch Razorpay Standard Checkout
      const effectiveKeyId =
        order.key_id ||
        order.keyId ||
        razorpayConfig.keyId ||
        (import.meta.env.VITE_RAZORPAY_KEY_ID as string) ||
        '';
      if (!effectiveKeyId) {
        throw new Error('Razorpay Key ID is not configured.');
      }

      const options = {
        key: effectiveKeyId,
        amount: order.amount,
        currency: order.currency || 'INR',
        name: config.name || 'Friends of Tech 2026',
        description: `Pass for ${attendees.length} attendee${attendees.length > 1 ? 's' : ''}`,
        order_id: orderId,
        prefill: {
          name: primaryAttendee.name.trim(),
          email: primaryAttendee.email.trim(),
          contact: primaryAttendee.phone.trim(),
        },
        notes: {
          registrationId: order.registrationId || '',
          attendeeCount: String(attendees.length),
        },
        theme: {
          color: '#0A0A0A',
        },
        modal: {
          ondismiss: () => {
            setIsProcessing(false);
            setError('Payment cancelled by user. You can try again whenever you are ready.');
          },
          escape: true,
          backdropclose: false,
        },
        handler: async (response: {
          razorpay_payment_id: string;
          razorpay_order_id: string;
          razorpay_signature: string;
        }) => {
          setIsVerifying(true);
          try {
            // Instant server-side verification and automatic pass dispatch
            const verifyRes = await api.verifyRazorpayPayment({
              registrationId: order.registrationId || '',
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });

            if (verifyRes.success) {
              onSuccess(verifyRes.registrationId || order.registrationId || '', primaryAttendee.email.trim());
            } else {
              setError(verifyRes.message || 'Payment verification failed. Please contact support.');
              setIsVerifying(false);
              setIsProcessing(false);
            }
          } catch (verifyErr) {
            console.error('Payment verification error:', verifyErr);
            setError((verifyErr as Error).message || 'Failed to verify payment with server.');
            setIsVerifying(false);
            setIsProcessing(false);
          }
        },
      };

      const rzp = new window.Razorpay(options as any);
      rzp.on('payment.failed', (failResp: any) => {
        console.error('Payment failed:', failResp);
        setError(failResp?.error?.description || 'Payment was unsuccessful. Please try again.');
        setIsProcessing(false);
      });
      rzp.open();
    } catch (err: unknown) {
      console.error('Payment initiation error:', err);
      setError((err as Error).message || 'Unable to open payment modal. Please try again.');
      setIsProcessing(false);
      setIsVerifying(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="font-display text-3xl font-bold tracking-tight text-[#0A0A0A]">
          Complete Payment
        </h2>
        <p className="text-[#55554F] text-sm mt-1">
          Pay securely via Razorpay. Your payment is verified instantly and your pass is emailed automatically.
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-[#FFF5F5] border border-[#E53935]/30 text-[#E53935] text-sm flex items-center gap-3">
          <IconAlertCircle size={18} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Unconfigured Alert for developers/admins if keys are missing in .env */}
      {!loadingConfig && !razorpayConfig.isConfigured && (
        <div className="p-4 rounded-xl bg-[#FFFBEA] border border-[#F59E0B]/30 text-[#92400E] text-xs flex items-start gap-3">
          <IconAlertCircle size={18} className="shrink-0 mt-0.5 text-[#F59E0B]" />
          <div>
            <strong className="block font-semibold">Razorpay Test Simulation Active</strong>
            <span>
              Razorpay API keys (<code className="bg-[#FEF3C7] px-1 py-0.5 rounded font-mono">RAZORPAY_KEY_ID</code> and <code className="bg-[#FEF3C7] px-1 py-0.5 rounded font-mono">RAZORPAY_KEY_SECRET</code>) are not yet configured in <code className="font-mono">.env</code>. You can test the end-to-end payment verification and pass emailing flow immediately in simulated mode!
            </span>
          </div>
        </div>
      )}

      {/* Payment Box */}
      <div className="p-6 sm:p-8 rounded-2xl bg-[#FFFFFF] border border-[#E6E6DF] shadow-studio space-y-6">
        {/* Order Details Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#E6E6DF]">
          <div>
            <span className="text-xs uppercase font-mono tracking-wider text-[#8C8C85] font-bold block">
              Total Amount Payable
            </span>
            <div className="text-3xl sm:text-4xl font-mono font-bold text-[#0A0A0A] mt-1">
              ₹{totalAmount}
            </div>
            <div className="text-xs text-[#55554F] mt-1">
              For {attendees.length} participant{attendees.length > 1 ? 's' : ''} (₹{config.price_per_person || 99} each)
            </div>
          </div>

          <div className="sm:text-right">
            <span className="text-xs text-[#8C8C85] block font-medium">Billing Contact</span>
            <span className="text-sm font-bold text-[#0A0A0A] block mt-0.5">{primaryAttendee.name}</span>
            <span className="text-xs text-[#55554F] block">{primaryAttendee.email}</span>
            <span className="text-xs text-[#8C8C85] block">+91 {primaryAttendee.phone}</span>
          </div>
        </div>

        {/* What Happens Instantly */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#8C8C85] font-mono">
            Instant Automatic Verification
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-4 rounded-xl bg-[#FAFAF7] border border-[#E6E6DF] flex flex-col justify-between">
              <div className="w-7 h-7 rounded-full bg-[#C2E600] text-[#0A0A0A] flex items-center justify-center font-bold text-xs mb-2">
                1
              </div>
              <div>
                <strong className="text-xs font-bold text-[#0A0A0A] block">Instant Verification</strong>
                <span className="text-[11px] text-[#55554F] leading-tight">Payment verified in real time via Razorpay.</span>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-[#FAFAF7] border border-[#E6E6DF] flex flex-col justify-between">
              <div className="w-7 h-7 rounded-full bg-[#0A0A0A] text-[#FAFAF7] flex items-center justify-center font-bold text-xs mb-2">
                2
              </div>
              <div>
                <strong className="text-xs font-bold text-[#0A0A0A] block">Auto Pass Generation</strong>
                <span className="text-[11px] text-[#55554F] leading-tight">Cryptographic ticket QR & digital badges issued.</span>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-[#FAFAF7] border border-[#E6E6DF] flex flex-col justify-between">
              <div className="w-7 h-7 rounded-full bg-[#C2E600] text-[#0A0A0A] flex items-center justify-center font-bold text-xs mb-2">
                3
              </div>
              <div>
                <strong className="text-xs font-bold text-[#0A0A0A] block">Pass Emailed Directly</strong>
                <span className="text-[11px] text-[#55554F] leading-tight">Delivered immediately to each attendee inbox.</span>
              </div>
            </div>
          </div>
        </div>

        {/* Supported Payment Channels */}
        <div className="pt-4 border-t border-[#E6E6DF] space-y-3">
          <span className="text-xs font-bold text-[#8C8C85] uppercase tracking-wider font-mono block">
            Accepted Payment Methods
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="p-3 rounded-xl bg-[#FAFAF7] border border-[#E6E6DF] text-center font-medium text-[#0A0A0A]">
              <div className="text-[13px] font-bold">UPI / QR</div>
              <div className="text-[10px] text-[#8C8C85] mt-0.5">GPay, PhonePe, Paytm</div>
            </div>
            <div className="p-3 rounded-xl bg-[#FAFAF7] border border-[#E6E6DF] text-center font-medium text-[#0A0A0A]">
              <div className="text-[13px] font-bold">Debit & Credit</div>
              <div className="text-[10px] text-[#8C8C85] mt-0.5">Visa, Master, RuPay</div>
            </div>
            <div className="p-3 rounded-xl bg-[#FAFAF7] border border-[#E6E6DF] text-center font-medium text-[#0A0A0A]">
              <div className="text-[13px] font-bold">Net Banking</div>
              <div className="text-[10px] text-[#8C8C85] mt-0.5">50+ Indian Banks</div>
            </div>
            <div className="p-3 rounded-xl bg-[#FAFAF7] border border-[#E6E6DF] text-center font-medium text-[#0A0A0A]">
              <div className="text-[13px] font-bold">Wallets</div>
              <div className="text-[10px] text-[#8C8C85] mt-0.5">Mobikwik, Freecharge</div>
            </div>
          </div>
        </div>

        {/* Gateway Security Footnote */}
        <div className="pt-4 border-t border-[#E6E6DF] flex items-center justify-between text-xs text-[#8C8C85]">
          <div className="flex items-center gap-2">
            <IconShield size={16} className="text-[#0A0A0A]" />
            <span>256-bit SSL Bank-Grade Encryption</span>
          </div>
          <span className="font-mono text-[11px] text-[#0A0A0A] font-bold">
            Secured by Razorpay
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="pt-2 flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={onBack}
          disabled={isProcessing || isVerifying}
          className="h-12 px-6 rounded-xl bg-[#FFFFFF] border border-[#E6E6DF] hover:bg-[#F2F2EC] text-sm font-semibold text-[#0A0A0A] shadow-sm transition-colors cursor-pointer disabled:opacity-50"
        >
          &larr; Back to Review
        </button>

        <button
          type="button"
          onClick={handlePay}
          disabled={isProcessing || isVerifying}
          className="h-12 px-8 bg-[#0A0A0A] hover:bg-[#222222] text-[#FAFAF7] text-sm font-semibold rounded-xl inline-flex items-center gap-2.5 shadow-md transition-all hover:scale-105 group cursor-pointer disabled:opacity-75 disabled:hover:scale-100"
        >
          {isVerifying ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Verifying & emailing passes...</span>
            </>
          ) : isProcessing ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Opening Razorpay Checkout...</span>
            </>
          ) : (
            <>
              <span>Pay ₹{totalAmount} with Razorpay</span>
              <span className="w-5 h-5 rounded-full bg-[#C2E600] text-[#0A0A0A] flex items-center justify-center transition-transform group-hover:translate-x-0.5">
                <IconArrowRight size={12} />
              </span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
