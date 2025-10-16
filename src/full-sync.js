import { executeSQL, checkEnv } from './db.js';
import { fetchMiguCategory, saveVideoData } from './migu-api.js';

async function fullSyncAllCategories() {
  checkEnv();
  
  // 直接写死：0=全量，1=测试，其他数字=限制页数
  const pageLimit = 0; // 0=全量同步所有页面，1=测试模式(1页)，5=最多5页
  const delayMs = 2000;
  
  // 根据 pageLimit 决定同步模式
  let syncMode = '';
  if (pageLimit === 0) {
    syncMode = '全量模式(所有页面)';
  } else if (pageLimit === 1) {
    syncMode = '测试模式(每类1页)';
  } else {
    syncMode = `限制模式(最多${pageLimit}页)`;
  }
  
  console.log(`🚀 开始全量同步所有分类数据 - ${syncMode}`);
  
  // 所有6个分类
  //const allCategories = ['1000', '1001', '1005', '1002', '1007', '601382'];
  const allCategories = ['1001'];
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
      let currentPage = 10;
      let categoryVideos = 0;
      let hasMoreData = true;
      
      while (hasMoreData) {
        // 检查页数限制
        if (pageLimit > 0 && currentPage > pageLimit) {
          console.log(`⏹️  达到页数限制 ${pageLimit} 页，停止同步`);
          break;
        }
        
        console.log(`📄 同步分类 ${categoryName} 第 ${currentPage} 页`);
        
        const videos = await fetchMiguCategory(cid, currentPage, 50);
        
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
        
        // 每次请求后延迟
        if (hasMoreData) {
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
  console.log(`🎯 同步模式: ${syncMode}`);
}

fullSyncAllCategories().catch(console.error);
