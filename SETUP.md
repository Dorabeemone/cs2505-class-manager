我来帮你把系统改为**自建用户表，直接验证用户名密码**的方式，完全弃用 Supabase Auth，登录状态用 `localStorage` 保存，跨页面共享。

> ⚠️ **安全提醒**：为降低复杂度，本方案采用**密码明文存储**，仅适合班级内部信任环境。若需更高安全性，可用 `bcrypt` 等库在前端哈希后再存储，但会增加代码量。请勿在公网使用此方案。

---

## 一、数据库修改（在 Supabase SQL Editor 执行一次）

```sql
-- 1. 删除旧的 auth 相关 RLS 策略（如果存在）
DROP POLICY IF EXISTS "任何人可读" ON tasks;
DROP POLICY IF EXISTS "管理员可插入" ON tasks;
DROP POLICY IF EXISTS "管理员可更新" ON tasks;
DROP POLICY IF EXISTS "管理员可删除" ON tasks;
-- 同样删除 recruitments, announcements 上的旧策略...

-- 2. 创建自定义 users 表
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,          -- 登录邮箱
  password TEXT NOT NULL,              -- 明文存储（仅限内部使用）
  is_admin BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 给 users 表启用 RLS，并允许所有操作（因为我们不再用 Supabase Auth，RLS 无法获取 uid，所以完全开放）
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "开放所有操作" ON users FOR ALL USING (true);

-- 4. 重新设置 tasks 等表的 RLS 策略为完全开放（因为不用 auth.uid() 了）
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "开放所有操作" ON tasks FOR ALL USING (true);

ALTER TABLE recruitments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "开放所有操作" ON recruitments FOR ALL USING (true);

ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "开放所有操作" ON announcements FOR ALL USING (true);

-- 5. 插入一个管理员账号（邮箱/密码自定）
INSERT INTO users (email, password, is_admin) 
VALUES ('admin@class.com', 'admin123', true)
ON CONFLICT (email) DO NOTHING;
```

执行后，你就有了一个管理员账号：`admin@class.com` / `admin123`。密码可自行修改。

---

## 二、创建共享认证模块 `js/auth.js`

新建 `js/auth.js`，负责初始化 Supabase 客户端和全局登录状态管理。

```javascript
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
```

---

## 三、修改 `ddl.html`（DDL 查看页面）

替换为以下完整代码，包含注册/登录/退出，并记录完成者邮箱。

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=yes">
  <title>DDL 任务 - CS2505</title>
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
  <link rel="stylesheet" href="https://unpkg.com/element-plus/dist/index.css">
  <script src="https://unpkg.com/element-plus"></script>
  <script src="js/auth.js"></script>
  <style>
    body { margin:0; font-family:'PingFang SC','Microsoft YaHei',sans-serif; background:linear-gradient(135deg,#f5f7fa,#c3cfe2); min-height:100vh; }
    #app { max-width:1000px; margin:0 auto; padding:20px; }
    .main-title { text-align:center; font-size:2rem; font-weight:700; color:#667eea; margin:20px 0; }
    .auth-bar { display:flex; justify-content:flex-end; align-items:center; gap:10px; margin-bottom:15px; }
    .view-switch { text-align:center; margin-bottom:20px; }
    .task-completed { opacity:0.5; text-decoration:line-through; }
    .back-link { display:block; text-align:center; margin-top:20px; color:#666; }
  </style>
</head>
<body>
  <div id="app">
    <h1 class="main-title">📌 DDL 任务列表</h1>

    <!-- 认证状态栏 -->
    <div class="auth-bar">
      <template v-if="AuthState.user">
        <span>👤 {{ AuthState.user.email }}</span>
        <el-button size="small" @click="logout">退出</el-button>
      </template>
      <template v-else>
        <el-button size="small" type="primary" @click="showAuthDialog = true">登录 / 注册</el-button>
      </template>
    </div>

    <!-- 登录/注册对话框 -->
    <el-dialog v-model="showAuthDialog" title="登录或注册" width="90%" style="max-width:400px;">
      <el-tabs v-model="authTab">
        <el-tab-pane label="登录" name="login">
          <el-form :model="authForm">
            <el-form-item><el-input v-model="authForm.email" placeholder="邮箱" /></el-form-item>
            <el-form-item><el-input v-model="authForm.password" type="password" placeholder="密码" show-password /></el-form-item>
            <el-button type="primary" @click="handleLogin" :loading="authLoading" style="width:100%;">登录</el-button>
          </el-form>
        </el-tab-pane>
        <el-tab-pane label="注册" name="register">
          <el-form :model="authForm">
            <el-form-item><el-input v-model="authForm.email" placeholder="邮箱" /></el-form-item>
            <el-form-item><el-input v-model="authForm.password" type="password" placeholder="密码（至少6位）" show-password /></el-form-item>
            <el-button type="success" @click="handleRegister" :loading="authLoading" style="width:100%;">注册并登录</el-button>
          </el-form>
        </el-tab-pane>
      </el-tabs>
      <div v-if="authError" style="color:red; margin-top:10px;">{{ authError }}</div>
    </el-dialog>

    <!-- 视图切换 -->
    <div class="view-switch">
      <el-radio-group v-model="view" size="small">
        <el-radio-button label="list">列表</el-radio-button>
        <el-radio-button label="board">看板</el-radio-button>
        <el-radio-button label="timeline">时间线</el-radio-button>
        <el-radio-button label="calendar">日历</el-radio-button>
      </el-radio-group>
    </div>

    <!-- 列表视图 -->
    <div v-if="view==='list'">
      <div v-for="task in tasks" :key="task.id" style="display:flex; justify-content:space-between; align-items:center; background:white; padding:12px; margin:8px 0; border-radius:12px;" :class="{ 'task-completed': task.completed }">
        <div style="flex:1;">
          <strong>{{ task.title }}</strong>
          <span style="margin-left:10px; color:#888;">[{{ task.category }}]</span>
          <br><small>📅 {{ task.deadline ? new Date(task.deadline).toLocaleDateString() : '无' }} 👤 {{ task.assignee }}</small>
          <small v-if="task.completed_by_email" style="color:green;"> ✔ 完成者：{{ task.completed_by_email }} {{ task.completed_at ? new Date(task.completed_at).toLocaleString() : '' }}</small>
        </div>
        <el-button size="small" @click="markComplete(task)" :type="task.completed ? 'info' : 'success'" :disabled="!AuthState.user">
          {{ task.completed ? '已完成' : '完成' }}
        </el-button>
      </div>
    </div>

    <!-- 看板视图（略）-->
    <!-- 时间线视图（略）-->
    <!-- 日历视图（略）-->

    <a href="index.html" class="back-link">← 返回主页</a>
  </div>

  <script>
    const { createApp, ref, onMounted } = Vue;
    const app = createApp({
      setup() {
        const { supabase } = window.AuthActions; // 获取 supabase 客户端
        const AuthState = window.AuthState;
        const view = ref('list');
        const tasks = ref([]);
        const categories = ['学习','班团会','党团','其他'];

        // 登录/注册相关
        const showAuthDialog = ref(false);
        const authTab = ref('login');
        const authForm = ref({ email: '', password: '' });
        const authLoading = ref(false);
        const authError = ref('');

        const fetchTasks = async () => {
          const { data } = await supabase.from('tasks').select('*').order('deadline',{ascending:true});
          if(data) tasks.value = data;
        };

        // 完成/取消完成
        const markComplete = async (task) => {
          if (!AuthState.user) {
            showAuthDialog.value = true;
            return;
          }
          const newCompleted = !task.completed;
          const updateData = {
            completed: newCompleted,
            completed_by_email: newCompleted ? AuthState.user.email : null,
            completed_at: newCompleted ? new Date().toISOString() : null
          };
          const { error } = await supabase.from('tasks').update(updateData).eq('id', task.id);
          if (error) alert('操作失败：' + error.message);
          else fetchTasks();
        };

        const handleLogin = async () => {
          authLoading.value = true;
          authError.value = '';
          try {
            await window.AuthActions.login(authForm.value.email, authForm.value.password);
            showAuthDialog.value = false;
            authForm.value = { email: '', password: '' };
          } catch (e) {
            authError.value = e.message;
          } finally {
            authLoading.value = false;
          }
        };

        const handleRegister = async () => {
          authLoading.value = true;
          authError.value = '';
          try {
            await window.AuthActions.register(authForm.value.email, authForm.value.password);
            showAuthDialog.value = false;
            authForm.value = { email: '', password: '' };
          } catch (e) {
            authError.value = e.message;
          } finally {
            authLoading.value = false;
          }
        };

        const logout = () => {
          window.AuthActions.logout();
        };

        onMounted(fetchTasks);

        return {
          AuthState, view, tasks, categories,
          showAuthDialog, authTab, authForm, authLoading, authError,
          fetchTasks, markComplete, handleLogin, handleRegister, logout
        };
      }
    });
    app.use(ElementPlus);
    app.mount('#app');
  </script>
</body>
</html>
```

---

## 四、修改 `admin.html`（管理后台）

替换为以下代码，移除了硬编码密码，改用自建用户表的 `is_admin` 字段鉴权。

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>管理后台 - CS2505</title>
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
  <link rel="stylesheet" href="https://unpkg.com/element-plus/dist/index.css">
  <script src="https://unpkg.com/element-plus"></script>
  <script src="js/auth.js"></script>
  <style>
    body { margin:0; font-family:'PingFang SC','Microsoft YaHei',sans-serif; background:#f5f7fa; }
    #app { max-width:800px; margin:0 auto; padding:20px; }
    .login-box { text-align:center; margin-top:80px; }
    .section { margin:30px 0; }
  </style>
</head>
<body>
  <div id="app">
    <!-- 未登录 -->
    <div v-if="!AuthState.user" class="login-box">
      <h2>🔐 管理员登录</h2>
      <el-input v-model="loginEmail" placeholder="邮箱" style="width:250px; display:block; margin:10px auto;"></el-input>
      <el-input v-model="loginPwd" type="password" show-password placeholder="密码" style="width:250px; display:block; margin:10px auto;"></el-input>
      <el-button type="primary" @click="adminLogin" :loading="loading">登录</el-button>
      <p v-if="loginError" style="color:red;">{{ loginError }}</p>
    </div>

    <!-- 已登录但非管理员 -->
    <div v-else-if="!AuthState.user.is_admin" style="text-align:center; margin-top:80px;">
      <h2>⛔ 权限不足</h2>
      <p>当前账号不是管理员，请联系管理员授权。</p>
      <el-button @click="logout">退出</el-button>
    </div>

    <!-- 管理员界面 -->
    <div v-else>
      <h1>⚙️ 管理后台</h1>
      <p>当前管理员：{{ AuthState.user.email }} <el-button size="small" @click="logout">退出</el-button></p>

      <!-- DDL 管理（同之前，调用 supabase 进行 CRUD） -->
      <!-- 信息库、公示管理同上，略 -->
    </div>
  </div>

  <script>
    const { createApp, ref } = Vue;
    const app = createApp({
      setup() {
        const AuthState = window.AuthState;
        const { supabase, login, logout } = window.AuthActions;

        const loginEmail = ref('');
        const loginPwd = ref('');
        const loading = ref(false);
        const loginError = ref('');

        // 管理数据（DDL、招募、公示）
        const tasks = ref([]);
        const recruits = ref([]);
        const announcements = ref([]);
        // ... 添加、删除等函数，与之前 admin.html 类似，直接使用 supabase 操作

        const adminLogin = async () => {
          loading.value = true;
          loginError.value = '';
          try {
            const user = await login(loginEmail.value, loginPwd.value);
            if (!user.is_admin) {
              // 如果登录成功但不是管理员，强制退出
              logout();
              loginError.value = '该账号不是管理员';
            }
          } catch (e) {
            loginError.value = e.message;
          } finally {
            loading.value = false;
          }
        };

        return {
          AuthState,
          loginEmail, loginPwd, loading, loginError,
          adminLogin, logout,
          // ... 暴露数据和方法
        };
      }
    });
    app.use(ElementPlus);
    app.mount('#app');
  </script>
</body>
</html>
```

> 管理面板中的 CRUD 功能与之前版本类似，只需把原来的 `supabase` 变量换成从 `window.AuthActions.supabase` 获取即可，这里不再重复粘贴完整的表单代码，你可以把之前 `admin.html` 中的管理功能搬过来。

---

## 五、其他页面简单调整

- **`index.html`**：在导航栏下方添加登录状态显示，复制 `ddl.html` 中的 `.auth-bar` 部分即可。
- **`recruit.html` / `announce.html`**：仅查看，可以不强制登录，但也可以加上状态栏，方法相同。

所有页面都需要在 `<head>` 中引入 `js/auth.js`，并且使用 `window.AuthState.user` 判断登录状态。

---

## 六、使用流程总结

1. **首次使用**：在 Supabase SQL Editor 运行第一部分 SQL，创建 `users` 表并插入管理员。
2. **部署代码**：把所有 HTML 和 `js/auth.js` 上传到 GitHub Pages。
3. **同学注册**：访问 `ddl.html` 点击“登录 / 注册” → 注册标签 → 输入邮箱密码 → 自动登录。
4. **标记完成**：登录后点击“完成”按钮，完成者邮箱会被记录。
5. **管理后台**：用管理员邮箱 `admin@class.com` 和密码 `admin123` 登录 `admin.html`，进入管理面板。

这样你就拥有了一个完全自己控制用户系统的班级任务管理器，无需依赖 Supabase Auth。如果需要修改管理员邮箱或密码，直接在 Supabase 的 `users` 表中修改即可。