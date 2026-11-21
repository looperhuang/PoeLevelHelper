# PoE 練等輔助 Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 做一個 Tauri 疊層，讀 PoE `Client.txt` 自動切換區域，並用快捷鍵手動前進/後退步驟，顯示攻略「現在該做什麼」。

**Architecture:** Rust 後端只追蹤 `Client.txt` 檔尾增量，解析「進入區域」行後以 Tauri event 通知前端。前端（原生 TypeScript + Vite，無框架）持有攻略 JSON 與目前步驟索引（純函式 `Navigator`），疊層視窗透明、置頂、點擊穿透。選檔與設定走 Rust command 與快捷鍵（點擊穿透下沒有可點按鈕）。

**Tech Stack:** Tauri 2、Rust（`regex`、`serde`、`serde_json`）、TypeScript、Vite、Vitest、`tauri-plugin-global-shortcut`、`tauri-plugin-dialog`。

**Spec:** `docs/superpowers/specs/2026-11-21-poe-leveling-overlay-design.md`

## Global Constraints

- 平台：Windows 10，遊戲須視窗化/無邊框視窗化。
- 資源消耗要小：不得全檔讀取 `Client.txt`（實測 121 MB），只讀檔尾增量；輪詢間隔 500 ms。
- 不讀寫遊戲記憶體、不注入遊戲。
- 疊層不得搶焦點：視窗 `focus: false`、`skipTaskbar`、`alwaysOnTop`、`set_ignore_cursor_events(true)`。
- `Client.txt` 路徑可設定；預設 `C:\Program Files (x86)\Grinding Gear Games\Path of Exile\logs\Client.txt`（本機實測存在，台服）。
- 繁中日誌進入區域格式（實測）：`...: <<set:MS>><<set:M>><<set:S>>你已進入：虛誕寶庫。`；同時支援英文 `You have entered Lioneye's Watch.`。
- 攻略 JSON 為獨立檔案；換攻略不改程式碼。
- 前端不加框架；先寫失敗測試再實作。
- 開發機目前**沒有** Rust（`cargo`/`rustc` MISSING）；node v24.20.0、WebView2 157.0.4341.60 已有。

## Review Focus

1. `Client.txt` 超大（121 MB）→ 啟動時必須從檔尾開始，不得掃全檔（Task 3 測試）。
2. 日誌被遊戲截斷/輪替（檔案變小）→ 偏移重置，不 crash（Task 3）。
3. 讀到半行（沒有結尾換行）→ 暫存到下次讀取，不得誤判或丟行（Task 3）。
4. 進入的區域不在攻略中，或同一區域（城鎮）重複進入 → 不亂跳；重複時取「目前步驟之後最近」的匹配（Task 2）。
5. 攻略 JSON 損壞/空步驟 → 顯示錯誤原因並保留目前攻略；到最後一步再按下一步、第一步按上一步 → 停在原處（Task 2、4）。
6. 日誌檔不存在（遊戲沒開、路徑錯）→ 疊層顯示提示而非靜默失效；快捷鍵註冊衝突 → 顯示錯誤（Task 4、5）。

---

### Task 1: Tauri 專案骨架與疊層視窗

**Files:**
- Create: Tauri 2 + Vite + TypeScript 專案於 `D:\poeLevelHelper`（`package.json`、`vite.config.ts`、`index.html`、`src/main.ts`、`src-tauri/**`）
- Modify: `src-tauri/tauri.conf.json`、`src-tauri/capabilities/default.json`

**Interfaces:**
- Produces: 可 `npm run tauri dev` 啟動的空殼；主視窗 label 為 `main`，設定為 `transparent: true, decorations: false, alwaysOnTop: true, skipTaskbar: true, focus: false`，初始約 420×200。

- [ ] **Step 1: 安裝前置工具**：安裝 Rust（rustup，stable，MSVC toolchain）與 Visual Studio Build Tools（Desktop development with C++）。
  驗證：`cargo --version` 與 `rustc --version` 皆輸出版本。（需使用者在終端機執行安裝器，Claude 可用 `! <command>` 提示使用者。）
- [ ] **Step 2: 建立專案**：在 `D:\poeLevelHelper` 用 `npm create tauri-app@latest`（template: vanilla-ts）建立，確認 `docs/` 保留；`git init` 並加 `.gitignore`（`node_modules`、`src-tauri/target`、`dist`）。
- [ ] **Step 3: 設定視窗**：依上述屬性修改 `tauri.conf.json`；背景 CSS `background: transparent`，body 放一行測試文字。
- [ ] **Step 4: 驗證**：`npm run tauri dev` 啟動，視窗透明、置頂、無邊框、不出現在工作列。
- [ ] **Step 5: Commit**：`git add -A && git commit -m "chore: scaffold tauri overlay"`

---

### Task 2: 攻略結構、驗證與 Navigator（純 TypeScript）

**Files:**
- Create: `src/guide.ts`、`src/navigator.ts`
- Test: `src/guide.test.ts`、`src/navigator.test.ts`（Vitest；`npm i -D vitest`）

**Interfaces:**
- Produces:
  - `type Step = { act: string; text: string; tips?: string; zone?: string }`
  - `type Guide = { title: string; steps: Step[] }`
  - `parseGuide(raw: string): Guide`：非 JSON、缺 `title`、`steps` 非陣列或為空、任一步驟缺 `act`/`text` → 丟出 `Error`，訊息說明哪個欄位錯。
  - `class Navigator { constructor(guide: Guide); get index(): number; get current(): Step; get next(): Step | undefined; next_(): void; prev(): void; enterZone(zone: string): boolean }`（建造者可改方法名，但需與測試一致）
    - 下一步在最後一步時不動、上一步在第一步時不動。
    - `enterZone`：先找索引 > 目前的第一個 `zone === zone` 步驟，找不到再從 0 找；都沒有則不動並回傳 `false`；有跳轉回傳 `true`。

- [ ] **Step 1: 寫失敗測試**（`guide.test.ts`）：`parseGuide('not json')` 丟錯；`{title:'t',steps:[]}` 丟錯；缺 `text` 的步驟丟錯且訊息含 `steps[0].text`；合法輸入回傳同內容。
- [ ] **Step 2: 寫失敗測試**（`navigator.test.ts`）：
  - 在最後一步 `next` 後 `index` 不變；在 0 `prev` 後仍為 0。
  - `enterZone('B')` 於步驟 zone 為 `[A,B,A,B]`、目前 index 0 → 跳到 1；再呼叫 → 跳到 3；再呼叫（之後無匹配）→ 回繞到 1。
  - `enterZone('不存在')` 回傳 `false` 且 `index` 不變。
- [ ] **Step 3: 執行確認失敗**：`npx vitest run` → FAIL（模組不存在）。
- [ ] **Step 4: 實作** `src/guide.ts` 與 `src/navigator.ts`，簽名如上。
- [ ] **Step 5: 執行確認通過**：`npx vitest run` → PASS。
- [ ] **Step 6: Commit**：`git add -A && git commit -m "feat: guide schema and navigator"`

---

### Task 3: Rust 日誌監看（尾端增量 + 區域解析）

**Files:**
- Create: `src-tauri/src/log_watcher.rs`
- Modify: `src-tauri/src/lib.rs`（註冊模組）、`src-tauri/Cargo.toml`（加 `regex`）
- Test: 同檔 `#[cfg(test)]` 模組

**Interfaces:**
- Produces:
  - `pub fn parse_zone(line: &str) -> Option<String>`：比對 `你已進入：(.+?)。` 與 `You have entered (.+?)\.`；回傳區域名稱，不符回傳 `None`。
  - `pub struct Tailer { /* path, offset, pending buf */ }` 與 `Tailer::open_at_end(path: &Path) -> io::Result<Tailer>`（起點設為目前檔尾，不讀歷史）、`Tailer::poll(&mut self) -> io::Result<Vec<String>>`（回傳新增的**完整行**；半行留在內部緩衝；檔案長度小於 offset 時視為截斷，offset 歸零並清緩衝）。
  - `pub fn spawn_watcher(app: AppHandle, path: PathBuf)`：背景執行緒每 500 ms `poll`，對每個 `parse_zone` 命中行 emit event `zone-entered`（payload: `String` 區域名）；檔案開不了時 emit `log-status`（payload: `{ ok: bool, message: String }`），成功開啟後 emit `ok: true`；之後可重試（每 2 秒）。

- [ ] **Step 1: 寫失敗測試**：
  - `parse_zone("2023/11/09 00:23:31 709937640 cffb0716 [INFO Client 12140] : <<set:MS>><<set:M>><<set:S>>你已進入：藏身處 - 富饒之地。")` == `Some("藏身處 - 富饒之地")`。
  - 英文 `... : You have entered Lioneye's Watch.` == `Some("Lioneye's Watch")`。
  - `"... : tasteslikeburnt 進入了此區域。"` == `None`。
  - `Tailer`（用 tempfile）：`open_at_end` 後 `poll` 為空；追加 `"a\nb"` → 回 `["a"]`；再追加 `"c\n"` → 回 `["bc"]`（半行拼接）；把檔案截成更短重寫 → 不 panic，且之後追加的新行能讀到。
  - `open_at_end` 對 100 MB 以上的檔案不得讀取全檔：測試以 sparse/大檔 + 計時或讀取量斷言（建造者決定做法，核心是 offset 起於檔尾）。
- [ ] **Step 2: 執行確認失敗**：`cargo test --manifest-path src-tauri/Cargo.toml log_watcher` → FAIL。
- [ ] **Step 3: 實作** 上述簽名。以 UTF-8 讀取，`from_utf8_lossy` 避免非法位元組 panic；分行用 `\n`，去除 `\r`。
- [ ] **Step 4: 執行確認通過**：同指令 → PASS。
- [ ] **Step 5: Commit**：`git add -A && git commit -m "feat: client.txt tail watcher and zone parser"`

---

### Task 4: 設定、讀取攻略檔與選檔 command

**Files:**
- Create: `src-tauri/src/settings.rs`
- Modify: `src-tauri/src/lib.rs`、`src-tauri/Cargo.toml`（加 `tauri-plugin-dialog`、`serde`）、`src-tauri/capabilities/default.json`、`src/main.ts`
- Test: `settings.rs` 內 `#[cfg(test)]`

**Interfaces:**
- Produces:
  - `pub struct Settings { pub log_path: String, pub guide_path: Option<String>, pub window_x: Option<i32>, pub window_y: Option<i32> }`（`Serialize/Deserialize`，`Default` 的 `log_path` 為 Global Constraints 的預設路徑）
  - `pub fn load(dir: &Path) -> Settings`：檔案不存在或損壞 → 回傳 `Default`，不 panic。
  - `pub fn save(dir: &Path, s: &Settings) -> io::Result<()>`；檔案存在 `<app_config_dir>/settings.json`。
  - Tauri commands：`get_settings() -> Settings`、`read_text_file(path: String) -> Result<String, String>`、`pick_guide_file() -> Option<String>`（開啟 `.json` 選檔對話框）、`pick_log_file() -> Option<String>`、`set_guide_path(path: String)`、`set_log_path(path: String)`（寫入設定；`set_log_path` 會重啟 watcher）。

- [ ] **Step 1: 寫失敗測試**（`settings.rs`）：`load` 對不存在目錄回 Default；寫入損壞 JSON 後 `load` 回 Default；`save` 後 `load` 往返相等。
- [ ] **Step 2: 執行確認失敗** → FAIL。
- [ ] **Step 3: 實作** `settings.rs`；啟動時在 `lib.rs` 載入設定並 `spawn_watcher(settings.log_path)`。
- [ ] **Step 4: 執行確認通過**：`cargo test --manifest-path src-tauri/Cargo.toml settings` → PASS。
- [ ] **Step 5: Commit**：`git add -A && git commit -m "feat: settings and file pick commands"`

---

### Task 5: 疊層 UI 與快捷鍵串接

**Files:**
- Create: `src/overlay.ts`（渲染）、`src/style.css`
- Modify: `src/main.ts`、`index.html`、`src-tauri/src/lib.rs`（全域快捷鍵、click-through）、`src-tauri/capabilities/default.json`
- Test: `src/overlay.test.ts`（Vitest + jsdom：`npm i -D jsdom`）

**Interfaces:**
- Consumes: Task 2 的 `parseGuide`、`Navigator`；Task 3 的 `zone-entered`、`log-status` events；Task 4 的 commands。
- Produces:
  - `renderOverlay(root: HTMLElement, view: OverlayView): void`，`OverlayView = { title: string; act: string; step: number; total: number; current: string; tips?: string; next?: string; message?: string }`；`message` 存在時顯示提示/錯誤（如日誌找不到、攻略載入失敗）。
  - 預設全域快捷鍵（建造者可調整，需寫進 README）：`Ctrl+Alt+Right` 下一步、`Ctrl+Alt+Left` 上一步、`Ctrl+Alt+H` 顯示/隱藏、`Ctrl+Alt+O` 選攻略 JSON、`Ctrl+Alt+L` 選 `Client.txt`。
  - 視窗啟動後 `set_ignore_cursor_events(true)`。
  - 快捷鍵註冊失敗 → 疊層顯示 `message`，不 crash。

- [ ] **Step 1: 寫失敗測試**（`overlay.test.ts`）：`renderOverlay` 後 DOM 含章節、`步驟 3/140` 格式的進度、目前步驟文字；有 `tips` 時才出現 TIPS 區塊；有 `message` 時顯示提示文字；`next` 預覽存在才顯示。
- [ ] **Step 2: 執行確認失敗** → FAIL。
- [ ] **Step 3: 實作** `overlay.ts` 與 `main.ts`：啟動時 `get_settings` → 有 `guide_path` 就 `read_text_file` + `parseGuide`；解析失敗顯示錯誤並維持前一份（啟動時無則顯示「按 Ctrl+Alt+O 選擇攻略」）；訂閱 `zone-entered` 呼叫 `Navigator.enterZone` 後重繪；訂閱 `log-status` 顯示日誌找不到提示。
- [ ] **Step 4: 實作** `lib.rs` 的全域快捷鍵與 click-through；快捷鍵動作 emit 前端事件或直接呼叫 command。
- [ ] **Step 5: 執行確認通過**：`npx vitest run` → PASS。
- [ ] **Step 6: 手動驗證**：`npm run tauri dev`；按 `Ctrl+Alt+O` 選任一合法 JSON，疊層顯示第一步；`Ctrl+Alt+Right/Left` 切換；`Ctrl+Alt+H` 隱藏/顯示；選一份壞 JSON 顯示錯誤且原攻略保留。
- [ ] **Step 7: Commit**：`git add -A && git commit -m "feat: overlay ui, shortcuts, guide picker"`

---

### Task 6: 把試算表轉成 guide.json 並標註區域

**Files:**
- Create: `scripts/csv-to-guide.mjs`（一次性）、`guides/static-strike-slayer-3.29.json`、`scripts/zone-names.md`（輔助對照）
- Test: `src/guide.test.ts`（新增 case）

**Interfaces:**
- Consumes: 試算表 CSV（`https://docs.google.com/spreadsheets/d/15NcRi0lktoS_1u_Nmxcp_uJpi8aJP_wl1hXGpXuS_EQ/export?format=csv&gid=1185926559`，已確認可公開下載）；Task 2 的 `parseGuide`。
- Produces: 符合 `Guide` 的 JSON。CSV 欄位對應：C 欄為章節（`A1`…`A10`，只在章節首列出現，後續列沿用）、D 欄為步驟文字（多行儲存格保留換行）、E 欄為 TIPS；D 欄為空的列略過；頂部說明/標題列（注意事項等）不列入步驟。

- [ ] **Step 1: 寫失敗測試**：載入 `guides/static-strike-slayer-3.29.json` 後 `parseGuide` 不丟錯；`steps` 涵蓋 `A1`…`A10` 十個章節；每個章節至少有一個步驟帶 `zone`。
- [ ] **Step 2: 執行確認失敗** → FAIL（檔案不存在）。
- [ ] **Step 3: 實作** `csv-to-guide.mjs`（用已知 CSV 解析方式處理引號內換行），輸出初版 JSON（尚無 `zone`）。
- [ ] **Step 4: 標註 zone**：從使用者的 `Client.txt` 擷取實際出現過的繁中區域名（`你已進入：(.+)。` 去重）整理到 `scripts/zone-names.md`，據此在每章關鍵步驟（進入新地圖/城鎮的步驟）手動填入 `zone`，名稱必須與日誌完全一致。至少每章一個，越多越準；可請使用者核對。
- [ ] **Step 5: 執行確認通過**：`npx vitest run` → PASS。
- [ ] **Step 6: Commit**：`git add -A && git commit -m "feat: static strike slayer 3.29 guide data"`

---

### Task 7: 端到端驗證與 README

**Files:**
- Create: `README.md`

- [ ] **Step 1: 模擬日誌驗證**：`npm run tauri dev`，載入 `guides/static-strike-slayer-3.29.json`，把 `Client.txt` 路徑指到一個測試檔（用 `Ctrl+Alt+L`），用 PowerShell 對該檔 `Add-Content` 追加一行：
  `2026/11/21 12:00:00 1 cffb0716 [INFO Client 1] : <<set:MS>><<set:M>><<set:S>>你已進入：<攻略中某個已標註的區域>。`
  預期：疊層在 ≤1 秒內跳到該區域的第一個匹配步驟。再追加一行不在攻略的區域 → 疊層不變。
- [ ] **Step 2: 真實遊戲驗證**：以視窗化模式開 PoE，進入一個區域，確認疊層自動切換、遊戲不掉幀、鍵盤輸入不被搶走。
- [ ] **Step 3: 資源檢查**：工作管理員觀察疊層 CPU 約 0%、記憶體合理（Tauri 預期遠小於 Electron）。
- [ ] **Step 4: 寫 README**：快捷鍵清單、如何選攻略/日誌、JSON 格式範例、視窗化需求、攻略著作權與 GGG 政策提醒。
- [ ] **Step 5: Commit**：`git add -A && git commit -m "docs: readme and e2e verification"`
