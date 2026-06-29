// Backend API base — change VITE_API_URL in .env to point to your server
export const API_BASE: string =
  (import.meta as any).env?.VITE_API_URL || 'http://localhost:5000/api';

// Public-facing base URL for customer links (WhatsApp, QR codes, etc.)
export const PUBLIC_BASE_URL: string =
  (import.meta as any).env?.VITE_PUBLIC_BASE_URL || window.location.origin;

// ── Session expired event ────────────────────────────────────────────────────
// apiFetch fires this custom event when it receives a 401 from the backend.
// App.tsx listens for it to redirect the user to login without a page reload.
export const SESSION_EXPIRED_EVENT = 'mrlodge:session-expired';

export function getToken(): string | null {
  const token = localStorage.getItem('mrlodge_token');
  if (!token || token === 'undefined' || token === 'null') {
    return null;
  }
  return token;
}

export function clearSession() {
  localStorage.removeItem('mrlodge_token');
  localStorage.removeItem('mrlodge_user');
}

export function getAuthHeaders(): Record<string, string> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

// ── apiFetch ─────────────────────────────────────────────────────────────────
// Central fetch wrapper used by every page.
// Handles:
//   - Authorization header injection (JSON and FormData paths)
//   - 401 responses → clear session + fire SESSION_EXPIRED_EVENT
//   - Error enrichment (.status, .data on thrown Error)
export async function apiFetch(endpoint: string, options: RequestInit = {}) {
  // Always work on a COPY of options — never mutate the caller's object
  const opts: RequestInit = { ...options };

  if (opts.body instanceof FormData) {
    // FormData: do NOT set Content-Type — browser must set it with the
    // multipart boundary. Only inject Authorization header.
    const token = getToken();
    opts.headers = token ? { Authorization: `Bearer ${token}` } : {};
  } else {
    // JSON body or no body: merge auth headers with any caller-supplied headers
    opts.headers = {
      ...getAuthHeaders(),
      ...(options.headers as Record<string, string> || {}),
    };
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${endpoint}`, opts);
  } catch (networkErr: any) {
    // Network failure (server down, no internet, CORS blocked at network level)
    const err: any = new Error(
      'Cannot reach the server. Please check that the backend is running.'
    );
    err.status = 0;
    err.isNetworkError = true;
    throw err;
  }

  // ── 401: session expired or token missing ───────────────────────────────
  // We return 401 for ALL token problems (missing, expired, invalid).
  // Fire the session-expired event so App.tsx can redirect to login.
  if (response.status === 401) {
    clearSession();
    window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT, {
      detail: { message: 'Session expired. Please login again.' }
    }));
    const err: any = new Error('Session expired. Please login again.');
    err.status = 401;
    err.isAuthError = true;
    throw err;
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const err: any = new Error(
      errorData.message || `Request failed with status ${response.status}`
    );
    err.status = response.status;
    err.data = errorData;
    throw err;
  }

  return response.json();
}
