# PoE 練等輔助 Overlay

透明、置頂、點擊穿透的疊層，顯示 PoE1 練等攻略「現在該做什麼」。讀 `Client.txt` 偵測進入的區域並自動跳步，區域內用快捷鍵手動前進／後退。

## 安裝（一般使用者）
1. 到 [Releases](https://github.com/looperhuang/PoeLevelHelper/releases) 下載最新的 `PoeLevelHelper_<版本>_x64-setup.exe`。
2. 執行安裝檔，不需要管理員權限，裝在 `%LOCALAPPDATA%\PoeLevelHelper`。
   - 安裝檔沒有程式碼簽章，Windows SmartScreen 可能跳出警告：按「其他資訊」→「仍要執行」。
   - 電腦沒有 WebView2 時安裝程式會自動下載（Windows 10/11 通常已內建）。
3. 從開始選單啟動 PoeLevelHelper，按 `Ctrl+Alt+O` 載入攻略（見下方「匯入攻略」）。
4. 自動更新：啟動時會檢查新版，有新版時疊層顯示提示，按 `Ctrl+Alt+U` 下載安裝並重新啟動（v0.2.0 起）。
5. 解除安裝：Windows「設定 → 應用程式」。

## 需求
- Windows 10、遊戲用**視窗化或無邊框視窗化**（全螢幕獨占模式看不到疊層）
- 開發：Node、Rust（stable）、Visual Studio 2022 Build Tools（C++）、WebView2

## 快捷鍵
| 組合 | 功能 |
|---|---|
| `Ctrl+Alt+→` / `Ctrl+Alt+←` | 下一步 / 上一步 |
| `Ctrl+Alt+H` | 顯示／隱藏疊層 |
| `Ctrl+Alt+O` | 選擇攻略 JSON（記住，下次自動載入） |
| `Ctrl+Alt+L` | 選擇 `Client.txt` |
| `Ctrl+Alt+U` | 安裝新版（有新版提示時） |
| `Ctrl+Alt+K` | 開關快捷鍵說明（疊層上直接顯示） |
| `Ctrl+Alt+M` | 移動模式：開啟後可用滑鼠拖動疊層，再按一次結束並記住位置 |
| `Ctrl+Alt+↑` / `Ctrl+Alt+↓` | 調整透明度（0.2–1，會記住） |

部分 Intel 顯示卡驅動把 `Ctrl+Alt+方向鍵` 當成螢幕旋轉熱鍵；若註冊失敗，疊層會顯示訊息，請先在驅動程式設定中停用該熱鍵。

**日誌路徑會自動偵測**：遊戲執行中時，疊層會自動改讀該遊戲資料夾的 `logs\Client.txt`（每 5 秒檢查一次）。遊戲沒開時沿用上次的路徑；日誌超過 7 天沒更新會顯示提示。也可用 `Ctrl+Alt+L` 手動選擇，但遊戲執行中會以遊戲實際位置為準。設定存在 `%APPDATA%\com.poelevelhelper.overlay\settings.json`。

## 匯入攻略

本 repo **不附攻略檔**（攻略內容屬原作者）。攻略是一個 JSON 檔，放在哪裡都可以。

### 載入
1. 啟動疊層，按 `Ctrl+Alt+O`，選擇攻略 `.json` 檔（上限 5 MB）。
2. 載入成功會顯示第一步；之後啟動會自動載入同一份。
3. 格式錯誤時疊層會顯示原因（例如 `steps[3].text 缺少或不是字串`），並保留原本的攻略。
4. 要換攻略，再按一次 `Ctrl+Alt+O` 即可。

### 格式
```json
{
  "title": "攻略名稱",
  "steps": [
    { "act": "A1", "text": "要做的事", "tips": "可省略", "zone": "可省略" }
  ]
}
```
- `title`、`steps`（不可為空）、每步的 `act` 與 `text` 必填，都是字串。
- `tips`：顯示在步驟下方的提示。
- `zone`：進入這個區域時自動跳到這一步。名稱必須和日誌中「你已進入：<區域>。」完全一致（英文客戶端則是 `You have entered <區域>.`）。
- 只會往**後**跳：回城或回到較早的區域不會讓進度倒退；要回頭請按 `Ctrl+Alt+←`。
- 沒標 `zone` 的步驟只能用 `Ctrl+Alt+→` 手動前進。建議每個新地圖的第一步都標上。
- 用記事本存檔沒問題（會自動處理 BOM），編碼請用 UTF-8。

### 查區域名稱
`scripts/zone-names.md` 是作者日誌中出現過的區域名稱。要用你自己的日誌產生（PowerShell）：
```powershell
Select-String -Path "C:\Program Files (x86)\Grinding Gear Games\Path of Exile\logs\Client.txt" -Pattern '你已進入：(.+?)。' -Encoding UTF8 |
  ForEach-Object { $_.Matches[0].Groups[1].Value } | Sort-Object -Unique
```

### 從 Google 試算表轉換
適用與原攻略相同版面的試算表：C 欄章節（`A1`…`A10`，只寫在該章第一列）、D 欄步驟、E 欄提示。
1. 試算表需開放「知道連結的人可檢視」。從網址取得 `<id>`（`/d/` 後面那段）和分頁的 `<gid>`（`gid=` 後面的數字）。
2. 下載 CSV 並轉換：
   ```
   curl -L -o scripts/sheet.csv "https://docs.google.com/spreadsheets/d/<id>/export?format=csv&gid=<gid>"
   node scripts/csv-to-guide.mjs scripts/sheet.csv guides/my-guide.json "我的攻略"
   ```
   第三個參數是標題，省略時用檔名。
3. 打開轉出的 JSON，依上面的區域名稱在步驟上加 `zone`。
4. 按 `Ctrl+Alt+O` 載入。

版面不同的攻略（網頁、PDF 等）沒有轉換工具，需自行整理成上述格式。

## 開發
```
npm install
npm test                      # vitest
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri dev
npm run tauri build                  # 產生 src-tauri/target/release/bundle/nsis/*-setup.exe
```
`tauri build` 需要更新簽章私鑰：設定環境變數 `TAURI_SIGNING_PRIVATE_KEY`（金鑰檔路徑或內容）與 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`（目前為空字串）。
**編譯注意**：若系統同時有 Visual Studio Insiders，Rust 可能選到缺 `msvcrt.lib` 的版本而連結失敗。請在 VS 2022 Build Tools 的 `vcvars64.bat` 環境下執行 cargo / tauri。

## 發布新版本
1. 同步修改版本號：`package.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json`。
2. 提交後打標籤並推送：`git tag v0.2.0 && git push origin v0.2.0`。
3. GitHub Actions 會編譯並建立**草稿** Release（含自動更新用的 `latest.json` 與 `.sig`），到 Releases 頁確認後按 Publish。發布後已安裝的使用者才會收到更新。

首次設定：repo 的 Settings → Secrets and variables → Actions 新增 `TAURI_SIGNING_PRIVATE_KEY`，值為私鑰檔內容。**私鑰遺失就無法再發更新給既有使用者，請備份。**

## 注意
- 只讀日誌檔，不讀寫遊戲記憶體。上線前請自行確認 GGG 對第三方工具的政策。
- 攻略內容屬原作者，散布前請先徵得同意。
