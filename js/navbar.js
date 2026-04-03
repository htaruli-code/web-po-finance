// ============================================================
// navbar.js
// Version : 1.4
// Updated : 2026-04-02
// Changes :
//   v1.3 — CORS FIX: switched fetch from POST to GET + URLSearchParams.
//   v1.4 — Debug: if r.json() throws (GAS returned HTML error page
//           instead of JSON), catch the raw text and throw it as the
//           error message so it appears on screen via index.html catch.
// ============================================================
//
// navbar.js — PO Financing Portal v4
// Shared JS: API caller, Session, Toast, formatters, modals.
// Extracted from NavBar.html for static hosting.
//
// Load order in every portal HTML:
//   1. <script src="/js/config.js"></script>   <- sets POF_CONFIG
//   2. <script src="/js/navbar.js"></script>    <- this file
//   3. portal-specific inline <script>
// ============================================================

// ── API caller ────────────────────────────────────────────────
const API = {
  get _url() {
    return window.POF_CONFIG && window.POF_CONFIG.WEB_APP_URL;
  },
  token: null,

  init() {
    this.token = sessionStorage.getItem('pof_token');
  },

  async call(action, params = {}) {
    const url = this._url;
    if (!url || url === 'YOUR_WEB_APP_URL_HERE') {
      throw new Error('WEB_APP_URL not configured. Edit js/config.js.');
    }
    // v1.3 CORS FIX: GET + URLSearchParams, no custom headers, redirect:follow.
    // POST triggers a preflight; GAS 302-redirects it; redirect target has no
    // Access-Control-Allow-Origin -> CORS block. GET with simple params has no
    // preflight and follows the 302 transparently to the JSON response.
    const qs = new URLSearchParams({
      action,
      params:        JSON.stringify(params),
      session_token: this.token || '',
    });
    const r = await fetch(url + '?' + qs.toString(), {
      method:   'GET',
      redirect: 'follow',
    });
    // v1.4: if GAS returned an HTML error page instead of JSON,
    // r.json() throws SyntaxError — read raw text first so we can
    // show the actual GAS error message on screen.
    const text = await r.text();
    let d;
    try {
      d = JSON.parse(text);
    } catch(_) {
      // GAS returned non-JSON (HTML error page or empty response)
      throw new Error('GAS returned non-JSON: ' + text.slice(0, 300));
    }

    // Session expired — redirect to login
    if (d.error === 'SESSION_EXPIRED' || d.redirectTo === '/index.html') {
      sessionStorage.removeItem('pof_token');
      sessionStorage.removeItem('pof_user');
      sessionStorage.removeItem('pof_ctx');
      window.location.href = (window.POF_CONFIG && window.POF_CONFIG.ROUTES)
        ? window.POF_CONFIG.ROUTES.login
        : '/index.html';
      throw new Error('Session expired');
    }

    if (!d.success && d.error &&
        action !== 'GET_SESSION_CONTEXT' &&
        action !== 'SEND_OTP' &&
        action !== 'VERIFY_OTP') {
      throw new Error(d.error);
    }
    return d;
  },
};

// ── Session ───────────────────────────────────────────────────
const Session = {
  _ctx: null,

  async load() {
    if (this._ctx) return this._ctx;
    const cached = sessionStorage.getItem('pof_ctx');
    if (cached) { this._ctx = JSON.parse(cached); return this._ctx; }
    const token = sessionStorage.getItem('pof_token');
    const loginPage = (window.POF_CONFIG && window.POF_CONFIG.ROUTES)
      ? window.POF_CONFIG.ROUTES.login : '/index.html';
    if (!token) { window.location.href = loginPage; return null; }
    API.token = token;
    try {
      const ctx = await API.call('GET_SESSION_CONTEXT', {});
      if (!ctx.valid) { this.logout(); return null; }
      this._ctx = ctx;
      sessionStorage.setItem('pof_ctx', JSON.stringify(ctx));
      return ctx;
    } catch(e) { this.logout(); return null; }
  },

  get() { return this._ctx; },

  can(perm) {
    return this._ctx && this._ctx.permissions && this._ctx.permissions.includes(perm);
  },

  isRealm(realm) {
    return this._ctx && this._ctx.userType === realm;
  },

  logout() {
    if (API.token) {
      API.call('REVOKE_SESSION', {}).catch(() => {});
    }
    sessionStorage.removeItem('pof_token');
    sessionStorage.removeItem('pof_user');
    sessionStorage.removeItem('pof_ctx');
    const loginPage = (window.POF_CONFIG && window.POF_CONFIG.ROUTES)
      ? window.POF_CONFIG.ROUTES.login : '/index.html';
    window.location.href = loginPage;
  },

  renderUserBadge(containerId) {
    const c = document.getElementById(containerId);
    if (!c || !this._ctx) return;
    c.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px">
        <div style="background:var(--blue);color:#fff;width:30px;height:30px;border-radius:50%;
                    display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px">
          ${(this._ctx.fullName || '?').charAt(0).toUpperCase()}
        </div>
        <div style="font-size:12px">
          <div style="font-weight:600;color:var(--white)">${this._ctx.fullName || this._ctx.email}</div>
          <div style="color:rgba(255,255,255,0.5);font-size:10px">${this._ctx.primaryRole || this._ctx.userType}</div>
        </div>
        <button onclick="Session.logout()"
          style="background:rgba(255,255,255,0.1);border:none;color:rgba(255,255,255,0.6);
                 cursor:pointer;padding:4px 8px;border-radius:5px;font-size:11px;margin-left:4px"
          title="Sign out">⏻</button>
      </div>`;
  },

  applyPermissions() {
    document.querySelectorAll('[data-perm]').forEach(el => {
      if (!this.can(el.dataset.perm)) el.style.display = 'none';
    });
    document.querySelectorAll('[data-realm]').forEach(el => {
      if (!this.isRealm(el.dataset.realm)) el.style.display = 'none';
    });
  },
};

// ── Auth guard ────────────────────────────────────────────────
async function requireAuth() {
  const ctx = await Session.load();
  if (!ctx) return null;
  API.token = sessionStorage.getItem('pof_token');
  return ctx;
}

// ── Toast ─────────────────────────────────────────────────────
const Toast = {
  show(msg, type = 'info', dur = 3500) {
    let c = document.getElementById('toast');
    if (!c) {
      c = document.createElement('div');
      c.id = 'toast';
      document.body.appendChild(c);
    }
    const t = document.createElement('div');
    t.className = `toast-item ${type}`;
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => t.remove(), dur);
  },
  success(m) { this.show(m, 'success'); },
  error(m)   { this.show(m, 'error', 5000); },
  info(m)    { this.show(m, 'info'); },
  warn(m)    { this.show(m, 'warning'); },
};

// ── Formatters ────────────────────────────────────────────────
function fmt(n, cur) {
  const c = cur || (window.POF_CONFIG && window.POF_CONFIG.CURRENCY) || 'MYR';
  return c + ' ' + Number(n || 0).toLocaleString('en-MY', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}
function fmtN(n) {
  return Number(n || 0).toLocaleString('en-MY', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-MY', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}
function pct(n) { return Number(n || 0).toFixed(1) + '%'; }

function badge(status) {
  const map = {
    SUBMITTED:'badge-blue', UNDER_REVIEW:'badge-blue',
    PENDING_SECOND_APPROVAL:'badge-purple',
    APPROVED:'badge-teal', DISBURSED:'badge-green',
    OVERDUE:'badge-red', REPAID:'badge-gray',
    REJECTED:'badge-red', PENDING:'badge-amber',
    PENDING_APPROVAL:'badge-amber', POSTED:'badge-green',
    ACTIVE:'badge-green', AUTO_APPROVED:'badge-teal',
  };
  return `<span class="badge ${map[status] || 'badge-gray'}">${status.replace(/_/g, ' ')}</span>`;
}

// ── Modals ────────────────────────────────────────────────────
function openModal(id)  { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }
function closeAll()     {
  document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAll(); });

// ── Initialise API on script load ─────────────────────────────
API.init();
