# LeetCode Practice

在 VS Code 裡練 LeetCode 的擴充套件，為**間隔複習**設計：題目資料夾帶題號，
方便搭配 [archive.py / search.py](https://github.com/MyTeamAce/leetcode) 那套流程歸檔與撈出該複習的題。

> 這是從零重寫的專案，不是任何既有擴充套件的 fork。
> 靈感來自 [Ayanrocks/better-leetcode](https://github.com/Ayanrocks/better-leetcode)，
> 但沒有沿用它的程式碼。

## 目前功能

### 登入

側邊欄或狀態列點擊 → 從瀏覽器 DevTools 複製 Cookie 標頭貼上。
憑證存在 VS Code 的 secret storage（綁擴充套件 id，不會落到設定檔），
**存之前會先向 LeetCode 驗證一次**，貼錯或過期當下就知道。

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

## 設定

| 設定 | 說明 |
| --- | --- |
| `leetcodePractice.storagePath` | 題目資料夾建在哪。留空則用第一個 workspace 資料夾底下的 `solutions/` |
| `leetcodePractice.defaultLanguage` | 開題時用哪個語言的模板（`python3`、`cpp`、`rust`…） |

## 還沒做

- [ ] Test / Submit
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
