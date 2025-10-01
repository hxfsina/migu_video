import { executeSQL, checkEnv } from './db.js';
import { fetchMiguCategory, saveVideoData } from './migu-api.js';

async function incrementalSyncAllCategories() {
  checkEnv();
  console.log('开始增量同步所有分类数据');
  
  const mainCategories = ['1000', '1001', '1005'];
  
  let successCount = 0;
  let totalNew = 0;
  let totalUpdated = 0;
  
  for (const cid of mainCategories) {
    console.log(`开始增量同步分类: ${cid}`);
    
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
      console.log(`分类 ${cid} 增量同步完成: 新增 ${newCount} 个, 更新 ${updatedCount} 个`);
      
    } catch (error) {
      console.error(`分类 ${cid} 增量同步失败:`, error);
      await executeSQL(`
        UPDATE sync_status SET status = 'error', error_message = ? 
        WHERE category_id = ?
      `, [error.message.substring(0, 500), cid]);
    }
    
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.log(`增量同步完成: 成功 ${successCount} 个分类, 新增 ${totalNew} 个视频, 更新 ${totalUpdated} 个视频`);
}

incrementalSyncAllCategories().catch(console.error);
