import { executeSQL, checkEnv } from './db.js';

async function debugSimple() {
  checkEnv();
  
  console.log('🔍 简单调试剧集问题...\n');
  
  try {
    // 1. 检查表结构
    console.log('1. 检查表结构...');
    const videosColumns = await executeSQL("PRAGMA table_info(videos)");
    const episodesColumns = await executeSQL("PRAGMA table_info(episodes)");
    
    console.log('videos表字段:');
    if (videosColumns?.result?.[0]?.results) {
      videosColumns.result[0].results.forEach(col => {
        if (col.name === 'video_type') {
          console.log(`  ✅ ${col.name} (${col.type}) - 存在`);
        } else {
          console.log(`  ${col.name} (${col.type})`);
        }
      });
    }
    
    console.log('\nepisodes表字段:');
    if (episodesColumns?.result?.[0]?.results) {
      episodesColumns.result[0].results.forEach(col => {
        console.log(`  ${col.name} (${col.type})`);
      });
    }
    
    // 2. 检查数据
    console.log('\n2. 检查数据...');
    const videoCount = await executeSQL("SELECT COUNT(*) as count FROM videos");
    const episodeCount = await executeSQL("SELECT COUNT(*) as count FROM episodes");
    
    console.log(`视频数量: ${videoCount?.result?.[0]?.results?.[0]?.count || 0}`);
    console.log(`剧集数量: ${episodeCount?.result?.[0]?.results?.[0]?.count || 0}`);
    
    // 3. 检查是否有 video_type 数据
    console.log('\n3. 检查 video_type 数据...');
    const videoTypes = await executeSQL("SELECT video_type, COUNT(*) as count FROM videos GROUP BY video_type");
    if (videoTypes?.result?.[0]?.results) {
      videoTypes.result[0].results.forEach(row => {
        console.log(`  ${row.video_type}: ${row.count} 个视频`);
      });
    }
    
    // 4. 查看前几个视频的详细信息
    console.log('\n4. 查看视频示例...');
    const sampleVideos = await executeSQL(`
      SELECT p_id, name, video_type, update_ep, total_episodes 
      FROM videos 
      LIMIT 3
    `);
    
    if (sampleVideos?.result?.[0]?.results) {
      sampleVideos.result[0].results.forEach(video => {
        console.log(`  ${video.name} (${video.p_id})`);
        console.log(`    类型: ${video.video_type}, 更新: ${video.update_ep}, 总集数: ${video.total_episodes}`);
      });
    }
    
    // 5. 检查外键约束
    console.log('\n5. 检查外键约束...');
    const foreignKeys = await executeSQL("PRAGMA foreign_key_list(episodes)");
    if (foreignKeys?.result?.[0]?.results?.length > 0) {
      console.log('  ✅ episodes 表有外键约束');
    } else {
      console.log('  ❌ episodes 表没有外键约束');
    }
    
  } catch (error) {
    console.error('调试失败:', error);
  }
}

debugSimple().catch(console.error);
