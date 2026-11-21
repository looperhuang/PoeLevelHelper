# PoE 練等輔助 Overlay

透明、置頂、點擊穿透的疊層，顯示 PoE1 練等攻略「現在該做什麼」。讀 `Client.txt` 偵測進入的區域並自動跳步，區域內用快捷鍵手動前進／後退。

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

預設日誌路徑：`C:\Program Files (x86)\Grinding Gear Games\Path of Exile\logs\Client.txt`。設定存在 `%APPDATA%\com.poelevelhelper.overlay\settings.json`。

## 攻略 JSON 格式
```json
{ "title": "攻略名稱",
  "steps": [ { "act": "A1", "text": "要做的事", "tips": "可省略", "zone": "可省略：進入此區域時跳到這一步" } ] }
```
`zone` 必須與日誌中「你已進入：<區域>。」的名稱完全一致（`scripts/zone-names.md` 列出你日誌出現過的名稱）。內建：`guides/static-strike-slayer-3.29.json`（由 `scripts/csv-to-guide.mjs` 從試算表轉出，區域為人工標註，部分為推測，請核對）。

## 開發
```
npm install
npm test                      # vitest
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri dev
```
**編譯注意**：若系統同時有 Visual Studio Insiders，Rust 可能選到缺 `msvcrt.lib` 的版本而連結失敗。請在 VS 2022 Build Tools 的 `vcvars64.bat` 環境下執行 cargo / tauri。

## 注意
- 只讀日誌檔，不讀寫遊戲記憶體。上線前請自行確認 GGG 對第三方工具的政策。
- 攻略內容屬原作者，公開發布前請先徵得同意。
