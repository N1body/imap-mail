# IMAP Mail Manager

一个现代化的 IMAP 邮件管理应用，基于 Next.js 构建。

## 功能特性

- 🔐 管理员密码登录保护
- 📧 多账户 IMAP 邮件管理
- 📁 文件夹浏览和邮件列表
- 📥 批量导入账户
- 🎨 现代深色主题 UI

## 本地开发

1. 安装依赖：

```bash
npm install
```

2. 创建 `.env.local` 文件并设置管理员密码：

```bash
ADMIN_PASSWORD=your_secure_password
```

3. 启动开发服务器：

```bash
npm run dev
```

4. 访问 [http://localhost:3000](http://localhost:3000)

## 部署到 Vercel

1. 将项目推送到 GitHub
2. 在 [Vercel](https://vercel.com) 导入项目
3. 在 Vercel 项目设置中添加环境变量：

   - `ADMIN_PASSWORD`: 你的管理员登录密码

4. 部署完成后访问你的域名

## 环境变量

| 变量名           | 必填 | 说明           |
| ---------------- | ---- | -------------- |
| `ADMIN_PASSWORD` | ✅   | 管理员登录密码 |
