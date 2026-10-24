export type AttendeeCategory = 'SOLO' | 'TEAM';

export type RegistrationStatus = 'pending' | 'confirmed' | 'rejected';

export interface AttendeeInput {
  id: string;
  name: string;
  email: string;
  phone: string;
  category: AttendeeCategory;
  team_name?: string;
  team_id?: string;
}

export interface Attendee {
  id: string;
  ticket_code: string | null;
  registration_id: string;
  name: string;
  email: string;
  phone: string;
  requested_category: AttendeeCategory;
  assigned_category: AttendeeCategory;
  team_identifier: string | null;
  signed_token: string | null;
  qr_data_url: string | null;
  id_card_url: string | null;
  email_sent: number;
  email_sent_at: string | null;
  status: RegistrationStatus;
  created_at: string;
  checked_in?: boolean;
  is_checked_in?: number | boolean;
  checked_in_at?: string | null;
}

export interface Registration {
  id: string;
  payer_name: string;
  payer_email: string;
  payer_phone: string;
  total_amount: number;
  attendee_count: number;
  payment_screenshot_url?: string | null;
  utr_number?: string | null;
  payment_method?: string | null;
  razorpay_order_id?: string | null;
  razorpay_payment_id?: string | null;
  razorpay_signature?: string | null;
  status: RegistrationStatus;
  rejection_reason?: string | null;
  created_at: string;
  confirmed_at?: string | null;
  attendees?: Attendee[];
}

export interface RazorpayOrderResponse {
  success: boolean;
  orderId: string;
  order_id?: string;
  amount: number;
  currency: string;
  keyId: string;
  key_id?: string;
  registrationId?: string;
  totalAmount?: number;
  attendeeCount?: number;
}

export interface RazorpayVerifyResponse {
  success: boolean;
  registrationId: string;
  attendeesCount?: number;
  message: string;
}

export interface ScheduleItem {
  time: string;
  title: string;
  description: string;
  tag: string;
}

export interface PrizeItem {
  rank: string;
  amount: string;
  description: string;
}

export interface FaqItem {
  question: string;
  answer: string;
}

export interface ContactPerson {
  role: string;
  name: string;
  phone: string;
  email: string;
}

export interface EventConfig {
  id: number;
  name: string;
  tagline: string;
  description: string;
  banner_url: string;
  logo_url: string;
  genlab_logo_url: string;
  date_text: string;
  time_text: string;
  venue_name: string;
  venue_address: string;
  price_per_person: number;
  upi_id: string;
  upi_name: string;
  gpay_qr_url: string;
  guidelines: string[];
  schedule: ScheduleItem[];
  prizes: PrizeItem[];
  faq: FaqItem[];
  contact: ContactPerson[];
  google_sheet_url: string;
  google_sheet_status: string;
  updated_at?: string;
}

export interface CheckInRecord {
  id: number;
  attendee_id: string;
  ticket_code: string;
  scanned_by: string;
  scanned_at: string;
  synced_to_sheets: number;
  attendee?: Attendee;
}

export interface AdminUser {
  id: number;
  email: string;
}

export interface AttendeeUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  created_at?: string;
}

export interface ScannedAttendeeInfo {
  id: string;
  ticketCode: string;
  ticket_code?: string;
  name: string;
  email: string;
  phone: string;
  category: string;
  assigned_category?: string;
  team?: string | null;
  team_identifier?: string | null;
  registrationId?: string;
  status?: string;
}

export interface ScannerScanResult {
  status: 'VALID' | 'ALREADY_CHECKED_IN' | 'INVALID' | 'PENDING_PAYMENT' | 'REJECTED';
  message: string;
  attendee?: ScannedAttendeeInfo;
  scannedAt?: string;
  checkInId?: number;
  canQuickConfirm?: boolean;
  registrationId?: string;
  error?: string;
}
