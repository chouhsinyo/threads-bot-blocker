# Threads Bot Blocker

偵測你 Threads 貼文底下的機器人／垃圾回覆，自動隱藏或送進待審清單，並在本機網頁後台一鍵處理。

> **限制**：Threads 官方 API 沒有「封鎖使用者」端點，只能對你自己貼文底下的回覆做「隱藏 / 取消隱藏」。
> 所以本工具的「封鎖」= 自動隱藏 + 整理黑名單，並提供個人頁連結讓你在 Threads 內一鍵手動封鎖。

## 功能

- **三種判斷合併計分（0–100）**：黑白名單、規則（連結、關鍵字、重複內容、短時間連發、帳號名稱特徵）、AI（選用）
- **試跑模式**（預設）：只標記不動作；確認準確後再開啟自動隱藏
- **待審佇列**：高分／中分回覆列出判斷理由，可批次隱藏、保留（並加入白名單）、加入黑名單
- **黑名單**：加入後會隱藏該帳號所有回覆，並列出個人頁連結供你在 Threads 內手動封鎖
- **操作紀錄**與**取消隱藏**（誤判可復原）

## 安裝與執行

需要 Node.js 18 以上，無任何第三方套件。

```bash
cp .env.example .env     # Windows PowerShell：Copy-Item .env.example .env
npm start
```

打開 http://localhost:3000 。

## 取得 Threads 存取權杖

1. 到 [Meta 開發者後台](https://developers.facebook.com/apps) 建立 App，選 Threads 用途。
2. 權限：`threads_basic`、`threads_read_replies`、`threads_manage_replies`。
3. 把自己的帳號加為 Threads 測試者並接受邀請，產生長期存取權杖。
4. 填入 `.env` 的 `THREADS_ACCESS_TOKEN`。

`.env` 與 `data/` 已在 `.gitignore`，不會被提交。

## 選用：AI 判斷

在 `.env` 填入 `ANTHROPIC_API_KEY`，分數介於 20 與自動隱藏門檻之間的回覆會交給 AI 複判，並顯示理由。

## 安全

- 伺服器只綁定 `127.0.0.1`，並檢查 Host／Origin，防止其他網站對它發請求。
- 回覆內容一律以純文字顯示，不會執行其中的 HTML／腳本。

## 測試

```bash
npm test
```
