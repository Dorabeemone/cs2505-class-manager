// js/auth.js — Shared auth module for CS2505 Class Manager
// Must be loaded AFTER: Vue 3, Supabase JS, Element Plus
(function () {
  'use strict';

  if (!window.supabase || !window.Vue) {
    console.error('[auth] Missing dependencies. Ensure supabase and Vue are loaded before auth.js');
    return;
  }

  var SUPABASE_URL = 'https://brqrrzvrgtvuqjnragfp.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_G3JtNib7OmJktuVgxLCAlw_m8aQYudO';
  var db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  window.AuthState = window.Vue.reactive({
    user: null
  });

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
      try { localStorage.removeItem('currentUser'); } catch (ignored) {}
    }
  }

  // Login — returns user object { email, is_admin }
  async function login(email, password) {
    email = (email || '').trim();
    password = (password || '').trim();
    if (!email || !password) throw new Error('请输入邮箱和密码');

    // Use regular select (returns array) instead of maybeSingle to avoid PGRST116 406 errors
    var result = await db
      .from('users')
      .select('email, is_admin')
      .eq('email', email)
      .eq('password', password);

    if (result.error) {
      console.error('[auth] Login query error:', result.error);
      throw new Error('登录失败，请稍后重试');
    }
    if (!result.data || result.data.length === 0) throw new Error('邮箱或密码错误');

    var row = result.data[0];
    var user = { email: row.email, is_admin: row.is_admin };
    try { localStorage.setItem('currentUser', JSON.stringify(user)); } catch (e) {}
    window.AuthState.user = user;
    console.log('[auth] Login OK:', user.email);
    return user;
  }

  // Register — creates user then auto-logs in
  async function register(email, password) {
    email = (email || '').trim();
    password = (password || '').trim();
    if (!email || !password) throw new Error('请输入邮箱和密码');
    if (password.length < 6) throw new Error('密码至少需要6位');

    // Check if email already exists (regular select, no maybeSingle)
    var check = await db
      .from('users')
      .select('email')
      .eq('email', email);

    if (check.error) {
      console.error('[auth] Register check error:', check.error);
      throw new Error('注册失败，请稍后重试');
    }
    if (check.data && check.data.length > 0) throw new Error('该邮箱已注册');

    // Insert new user
    var insert = await db
      .from('users')
      .insert([{ email: email, password: password, is_admin: false }]);

    if (insert.error) {
      console.error('[auth] Register insert error:', insert.error);
      throw new Error('注册失败：' + insert.error.message);
    }

    console.log('[auth] Register OK:', email);
    // Auto-login after registration
    await login(email, password);
  }

  // Logout
  function logout() {
    try { localStorage.removeItem('currentUser'); } catch (e) {}
    window.AuthState.user = null;
    console.log('[auth] Logged out');
  }

  restoreSession();

  window.AuthActions = {
    login: login,
    register: register,
    logout: logout,
    supabase: db
  };

  console.log('[auth] Module ready, user:', window.AuthState.user ? window.AuthState.user.email : '(none)');
})();
