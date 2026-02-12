// 这是一个快速修复时区问题的补丁
// 保存为 quick_fix.js，然后在 script.js 中引入

// 覆盖原生的日期处理函数
(function() {
  console.log('时区修复补丁 v2.1 已加载 - 支持自动刷新');
  
  // 获取用户时区
  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const userOffset = new Date().getTimezoneOffset();
  
  // 修复日期格式化函数
  window.formatDateLocal = function(date) {
    if (!date) return '-';
    
    if (!(date instanceof Date)) {
      date = new Date(date);
    }
    
    if (isNaN(date.getTime())) {
      return '-';
    }
    
    // 使用本地时间
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  // 计算剩余天数（使用本地时间）
  window.calculateRemainingDaysLocal = function(productionDate, shelfLife) {
    try {
      // 解析生产日期
      const [year, month, day] = productionDate.split('-').map(Number);
      
      // 使用本地时间
      const prodDate = new Date(year, month - 1, day, 12, 0, 0);
      const expiryDate = new Date(prodDate);
      expiryDate.setDate(prodDate.getDate() + shelfLife);
      
      // 今天本地时间的0点
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const remaining = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
      return remaining;
    } catch (error) {
      console.error('计算剩余天数错误:', error);
      return 0;
    }
  };
  
  // 前端临期商品过滤器
  window.filterExpiringProducts = function(records) {
    if (!records || !Array.isArray(records)) return [];
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const expiringProducts = [];
    
    records.forEach(record => {
      try {
        const remaining = window.calculateRemainingDaysLocal(record.production_date, record.shelf_life);
        const reminderDays = parseInt(record.reminder_days) || 0;
        
        // 使用本地时间判断：剩余天数 <= 提醒天数 或 已过期
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
    
    // 按剩余天数排序（从少到多）
    expiringProducts.sort((a, b) => {
      return (a.remaining_days || 0) - (b.remaining_days || 0);
    });
    
    console.log(`✅ 前端过滤器：共处理 ${records.length} 条记录，发现 ${expiringProducts.length} 条临期/过期商品`);
    return expiringProducts;
  };
  
  // 强制刷新临期列表
  window.refreshExpiringWithLocalTime = async function() {
    console.log('🔄 使用本地时间刷新临期商品列表...');
    
    try {
      // 获取所有记录
      const response = await fetch(`${window.location.origin}/api/records`, {
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('获取数据失败');
      }
      
      const allRecords = await response.json();
      
      // 使用前端过滤器
      const expiringRecords = window.filterExpiringProducts(allRecords);
      
      // 找到表格并渲染
      const expiringTable = document.getElementById('expiringTable');
      if (!expiringTable) {
        console.log('❌ 未找到临期商品表格');
        return;
      }
      
      // 清空表格
      expiringTable.innerHTML = '';
      
      if (expiringRecords.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = '<td colspan="8" class="text-center py-4">🎉 暂无临期商品</td>';
        expiringTable.appendChild(row);
        console.log('✅ 无临期商品');
        return;
      }
      
      // 渲染过滤后的记录
      expiringRecords.forEach(record => {
        const remainingDaysVal = record.remaining_days;
        let statusClass, statusText;
        
        if (remainingDaysVal <= 0) {
          statusClass = 'text-danger';
          statusText = '已过期';
        } else {
          statusClass = 'text-warning';
          statusText = '临期';
        }
        
        // 计算到期日期
        const expiryDate = new Date(record.production_date);
        expiryDate.setDate(expiryDate.getDate() + record.shelf_life);
        
        const row = document.createElement('tr');
        row.innerHTML = `
          <td class="table-cell">${record.sku}</td>
          <td class="product-name-cell">${record.name}</td>
          <td class="table-cell">${record.location || '默认位置'}</td>
          <td class="table-cell date-cell">${record.production_date}</td>
          <td class="table-cell date-cell">${window.formatDateLocal(expiryDate)}</td>
          <td class="table-cell">${remainingDaysVal > 0 ? remainingDaysVal + '天' : '已过期'}</td>
          <td class="table-cell ${statusClass}">${statusText}</td>
          <td class="table-cell">
            <button class="btn btn-sm btn-danger" onclick="showDeleteConfirm(${JSON.stringify(record).replace(/"/g, '&quot;')}, 'record')">
              <i class="bi bi-trash"></i> 删除
            </button>
          </td>
        `;
        expiringTable.appendChild(row);
      });
      
      console.log(`✅ 前端渲染完成，显示 ${expiringRecords.length} 条记录`);
      
      // 更新时区页脚时间
      const footer = document.querySelector('.timezone-footer');
      if (footer) {
        footer.innerHTML = footer.innerHTML.replace(/上次刷新:.*$/, `上次刷新: ${new Date().toLocaleTimeString()}`);
      }
      
      return expiringRecords;
      
    } catch (error) {
      console.error('❌ 刷新临期列表失败:', error);
    }
  };
  
  // === 页面加载和登录状态监听 ===
  document.addEventListener('DOMContentLoaded', function() {
    setTimeout(() => {
      // 替换原生的 renderExpiringTable 函数
      if (typeof window.renderExpiringTable === 'function') {
        window.renderExpiringTable = async function() {
          console.log('🔄 调用本地时间版本的 renderExpiringTable');
          return await window.refreshExpiringWithLocalTime();
        };
        console.log('✅ 已替换 renderExpiringTable 为本地时间版本');
      }
      
      // 自动刷新临期商品
      const mainApp = document.getElementById('main-app');
      if (mainApp && !mainApp.classList.contains('d-none')) {
        console.log('🔄 检测到已登录，自动刷新临期商品...');
        setTimeout(() => {
          window.refreshExpiringWithLocalTime();
        }, 500);
      }
      
      // 监听登录状态变化
      const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
          if (mutation.attributeName === 'class') {
            const target = mutation.target;
            if (target.id === 'main-app' && !target.classList.contains('d-none')) {
              console.log('🔄 检测到登录成功，自动刷新临期商品...');
              setTimeout(() => {
                window.refreshExpiringWithLocalTime();
              }, 800);
            }
          }
        });
      });
      
      const mainAppElement = document.getElementById('main-app');
      if (mainAppElement) {
        observer.observe(mainAppElement, { attributes: true });
      }
      
      // 监听临期标签页点击
      document.addEventListener('click', function(e) {
        if (e.target.id === 'expiring-tab' || e.target.closest('#expiring-tab')) {
          setTimeout(() => {
            window.refreshExpiringWithLocalTime();
          }, 200);
        }
      });
      
      // 显示时区信息
      const offsetHours = Math.abs(Math.floor(userOffset / 60));
      const offsetMinutes = Math.abs(userOffset % 60);
      const offsetSign = userOffset <= 0 ? '+' : '-';
      
      let timezoneDisplay = '';
      if (userTimezone === 'Asia/Shanghai' || userTimezone === 'China Standard Time') {
        timezoneDisplay = '北京时间 (UTC+08:00)';
      } else {
        timezoneDisplay = `${userTimezone} (UTC${offsetSign}${offsetHours.toString().padStart(2, '0')}:${offsetMinutes.toString().padStart(2, '0')})`;
      }
      
      // 添加时区页脚
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
  
})();
