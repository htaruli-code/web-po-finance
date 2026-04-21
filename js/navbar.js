// ============================================================
// navbar.js
// Version : 2.5
// Updated : 2026-04-03
// Changes :
//   v1.8 — Fix N2: auth gate OPT-IN via POF_REQUIRE_AUTH.
//   v1.9 — Fix N3: hide documentElement synchronously (had race bug).
//   v2.0 — Fix N4: logout() reveals documentElement before navigating.
//   v2.5 — Removed debug console.log traces from Session.load().
//   v2.3 — Fix N7: platform settings (currency/timezone/name) must NOT
//           be read from sessionStorage cache — they change independently
//           of the session. Session.load() now always fetches
//           GET_SESSION_CONTEXT fresh to get current platform settings,
//           even when pof_ctx cache is valid. pof_ctx is still used for
//           user identity and permissions (stable per session).
//           fmt() locale changed from en-MY to en (neutral) so USD/AUD
//           format correctly, not with Malaysian locale conventions.
//   v2.2 — Fix N6: Session.load() now writes ctx.platform values
//           (currency, timezone, platform_name) to window.POF_CONFIG
//           after GET_SESSION_CONTEXT resolves. This overrides the
//           hardcoded config.js defaults so fmt() always uses the
//           live setting from the spreadsheet.
//   v2.1 — Fix N5: removed documentElement visibility hide entirely.
//           If navbar.js fails to load or execute for any reason
//           (network error, cached stale file, CDN issue), the hide
//           ran but the reveal never ran -> permanent blank page with
//           no error visible anywhere. Redirect on missing token is
//           sufficient auth security. Removed hide + all reveal calls.
// ============================================================
//
// navbar.js — PO Financing Portal v4
// Shared JS: API caller, Session, Toast, formatters, modals.
// Extracted from NavBar.html for static hosting.
//
// Load order in every PORTAL HTML (authenticated pages):
//   1. <script>window.POF_REQUIRE_AUTH = true;</script>  <- opt-in gate
//   2. <script src="/js/config.js"></script>              <- sets POF_CONFIG
//   3. <script src="/js/navbar.js"></script>              <- this file
//   4. portal-specific inline <script>
//
// Load order in index.html (login page — NO auth gate):
//   1. <script src="/js/config.js"></script>
//   2. <script src="/js/navbar.js"></script>              <- gate skipped
// ============================================================

// Hardcoded fallback — used if config.js fails to load.
// Keep in sync with POF_CONFIG.WEB_APP_URL in config.js.
const _GAS_URL = 'https://script.google.com/macros/s/AKfycbwB8LVdpQPd3vCfTwXC9XdswR4xS0W7fk9wFUSO4MXNIPO3_8-FKJhVyUvvKXhuFnjEmA/exec';

// ── Fix N2: Early auth gate — OPT-IN only via POF_REQUIRE_AUTH ──────
// Only runs when a page explicitly sets window.POF_REQUIRE_AUTH = true
// before this script loads. The login page (index.html) never sets it.
(function _earlyAuthGate() {
  // Gate is disabled unless the page explicitly opts in.
  // This prevents index.html (and any other public page) from looping.
  if (!window.POF_REQUIRE_AUTH) return;

  // Step 1: harvest token from URL hash if present (post-login redirect).
  // index.html appends #token=... to the destination portal URL so the
  // token is available immediately without a round-trip on the next page.
  if (!sessionStorage.getItem('pof_token') && window.location.hash.includes('token=')) {
    try {
      const raw = window.location.hash.split('token=')[1].split('&')[0];
      const tok = decodeURIComponent(raw);
      if (tok) {
        sessionStorage.setItem('pof_token', tok);
        // Strip hash so the token is not bookmarkable or visible in history
        history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    } catch(e) {}
  }

  // Step 2: still no token after hash check — redirect to login immediately.
  // window.location.replace() so the portal page is not in browser history.
  if (!sessionStorage.getItem('pof_token')) {
    const loginPage = (window.POF_CONFIG && window.POF_CONFIG.ROUTES && window.POF_CONFIG.ROUTES.login)
      || '/index.html';
    window.location.replace(loginPage);
    // Throw to stop all further JS execution on this page load.
    // Without this, the rest of navbar.js and the portal's own script
    // would continue running against a page that is already navigating away.
    throw new Error('AUTH_REDIRECT');
  }

  // Step 3: token exists. Do NOT hide the page — if navbar.js fails to
  // fully execute for any reason (network, cache), the hide would make
  // the page permanently blank with no recovery. The redirect on missing
  // token (Step 2) is sufficient security. A brief flash of unstyled
  // content is preferable to a permanently invisible page.
  // document.documentElement.style.visibility = 'hidden'; // REMOVED
})();

// ── API caller ────────────────────────────────────────────────
const API = {
  get _url() {
    // Prefer config.js value; fall back to hardcoded constant above.
    return (window.POF_CONFIG && window.POF_CONFIG.WEB_APP_URL) || _GAS_URL;
  },
  token: null,

  init() {
    this.token = sessionStorage.getItem('pof_token');
  },

  async call(action, params = {}) {
    const url = this._url;
    if (!url || url === 'YOUR_WEB_APP_URL_HERE') {
      // Show diagnostic info so the problem is obvious on screen
      throw new Error(
        'WEB_APP_URL not configured. ' +
        'POF_CONFIG=' + JSON.stringify(window.POF_CONFIG) + '. ' +
        'Edit js/config.js or update _GAS_URL in navbar.js.'
      );
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
    const token = sessionStorage.getItem('pof_token');
    const loginPage = (window.POF_CONFIG && window.POF_CONFIG.ROUTES)
      ? window.POF_CONFIG.ROUTES.login : '/index.html';
    if (!token) { window.location.href = loginPage; return null; }
    API.token = token;
    // Fix N7: always call GET_SESSION_CONTEXT on every page load so platform
    // settings (currency, timezone, name) are always current. Platform settings
    // change independently of the session — caching them in pof_ctx means a
    // currency change by admin is invisible until the user re-logs in.
    // pof_ctx is kept only as an in-memory reference; we no longer restore it
    // from sessionStorage as a shortcut that skips the fresh fetch.
    try {
      const ctx = await API.call('GET_SESSION_CONTEXT', {});
      if (!ctx.valid) { this.logout(); return null; }
      this._ctx = ctx;
      sessionStorage.setItem('pof_ctx', JSON.stringify(ctx));
      // Apply live platform settings to POF_CONFIG immediately
      if (ctx.platform && window.POF_CONFIG) {
        if (ctx.platform.currency)      window.POF_CONFIG.CURRENCY      = ctx.platform.currency;
        if (ctx.platform.timezone)      window.POF_CONFIG.TIMEZONE      = ctx.platform.timezone;
        if (ctx.platform.platform_name) window.POF_CONFIG.PLATFORM_NAME = ctx.platform.platform_name;
        if (ctx.platform.date_format)   window.POF_CONFIG.DATE_FORMAT   = ctx.platform.date_format;
      }
      return ctx;
    } catch(e) {
      if (e.message === 'Session expired' || e.message === 'SESSION_EXPIRED') {
        this.logout();
      }
      return null;
    }
  },

  get() { return this._ctx; },

  can(perm) {
    return this._ctx && this._ctx.permissions && this._ctx.permissions.includes(perm);
  },

  isRealm(realm) {
    return this._ctx && this._ctx.userType === realm;
  },

  logout() {
    // Reveal page before navigating so there is no blank-page flash
    // if logout() is called while documentElement is still hidden.
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
  return c + ' ' + Number(n || 0).toLocaleString('en', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}
function fmtN(n) {
  return Number(n || 0).toLocaleString('en', {
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
