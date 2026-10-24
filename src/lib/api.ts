import type {
  EventConfig,
  Registration,
  ScannerScanResult,
  AdminUser,
  AttendeeInput,
  RazorpayOrderResponse,
  RazorpayVerifyResponse,
} from '../types';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const API_BASE_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const defaultHeaders: Record<string, string> = {
    Accept: 'application/json',
  };

  if (!(options.body instanceof FormData)) {
    defaultHeaders['Content-Type'] = 'application/json';
  }

  const adminToken = localStorage.getItem('fot_admin_token');
  if (adminToken) {
    defaultHeaders['Authorization'] = `Bearer ${adminToken}`;
  }

  const targetUrl = url.startsWith('http') ? url : `${API_BASE_URL}${url}`;

  const res = await fetch(targetUrl, {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
    credentials: 'include',
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    let errorMessage = `Request failed with status ${res.status}`;
    if (data) {
      if (typeof data.error === 'string') {
        errorMessage = data.error;
      } else if (data.error && typeof data.error === 'object') {
        errorMessage = data.error.message || data.error.code || JSON.stringify(data.error);
      } else if (typeof data.message === 'string') {
        errorMessage = data.message;
      }
    }

    if (res.status === 405) {
      errorMessage = 'Backend API server is not running or not connected (405 Method Not Allowed). Please deploy your backend and set VITE_API_URL or backend proxy in vercel.json.';
    } else if (res.status === 404) {
      errorMessage = 'Backend API server endpoint not found (404). Please ensure the backend server is deployed and connected.';
    }

    throw new ApiError(errorMessage, res.status);
  }

  return data as T;
}

export const api = {
  // Public Event API
  getEventConfig: () => request<EventConfig>('/api/event'),

  // Razorpay Payment API
  getPaymentConfig: () =>
    request<{ keyId: string; isConfigured: boolean }>('/api/payment/config'),

  checkAttendees: (attendees: AttendeeInput[]) =>
    request<{ valid: boolean; error?: string }>('/api/payment/check-attendees', {
      method: 'POST',
      body: JSON.stringify({ attendees }),
    }),

  createRazorpayOrder: (payload: {
    payerName?: string;
    payerEmail?: string;
    payerPhone?: string;
    attendees?: AttendeeInput[];
    amount?: number;
    currency?: string;
    receipt?: string;
  }) =>
    request<RazorpayOrderResponse>('/api/create-order', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  verifyRazorpayPayment: (payload: {
    registrationId?: string;
    order_id?: string;
    payment_id?: string;
    signature?: string;
    razorpay_order_id?: string;
    razorpay_payment_id?: string;
    razorpay_signature?: string;
  }) =>
    request<RazorpayVerifyResponse>('/api/verify-payment', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Legacy Public Registration Submission (with screenshot)
  submitRegistration: (formData: FormData) =>
    request<{ success: boolean; registrationId: string; totalAmount: number; message: string }>('/api/registrations', {
      method: 'POST',
      body: formData,
    }),

  // Admin Auth
  login: (credentials: { email: string; password: string }) =>
    request<{ success: boolean; admin: AdminUser; token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    }),

  logout: () =>
    request<{ success: boolean; message: string }>('/api/auth/logout', {
      method: 'POST',
    }),

  forgotPassword: (email: string) =>
    request<{ success: boolean; message: string }>('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  getMe: () =>
    request<{ authenticated: boolean; admin: AdminUser }>('/api/auth/me'),

  // Attendee / User Authentication


  // Event Configuration Update
  updateEventConfig: (config: Partial<EventConfig>) =>
    request<{ success: boolean; config: EventConfig; message: string }>('/api/event', {
      method: 'PUT',
      body: JSON.stringify(config),
    }),

  uploadEventImage: (file: File) => {
    const formData = new FormData();
    formData.append('image', file);
    return request<{ success: boolean; url: string }>('/api/event/upload', {
      method: 'POST',
      body: formData,
    });
  },

  // Admin Registrations Management
  getRegistrations: (params: { status?: string; search?: string; type?: 'solo' | 'group' | 'all' } = {}) => {
    const query = new URLSearchParams();
    if (params.status) query.set('status', params.status);
    if (params.search) query.set('search', params.search);
    if (params.type && params.type !== 'all') query.set('type', params.type);
    return request<{ registrations: Registration[]; total: number }>(`/api/registrations?${query.toString()}`);
  },

  confirmRegistration: (id: string) =>
    request<{ success: boolean; message: string; attendees: unknown[] }>(`/api/registrations/${id}/confirm`, {
      method: 'POST',
    }),

  rejectRegistration: (id: string, reason?: string) =>
    request<{ success: boolean; message: string }>(`/api/registrations/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  resendTicketEmail: (attendeeId: string) =>
    request<{ success: boolean; message: string }>(`/api/registrations/attendees/${attendeeId}/resend-email`, {
      method: 'POST',
    }),

  resetAllData: () =>
    request<{ success: boolean; message: string }>('/api/registrations/reset', {
      method: 'POST',
    }),

  purgeAllData: () =>
    request<{ success: boolean; message: string }>('/api/registrations/reset', {
      method: 'POST',
    }),

  // Scanner Verification
  verifyScan: (payload: { token?: string; manualCode?: string }) =>
    request<ScannerScanResult>('/api/scanner/verify', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  quickConfirmScanner: (payload: { registrationId: string; attendeeId?: string }) =>
    request<ScannerScanResult>('/api/scanner/quick-confirm', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getCheckInsHistory: () =>
    request<{ checkIns: unknown[] }>('/api/scanner/history'),

  // Google Sheets
  testSheetsConnection: (sheetUrl: string) =>
    request<{ success: boolean; message: string; sheetTitle?: string }>('/api/sheets/test', {
      method: 'POST',
      body: JSON.stringify({ sheetUrl }),
    }),

  syncSheets: () =>
    request<{ success: boolean; totalUnsynced: number; syncedCount: number; message: string }>('/api/sheets/sync', {
      method: 'POST',
    }),

  testEmail: (email: string) =>
    request<{ success: boolean; message: string }>('/api/sheets/test-email', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  // Stats
  getStatsOverview: () =>
    request<{
      metrics: {
        totalRegistrations: number;
        totalAttendees: number;
        soloAttendees: number;
        teamAttendees: number;
        teamGroupsCount: number;
        pendingRegistrations: number;
        confirmedRegistrations: number;
        rejectedRegistrations: number;
        totalRevenue: number;
        checkedInCount: number;
      };
      timeline: { dateLabel: string; count: number; cumulative: number }[];
    }>('/api/stats/overview'),
};
