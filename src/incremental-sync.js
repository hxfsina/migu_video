import { executeSQL, checkEnv } from './db.js';
import { fetchMiguCategory, saveVideoData } from './migu-api.js';

async function incrementalSyncAllCategories() {
  checkEnv();
  console.log('开始增量同步所有分类数据');
  
  // 更新为所有6个分类
  const allCategories = ['1000', '1001', '1005', '1002', '1007', '601382'];
  const categoryNames = {
    '1000': '电影',
    '1001': '电视剧', 
    '1005': '综艺',
    '1002': '纪实',
    '1007': '动漫',
    '601382': '少儿'
  };
  
  let successCount = 0;
  let totalNew = 0;
  let totalUpdated = 0;
  
  for (const cid of allCategories) {
    const categoryName = categoryNames[cid] || cid;
    console.log(`开始增量同步分类: ${categoryName} (${cid})`);
    
    await executeSQL(`
      UPDATE sync_status 
      SET status = 'syncing', sync_type = 'incremental', last_sync = datetime('now')
      WHERE category_id = ?
    `, [cid]);
    
    try {
      const videos = await fetchMiguCategory(cid, 1, 20);
      let newCount = 0;
      let updatedCount = 0;
      
      if (videos && videos.length > 0) {
        const existingResult = await executeSQL(
          'SELECT p_id, source_publish_time, source_publish_timestamp FROM videos WHERE cont_display_type = ?',
          [cid]
        );
        
        const existingVideos = {};
        existingResult[0]?.results?.forEach(video => {
          existingVideos[video.p_id] = {
            source_publish_time: video.source_publish_time,
            source_publish_timestamp: video.source_publish_timestamp
          };
        });
        
        for (const videoData of videos) {
          const videoId = videoData.pID;
          const publishTime = videoData.publishTime || '';
          const publishTimestamp = videoData.publishTimestamp || '';
          
          const existingVideo = existingVideos[videoId];
          
          if (existingVideo) {
            const needsUpdate = 
              existingVideo.source_publish_time !== publishTime ||
              existingVideo.source_publish_timestamp !== publishTimestamp;
            
            if (needsUpdate) {
              await saveVideoData(videoData, cid);
              updatedCount++;
            }
          } else {
            await saveVideoData(videoData, cid);
            newCount++;
          }
        }
      }
      
      const totalResult = await executeSQL(
        'SELECT COUNT(*) as count FROM videos WHERE cont_display_type = ?',
        [cid]
      );
      
      const totalVideos = totalResult[0]?.results?.[0]?.count || 0;
      
      await executeSQL(`
        UPDATE sync_status 
        SET status = 'completed', last_page = ?, total_videos = ?, 
            last_sync = datetime('now')
        WHERE category_id = ?
      `, [1, totalVideos, cid]);
      
      successCount++;
      totalNew += newCount;
      totalUpdated += updatedCount;
      console.log(`✅ 分类 ${categoryName} 增量同步完成: 新增 ${newCount} 个, 更新 ${updatedCount} 个`);
      
    } catch (error) {
      console.error(`❌ 分类 ${categoryName} 增量同步失败:`, error);
      await executeSQL(`
        UPDATE sync_status SET status = 'error', error_message = ? 
        WHERE category_id = ?
      `, [error.message.substring(0, 500), cid]);
    }
    
    // 分类间延迟
    if (cid !== allCategories[allCategories.length - 1]) {
      console.log(`等待 2 秒后开始下一个分类...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  console.log(`🎉 增量同步完成: 成功 ${successCount}/${allCategories.length} 个分类, 新增 ${totalNew} 个视频, 更新 ${totalUpdated} 个视频`);
}

incrementalSyncAllCategories().catch(console.error);
