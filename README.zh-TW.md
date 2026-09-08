# LeetCode Practice

*[English](README.md) · 繁體中文*

在 VS Code 裡練 LeetCode 的擴充套件，為**間隔複習**設計：題目資料夾帶題號，
方便搭配 [archive.py / search.py](https://github.com/MyTeamAce/leetcode) 那套流程歸檔與撈出該複習的題。

> 這是從零重寫的專案，不是任何既有擴充套件的 fork。
> 靈感來自 [Ayanrocks/better-leetcode](https://github.com/Ayanrocks/better-leetcode)，
> 但沒有沿用它的程式碼。

## 目前功能

### 登入

側邊欄或狀態列點擊，有兩種方式：

- **在瀏覽器授權** — 開啟 LeetCode，它會把 session 直接交回 VS Code，不用複製任何東西
- **貼上 cookie** — 從瀏覽器 DevTools 複製 Cookie 標頭

憑證存在 VS Code 的 secret storage（綁擴充套件 id，不會落到設定檔），
**存之前會先向 LeetCode 驗證一次**，貼錯或過期當下就知道。

瀏覽器授權是把 session 放在網址裡交回來的，所以回呼只在三個條件同時成立時才接受：
這裡發起的授權還在有效期內（五分鐘）、位址是這個擴充套件、而且只接受一次。
否則任何一個連結都能塞一份別人的 session 進來。

### 側邊欄

- **Daily Challenge** — 今天的每日挑戰題，一列
- **Problems** — 全題庫 4,000 多題，可搜尋。清單快取在磁碟，超過 7 天才在背景重抓；
  未搜尋時只列前 500 題（四千列沒人會滑，搜尋才是入口）。
  搜尋純數字時比對題號前綴，所以打 `17` 會看到 17、170、171… 而不是被 1700 系列淹沒

### 圖示：顏色帶難度，形狀帶進度

一個圖示同時回答「多難」和「我做過了嗎」：

| 狀態 | 圖示 | 顏色 |
| --- | --- | --- |
| 沒碰過 | 空心圓 | 綠 Easy / 黃 Medium / 紅 Hard |
| 試過沒過 | 實心圓 | 同上 |
| 已解出 | 打勾圓 | 同上 |
| 付費題 | 鎖頭 | 同上 |

顏色用 VS Code 的 `charts.green` / `yellow` / `red`，跟著你的主題走，不寫死色碼。

### 點題目

在 `storagePath` 底下建 `<題號>-<titleSlug>/`（例如 `3028-ant-on-the-boundary/`）：

```
3028-ant-on-the-boundary/
├─ main.py           # LeetCode 的模板
├─ testcases.txt     # 全部範例測資
└─ .metadata.json    # 題號、內部 id、語言、一組測資佔幾行
```

程式碼開在編輯器，題目說明開在旁邊的面板（不搶焦點，游標直接落在編輯器）。

- **重開同一題不會覆蓋你寫過的東西** — 既有的 `main.*` 與 `testcases.txt` 一律保留
- Python 模板會補上**它自己真正用到的** typing 匯入。LeetCode 給的模板寫
  `def twoSum(self, nums: List[int])` 但沒有 import，直接在本機跑會 `NameError`；
  補的只有模板提到的名字（`two-sum` 只補 `List`、`add-two-numbers` 只補 `Optional`），
  不是一包「可能會用到」的清單
- 題目說明面板不載入任何 script，CSP 只允許行內樣式與遠端圖片

### 測試與提交

開著解題檔時，`Ctrl+;` 拿 `testcases.txt` 的測資跑一次、`Ctrl+Enter` 正式提交，
兩個也都在編輯器標題列有按鈕。結果顯示在旁邊的面板：判定、時間記憶體、
每組測資與預期輸出並排、以及編譯或執行期錯誤。提交會先問一次，因為那會記在你的帳號上。

語言看**檔案本身的副檔名**，不是資料夾的 metadata —— 同一題可以同時有 `main.py`
和 `main.rs`，你在哪個檔案按提交就送那個語言。

**關於 Cloudflare**：判題端點有機器人防護，它在讀任何標頭之前先驗 TLS 指紋 ——
實測 `interpret_solution`、`submit`、`check` 三個端點，用 Node 自己的 HTTP 堆疊
（不管有沒有加瀏覽器標頭）全部回 403 加 `cf-mitigated: challenge`。
所以這三個請求走 [impit](https://github.com/apify/impit)，它以 Chrome 的方式完成握手，
同樣的端點就會由 LeetCode 自己回應。impit 是原生模組，所以 VSIX 是分平台的。

## 設定

| 設定 | 說明 |
| --- | --- |
| `leetcodePractice.storagePath` | 題目資料夾建在哪。留空則用第一個 workspace 資料夾底下的 `solutions/` |
| `leetcodePractice.defaultLanguage` | 開題時用哪個語言的模板（`python3`、`cpp`、`rust`…） |

## 還沒做

- [ ] 每題語言切換
- [ ] Study Lists、Contests
- [ ] 討論區

## 開發

```bash
bun install
```

```bash
bun run compile
```

F5 啟動 Extension Development Host（預設帶 `--disable-extensions`，
只跑這一支，避免其他擴充套件的雜訊與崩潰）。

```bash
bun run typecheck
```

```bash
bun run lint
```

慣例與已知的 LeetCode API 行為記在 [CLAUDE.md](CLAUDE.md)。

## 授權

MIT，見 [LICENSE](LICENSE)。
