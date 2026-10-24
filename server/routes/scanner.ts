import { Router, Request, Response } from 'express';
import { db } from '../db/database';
import { requireAdmin } from '../middleware/auth';
import { TokenService } from '../services/tokenService';
import { SheetsService } from '../services/sheetsService';
import { syncCheckInToSupabase } from '../db/supabase';
import { confirmRegistrationAndIssuePasses } from '../services/ticketService';

const router = Router();

interface AttendeeScanRow {
  id: string;
  registration_id: string;
  ticket_code: string | null;
  name: string;
  email: string;
  phone: string;
  assigned_category: string;
  team_identifier: string | null;
  status: string;
  id_card_url?: string | null;
}

interface CheckInRow {
  id: number;
  scanned_at: string;
  scanned_by: string;
}

/**
 * Robust extraction of candidate identifiers from scanned text, QR URLs, or manual input
 */
function extractScanCandidates(rawInput: string): {
  signedToken?: string;
  ticketCode?: string;
  attendeeId?: string;
  registrationId?: string;
  email?: string;
  phone?: string;
  searchTerm?: string;
} {
  const input = rawInput.trim();
  const result: ReturnType<typeof extractScanCandidates> = { searchTerm: input };

  if (!input) return result;

  // 1. Check if input is a URL (e.g. from scanned QR)
  if (input.startsWith('http://') || input.startsWith('https://') || input.includes('?')) {
    try {
      const urlObj = new URL(input.startsWith('http') ? input : `http://dummy.com/${input}`);
      const tokenParam = urlObj.searchParams.get('token');
      const ticketParam = urlObj.searchParams.get('ticket') || urlObj.searchParams.get('code');
      const refParam = urlObj.searchParams.get('ref') || urlObj.searchParams.get('reg');
      const attParam = urlObj.searchParams.get('att') || urlObj.searchParams.get('attendeeId');

      if (tokenParam) result.signedToken = tokenParam;
      if (ticketParam) result.ticketCode = ticketParam.toUpperCase();
      if (refParam) result.registrationId = refParam.toUpperCase();
      if (attParam) result.attendeeId = attParam.toUpperCase();
    } catch {
      // Ignore URL parse failure
    }
  }

  // 2. Direct HMAC token (base64url.signature)
  if (input.includes('.') && input.length > 40 && !input.includes(' ')) {
    result.signedToken = input;
  }

  // 3. Extract FOT Ticket Code (e.g. FOT-0001)
  const ticketMatch = input.match(/\bFOT-[A-Z0-9-]+\b/i);
  if (ticketMatch) {
    result.ticketCode = ticketMatch[0].toUpperCase();
  }

  // 4. Extract Attendee ID (e.g. ATT-...)
  const attMatch = input.match(/\bATT-[A-Z0-9-]+\b/i);
  if (attMatch) {
    result.attendeeId = attMatch[0].toUpperCase();
  }

  // 5. Extract Registration ID (e.g. REG-...)
  const regMatch = input.match(/\bREG-[A-Z0-9-]+\b/i);
  if (regMatch) {
    result.registrationId = regMatch[0].toUpperCase();
  }

  // 6. Email check
  if (input.includes('@') && !input.includes(' ')) {
    result.email = input.toLowerCase();
  }

  // 7. Phone digits (10 digits)
  const cleanDigits = input.replace(/\D/g, '');
  if (cleanDigits.length >= 10) {
    result.phone = cleanDigits.slice(-10);
  }

  return result;
}

// POST /api/scanner/verify (Admin protected QR / Manual Code Scanner)
router.post('/verify', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { token, manualCode } = req.body;
    const rawInput = (token || manualCode || '').trim();

    if (!rawInput) {
      res.status(400).json({ error: 'Either token or manualCode is required.' });
      return;
    }

    const candidates = extractScanCandidates(rawInput);
    let attendee: AttendeeScanRow | undefined;

    // A. Verify HMAC token cryptographic signature if token present
    if (candidates.signedToken) {
      const verification = TokenService.verifyToken(candidates.signedToken);
      if (verification.valid && verification.payload) {
        if (verification.payload.attendeeId) {
          attendee = db.prepare('SELECT * FROM attendees WHERE id = ?').get(verification.payload.attendeeId) as AttendeeScanRow | undefined;
        }
        if (!attendee && verification.payload.ticketCode) {
          attendee = db.prepare('SELECT * FROM attendees WHERE UPPER(ticket_code) = ?').get(verification.payload.ticketCode.toUpperCase()) as AttendeeScanRow | undefined;
        }
      } else {
        // Fallback: Check if token directly matches attendee's stored signed_token in database
        attendee = db.prepare('SELECT * FROM attendees WHERE signed_token = ?').get(candidates.signedToken) as AttendeeScanRow | undefined;
      }
    }

    // B. Lookup by Ticket Code (e.g. FOT-0001)
    if (!attendee && candidates.ticketCode) {
      attendee = db.prepare('SELECT * FROM attendees WHERE UPPER(ticket_code) = ?').get(candidates.ticketCode) as AttendeeScanRow | undefined;
    }

    // C. Lookup by Attendee ID (e.g. ATT-...)
    if (!attendee && candidates.attendeeId) {
      attendee = db.prepare('SELECT * FROM attendees WHERE UPPER(id) = ?').get(candidates.attendeeId) as AttendeeScanRow | undefined;
    }

    // D. Lookup by Registration ID (e.g. REG-...)
    if (!attendee && candidates.registrationId) {
      attendee = db.prepare('SELECT * FROM attendees WHERE UPPER(registration_id) = ? ORDER BY id ASC LIMIT 1').get(candidates.registrationId) as AttendeeScanRow | undefined;
    }

    // E. Lookup by Email
    if (!attendee && candidates.email) {
      attendee = db.prepare('SELECT * FROM attendees WHERE LOWER(email) = ? LIMIT 1').get(candidates.email) as AttendeeScanRow | undefined;
    }

    // F. Lookup by Phone Number
    if (!attendee && candidates.phone) {
      attendee = db.prepare('SELECT * FROM attendees WHERE phone LIKE ? LIMIT 1').get(`%${candidates.phone}%`) as AttendeeScanRow | undefined;
    }

    // G. Fallback: Search term match by exact or partial ticket_code, id, email, or name
    if (!attendee && candidates.searchTerm) {
      const term = candidates.searchTerm;
      attendee = db.prepare(`
        SELECT * FROM attendees
        WHERE UPPER(ticket_code) = ?
           OR UPPER(id) = ?
           OR LOWER(email) = ?
           OR phone LIKE ?
           OR LOWER(name) = ?
        LIMIT 1
      `).get(term.toUpperCase(), term.toUpperCase(), term.toLowerCase(), `%${term}%`, term.toLowerCase()) as AttendeeScanRow | undefined;
    }

    // 1. Not Found in Database
    if (!attendee) {
      res.status(200).json({
        status: 'INVALID',
        message: 'Pass or code not recognized. No attendee found matching this ticket or identifier.',
        error: 'Ticket not found or unregistered code.',
      });
      return;
    }

    // 2. Attendee Registration is Pending Payment/Verification
    if (attendee.status === 'pending') {
      res.status(200).json({
        status: 'PENDING_PAYMENT',
        message: `Registration Pending: ${attendee.name} has registered, but payment or pass confirmation is pending. Please verify and approve.`,
        canQuickConfirm: true,
        registrationId: attendee.registration_id,
        attendee: {
          id: attendee.id,
          ticketCode: attendee.ticket_code || 'Pending',
          name: attendee.name,
          email: attendee.email,
          phone: attendee.phone,
          category: attendee.assigned_category,
          team: attendee.team_identifier,
          registrationId: attendee.registration_id,
          status: attendee.status,
        },
      });
      return;
    }

    // 3. Attendee Registration was Rejected
    if (attendee.status === 'rejected') {
      res.status(200).json({
        status: 'REJECTED',
        message: `Registration Rejected: Registration for ${attendee.name} was rejected. Entry denied.`,
        attendee: {
          id: attendee.id,
          ticketCode: attendee.ticket_code || 'Rejected',
          name: attendee.name,
          email: attendee.email,
          phone: attendee.phone,
          category: attendee.assigned_category,
          team: attendee.team_identifier,
          registrationId: attendee.registration_id,
          status: attendee.status,
        },
      });
      return;
    }

    // 4. Check for Existing Check-In (Prevent Duplicates)
    const existingCheckIn = db.prepare(`
      SELECT * FROM check_ins WHERE attendee_id = ? ORDER BY scanned_at ASC LIMIT 1
    `).get(attendee.id) as CheckInRow | undefined;

    if (existingCheckIn) {
      const formattedTime = new Date(existingCheckIn.scanned_at).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });

      res.json({
        status: 'ALREADY_CHECKED_IN',
        message: `Already checked in at ${formattedTime}`,
        scannedAt: existingCheckIn.scanned_at,
        attendee: {
          id: attendee.id,
          ticketCode: attendee.ticket_code || 'Issued',
          name: attendee.name,
          email: attendee.email,
          phone: attendee.phone,
          category: attendee.assigned_category,
          team: attendee.team_identifier,
          registrationId: attendee.registration_id,
          status: attendee.status,
        },
      });
      return;
    }

    // 5. Valid Confirmed Attendee: Record Check-In
    const now = new Date().toISOString();
    const effectiveTicketCode = attendee.ticket_code || attendee.id;
    const insertResult = db.prepare(`
      INSERT INTO check_ins (attendee_id, ticket_code, scanned_by, scanned_at, synced_to_sheets)
      VALUES (?, ?, ?, ?, 0)
    `).run(attendee.id, effectiveTicketCode, 'Gate Scanner', now);

    const checkInId = insertResult.lastInsertRowid;

    // Background mirror to Supabase cloud
    syncCheckInToSupabase({
      attendee_id: attendee.id,
      ticket_code: effectiveTicketCode,
      scanned_by: 'Gate Scanner',
      created_at: now,
    }).catch(err => console.warn('[SUPABASE] Check-in sync error:', err));

    // Append to Google Sheets asynchronously
    SheetsService.appendCheckIn({
      timestamp: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      ticketCode: effectiveTicketCode,
      name: attendee.name,
      phone: attendee.phone,
      email: attendee.email,
      category: attendee.assigned_category,
      team: attendee.team_identifier || 'N/A',
      status: 'Reached',
    }).then((sheetResult) => {
      if (sheetResult.success) {
        db.prepare('UPDATE check_ins SET synced_to_sheets = 1 WHERE id = ?').run(checkInId);
      }
    }).catch((sheetErr) => {
      console.warn('[SCANNER] Google Sheet append warning:', sheetErr);
    });

    res.json({
      status: 'VALID',
      message: 'Check-in confirmed. Admit attendee.',
      checkedInAt: now,
      attendee: {
        id: attendee.id,
        ticketCode: effectiveTicketCode,
        name: attendee.name,
        email: attendee.email,
        phone: attendee.phone,
        category: attendee.assigned_category,
        team: attendee.team_identifier,
        registrationId: attendee.registration_id,
        status: attendee.status,
      },
    });
  } catch (err: unknown) {
    console.error('Scanner verification error:', err);
    res.status(500).json({ error: 'Server error during scan verification.' });
  }
});

// POST /api/scanner/quick-confirm (Direct Gate Confirmation & Immediate Check-In)
router.post('/quick-confirm', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { registrationId, attendeeId } = req.body;

    if (!registrationId) {
      res.status(400).json({ error: 'registrationId is required for quick-confirm.' });
      return;
    }

    // Confirm registration and generate tickets/passes
    await confirmRegistrationAndIssuePasses(registrationId);

    // Get attendee record
    let attendee: AttendeeScanRow | undefined;
    if (attendeeId) {
      attendee = db.prepare('SELECT * FROM attendees WHERE id = ?').get(attendeeId) as AttendeeScanRow | undefined;
    }
    if (!attendee) {
      attendee = db.prepare('SELECT * FROM attendees WHERE registration_id = ? ORDER BY id ASC LIMIT 1').get(registrationId) as AttendeeScanRow | undefined;
    }

    if (!attendee) {
      res.status(404).json({ error: 'Attendee not found after confirmation.' });
      return;
    }

    // Check if already checked in
    const existingCheckIn = db.prepare(`
      SELECT * FROM check_ins WHERE attendee_id = ? ORDER BY scanned_at ASC LIMIT 1
    `).get(attendee.id) as CheckInRow | undefined;

    const now = new Date().toISOString();
    const effectiveTicketCode = attendee.ticket_code || attendee.id;

    if (!existingCheckIn) {
      const insertResult = db.prepare(`
        INSERT INTO check_ins (attendee_id, ticket_code, scanned_by, scanned_at, synced_to_sheets)
        VALUES (?, ?, ?, ?, 0)
      `).run(attendee.id, effectiveTicketCode, 'Gate Scanner (Quick Confirm)', now);

      const checkInId = insertResult.lastInsertRowid;

      // Sync Supabase & Sheets in background
      syncCheckInToSupabase({
        attendee_id: attendee.id,
        ticket_code: effectiveTicketCode,
        scanned_by: 'Gate Scanner (Quick Confirm)',
        created_at: now,
      }).catch(err => console.warn('[SUPABASE] Quick confirm check-in sync error:', err));

      SheetsService.appendCheckIn({
        timestamp: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
        ticketCode: effectiveTicketCode,
        name: attendee.name,
        phone: attendee.phone,
        email: attendee.email,
        category: attendee.assigned_category,
        team: attendee.team_identifier || 'N/A',
        status: 'Reached',
      }).then((sheetResult) => {
        if (sheetResult.success) {
          db.prepare('UPDATE check_ins SET synced_to_sheets = 1 WHERE id = ?').run(checkInId);
        }
      }).catch((sheetErr) => {
        console.warn('[SCANNER] Google Sheet append warning:', sheetErr);
      });
    }

    res.json({
      status: 'VALID',
      message: `Registration confirmed & pass generated! ${attendee.name} admitted.`,
      checkedInAt: now,
      attendee: {
        id: attendee.id,
        ticketCode: effectiveTicketCode,
        name: attendee.name,
        email: attendee.email,
        phone: attendee.phone,
        category: attendee.assigned_category,
        team: attendee.team_identifier,
        registrationId: attendee.registration_id,
        status: 'confirmed',
      },
    });
  } catch (err: unknown) {
    console.error('Quick confirm error:', err);
    res.status(500).json({ error: (err as Error).message || 'Failed to quick confirm attendee.' });
  }
});

// GET /api/scanner/history (List all check-ins)
router.get('/history', requireAdmin, (_req: Request, res: Response): void => {
  const checkIns = db.prepare(`
    SELECT
      c.id,
      c.ticket_code,
      c.scanned_at,
      c.scanned_by,
      c.synced_to_sheets,
      a.id as attendee_id,
      a.name as attendee_name,
      a.email as attendee_email,
      a.phone as attendee_phone,
      a.assigned_category,
      a.team_identifier
    FROM check_ins c
    JOIN attendees a ON c.attendee_id = a.id
    ORDER BY c.scanned_at DESC
  `).all();

  res.json({ checkIns });
});

export default router;
