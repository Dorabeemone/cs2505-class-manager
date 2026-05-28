# Supabase 数据库设置指南

运行以下步骤以启用用户账号系统和修复操作报错。

## 步骤 1：启用 Email Auth

1. 打开 Supabase Dashboard：https://supabase.com/dashboard
2. 选择项目 `brqrrzvrgtvuqjnragfp`
3. 左侧菜单 → **Authentication** → **Providers**
4. 找到 **Email** 提供者，确保已启用（Enabled）
5. 建议关闭 **Confirm email**（课堂使用场景），保存设置

## 步骤 2：执行 SQL

1. 左侧菜单 → **SQL Editor**
2. 点击 **New query**
3. 粘贴下方 SQL，点击 **Run**

```sql
-- ===== 1. 创建 user_roles 表 =====
CREATE TABLE IF NOT EXISTS user_roles (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, role)
);

-- ===== 2. tasks 表增加完成者字段 =====
ALTER TABLE tasks 
ADD COLUMN IF NOT EXISTS completed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS completed_by_email TEXT;

-- ===== 3. 创建标记完成 RPC 函数 =====
CREATE OR REPLACE FUNCTION toggle_task_complete(p_task_id BIGINT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_current BOOLEAN;
  v_current_by UUID;
  v_uid UUID;
  v_email TEXT;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', '请先登录');
  END IF;
  
  v_email := (SELECT email FROM auth.users WHERE id = v_uid);
  
  SELECT completed, completed_by INTO v_current, v_current_by 
  FROM tasks WHERE id = p_task_id;
  
  IF v_current IS NULL THEN
    RETURN jsonb_build_object('error', '任务不存在');
  END IF;
  
  IF v_current THEN
    -- 撤销完成：仅管理员或原完成者可撤销
    IF v_uid IN (SELECT user_id FROM user_roles WHERE role = 'admin')
       OR v_uid = v_current_by THEN
      UPDATE tasks 
      SET completed = false, completed_by = NULL, completed_at = NULL, completed_by_email = NULL
      WHERE id = p_task_id;
      RETURN jsonb_build_object('success', true, 'action', 'unmarked');
    ELSE
      RETURN jsonb_build_object('error', '仅管理员或完成者可撤销标记');
    END IF;
  ELSE
    -- 标记完成：任何已登录用户
    UPDATE tasks 
    SET completed = true, completed_by = v_uid, completed_at = NOW(), completed_by_email = v_email
    WHERE id = p_task_id;
    RETURN jsonb_build_object('success', true, 'action', 'completed', 'completed_by_email', v_email);
  END IF;
END;
$$;

-- ===== 4. 启用所有表的 RLS =====
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE recruitments ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- ===== 5. tasks 表 RLS 策略 =====
DROP POLICY IF EXISTS "任何人可读任务" ON tasks;
CREATE POLICY "任何人可读任务" ON tasks FOR SELECT USING (true);

DROP POLICY IF EXISTS "管理员可插入任务" ON tasks;
CREATE POLICY "管理员可插入任务" ON tasks FOR INSERT 
  WITH CHECK (auth.uid() IN (SELECT user_id FROM user_roles WHERE role = 'admin'));

DROP POLICY IF EXISTS "管理员可更新任务" ON tasks;
CREATE POLICY "管理员可更新任务" ON tasks FOR UPDATE 
  USING (auth.uid() IN (SELECT user_id FROM user_roles WHERE role = 'admin'));

DROP POLICY IF EXISTS "管理员可删除任务" ON tasks;
CREATE POLICY "管理员可删除任务" ON tasks FOR DELETE 
  USING (auth.uid() IN (SELECT user_id FROM user_roles WHERE role = 'admin'));

-- ===== 6. recruitments 表 RLS 策略 =====
DROP POLICY IF EXISTS "任何人可读招募" ON recruitments;
CREATE POLICY "任何人可读招募" ON recruitments FOR SELECT USING (true);

DROP POLICY IF EXISTS "管理员可插入招募" ON recruitments;
CREATE POLICY "管理员可插入招募" ON recruitments FOR INSERT 
  WITH CHECK (auth.uid() IN (SELECT user_id FROM user_roles WHERE role = 'admin'));

DROP POLICY IF EXISTS "管理员可更新招募" ON recruitments;
CREATE POLICY "管理员可更新招募" ON recruitments FOR UPDATE 
  USING (auth.uid() IN (SELECT user_id FROM user_roles WHERE role = 'admin'));

DROP POLICY IF EXISTS "管理员可删除招募" ON recruitments;
CREATE POLICY "管理员可删除招募" ON recruitments FOR DELETE 
  USING (auth.uid() IN (SELECT user_id FROM user_roles WHERE role = 'admin'));

-- ===== 7. announcements 表 RLS 策略 =====
DROP POLICY IF EXISTS "任何人可读公告" ON announcements;
CREATE POLICY "任何人可读公告" ON announcements FOR SELECT USING (true);

DROP POLICY IF EXISTS "管理员可插入公告" ON announcements;
CREATE POLICY "管理员可插入公告" ON announcements FOR INSERT 
  WITH CHECK (auth.uid() IN (SELECT user_id FROM user_roles WHERE role = 'admin'));

DROP POLICY IF EXISTS "管理员可更新公告" ON announcements;
CREATE POLICY "管理员可更新公告" ON announcements FOR UPDATE 
  USING (auth.uid() IN (SELECT user_id FROM user_roles WHERE role = 'admin'));

DROP POLICY IF EXISTS "管理员可删除公告" ON announcements;
CREATE POLICY "管理员可删除公告" ON announcements FOR DELETE 
  USING (auth.uid() IN (SELECT user_id FROM user_roles WHERE role = 'admin'));

-- ===== 8. user_roles 表 RLS 策略 =====
DROP POLICY IF EXISTS "管理员可读所有角色" ON user_roles;
CREATE POLICY "管理员可读所有角色" ON user_roles FOR SELECT 
  USING (auth.uid() IN (SELECT user_id FROM user_roles WHERE role = 'admin'));

DROP POLICY IF EXISTS "用户可读自己角色" ON user_roles;
CREATE POLICY "用户可读自己角色" ON user_roles FOR SELECT 
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "管理员可插入角色" ON user_roles;
CREATE POLICY "管理员可插入角色" ON user_roles FOR INSERT 
  WITH CHECK (auth.uid() IN (SELECT user_id FROM user_roles WHERE role = 'admin'));

DROP POLICY IF EXISTS "管理员可删除角色" ON user_roles;
CREATE POLICY "管理员可删除角色" ON user_roles FOR DELETE 
  USING (auth.uid() IN (SELECT user_id FROM user_roles WHERE role = 'admin'));
```

## 步骤 3：设置管理员

1. 在网站上注册一个账号（打开任意页面 → 登录 → 注册）
2. 在 SQL Editor 中执行以下语句（替换为你的邮箱）：

```sql
INSERT INTO user_roles (user_id, role) 
SELECT id, 'admin' FROM auth.users WHERE email = '你的邮箱@example.com';
```

3. 刷新页面，即可看到管理后台入口

## 权限说明

| 操作 | 未登录用户 | 普通用户 | 管理员 |
|------|-----------|---------|--------|
| 查看任务/招募/公示 | ✅ | ✅ | ✅ |
| 标记任务完成 | ❌ | ✅ | ✅ |
| 撤销自己的完成 | ❌ | ✅ | ✅ |
| 撤销他人的完成 | ❌ | ❌ | ✅ |
| 创建/编辑/删除任务 | ❌ | ❌ | ✅ |
| 发布/删除招募 | ❌ | ❌ | ✅ |
| 发布/删除公示 | ❌ | ❌ | ✅ |
| 授予管理员权限 | ❌ | ❌ | ✅ |
