// 替換為您的試算表 ID
const SPREADSHEET_ID = '1FPjE4_WUvrLTVkGFfU50gOuNOhHdoC-NiKjTCCUPp-I'; 
let cachedSS = null;

function getSS() {
  if (!cachedSS) {
    cachedSS = SpreadsheetApp.openById(SPREADSHEET_ID);
  }
  return cachedSS;
}

function getSheet(sheetName) {
  return getSS().getSheetByName(sheetName);
}

// === 自動建立資料庫 (請手動執行一次此函式) ===
function setupDatabase() {
  const ss = getSS();
  
  const schemas = {
    'Users': ['會員ID', '姓名', '權限角色', '密碼'],
    'CurrentMembers': ['會員ID', '姓名', '繳費狀態', '是否續季', '請假紀錄'],
    'PastMembers': ['會員ID', '姓名', '結算狀態', '請假次數'],
    'CasualLogs': ['紀錄ID', '日期', '姓名', '實收費用', '付款方式', '用球數'],
    'PastCasualLogs': ['紀錄ID', '日期', '姓名', '實收費用', '付款方式', '用球數'],
    'Shuttles': ['型號ID', '羽球型號', '整桶價格', '每桶顆數', '單顆成本'],
    'Config': ['設定鍵值', '設定數值']
  };
  
  for (const [sheetName, headers] of Object.entries(schemas)) {
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
    }
    // 寫入中文表頭
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold'); 
  }
  
  // 寫入預設 Config 參數
  const configSheet = ss.getSheetByName('Config');
  if (configSheet.getLastRow() <= 1) {
    const defaultConfigs = [
      ['當季會費設定', 2000],
      ['上季會費設定', 1800],
      ['上季總收入', 24000],
      ['上季場地費', 15600],
      ['上季羽球費', 3200],
      ['營運保留金', 0],
      ['當季場地費', 0],
      ['當季開始時間', Date.now()]
    ];
    configSheet.getRange(2, 1, defaultConfigs.length, 2).setValues(defaultConfigs);
  }

  // 寫入預設 Admin 帳號
  const usersSheet = ss.getSheetByName('Users');
  if (usersSheet.getLastRow() <= 1) {
    usersSheet.appendRow(['U1', '團長管理員', 'Admin', '123']);
  }
}

// === 讀取 API ===
function getInitData() {
  let config = getConfigData();

  return {
    users: getSheetData('Users'),
    currentMembers: getSheetData('CurrentMembers'),
    pastMembers: getSheetData('PastMembers'),
    casualLogs: getSheetData('CasualLogs'),
    pastCasualLogs: getSheetData('PastCasualLogs'),
    shuttles: getSheetData('Shuttles'),
    config: config
  };
}

function getSheetData(sheetName) {
  const sheet = getSheet(sheetName);
  if(!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  
  const headers = data[0];
  const rows = data.slice(1);
  return rows.map(row => {
    let obj = {};
    headers.forEach((header, index) => {
      obj[header] = row[index];
    });
    return obj;
  });
}

function getConfigData() {
  const data = getSheetData('Config');
  let config = {};
  data.forEach(item => {
    config[item['設定鍵值']] = item['設定數值'];
  });
  return config;
}

// === 寫入與更新 API (Upsert) ===
function upsertRow(sheetName, idField, rowObj) {
  const sheet = getSheet(sheetName);
  if(!sheet) return;
  const data = sheet.getDataRange().getValues();
  const headers = data.length > 0 ? data[0] : Object.keys(rowObj);
  
  let rowIndex = -1;
  if(data.length > 1) {
    for (let i = 1; i < data.length; i++) {
      if (data[i][headers.indexOf(idField)] == rowObj[idField]) { 
        rowIndex = i + 1;
        break;
      }
    }
  }

  if(data.length === 0) {
      sheet.appendRow(headers);
  }

  const rowData = headers.map(h => {
    let val = rowObj[h] !== undefined ? rowObj[h] : '';
    // 防呆：如果是密碼欄位，強制加上單引號使其在試算表中存為「純文字」
    // 這樣開頭的 0 就不會被 Google 試算表當成數字自動刪掉了
    if (h === '密碼' && val !== '') {
      return "'" + val;
    }
    return val;
  });

  if (rowIndex > -1) {
    sheet.getRange(rowIndex, 1, 1, headers.length).setValues([rowData]);
  } else {
    sheet.appendRow(rowData);
  }
}

// === 刪除 API ===
function deleteRow(sheetName, idField, idValue) {
  const sheet = getSheet(sheetName);
  if(!sheet) return false;
  const data = sheet.getDataRange().getValues();
  if(data.length <= 1) return false;
  const headers = data[0];
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][headers.indexOf(idField)] == idValue) { 
      sheet.deleteRow(i + 1);
      return true;
    }
  }
  return false;
}

// === 接收 POST 請求 ===
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return buildJsonResponse({ status: 'error', message: 'No payload provided' });
    }
    
    const payload = JSON.parse(e.postData.contents);
    const action = payload.action;
    let result = { status: 'success' };

    switch (action) {
      case 'getInitData':
        result.data = getInitData();
        break;
      case 'saveUser':
        upsertRow('Users', '會員ID', payload.data);
        break;
      case 'deleteUser':
        deleteRow('Users', '會員ID', payload.id);
        break;
      case 'saveMember':
        if (Array.isArray(payload.data)) {
            payload.data.forEach(item => upsertRow('CurrentMembers', '會員ID', item));
        } else {
            upsertRow('CurrentMembers', '會員ID', payload.data);
        }
        break;
      case 'deleteMember':
        if (Array.isArray(payload.id)) {
            payload.id.forEach(id => deleteRow('CurrentMembers', '會員ID', id));
        } else {
            deleteRow('CurrentMembers', '會員ID', payload.id);
        }
        break;
      case 'savePastMember':
        if (Array.isArray(payload.data)) {
            payload.data.forEach(item => upsertRow('PastMembers', '會員ID', item));
        } else {
            upsertRow('PastMembers', '會員ID', payload.data);
        }
        break;
      case 'saveCasualLog':
        upsertRow('CasualLogs', '紀錄ID', payload.data);
        break;
      case 'deleteCasualLog':
        if (Array.isArray(payload.id)) {
            payload.id.forEach(id => deleteRow('CasualLogs', '紀錄ID', id));
        } else {
            deleteRow('CasualLogs', '紀錄ID', payload.id);
        }
        break;
      case 'rolloverCasualLogs':
        let casualSheet = getSheet('CasualLogs');
        let pastCasualSheet = getSheet('PastCasualLogs');
        if(casualSheet && pastCasualSheet) {
            let casualData = casualSheet.getDataRange().getValues();
            if(casualData.length > 1) {
                let rowsToMove = casualData.slice(1);
                pastCasualSheet.getRange(pastCasualSheet.getLastRow() + 1, 1, rowsToMove.length, rowsToMove[0].length).setValues(rowsToMove);
                casualSheet.getRange(2, 1, casualData.length - 1, casualData[0].length).clearContent();
            }
        }
        break;
      case 'deletePastCasualLog':
        if (Array.isArray(payload.id)) {
            payload.id.forEach(id => deleteRow('PastCasualLogs', '紀錄ID', id));
        } else {
            deleteRow('PastCasualLogs', '紀錄ID', payload.id);
        }
        break;
      case 'deletePastMember':
        if (Array.isArray(payload.id)) {
            payload.id.forEach(id => deleteRow('PastMembers', '會員ID', id));
        } else {
            deleteRow('PastMembers', '會員ID', payload.id);
        }
        break;
      case 'saveShuttle':
        upsertRow('Shuttles', '型號ID', payload.data);
        break;
      case 'deleteShuttle':
        deleteRow('Shuttles', '型號ID', payload.id);
        break;
      case 'updateConfig':
        if (Array.isArray(payload.data)) {
            payload.data.forEach(item => upsertRow('Config', '設定鍵值', item));
        }
        break;
      default:
        result.status = 'error';
        result.message = 'Unknown action';
    }

    return buildJsonResponse(result);
      
  } catch (error) {
    return buildJsonResponse({ status: 'error', message: error.toString() });
  }
}

function doGet(e) {
  return buildJsonResponse({ status: 'System Online', message: 'The Antigravity Badminton API is running perfectly.' });
}

function buildJsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
