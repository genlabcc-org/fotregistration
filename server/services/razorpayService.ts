import Razorpay from 'razorpay';
import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

export interface RazorpayCreateOrderOptions {
  amount?: number; // amount in paise
  amountInPaise?: number; // amount in paise
  amountInRupees?: number; // amount in rupees
  currency?: string;
  receipt: string;
  notes?: Record<string, string>;
}

export interface RazorpayOrderResult {
  id: string;
  order_id: string;
  amount: number; // in paise
  currency: string;
  receipt?: string;
}

export class RazorpayService {
  private static instance: Razorpay | null = null;
  private static cachedKeyId: string = '';
  private static cachedKeySecret: string = '';

  static getKeyId(): string {
    dotenv.config();
    return (process.env.RAZORPAY_KEY_ID || process.env.VITE_RAZORPAY_KEY_ID || '').trim();
  }

  static getKeySecret(): string {
    dotenv.config();
    return (process.env.RAZORPAY_KEY_SECRET || '').trim();
  }

  static isConfigured(): boolean {
    const key = this.getKeyId();
    const secret = this.getKeySecret();
    return !!(key && secret);
  }

  static getClient(): Razorpay {
    const key_id = this.getKeyId();
    const key_secret = this.getKeySecret();
    if (!key_id || !key_secret) {
      const error: any = new Error('Razorpay is not configured. Please set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in your environment variables (Render Dashboard or .env)');
      error.statusCode = 401;
      throw error;
    }

    if (!this.instance || this.cachedKeyId !== key_id || this.cachedKeySecret !== key_secret) {
      this.instance = new Razorpay({
        key_id,
        key_secret,
      });
      this.cachedKeyId = key_id;
      this.cachedKeySecret = key_secret;
    }
    return this.instance;
  }

  static async createOrder(options: RazorpayCreateOrderOptions): Promise<RazorpayOrderResult> {
    const key_id = this.getKeyId();
    const key_secret = this.getKeySecret();

    if (!key_id || !key_secret) {
      const error: any = new Error('Razorpay API credentials missing. Please set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in your environment variables (Render Dashboard or .env)');
      error.statusCode = 401;
      throw error;
    }

    // Determine amount in paise
    let amountInPaise: number;
    if (typeof options.amountInPaise === 'number') {
      amountInPaise = Math.round(options.amountInPaise);
    } else if (typeof options.amount === 'number') {
      amountInPaise = Math.round(options.amount);
    } else if (typeof options.amountInRupees === 'number') {
      amountInPaise = Math.round(options.amountInRupees * 100);
    } else {
      const error: any = new Error('Order amount is required.');
      error.statusCode = 400;
      throw error;
    }

    // Minimum amount: 100 paise (1 INR)
    if (amountInPaise < 100) {
      const error: any = new Error('Minimum order amount is 100 paise (₹1.00).');
      error.statusCode = 400;
      throw error;
    }

    try {
      const client = this.getClient();
      const order = await client.orders.create({
        amount: amountInPaise,
        currency: options.currency || 'INR',
        receipt: options.receipt ? String(options.receipt).slice(0, 40) : `rcpt_${Date.now()}`,
        notes: options.notes,
      });

      return {
        id: order.id,
        order_id: order.id,
        amount: Number(order.amount),
        currency: order.currency,
        receipt: order.receipt || options.receipt,
      };
    } catch (err: any) {
      console.error('[RAZORPAY API ERROR]', err);
      // Check for auth failure from Razorpay API
      const status = err?.statusCode || (err?.error?.code === 'BAD_REQUEST_ERROR' && err?.error?.description?.includes('authentication') ? 401 : 500);
      const message = err?.error?.description || err?.message || 'Razorpay order creation failed.';
      const error: any = new Error(message);
      error.statusCode = status;
      throw error;
    }
  }

  static verifySignature(params: {
    orderId: string;
    paymentId: string;
    signature: string;
  }): boolean {
    const key_secret = this.getKeySecret();
    if (!key_secret) {
      return false;
    }

    if (!params.orderId || !params.paymentId || !params.signature) {
      return false;
    }

    const text = `${params.orderId}|${params.paymentId}`;
    const expectedSignature = crypto
      .createHmac('sha256', key_secret)
      .update(text)
      .digest('hex');

    // Constant-time string comparison to prevent timing attacks
    if (expectedSignature.length !== params.signature.length) {
      return false;
    }
    return crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(params.signature));
  }

  static verifyWebhookSignature(body: string, signature: string, secret?: string): boolean {
    const webhookSecret = secret || process.env.RAZORPAY_WEBHOOK_SECRET || this.getKeySecret();
    if (!webhookSecret || !signature) return false;

    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(body)
      .digest('hex');
    
    if (expectedSignature.length !== signature.length) {
      return false;
    }
    return crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(signature));
  }
}
