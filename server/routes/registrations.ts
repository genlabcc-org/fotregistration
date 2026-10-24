import { Router, Request, Response } from 'express';
import { db } from '../db/database';
import { requireAdmin } from '../middleware/auth';
import { upload } from '../middleware/uploader';
import { TokenService } from '../services/tokenService';
import { CardGenerator } from '../services/cardGenerator';
import { EmailService } from '../services/emailService';
import { syncRegistrationToSupabase, supabase } from '../db/supabase';
import { confirmRegistrationAndIssuePasses } from '../services/ticketService';

const router = Router();

interface AttendeePayload {
  name: string;
  email: string;
  phone: string;
  category: 'SOLO' | 'TEAM';
  team_name?: string;
  team_id?: string;
}

// Rate limiter for public registration submissions (prevents spam and storage exhaustion)
const regAttempts = new Map<string, { count: number; firstAttempt: number }>();
const REG_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_REG_PER_WINDOW = 10;

setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of regAttempts.entries()) {
    if (now - record.firstAttempt > REG_LIMIT_WINDOW_MS) {
      regAttempts.delete(ip);
    }
  }
}, 15 * 60 * 1000).unref();

// POST /api/register (Public Registration Submission)
router.post('/', upload.single('screenshot'), (req: Request, res: Response): void => {
  try {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const regRecord = regAttempts.get(ip);
    const now = Date.now();

    if (regRecord) {
      if (now - regRecord.firstAttempt < REG_LIMIT_WINDOW_MS) {
        if (regRecord.count >= MAX_REG_PER_WINDOW) {
          res.status(429).json({ error: 'Too many registration requests. Please wait a few minutes before trying again.' });
          return;
        }
        regRecord.count++;
      } else {
        regAttempts.set(ip, { count: 1, firstAttempt: now });
      }
    } else {
      regAttempts.set(ip, { count: 1, firstAttempt: now });
    }

    const rawPayerName = req.body.payerName || req.body.payer_name;
    const rawPayerEmail = req.body.payerEmail || req.body.payer_email;
    const rawPayerPhone = req.body.payerPhone || req.body.payer_phone;
    const rawUtrNumber = req.body.utrNumber || req.body.utr_number;
    const attendeesRaw = req.body.attendees || req.body.attendeesJson;

    if (!req.file) {
      res.status(400).json({ error: 'Please upload your payment screenshot.' });
      return;
    }

    if (!rawPayerName || !rawPayerEmail || !rawPayerPhone) {
      res.status(400).json({ error: 'Please fill in all primary contact details (name, email, phone).' });
      return;
    }

    const payerName = String(rawPayerName).trim().slice(0, 120);
    const payerEmail = String(rawPayerEmail).trim().toLowerCase().slice(0, 120);
    const payerPhone = String(rawPayerPhone).trim().slice(0, 25);
    const utrNumber = rawUtrNumber ? String(rawUtrNumber).trim().slice(0, 60) : null;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payerEmail)) {
      res.status(400).json({ error: 'Please enter a valid primary contact email address.' });
      return;
    }

    const cleanPayerPhone = payerPhone.replace(/\D/g, '').slice(-10);
    if (cleanPayerPhone.length !== 10) {
      res.status(400).json({ error: 'Please enter a valid 10-digit contact phone number.' });
      return;
    }

    let parsedAttendees: AttendeePayload[] = [];
    try {
      if (typeof attendeesRaw === 'string') {
        parsedAttendees = JSON.parse(attendeesRaw || '[]');
      } else if (Array.isArray(attendeesRaw)) {
        parsedAttendees = attendeesRaw;
      }
    } catch {
      res.status(400).json({ error: 'Invalid attendee information format.' });
      return;
    }

    if (!Array.isArray(parsedAttendees) || parsedAttendees.length === 0) {
      res.status(400).json({ error: 'At least one attendee is required.' });
      return;
    }

    if (parsedAttendees.length > 20) {
      res.status(400).json({ error: 'Maximum 20 attendees allowed per registration submission.' });
      return;
    }

    // Check for duplicate emails or phones within the current submission
    const seenEmails = new Set<string>();
    const seenPhones = new Set<string>();

    for (let i = 0; i < parsedAttendees.length; i++) {
      const att = parsedAttendees[i];
      const cleanEmail = att.email.toLowerCase();
      const cleanPhone = att.phone.replace(/\D/g, '').slice(-10);

      if (seenEmails.has(cleanEmail)) {
        res.status(400).json({
          error: `Duplicate email address "${att.email}" detected in your attendee list. Each attendee must have a distinct email address.`,
        });
        return;
      }
      seenEmails.add(cleanEmail);

      if (seenPhones.has(cleanPhone)) {
        res.status(400).json({
          error: `Duplicate phone number "${att.phone}" detected in your attendee list. Each attendee must have a distinct mobile number.`,
        });
        return;
      }
      seenPhones.add(cleanPhone);
    }

    // Check if any attendee email or phone is ALREADY registered with a confirmed pass in the database
    for (const att of parsedAttendees) {
      const cleanEmail = att.email.toLowerCase();
      const cleanPhone = att.phone.replace(/\D/g, '').slice(-10);

      const existingConfirmedEmail = db.prepare(`
        SELECT a.name, a.email, a.ticket_code
        FROM attendees a
        JOIN registrations r ON a.registration_id = r.id
        WHERE LOWER(a.email) = ? AND (a.status = 'confirmed' OR r.status = 'confirmed')
        LIMIT 1
      `).get(cleanEmail) as { name: string; email: string; ticket_code: string } | undefined;

      if (existingConfirmedEmail) {
        res.status(409).json({
          error: `"${att.email}" is already registered for Friends of Tech (Pass Code: ${existingConfirmedEmail.ticket_code || 'Issued'}). Each attendee can only register once.`,
        });
        return;
      }

      const existingConfirmedPhone = db.prepare(`
        SELECT a.name, a.email, a.phone, a.ticket_code
        FROM attendees a
        JOIN registrations r ON a.registration_id = r.id
        WHERE a.phone LIKE ? AND (a.status = 'confirmed' OR r.status = 'confirmed')
        LIMIT 1
      `).get(`%${cleanPhone}%`) as { name: string; email: string; ticket_code: string } | undefined;

      if (existingConfirmedPhone) {
        res.status(409).json({
          error: `Phone number "+91 ${cleanPhone}" is already registered under ${existingConfirmedPhone.name} (${existingConfirmedPhone.email}). Each attendee can only register once.`,
        });
        return;
      }
    }

    // Price calculation
    const eventConfig = db.prepare('SELECT price_per_person, name FROM event_config WHERE id = 1').get() as { price_per_person: number; name: string };
    const pricePerPerson = eventConfig ? eventConfig.price_per_person : 99;
    const totalAmount = parsedAttendees.length * pricePerPerson;

    // Team pairing calculation: 2 per team, odd -> SOLO
    const teamAttendees = parsedAttendees.filter(a => a.category === 'TEAM');
    const soloAttendees = parsedAttendees.filter(a => a.category === 'SOLO');

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

    // Add solo attendees
    for (const solo of soloAttendees) {
      pairedList.push({ payload: solo, assignedCategory: 'SOLO', teamIdentifier: null });
    }

    const regId = `REG-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const screenshotUrl = `/uploads/${req.file.filename}`;

    const insertReg = db.prepare(`
      INSERT INTO registrations (
        id, payer_name, payer_email, payer_phone, total_amount, attendee_count, payment_screenshot_url, utr_number, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `);

    const insertAtt = db.prepare(`
      INSERT INTO attendees (
        id, registration_id, name, email, phone, requested_category, assigned_category, team_identifier, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `);

    const transaction = db.transaction(() => {
      insertReg.run(regId, payerName, payerEmail, payerPhone, totalAmount, parsedAttendees.length, screenshotUrl, utrNumber || null);

      for (let i = 0; i < pairedList.length; i++) {
        const item = pairedList[i];
        const attId = `ATT-${regId.replace('REG-', '')}-${i + 1}`;
        insertAtt.run(
          attId,
          regId,
          item.payload.name.trim(),
          item.payload.email.trim(),
          item.payload.phone.trim(),
          item.payload.category,
          item.assignedCategory,
          item.teamIdentifier
        );
      }
    });

    transaction();

    // Background mirror to Supabase cloud
    const createdAttendees = db.prepare('SELECT * FROM attendees WHERE registration_id = ?').all(regId) as Array<{
      id: string;
      ticket_code: string;
      registration_id: string;
      name: string;
      email: string;
      phone: string;
      requested_category: string;
      assigned_category: string;
      team_identifier?: string;
      signed_token?: string;
      qr_data_url?: string;
      id_card_url?: string;
      status: string;
    }>;

    syncRegistrationToSupabase(
      {
        id: regId,
        payer_name: payerName,
        payer_email: payerEmail,
        payer_phone: payerPhone,
        total_amount: totalAmount,
        attendee_count: parsedAttendees.length,
        payment_screenshot_url: screenshotUrl,
        utr_number: utrNumber || undefined,
        status: 'pending',
      },
      createdAttendees
    ).catch(err => console.warn('[SUPABASE] Registration sync error:', err));

    res.json({
      success: true,
      registrationId: regId,
      attendeeCount: parsedAttendees.length,
      totalAmount,
      message: "You're registered. We'll verify your payment and email each person's QR pass.",
    });
  } catch (err: unknown) {
    console.error('Registration submission error:', err);
    res.status(500).json({ error: 'Failed to process registration. Please try again.' });
  }
});

// GET /api/registrations (Admin Protected List)
router.get('/', requireAdmin, (req: Request, res: Response): void => {
  const { status, search, type } = req.query;

  let query = `
    SELECT r.*,
      (SELECT COUNT(*) FROM attendees a WHERE a.registration_id = r.id) as total_attendees,
      (SELECT COUNT(*) FROM attendees a WHERE a.registration_id = r.id AND a.assigned_category = 'TEAM') as team_attendees,
      (SELECT COUNT(*) FROM attendees a WHERE a.registration_id = r.id AND a.assigned_category = 'SOLO') as solo_attendees
    FROM registrations r
    WHERE 1=1
  `;

  const params: unknown[] = [];

  if (status && status !== 'all') {
    query += ' AND r.status = ?';
    params.push(status);
  }

  if (search) {
    const searchPattern = `%${search}%`;
    query += ` AND (
      r.id LIKE ? OR r.payer_name LIKE ? OR r.payer_email LIKE ? OR r.payer_phone LIKE ? OR r.utr_number LIKE ?
      OR r.id IN (SELECT registration_id FROM attendees WHERE name LIKE ? OR email LIKE ? OR phone LIKE ? OR ticket_code LIKE ?)
    )`;
    params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
  }

  if (type === 'solo') {
    query += ' AND r.attendee_count = 1';
  } else if (type === 'group') {
    query += ' AND r.attendee_count > 1';
  }

  query += ' ORDER BY r.created_at DESC';

  const registrations = db.prepare(query).all(...params) as Record<string, unknown>[];

  const regIds = registrations.map(r => r.id);
  const attendeesMap = new Map<string, unknown[]>();

  if (regIds.length > 0) {
    const placeholders = regIds.map(() => '?').join(',');
    const attendeesQuery = `
      SELECT a.*,
        (SELECT COUNT(*) FROM check_ins c WHERE c.attendee_id = a.id) as checked_in,
        (SELECT c.scanned_at FROM check_ins c WHERE c.attendee_id = a.id ORDER BY c.scanned_at DESC LIMIT 1) as checked_in_at
      FROM attendees a
      WHERE a.registration_id IN (${placeholders})
      ORDER BY a.id ASC
    `;
    const attendees = db.prepare(attendeesQuery).all(...regIds) as (Record<string, unknown> & { registration_id: string })[];

    for (const att of attendees) {
      if (!attendeesMap.has(att.registration_id)) {
        attendeesMap.set(att.registration_id, []);
      }
      attendeesMap.get(att.registration_id)!.push(att);
    }
  }

  const enriched = registrations.map(reg => ({
    ...reg,
    attendees: attendeesMap.get(reg.id as string) || [],
  }));

  res.json({
    registrations: enriched,
    total: enriched.length,
  });
});

function getNextTicketCode(): string {
  const row = db.prepare(`
    SELECT ticket_code FROM attendees
    WHERE ticket_code LIKE 'FOT-%'
    ORDER BY id DESC LIMIT 1
  `).get() as { ticket_code?: string } | undefined;

  let nextNum = 1;
  if (row?.ticket_code) {
    const match = row.ticket_code.match(/FOT-(\d+)/);
    if (match) {
      nextNum = parseInt(match[1], 10) + 1;
    }
  }

  const countRow = db.prepare(`SELECT COUNT(*) as count FROM attendees WHERE ticket_code IS NOT NULL`).get() as { count: number };
  if (countRow.count >= nextNum) {
    nextNum = countRow.count + 1;
  }

  return `FOT-${String(nextNum).padStart(4, '0')}`;
}

// POST /api/registrations/:id/confirm (Confirm Registration & Issue Passes)
router.post('/:id/confirm', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const registration = db.prepare('SELECT * FROM registrations WHERE id = ?').get(id) as { id: string; status: string } | undefined;
    if (!registration) {
      res.status(404).json({ error: 'Registration not found.' });
      return;
    }

    const result = await confirmRegistrationAndIssuePasses(id);

    res.json({
      success: true,
      message: `Registration confirmed. ${result.attendeesCount} pass(es) generated and queued for email delivery.`,
      attendees: result.attendees,
    });
  } catch (err: unknown) {
    console.error('Confirmation error:', err);
    res.status(500).json({ error: (err as Error).message || 'Failed to confirm registration.' });
  }
});

// POST /api/registrations/:id/reject
router.post('/:id/reject', requireAdmin, (req: Request, res: Response): void => {
  const { id } = req.params;
  const { reason } = req.body;

  const registration = db.prepare('SELECT * FROM registrations WHERE id = ?').get(id);
  if (!registration) {
    res.status(404).json({ error: 'Registration not found.' });
    return;
  }

  db.prepare(`
    UPDATE registrations
    SET status = 'rejected', rejection_reason = ?
    WHERE id = ?
  `).run(reason || 'Payment could not be verified.', id);

  db.prepare(`
    UPDATE attendees
    SET status = 'rejected'
    WHERE registration_id = ?
  `).run(id);

  // Background mirror rejection to Supabase
  const fullReg = db.prepare('SELECT * FROM registrations WHERE id = ?').get(id) as Record<string, unknown>;
  const fullAtts = db.prepare('SELECT * FROM attendees WHERE registration_id = ?').all(id) as Array<Record<string, unknown>>;
  if (fullReg) {
    syncRegistrationToSupabase(fullReg as any, fullAtts as any).catch(err => console.warn('[SUPABASE] Rejection sync error:', err));
  }

  res.json({
    success: true,
    message: 'Registration marked as rejected.',
  });
});

// POST /api/registrations/attendees/:id/resend-email
router.post('/attendees/:id/resend-email', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    interface AttendeeFull {
      id: string;
      name: string;
      email: string;
      ticket_code: string;
      assigned_category: string;
      team_identifier: string | null;
      signed_token: string;
      id_card_url: string;
    }

    const att = db.prepare('SELECT * FROM attendees WHERE id = ?').get(id) as AttendeeFull | undefined;
    if (!att || !att.ticket_code) {
      res.status(404).json({ error: 'Attendee ticket pass not found.' });
      return;
    }

    const eventConfig = db.prepare('SELECT name, date_text, venue_name FROM event_config WHERE id = 1').get() as {
      name: string;
      date_text: string;
      venue_name: string;
    };

    const { svgString, passUrl } = await CardGenerator.generatePassCard({
      attendeeId: att.id,
      ticketCode: att.ticket_code,
      name: att.name,
      category: att.assigned_category,
      teamIdentifier: att.team_identifier,
      signedToken: att.signed_token,
      eventName: eventConfig.name,
      dateText: eventConfig.date_text,
      venueName: eventConfig.venue_name,
    });

    const result = await EmailService.sendTicketEmail({
      toEmail: att.email,
      name: att.name,
      ticketCode: att.ticket_code,
      category: att.assigned_category,
      teamIdentifier: att.team_identifier,
      eventName: eventConfig.name,
      dateText: eventConfig.date_text,
      venueName: eventConfig.venue_name,
      passUrl,
      svgString,
    });

    db.prepare('UPDATE attendees SET email_sent = 1, email_sent_at = CURRENT_TIMESTAMP WHERE id = ?').run(att.id);

    res.json({
      success: true,
      message: `Pass emailed to ${att.email}.`,
      deliveryStatus: result.success ? 'Delivered' : 'Simulated Delivery',
    });
  } catch (err: unknown) {
    console.error('Resend email error:', err);
    res.status(500).json({ error: 'Failed to resend pass email.' });
  }
});

// POST /api/registrations/reset & /api/registrations/purge-all (Admin Protected - Reset all test attendee and registration data)
router.post(['/reset', '/purge-all'], requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  try {
    const transaction = db.transaction(() => {
      db.exec('DELETE FROM check_ins');
      db.exec('DELETE FROM attendees');
      db.exec('DELETE FROM registrations');
      db.exec('DELETE FROM users');
      try {
        db.exec("DELETE FROM sqlite_sequence WHERE name IN ('registrations', 'attendees', 'check_ins')");
      } catch {
        // ignore if sqlite_sequence not initialized
      }
    });
    transaction();

    // Clean up generated pass files from uploads/passes
    try {
      const fs = await import('fs');
      const path = await import('path');
      const passesDir = path.resolve(process.cwd(), 'uploads/passes');
      if (fs.existsSync(passesDir)) {
        const files = fs.readdirSync(passesDir);
        for (const file of files) {
          if (file !== '.gitkeep') {
            try {
              fs.unlinkSync(path.join(passesDir, file));
            } catch {
              // ignore single file unlinks
            }
          }
        }
      }
    } catch (fsErr) {
      console.warn('[RESET PASS CLEANUP WARNING]', fsErr);
    }

    // Mirror reset to Supabase if configured
    if (supabase) {
      try {
        await supabase.from('check_ins').delete().neq('id', 0);
        await supabase.from('attendees').delete().neq('id', '');
        await supabase.from('registrations').delete().neq('id', '');
        try {
          await supabase.from('users').delete().neq('id', '');
        } catch {
          // ignore if users table does not exist in Supabase
        }
      } catch (sbErr) {
        console.warn('[SUPABASE RESET WARNING]', sbErr);
      }
    }

    res.json({
      success: true,
      message: 'All test registrations, attendees, users, and check-in records have been permanently reset.',
    });
  } catch (err: unknown) {
    console.error('Reset error:', err);
    res.status(500).json({ error: 'Failed to reset data.' });
  }
});

export default router;
