// ./src/daily-home-videos.js - 每日自动更新首页推荐视频和完整视频信息
import fetch from 'node-fetch';
import { executeSQL, checkEnv } from './db.js';
import { saveVideoData } from './migu-api.js';

// 从官方API获取首页推荐视频
async function fetchHomeVideos() {
  const url = 'https://jadeite.migu.cn/search/v3/category';
  
  try {
    console.log('🔗 获取首页推荐视频...');
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Origin': 'https://www.miguvideo.com',
        'Referer': 'https://www.miguvideo.com/',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
      },
      timeout: 10000
    });
    
    if (!response.ok) {
      console.log(`❌ HTTP 错误: ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    
    if (data.code !== 200 || !data.body || !data.body.data) {
      console.log(`❌ API错误: ${data.message || '无数据'}`);
      return [];
    }
    
    console.log(`✅ 获取首页推荐视频成功: ${data.body.data.length} 个视频`);
    return data.body.data;
  } catch (error) {
    console.error('❌ 获取首页推荐视频失败:', error.message);
    return [];
  }
}

// 获取高质量图片
function getHighQualityPic(item) {
  const pics = item.pics || {};
  return pics.highResolutionH || pics.highResolution || pics.lowResolutionH || pics.lowResolution || '';
}

// 构建备注信息
function buildRemarks(item) {
  const remarks = [];
  if (item.updateEP) remarks.push(item.updateEP);
  if (item.score) remarks.push(`评分:${item.score}`);
  if (item.year) remarks.push(item.year);
  return remarks.length > 0 ? remarks.join(' | ') : '未知';
}

// 清除表中原有数据
async function clearHomeVideos() {
  try {
    console.log('🗑️  清除首页视频表原有数据...');
    await executeSQL('DELETE FROM home_videos');
    console.log('✅ 清除数据成功');
    return true;
  } catch (error) {
    console.error('❌ 清除数据失败:', error);
    return false;
  }
}

// 保存首页视频到表
async function saveHomeVideo(item, index) {
  try {
    const picUrl = getHighQualityPic(item);
    const remarks = buildRemarks(item);
    
    await executeSQL(`
      INSERT INTO home_videos 
      (p_id, name, pic_url, vod_remarks, sort_order) 
      VALUES (?, ?, ?, ?, ?)
    `, [
      item.pID || '',
      item.name || '未知',
      picUrl,
      remarks,
      index
    ]);
    
    console.log(`✅ 保存首页视频 [${index + 1}]: ${item.name}`);
    return true;
  } catch (error) {
    console.error(`❌ 保存首页视频失败 ${item.name}:`, error.message);
    return false;
  }
}

// 检查视频是否需要更新（智能增量更新逻辑）
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
  
  // 3. 其他情况（可能是电影等非剧集类）
  const newTotalEpisodes = calculateTotalEpisodes(videoData);
  
  if (newUpdateEP !== existingUpdateEP || newTotalEpisodes !== existingVideo.total_episodes) {
    return true;
  }
  
  return false;
}

// 判断剧集是否已完结
function isSeriesCompleted(updateEP) {
  if (!updateEP) return false;
  const completedKeywords = ['全集', '已完结', '集全', '全'];
  return completedKeywords.some(keyword => updateEP.includes(keyword));
}

// 判断剧集是否在更新中
function isSeriesUpdating(updateEP) {
  if (!updateEP) return false;
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

// 🔥 智能增量保存完整视频信息到主表
async function saveFullVideoData(videoData) {
  try {
    const contDisplayType = videoData.contDisplayType || '';
    if (!contDisplayType) {
      console.log(`⚠️ 跳过视频 ${videoData.name}: 无分类信息`);
      return { saved: false, type: 'skip', reason: '无分类信息' };
    }
    
    const videoId = videoData.pID;
    if (!videoId) {
      console.log(`⚠️ 跳过视频 ${videoData.name}: 无视频ID`);
      return { saved: false, type: 'skip', reason: '无视频ID' };
    }
    
    // 检查视频是否已存在
    const existingResult = await executeSQL(
      'SELECT p_id, update_ep, total_episodes FROM videos WHERE p_id = ?',
      [videoId]
    );
    
    const existingVideo = existingResult?.result?.[0]?.results?.[0];
    const isNewVideo = !existingVideo;

    if (isNewVideo) {
      // 新视频 - 完整保存
      await saveVideoData(videoData, contDisplayType);
      console.log(`🆕 [首页] 新增视频: ${videoData.name}`);
      return { saved: true, type: 'new', videoId };
    } else {
      // 已存在视频 - 检查是否需要更新
      const needsUpdate = checkIfVideoNeedsUpdate(videoData, existingVideo);
      
      if (needsUpdate) {
        await saveVideoData(videoData, contDisplayType);
        console.log(`🔄 [首页] 更新视频: ${videoData.name}`);
        return { saved: true, type: 'updated', videoId };
      } else {
        console.log(`📋 [首页] 视频无需更新: ${videoData.name}`);
        return { saved: false, type: 'no_change', videoId };
      }
    }
  } catch (error) {
    console.error(`❌ [首页] 保存完整视频失败 ${videoData.name}:`, error.message);
    return { saved: false, type: 'error', reason: error.message, videoId: videoData.pID };
  }
}

// 主函数：每日更新首页推荐视频和完整视频信息
async function dailyUpdateHomeVideos() {
  checkEnv();
  
  const currentTime = new Date().toLocaleString('zh-CN');
  console.log(`🚀 开始每日更新首页推荐视频和完整信息 - ${currentTime}`);
  
  // 获取首页视频数据
  const videos = await fetchHomeVideos();
  
  if (videos.length === 0) {
    console.log('❌ 没有获取到首页视频数据，任务终止');
    return;
  }
  
  // 清除表中原有数据
  const clearSuccess = await clearHomeVideos();
  if (!clearSuccess) {
    console.log('❌ 清除数据失败，任务终止');
    return;
  }
  
  let homeSuccessCount = 0;
  let homeFailCount = 0;
  let fullNewCount = 0;
  let fullUpdatedCount = 0;
  let fullNoChangeCount = 0;
  let fullFailCount = 0;
  
  // 保存所有视频（最多20个）
  const maxVideos = Math.min(videos.length, 20);
  console.log(`📋 准备处理 ${maxVideos} 个视频`);
  
  for (let i = 0; i < maxVideos; i++) {
    const video = videos[i];
    
    console.log(`\n--- 处理第 ${i + 1} 个视频: ${video.name} ---`);
    
    // 1. 保存到首页视频表
    const homeSuccess = await saveHomeVideo(video, i);
    if (homeSuccess) {
      homeSuccessCount++;
    } else {
      homeFailCount++;
    }
    
    // 2. 🔥 智能增量保存完整视频信息到主表和剧集表
    const fullResult = await saveFullVideoData(video);
    if (fullResult.saved) {
      if (fullResult.type === 'new') fullNewCount++;
      if (fullResult.type === 'updated') fullUpdatedCount++;
      if (fullResult.type === 'no_change') fullNoChangeCount++;
    } else {
      if (fullResult.type === 'error') fullFailCount++;
      // skip 类型不计入失败
    }
  }
  
  console.log(`\n🎊 每日更新完成!`);
  console.log(`📊 首页视频表:`);
  console.log(`   ✅ 成功保存: ${homeSuccessCount} 个视频`);
  console.log(`   ❌ 保存失败: ${homeFailCount} 个视频`);
  console.log(`📊 完整视频信息:`);
  console.log(`   🆕 新增视频: ${fullNewCount} 个`);
  console.log(`   🔄 更新视频: ${fullUpdatedCount} 个`);
  console.log(`   📋 无需更新: ${fullNoChangeCount} 个`);
  console.log(`   ❌ 保存失败: ${fullFailCount} 个`);
  
  // 统计结果
  const homeResult = await executeSQL('SELECT COUNT(*) as count FROM home_videos');
  let homeCount = 0;
  if (homeResult && homeResult.result && homeResult.result[0] && homeResult.result[0].results && homeResult.result[0].results[0]) {
    homeCount = homeResult.result[0].results[0].count;
  }
  
  const videoResult = await executeSQL('SELECT COUNT(*) as count FROM videos');
  let videoCount = 0;
  if (videoResult && videoResult.result && videoResult.result[0] && videoResult.result[0].results && videoResult.result[0].results[0]) {
    videoCount = videoResult.result[0].results[0].count;
  }
  
  console.log(`\n📈 数据库统计:`);
  console.log(`   📱 首页视频表数量: ${homeCount}`);
  console.log(`   🎬 主视频表数量: ${videoCount}`);
  console.log(`⏰ 下次更新: 明天 03:00`);
}

// 执行更新
dailyUpdateHomeVideos().catch(console.error);
