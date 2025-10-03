// ./src/update-details.js - 专门用于更新所有视频简介信息
import fetch from 'node-fetch';
import { executeSQL, checkEnv } from './db.js';

// 获取所有简介为空的视频ID
async function getVideosWithoutDetail() {
  try {
    const result = await executeSQL(
      `SELECT p_id, name FROM videos 
       WHERE (detail IS NULL OR detail = '') 
       AND p_id IS NOT NULL 
       ORDER BY created_at DESC`
    );
    
    // 修复：正确处理返回结构
    if (result && result.result && result.result[0] && result.result[0].results) {
      return result.result[0].results;
    } else if (result && result.results) {
      return result.results;
    } else {
      console.log('❓ 未知的返回结构:', JSON.stringify(result, null, 2));
      return [];
    }
  } catch (error) {
    console.error('获取简介为空视频失败:', error);
    return [];
  }
}

// 从官方API获取视频详情信息
async function fetchVideoDetail(pId) {
  const url = `https://v2-sc.miguvideo.com/program/v3/cont/playing-info/${pId}`;
  
  try {
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
      return null;
    }
    
    const data = await response.json();
    
    if (data.code !== 200 || !data.body) {
      return null;
    }
    
    return data.body;
  } catch (error) {
    return null;
  }
}

// 更新视频的简介信息
async function updateVideoDetail(pId) {
  try {
    const detailData = await fetchVideoDetail(pId);
    
    if (!detailData) {
      return false;
    }
    
    // 获取简介信息
    const detail = detailData.detail || '';
    
    if (!detail) {
      return false;
    }
    
    // 更新数据库中的detail字段
    await executeSQL(
      'UPDATE videos SET detail = ? WHERE p_id = ?',
      [detail, pId]
    );
    
    return true;
  } catch (error) {
    return false;
  }
}

// 主函数：更新所有简介为空的视频
async function updateVideoDetails() {
  checkEnv();
  
  console.log('🚀 开始更新简介为空的视频信息');
  
  const delayMs = 1500; // 1.5秒间隔
  
  // 获取所有简介为空的视频
  console.log('🔍 获取简介为空的视频...');
  const videos = await getVideosWithoutDetail();
  
  console.log(`📋 找到 ${videos.length} 个简介为空的视频需要更新`);
  
  if (videos.length === 0) {
    console.log('✅ 所有视频都有简介，无需更新');
    return;
  }
  
  let successCount = 0;
  let failCount = 0;
  
  // 更新所有简介为空的视频
  for (let i = 0; i < videos.length; i++) {
    const video = videos[i];
    
    console.log(`🔄 更新第 ${i + 1}/${videos.length} 个视频: ${video.name}`);
    
    const success = await updateVideoDetail(video.p_id);
    
    if (success) {
      successCount++;
      console.log(`✅ 更新成功: ${video.name}`);
    } else {
      failCount++;
      console.log(`❌ 更新失败: ${video.name}`);
    }
    
    // 延迟，避免请求过快
    if (i < videos.length - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  console.log(`\n🎊 更新完成!`);
  console.log(`✅ 成功更新: ${successCount} 个视频`);
  console.log(`❌ 更新失败: ${failCount} 个视频`);
  console.log(`📊 成功率: ${((successCount / videos.length) * 100).toFixed(1)}%`);
  
  // 统计更新后的情况
  const result = await executeSQL(
    'SELECT COUNT(*) as total, COUNT(detail) as with_detail FROM videos WHERE p_id IS NOT NULL'
  );
  
  // 修复：正确处理统计结果的返回结构
  let stats = { total: 0, with_detail: 0 };
  if (result && result.result && result.result[0] && result.result[0].results && result.result[0].results[0]) {
    stats = result.result[0].results[0];
  } else if (result && result.results && result.results[0]) {
    stats = result.results[0];
  }
  
  console.log(`\n📊 数据库统计:`);
  console.log(`📺 总视频数: ${stats.total}`);
  console.log(`📝 有简介的视频: ${stats.with_detail}`);
  console.log(`❓ 无简介的视频: ${stats.total - stats.with_detail}`);
}

// 执行更新
updateVideoDetails().catch(console.error);
