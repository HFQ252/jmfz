const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

class Database {
  constructor() {
    // Zeabur环境下使用挂载的持久化存储路径
    // 如果挂载路径不存在，则创建目录
    const dbDir = process.env.DATABASE_DIR || '/data';
    
    // 确保目录存在
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
      console.log(`📁 创建数据库目录: ${dbDir}`);
    }
    
    const dbPath = path.join(dbDir, 'product_expiry.db');
    console.log(`📊 数据库路径: ${dbPath}`);
    
    this.db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('❌ 数据库连接错误:', err.message);
      } else {
        console.log('✅ 已连接到SQLite数据库');
        this.initializeDatabase();
      }
    });
  }

  // 初始化数据库
  async initializeDatabase() {
    try {
      // 1. 创建用户表
      await this.run(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          email TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 2. 创建商品表
      await this.run(`
        CREATE TABLE IF NOT EXISTS products (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          sku TEXT NOT NULL,
          name TEXT NOT NULL,
          shelf_life INTEGER NOT NULL,
          reminder_days INTEGER NOT NULL,
          location TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users (id),
          UNIQUE(user_id, sku)
        )
      `);

      // 3. 创建商品记录表
      await this.run(`
        CREATE TABLE IF NOT EXISTS product_records (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          sku TEXT NOT NULL,
          name TEXT NOT NULL,
          production_date DATE NOT NULL,
          shelf_life INTEGER NOT NULL,
          reminder_days INTEGER NOT NULL,
          location TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users (id),
          UNIQUE(user_id, sku, production_date)
        )
      `);

      // 4. 创建索引
      await this.run('CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)');
      await this.run('CREATE INDEX IF NOT EXISTS idx_products_user_sku ON products(user_id, sku)');
      await this.run('CREATE INDEX IF NOT EXISTS idx_records_user_sku ON product_records(user_id, sku)');
      await this.run('CREATE INDEX IF NOT EXISTS idx_records_expiry ON product_records(production_date, shelf_life)');

      console.log('✅ 数据库表初始化完成');

      // 创建默认管理员账户
      const adminExists = await this.get('SELECT id FROM users WHERE username = ?', ['admin']);
      if (!adminExists) {
        const hashedPassword = bcrypt.hashSync('admin123', 10);
        await this.run(
          'INSERT INTO users (username, password, email) VALUES (?, ?, ?)',
          ['admin', hashedPassword, 'admin@example.com']
        );
        console.log('✅ 创建默认管理员账户: admin / admin123');
      }

    } catch (error) {
      console.error('❌ 数据库初始化错误:', error);
    }
  }

  // 数据库操作封装
  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, changes: this.changes });
        }
      });
    });
  }

  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, result) => {
        if (err) {
          reject(err);
        } else {
          resolve(result);
        }
      });
    });
  }

  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  // 用户管理方法
  async createUser(username, password, email = '') {
    const hashedPassword = bcrypt.hashSync(password, 10);
    try {
      const result = await this.run(
        'INSERT INTO users (username, password, email) VALUES (?, ?, ?)',
        [username, hashedPassword, email]
      );
      return { success: true, id: result.id };
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT') {
        return { success: false, error: '用户名已存在' };
      }
      throw error;
    }
  }

  async authenticateUser(username, password) {
    try {
      const user = await this.get('SELECT * FROM users WHERE username = ?', [username]);
      if (!user) {
        return { success: false, error: '用户不存在' };
      }

      const isValid = bcrypt.compareSync(password, user.password);
      if (!isValid) {
        return { success: false, error: '密码错误' };
      }

      // 不返回密码
      delete user.password;
      return { success: true, user };
    } catch (error) {
      throw error;
    }
  }

  async getUserById(id) {
    return this.get('SELECT id, username, email, created_at FROM users WHERE id = ?', [id]);
  }

  // 商品管理方法（带用户ID）
  async getAllProducts(userId) {
    return this.all('SELECT * FROM products WHERE user_id = ? ORDER BY sku', [userId]);
  }

  async getProductBySku(userId, sku) {
    return this.get('SELECT * FROM products WHERE user_id = ? AND sku = ?', [userId, sku]);
  }

  async addProduct(userId, product) {
    const { sku, name, shelf_life, reminder_days, location } = product;
    return this.run(
      'INSERT INTO products (user_id, sku, name, shelf_life, reminder_days, location) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, sku, name, shelf_life, reminder_days, location]
    );
  }

  async updateProduct(userId, sku, product) {
    const { name, shelf_life, reminder_days, location } = product;
    return this.run(
      'UPDATE products SET name = ?, shelf_life = ?, reminder_days = ?, location = ? WHERE user_id = ? AND sku = ?',
      [name, shelf_life, reminder_days, location, userId, sku]
    );
  }

  async deleteProduct(userId, sku) {
    return this.run('DELETE FROM products WHERE user_id = ? AND sku = ?', [userId, sku]);
  }

  // 库存记录方法（带用户ID）
  async getAllProductRecords(userId) {
    return this.all(`
      SELECT * FROM product_records 
      WHERE user_id = ? 
      ORDER BY 
        CASE 
          WHEN date(production_date, '+' || shelf_life || ' days') < date('now') THEN 0
          WHEN date(production_date, '+' || shelf_life || ' days') <= date('now', '+' || reminder_days || ' days') THEN 1
          ELSE 2
        END,
        date(production_date, '+' || shelf_life || ' days') ASC
    `, [userId]);
  }

  async getRecordsBySku(userId, sku) {
    return this.all('SELECT * FROM product_records WHERE user_id = ? AND sku = ?', [userId, sku]);
  }

  async getExpiringProducts(userId) {
    return this.all(`
      SELECT *, 
        julianday(date(production_date, '+' || shelf_life || ' days')) - julianday('now') as remaining_days
      FROM product_records 
      WHERE user_id = ?
        AND date(production_date, '+' || shelf_life || ' days') <= date('now', '+' || reminder_days || ' days')
      ORDER BY date(production_date, '+' || shelf_life || ' days') ASC
    `, [userId]);
  }

  async addProductRecord(userId, record) {
    const { sku, name, production_date, shelf_life, reminder_days, location } = record;
    return this.run(
      `INSERT INTO product_records 
       (user_id, sku, name, production_date, shelf_life, reminder_days, location) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, sku, name, production_date, shelf_life, reminder_days, location]
    );
  }

  async deleteProductRecord(userId, sku, productionDate) {
    return this.run(
      'DELETE FROM product_records WHERE user_id = ? AND sku = ? AND production_date = ?',
      [userId, sku, productionDate]
    );
  }

  // 数据清理
  async cleanExpiredRecords(userId) {
    return this.run(
      'DELETE FROM product_records WHERE user_id = ? AND date(production_date, "+" || shelf_life || " days") < date("now", "-30 days")',
      [userId]
    );
  }

  // 重置用户数据（保留用户账户）
  async resetUserData(userId) {
    try {
      await this.run('DELETE FROM products WHERE user_id = ?', [userId]);
      await this.run('DELETE FROM product_records WHERE user_id = ?', [userId]);
      return { success: true, message: '用户数据已重置' };
    } catch (error) {
      throw error;
    }
  }

  // 关闭数据库连接
  close() {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) {
          reject(err);
        } else {
          console.log('✅ 数据库连接已关闭');
          resolve();
        }
      });
    });
  }
}

// 导出单例实例
const db = new Database();
module.exports = db;