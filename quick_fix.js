// quick_fix.js - 完整的时区修复 + 移动卡片布局补丁
// 保存为 quick_fix.js，放在 index.html 同级目录

(function() {
    console.log('🚀 时区修复补丁 v3.0 已加载 - 支持移动卡片布局');
    
    // 获取用户时区
    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const userOffset = new Date().getTimezoneOffset();
    
    // ========== 日期处理函数 ==========
    window.formatDateLocal = function(date) {
        if (!date) return '-';
        if (!(date instanceof Date)) date = new Date(date);
        if (isNaN(date.getTime())) return '-';
        
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };
    
    window.calculateRemainingDaysLocal = function(productionDate, shelfLife) {
        try {
            const [year, month, day] = productionDate.split('-').map(Number);
            const prodDate = new Date(year, month - 1, day, 12, 0, 0);
            const expiryDate = new Date(prodDate);
            expiryDate.setDate(prodDate.getDate() + shelfLife);
            
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            return Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
        } catch (error) {
            console.error('计算剩余天数错误:', error);
            return 0;
        }
    };
    
    // ========== 前端临期商品过滤器 ==========
    window.filterExpiringProducts = function(records) {
        if (!records || !Array.isArray(records)) return [];
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const expiringProducts = [];
        
        records.forEach(record => {
            try {
                const remaining = window.calculateRemainingDaysLocal(record.production_date, record.shelf_life);
                const reminderDays = parseInt(record.reminder_days) || 0;
                
                if (remaining <= reminderDays) {
                    expiringProducts.push({
                        ...record,
                        remaining_days: remaining,
                        status: remaining <= 0 ? '已过期' : '临期'
                    });
                }
            } catch (error) {
                console.error('过滤临期商品错误:', error);
            }
        });
        
        expiringProducts.sort((a, b) => (a.remaining_days || 0) - (b.remaining_days || 0));
        return expiringProducts;
    };
    
    // ========== 移动端卡片渲染 ==========
    window.renderMobileCards = function(records) {
        const expiringCards = document.getElementById('expiringCards');
        if (!expiringCards) return;
        
        expiringCards.innerHTML = '';
        
        if (records.length === 0) {
            expiringCards.innerHTML = `
                <div class="text-center py-5">
                    <i class="bi bi-emoji-smile" style="font-size: 3rem; color: #6c757d;"></i>
                    <p class="mt-3 text-muted">🎉 暂无临期商品</p>
                </div>
            `;
            return;
        }
        
        records.forEach(record => {
            const remainingDaysVal = record.remaining_days;
            const isExpired = remainingDaysVal <= 0;
            const cardClass = isExpired ? 'danger' : 'warning';
            const statusText = isExpired ? '已过期' : '临期';
            const statusBgClass = isExpired ? 'status-danger-bg' : 'status-warning-bg';
            
            const expiryDate = new Date(record.production_date);
            expiryDate.setDate(expiryDate.getDate() + record.shelf_life);
            const formattedExpiryDate = window.formatDateLocal(expiryDate);
            
            const card = document.createElement('div');
            card.className = `expiring-card ${cardClass}`;
            card.innerHTML = `
                <div class="card-header-row">
                    <span class="card-sku">${record.sku}</span>
                    <span class="card-status ${statusBgClass}">${statusText}</span>
                </div>
                
                <div style="margin-bottom: 12px;">
                    <div class="card-info-label">商品名称</div>
                    <div class="card-info-value name-value">${record.name}</div>
                </div>
                
                <div class="card-body-grid">
                    <div class="card-info-item">
                        <div class="card-info-label">📍 库位</div>
                        <div class="card-info-value location-value">${record.location || '默认位置'}</div>
                    </div>
                    
                    <div class="card-info-item">
                        <div class="card-info-label">⏳ 剩余</div>
                        <div class="card-info-value days-value">
                            ${remainingDaysVal > 0 ? remainingDaysVal : '0'}
                            <span class="days-unit">天</span>
                        </div>
                    </div>
                    
                    <div class="card-info-item">
                        <div class="card-info-label">📅 生产</div>
                        <div class="card-info-value date-value">${record.production_date}</div>
                    </div>
                    
                    <div class="card-info-item">
                        <div class="card-info-label">⚠️ 到期</div>
                        <div class="card-info-value date-value">${formattedExpiryDate}</div>
                    </div>
                </div>
                
                <div class="card-footer-row">
                    <button class="btn-delete-card" onclick="showDeleteConfirm(${JSON.stringify(record).replace(/"/g, '&quot;')}, 'record')">
                        <i class="bi bi-trash"></i> 下架此商品
                    </button>
                </div>
            `;
            expiringCards.appendChild(card);
        });
    };
    
    // ========== 刷新临期商品（核心函数） ==========
    window.refreshExpiringWithLocalTime = async function() {
        console.log('🔄 使用本地时间刷新临期商品列表...');
        
        try {
            const response = await fetch(`${window.location.origin}/api/records`, {
                credentials: 'include'
            });
            
            if (!response.ok) throw new Error('获取数据失败');
            
            const allRecords = await response.json();
            const expiringRecords = window.filterExpiringProducts(allRecords);
            
            // 1. 渲染PC表格
            const expiringTable = document.getElementById('expiringTable');
            if (expiringTable) {
                expiringTable.innerHTML = '';
                
                if (expiringRecords.length === 0) {
                    expiringTable.innerHTML = '<tr><td colspan="8" class="text-center py-4">🎉 暂无临期商品</td></tr>';
                } else {
                    expiringRecords.forEach(record => {
                        const remainingDaysVal = record.remaining_days;
                        const statusClass = remainingDaysVal <= 0 ? 'text-danger' : 'text-warning';
                        const statusText = remainingDaysVal <= 0 ? '已过期' : '临期';
                        
                        const expiryDate = new Date(record.production_date);
                        expiryDate.setDate(expiryDate.getDate() + record.shelf_life);
                        
                        const row = document.createElement('tr');
                        row.innerHTML = `
                            <td class="sku-cell">${record.sku}</td>
                            <td class="product-name-cell">${record.name}</td>
                            <td class="location-cell">${record.location || '默认位置'}</td>
                            <td class="date-cell">${record.production_date}</td>
                            <td class="date-cell">${window.formatDateLocal(expiryDate)}</td>
                            <td class="days-cell">${remainingDaysVal > 0 ? remainingDaysVal : '0'}</td>
                            <td class="status-cell ${statusClass}">${statusText}</td>
                            <td class="action-cell">
                                <button class="btn btn-sm btn-danger" onclick="showDeleteConfirm(${JSON.stringify(record).replace(/"/g, '&quot;')}, 'record')">
                                    <i class="bi bi-trash"></i>
                                </button>
                            </td>
                        `;
                        expiringTable.appendChild(row);
                    });
                }
            }
            
            // 2. 渲染移动卡片
            window.renderMobileCards(expiringRecords);
            
            // 3. 更新时区页脚
            const footer = document.querySelector('.timezone-footer');
            if (footer) {
                footer.innerHTML = footer.innerHTML.replace(/上次刷新:.*$/, `上次刷新: ${new Date().toLocaleTimeString()}`);
            }
            
            console.log(`✅ 渲染完成：${expiringRecords.length} 条临期商品`);
            return expiringRecords;
            
        } catch (error) {
            console.error('❌ 刷新临期列表失败:', error);
        }
    };
    
    // ========== 自动初始化和事件监听 ==========
    document.addEventListener('DOMContentLoaded', function() {
        setTimeout(() => {
            // 1. 替换原生的 renderExpiringTable 函数
            if (typeof window.renderExpiringTable === 'function') {
                window.renderExpiringTable = async function() {
                    return await window.refreshExpiringWithLocalTime();
                };
                console.log('✅ 已替换 renderExpiringTable');
            }
            
            // 2. 检测登录状态并自动刷新
            const checkAndRefresh = () => {
                const mainApp = document.getElementById('main-app');
                if (mainApp && !mainApp.classList.contains('d-none')) {
                    console.log('🔄 检测到已登录，自动刷新...');
                    setTimeout(() => window.refreshExpiringWithLocalTime(), 500);
                }
            };
            
            checkAndRefresh();
            
            // 3. 监听登录状态变化
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.attributeName === 'class') {
                        const target = mutation.target;
                        if (target.id === 'main-app' && !target.classList.contains('d-none')) {
                            console.log('🔄 检测到登录成功，自动刷新...');
                            setTimeout(() => window.refreshExpiringWithLocalTime(), 800);
                        }
                    }
                });
            });
            
            const mainAppElement = document.getElementById('main-app');
            if (mainAppElement) {
                observer.observe(mainAppElement, { attributes: true });
            }
            
            // 4. 监听临期标签页点击
            document.addEventListener('click', (e) => {
                if (e.target.id === 'expiring-tab' || e.target.closest('#expiring-tab')) {
                    setTimeout(() => window.refreshExpiringWithLocalTime(), 200);
                }
            });
            
            // 5. 显示时区信息
            const offsetHours = Math.abs(Math.floor(userOffset / 60));
            const offsetMinutes = Math.abs(userOffset % 60);
            const offsetSign = userOffset <= 0 ? '+' : '-';
            
            let timezoneDisplay = '';
            if (userTimezone === 'Asia/Shanghai' || userTimezone === 'China Standard Time') {
                timezoneDisplay = '北京时间 (UTC+08:00)';
            } else {
                timezoneDisplay = `${userTimezone} (UTC${offsetSign}${offsetHours.toString().padStart(2, '0')}:${offsetMinutes.toString().padStart(2, '0')})`;
            }
            
            let footer = document.querySelector('.timezone-footer');
            if (!footer) {
                footer = document.createElement('div');
                footer.className = 'timezone-footer';
                footer.style.cssText = 'text-align:center;font-size:12px;color:#666;margin-top:20px;padding:10px;';
                document.body.appendChild(footer);
            }
            
            footer.innerHTML = `时区: ${timezoneDisplay} | 临期判断基于本地时间 | 上次刷新: ${new Date().toLocaleTimeString()}`;
            
        }, 1000);
    });
    
})();// ========== 🚀 完整修复所有商品页显示 ==========
(function fixAllProductsPage() {
    console.log('🔧 正在修复所有商品页...');
    
    // 1. 所有商品页渲染函数
    window.renderAllProductsWithLocalTime = async function() {
        console.log('🔄 刷新所有商品列表...');
        
        try {
            const response = await fetch(`${window.location.origin}/api/records`, {
                credentials: 'include'
            });
            
            if (!response.ok) throw new Error('获取数据失败');
            
            const records = await response.json();
            
            // 使用本地时间计算剩余天数
            records.forEach(record => {
                record.remaining_days = window.calculateRemainingDaysLocal(
                    record.production_date, 
                    record.shelf_life
                );
            });
            
            // 按剩余天数排序（从少到多）
            records.sort((a, b) => (a.remaining_days || 0) - (b.remaining_days || 0));
            
            // 渲染PC表格
            const allTable = document.getElementById('allTable');
            if (allTable) {
                allTable.innerHTML = '';
                
                if (records.length === 0) {
                    allTable.innerHTML = '<tr><td colspan="8" class="text-center py-4">📦 暂无库存商品</td></tr>';
                } else {
                    records.forEach(record => {
                        const remainingDaysVal = record.remaining_days;
                        const reminderDays = parseInt(record.reminder_days) || 0;
                        
                        let statusClass, statusText;
                        if (remainingDaysVal <= 0) {
                            statusClass = 'text-danger';
                            statusText = '已过期';
                        } else if (remainingDaysVal <= reminderDays) {
                            statusClass = 'text-warning';
                            statusText = '临期';
                        } else {
                            statusClass = 'text-success';
                            statusText = '正常';
                        }
                        
                        const expiryDate = new Date(record.production_date);
                        expiryDate.setDate(expiryDate.getDate() + record.shelf_life);
                        
                        const row = document.createElement('tr');
                        row.innerHTML = `
                            <td class="sku-cell">${record.sku}</td>
                            <td class="product-name-cell">${record.name}</td>
                            <td class="location-cell">${record.location || '默认位置'}</td>
                            <td class="date-cell">${record.production_date}</td>
                            <td class="date-cell">${window.formatDateLocal(expiryDate)}</td>
                            <td class="days-cell">
                                ${remainingDaysVal > 0 ? remainingDaysVal : '0'}天
                                ${remainingDaysVal > 0 && remainingDaysVal <= reminderDays ? 
                                    '<span class="badge bg-warning ms-1">临期</span>' : ''}
                            </td>
                            <td class="status-cell ${statusClass}">
                                <span class="status-indicator ${statusClass.replace('text-', 'status-')}"></span>
                                ${statusText}
                            </td>
                            <td class="action-cell">
                                <button class="btn btn-sm btn-danger" onclick="showDeleteConfirm(${JSON.stringify(record).replace(/"/g, '&quot;')}, 'record')">
                                    <i class="bi bi-trash"></i>
                                </button>
                            </td>
                        `;
                        allTable.appendChild(row);
                    });
                }
            }
            
            // 渲染移动卡片
            const allCards = document.getElementById('allCards');
            if (allCards) {
                allCards.innerHTML = '';
                
                if (records.length === 0) {
                    allCards.innerHTML = `
                        <div class="text-center py-5">
                            <i class="bi bi-box" style="font-size: 3rem; color: #6c757d;"></i>
                            <p class="mt-3 text-muted">📦 暂无库存商品</p>
                        </div>
                    `;
                } else {
                    records.forEach(record => {
                        const remainingDaysVal = record.remaining_days;
                        const reminderDays = parseInt(record.reminder_days) || 0;
                        
                        let cardClass, statusText, statusBgClass;
                        if (remainingDaysVal <= 0) {
                            cardClass = 'danger';
                            statusText = '已过期';
                            statusBgClass = 'status-danger-bg';
                        } else if (remainingDaysVal <= reminderDays) {
                            cardClass = 'warning';
                            statusText = '临期';
                            statusBgClass = 'status-warning-bg';
                        } else {
                            cardClass = 'normal';
                            statusText = '正常';
                            statusBgClass = 'status-normal-bg';
                        }
                        
                        const expiryDate = new Date(record.production_date);
                        expiryDate.setDate(expiryDate.getDate() + record.shelf_life);
                        const formattedExpiryDate = window.formatDateLocal(expiryDate);
                        
                        const card = document.createElement('div');
                        card.className = `expiring-card ${cardClass}`;
                        card.innerHTML = `
                            <div class="card-header-row">
                                <span class="card-sku">${record.sku}</span>
                                <span class="card-status ${statusBgClass}">${statusText}</span>
                            </div>
                            
                            <div style="margin-bottom: 12px;">
                                <div class="card-info-label">商品名称</div>
                                <div class="card-info-value name-value">${record.name}</div>
                            </div>
                            
                            <div class="card-body-grid">
                                <div class="card-info-item">
                                    <div class="card-info-label">📍 库位</div>
                                    <div class="card-info-value location-value">${record.location || '默认位置'}</div>
                                </div>
                                
                                <div class="card-info-item">
                                    <div class="card-info-label">⏳ 剩余</div>
                                    <div class="card-info-value days-value">
                                        ${remainingDaysVal > 0 ? remainingDaysVal : '0'}
                                        <span class="days-unit">天</span>
                                    </div>
                                </div>
                                
                                <div class="card-info-item">
                                    <div class="card-info-label">📅 生产</div>
                                    <div class="card-info-value date-value">${record.production_date}</div>
                                </div>
                                
                                <div class="card-info-item">
                                    <div class="card-info-label">⚠️ 到期</div>
                                    <div class="card-info-value date-value">${formattedExpiryDate}</div>
                                </div>
                            </div>
                            
                            <div class="card-footer-row">
                                <button class="btn-delete-card" onclick="showDeleteConfirm(${JSON.stringify(record).replace(/"/g, '&quot;')}, 'record')">
                                    <i class="bi bi-trash"></i> 下架此商品
                                </button>
                            </div>
                        `;
                        allCards.appendChild(card);
                    });
                }
            }
            
            console.log(`✅ 所有商品渲染完成：${records.length} 条记录`);
            return records;
            
        } catch (error) {
            console.error('❌ 所有商品页渲染失败:', error);
        }
    };
    
    // 2. 替换原生的 renderAllTable
    if (typeof window.renderAllTable === 'function') {
        window.renderAllTable = window.renderAllProductsWithLocalTime;
        console.log('✅ 已替换 renderAllTable');
    }
    
    // 3. 修复刷新按钮
    const fixRefreshButtons = () => {
        document.querySelectorAll('.refresh-btn[data-table="all"]').forEach(btn => {
            btn.replaceWith(btn.cloneNode(true)); // 移除旧事件
        });
        
        document.querySelectorAll('.refresh-btn[data-table="all"]').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                window.renderAllProductsWithLocalTime();
                window.showAlert?.('所有商品列表已刷新', 'info');
            });
        });
        console.log('✅ 已修复所有商品页刷新按钮');
    };
    
    // 4. 修复 Ctrl+R 快捷键
    const fixKeyboardShortcut = () => {

        document.addEventListener('keydown', function(e) {
            if (e.ctrlKey && e.key === 'r') {
                e.preventDefault();
                const activeTab = document.querySelector('.nav-link.active')?.id;
                
                if (activeTab === 'all-tab') {
                    window.renderAllProductsWithLocalTime();
                    window.showAlert?.('所有商品列表已刷新', 'info');
                }
            }
        });
        console.log('✅ 已修复 Ctrl+R 快捷键');
    };
    
    // 5. 监听所有商品标签页点击
    document.addEventListener('click', (e) => {
        if (e.target.id === 'all-tab' || e.target.closest('#all-tab')) {
            setTimeout(() => window.renderAllProductsWithLocalTime(), 200);
        }
    });
    
    // 6. 初始化时执行
    setTimeout(() => {
        fixRefreshButtons();
        fixKeyboardShortcut();
        
        const mainApp = document.getElementById('main-app');
        if (mainApp && !mainApp.classList.contains('d-none')) {
            setTimeout(() => window.renderAllProductsWithLocalTime(), 600);
        }
    }, 1500);
    
    console.log('✅ 所有商品页修复完成');
})();
