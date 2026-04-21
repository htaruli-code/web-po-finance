// ============================================================
// config.js
// Version : 1.2
// Updated : 2026-04-03
// Changes :
//   v1.2 — Fix C1: const POF_CONFIG replaced with window.POF_CONFIG
//          assignment. const is block-scoped in strict/module context
//          so window.POF_CONFIG was undefined in navbar.js, causing
//          the platform currency override to silently do nothing.
//   v1.1 — Removed non-ASCII characters; added version header.
//          WEB_APP_URL, ROUTES, and PLATFORM_NAME are the only
//          values that need editing per deployment.
// ============================================================
//
// config.js — PO Financing Portal v4
// Only file that needs editing for each deployment.
// ============================================================

window.POF_CONFIG = {

  // ── Backend URL ────────────────────────────────────────────
  WEB_APP_URL: 'https://script.google.com/macros/s/AKfycbwB8LVdpQPd3vCfTwXC9XdswR4xS0W7fk9wFUSO4MXNIPO3_8-FKJhVyUvvKXhuFnjEmA/exec',

  // ── Platform defaults (overridden by live fetch from API) ──
  PLATFORM_NAME: 'PO Financing Portal v4',
  CURRENCY:      'MYR',
  TIMEZONE:      'Asia/Kuala_Lumpur',
  DATE_FORMAT:   'dd MMM yyyy',
  VERSION:       'v4',

  // ── Portal routes for static hosting ──────────────────────
  // Adjust paths to match your static hosting directory structure
  ROUTES: {
    login:     '/index.html',
    ops:       '/portals/ops.html',
    client:    '/portals/client.html',
    admin:     '/portals/admin.html',
    investor:  '/portals/investor.html',
    capital:   '/portals/capital.html',
    simulator: '/portals/simulator.html',
  },

};
