const API_URL = 'https://script.google.com/macros/s/AKfycbxN7jn_2QMYPeyorpCMonIjDUcFvrDpoJy8gYWaneHELeQjjk5BHzdhAH1g4zutnqdJ/exec'; 
let currentUserRole = 'Staff'; 

// === 雲端資料狀態 (中文 Key 對應試算表) ===
let users = [];
let currentMembers = [];
let pastMembers = [];
let casualLogs = [];
let shuttles = [];
let config = {};

let dashData = {
    income: 0,
    courtFee: 0,
    ballCostMonth: 0, 
    ballCountMonth: 0,  
    ballCostSeason: 0,
    ballCountSeason: 0,
    ballViewType: 'month' 
};

// === 雲端 API 呼叫核心 ===
async function apiCall(action, data = {}) {
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify({ action: action, ...data })
        });
        return await response.json();
    } catch (e) {
        console.error('API Error:', e);
        return { status: 'error' };
    }
}

// === 初始化載入 ===
document.addEventListener('DOMContentLoaded', async () => {
    document.getElementById('logDate').valueAsDate = new Date();
    document.getElementById('userInfo').innerHTML = '⏳ 連線載入資料中...';
    
    // 從 GAS 獲取資料
    const res = await apiCall('getInitData');
    if (res && res.status === 'success') {
        users = res.data.users || [];
        pastMembers = res.data.pastMembers || [];
        shuttles = res.data.shuttles || [];
        casualLogs = res.data.casualLogs || [];
        config = res.data.config || {};
        
        // 處理 boolean 與陣列字串
        currentMembers = (res.data.currentMembers || []).map(m => ({
            ...m,
            '是否續季': String(m['是否續季']).toLowerCase() === 'true',
            '請假紀錄': m['請假紀錄'] ? String(m['請假紀錄']).split(',').map(s => s.trim()).filter(s => s) : []
        }));

        // 載入營運數據 (只取手動紀錄的設定值)
        const feeInput = document.getElementById('currentSeasonFee');
        if (feeInput && config['當季會費設定']) feeInput.value = config['當季會費設定'];

        // 從新表單載入歷史臨打 (僅用於自動清理，不顯示在前端 UI)
        let pastCasualLogs = res.data.pastCasualLogs || [];

        // 自動清理過期 450 天 (約 15 個月/5 季) 的歷史臨打與歷史會員資料
        const cutoff = Date.now() - 38880000000;
        const oldPastCasualIds = pastCasualLogs.filter(l => parseInt(String(l['紀錄ID']).substring(1)) < cutoff).map(l => l['紀錄ID']);
        if (oldPastCasualIds.length > 0) apiCall('deletePastCasualLog', { id: oldPastCasualIds });
        
        const oldPastMemberIds = pastMembers.filter(m => parseInt(String(m['會員ID']).split('_P')[1]) < cutoff).map(m => m['會員ID']);
        if (oldPastMemberIds.length > 0) apiCall('deletePastMember', { id: oldPastMemberIds });

        pastMembers = pastMembers.filter(m => !oldPastMemberIds.includes(m['會員ID']));
        
        // 預先將所有資料渲染到 HTML 畫面上
        renderMembers();
        renderShuttleConfigs();
        updateShuttleDropdown();
        renderUsers();
        renderTodayCasualLogs();

        // 資料載入完成，顯示登入表單
        document.getElementById('loginStatus').classList.add('hidden');
        document.getElementById('loginForm').classList.remove('hidden');
        
    } else {
        document.getElementById('loginStatus').innerHTML = '❌ 無法連線至雲端資料庫，請重新整理重試。';
    }

    // 點擊選單外部自動關閉
    document.addEventListener('click', (e) => {
        const menu = document.getElementById('dropdownMenu');
        const btn = document.getElementById('menuBtn');
        if (!btn.contains(e.target) && !menu.contains(e.target)) {
            menu.classList.add('hidden');
        }
    });
});

// === 手動同步最新資料 ===
async function syncData() {
    const btn = document.getElementById('syncTopBtn');
    if (btn) {
        btn.innerHTML = '⏳ 同步中...';
        btn.style.pointerEvents = 'none';
    }
    
    document.getElementById('userInfo').innerHTML = '⏳ 連線同步中...';
    
    const res = await apiCall('getInitData');
    if (res && res.status === 'success') {
        users = res.data.users || [];
        pastMembers = res.data.pastMembers || [];
        shuttles = res.data.shuttles || [];
        casualLogs = res.data.casualLogs || [];
        config = res.data.config || {};
        
        currentMembers = (res.data.currentMembers || []).map(m => ({
            ...m,
            '是否續季': String(m['是否續季']).toLowerCase() === 'true',
            '請假紀錄': m['請假紀錄'] ? String(m['請假紀錄']).split(',').map(s => s.trim()).filter(s => s) : []
        }));

        const feeInput = document.getElementById('currentSeasonFee');
        if (feeInput && config['當季會費設定']) feeInput.value = config['當季會費設定'];

        // 重新渲染畫面
        updateRoleUI();
        renderMembers();
        renderShuttleConfigs();
        updateShuttleDropdown();
        renderUsers();
        renderTodayCasualLogs();
        if (currentUserRole === 'Admin') updateDashboardUI();
        
        if (btn) {
            btn.innerHTML = '✅ 同步完成！';
            setTimeout(() => {
                btn.innerHTML = '🔄 同步最新資料';
                btn.style.pointerEvents = 'auto';
            }, 2000);
        }
        document.getElementById('dropdownMenu').classList.add('hidden');
    } else {
        if (btn) {
            btn.innerHTML = '❌ 同步失敗';
            setTimeout(() => {
                btn.innerHTML = '🔄 同步最新資料';
                btn.style.pointerEvents = 'auto';
            }, 2000);
        }
        document.getElementById('userInfo').innerHTML = '❌ 同步失敗';
    }
}

// 儲存全域設定到雲端
async function saveConfigToCloud(key, value) {
    config[key] = value;
    await apiCall('updateConfig', { data: [{ '設定鍵值': key, '設定數值': value }] });
}

// === SPA 與 權限邏輯 ===
function toggleMenu() {
    document.getElementById('dropdownMenu').classList.toggle('hidden');
}

function showPage(pageId) {
    document.querySelectorAll('.page-section').forEach(el => el.classList.remove('active'));
    document.getElementById('page-' + pageId).classList.add('active');
    document.getElementById('dropdownMenu').classList.add('hidden');
    if (pageId === 'operations' && currentUserRole === 'Admin') updateDashboardUI();
}

function handleLogin(e) {
    e.preventDefault();
    const loginId = document.getElementById('loginId').value.trim();
    const loginPwd = document.getElementById('loginPwd').value.trim();

    if (!loginId || !loginPwd) return alert('請輸入帳號與密碼');

    // 在 users 陣列中尋找帳號 (會員ID) 與 密碼 符合的對象
    const matchedUser = users.find(u => u['會員ID'] === loginId && String(u['密碼']) === loginPwd);
    
    // 如果資料庫異常沒有帳號，允許預設後門登入避免卡死
    const isBackdoor = (users.length === 0 && loginId === 'U1' && loginPwd === '123');

    if (matchedUser || isBackdoor) {
        currentUserRole = matchedUser ? matchedUser['權限角色'] : 'Admin';
        const userName = matchedUser ? matchedUser['姓名'] : '管理員';
        
        // 登入成功，隱藏登入畫面，顯示主畫面
        document.getElementById('loginContainer').classList.add('hidden');
        document.getElementById('appContainer').classList.remove('hidden');
        
        // 更新 UI
        document.getElementById('userInfo').textContent = currentUserRole === 'Admin' ? `👑 ${userName}` : `📝 ${userName}`;
        updateRoleUI();
        showPage('home');
        
    } else {
        alert('❌ 登入失敗：帳號或密碼錯誤！');
    }
}

function logout() {
    currentUserRole = '';
    document.getElementById('loginId').value = '';
    document.getElementById('loginPwd').value = '';
    document.getElementById('loginContainer').classList.remove('hidden');
    document.getElementById('appContainer').classList.add('hidden');
    document.getElementById('dropdownMenu').classList.add('hidden');
}

function updateRoleUI() {
    document.querySelectorAll('.admin-only').forEach(item => {
        if (currentUserRole === 'Admin') item.classList.remove('hidden');
        else item.classList.add('hidden');
    });

    const feeInput = document.getElementById('currentSeasonFee');
    if (feeInput) {
        if (currentUserRole === 'Admin') {
            feeInput.readOnly = false;
            feeInput.classList.remove('bg-gray-100', 'text-gray-500', 'cursor-not-allowed');
            feeInput.onchange = async function() {
                await saveConfigToCloud('當季會費設定', this.value);
                alert('當季會費已更新為: $' + this.value);
                updateDashboardUI(); // 即時更新動態結算
            };
        } else {
            feeInput.readOnly = true;
            feeInput.classList.add('bg-gray-100', 'text-gray-500', 'cursor-not-allowed');
            feeInput.onchange = null;
        }
    }
}

// === 季繳會員邏輯 ===
function renderMembers() {
    const currentTbody = document.getElementById('currentMembersList');
    if(!currentTbody) return;
    currentTbody.innerHTML = '';
    
    currentMembers.forEach(member => {
        const leavesText = member['請假紀錄'].length > 0 
            ? `<span class="text-red-500 font-bold">${member['請假紀錄'].length}次</span><br><span class="text-xs text-gray-500">${member['請假紀錄'].join(', ')}</span>`
            : `<span class="text-gray-400 text-sm">全勤</span>`;
            
        const statusClass = member['繳費狀態'] === '已繳費' ? 'text-green-600 font-bold' : 'text-red-500 font-bold';

        const btnHtml = member['是否續季'] 
            ? `<button disabled class="w-24 bg-gray-100 text-gray-400 py-1.5 rounded cursor-not-allowed text-xs border border-gray-200 text-center">✅ 已續季</button>`
            : `<button onclick="renewSingleMember('${member['會員ID']}')" class="w-24 bg-blue-50 text-blue-700 hover:bg-blue-600 hover:text-white py-1.5 rounded text-xs font-medium transition border border-blue-200 text-center">➡️ 續下一季</button>`;
            
        currentTbody.innerHTML += `
            <tr>
                <td class="px-4 py-3 whitespace-nowrap text-sm font-bold text-gray-900">${member['姓名']}</td>
                <td class="px-4 py-3 whitespace-nowrap text-sm hidden sm:table-cell ${statusClass}">${member['繳費狀態']}</td>
                <td class="px-4 py-3 text-sm text-gray-600">${leavesText}</td>
                <td class="px-4 py-3 whitespace-nowrap">
                    <div class="flex items-center justify-end gap-2">
                        <button onclick="addLeave('${member['會員ID']}')" class="bg-yellow-50 text-yellow-700 hover:bg-yellow-100 px-3 py-1.5 rounded text-xs border border-yellow-200 font-medium transition">請假</button>
                        <button onclick="editMemberModal('${member['會員ID']}')" class="bg-gray-50 text-gray-700 hover:bg-gray-200 px-3 py-1.5 rounded text-xs border border-gray-200 font-medium shadow-sm transition">編輯</button>
                        ${btnHtml}
                    </div>
                </td>
            </tr>
        `;
    });

    const pastTbody = document.getElementById('pastMembersList');
    if(!pastTbody) return;
    pastTbody.innerHTML = '';
    pastMembers.forEach(member => {
        pastTbody.innerHTML += `
            <tr>
                <td class="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">${member['姓名']}</td>
                <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">${member['結算狀態']}</td>
                <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600">${member['請假次數']} 次</td>
            </tr>
        `;
    });
    
    // 同步更新上季會費顯示
    const pastFeeDisplay = document.getElementById('pastSeasonFeeDisplay');
    if (pastFeeDisplay) {
        pastFeeDisplay.textContent = `$${(Number(config['上季會費設定']) || 0).toLocaleString()}`;
    }
    
    renderLeaveCounts();
}

// 渲染營運系統的會員請假統計
function renderLeaveCounts() {
    const tbody = document.getElementById('leaveCountTbody');
    if (!tbody) return;
    
    const sorted = [...currentMembers].sort((a, b) => {
        const aCount = Array.isArray(a['請假紀錄']) ? a['請假紀錄'].length : (a['請假紀錄'] ? String(a['請假紀錄']).split(',').filter(x => x.trim()).length : 0);
        const bCount = Array.isArray(b['請假紀錄']) ? b['請假紀錄'].length : (b['請假紀錄'] ? String(b['請假紀錄']).split(',').filter(x => x.trim()).length : 0);
        return bCount - aCount;
    });
    
    tbody.innerHTML = sorted.map(m => {
        const leaves = Array.isArray(m['請假紀錄']) ? m['請假紀錄'] : (m['請假紀錄'] ? String(m['請假紀錄']).split(',').map(x => x.trim()).filter(x => x) : []);
        const count = leaves.length;
        const countBadge = count > 0 
            ? `<span class="bg-red-100 text-red-700 font-bold px-2 py-1 rounded-full text-xs">${count} 次</span>`
            : `<span class="text-gray-400 text-sm">無</span>`;
            
        return `
            <tr class="hover:bg-gray-50 transition">
                <td class="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">${m['姓名']}</td>
                <td class="px-4 py-3 text-center text-sm whitespace-nowrap">${m['繳費狀態']}</td>
                <td class="px-4 py-3 text-center whitespace-nowrap">${countBadge}</td>
                <td class="px-4 py-3 text-sm text-gray-500 whitespace-nowrap truncate max-w-xs" title="${leaves.join(', ')}">${leaves.join(', ') || '-'}</td>
            </tr>
        `;
    }).join('');
}

async function addLeave(memberId) {
    const member = currentMembers.find(m => m['會員ID'] === memberId);
    if (!member) return;
    
    document.getElementById('leaveModalMemberId').value = memberId;
    document.getElementById('leaveModalMemberName').textContent = `為「${member['姓名']}」請假`;
    
    // 預設填入今天日期
    document.getElementById('leaveDatePicker').valueAsDate = new Date();
    
    document.getElementById('leaveDateModal').classList.remove('hidden');
}

function closeLeaveDateModal() {
    document.getElementById('leaveDateModal').classList.add('hidden');
}

async function submitLeaveDate() {
    const memberId = document.getElementById('leaveModalMemberId').value;
    const dateVal = document.getElementById('leaveDatePicker').value;
    
    if (!dateVal) return alert('請選擇日期！');
    
    const member = currentMembers.find(m => m['會員ID'] === memberId);
    if (!member) return;

    // 將 YYYY-MM-DD 轉為 MM/DD
    const d = new Date(dateVal);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const formattedDate = `${mm}/${dd}`;

    member['請假紀錄'].push(formattedDate);
    
    document.getElementById('leaveDateModal').classList.add('hidden');
    
    // 儲存至雲端
    const payload = { ...member, '請假紀錄': member['請假紀錄'].join(', ') };
    await apiCall('saveMember', { data: payload });
    
    alert(`✅ 已新增 ${member['姓名']} 於 ${formattedDate} 的請假紀錄。`);
    renderMembers();
}

function openAddMemberModal() {
    document.getElementById('modalTitle').textContent = '新增季繳會員';
    document.getElementById('modalMemberId').value = '';
    document.getElementById('modalName').value = '';
    document.getElementById('modalStatus').value = '未繳費';
    document.getElementById('modalLeaves').value = '';
    document.getElementById('leaveSection').classList.add('hidden'); 
    document.getElementById('memberModal').classList.remove('hidden');
}

function editMemberModal(memberId) {
    const member = currentMembers.find(m => m['會員ID'] === memberId);
    if (!member) return;
    document.getElementById('modalTitle').textContent = '編輯季繳會員';
    document.getElementById('modalMemberId').value = member['會員ID'];
    document.getElementById('modalName').value = member['姓名'];
    document.getElementById('modalStatus').value = member['繳費狀態'];
    document.getElementById('modalLeaves').value = member['請假紀錄'].join(', ');
    document.getElementById('leaveSection').classList.remove('hidden');
    document.getElementById('memberModal').classList.remove('hidden');
}

function closeMemberModal() {
    document.getElementById('memberModal').classList.add('hidden');
}

async function saveMember() {
    let id = document.getElementById('modalMemberId').value;
    const name = document.getElementById('modalName').value;
    const status = document.getElementById('modalStatus').value;
    const leavesStr = document.getElementById('modalLeaves').value;
    
    let leavesArr = [];
    if (leavesStr) {
        leavesArr = leavesStr.split(',').map(s => {
            s = s.trim();
            if (/^\d{13,}$/.test(s)) {
                const d = new Date(parseInt(s));
                return `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
            }
            return s;
        }).filter(s => s);
    }

    if (!name) return alert('請輸入會員姓名！');

    const isNew = !id;
    if (isNew) {
        let maxNum = 0;
        // 同時檢查當季與歷史名單，避免歷史會員的號碼被重複使用
        const allIds = [
            ...currentMembers.map(m => m['會員ID']), 
            ...pastMembers.map(m => String(m['會員ID']).split('_')[0])
        ];
        
        allIds.forEach(memberId => {
            if (memberId && memberId.startsWith('M')) {
                const num = parseInt(memberId.substring(1));
                // 只採計合理的流水號 (小於 100 萬)，自動忽略系統以前用時間戳 (13位數) 產生的舊 ID
                if (!isNaN(num) && num < 1000000) {
                    if (num > maxNum) maxNum = num;
                }
            }
        });
        
        const nextNum = maxNum + 1;
        // padStart(3, '0') 會補零到至少三位數，例如 M001, M012, M123
        id = 'M' + String(nextNum).padStart(3, '0');
        document.getElementById('modalMemberId').value = id;
    }

    const memberData = {
        '會員ID': id,
        '姓名': name,
        '繳費狀態': status,
        '是否續季': false,
        '請假紀錄': leavesArr.join(', ')
    };

    // 呼叫 API 寫入試算表
    document.getElementById('modalTitle').textContent = '儲存中...';
    await apiCall('saveMember', { data: memberData });

    // 更新本地狀態
    if (!isNew) {
        const member = currentMembers.find(m => m['會員ID'] === id);
        if (member) {
            member['姓名'] = name;
            member['繳費狀態'] = status;
            member['請假紀錄'] = leavesArr;
        }
    } else {
        memberData['請假紀錄'] = leavesArr; 
        currentMembers.push(memberData);
    }
    
    closeMemberModal();
    renderMembers();
    alert('✅ 會員資料已成功同步至雲端！');
}

async function renewSingleMember(memberId) {
    if (!confirm('確定要將此會員轉入下一季嗎？')) return;
    const member = currentMembers.find(m => m['會員ID'] === memberId);
    if (member) {
        member['是否續季'] = true;
        const payload = { ...member, '請假紀錄': member['請假紀錄'].join(', ') };
        await apiCall('saveMember', { data: payload });
        alert(`🎉 已成功將「${member['姓名']}」狀態更新！`);
        renderMembers();
    }
}

async function executeMemberRollover() {
    if (!confirm('⚠️ 警告：執行會員換季結算後，所有會員的本季紀錄將歸檔至「歷史名單」。\n\n- 「已打勾續季」的會員會保留在新季名單，自動設為「未繳費」且清空請假。\n- 「未打勾續季」的會員將會從新季名單中刪除。\n\n確認執行？')) return;
    if (!confirm('💡 提醒：請問您已經先到「營運系統」執行過【🔄 執行季度結算】了嗎？\n\n建議先結算財務資料再執行會員換季。按「確定」繼續執行會員換季。')) return;

    document.getElementById('userInfo').innerHTML = '⏳ 正在備份至歷史名單...';
    
    // 1. 準備匯入歷史名單的資料
    const newPastMembers = currentMembers.map(m => ({
        '會員ID': m['會員ID'] + '_P' + Date.now(), 
        '姓名': m['姓名'],
        '結算狀態': m['繳費狀態'],
        '請假次數': m['請假紀錄'].length
    }));

    await apiCall('savePastMember', { data: newPastMembers });
    pastMembers = [...pastMembers, ...newPastMembers];

    document.getElementById('userInfo').innerHTML = '⏳ 正在重置新季名單...';

    // 2. 準備新一季名單與要刪除的名單
    const retainedMembers = [];
    const deletedMemberIds = [];

    currentMembers.forEach(m => {
        if (m['是否續季'] === true) {
            retainedMembers.push({
                '會員ID': m['會員ID'],
                '姓名': m['姓名'],
                '繳費狀態': '未繳費',
                '是否續季': false,
                '請假紀錄': ''
            });
        } else {
            deletedMemberIds.push(m['會員ID']);
        }
    });

    if (retainedMembers.length > 0) {
        await apiCall('saveMember', { data: retainedMembers });
    }
    if (deletedMemberIds.length > 0) {
        await apiCall('deleteMember', { id: deletedMemberIds });
    }

    // 3. 更新前端畫面狀態
    currentMembers = currentMembers.filter(m => !deletedMemberIds.includes(m['會員ID']));
    currentMembers.forEach(m => {
        m['繳費狀態'] = '未繳費';
        m['是否續季'] = false;
        m['請假紀錄'] = [];
    });

    alert('🎉 季繳會員換季完成！舊名單已歸檔，新名單已重置。');
    document.getElementById('userInfo').innerHTML = '👑 管理員';
    renderMembers();
    updateDashboardUI(); // 收入會跟著重置
}

// === 羽球型號與成本邏輯 ===
function renderShuttleConfigs() {
    const tbody = document.getElementById('shuttleConfigList');
    if(!tbody) return;
    tbody.innerHTML = '';
    shuttles.forEach(s => {
        tbody.innerHTML += `
            <tr class="border-b">
                <td class="px-4 py-3 text-sm font-medium text-gray-800">${s['羽球型號']}</td>
                <td class="px-4 py-3 text-sm text-gray-600">$${s['整桶價格']} / ${s['每桶顆數']}顆</td>
                <td class="px-4 py-3 text-sm text-red-600 font-bold">$${s['單顆成本']}</td>
                <td class="px-4 py-3 text-sm text-right"><button onclick="deleteShuttle('${s['型號ID']}')" class="text-red-500 hover:bg-red-50 px-2 py-1 rounded">刪除</button></td>
            </tr>
        `;
    });
}

async function addShuttleModel() {
    const model = document.getElementById('newShuttleModel').value;
    const price = Number(document.getElementById('newShuttlePrice').value);
    const count = Number(document.getElementById('newShuttleCount').value);
    
    if(!model || !price || !count) return alert('請填寫完整的羽球資訊！');
    
    const costPerBall = Math.ceil(price / count); 
    const newShuttle = {
        '型號ID': 'S' + Date.now(),
        '羽球型號': model,
        '整桶價格': price,
        '每桶顆數': count,
        '單顆成本': costPerBall
    };
    
    await apiCall('saveShuttle', { data: newShuttle });
    shuttles.push(newShuttle);
    
    alert(`新增成功！【${model}】單顆成本計算為: $${costPerBall}`);
    document.getElementById('newShuttleModel').value = '';
    document.getElementById('newShuttlePrice').value = '';
    document.getElementById('newShuttleCount').value = '';
    
    renderShuttleConfigs();
    updateShuttleDropdown();
}

async function deleteShuttle(id) {
    if(!confirm('確定刪除此羽球設定？')) return;
    await apiCall('deleteShuttle', { id: id });
    shuttles = shuttles.filter(s => s['型號ID'] !== id);
    renderShuttleConfigs();
    updateShuttleDropdown();
}

function updateShuttleDropdown() {
    const select = document.getElementById('shuttlecockModel');
    if(!select) return;
    select.innerHTML = '';
    shuttles.forEach(s => {
        select.innerHTML += `<option value="${s['型號ID']}">${s['羽球型號']} ($${s['整桶價格']}/桶)</option>`;
    });
}

// === 營運結算邏輯 ===
function toggleBallCostView(type) {
    dashData.ballViewType = type;
    document.getElementById('btnBallMonth').className = type === 'month' ? 'px-2 py-1 text-xs rounded bg-white shadow-sm font-bold text-gray-800' : 'px-2 py-1 text-xs rounded text-gray-500 hover:bg-gray-200 cursor-pointer';
    document.getElementById('btnBallSeason').className = type === 'season' ? 'px-2 py-1 text-xs rounded bg-white shadow-sm font-bold text-gray-800' : 'px-2 py-1 text-xs rounded text-gray-500 hover:bg-gray-200 cursor-pointer';
    updateDashboardUI();
}

async function calculateCourtFee() {
    const select = document.getElementById('courtSeasonType');
    const type = select.options[select.selectedIndex].text;
    const price = Number(document.getElementById('courtPrice').value) || 0;
    const times = Number(document.getElementById('courtTimes').value) || 0;
    
    if(price <= 0 || times <= 0) return alert('請填寫正確的費用與次數！');

    const total = price * times;
    dashData.courtFee += total;
    
    await saveConfigToCloud('當季場地費', dashData.courtFee);
    
    alert(`✅ 已記錄 ${type}: $${price} x ${times}次 = $${total}`);
    
    document.getElementById('courtPrice').value = '';
    document.getElementById('courtTimes').value = '';
    updateDashboardUI();
}

function updateDashboardUI() {
    // 1. 從 config 讀取基礎設定
    const seasonFee = Number(config['當季會費設定']) || 0;
    const pastIncome = Number(config['上季總收入']) || 0;
    const pastCourt = Number(config['上季場地費']) || 0;
    const pastBall = Number(config['上季羽球費']) || 0;
    const seasonStartTime = Number(config['當季開始時間']) || 0;
    const reserveFund = Number(config['營運保留金']) || 0;
    dashData.courtFee = Number(config['當季場地費']) || 0;
    
    // 2. 從 casualLogs 動態結算臨打相關數據 (過濾掉不是這季的資料)
    let casualIncome = 0;
    let ballCount = 0;
    let ballCost = 0;
    let ballCountMonth = 0;
    let ballCostMonth = 0;
    
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    casualLogs.forEach(log => {
        const logId = String(log['紀錄ID']);
        if (logId.startsWith('C')) {
            const time = parseInt(logId.substring(1));
            // 只要紀錄時間晚於當季開始時間，就算進本季
            if (!isNaN(time) && time >= seasonStartTime) {
                const bCount = Number(log['用球數']) || 0;
                let bCost = Number(log['用球成本']);
                // 如果沒有用球成本 (可能是舊紀錄，或是試算表還沒加這個欄位)，預設用 50 元計算
                if (isNaN(bCost) || bCost === 0) {
                    bCost = bCount * 50; 
                }
                
                casualIncome += Number(log['實收費用']) || 0;
                ballCount += bCount;
                ballCost += bCost;

                const logDate = new Date(time);
                if (logDate.getMonth() + 1 === currentMonth && logDate.getFullYear() === currentYear) {
                    ballCountMonth += bCount;
                    ballCostMonth += bCost;
                }
            }
        }
    });

    const paidCount = currentMembers.filter(m => m['繳費狀態'] === '已繳費').length;
    dashData.income = (seasonFee * paidCount) + casualIncome;
    dashData.ballCountSeason = ballCount;
    dashData.ballCostSeason = ballCost;
    dashData.ballCountMonth = ballCountMonth;
    dashData.ballCostMonth = ballCostMonth;

    // 3. 渲染畫面
    document.getElementById('dash-income').textContent = `$${dashData.income.toLocaleString()}`;
    document.getElementById('dash-courtFee').textContent = `$${dashData.courtFee.toLocaleString()}`;
    
    const reserveFundEl = document.getElementById('dash-reserve-fund');
    if (reserveFundEl) reserveFundEl.textContent = `$${reserveFund.toLocaleString()}`;
    
    const displayCost = dashData.ballViewType === 'month' ? dashData.ballCostMonth : dashData.ballCostSeason;
    const displayCount = dashData.ballViewType === 'month' ? dashData.ballCountMonth : dashData.ballCountSeason;
    
    document.getElementById('dash-ballCost').textContent = `$${displayCost.toLocaleString()}`;
    document.getElementById('dash-ballCount').textContent = `消耗: ${displayCount} 顆`;
    
    const balance = dashData.income - dashData.courtFee - dashData.ballCostSeason;
    const balanceEl = document.getElementById('dash-balance');
    const balanceBoxEl = document.getElementById('dash-balance-box');
    
    if (balance >= 0) {
        balanceEl.textContent = `$${balance.toLocaleString()}`;
        balanceEl.className = 'text-3xl font-bold text-blue-600';
        balanceBoxEl.className = 'bg-white p-5 rounded-xl shadow-sm border-2 border-blue-200 bg-blue-50';
    } else {
        balanceEl.textContent = `-$${Math.abs(balance).toLocaleString()}`;
        balanceEl.className = 'text-3xl font-bold text-red-600';
        balanceBoxEl.className = 'bg-white p-5 rounded-xl shadow-sm border-2 border-red-200 bg-red-50';
    }

    // 更新上季歷史結算
    document.getElementById('dash-past-income').textContent = `$${pastIncome.toLocaleString()}`;
    document.getElementById('dash-past-courtFee').textContent = `$${pastCourt.toLocaleString()}`;
    document.getElementById('dash-past-ballCost').textContent = `$${pastBall.toLocaleString()}`;
    
    const pastBalance = pastIncome - pastCourt - pastBall;
    const pastBalanceEl = document.getElementById('dash-past-balance');
    
    if (pastBalance >= 0) {
        pastBalanceEl.textContent = `$${pastBalance.toLocaleString()}`;
        pastBalanceEl.className = 'text-xl font-bold text-blue-600';
    } else {
        pastBalanceEl.textContent = `-$${Math.abs(pastBalance).toLocaleString()}`;
        pastBalanceEl.className = 'text-xl font-bold text-red-600';
    }

    // 更新季繳會員那邊的上季會費顯示
    const pastFeeDisplay = document.getElementById('pastSeasonFeeDisplay');
    if (pastFeeDisplay) {
        pastFeeDisplay.textContent = `$${(Number(config['上季會費設定']) || 0).toLocaleString()}`;
    }
}

async function executeSeasonRollover() {
    if (!confirm('⚠️ 警告：執行季度結算後，當季的營運數據將會結轉至「上季歷史數據」，並將當季所有收入、場地費、羽球消耗，以及【當季會費設定】歸零。\n\n請確認您是否要執行結算？')) return;
    
    const currentIncome = dashData.income; 
    const currentCourt = dashData.courtFee;
    const currentBall = dashData.ballCostSeason;
    const currentFee = config['當季會費設定'] || 0;
    
    document.getElementById('userInfo').innerHTML = '⏳ 正在執行換季結算...';
    
    // 呼叫後台一併將當季臨打搬移到歷史臨打
    await apiCall('rolloverCasualLogs', {});
    
    await apiCall('updateConfig', { data: [
        { '設定鍵值': '上季會費設定', '設定數值': currentFee },
        { '設定鍵值': '上季總收入', '設定數值': currentIncome },
        { '設定鍵值': '上季場地費', '設定數值': currentCourt },
        { '設定鍵值': '上季羽球費', '設定數值': currentBall },
        { '設定鍵值': '當季場地費', '設定數值': 0 },
        { '設定鍵值': '當季會費設定', '設定數值': 0 },
        { '設定鍵值': '當季開始時間', '設定數值': Date.now() }
    ]});
    
    config['上季會費設定'] = currentFee;
    config['上季總收入'] = currentIncome;
    config['上季場地費'] = currentCourt;
    config['上季羽球費'] = currentBall;
    config['當季場地費'] = 0;
    config['當季會費設定'] = 0;
    config['當季開始時間'] = Date.now();
    
    dashData.courtFee = 0;
    casualLogs = []; // 清空前台當季臨打資料
    renderTodayCasualLogs();
    
    const feeInput = document.getElementById('currentSeasonFee');
    if (feeInput) feeInput.value = '';

    alert('🎉 季度結算已完成！當季財務已清空，臨打紀錄已歸檔至上季，請記得設定新一季的「當季會費」。');
    document.getElementById('userInfo').innerHTML = '👑 管理員';
    updateDashboardUI();
}

// === 臨打球員表單與今日清單 ===
function renderTodayCasualLogs() {
    const tbody = document.getElementById('todayCasualListTbody');
    if(!tbody) return;
    tbody.innerHTML = '';
    
    const todayStr = new Date().toLocaleDateString('en-CA'); 
    const todaysLogs = casualLogs.filter(log => {
        const logDateStr = new Date(log['日期']).toLocaleDateString('en-CA');
        return logDateStr === todayStr;
    });
    
    if (todaysLogs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="px-4 py-6 text-center text-sm text-gray-500">今日尚無臨打紀錄</td></tr>`;
        return;
    }
    
    todaysLogs.forEach(log => {
        const ballsText = log['用球數'] > 0 ? `<span class="text-gray-800 font-medium">${log['用球數']} 顆</span>` : `<span class="text-gray-400">-</span>`;
        tbody.innerHTML += `
            <tr class="border-b">
                <td class="px-4 py-3 text-sm font-medium text-gray-800">${log['姓名']}</td>
                <td class="px-4 py-3 text-sm text-green-600 font-bold">$${log['實收費用']}</td>
                <td class="px-4 py-3 text-sm text-gray-500">${log['付款方式']}</td>
                <td class="px-4 py-3 text-sm">${ballsText}</td>
                <td class="px-4 py-3 text-sm text-right">
                    <button onclick="deleteCasualLog('${log['紀錄ID']}')" class="text-red-500 hover:bg-red-50 px-2 py-1 rounded transition">刪除</button>
                </td>
            </tr>
        `;
    });
}

async function deleteCasualLog(id) {
    if(!confirm('確定要刪除這筆臨打紀錄嗎？')) return;
    
    await apiCall('deleteCasualLog', { id: id });
    casualLogs = casualLogs.filter(l => l['紀錄ID'] !== id);
    
    renderTodayCasualLogs();
    if (currentUserRole === 'Admin') updateDashboardUI();
}

async function submitCasualLog(e) {
    e.preventDefault();
    
    const dateVal = document.getElementById('logDate').value;
    const name = document.getElementById('playerName').value;
    const fee = Number(document.getElementById('fee').value);
    const method = document.getElementById('paymentMethod').value;
    const balls = Number(document.getElementById('ballsUsed').value) || 0;
    const shuttleId = document.getElementById('shuttlecockModel').value;
    
    let cost = 0;
    if(balls > 0 && shuttleId) {
        const s = shuttles.find(x => x['型號ID'] === shuttleId);
        if(s) {
            cost = s['單顆成本'] * balls;
        }
    }

    const newLog = {
        '紀錄ID': 'C' + Date.now(),
        '日期': dateVal,
        '姓名': name,
        '實收費用': fee,
        '付款方式': method,
        '用球數': balls,
        '用球成本': cost
    };

    document.getElementById('submitBtn').textContent = '傳送雲端中...';
    await apiCall('saveCasualLog', { data: newLog });
    document.getElementById('submitBtn').textContent = '新增臨打紀錄';
    
    casualLogs.push(newLog);

    alert('✅ 新增臨打紀錄成功！已同步至雲端。');
    e.target.reset();
    document.getElementById('logDate').valueAsDate = new Date();
    
    renderTodayCasualLogs(); 
    if (currentUserRole === 'Admin') updateDashboardUI();
}

// === 系統管理：帳號權限邏輯 ===
function renderUsers() {
    const tbody = document.getElementById('userListTbody');
    if(!tbody) return;
    tbody.innerHTML = '';
    users.forEach(u => {
        const roleHtml = u['權限角色'] === 'Admin' ? `<span class="text-red-600 font-bold">Admin</span>` : `<span class="text-blue-600 font-bold">Staff</span>`;
        const pwdHtml = String(u['密碼']).trim() ? `<span class="text-gray-400 text-xs ml-1">(已設密碼)</span>` : `<span class="text-red-600 text-xs ml-1">(⚠️ 未設密碼)</span>`;
        
        tbody.innerHTML += `
            <tr class="border-b">
                <td class="px-4 py-4 text-sm font-medium text-gray-800">
                    ${u['姓名']} <br class="sm:hidden">
                    <span class="text-xs text-blue-600 block mt-1">ID: ${u['會員ID']}</span>
                    ${pwdHtml}
                </td>
                <td class="px-4 py-4 text-sm">${roleHtml}</td>
                <td class="px-4 py-4 text-sm text-right space-x-2">
                    <button onclick="editUserModal('${u['會員ID']}')" class="bg-gray-50 text-gray-700 hover:bg-gray-200 px-3 py-1.5 rounded text-xs border border-gray-200 font-medium shadow-sm transition">編輯</button>
                    <button onclick="deleteUser('${u['會員ID']}')" class="text-red-600 hover:bg-red-50 px-2 py-1.5 rounded text-xs transition">刪除</button>
                </td>
            </tr>
        `;
    });
}

function openAddUserModal() {
    document.getElementById('userModalTitle').textContent = '新增人員帳號';
    document.getElementById('modalUserId').value = '';
    document.getElementById('modalUserId').disabled = false; // 允許輸入
    document.getElementById('modalUserName').value = '';
    document.getElementById('modalUserRole').value = 'Staff';
    document.getElementById('modalUserPassword').value = '';
    toggleUserPasswordVisibility();
    document.getElementById('userModal').classList.remove('hidden');
}

function editUserModal(id) {
    const user = users.find(u => u['會員ID'] === id);
    if (!user) return;
    document.getElementById('userModalTitle').textContent = '編輯人員帳號';
    document.getElementById('modalUserId').value = user['會員ID'];
    document.getElementById('modalUserId').disabled = true; // 編輯時不可修改 ID
    document.getElementById('modalUserName').value = user['姓名'];
    document.getElementById('modalUserRole').value = user['權限角色'];
    document.getElementById('modalUserPassword').value = user['密碼'];
    toggleUserPasswordVisibility();
    document.getElementById('userModal').classList.remove('hidden');
}

function toggleUserPasswordVisibility() {
    // 現在不論 Admin 或 Staff 都可以且必須設定密碼，所以永遠顯示密碼輸入框
    document.getElementById('userPasswordSection').classList.remove('hidden');
}

function closeUserModal() {
    document.getElementById('userModal').classList.add('hidden');
}

async function saveUser() {
    const id = document.getElementById('modalUserId').value.trim();
    const name = document.getElementById('modalUserName').value.trim();
    const role = document.getElementById('modalUserRole').value;
    const password = document.getElementById('modalUserPassword').value.trim();

    if (!id) return alert('請輸入登入帳號 (ID)！');
    if (!name) return alert('請輸入姓名 / 暱稱！');
    if (!password) return alert('🚨 每位使用者都必須設定一組密碼才能登入系統！');

    // 檢查如果是新增，ID 是否已經存在
    const isNew = !document.getElementById('modalUserId').disabled;
    if (isNew && users.find(u => u['會員ID'] === id)) {
        return alert('❌ 這個帳號 (ID) 已經被使用過了，請換一個！');
    }

    const newUser = {
        '會員ID': id,
        '姓名': name,
        '權限角色': role,
        '密碼': password
    };
    
    document.getElementById('userModalTitle').textContent = '儲存中...';
    await apiCall('saveUser', { data: newUser });

    if (!isNew) {
        const user = users.find(u => u['會員ID'] === id);
        if (user) {
            user['姓名'] = name;
            user['權限角色'] = role;
            user['密碼'] = password;
        }
    } else {
        users.push(newUser);
    }
    
    closeUserModal();
    renderUsers();
    alert('✅ 人員資料已成功儲存至雲端！');
}

async function deleteUser(id) {
    if(!confirm('確定要刪除此帳號嗎？')) return;
    await apiCall('deleteUser', { id: id });
    users = users.filter(u => u['會員ID'] !== id);
    renderUsers();
}
