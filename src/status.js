
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
    
    // 正确的数据结构访问
    if (categoriesResult && categoriesResult.result && categoriesResult.result[0] && categoriesResult.result[0].results) {
      const categories = categoriesResult.result[0].results;
      categories.forEach(cat => {
        const statusIcon = cat.status === 'completed' ? '✅' : 
                          cat.status === 'syncing' ? '🔄' : 
                          cat.status === 'error' ? '❌' : '⚪';
        console.log(`  ${statusIcon} ${cat.name} (${cat.cid}): ${cat.video_count} 个视频`);
        console.log(`     状态: ${cat.status} | 最后同步: ${cat.last_sync || '从未'}`);
        if (cat.total_pages) {
          console.log(`     同步页数: ${cat.last_page || 0}/${cat.total_pages}`);
        }
      });
    } else {
      console.log('  没有找到分类数据');
    }
    
    // 获取视频总数 - 修复查询
    const totalResult = await executeSQL('SELECT COUNT(*) as total FROM videos');
    let totalVideos = 0;
    
    if (totalResult && totalResult.result && totalResult.result[0] && totalResult.result[0].results && totalResult.result[0].results.length > 0) {
      totalVideos = totalResult.result[0].results[0].total;
    }
    
    console.log(`\n📈 视频总计: ${totalVideos} 个`);

    // 在 status.js 中添加剧集统计：
const episodeStats = await executeSQL(`
  SELECT COUNT(*) as total_episodes, COUNT(DISTINCT video_id) as videos_with_episodes
  FROM episodes
`);
console.log(`剧集统计: ${episodeStats[0]?.results?.[0]?.total_episodes} 个剧集, ${episodeStats[0]?.results?.[0]?.videos_with_episodes} 个视频有剧集`);
    
    // 获取同步状态统计
    const syncStats = await executeSQL(`
      SELECT status, COUNT(*) as count 
      FROM sync_status 
      GROUP BY status
    `);
    
    if (syncStats && syncStats.result && syncStats.result[0] && syncStats.result[0].results) {
      console.log('\n🔄 同步状态统计:');
      syncStats.result[0].results.forEach(stat => {
        const icon = stat.status === 'completed' ? '✅' : 
                    stat.status === 'syncing' ? '🔄' : 
                    stat.status === 'error' ? '❌' : '⚪';
        console.log(`  ${icon} ${stat.status}: ${stat.count} 个分类`);
      });
    }
    
    // 显示最近同步的分类
    const recentSync = await executeSQL(`
      SELECT category_id, status, last_sync, sync_type 
      FROM sync_status 
      WHERE last_sync IS NOT NULL 
      ORDER BY last_sync DESC 
      LIMIT 3
    `);
    
    if (recentSync && recentSync.result && recentSync.result[0] && recentSync.result[0].results) {
      console.log('\n⏰ 最近同步的分类:');
      recentSync.result[0].results.forEach(sync => {
        console.log(`  ${sync.category_id}: ${sync.sync_type} 同步 - ${sync.last_sync}`);
      });
    }
    
  } catch (error) {
    console.error('❌ 状态检查失败:', error);
  }
}

checkStatus().catch(console.error);
