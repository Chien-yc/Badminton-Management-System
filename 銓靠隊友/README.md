# 銓靠隊友 - 羽球隊營運系統 (GAS 部署指南)

這是一份完整的後端部署指南，將教您如何利用 Google 試算表作為免費的資料庫，並透過 Google Apps Script (GAS) 將其轉化為前端網頁可以呼叫的 API。

---

## 第一步：建立 Google 試算表與欄位設定
請建立一個全新的 Google 試算表，並在左下方新增以下 **6 個工作表(Tab)**（名稱請大小寫完全一致）：

### 1. `Users`
用來管理人員帳號的資料表。
*   **A1**: `id`
*   **B1**: `name`
*   **C1**: `role`
*   **D1**: `password`

### 2. `CurrentMembers`
用來儲存本季季繳會員的資料表。
*   **A1**: `id`
*   **B1**: `name`
*   **C1**: `status`
*   **D1**: `renewed`
*   **E1**: `leaves` (請假紀錄，用逗號分隔的字串)

### 3. `PastMembers`
用來儲存上季歷史會員的資料表。
*   **A1**: `id`
*   **B1**: `name`
*   **C1**: `status`
*   **D1**: `leaveCount`

### 4. `CasualLogs`
用來記錄每天的臨打人員與收費。
*   **A1**: `id`
*   **B1**: `date`
*   **C1**: `name`
*   **D1**: `fee`
*   **E1**: `method`
*   **F1**: `balls`

### 5. `Shuttles`
用來記錄羽球型號與成本。
*   **A1**: `id`
*   **B1**: `model`
*   **C1**: `pricePerTube`
*   **D1**: `ballsPerTube`
*   **E1**: `costPerBall`

### 6. `Config`
用來儲存營運結算面板的全域設定與歷史數據。
*   **A1**: `key`
*   **B1**: `value`

> **提示**：可以在 `Config` 的 A2~A7 欄位預先填入以下 key，並在 B 欄填入對應的數值：
> `currentSeasonFee`, `pastSeasonFee`, `pastSeasonIncome`, `pastSeasonCourtFee`, `pastSeasonBallCost`, `currentCourtFeeSum`

---

## 第二步：部署 Google Apps Script 後端
1. 打開您剛剛建立的試算表，點擊上方選單的 **`擴充功能` > `Apps Script`**。
2. 系統會開啟一個新的專案，請將專案內的 `Code.gs` 內容全部清空。
3. 將本資料夾內的 `Code.gs` 檔案的內容，**完整複製並貼上**到網頁版的程式碼編輯器中。
4. **【重要】** 複製您試算表網址中的 ID（網址 `/d/` 到 `/edit` 之間的那串亂碼），並取代 `Code.gs` 第一行的 `SPREADSHEET_ID`。
5. 點擊右上角的 **`部署` > `新增部署作業`**：
   * 點擊左上角的齒輪 ⚙️，選擇 **`網頁應用程式`**。
   * **執行身分**：選擇 `我 (您的 Google 帳號)`。
   * **誰可以存取**：選擇 `所有人` (這樣前端才不會被擋)。
   * 點擊部署，並完成 Google 帳號授權。
6. 部署完成後，您會獲得一組 **網頁應用程式 URL** (Web App URL)。

---

## 第三步：串接前端網頁
1. 回到您電腦中的 `app.js` 檔案。
2. 找到第一行程式碼：
   `const API_URL = 'YOUR_GAS_WEB_APP_URL';`
3. 將剛剛獲得的 **網頁應用程式 URL** 取代字串貼上去。
4. 完成！接下來您的網頁在進行新增會員、打卡紀錄時，就會自動將資料同步到您的 Google 試算表中了！
