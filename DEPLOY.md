# 岐黃學堂 - Railway 部署指南

## 前置準備

1. 一個 [GitHub](https://github.com) 帳號
2. 一個 [Railway](https://railway.app) 帳號（用 GitHub 登入即可）
3. 一個 Anthropic API Key（用於 AI 題目生成）：[https://console.anthropic.com](https://console.anthropic.com)

## 步驟一：上傳程式碼到 GitHub

1. 在 GitHub 建立一個新的 private repository（如 `tcm-study`）
2. 將整個專案推送到 GitHub：

```bash
cd tcm-study
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/你的用戶名/tcm-study.git
git push -u origin main
```

## 步驟二：在 Railway 部署

1. 打開 [railway.app](https://railway.app)，用 GitHub 帳號登入
2. 點擊 **New Project** → **Deploy from GitHub Repo**
3. 選擇你剛創建的 `tcm-study` repo
4. Railway 會自動檢測到 Dockerfile 並開始構建

## 步驟三：設置環境變量

在 Railway 的 service 設定中，添加以下環境變量：

| 變量名 | 值 | 說明 |
|--------|------|------|
| `KIMI_API_KEY` | `sk-...` | 你的 Kimi API Key（從 platform.moonshot.ai 獲取） |
| `PORT` | `5000` | 伺服器端口（Railway 通常自動設定） |
| `NODE_ENV` | `production` | 生產環境 |

## 步驟四：生成公開網址

1. 在 Railway service 的 **Settings** → **Networking** 區域
2. 點擊 **Generate Domain**
3. 你會得到一個類似 `tcm-study-production.up.railway.app` 的網址
4. 如果你有自己的域名，也可以設定 Custom Domain

## 步驟五：添加持久化儲存（重要）

Railway 的容器預設不保留檔案。你需要添加 Volume：

1. 在 service 設定中，找到 **Volumes** 區域
2. 添加一個 Volume：
   - Mount Path: `/app/uploads`（儲存上傳的 PDF）
3. 再添加一個 Volume：
   - Mount Path: `/app/data.db`（儲存 SQLite 資料庫）

> ⚠️ 不加 Volume 的話，每次重新部署都會丟失上傳的檔案和題庫資料。

## 完成

部署完成後，你和同學都可以用該網址訪問學習平台。

## 費用預估

Railway 免費計劃提供每月 $5 USD 的額度：
- 對於個人使用（每天學習幾十分鐘）完全足夠
- 如果多人同時使用，可能需要 Hobby Plan（$5/月）

## 更新部署

每次你推送代碼到 GitHub main branch，Railway 會自動重新部署：

```bash
git add .
git commit -m "Update"
git push
```
