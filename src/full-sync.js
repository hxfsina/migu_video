import { executeSQL, checkEnv } from './db.js';
import { fetchMiguCategory, saveVideoData } from './migu-api.js';

async function fullSyncAllCategories() {
  checkEnv();
  console.log('开始全量同步所有分类数据');
  
  const pageLimit = parseInt(process.env.SYNC_PAGE_LIMIT) || 1;
  const delayMs = parseInt(process.env.SYNC_DELAY_MS) || 2000;
  
  console.log(`同步模式: 测试模式(每类1页), 页数限制: ${pageLimit}`);
  
  const mainCategories = ['1000', '1001', '1005'];
  
  let successCount = 0;
  let totalVideos = 0;
  
  for (const cid of mainCategories) {
    console.log(`开始全量同步分类: ${cid}`);
    
    await executeSQL(`
      UPDATE sync_status 
      SET status = 'syncing', sync_type = 'full', last_sync = datetime('now')
      WHERE category_id = ?
    `, [cid]);
    
    try {
      let currentPage = 1;
      let categoryVideos = 0;
      
      while (currentPage <= pageLimit) {
        console.log(`同步分类 ${cid} 第 ${currentPage} 页`);
        
        const videos = await fetchMiguCategory(cid, currentPage, 20);
        if (!videos || videos.length === 0) break;
        
        let pageVideos = 0;
        for (const videoData of videos) {
          const success = await saveVideoData(videoData, cid);
          if (success) {
            pageVideos++;
            categoryVideos++;
          }
        }
        
        console.log(`分类 ${cid} 第 ${currentPage} 页同步完成: ${pageVideos} 个视频`);
        currentPage++;
        
        if (currentPage <= pageLimit) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
      
      await executeSQL(`
        UPDATE sync_status 
        SET status = 'completed', last_page = ?, total_videos = ?, 
            total_pages = ?, last_sync = datetime('now')
        WHERE category_id = ?
      `, [currentPage - 1, categoryVideos, pageLimit, cid]);
      
      successCount++;
      totalVideos += categoryVideos;
      console.log(`分类 ${cid} 全量同步完成: ${categoryVideos} 个视频`);
      
    } catch (error) {
      console.error(`分类 ${cid} 全量同步失败:`, error);
      await executeSQL(`
        UPDATE sync_status SET status = 'error', error_message = ? 
        WHERE category_id = ?
      `, [error.message.substring(0, 500), cid]);
    }
    
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.log(`全量同步完成: 成功 ${successCount} 个分类, 总计 ${totalVideos} 个视频`);
}

fullSyncAllCategories().catch(console.error);
