const express = require('express');
const cors = require('cors');
const session = require('express-session');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 8080;

// 中间件配置
app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('.'));

// 会话配置 - 修复登录过期问题
const sessionSecret = process.env.SESSION_SECRET || 'product-expiration-secret-key-change-in-production';
app.use(session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000, // 24小时
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
  },
  rolling: true // 每次请求刷新cookie过期时间
}));

// 请求日志中间件
app.use((req, res, next) => {
  if (req.url !== '/favicon.ico' && !req.url.startsWith('/api/auth/check')) {
    console.log(`📨 ${new Date().toISOString().slice(0, 19)} ${req.method} ${req.url} - UserID: ${req.session.userId || '未登录'}`);
  }
  next();
});

// 认证中间件
const authenticate = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: '未授权，请先登录' });
  }
  next();
};

// ========== 认证相关API ==========
// 用户注册
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, email } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }
    
    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({ error: '用户名长度应在3-20字符之间' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: '密码长度不能少于6位' });
    }
    
    const result = await db.createUser(username, password, email || '');
    
    if (!result.success) {
      return res.status(409).json({ error: result.error });
    }
    
    res.json({ 
      success: true, 
      message: '注册成功',
      userId: result.id 
    });
  } catch (error) {
    console.error('注册错误:', error);
    res.status(500).json({ error: '注册失败' });
  }
});

// 用户登录
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }
    
    const result = await db.authenticateUser(username, password);
    
    if (!result.success) {
      return res.status(401).json({ error: result.error });
    }
    
    // 设置会话
    req.session.userId = result.user.id;
    req.session.username = result.user.username;
    
    // 记录登录时间
    req.session.loginTime = new Date();
    
    console.log(`🔑 用户登录: ${username} (ID: ${result.user.id})`);
    
    res.json({ 
      success: true, 
      message: '登录成功',
      user: result.user 
    });
  } catch (error) {
    console.error('登录错误:', error);
    res.status(500).json({ error: '登录失败' });
  }
});

// 用户登出
app.post('/api/auth/logout', (req, res) => {
  const username = req.session.username;
  req.session.destroy((err) => {
    if (err) {
      console.error('登出错误:', err);
      return res.status(500).json({ error: '登出失败' });
    }
    console.log(`👋 用户登出: ${username}`);
    res.json({ success: true, message: '已登出' });
  });
});

// 检查登录状态
app.get('/api/auth/check', (req, res) => {
  if (req.session.userId) {
    // 检查会话是否有效（24小时内）
    const loginTime = req.session.loginTime ? new Date(req.session.loginTime) : new Date();
    const now = new Date();
    const hoursSinceLogin = (now - loginTime) / (1000 * 60 * 60);
    
    if (hoursSinceLogin > 24) {
      // 会话过期，清除
      req.session.destroy();
      return res.json({ 
        isLoggedIn: false,
        message: '会话已过期'
      });
    }
    
    res.json({ 
      isLoggedIn: true, 
      user: {
        id: req.session.userId,
        username: req.session.username
      },
      loginTime: req.session.loginTime
    });
  } else {
    res.json({ isLoggedIn: false });
  }
});

// ========== 商品数据库管理（需要认证） ==========
// 获取所有商品
app.get('/api/products', authenticate, async (req, res) => {
  try {
    const products = await db.getAllProducts(req.session.userId);
    res.json(products);
  } catch (error) {
    console.error('获取商品错误:', error);
    res.status(500).json({ error: error.message });
  }
});

// 根据SKU查找商品
app.get('/api/products/:sku', authenticate, async (req, res) => {
  try {
    const product = await db.getProductBySku(req.session.userId, req.params.sku);
    if (product) {
      res.json(product);
    } else {
      res.json(null);
    }
  } catch (error) {
    console.error('查找商品错误:', error);
    res.status(500).json({ error: error.message });
  }
});

// 添加商品
app.post('/api/products', authenticate, async (req, res) => {
  try {
    const product = req.body;
    
    if (!product.sku || !product.name || !product.shelf_life || !product.reminder_days || !product.location) {
      return res.status(400).json({ error: '缺少必要字段' });
    }
    
    if (product.sku.length !== 5) {
      return res.status(400).json({ error: 'SKU必须为5位编码' });
    }
    
    const result = await db.addProduct(req.session.userId, product);
    res.json({ 
      success: true, 
      id: result.id,
      message: '商品已成功添加到数据库'
    });
  } catch (error) {
    console.error('添加商品错误:', error);
    
    if (error.code === 'SQLITE_CONSTRAINT') {
      if (error.message.includes('UNIQUE constraint failed')) {
        return res.status(409).json({ 
          error: `SKU "${req.body.sku}" 已存在` 
        });
      }
    }
    
    res.status(500).json({ error: error.message || '添加商品失败' });
  }
});

// 更新商品
app.put('/api/products/:sku', authenticate, async (req, res) => {
  try {
    const product = req.body;
    const sku = req.params.sku;
    
    if (!product.name || !product.shelf_life || !product.reminder_days || !product.location) {
      return res.status(400).json({ error: '缺少必要字段' });
    }
    
    if (parseInt(product.reminder_days) > parseInt(product.shelf_life)) {
      return res.status(400).json({ error: '临期提醒天数不能大于保质期天数' });
    }
    
    const result = await db.updateProduct(req.session.userId, sku, product);
    res.json({ success: true, changes: result.changes });
  } catch (error) {
    console.error('更新商品错误:', error);
    res.status(500).json({ error: error.message });
  }
});

// 删除商品
app.delete('/api/products/:sku', authenticate, async (req, res) => {
  try {
    const result = await db.deleteProduct(req.session.userId, req.params.sku);
    res.json({ success: true, changes: result.changes });
  } catch (error) {
    console.error('删除商品错误:', error);
    res.status(500).json({ error: error.message });
  }
});

// ========== 库存记录管理（需要认证） ==========
// 获取所有库存记录
app.get('/api/records', authenticate, async (req, res) => {
  try {
    const sku = req.query.sku;
    let records;
    
    if (sku) {
      records = await db.getRecordsBySku(req.session.userId, sku);
    } else {
      records = await db.getAllProductRecords(req.session.userId);
    }
    
    res.json(records);
  } catch (error) {
    console.error('获取记录错误:', error);
    res.status(500).json({ error: error.message });
  }
});

// 根据SKU获取库存记录
app.get('/api/records/by-sku/:sku', authenticate, async (req, res) => {
  try {
    const records = await db.getRecordsBySku(req.session.userId, req.params.sku);
    res.json(records);
  } catch (error) {
    console.error('获取记录错误:', error);
    res.status(500).json({ error: error.message });
  }
});

// 获取临期商品
app.get('/api/records/expiring', authenticate, async (req, res) => {
  try {
    const records = await db.getExpiringProducts(req.session.userId);
    res.json(records);
  } catch (error) {
    console.error('获取临期商品错误:', error);
    res.status(500).json({ error: error.message });
  }
});

// 添加库存记录
app.post('/api/records', authenticate, async (req, res) => {
  try {
    const record = req.body;
    
    if (!record.sku || !record.name || !record.production_date || 
        !record.shelf_life || !record.reminder_days || !record.location) {
      return res.status(400).json({ error: '缺少必要字段' });
    }
    
    const result = await db.addProductRecord(req.session.userId, record);
    res.json({ 
      success: true, 
      id: result.id,
      message: '商品已成功添加到库存'
    });
  } catch (error) {
    console.error('添加记录错误:', error);
    
    if (error.code === 'SQLITE_CONSTRAINT') {
      if (error.message.includes('UNIQUE constraint failed')) {
        return res.status(409).json({ 
          error: `相同SKU和生产日期的记录已存在` 
        });
      }
    }
    
    res.status(500).json({ error: error.message || '添加库存记录失败' });
  }
});

// 删除库存记录
app.delete('/api/records/:sku/:productionDate', authenticate, async (req, res) => {
  try {
    const result = await db.deleteProductRecord(
      req.session.userId, 
      req.params.sku, 
      req.params.productionDate
    );
    res.json({ success: true, changes: result.changes });
  } catch (error) {
    console.error('删除记录错误:', error);
    res.status(500).json({ error: error.message });
  }
});

// ========== 数据管理 ==========
// 重置用户数据
app.post('/api/reset', authenticate, async (req, res) => {
  try {
    const result = await db.resetUserData(req.session.userId);
    res.json({ success: true, message: result.message });
  } catch (error) {
    console.error('重置数据错误:', error);
    res.status(500).json({ error: error.message });
  }
});

// 清理过期记录
app.post('/api/clean-expired', authenticate, async (req, res) => {
  try {
    const result = await db.cleanExpiredRecords(req.session.userId);
    res.json({ 
      success: true, 
      message: '已清理过期记录',
      changes: result.changes 
    });
  } catch (error) {
    console.error('清理过期记录错误:', error);
    res.status(500).json({ error: error.message });
  }
});

// ========== 测试和初始化 ==========
// 测试路由
app.get('/api/test', (req, res) => {
  res.json({ 
    message: 'API正常工作', 
    timestamp: new Date().toISOString(),
    version: '2.0.0',
    environment: process.env.NODE_ENV || 'development',
    sessionEnabled: true,
    userId: req.session.userId || '未登录'
  });
});

// 初始化测试数据
app.post('/api/initialize-test-data', authenticate, async (req, res) => {
  try {
    const testProducts = [
      { sku: '13607', name: '测试商品', shelf_life: 180, reminder_days: 7, location: 'A区1排1层' },
      { sku: '10001', name: '纯牛奶', shelf_life: 180, reminder_days: 7, location: '冷藏区1排' },
      { sku: '10002', name: '酸奶', shelf_life: 21, reminder_days: 3, location: '冷藏区2排' },
      { sku: '20001', name: '饼干', shelf_life: 365, reminder_days: 30, location: '干货区2排' },
      { sku: '30001', name: '矿泉水', shelf_life: 540, reminder_days: 60, location: '饮料区1排' }
    ];
    
    let addedCount = 0;
    for (const product of testProducts) {
      try {
        await db.addProduct(req.session.userId, product);
        addedCount++;
      } catch (error) {
        // 如果已存在，跳过
      }
    }
    
    res.json({ 
      success: true, 
      message: `已添加 ${addedCount} 个测试商品`,
      products: testProducts 
    });
  } catch (error) {
    console.error('初始化测试数据错误:', error);
    res.status(500).json({ error: error.message });
  }
});

// 会话信息
app.get('/api/session-info', (req, res) => {
  res.json({
    userId: req.session.userId,
    username: req.session.username,
    loginTime: req.session.loginTime,
    cookie: req.session.cookie,
    isLoggedIn: !!req.session.userId
  });
});

// ========== 静态文件服务 ==========
// 首页路由
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// 其他静态文件
app.get('*', (req, res) => {
  const filePath = path.join(__dirname, req.path);
  const fs = require('fs');
  if (fs.existsSync(filePath) && !filePath.endsWith('.html')) {
    res.sendFile(filePath);
  } else {
    res.sendFile(path.join(__dirname, 'index.html'));
  }
});

// 404处理
app.use((req, res) => {
  res.status(404).json({ 
    error: 'API端点不存在',
    method: req.method,
    url: req.url
  });
});

// 错误处理
app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  res.status(500).json({ 
    error: '服务器内部错误',
    message: err.message
  });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`🚀 服务器运行在端口 ${PORT}`);
  console.log(`📱 访问地址: http://localhost:${PORT}`);
  console.log('🔐 多用户系统已启用');
  console.log('💾 数据库使用持久化存储');
  console.log('🛑 按 Ctrl+C 停止服务器');
});

// 优雅关闭
process.on('SIGINT', async () => {
  console.log('\n🔄 正在关闭服务器...');
  try {
    await db.close();
    process.exit(0);
  } catch (error) {
    console.error('关闭服务器错误:', error);
    process.exit(1);
  }
});

module.exports = app;