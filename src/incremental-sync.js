import { executeSQL, checkEnv } from './db.js';
import { fetchMiguCategory, saveVideoData } from './migu-api.js';

async function incrementalSyncAllCategories() {
  checkEnv();
  console.log('开始增量同步所有分类数据');
  
  // 所有分类
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
  let totalEpisodesUpdated = 0;
  
  for (const cid of allCategories) {
    const categoryName = categoryNames[cid] || cid;
    console.log(`\n开始增量同步分类: ${categoryName} (${cid})`);
    
    await executeSQL(`
      UPDATE sync_status 
      SET status = 'syncing', sync_type = 'incremental', last_sync = datetime('now')
      WHERE category_id = ?
    `, [cid]);
    
    try {
      const videos = await fetchMiguCategory(cid, 1, 20);
      let newCount = 0;
      let updatedCount = 0;
      let episodesUpdatedCount = 0;
      
      if (videos && videos.length > 0) {
        console.log(`获取到 ${videos.length} 个视频进行增量比对`);
        
        // 获取该分类下已存在的视频ID和剧集信息
        const existingResult = await executeSQL(`
          SELECT 
            v.p_id,
            v.update_ep,
            v.total_episodes,
            (SELECT COUNT(*) FROM episodes e WHERE e.video_id = v.id) as current_episodes
          FROM videos v 
          WHERE v.cont_display_type = ?
        `, [cid]);
        
        const existingVideos = {};
        if (existingResult && existingResult.result && existingResult.result[0] && existingResult.result[0].results) {
          existingResult.result[0].results.forEach(video => {
            existingVideos[video.p_id] = {
              update_ep: video.update_ep,
              total_episodes: video.total_episodes,
              current_episodes: video.current_episodes
            };
          });
        }
        
        console.log(`数据库中已有 ${Object.keys(existingVideos).length} 个 ${categoryName} 视频`);
        
        for (const videoData of videos) {
          const videoId = videoData.pID;
          const isNewVideo = !existingVideos[videoId];
          
          if (isNewVideo) {
            // 新视频 - 保存视频和剧集
            await saveVideoData(videoData, cid);
            newCount++;
            console.log(`🆕 新增视频: ${videoData.name || '未知'}`);
          } else {
            // 已存在视频 - 检查是否需要更新
            const existingVideo = existingVideos[videoId];
            const needsUpdate = checkIfVideoNeedsUpdate(videoData, existingVideo);
            
            if (needsUpdate) {
              // 更新视频信息和剧集
              await saveVideoData(videoData, cid);
              updatedCount++;
              
              // 检查剧集是否有更新
              const episodeChanges = await checkEpisodeChanges(videoData, existingVideo);
              if (episodeChanges) {
                episodesUpdatedCount++;
                console.log(`🔄 更新视频和剧集: ${videoData.name || '未知'}`);
              } else {
                console.log(`🔄 更新视频信息: ${videoData.name || '未知'}`);
              }
            }
          }
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
        SET status = 'completed', last_page = ?, total_videos = ?, 
            last_sync = datetime('now')
        WHERE category_id = ?
      `, [1, totalVideos, cid]);
      
      successCount++;
      totalNew += newCount;
      totalUpdated += updatedCount;
      totalEpisodesUpdated += episodesUpdatedCount;
      
      console.log(`✅ 分类 ${categoryName} 增量同步完成:`);
      console.log(`   新增视频: ${newCount} 个`);
      console.log(`   更新视频: ${updatedCount} 个`);
      console.log(`   剧集更新: ${episodesUpdatedCount} 个`);
      
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
  
  console.log(`\n🎉 增量同步完成:`);
  console.log(`   成功同步: ${successCount}/${allCategories.length} 个分类`);
  console.log(`   新增视频: ${totalNew} 个`);
  console.log(`   更新视频: ${totalUpdated} 个`);
  console.log(`   剧集更新: ${totalEpisodesUpdated} 个`);
}

// 检查视频是否需要更新
function checkIfVideoNeedsUpdate(videoData, existingVideo) {
  // 1. 检查集数信息是否变化
  const newUpdateEP = videoData.updateEP || '';
  const newTotalEpisodes = calculateTotalEpisodes(videoData);
  
  if (newUpdateEP !== existingVideo.update_ep || newTotalEpisodes !== existingVideo.total_episodes) {
    return true;
  }
  
  // 2. 检查其他关键信息变化（可以根据需要扩展）
  // 比如评分、图片等更新
  
  return false;
}

// 计算总集数
function calculateTotalEpisodes(videoData) {
  let totalEpisodes = 0;
  if (videoData.updateEP && videoData.updateEP.includes('集全')) {
    const match = videoData.updateEP.match(/(\d+)集全/);
    totalEpisodes = match ? parseInt(match[1]) : 0;
  } else if (videoData.updateEP && videoData.updateEP.includes('更新至')) {
    const match = videoData.updateEP.match(/更新至(\d+)集/);
    totalEpisodes = match ? parseInt(match[1]) : 1;
  } else {
    totalEpisodes = 1;
  }
  return totalEpisodes;
}

// 检查剧集变化
async function checkEpisodeChanges(videoData, existingVideo) {
  const newTotalEpisodes = calculateTotalEpisodes(videoData);
  
  // 如果总集数增加，说明有新的剧集
  if (newTotalEpisodes > existingVideo.total_episodes) {
    return true;
  }
  
  // 如果有 epsID 数据且数量变化
  if (videoData.epsID && Array.isArray(videoData.epsID)) {
    if (videoData.epsID.length !== existingVideo.current_episodes) {
      return true;
    }
  }
  
  return false;
}

incrementalSyncAllCategories().catch(console.error);
