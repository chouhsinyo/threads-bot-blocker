# 規則包（Rule packs）

規則包是**純 JSON 資料**，用來描述「什麼樣的回覆或帳號看起來像機器人」。
它不含程式碼、也不支援正規表示式，所以匯入陌生人提供的規則包不會執行任何東西。

## 格式

```json
{
  "id": "my-pack",
  "name": "顯示名稱",
  "version": "1",
  "description": "這個規則包在抓什麼、為什麼",
  "source": "https://…（整體來源，選填）",
  "rules": [
    { "type": "keyword", "value": "加賴", "weight": 25, "reason": "常見導流話術", "source": "https://…" }
  ]
}
```

| 欄位 | 說明 |
| --- | --- |
| `id` | 必填。小寫英文、數字、連字號。同名時，使用者匯入的會取代內建的。 |
| `rules` | 必填。最多 500 條。 |
| `rules[].type` | `keyword`、`domain`、`username_contains`、`username_prefix`、`username_digits` |
| `rules[].value` | 比對值，不分大小寫。`username_digits` 是整數，代表帳號中連續數字的最少位數。 |
| `rules[].weight` | 1–60，命中時加到「機器人分數」。 |
| `rules[].reason` | 顯示在審核畫面上的判斷理由，請寫清楚。 |
| `rules[].source` | 這條規則的證據或來源網址。 |

### 規則類型

- `keyword`：回覆內容包含這段文字
- `domain`：回覆內容含這個網域（`spam.com` 不會誤中 `notspam.com`）
- `username_contains` / `username_prefix`：帳號 handle 包含 / 開頭為
- `username_digits`：帳號 handle 含 N 位以上連續數字

## 投稿守則

1. **每條規則附證據**（`source`），說明為什麼這個特徵代表機器人。
2. **權重要保守。** 單一特徵（例如常見名字的拼音）可能誤中真人，請給低分，讓它只影響待審排序。
3. **不要收錄個別真人帳號。** 規則包描述的是「特徵」，不是「誰」。確認屬於協同假帳號網路的帳號，請走黑名單或向平台檢舉。
4. 不要放個資、不要放未經證實的指控。
5. 用 `npm test` 確認 JSON 通過驗證。

## 使用

後台「規則包」分頁：貼上 JSON 或輸入 https 網址即可匯入，可隨時停用或移除。
