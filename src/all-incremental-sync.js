import { executeSQL, checkEnv } from './db.js';
import { fetchMiguCategory, saveVideoData } from './migu-api.js';

// 带重试机制的获取分类数据函数
async function fetchMiguCategoryWithRetry(cid, page, pageSize, filters = {}, maxRetries = 3) {
  let retryCount = 0;
  
  while (retryCount < maxRetries) {
    try {
      const videos = await fetchMiguCategory(cid, page, pageSize, filters);
      return videos;
    } catch (error) {
      retryCount++;
      console.log(`❌ 第 ${retryCount} 次重试获取分类 ${cid} 第 ${page} 页数据失败:`, error.message);
      
      if (retryCount >= maxRetries) {
        console.log(`⏹️  达到最大重试次数 ${maxRetries}，放弃获取`);
        return [];
      }
      
      // 指数退避延迟：2秒, 4秒, 8秒...
      const delay = 2000 * Math.pow(2, retryCount - 1);
      console.log(`⏳ 等待 ${delay}ms 后重试...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  return [];
}

async function incrementalSyncAllCategories() {
  checkEnv();
  console.log('🎯 开始增量同步所有分类数据');
  console.log(`🔄 重试机制: 最多 3 次`);
  
  const allCategories = ['1000', '1001', '1005', '1002', '1007', '601382'];
  const categoryNames = {
    '1000': '电影', '1001': '电视剧', '1005': '综艺',
    '1002': '纪实', '1007': '动漫', '601382': '少儿'
  };
  
  let successCount = 0;
  let totalNew = 0;
  let totalUpdated = 0;
  
  for (const cid of allCategories) {
    const categoryName = categoryNames[cid] || cid;
    console.log(`\n🚀 开始增量同步分类: ${categoryName} (${cid})`);
    
    await executeSQL(`
      UPDATE sync_status 
      SET status = 'syncing', sync_type = 'incremental', last_sync = datetime('now')
      WHERE category_id = ?
    `, [cid]);
    
    try {
      let currentPage = 1;
      let hasMoreData = true;
      let categoryNew = 0;
      let categoryUpdated = 0;
      
      console.log(`📋 检查分类 ${categoryName} 的视频更新`);
      
      // 遍历所有页面，直到没有数据
      while (hasMoreData) {
        console.log(`📄 检查分类 ${categoryName} 第 ${currentPage} 页`);
        
        // 🔥 使用带重试机制的获取函数
        const videos = await fetchMiguCategoryWithRetry(cid, currentPage, 50);
        
        // 如果没有数据或数据为空，停止同步
        if (!videos || videos.length === 0) {
          console.log(`⏹️  分类 ${categoryName} 第 ${currentPage} 页无数据，停止同步`);
          hasMoreData = false;
          break;
        }
        
        console.log(`📥 获取到 ${videos.length} 个视频进行增量比对`);
        
        let pageNew = 0;
        let pageUpdated = 0;
        
        for (const videoData of videos) {
          // 🔥 直接使用 migu-api.js 的保存逻辑，它会自动判断新增还是更新
          const success = await saveVideoData(videoData, cid);
          
          if (success) {
            // 由于 saveVideoData 内部已经处理了新增和更新的判断
            // 我们这里简化统计，只统计成功保存的数量
            // 如果需要区分新增和更新，需要在 saveVideoData 中返回更多信息
            const existingResult = await executeSQL(
              'SELECT id FROM videos WHERE p_id = ?',
              [videoData.pID]
            );
            
            const isNewVideo = !existingResult?.result?.[0]?.results?.[0];
            
            if (isNewVideo) {
              pageNew++;
              categoryNew++;
              console.log(`🆕 新增视频: ${videoData.name || '未知'}`);
            } else {
              pageUpdated++;
              categoryUpdated++;
              console.log(`🔄 更新视频: ${videoData.name || '未知'}`);
            }
          }
        }
        
        console.log(`📊 第 ${currentPage} 页结果: 新增 ${pageNew} 个, 更新 ${pageUpdated} 个`);
        
        currentPage++;
        
        // 每次请求后延迟，避免过于频繁
        if (hasMoreData) {
          console.log(`⏳ 等待 2 秒后继续下一页...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      
      // 更新分类统计
      const totalResult = await executeSQL(
        'SELECT COUNT(*) as count FROM videos WHERE cont_display_type = ?',
        [cid]
      );
      
      let totalVideos = 0;
      if (totalResult && totalResult.result && totalResult.result[0] && totalResult.result[0].results) {
        totalVideos = totalResult.result[0].results[0].count || 0;
      }
      
      await executeSQL(`
        UPDATE sync_status 
        SET status = 'completed', total_videos = ?, last_sync = datetime('now')
        WHERE category_id = ?
      `, [totalVideos, cid]);
      
      successCount++;
      totalNew += categoryNew;
      totalUpdated += categoryUpdated;
      
      console.log(`✅ 分类 ${categoryName} 增量同步完成:`);
      console.log(`   新增视频: ${categoryNew} 个`);
      console.log(`   更新视频: ${categoryUpdated} 个`);
      console.log(`   检查页数: ${currentPage - 1} 页`);
      
    } catch (error) {
      console.error(`❌ 分类 ${categoryName} 增量同步失败:`, error);
      await executeSQL(`
        UPDATE sync_status SET status = 'error', error_message = ? 
        WHERE category_id = ?
      `, [error.message.substring(0, 500), cid]);
    }
    
    // 分类间延迟
    if (cid !== allCategories[allCategories.length - 1]) {
      console.log(`⏳ 等待 2 秒后开始下一个分类...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  console.log(`\n🎉 增量同步完成!`);
  console.log(`✅ 成功同步: ${successCount}/${allCategories.length} 个分类`);
  console.log(`🆕 新增视频: ${totalNew} 个`);
  console.log(`🔄 更新视频: ${totalUpdated} 个`);
  console.log(`📅 下次同步: 可定期运行`);
}

// 如果直接运行此文件，则执行增量同步
if (import.meta.url === `file://${process.argv[1]}`) {
  incrementalSyncAllCategories().catch(console.error);
}

// 导出函数供其他模块使用
export { incrementalSyncAllCategories };
