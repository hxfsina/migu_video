import { executeSQL, checkEnv } from './db.js';

async function checkStatus() {
  checkEnv();
  
  console.log('📊 数据库状态检查\n');
  
  try {
    // 检查各分类视频数量
    const categoriesResult = await executeSQL(`
      SELECT 
        c.cid,
        c.name,
        COUNT(v.id) as video_count,
        s.status,
        s.last_sync,
        s.sync_type,
        s.total_pages,
        s.last_page
      FROM categories c
      LEFT JOIN videos v ON v.cont_display_type = c.cid
      LEFT JOIN sync_status s ON s.category_id = c.cid
      GROUP BY c.cid, c.name
      ORDER BY c.cid
    `);
    
    console.log('各分类视频统计:');
    
    // 调试：查看返回的数据结构
    console.log('查询结果结构:', JSON.stringify(categoriesResult, null, 2).substring(0, 500));
    
    if (categoriesResult && categoriesResult.length > 0 && categoriesResult[0].results) {
      categoriesResult[0].results.forEach(cat => {
        console.log(`  ${cat.name} (${cat.cid}): ${cat.video_count} 个视频 - 状态: ${cat.status}`);
      });
    } else {
      console.log('  没有找到分类数据');
    }
    
    // 获取视频总数 - 修复查询
    const totalResult = await executeSQL('SELECT COUNT(*) as total FROM videos');
    console.log('总数查询结果:', JSON.stringify(totalResult, null, 2));
    
    let totalVideos = 0;
    if (totalResult && totalResult.length > 0 && totalResult[0].results && totalResult[0].results.length > 0) {
      totalVideos = totalResult[0].results[0].total;
    }
    
    console.log(`\n📈 视频总计: ${totalVideos} 个`);
    
    // 获取同步状态统计
    const syncStats = await executeSQL(`
      SELECT status, COUNT(*) as count 
      FROM sync_status 
      GROUP BY status
    `);
    
    if (syncStats && syncStats.length > 0 && syncStats[0].results) {
      console.log('\n🔄 同步状态统计:');
      syncStats[0].results.forEach(stat => {
        console.log(`  ${stat.status}: ${stat.count} 个分类`);
      });
    }
    
  } catch (error) {
    console.error('❌ 状态检查失败:', error);
  }
}

checkStatus().catch(console.error);
