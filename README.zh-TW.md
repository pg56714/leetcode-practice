# LeetCode Practice

*[English](README.md) · 繁體中文*

在 VS Code 裡練 LeetCode 的擴充套件，為**間隔複習**設計：題目資料夾帶題號，
方便搭配 [archive.py / search.py](https://github.com/MyTeamAce/leetcode) 那套流程歸檔與撈出該複習的題。

> 這是從零重寫的專案，不是任何既有擴充套件的 fork。
> 靈感來自 [Ayanrocks/better-leetcode](https://github.com/Ayanrocks/better-leetcode)，
> 但沒有沿用它的程式碼。

## 目前功能

### 登入

點側邊欄或狀態列，瀏覽器會開啟 LeetCode；在那邊授權完，VS Code 自己就會接到 session，
不用複製任何東西。

憑證存在 VS Code 的 secret storage（綁擴充套件 id，不會落到設定檔），
**存之前會先向 LeetCode 驗證一次**，過期或無效當下就知道。

因為授權是把 session 放在網址裡交回來的，回呼只在三個條件同時成立時才接受：
這裡發起的授權還在有效期內（五分鐘）、位址是這個擴充套件、而且只接受一次。
否則任何一個連結都能塞一份別人的 session 進來。

<details>
<summary><b>改用 cookie 登入</b></summary>

在命令面板執行 **LeetCode Practice: Sign In with Cookie**。這是瀏覽器授權到不了的環境唯一的路：
OS 沒註冊 `vscode://` 協定、Remote SSH 或 dev container（回呼要跨機器）、網頁版 VS Code、
或 LeetCode 改掉授權頁。

1. 在瀏覽器登入 <https://leetcode.com>
2. 開 DevTools（F12），切到 **Network** 分頁
3. 重新載入頁面，點任一個發往 `leetcode.com` 的請求，找 **Request Headers → Cookie**
4. 把那整行複製貼上

那行很長、絕大部分都用不到。實際只讀這兩個，你也可以只貼這兩個、順序不拘：

```
LEETCODE_SESSION=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...; csrftoken=8kZQ2nR7...
```

session 幾週後會過期，屆時 Test / Submit 會開始出現「session may have expired」，重新登入即可。

</details>

### 側邊欄

- **Daily Challenge** — 今天的每日挑戰題，一列
- **Study Plans** — LeetCode 官方的學習計畫（Top Interview 150、LeetCode 75 等），
  依「計畫 → 章節 → 題目」展開，並顯示各計畫解出幾題。
  LeetCode 沒有可用的「列出所有計畫」查詢，所以要顯示哪些寫在 `leetcodePractice.studyPlans` 設定裡。
- **Contests** — 尚未開始的比賽與倒數。點擊開瀏覽器：比賽開始前題目在 API 上並不存在，
  而且參賽本身要看計時與排行榜。
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

### 切換語言

編輯器標題列的按鈕會列出這題支援的語言（多數題目 19 種）。選了之後，新語言的模板會
**寫在原檔案旁邊**而不是取代它 —— 同一題可以同時有 `main.py` 和 `main.rs`，
因為「用另一個語言重寫解過的題」是練習方法，不是意外。Test / Submit 一律看你開著哪個檔案。

### 測試與提交

開著解題檔時，`Ctrl+;` 拿 `testcases.txt` 的測資跑一次、`Ctrl+Enter` 正式提交，
兩個也都在編輯器標題列有按鈕。結果顯示在底部的 **LeetCode Results** 面板（跟終端機、輸出同一排）：
判定、時間記憶體、每組測資與預期輸出並排、以及編譯或執行期錯誤。
放在那裡而不是編輯器分頁，是因為結果是「瞄一眼」的東西，程式碼應該留在畫面上。提交會先問一次，因為那會記在你的帳號上。

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
| `leetcodePractice.studyPlans` | 側邊欄要顯示哪些學習計畫，用網址裡的 slug |

## 還沒做

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
