# LeetCode Practice

在 VS Code 裡練 LeetCode 的擴充套件，為**間隔複習**設計：題目資料夾帶題號，
方便日後用 [archive.py / search.py](https://github.com/MyTeamAce/leetcode) 那套流程歸檔與撈出該複習的題。

> 這是從零重寫的專案，不是任何既有擴充套件的 fork。
> 靈感來自 [Ayanrocks/better-leetcode](https://github.com/Ayanrocks/better-leetcode)，
> 但沒有沿用它的程式碼。

## 狀態

開發中。目前完成：

- [x] Cookie 登入，憑證存在 VS Code secret storage
- [x] 狀態列顯示登入者
- [x] Daily Challenge 側邊欄
- [ ] 全題庫瀏覽與搜尋
- [ ] 開題產檔與題目說明面板
- [ ] Test / Submit
- [ ] Study Lists、Contests、討論區
- [ ] 每題語言切換

## 開發

```bash
bun install
```

```bash
bun run compile
```

F5 啟動 Extension Development Host。

## 授權

MIT，見 [LICENSE](LICENSE)。
