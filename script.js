// script.js - 商品保质期管理系统 v2.0
// 修复：1. 商品库位显示问题 2. 服务器时区导致的日期计算问题 3. 会话过期处理

const API_BASE_URL = window.location.origin;

// DOM元素
const loginContainer = document.getElementById('login-container');
const mainApp = document.getElementById('main-app');
const loginBtn = document.getElementById('loginBtn');
const registerBtn = document.getElementById('registerBtn');
const logoutBtn = document.getElementById('logoutBtn');
const currentUsername = document.getElementById('current-username');

const skuInput = document.getElementById('skuInput');
const productName = document.getElementById('productName');
const shelfLife = document.getElementById('shelfLife');
const reminderDays = document.getElementById('reminderDays');
const productionDate = document.getElementById('productionDate');
const expiryDate = document.getElementById('expiryDate');
const reminderDate = document.getElementById('reminderDate');
const remainingDays = document.getElementById('remainingDays');
const statusIndicator = document.getElementById('statusIndicator');
const saveBtn = document.getElementById('saveBtn');

const expiringTable = document.getElementById('expiringTable');
const allTable = document.getElementById('allTable');
const productDatabaseTable = document.getElementById('productDatabaseTable');

const searchSku = document.getElementById('searchSku');
const searchBtn = document.getElementById('searchBtn');
const newSku = document.getElementById('newSku');
const newName = document.getElementById('newName');
const newShelfLife = document.getElementById('newShelfLife');
const newReminderDays = document.getElementById('newReminderDays');
const newLocation = document.getElementById('newLocation');
const addProductBtn = document.getElementById('addProductBtn');
const updateProductBtn = document.getElementById('updateProductBtn');

const confirmModal = new bootstrap.Modal(document.getElementById('confirmModal'));
const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
const modalBody = document.getElementById('modalBody');
const duplicateModal = new bootstrap.Modal(document.getElementById('duplicateModal'));

// 全局变量
let currentSelectedItem = null;
let deleteType = '';
let duplicateCheckResult = null;
let isEditingProduct = false;
let currentEditingSku = '';
let lastAuthCheck = 0;
const AUTH_CHECK_INTERVAL = 30000; // 30秒检查一次登录状态

// ========== API请求封装（带会话检查） ==========
async function apiRequest(endpoint, method = 'GET', data = null) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include' // 重要：包含cookies
  };
  
  if (data) {
    options.body = JSON.stringify(data);
  }
  
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
    
    if (response.status === 401) {
      // 立即检查登录状态
      await checkAuth(true);
      showAlert('登录已过期，请重新登录', 'warning');
      throw new Error('未授权');
    }
    
    if (response.status === 204) {
      return null;
    }
    
    const responseText = await response.text();
    let result = null;
    
    if (responseText) {
      result = JSON.parse(responseText);
    }
    
    if (!response.ok) {
      throw new Error(result?.error || `HTTP ${response.status}`);
    }
    
    return result;
  } catch (error) {
    console.error('API请求错误:', error);
    if (error.message !== '未授权') {
      showAlert(`请求失败: ${error.message}`, 'danger');
    }
    throw error;
  }
}

// ========== 辅助函数 ==========
// 获取商品库位信息 - 修复库位显示问题
async function getProductLocation(sku) {
  try {
    const product = await apiRequest(`/api/products/${sku}`);
    if (product && product.location) {
      return product.location;
    }
    return null;
  } catch (error) {
    console.error('获取商品库位失败:', error);
    return null;
  }
}

// 检查登录状态（带强制刷新选项）
async function checkAuth(force = false) {
  const now = Date.now();
  
  // 避免频繁检查
  if (!force && (now - lastAuthCheck) < 10000) {
    return true;
  }
  
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/check`, {
      credentials: 'include'
    });
    const result = await response.json();
    
    lastAuthCheck = now;
    
    if (result.isLoggedIn) {
      showMainApp(result.user);
      return true;
    } else {
      showLogin();
      if (result.message === '会话已过期') {
        showAlert('会话已过期，请重新登录', 'warning');
      }
      return false;
    }
  } catch (error) {
    console.error('检查登录状态失败:', error);
    showLogin();
    return false;
  }
}

// 定期检查登录状态
function startAuthChecker() {
  setInterval(() => {
    if (window.location.hash !== '#login') {
      checkAuth();
    }
  }, AUTH_CHECK_INTERVAL);
}

// 显示登录界面
function showLogin() {
  loginContainer.classList.remove('d-none');
  mainApp.classList.add('d-none');
  // 清理可能残留的会话数据
  localStorage.removeItem('lastAuthCheck');
}

// 显示主应用
function showMainApp(user) {
  loginContainer.classList.add('d-none');
  mainApp.classList.remove('d-none');
  currentUsername.textContent = user.username;
  
  // 记录登录时间
  localStorage.setItem('lastLogin', new Date().toISOString());
  
  initMainApp();
}

// ========== 认证相关 ==========
async function login() {
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value.trim();
  
  if (!username || !password) {
    showAlert('请输入用户名和密码', 'warning');
    return;
  }
  
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, password })
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.error || '登录失败');
    }
    
    showMainApp(result.user);
    showAlert('登录成功', 'success');
    
    // 清除密码输入框
    document.getElementById('loginPassword').value = '';
    
  } catch (error) {
    showAlert(`登录失败: ${error.message}`, 'danger');
  }
}

async function register() {
  const username = document.getElementById('registerUsername').value.trim();
  const password = document.getElementById('registerPassword').value.trim();
  const confirmPassword = document.getElementById('registerConfirmPassword').value.trim();
  const email = document.getElementById('registerEmail').value.trim();
  
  if (!username || !password) {
    showAlert('用户名和密码不能为空', 'warning');
    return;
  }
  
  if (username.length < 3 || username.length > 20) {
    showAlert('用户名长度应在3-20字符之间', 'warning');
    return;
  }
  
  if (password.length < 6) {
    showAlert('密码长度不能少于6位', 'warning');
    return;
  }
  
  // 新增：确认密码验证
  if (password !== confirmPassword) {
    showAlert('两次输入的密码不一致', 'warning');
    return;
  }
  
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, email })
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.error || '注册失败');
    }
    
    showAlert('注册成功，请登录', 'success');
    
    // 清空注册表单
    document.getElementById('registerUsername').value = '';
    document.getElementById('registerPassword').value = '';
    document.getElementById('registerConfirmPassword').value = '';
    document.getElementById('registerEmail').value = '';
    
    // 切换到登录标签页
    document.getElementById('login-tab').click();
    
    // 填充用户名到登录框
    document.getElementById('loginUsername').value = username;
    document.getElementById('loginPassword').value = '';
    document.getElementById('loginUsername').focus();
    
  } catch (error) {
    showAlert(`注册失败: ${error.message}`, 'danger');
  }
}

async function logout() {
  try {
    await fetch(`${API_BASE_URL}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include'
    });
    showLogin();
    showAlert('已成功登出', 'info');
  } catch (error) {
    console.error('登出失败:', error);
    showLogin();
  }
}

// ========== 主应用初始化 ==========
async function initMainApp() {
  // 设置生产日期限制（使用本地时间）
  const today = new Date();
  const minDate = new Date(today);
  minDate.setFullYear(today.getFullYear() - 2);
  productionDate.min = formatDateLocal(minDate);
  productionDate.max = formatDateLocal(today);
  
  // 加载表格数据
  try {
    await renderExpiringTable();
    await renderAllTable();
    await renderProductDatabaseTable();
  } catch (error) {
    console.error('初始化表格错误:', error);
  }
  
  // 自动聚焦到SKU输入框
  setTimeout(() => {
    skuInput.focus();
    showAlert('系统已就绪，请输入5位SKU编码开始查询', 'info');
  }, 100);
  
  // 启动登录状态检查器
  startAuthChecker();
}

// ========== 事件监听 ==========
document.addEventListener('DOMContentLoaded', () => {
  // 初始检查登录状态
  checkAuth();
  
  // 认证相关
  loginBtn.addEventListener('click', login);
  registerBtn.addEventListener('click', register);
  logoutBtn.addEventListener('click', logout);
  
  // 处理回车键登录
  document.getElementById('loginUsername').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') login();
  });
  document.getElementById('loginPassword').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') login();
  });
  
  // 商品查询相关
  skuInput.addEventListener('input', handleSkuInput);
  skuInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && skuInput.value.length === 5) {
      lookupProduct();
    }
  });
  
  skuInput.addEventListener('click', function() {
    if (this.value.length === 5) {
      this.select();
    }
  });
  
  productionDate.addEventListener('change', function() {
    calculateDates();
    if (this.value && window.innerWidth <= 768) {
      setTimeout(() => {
        saveBtn.focus();
      }, 300);
    }
  });
  
  saveBtn.addEventListener('click', saveProductRecord);
  
  // 新增商品相关
  searchBtn.addEventListener('click', searchProduct);
  searchSku.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      searchProduct();
    }
  });
  
  addProductBtn.addEventListener('click', addNewProduct);
  updateProductBtn.addEventListener('click', updateProduct);
  
  // 删除确认
  confirmDeleteBtn.addEventListener('click', deleteItem);
  
  // 刷新按钮
  document.querySelectorAll('.refresh-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const tableType = this.dataset.table;
      switch(tableType) {
        case 'expiring':
          renderExpiringTable();
          break;
        case 'all':
          renderAllTable();
          break;
        case 'database':
          renderProductDatabaseTable();
          break;
      }
      showAlert('表格已刷新', 'info');
    });
  });
  
  // 键盘快捷键
  document.addEventListener('keydown', function(e) {
    if (e.ctrlKey && e.key === 'r') {
      e.preventDefault();
      const activeTab = document.querySelector('.nav-link.active')?.id;
      if (!activeTab) return;
      
      switch(activeTab) {
        case 'expiring-tab':
          renderExpiringTable();
          showAlert('临期商品列表已刷新', 'info');
          break;
        case 'all-tab':
          renderAllTable();
          showAlert('所有商品列表已刷新', 'info');
          break;
        case 'add-tab':
          renderProductDatabaseTable();
          showAlert('商品数据库已刷新', 'info');
          break;
      }
    }
    
    // ESC键清空SKU输入框
    if (e.key === 'Escape' && document.activeElement === skuInput) {
      skuInput.value = '';
      clearForm();
      showAlert('已清空输入', 'info');
    }
  });
  
  // 页面可见性变化时检查登录状态
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      checkAuth(true); // 强制检查
    }
  });
});

// ========== SKU输入处理 ==========
function handleSkuInput() {
  const sku = this.value.trim();
  
  if (sku.length > 5) {
    this.value = sku.substring(0, 5);
  }
  
  if (sku.length === 5) {
    lookupProduct();
    
    if (window.innerWidth <= 768 && 'showPicker' in HTMLInputElement.prototype) {
      setTimeout(() => {
        productionDate.showPicker().catch(() => {});
      }, 500);
    }
  } else if (sku.length > 0) {
    clearForm();
  }
}

// ========== 商品查询 ==========
async function lookupProduct() {
  const sku = skuInput.value.trim();
  
  if (sku.length !== 5) {
    clearForm();
    return;
  }
  
  try {
    const product = await apiRequest(`/api/products/${sku}`);
    
    if (product) {
      productName.value = product.name;
      shelfLife.value = product.shelf_life;
      reminderDays.value = product.reminder_days;
      productionDate.disabled = false;
      
      // 设置默认值为今天（本地时间）
      const today = new Date();
      productionDate.value = formatDateLocal(today);
      
      // 自动聚焦到生产日期
      setTimeout(() => {
        productionDate.focus();
        if ('showPicker' in HTMLInputElement.prototype) {
          try {
            productionDate.showPicker();
          } catch (err) {
            // 忽略错误
          }
        }
      }, 100);
      
      calculateDates();
      showAlert(`已找到商品：${product.name}，请选择生产日期`, 'success');
      
    } else {
      productName.value = '';
      shelfLife.value = '';
      reminderDays.value = '';
      productionDate.value = '';
      productionDate.disabled = true;
      
      clearResults();
      
      showAlert(`
        <div>
          <h5 class="mb-2"><i class="bi bi-info-circle"></i> 商品未找到</h5>
          <p>SKU "<strong>${sku}</strong>" 不在商品数据库中。</p>
          <div class="mt-3">
            <button class="btn btn-sm btn-primary me-2" onclick="switchToAddProductTab('${sku}')">
              <i class="bi bi-plus-circle"></i> 添加新商品
            </button>
            <button class="btn btn-sm btn-secondary" onclick="skuInput.focus(); skuInput.select();">
              <i class="bi bi-arrow-left"></i> 重新输入SKU
            </button>
          </div>
        </div>
      `, 'info');
    }
    
  } catch (error) {
    console.error('查询商品错误:', error);
    clearForm();
    
    if (error.message.includes('404') || error.message.includes('商品不存在')) {
      showAlert('该SKU商品不存在，请先在"新增商品"中添加', 'info');
    } else if (error.message.includes('未授权')) {
      // 已处理
    } else {
      showAlert(`查询失败: ${error.message}`, 'danger');
    }
  }
}

function switchToAddProductTab(sku) {
  const addTabButton = document.getElementById('add-tab');
  const addTabPane = document.getElementById('add');
  
  document.querySelectorAll('.nav-link').forEach(tab => tab.classList.remove('active'));
  document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('show', 'active'));
  
  addTabButton.classList.add('active');
  addTabPane.classList.add('show', 'active');
  
  searchSku.value = sku;
  searchProduct();
}

// ========== 新增商品管理 ==========
async function searchProduct() {
  const sku = searchSku.value.trim();
  
  if (!sku || sku.length !== 5) {
    showAlert('请输入5位SKU编码', 'warning');
    return;
  }
  
  try {
    const product = await apiRequest(`/api/products/${sku}`);
    
    if (product) {
      newSku.value = product.sku;
      newName.value = product.name;
      newShelfLife.value = product.shelf_life;
      newReminderDays.value = product.reminder_days;
      newLocation.value = product.location;
      
      isEditingProduct = true;
      currentEditingSku = sku;
      newSku.readOnly = true;
      addProductBtn.classList.add('d-none');
      updateProductBtn.classList.remove('d-none');
      
      showAlert(`已加载商品信息，可以修改`, 'success');
      
    } else {
      newSku.value = sku;
      newName.value = '';
      newShelfLife.value = '';
      newReminderDays.value = '';
      newLocation.value = '';
      
      isEditingProduct = false;
      currentEditingSku = '';
      newSku.readOnly = false;
      addProductBtn.classList.remove('d-none');
      updateProductBtn.classList.add('d-none');
      
      newName.focus();
      showAlert(`未找到商品，可以添加新商品`, 'info');
    }
    
  } catch (error) {
    console.error('搜索商品错误:', error);
    showAlert(`查询失败: ${error.message}`, 'danger');
  }
}

async function addNewProduct() {
  const sku = newSku.value.trim();
  const name = newName.value.trim();
  const shelfLifeVal = newShelfLife.value.trim();
  const reminderVal = newReminderDays.value.trim();
  const location = newLocation.value.trim();
  
  if (!sku || !name || !shelfLifeVal || !reminderVal || !location) {
    showAlert('请填写所有商品信息', 'warning');
    return;
  }
  
  if (sku.length !== 5) {
    showAlert('SKU必须为5位编码', 'warning');
    return;
  }
  
  const shelfLifeNum = parseInt(shelfLifeVal);
  const reminderNum = parseInt(reminderVal);
  
  if (isNaN(shelfLifeNum) || shelfLifeNum <= 0) {
    showAlert('请输入有效的保质期天数', 'warning');
    return;
  }
  
  if (isNaN(reminderNum) || reminderNum < 0) {
    showAlert('请输入有效的提醒天数', 'warning');
    return;
  }
  
  if (reminderNum > shelfLifeNum) {
    showAlert('临期提醒天数不能大于保质期天数', 'warning');
    return;
  }
  
  try {
    const product = {
      sku: sku,
      name: name,
      shelf_life: shelfLifeNum,
      reminder_days: reminderNum,
      location: location
    };
    
    const result = await apiRequest('/api/products', 'POST', product);
    
    showAlert('商品已成功添加到数据库', 'success');
    
    newSku.value = '';
    newName.value = '';
    newShelfLife.value = '';
    newReminderDays.value = '';
    newLocation.value = '';
    searchSku.value = '';
    
    renderProductDatabaseTable();
    
  } catch (error) {
    showAlert(`添加失败: ${error.message}`, 'danger');
  }
}

async function updateProduct() {
  const name = newName.value.trim();
  const shelfLifeVal = newShelfLife.value.trim();
  const reminderVal = newReminderDays.value.trim();
  const location = newLocation.value.trim();
  
  if (!name || !shelfLifeVal || !reminderVal || !location) {
    showAlert('请填写所有商品信息', 'warning');
    return;
  }
  
  const shelfLifeNum = parseInt(shelfLifeVal);
  const reminderNum = parseInt(reminderVal);
  
  if (isNaN(shelfLifeNum) || shelfLifeNum <= 0) {
    showAlert('请输入有效的保质期天数', 'warning');
    return;
  }
  
  if (isNaN(reminderNum) || reminderNum < 0) {
    showAlert('请输入有效的提醒天数', 'warning');
    return;
  }
  
  if (reminderNum > shelfLifeNum) {
    showAlert('临期提醒天数不能大于保质期天数', 'warning');
    return;
  }
  
  try {
    const product = {
      name: name,
      shelf_life: shelfLifeNum,
      reminder_days: reminderNum,
      location: location
    };
    
    await apiRequest(`/api/products/${currentEditingSku}`, 'PUT', product);
    showAlert('商品信息已更新', 'success');
    
    isEditingProduct = false;
    currentEditingSku = '';
    newSku.readOnly = false;
    addProductBtn.classList.remove('d-none');
    updateProductBtn.classList.add('d-none');
    
    newSku.value = '';
    newName.value = '';
    newShelfLife.value = '';
    newReminderDays.value = '';
    newLocation.value = '';
    searchSku.value = '';
    
    renderProductDatabaseTable();
    
  } catch (error) {
    showAlert(`更新失败: ${error.message}`, 'danger');
  }
}

// ========== 提示信息 ==========
function showAlert(message, type = 'info') {
  const alertTypes = {
    'info': 'alert-info',
    'success': 'alert-success',
    'warning': 'alert-warning',
    'danger': 'alert-danger'
  };
  
  const existingAlert = document.querySelector('.global-alert');
  if (existingAlert) {
    existingAlert.remove();
  }
  
  const alertDiv = document.createElement('div');
  alertDiv.className = `alert ${alertTypes[type]} alert-dismissible fade show global-alert position-fixed top-0 start-50 translate-middle-x mt-3`;
  alertDiv.style.cssText = `
    min-width: 300px;
    max-width: 90%;
    z-index: 1060;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  `;
  
  alertDiv.innerHTML = `
    <div class="d-flex align-items-center">
      <div class="flex-grow-1">${message}</div>
      <button type="button" class="btn-close ms-2" data-bs-dismiss="alert"></button>
    </div>
  `;
  
  document.body.appendChild(alertDiv);
  
  // 根据类型设置不同的消失时间
  const timeout = type === 'danger' ? 8000 : 5000;
  setTimeout(() => {
    if (alertDiv.parentNode) {
      alertDiv.remove();
    }
  }, timeout);
}

// ========== 表单操作 ==========
function clearForm() {
  productName.value = '';
  shelfLife.value = '';
  reminderDays.value = '';
  productionDate.value = '';
  productionDate.disabled = true;
  skuInput.focus();
  clearResults();
}

// ========== 日期计算（修复时区问题） ==========
function calculateDates() {
  if (!productionDate.value || !shelfLife.value) {
    return;
  }
  
  try {
    // 解析生产日期（本地时间）
    const [year, month, day] = productionDate.value.split('-').map(Number);
    const prodDate = new Date(year, month - 1, day);
    
    const shelfLifeDays = parseInt(shelfLife.value) || 0;
    const reminderDaysValue = parseInt(reminderDays.value) || 0;
    
    if (shelfLifeDays <= 0) {
      clearResults();
      return;
    }
    
    // 计算到期日期（本地时间）
    const expiryDateValue = new Date(prodDate);
    expiryDateValue.setDate(prodDate.getDate() + shelfLifeDays);
    
    // 计算提醒日期
    const reminderDateValue = new Date(expiryDateValue);
    reminderDateValue.setDate(expiryDateValue.getDate() - reminderDaysValue);
    
    // 获取今天本地时间的0点
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // 计算剩余天数（使用本地时间）
    const remainingDaysValue = Math.ceil((expiryDateValue - today) / (1000 * 60 * 60 * 24));
    
    // 显示结果
    expiryDate.textContent = formatDateLocal(expiryDateValue);
    reminderDate.textContent = formatDateLocal(reminderDateValue);
    remainingDays.textContent = remainingDaysValue > 0 ? 
      `${remainingDaysValue}天` : 
      '已过期';
    
    updateStatusIndicator(remainingDaysValue, shelfLifeDays);
    
  } catch (error) {
    console.error('日期计算错误:', error);
    clearResults();
  }
}

// ========== 保存商品记录（修复库位问题） ==========
async function saveProductRecord() {
  const sku = skuInput.value.trim();
  const prodDate = productionDate.value;
  
  if (!sku || sku.length !== 5) {
    showAlert('请输入有效的5位SKU编码', 'warning');
    return;
  }
  
  if (!prodDate) {
    showAlert('请选择生产日期', 'warning');
    return;
  }
  
  if (!productName.value || !shelfLife.value) {
    showAlert('请先查询商品信息', 'warning');
    return;
  }
  
  try {
    // 检查重复记录
    const records = await apiRequest(`/api/records/by-sku/${sku}`);
    const duplicate = records.find(record => record.production_date === prodDate);
    
    if (duplicate) {
      duplicateCheckResult = duplicate;
      
      const duplicateBody = document.getElementById('duplicateBody');
      duplicateBody.innerHTML = `
        <div class="alert alert-warning mb-0">
          <h5><i class="bi bi-exclamation-triangle"></i> 发现重复记录</h5>
          <p>相同SKU和生产日期的商品已存在于库存中：</p>
          <ul class="mb-2">
            <li><strong>商品名称：</strong>${duplicate.name}</li>
            <li><strong>SKU：</strong>${duplicate.sku}</li>
            <li><strong>生产日期：</strong>${duplicate.production_date}</li>
            <li><strong>当前位置：</strong>${duplicate.location}</li>
          </ul>
          <p class="mb-0 text-danger">是否继续添加？这将创建完全重复的记录。</p>
        </div>
      `;
      duplicateModal.show();
      return;
    }
    
    // 修复：从商品数据库获取库位信息
    const productLocation = await getProductLocation(sku);
    
    // 保存记录
    const record = {
      sku: sku,
      name: productName.value,
      production_date: prodDate,
      shelf_life: parseInt(shelfLife.value),
      reminder_days: parseInt(reminderDays.value),
      location: productLocation || '默认位置'
    };
    
    await apiRequest('/api/records', 'POST', record);
    
    showAlert('商品信息已成功保存', 'success');
    
    // 移动端优化
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => {
      skuInput.value = '';
      clearForm();
      skuInput.focus();
    }, 300);
    
    // 刷新表格
    renderExpiringTable();
    renderAllTable();
    
  } catch (error) {
    showAlert(`保存失败: ${error.message}`, 'danger');
  }
}

// ========== 重复记录处理 ==========
window.confirmDuplicate = function() {
  duplicateModal.hide();
  if (duplicateCheckResult) {
    const record = {
      sku: duplicateCheckResult.sku,
      name: duplicateCheckResult.name,
      production_date: duplicateCheckResult.production_date,
      shelf_life: duplicateCheckResult.shelf_life,
      reminder_days: duplicateCheckResult.reminder_days,
      location: duplicateCheckResult.location
    };
    
    apiRequest('/api/records', 'POST', record)
      .then(() => {
        showAlert('商品信息已成功保存（重复记录）', 'success');
        
        skuInput.value = '';
        clearForm();
        skuInput.focus();
        
        renderExpiringTable();
        renderAllTable();
      })
      .catch(error => {
        showAlert(`保存失败: ${error.message}`, 'danger');
      });
  }
  duplicateCheckResult = null;
};

window.cancelDuplicate = function() {
  duplicateModal.hide();
  duplicateCheckResult = null;
  productionDate.value = '';
  productionDate.focus();
};

// ========== 删除操作 ==========
async function deleteItem() {
  try {
    if (deleteType === 'product') {
      await apiRequest(`/api/products/${currentSelectedItem.sku}`, 'DELETE');
      showAlert('商品已从数据库删除', 'success');
      renderProductDatabaseTable();
    } else if (deleteType === 'record') {
      await apiRequest(`/api/records/${currentSelectedItem.sku}/${currentSelectedItem.production_date}`, 'DELETE');
      showAlert('库存记录已删除', 'success');
      renderExpiringTable();
      renderAllTable();
    }
    confirmModal.hide();
  } catch (error) {
    showAlert(`删除失败: ${error.message}`, 'danger');
  }
}

function showDeleteConfirm(item, type) {
  currentSelectedItem = item;
  deleteType = type;
  
  let modalTitle = document.getElementById('modalTitle');
  let modalBody = document.getElementById('modalBody');
  
  if (type === 'product') {
    modalTitle.textContent = '删除商品确认';
    modalBody.innerHTML = `
      <div class="alert alert-danger">
        <h5><i class="bi bi-exclamation-triangle"></i> 确定要删除商品吗？</h5>
        <p>以下商品将从商品数据库中永久删除：</p>
        <ul>
          <li><strong>商品名称：</strong>${item.name}</li>
          <li><strong>SKU编码：</strong>${item.sku}</li>
          <li><strong>保质期：</strong>${item.shelf_life}天</li>
          <li><strong>临期提醒：</strong>${item.reminder_days}天</li>
          <li><strong>存放位置：</strong>${item.location}</li>
        </ul>
        <div class="alert alert-warning mt-3">
          <i class="bi bi-info-circle"></i>
          <strong>注意：</strong>
          <ul class="mb-0 mt-1">
            <li>删除后无法恢复</li>
            <li>库存中已存在的该商品记录不会自动删除</li>
          </ul>
        </div>
      </div>
    `;
  } else if (type === 'record') {
    const remaining = calculateRemainingDaysLocal(item.production_date, item.shelf_life);
    let statusText = '正常';
    if (remaining <= 0) {
      statusText = '已过期';
    } else if (remaining <= item.reminder_days) {
      statusText = '临期';
    }
    
    modalTitle.textContent = '删除库存商品确认';
    modalBody.innerHTML = `
      <div class="alert alert-danger">
        <h5><i class="bi bi-exclamation-triangle"></i> 确定要删除库存商品吗？</h5>
        <p>以下商品将从库存中永久删除：</p>
        <ul>
          <li><strong>商品名称：</strong>${item.name}</li>
          <li><strong>SKU编码：</strong>${item.sku}</li>
          <li><strong>生产日期：</strong>${item.production_date}</li>
          <li><strong>保质期：</strong>${item.shelf_life}天</li>
          <li><strong>存放位置：</strong>${item.location}</li>
          <li><strong>状态：</strong>${statusText}</li>
        </ul>
        <div class="alert alert-warning mt-3">
          <i class="bi bi-info-circle"></i>
          <strong>注意：</strong>
          <ul class="mb-0 mt-1">
            <li>删除后无法恢复</li>
          </ul>
        </div>
      </div>
    `;
  }
  
  confirmModal.show();
}

function showEditModal(product) {
  switchToAddProductTab(product.sku);
}

// ========== 日期处理函数 ==========
function clearResults() {
  expiryDate.textContent = '-';
  reminderDate.textContent = '-';
  remainingDays.textContent = '-';
  statusIndicator.innerHTML = '';
}

// 格式化日期（本地时间） - 修复时区问题
function formatDateLocal(date) {
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
}

// 计算剩余天数（本地时间） - 修复时区问题
function calculateRemainingDaysLocal(productionDate, shelfLife) {
  try {
    // 解析生产日期
    const [year, month, day] = productionDate.split('-').map(Number);
    
    // 使用本地时间
    const prodDate = new Date(year, month - 1, day);
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
}

// 更新状态指示器
function updateStatusIndicator(remainingDaysVal, shelfLifeVal) {
  if (remainingDaysVal <= 0) {
    statusIndicator.innerHTML = `
      <div class="text-center text-danger" style="font-size: 0.9rem;">
        <i class="bi bi-exclamation-triangle"></i> 已过期
      </div>
    `;
    return;
  }
  
  const percentage = Math.min(100, Math.max(0, (remainingDaysVal / shelfLifeVal) * 100));
  const reminderDaysValue = parseInt(reminderDays.value) || 0;
  
  let statusClass, statusText;
  
  if (remainingDaysVal <= reminderDaysValue) {
    statusClass = 'text-warning';
    statusText = '<i class="bi bi-exclamation-triangle"></i> 临期';
  } else {
    statusClass = 'text-success';
    statusText = '<i class="bi bi-check-circle"></i> 正常';
  }
  
  statusIndicator.innerHTML = `
    <div style="height: 15px; border-radius: 8px; background: linear-gradient(90deg, #dc3545 0%, #ffc107 50%, #28a745 100%); position: relative;">
      <div style="position: absolute; top: -5px; left: ${percentage}%; width: 8px; height: 25px; background-color: #343a40; transform: translateX(-50%); border-radius: 4px;"></div>
    </div>
    <div class="text-center mt-2 ${statusClass}" style="font-size: 0.9rem;">${statusText}</div>
  `;
}

// ========== 表格渲染 - 已修改商品名称换行 ==========
async function renderExpiringTable() {
  try {
    const records = await apiRequest('/api/records/expiring');
    expiringTable.innerHTML = '';
    
    if (records.length === 0) {
      const row = document.createElement('tr');
      row.innerHTML = '<td colspan="8" class="text-center py-4">暂无临期商品</td>';
      expiringTable.appendChild(row);
      return;
    }
    
    records.forEach(record => {
      // 使用本地时间计算剩余天数
      const remainingDaysVal = calculateRemainingDaysLocal(record.production_date, record.shelf_life);
      let statusClass, statusText;
      
      if (remainingDaysVal <= 0) {
        statusClass = 'text-danger';
        statusText = '已过期';
      } else {
        statusClass = 'text-warning';
        statusText = '临期';
      }
      
      const row = document.createElement('tr');
      row.innerHTML = `
        <td class="table-cell">${record.sku}</td>
        <td class="product-name-cell">${record.name}</td>
        <td class="table-cell">${record.location || '默认位置'}</td>
        <td class="table-cell">${record.production_date}</td>
        <td class="table-cell">${formatDateLocal(new Date(record.production_date).getTime() + record.shelf_life * 24 * 60 * 60 * 1000)}</td>
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
  } catch (error) {
    console.error('加载临期商品失败:', error);
    expiringTable.innerHTML = '<tr><td colspan="8" class="text-center py-4">加载失败，请刷新页面</td></tr>';
  }
}

async function renderAllTable() {
  try {
    const records = await apiRequest('/api/records');
    
    if (records.length === 0) {
      allTable.innerHTML = '<tr><td colspan="8" class="text-center py-4">暂无库存商品</td></tr>';
      return;
    }
    
    // 按剩余天数排序（使用本地时间计算）
    records.sort((a, b) => {
      const aRemaining = calculateRemainingDaysLocal(a.production_date, a.shelf_life);
      const bRemaining = calculateRemainingDaysLocal(b.production_date, b.shelf_life);
      return aRemaining - bRemaining;
    });
    
    allTable.innerHTML = '';
    
    records.forEach(record => {
      const remainingDaysVal = calculateRemainingDaysLocal(record.production_date, record.shelf_life);
      let statusClass, statusText;
      
      if (remainingDaysVal <= 0) {
        statusClass = 'text-danger';
        statusText = '已过期';
      } else if (remainingDaysVal <= (record.reminder_days || 0)) {
        statusClass = 'text-warning';
        statusText = '临期';
      } else {
        statusClass = 'text-success';
        statusText = '正常';
      }
      
      const row = document.createElement('tr');
      row.innerHTML = `
        <td class="table-cell">${record.sku}</td>
        <td class="product-name-cell">${record.name}</td>
        <td class="table-cell">${record.location || '默认位置'}</td>
        <td class="table-cell">${record.production_date}</td>
        <td class="table-cell">${formatDateLocal(new Date(record.production_date).getTime() + record.shelf_life * 24 * 60 * 60 * 1000)}</td>
        <td class="table-cell">
          ${remainingDaysVal > 0 ? remainingDaysVal + '天' : '已过期'}
          ${remainingDaysVal > 0 && remainingDaysVal <= (record.reminder_days || 0) ? 
            `<span class="badge bg-warning ms-1">临期</span>` : ''}
        </td>
        <td class="table-cell ${statusClass}">
          <span class="status-indicator ${statusClass.replace('text-', 'status-')}"></span>
          ${statusText}
        </td>
        <td class="table-cell">
          <button class="btn btn-sm btn-danger" onclick="showDeleteConfirm(${JSON.stringify(record).replace(/"/g, '&quot;')}, 'record')">
            <i class="bi bi-trash"></i> 删除
          </button>
        </td>
      `;
      allTable.appendChild(row);
    });
  } catch (error) {
    console.error('加载所有商品失败:', error);
    allTable.innerHTML = '<tr><td colspan="8" class="text-center py-4">加载失败，请刷新页面</td></tr>';
  }
}

async function renderProductDatabaseTable() {
  try {
    const products = await apiRequest('/api/products');
    productDatabaseTable.innerHTML = '';
    
    if (products.length === 0) {
      const row = document.createElement('tr');
      row.innerHTML = '<td colspan="6" class="text-center py-4">暂无商品数据</td>';
      productDatabaseTable.appendChild(row);
      return;
    }
    
    products.forEach(product => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td class="table-cell">${product.sku}</td>
        <td class="product-name-cell">${product.name}</td>
        <td class="table-cell">${product.shelf_life}</td>
        <td class="table-cell">${product.reminder_days}</td>
        <td class="table-cell">${product.location}</td>
        <td class="table-cell">
          <button class="btn btn-sm btn-warning me-1" onclick="showEditModal(${JSON.stringify(product).replace(/"/g, '&quot;')})">
            <i class="bi bi-pencil"></i> 编辑
          </button>
          <button class="btn btn-sm btn-danger" onclick="showDeleteConfirm(${JSON.stringify(product).replace(/"/g, '&quot;')}, 'product')">
            <i class="bi bi-trash"></i> 删除
          </button>
        </td>
      `;
      productDatabaseTable.appendChild(row);
    });
  } catch (error) {
    console.error('加载商品数据库失败:', error);
    productDatabaseTable.innerHTML = '<tr><td colspan="6" class="text-center py-4">加载失败，请刷新页面</td></tr>';
  }
}

// ========== 全局函数导出 ==========
window.showDeleteConfirm = showDeleteConfirm;
window.showEditModal = showEditModal;
window.confirmDuplicate = confirmDuplicate;
window.cancelDuplicate = cancelDuplicate;
window.switchToAddProductTab = switchToAddProductTab;
