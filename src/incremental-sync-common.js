import { executeSQL, checkEnv } from './db.js';
import { fetchMiguCategory, saveVideoData } from './migu-api.js';

/**
 * 通用增量同步函数
 * @param {Object} config 同步配置
 * @param {string} config.syncName 同步名称（用于日志）
 * @param {string} config.syncType 同步类型（用于数据库记录）
 * @param {Array} config.categories 分类ID数组
 * @param {Object} config.categoryNames 分类名称映射
 * @param {Function} config.getExistingVideosQuery 获取现有视频的查询函数
 * @param {Function} config.fetchVideos 获取新视频的函数
 * @param {Function} config.getTotalCountQuery 获取总数的查询函数
 */
export async function incrementalSync(config) {
  checkEnv();
  console.log(`开始${config.syncName}增量同步`);
  
  const {
    syncName,
    syncType,
    categories,
    categoryNames,
    getExistingVideosQuery,
    fetchVideos,
    getTotalCountQuery
  } = config;
  
  let successCount = 0;
  let totalNew = 0;
  let totalUpdated = 0;
  
  for (const cid of categories) {
    const categoryName = categoryNames[cid] || cid;
    console.log(`\n开始增量同步分类: ${categoryName} (${cid}) - ${syncName}`);
    
    await executeSQL(`
      UPDATE sync_status 
      SET status = 'syncing', sync_type = ?, last_sync = datetime('now')
      WHERE category_id = ?
    `, [syncType, cid]);
    
    try {
      let currentPage = 1;
      let hasMoreData = true;
      let categoryNew = 0;
      let categoryUpdated = 0;
      
      // 获取该分类下已存在的视频ID
      const existingResult = await getExistingVideosQuery(cid);
      
      const existingVideos = {};
      if (existingResult && existingResult.result && existingResult.result[0] && existingResult.result[0].results) {
        existingResult.result[0].results.forEach(video => {
          existingVideos[video.p_id] = {
            update_ep: video.update_ep,
            total_episodes: video.total_episodes
          };
        });
      }
      
      console.log(`数据库中已有 ${Object.keys(existingVideos).length} 个 ${categoryName} ${syncName}视频`);
      
      // 遍历所有页面，直到没有数据
      while (hasMoreData) {
        console.log(`📄 检查分类 ${categoryName} 第 ${currentPage} 页 - ${syncName}`);
        
        const videos = await fetchVideos(cid, currentPage);
        
        // 如果没有数据或数据为空，停止同步
        if (!videos || videos.length === 0) {
          console.log(`⏹️  分类 ${categoryName} 第 ${currentPage} 页无数据，停止同步`);
          hasMoreData = false;
          break;
        }
        
        console.log(`获取到 ${videos.length} 个${syncName}视频进行增量比对`);
        
        let pageNew = 0;
        let pageUpdated = 0;
        
        for (const videoData of videos) {
          const videoId = videoData.pID;
          const isNewVideo = !existingVideos[videoId];
          
          if (isNewVideo) {
            // 新视频
            await saveVideoData(videoData, cid);
            pageNew++;
            categoryNew++;
            console.log(`🆕 新增${syncName}视频: ${videoData.name || '未知'}`);
          } else {
            // 已存在视频 - 检查是否需要更新
            const existingVideo = existingVideos[videoId];
            const needsUpdate = checkIfVideoNeedsUpdate(videoData, existingVideo);
            
            if (needsUpdate) {
              await saveVideoData(videoData, cid);
              pageUpdated++;
              categoryUpdated++;
              console.log(`🔄 更新${syncName}视频: ${videoData.name || '未知'}`);
            }
          }
        }
        
        console.log(`📊 第 ${currentPage} 页结果: 新增 ${pageNew} 个, 更新 ${pageUpdated} 个`);
        
        currentPage++;
        
        // 每次请求后延迟，避免过于频繁
        if (hasMoreData) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      
      // 更新分类统计
      const totalResult = await getTotalCountQuery(cid);
      
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
      
      console.log(`✅ 分类 ${categoryName} ${syncName}增量同步完成:`);
      console.log(`   新增视频: ${categoryNew} 个`);
      console.log(`   更新视频: ${categoryUpdated} 个`);
      console.log(`   检查页数: ${currentPage - 1} 页`);
      
    } catch (error) {
      console.error(`❌ 分类 ${categoryName} ${syncName}增量同步失败:`, error);
      await executeSQL(`
        UPDATE sync_status SET status = 'error', error_message = ? 
        WHERE category_id = ?
      `, [error.message.substring(0, 500), cid]);
    }
    
    // 分类间延迟
    if (cid !== categories[categories.length - 1]) {
      console.log(`等待 2 秒后开始下一个分类...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  console.log(`\n🎉 ${syncName}增量同步完成:`);
  console.log(`   成功同步: ${successCount}/${categories.length} 个分类`);
  console.log(`   新增视频: ${totalNew} 个`);
  console.log(`   更新视频: ${totalUpdated} 个`);
}

// 检查视频是否需要更新
export function checkIfVideoNeedsUpdate(videoData, existingVideo) {
  const newUpdateEP = videoData.updateEP || '';
  const existingUpdateEP = existingVideo.update_ep || '';
  
  // 1. 如果剧集已完结，不需要更新
  if (isSeriesCompleted(newUpdateEP)) {
    return false;
  }
  
  // 2. 如果剧集还在更新中，检查集数信息是否变化
  if (isSeriesUpdating(newUpdateEP)) {
    // 检查集数信息是否变化
    if (newUpdateEP !== existingUpdateEP) {
      return true;
    }
    
    // 检查总集数是否变化
    const newTotalEpisodes = calculateTotalEpisodes(videoData);
    const existingTotalEpisodes = existingVideo.total_episodes;
    
    if (newTotalEpisodes !== existingTotalEpisodes) {
      return true;
    }
    
    return false;
  }
  
  // 3. 其他情况（可能是电影等非剧集类），使用原来的逻辑
  const newTotalEpisodes = calculateTotalEpisodes(videoData);
  
  if (newUpdateEP !== existingUpdateEP || newTotalEpisodes !== existingVideo.total_episodes) {
    return true;
  }
  
  return false;
}

// 判断剧集是否已完结
export function isSeriesCompleted(updateEP) {
  const completedKeywords = ['全集', '已完结', '集全', '全'];
  return completedKeywords.some(keyword => updateEP.includes(keyword));
}

// 判断剧集是否在更新中
export function isSeriesUpdating(updateEP) {
  const updatingKeywords = ['更新', '更新至', '连载', '热播'];
  return updatingKeywords.some(keyword => updateEP.includes(keyword));
}

// 计算总集数
export function calculateTotalEpisodes(videoData) {
  const updateEP = videoData.updateEP || '';
  
  if (updateEP.includes('集全')) {
    const match = updateEP.match(/(\d+)集全/);
    return match ? parseInt(match[1]) : 1;
  } else if (updateEP.includes('更新至')) {
    const match = updateEP.match(/更新至(\d+)集/);
    return match ? parseInt(match[1]) : 1;
  } else if (updateEP && /\d+集/.test(updateEP)) {
    const match = updateEP.match(/(\d+)集/);
    return match ? parseInt(match[1]) : 1;
  }
  
  return 1;
}
