import { Router, Request, Response } from 'express';
import { db } from '../db/database';
import { RazorpayService } from '../services/razorpayService';
import { confirmRegistrationAndIssuePasses } from '../services/ticketService';
import { syncRegistrationToSupabase } from '../db/supabase';
import {
  createRateLimiter,
  honeypotGuard,
  validatePersonName,
  validateAndNormalizeEmail,
  validateIndianPhone,
} from '../middleware/security';

const router = Router();

// Rate limiters for payment & registration endpoints
const checkAttendeesRateLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  maxRequests: 30,
  keyPrefix: 'rl_check',
  message: 'Too many attendee verification checks. Please wait a few minutes.',
});

const orderRateLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  maxRequests: 20,
  keyPrefix: 'rl_order',
  message: 'Too many order requests. Please wait a few minutes before trying again.',
});

const verifyRateLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  maxRequests: 30,
  keyPrefix: 'rl_verify',
  message: 'Too many verification attempts. Please try again later.',
});

interface AttendeePayload {
  name: string;
  email: string;
  phone: string;
  category: 'SOLO' | 'TEAM';
  team_name?: string;
  team_id?: string;
}

// GET /api/payment/config
router.get('/config', (_req: Request, res: Response): void => {
  res.json({
    keyId: RazorpayService.getKeyId(),
    isConfigured: RazorpayService.isConfigured(),
  });
});

// POST /api/payment/check-attendees (Pre-validation check for already registered attendees)
router.post(
  '/check-attendees',
  checkAttendeesRateLimiter,
  honeypotGuard,
  (req: Request, res: Response): void => {
    try {
      const { attendees: rawAttendees } = req.body;
      let attendees: AttendeePayload[] = [];
      if (typeof rawAttendees === 'string') {
        try {
          attendees = JSON.parse(rawAttendees);
        } catch {
          res.status(400).json({ valid: false, error: 'Invalid payload format.' });
          return;
        }
      } else if (Array.isArray(rawAttendees)) {
        attendees = rawAttendees;
      }

      if (!attendees || attendees.length === 0) {
        res.json({ valid: true });
        return;
      }

      if (attendees.length > 20) {
        res.status(400).json({ valid: false, error: 'Maximum 20 attendees allowed per registration.' });
        return;
      }

      const seenEmails = new Set<string>();
      const seenPhones = new Set<string>();

      for (let i = 0; i < attendees.length; i++) {
        const att = attendees[i];
        const personLabel = i === 0 ? 'Person 1 (Payer)' : `Person ${i + 1}`;

        if (!att.name || !att.email || !att.phone) continue;

        // Strict input validation
        const nameVal = validatePersonName(att.name);
        if (!nameVal.valid) {
          res.status(400).json({ valid: false, error: `${personLabel}: ${nameVal.error}` });
          return;
        }

        const emailVal = validateAndNormalizeEmail(att.email);
        if (!emailVal.valid) {
          res.status(400).json({ valid: false, error: `${personLabel}: ${emailVal.error}` });
          return;
        }

        const phoneVal = validateIndianPhone(att.phone);
        if (!phoneVal.valid) {
          res.status(400).json({ valid: false, error: `${personLabel}: ${phoneVal.error}` });
          return;
        }

        const cleanEmail = emailVal.email;
        const cleanPhone = phoneVal.phone;

        if (seenEmails.has(cleanEmail)) {
          res.status(400).json({
            valid: false,
            error: `Duplicate email address "${att.email}" entered in your attendee list. Each participant must have a distinct email address.`,
          });
          return;
        }
        seenEmails.add(cleanEmail);

        if (seenPhones.has(cleanPhone)) {
          res.status(400).json({
            valid: false,
            error: `Duplicate mobile number "${att.phone}" entered in your attendee list. Each participant must have a distinct mobile number.`,
          });
          return;
        }
        seenPhones.add(cleanPhone);

        // Check DB for existing confirmed pass by email
        const existingConfirmedEmail = db.prepare(`
          SELECT a.name, a.email, a.ticket_code
          FROM attendees a
          JOIN registrations r ON a.registration_id = r.id
          WHERE LOWER(a.email) = ? AND (a.status = 'confirmed' OR r.status = 'confirmed')
          LIMIT 1
        `).get(cleanEmail) as { name: string; email: string; ticket_code: string } | undefined;

        if (existingConfirmedEmail) {
          res.status(409).json({
            valid: false,
            error: `"${att.email}" is already registered for Friends of Tech (Pass Code: ${existingConfirmedEmail.ticket_code || 'Issued'}). Each attendee can only register once.`,
          });
          return;
        }

        // Check DB for existing confirmed pass by exact phone
        const existingConfirmedPhone = db.prepare(`
          SELECT a.name, a.email, a.phone, a.ticket_code
          FROM attendees a
          JOIN registrations r ON a.registration_id = r.id
          WHERE a.phone = ? OR a.phone = ? OR a.phone = ?
            AND (a.status = 'confirmed' OR r.status = 'confirmed')
          LIMIT 1
        `).get(cleanPhone, `+91${cleanPhone}`, `+91 ${cleanPhone}`) as { name: string; email: string; ticket_code: string } | undefined;

        if (existingConfirmedPhone) {
          res.status(409).json({
            valid: false,
            error: `Mobile number "+91 ${cleanPhone}" is already registered under ${existingConfirmedPhone.name} (${existingConfirmedPhone.email}). Each attendee can only register once.`,
          });
          return;
        }
      }

      res.json({ valid: true });
    } catch (err: unknown) {
      console.error('[CHECK ATTENDEES ERROR]', err);
      res.status(500).json({ valid: false, error: 'Failed to verify attendee availability. Please try again.' });
    }
  }
);

/**
 * Handle Order Creation
 * Supports both:
 * 1. Standard Razorpay Request: { amount (in paise), currency, receipt }
 * 2. Event Registration Request: { payerName, payerEmail, payerPhone, attendees, [amount] }
 */
async function handleCreateOrder(req: Request, res: Response): Promise<void> {
  try {
    const {
      amount,
      amountInPaise,
      currency = 'INR',
      receipt,
      payerName,
      payerEmail,
      payerPhone,
      attendees: rawAttendees,
    } = req.body;

    // Case 1: Standalone Razorpay Order creation (standard API request)
    if ((amount !== undefined || amountInPaise !== undefined) && !rawAttendees) {
      const requestedPaise = Number(amount !== undefined ? amount : amountInPaise);

      if (isNaN(requestedPaise) || requestedPaise < 100) {
        res.status(400).json({
          error: 'Amount must be at least 100 paise (₹1.00).',
        });
        return;
      }

      const orderReceipt = receipt ? String(receipt).slice(0, 40) : `rcpt_${Date.now()}`;
      const order = await RazorpayService.createOrder({
        amountInPaise: requestedPaise,
        currency: currency || 'INR',
        receipt: orderReceipt,
      });

      res.status(200).json({
        success: true,
        order_id: order.id,
        orderId: order.id,
        id: order.id,
        amount: order.amount,
        currency: order.currency,
        receipt: order.receipt,
        key_id: RazorpayService.getKeyId(),
        keyId: RazorpayService.getKeyId(),
      });
      return;
    }

    // Case 2: Event Registration with Attendees
    if (!payerName || !payerEmail || !payerPhone) {
      res.status(400).json({ error: 'Please provide primary contact name, email, and phone.' });
      return;
    }

    // Strict Payer Validation
    const payerNameVal = validatePersonName(payerName);
    if (!payerNameVal.valid) {
      res.status(400).json({ error: `Primary contact name: ${payerNameVal.error}` });
      return;
    }
    const cleanPayerName = payerNameVal.name;

    const payerEmailVal = validateAndNormalizeEmail(payerEmail);
    if (!payerEmailVal.valid) {
      res.status(400).json({ error: `Primary contact email: ${payerEmailVal.error}` });
      return;
    }
    const cleanPayerEmail = payerEmailVal.email;

    const payerPhoneVal = validateIndianPhone(payerPhone);
    if (!payerPhoneVal.valid) {
      res.status(400).json({ error: `Primary contact phone: ${payerPhoneVal.error}` });
      return;
    }
    const cleanPayerPhone = payerPhoneVal.phone;

    let parsedAttendees: AttendeePayload[] = [];
    if (typeof rawAttendees === 'string') {
      try {
        parsedAttendees = JSON.parse(rawAttendees);
      } catch {
        res.status(400).json({ error: 'Invalid attendees payload format.' });
        return;
      }
    } else if (Array.isArray(rawAttendees)) {
      parsedAttendees = rawAttendees;
    }

    if (!parsedAttendees || parsedAttendees.length === 0) {
      res.status(400).json({ error: 'At least one attendee is required.' });
      return;
    }

    if (parsedAttendees.length > 20) {
      res.status(400).json({ error: 'Maximum 20 attendees allowed per registration.' });
      return;
    }

    // Validate each attendee & check duplicate emails or phones
    const seenEmails = new Set<string>();
    const seenPhones = new Set<string>();
    const sanitizedAttendees: AttendeePayload[] = [];

    for (let i = 0; i < parsedAttendees.length; i++) {
      const att = parsedAttendees[i];
      const personLabel = i === 0 ? 'Person 1 (Payer)' : `Person ${i + 1}`;

      const nameVal = validatePersonName(att.name);
      if (!nameVal.valid) {
        res.status(400).json({ error: `${personLabel}: ${nameVal.error}` });
        return;
      }

      const emailVal = validateAndNormalizeEmail(att.email);
      if (!emailVal.valid) {
        res.status(400).json({ error: `${personLabel}: ${emailVal.error}` });
        return;
      }

      const phoneVal = validateIndianPhone(att.phone);
      if (!phoneVal.valid) {
        res.status(400).json({ error: `${personLabel}: ${phoneVal.error}` });
        return;
      }

      const cleanEmail = emailVal.email;
      const cleanPhone = phoneVal.phone;

      if (seenEmails.has(cleanEmail)) {
        res.status(400).json({
          error: `Duplicate email address "${att.email}" detected. Each attendee must have a distinct email address.`,
        });
        return;
      }
      seenEmails.add(cleanEmail);

      if (seenPhones.has(cleanPhone)) {
        res.status(400).json({
          error: `Duplicate phone number "${att.phone}" detected. Each attendee must have a distinct mobile number.`,
        });
        return;
      }
      seenPhones.add(cleanPhone);

      sanitizedAttendees.push({
        name: nameVal.name,
        email: cleanEmail,
        phone: cleanPhone,
        category: att.category === 'TEAM' ? 'TEAM' : 'SOLO',
        team_name: att.team_name ? String(att.team_name).slice(0, 100).trim() : undefined,
        team_id: att.team_id ? String(att.team_id).slice(0, 60).trim() : undefined,
      });
    }

    // Check if any attendee email or phone is ALREADY registered with a confirmed pass in the database
    for (const att of sanitizedAttendees) {
      const existingConfirmedEmail = db.prepare(`
        SELECT a.name, a.email, a.ticket_code
        FROM attendees a
        JOIN registrations r ON a.registration_id = r.id
        WHERE LOWER(a.email) = ? AND (a.status = 'confirmed' OR r.status = 'confirmed')
        LIMIT 1
      `).get(att.email) as { name: string; email: string; ticket_code: string } | undefined;

      if (existingConfirmedEmail) {
        res.status(409).json({
          error: `"${att.email}" is already registered for Friends of Tech (Ticket Pass: ${existingConfirmedEmail.ticket_code || 'Issued'}). Each attendee can only register once.`,
        });
        return;
      }

      const existingConfirmedPhone = db.prepare(`
        SELECT a.name, a.email, a.phone, a.ticket_code
        FROM attendees a
        JOIN registrations r ON a.registration_id = r.id
        WHERE (a.phone = ? OR a.phone = ? OR a.phone = ?) AND (a.status = 'confirmed' OR r.status = 'confirmed')
        LIMIT 1
      `).get(att.phone, `+91${att.phone}`, `+91 ${att.phone}`) as { name: string; email: string; ticket_code: string } | undefined;

      if (existingConfirmedPhone) {
        res.status(409).json({
          error: `Phone number "+91 ${att.phone}" is already registered under ${existingConfirmedPhone.name} (${existingConfirmedPhone.email}). Each attendee can only register once.`,
        });
        return;
      }
    }

    // Clean up any stale uncompleted pending registrations for these attendees
    for (const att of sanitizedAttendees) {
      const pendingRegs = db.prepare(`
        SELECT DISTINCT r.id
        FROM registrations r
        JOIN attendees a ON a.registration_id = r.id
        WHERE LOWER(a.email) = ? AND r.status = 'pending'
      `).all(att.email) as { id: string }[];

      for (const pr of pendingRegs) {
        db.prepare('DELETE FROM attendees WHERE registration_id = ?').run(pr.id);
        db.prepare('DELETE FROM registrations WHERE id = ?').run(pr.id);
      }
    }

    // Event price calculation
    const eventConfig = db.prepare('SELECT price_per_person, name FROM event_config WHERE id = 1').get() as {
      price_per_person: number;
      name: string;
    } | undefined;
    const pricePerPerson = eventConfig ? eventConfig.price_per_person : 99;
    const totalAmount = sanitizedAttendees.length * pricePerPerson;
    const totalAmountInPaise = Math.round(totalAmount * 100);

    if (totalAmountInPaise < 100) {
      res.status(400).json({ error: 'Order amount must be at least 100 paise.' });
      return;
    }

    // Team pairing logic
    const teamAttendees = sanitizedAttendees.filter(a => a.category === 'TEAM');
    const soloAttendees = sanitizedAttendees.filter(a => a.category === 'SOLO');

    const pairedList: {
      payload: AttendeePayload;
      assignedCategory: 'SOLO' | 'TEAM';
      teamIdentifier: string | null;
    }[] = [];

    let teamCounter = 1;
    const teamIdMap = new Map<string, AttendeePayload[]>();
    const ungroupedTeam: AttendeePayload[] = [];

    for (const t of teamAttendees) {
      if (t.team_id) {
        const list = teamIdMap.get(t.team_id) || [];
        list.push(t);
        teamIdMap.set(t.team_id, list);
      } else {
        ungroupedTeam.push(t);
      }
    }

    // Process grouped teams
    for (const [, members] of teamIdMap.entries()) {
      for (let i = 0; i < members.length; i += 2) {
        if (i + 1 < members.length) {
          const customName = members[i].team_name?.trim() || members[i + 1].team_name?.trim();
          const teamName = customName || `Team ${String(teamCounter).padStart(2, '0')}`;
          pairedList.push({ payload: members[i], assignedCategory: 'TEAM', teamIdentifier: teamName });
          pairedList.push({ payload: members[i + 1], assignedCategory: 'TEAM', teamIdentifier: teamName });
          teamCounter++;
        } else {
          pairedList.push({ payload: members[i], assignedCategory: 'SOLO', teamIdentifier: null });
        }
      }
    }

    // Process ungrouped teams
    for (let i = 0; i < ungroupedTeam.length; i += 2) {
      if (i + 1 < ungroupedTeam.length) {
        const customName = ungroupedTeam[i].team_name?.trim() || ungroupedTeam[i + 1].team_name?.trim();
        const teamName = customName || `Team ${String(teamCounter).padStart(2, '0')}`;
        pairedList.push({ payload: ungroupedTeam[i], assignedCategory: 'TEAM', teamIdentifier: teamName });
        pairedList.push({ payload: ungroupedTeam[i + 1], assignedCategory: 'TEAM', teamIdentifier: teamName });
        teamCounter++;
      } else {
        pairedList.push({ payload: ungroupedTeam[i], assignedCategory: 'SOLO', teamIdentifier: null });
      }
    }

    for (const solo of soloAttendees) {
      pairedList.push({ payload: solo, assignedCategory: 'SOLO', teamIdentifier: null });
    }

    const regId = `REG-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    // Create Razorpay order via SDK
    const order = await RazorpayService.createOrder({
      amountInPaise: totalAmountInPaise,
      currency: currency || 'INR',
      receipt: regId,
      notes: {
        registrationId: regId,
        payerEmail: cleanPayerEmail,
        attendeeCount: String(sanitizedAttendees.length),
      },
    });

    const insertReg = db.prepare(`
      INSERT INTO registrations (
        id, payer_name, payer_email, payer_phone, total_amount, attendee_count, payment_screenshot_url,
        payment_method, razorpay_order_id, status
      ) VALUES (?, ?, ?, ?, ?, ?, '', 'razorpay', ?, 'pending')
    `);

    const insertAtt = db.prepare(`
      INSERT INTO attendees (
        id, registration_id, name, email, phone, requested_category, assigned_category, team_identifier, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `);

    const transaction = db.transaction(() => {
      insertReg.run(regId, cleanPayerName, cleanPayerEmail, cleanPayerPhone, totalAmount, sanitizedAttendees.length, order.id);

      for (let i = 0; i < pairedList.length; i++) {
        const item = pairedList[i];
        const attId = `ATT-${regId.replace('REG-', '')}-${i + 1}`;
        insertAtt.run(
          attId,
          regId,
          item.payload.name,
          item.payload.email,
          item.payload.phone,
          item.payload.category,
          item.assignedCategory,
          item.teamIdentifier
        );
      }
    });

    transaction();

    // Mirror to Supabase cloud in background
    const createdAttendees = db.prepare('SELECT * FROM attendees WHERE registration_id = ?').all(regId) as any[];
    syncRegistrationToSupabase(
      {
        id: regId,
        payer_name: cleanPayerName,
        payer_email: cleanPayerEmail,
        payer_phone: cleanPayerPhone,
        total_amount: totalAmount,
        attendee_count: sanitizedAttendees.length,
        payment_screenshot_url: '',
        status: 'pending',
      },
      createdAttendees
    ).catch(err => console.warn('[SUPABASE] Registration sync error:', err));

    res.status(200).json({
      success: true,
      order_id: order.id,
      orderId: order.id,
      id: order.id,
      amount: order.amount,
      currency: order.currency,
      receipt: order.receipt,
      key_id: RazorpayService.getKeyId(),
      keyId: RazorpayService.getKeyId(),
      registrationId: regId,
      totalAmount,
      attendeeCount: sanitizedAttendees.length,
    });
  } catch (err: any) {
    console.error('[RAZORPAY ORDER ERROR]', err);
    const statusCode = err?.statusCode || 500;
    res.status(statusCode).json({ error: err.message || 'Failed to create Razorpay order.' });
  }
}

/**
 * Handle Signature Verification
 * Algorithm: HMAC-SHA256(order_id + "|" + payment_id, KEY_SECRET)
 * Compare generated signature with razorpay_signature
 */
async function handleVerifyPayment(req: Request, res: Response): Promise<void> {
  try {
    const order_id = req.body.order_id || req.body.razorpay_order_id;
    const payment_id = req.body.payment_id || req.body.razorpay_payment_id;
    const signature = req.body.signature || req.body.razorpay_signature;
    const registrationId = req.body.registrationId;

    // Validate required fields
    if (!order_id || !payment_id || !signature) {
      res.status(400).json({
        success: false,
        error: 'Missing required payment verification fields (order_id, payment_id, signature).',
      });
      return;
    }

    // Verify HMAC-SHA256 signature
    const isValid = RazorpayService.verifySignature({
      orderId: order_id,
      paymentId: payment_id,
      signature: signature,
    });

    if (!isValid) {
      console.warn(`[RAZORPAY] Signature mismatch for order ${order_id} / payment ${payment_id}`);
      res.status(400).json({
        success: false,
        error: 'Payment verification failed: Signature mismatch. Payment not marked as paid.',
      });
      return;
    }

    // Locate matching registration in database
    let reg: { id: string; status: string; total_amount: number } | undefined;
    if (registrationId) {
      reg = db.prepare('SELECT * FROM registrations WHERE id = ?').get(registrationId) as any;
    } else if (order_id) {
      reg = db.prepare('SELECT * FROM registrations WHERE razorpay_order_id = ?').get(order_id) as any;
    }

    if (reg) {
      if (reg.status === 'confirmed') {
        res.status(200).json({
          success: true,
          alreadyConfirmed: true,
          order_id,
          payment_id,
          registrationId: reg.id,
          message: 'Payment verified and passes previously issued.',
        });
        return;
      }

      // Update payment details in DB
      db.prepare(`
        UPDATE registrations
        SET razorpay_order_id = ?, razorpay_payment_id = ?, razorpay_signature = ?
        WHERE id = ?
      `).run(order_id, payment_id, signature, reg.id);

      // Issue tickets & email passes
      const result = await confirmRegistrationAndIssuePasses(reg.id);

      res.status(200).json({
        success: true,
        order_id,
        payment_id,
        registrationId: reg.id,
        attendeesCount: result?.attendeesCount,
        message: 'Payment verified successfully! QR passes have been generated and emailed to all attendees.',
      });
      return;
    }

    // Standalone verification without registration record
    res.status(200).json({
      success: true,
      order_id,
      payment_id,
      message: 'Payment signature verified successfully.',
    });
  } catch (err: any) {
    console.error('[RAZORPAY VERIFY ERROR]', err);
    res.status(500).json({ success: false, error: err.message || 'Payment verification failed.' });
  }
}

// Order Creation Endpoints with Rate Limiting & Honeypot Guard
router.post('/create-order', orderRateLimiter, honeypotGuard, handleCreateOrder);

// Verification Endpoints with Rate Limiting
router.post('/verify', verifyRateLimiter, handleVerifyPayment);
router.post('/verify-payment', verifyRateLimiter, handleVerifyPayment);

// Webhook Fallback Endpoint
router.post('/webhook', async (req: Request, res: Response): Promise<void> => {
  try {
    const signature = req.headers['x-razorpay-signature'] as string;
    const rawBody = JSON.stringify(req.body);

    if (process.env.RAZORPAY_WEBHOOK_SECRET && signature) {
      const isValid = RazorpayService.verifyWebhookSignature(rawBody, signature);
      if (!isValid) {
        res.status(400).send('Invalid webhook signature');
        return;
      }
    }

    const event = req.body.event;
    if (event === 'order.paid' || event === 'payment.captured') {
      const payload = req.body.payload;
      const orderId = payload?.order?.entity?.id || payload?.payment?.entity?.order_id;
      const paymentId = payload?.payment?.entity?.id;

      if (orderId) {
        const reg = db.prepare('SELECT id, status FROM registrations WHERE razorpay_order_id = ?').get(orderId) as {
          id: string;
          status: string;
        } | undefined;

        if (reg && reg.status !== 'confirmed') {
          if (paymentId) {
            db.prepare('UPDATE registrations SET razorpay_payment_id = ? WHERE id = ?').run(paymentId, reg.id);
          }
          await confirmRegistrationAndIssuePasses(reg.id);
          console.log(`[RAZORPAY WEBHOOK] Registration ${reg.id} automatically confirmed via webhook.`);
        }
      }
    }

    res.json({ status: 'ok' });
  } catch (err) {
    console.error('[RAZORPAY WEBHOOK ERROR]', err);
    res.status(500).json({ error: 'Webhook processing error' });
  }
});

export default router;
