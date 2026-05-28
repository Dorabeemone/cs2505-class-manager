// ===== Shared Auth Module for CS2505 Class Manager =====
// Load this AFTER Vue and Supabase CDN scripts in each HTML page.
// Provides window.AuthState (reactive) and window.AuthActions.

(function () {
  const SB_URL = 'https://brqrrzvrgtvuqjnragfp.supabase.co';
  const SB_KEY = 'sb_publishable_G3JtNib7OmJktuVgxLCAlw_m8aQYudO';

  if (!window.supabase) { console.error('[auth.js] Supabase SDK not loaded'); return; }
  if (!window.Vue) { console.error('[auth.js] Vue not loaded'); return; }

  const sb = window.supabase.createClient(SB_URL, SB_KEY);
  window.SB = sb;

  // ---------- Reactive Auth State ----------
  window.AuthState = Vue.reactive({
    user: null,
    session: null,
    isAdmin: false,
    loading: true,
    initialized: false,

    async init() {
      this.loading = true;
      try {
        const { data } = await sb.auth.getSession();
        this.session = data.session;
        this.user = data.session?.user ?? null;
        if (this.user) {
          await this._checkAdmin();
        }
      } catch (e) {
        console.error('[auth.js] init error:', e);
      } finally {
        this.loading = false;
        this.initialized = true;
      }
    },

    async _checkAdmin() {
      if (!this.user) { this.isAdmin = false; return; }
      try {
        const { data, error } = await sb
          .from('user_roles')
          .select('role')
          .eq('user_id', this.user.id)
          .eq('role', 'admin')
          .maybeSingle();
        this.isAdmin = !error && !!data;
      } catch (e) {
        this.isAdmin = false;
      }
    },

    async refreshAdmin() {
      await this._checkAdmin();
    }
  });

  // ---------- Auth State Change Listener ----------
  sb.auth.onAuthStateChange(async (event, session) => {
    window.AuthState.session = session;
    window.AuthState.user = session?.user ?? null;
    if (session?.user) {
      await window.AuthState._checkAdmin();
    } else {
      window.AuthState.isAdmin = false;
    }
  });

  // ---------- Auth Actions ----------
  window.AuthActions = {
    async login(email, password) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      return { data, error };
    },

    async register(email, password, displayName) {
      const options = displayName
        ? { data: { display_name: displayName } }
        : {};
      const { data, error } = await sb.auth.signUp({ email, password, options });
      return { data, error };
    },

    async logout() {
      const { error } = await sb.auth.signOut();
      return { error };
    },

    async markTaskComplete(taskId) {
      const { data, error } = await sb.rpc('toggle_task_complete', { p_task_id: taskId });
      return { data, error };
    },

    async resendVerification(email) {
      const { error } = await sb.auth.resend({ email, type: 'signup' });
      return { error };
    }
  };

  console.log('[auth.js] Auth module ready');
})();
