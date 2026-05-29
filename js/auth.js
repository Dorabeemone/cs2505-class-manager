// js/auth.js — Shared auth module for CS2505 Class Manager
// Must be loaded AFTER: Vue 3, Supabase JS, Element Plus
(function () {
  'use strict';

  // ---- Guard: verify dependencies ----
  if (!window.supabase || !window.Vue) {
    console.error('[auth] Missing dependencies. Ensure supabase and Vue are loaded before auth.js');
    return;
  }

  // ---- Supabase client ----
  var SUPABASE_URL = 'https://brqrrzvrgtvuqjnragfp.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_G3JtNib7OmJktuVgxLCAlw_m8aQYudO';
  var db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  // ---- Reactive auth state ----
  window.AuthState = window.Vue.reactive({
    user: null // { email: string, is_admin: boolean } or null
  });

  // ---- Restore session from localStorage ----
  function restoreSession() {
    try {
      var stored = localStorage.getItem('currentUser');
      if (stored) {
        var parsed = JSON.parse(stored);
        if (parsed && parsed.email) {
          window.AuthState.user = parsed;
        } else {
          localStorage.removeItem('currentUser');
        }
      }
    } catch (e) {
      // localStorage not available or corrupted data — silently ignore
      try { localStorage.removeItem('currentUser'); } catch (ignored) {}
    }
  }

  // ---- Login ----
  async function login(email, password) {
    var result = await db
      .from('users')
      .select('email, is_admin')
      .eq('email', email)
      .eq('password', password)
      .maybeSingle();

    if (result.error) throw new Error('登录失败，请稍后重试');
    if (!result.data) throw new Error('邮箱或密码错误');

    var user = { email: result.data.email, is_admin: result.data.is_admin };
    try {
      localStorage.setItem('currentUser', JSON.stringify(user));
    } catch (e) { /* localStorage not available */ }
    window.AuthState.user = user;
    return user;
  }

  // ---- Register ----
  async function register(email, password) {
    // Check existing
    var check = await db
      .from('users')
      .select('email')
      .eq('email', email)
      .maybeSingle();

    if (check.error) throw new Error('注册失败，请稍后重试');
    if (check.data) throw new Error('该邮箱已注册');

    // Insert new user
    var insert = await db
      .from('users')
      .insert([{ email: email, password: password, is_admin: false }]);

    if (insert.error) throw new Error('注册失败：' + insert.error.message);

    // Auto-login
    await login(email, password);
  }

  // ---- Logout ----
  function logout() {
    try { localStorage.removeItem('currentUser'); } catch (e) {}
    window.AuthState.user = null;
  }

  // ---- Init ----
  restoreSession();

  // ---- Public API ----
  window.AuthActions = {
    login: login,
    register: register,
    logout: logout,
    supabase: db
  };

  console.log('[auth] Module ready, user:', window.AuthState.user ? window.AuthState.user.email : '(none)');
})();
