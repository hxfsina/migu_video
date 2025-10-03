import { executeSQL, checkEnv } from './db.js';
import { fetchMiguCategory, saveVideoData } from './migu-api.js';

async function incrementalSyncMemberVideos() {
  checkEnv();
  console.log('开始增量同步会员视频数据');
  
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
    console.log(`\n开始增量同步分类: ${categoryName} (${cid}) - 仅会员视频`);
    
    await executeSQL(`
      UPDATE sync_status 
      SET status = 'syncing', sync_type = 'incremental_member', last_sync = datetime('now')
      WHERE category_id = ?
    `, [cid]);
    
    try {
      let currentPage = 1;
      let hasMoreData = true;
      let categoryNew = 0;
      let categoryUpdated = 0;
      
      // 获取该分类下已存在的会员视频ID
      const existingResult = await executeSQL(
        'SELECT p_id, update_ep, total_episodes FROM videos WHERE cont_display_type = ? AND way = ?',
        [cid, '2']
      );
      
      const existingVideos = {};
      if (existingResult && existingResult.result && existingResult.result[0] && existingResult.result[0].results) {
        existingResult.result[0].results.forEach(video => {
          existingVideos[video.p_id] = {
            update_ep: video.update_ep,
            total_episodes: video.total_episodes
          };
        });
      }
      
      console.log(`数据库中已有 ${Object.keys(existingVideos).length} 个 ${categoryName} 会员视频`);
      
      // 遍历所有页面，直到没有数据
      while (hasMoreData) {
        console.log(`📄 检查分类 ${categoryName} 第 ${currentPage} 页 - 会员视频`);
        
        // 使用会员视频的API参数
        const videos = await fetchMiguCategory(cid, currentPage, 20, { payType: '2' });
        
        // 如果没有数据或数据为空，停止同步
        if (!videos || videos.length === 0) {
          console.log(`⏹️  分类 ${categoryName} 第 ${currentPage} 页无数据，停止同步`);
          hasMoreData = false;
          break;
        }
        
        console.log(`获取到 ${videos.length} 个会员视频进行增量比对`);
        
        let pageNew = 0;
        let pageUpdated = 0;
        
        for (const videoData of videos) {
          const videoId = videoData.pID;
          const isNewVideo = !existingVideos[videoId];
          
          if (isNewVideo) {
            // 新会员视频
            await saveVideoData(videoData, cid);
            pageNew++;
            categoryNew++;
            console.log(`🆕 新增会员视频: ${videoData.name || '未知'}`);
          } else {
            // 已存在会员视频 - 检查是否需要更新
            const existingVideo = existingVideos[videoId];
            const needsUpdate = checkIfVideoNeedsUpdate(videoData, existingVideo);
            
            if (needsUpdate) {
              await saveVideoData(videoData, cid);
              pageUpdated++;
              categoryUpdated++;
              console.log(`🔄 更新会员视频: ${videoData.name || '未知'}`);
            }
          }
        }
        
        console.log(`📊 第 ${currentPage} 页结果: 新增 ${pageNew} 个, 更新 ${pageUpdated} 个`);
        
        currentPage++;
        
        // 每次请求后延迟，避免过于频繁
        if (hasMoreData) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        // 最多检查10页，避免无限循环
        if (currentPage > 10) {
          console.log(`⏹️  达到最大页数限制，停止同步`);
          hasMoreData = false;
          break;
        }
      }
      
      // 更新分类统计
      const totalResult = await executeSQL(
        'SELECT COUNT(*) as count FROM videos WHERE cont_display_type = ? AND way = ?',
        [cid, '2']
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
      
      console.log(`✅ 分类 ${categoryName} 会员视频增量同步完成:`);
      console.log(`   新增视频: ${categoryNew} 个`);
      console.log(`   更新视频: ${categoryUpdated} 个`);
      console.log(`   检查页数: ${currentPage - 1} 页`);
      
    } catch (error) {
      console.error(`❌ 分类 ${categoryName} 会员视频增量同步失败:`, error);
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
  
  console.log(`\n🎉 会员视频增量同步完成:`);
  console.log(`   成功同步: ${successCount}/${allCategories.length} 个分类`);
  console.log(`   新增视频: ${totalNew} 个`);
  console.log(`   更新视频: ${totalUpdated} 个`);
}

// 检查视频是否需要更新（保持不变）
function checkIfVideoNeedsUpdate(videoData, existingVideo) {
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
function isSeriesCompleted(updateEP) {
  const completedKeywords = ['全集', '已完结', '集全', '全'];
  return completedKeywords.some(keyword => updateEP.includes(keyword));
}

// 判断剧集是否在更新中
function isSeriesUpdating(updateEP) {
  const updatingKeywords = ['更新', '更新至', '连载', '热播'];
  return updatingKeywords.some(keyword => updateEP.includes(keyword));
}

// 计算总集数
function calculateTotalEpisodes(videoData) {
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

incrementalSyncMemberVideos().catch(console.error);
