// js/auth.js
// ========== Supabase 客户端初始化 ==========
const supabaseUrl = 'https://brqrrzvrgtvuqjnragfp.supabase.co';
const supabaseKey = 'sb_publishable_G3JtNib7OmJktuVgxLCAlw_m8aQYudO';
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

// ========== 全局响应式登录状态（供所有页面使用）==========
window.AuthState = Vue.reactive({
  user: null,         // { email, is_admin }
  loading: false
});

// 从 localStorage 恢复登录状态
function restoreSession() {
  const stored = localStorage.getItem('currentUser');
  if (stored) {
    try {
      window.AuthState.user = JSON.parse(stored);
    } catch (e) {
      localStorage.removeItem('currentUser');
    }
  }
}

// 登录
async function login(email, password) {
  const { data, error } = await supabase
    .from('users')
    .select('email, is_admin')
    .eq('email', email)
    .eq('password', password)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('邮箱或密码错误');
  const user = { email: data.email, is_admin: data.is_admin };
  localStorage.setItem('currentUser', JSON.stringify(user));
  window.AuthState.user = user;
  return user;
}

// 注册
async function register(email, password) {
  // 检查是否已存在
  const { data: existing } = await supabase
    .from('users')
    .select('email')
    .eq('email', email)
    .maybeSingle();
  if (existing) throw new Error('该邮箱已注册');
  const { error } = await supabase
    .from('users')
    .insert([{ email, password, is_admin: false }]);
  if (error) throw error;
  // 注册成功，自动登录
  await login(email, password);
}

// 退出
function logout() {
  localStorage.removeItem('currentUser');
  window.AuthState.user = null;
}

// 初始化
restoreSession();

// 暴露给全局
window.AuthActions = { login, register, logout, supabase };
