import { executeSQL, checkEnv } from './db.js';

async function checkStatus() {
  checkEnv();
  
  console.log('📊 数据库状态检查\n');
  
  // 检查各分类视频数量
  const categories = await executeSQL(`
    SELECT 
      c.cid,
      c.name,
      COUNT(v.id) as video_count,
      s.status,
      s.last_sync
    FROM categories c
    LEFT JOIN videos v ON v.cont_display_type = c.cid
    LEFT JOIN sync_status s ON s.category_id = c.cid
    GROUP BY c.cid, c.name
    ORDER BY c.cid
  `);
  
  console.log('各分类视频统计:');
  categories[0]?.results?.forEach(cat => {
    console.log(`  ${cat.name} (${cat.cid}): ${cat.video_count} 个视频 - 状态: ${cat.status}`);
  });
  
  // 总计
  const total = await executeSQL('SELECT COUNT(*) as total FROM videos');
  console.log(`\n📈 视频总计: ${total[0]?.results?.[0]?.total} 个`);
}

checkStatus().catch(console.error);
