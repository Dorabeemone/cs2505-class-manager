# CS2505 班级主页 — 维护记录

> GitHub Pages: https://dorabeemone.github.io/cs2505-class-manager/
> 仓库: https://github.com/Dorabeemone/cs2505-class-manager
> Supabase: https://brqrrzvrgtvuqjnragfp.supabase.co

---

## 架构概览

- **认证**: 自建 `users` 表（明文密码），`localStorage` 存登录状态，全局 `window.AuthState` 共享
- **前端**: Vue 3 (全局脚本) + Element Plus + Supabase JS 客户端
- **CDN**: **必须用 unpkg.com**（jsDelivr 在中国被阻断）
- **管理员**: `admin@class.com` / `admin123`

### 文件职责

| 文件 | 用途 |
|------|------|
| `index.html` | 主页导航 |
| `login.html` | 登录/注册（自包含，不依赖 auth.js） |
| `ddl.html` | DDL 任务列表（列表/看板/时间线/日历） |
| `recruit.html` | 信息库（招募信息） |
| `announce.html` | 班级公示 |
| `admin.html` | 管理后台（需管理员权限） |
| `js/auth.js` | 共享认证模块（login.html 不用它） |

---

## 已修复的所有 Bugs

### Bug 1: 注册和登录失败
- **现象**: 输入正确邮箱密码也无法登录，注册总是报"注册失败"
- **根因**: `auth.js` 使用 Supabase `.maybeSingle()` 查询 users 表，查询空结果时 Supabase 返回 PGRST116 (HTTP 406) 错误，被当作真正的 error 抛出
- **修复**: 改用 `.select()` 返回数组 + `.length > 0` 判断

### Bug 2: 登录页没有密码输入框和选项卡
- **现象**: 浏览器打开 login.html 看不到登录/注册选项卡，也没有密码输入框
- **根因**: 
  1. `el-input` 密码字段缺少 `type="password"`，Element Plus 默认渲染为 `type="text"`，`show-password` 属性不生效
  2. 非 scoped 样式中使用 `:deep()` 伪选择器——这是 Vue scoped 专用语法，普通 CSS 中无效，浏览器直接丢弃整条规则
- **修复**: 加上 `type="password"`，移除所有 `:deep()`

### Bug 3: 登录页开放重定向漏洞
- **现象**: `?redirect=` 参数未校验，可跳转到任意外部网站
- **修复**: 白名单校验 redirect 参数，只允许已知页面

### Bug 4: 管理后台页面闪烁
- **现象**: 未登录用户访问 admin.html 先看到锁屏界面再跳转登录
- **根因**: `ready.value = true` 在权限检查前就被设置
- **修复**: 将 `ready` 设置移至认证检查之后

### Bug 5: DDL 时间线已完成任务显示错误
- **现象**: 已完成任务在时间线中显示"已过期 X 天"，时间点显示红色，而非"已完成"绿色
- **根因**: `relText()` 和 `relClass()` 函数未检查 `t.completed`
- **修复**: 增加 `t.completed` 判断，返回 `'已完成'` 和 CSS class `done`

### Bug 6: CDN 阻断导致网站完全无法访问
- **现象**: 浏览器显示"似乎关闭了链接"
- **根因**: 错误地将 CDN 从 unpkg.com 换成了 cdn.jsdelivr.net，后者在中国被阻断
- **修复**: 恢复使用 unpkg.com

---

## 当前已知状态（2026-05-30）

- **所有 6 个页面** CDN 使用 `unpkg.com`
  ```html
  <script src="https://unpkg.com/@supabase/supabase-js@2"></script>
  <script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
  <link rel="stylesheet" href="https://unpkg.com/element-plus/dist/index.css">
  <script src="https://unpkg.com/element-plus"></script>
  ```
- **login.html** 是自包含的，不依赖 `js/auth.js`
- **其他页面** 加载 `js/auth.js` 获取共享认证状态
- **admin.html** 的 CSS 已修复（移除了无效 `:deep()`）
- **ddl.html** 的时间线视图已完成任务显示正确

---

## 数据库（Supabase）

- users 表: `id`, `email`, `password`(明文), `is_admin`, `created_at`
- tasks 表: `id`, `title`, `category`, `deadline`, `assignee`, `notes`, `completed`, `completed_by_email`, `completed_at`
- recruitments 表: `id`, `title`, `type`, `description`, `contact`, `created_at`
- announcements 表: `id`, `title`, `activity_date`, `description`, `article_url`, `created_at`
- 所有表 RLS: `FOR ALL USING (true)`（完全开放）

---

## 修复提交历史

```
ffa3602 fix: 切换CDN从jsDelivr回unpkg以恢复中国访问
f754323 fix: 重写登录页面并切换所有CDN至jsDelivr  ← 这个导致网站崩溃
90e1d0e fix: 修复密码输入框未渲染为密码类型的核心缺陷
b9cc84d fix: 修复账号系统注册和登录失败的核心缺陷
c4ada08 fix: 修复严重安全漏洞和关键UI缺陷
ac2dd3f 修复JS错误并全面提升界面美观性
ff6daf3 将登录/注册页面独立为login.html
be65cc8 迁移至自建用户表认证系统，弃用Supabase Auth
```
