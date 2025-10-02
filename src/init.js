import { executeSQL, checkEnv } from './db.js';

async function initDatabase() {
  checkEnv();
  console.log('开始初始化数据库...');
  
  // 🔥 修复：清空所有表数据
  const tables = ['episodes', 'search_index', 'videos', 'sync_status', 'categories', 'home_videos'];
  
  for (const table of tables) {
    try {
      await executeSQL(`DELETE FROM ${table}`);
      console.log(`✅ 清空表 ${table} 成功`);
    } catch (error) {
      console.log(`⚠️  清空表 ${table} 失败（可能不存在）: ${error.message}`);
    }
  }
  
  // 重置自增ID
  try {
    await executeSQL(`DELETE FROM sqlite_sequence`);
    console.log('✅ 重置自增ID成功');
  } catch (error) {
    console.log('⚠️  重置自增ID失败（可能不存在）');
  }
  
  // 初始化分类数据
  const categories = [
    { cid: '1000', name: '电影', description: '电影内容' },
    { cid: '1001', name: '电视剧', description: '电视剧内容' },
    { cid: '1005', name: '综艺', description: '综艺节目' },
    { cid: '1002', name: '纪实', description: '纪实内容' },
    { cid: '1007', name: '动漫', description: '动漫内容' },
    { cid: '601382', name: '少儿', description: '少儿内容' },
    { cid: 'migu_4k', name: '4K专区', description: '4K超清内容' }
  ];
  
  for (const category of categories) {
    await executeSQL(`
      INSERT INTO categories (cid, name, description, filters)
      VALUES (?, ?, ?, ?)
    `, [category.cid, category.name, category.description, '{}']);
    console.log(`✅ 插入分类 ${category.name} (${category.cid}) 成功`);
  }
  
  // 初始化同步状态
  for (const category of categories) {
    await executeSQL(`
      INSERT INTO sync_status (category_id, status, sync_type)
      VALUES (?, 'idle', 'none')
    `, [category.cid]);
    console.log(`✅ 初始化分类 ${category.cid} 同步状态成功`);
  }
  
  console.log('🎉 数据库初始化完成');
}

initDatabase().catch(console.error);
