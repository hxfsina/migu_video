// ./src/daily-home-videos.js - 每日自动更新首页推荐视频
import fetch from 'node-fetch';
import { executeSQL, checkEnv } from './db.js';

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

// 主函数：每日更新首页推荐视频
async function dailyUpdateHomeVideos() {
  checkEnv();
  
  const currentTime = new Date().toLocaleString('zh-CN');
  console.log(`🚀 开始每日更新首页推荐视频 - ${currentTime}`);
  
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
  
  let successCount = 0;
  let failCount = 0;
  
  // 保存所有视频（最多20个）
  const maxVideos = Math.min(videos.length, 20);
  console.log(`📋 准备保存 ${maxVideos} 个视频`);
  
  for (let i = 0; i < maxVideos; i++) {
    const video = videos[i];
    
    const success = await saveHomeVideo(video, i);
    
    if (success) {
      successCount++;
    } else {
      failCount++;
    }
  }
  
  console.log(`\n🎊 每日更新完成!`);
  console.log(`✅ 成功保存: ${successCount} 个视频`);
  console.log(`❌ 保存失败: ${failCount} 个视频`);
  console.log(`📊 成功率: ${((successCount / maxVideos) * 100).toFixed(1)}%`);
  
  // 统计结果
  const result = await executeSQL('SELECT COUNT(*) as count FROM home_videos');
  let totalCount = 0;
  if (result && result.result && result.result[0] && result.result[0].results && result.result[0].results[0]) {
    totalCount = result.result[0].results[0].count;
  }
  
  console.log(`📊 当前首页视频表数量: ${totalCount}`);
  console.log(`⏰ 下次更新: 明天 03:00`);
}

// 执行更新
dailyUpdateHomeVideos().catch(console.error);
