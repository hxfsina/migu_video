import { executeSQL, checkEnv } from './db.js';
import { fetchMiguCategory, saveVideoData } from './migu-api.js';

async function fullSyncAllCategories() {
  checkEnv();
  
  const pageLimit = parseInt(process.env.SYNC_PAGE_LIMIT) || 0;
  const delayMs = parseInt(process.env.SYNC_DELAY_MS) || 2000;
  
  // 根据 pageLimit 决定同步模式
  const syncMode = pageLimit === 1 ? '测试模式(每类1页)' : '全量模式(同步所有页面)';
  console.log(`开始全量同步所有分类数据 - ${syncMode}`);
  console.log(`页数限制: ${pageLimit === 1 ? '1页(测试)' : '无限制(全量)'}`);
  
  // 所有6个分类
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
  let totalVideos = 0;
  let totalPages = 0;
  
  for (const cid of allCategories) {
    const categoryName = categoryNames[cid] || cid;
    console.log(`\n🚀 开始同步分类: ${categoryName} (${cid})`);
    
    await executeSQL(`
      UPDATE sync_status 
      SET status = 'syncing', sync_type = 'full', last_sync = datetime('now')
      WHERE category_id = ?
    `, [cid]);
    
    try {
      let currentPage = 1;
      let categoryVideos = 0;
      let hasMoreData = true;
      
      while (hasMoreData) {
        // 检查页数限制：如果 pageLimit > 1 则无限制，否则限制为1页
        if (pageLimit === 1 && currentPage > 1) {
          console.log(`⏹️  测试模式，只同步第1页，停止同步`);
          break;
        }
        
        console.log(`📄 同步分类 ${categoryName} 第 ${currentPage} 页`);
        
        const videos = await fetchMiguCategory(cid, currentPage, 20);
        
        // 如果没有数据或数据为空，停止同步
        if (!videos || videos.length === 0) {
          console.log(`⏹️  分类 ${categoryName} 第 ${currentPage} 页无数据，停止同步`);
          hasMoreData = false;
          break;
        }
        
        let pageVideos = 0;
        for (const videoData of videos) {
          const success = await saveVideoData(videoData, cid);
          if (success) {
            pageVideos++;
            categoryVideos++;
          }
        }
        
        console.log(`✅ 分类 ${categoryName} 第 ${currentPage} 页同步完成: ${pageVideos} 个视频`);
        currentPage++;
        totalPages++;
        
        // 每次请求后延迟，避免过于频繁（最后一页不需要延迟）
        if (hasMoreData && (pageLimit !== 1 || currentPage <= 1)) {
          console.log(`⏳ 等待 ${delayMs}ms 后继续下一页...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
      
      const totalPagesForCategory = currentPage - 1;
      
      await executeSQL(`
        UPDATE sync_status 
        SET status = 'completed', last_page = ?, total_videos = ?, 
            total_pages = ?, last_sync = datetime('now')
        WHERE category_id = ?
      `, [totalPagesForCategory, categoryVideos, totalPagesForCategory, cid]);
      
      successCount++;
      totalVideos += categoryVideos;
      console.log(`🎉 分类 ${categoryName} 同步完成: ${categoryVideos} 个视频, ${totalPagesForCategory} 页`);
      
    } catch (error) {
      console.error(`❌ 分类 ${categoryName} 同步失败:`, error);
      await executeSQL(`
        UPDATE sync_status SET status = 'error', error_message = ? 
        WHERE category_id = ?
      `, [error.message.substring(0, 500), cid]);
    }
    
    // 分类间延迟
    if (cid !== allCategories[allCategories.length - 1]) {
      console.log(`⏳ 等待 3 秒后开始下一个分类...`);
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  
  console.log(`\n🎊 同步完成!`);
  console.log(`✅ 成功同步: ${successCount}/${allCategories.length} 个分类`);
  console.log(`📊 总计视频: ${totalVideos} 个`);
  console.log(`📄 总计页面: ${totalPages} 页`);
  console.log(`🎯 同步模式: ${pageLimit === 1 ? '测试模式(每类1页)' : '全量模式(所有页面)'}`);
}

fullSyncAllCategories().catch(console.error);
