// ./src/update-details.js - 专门用于更新所有视频简介信息
import fetch from 'node-fetch';
import { executeSQL, checkEnv } from './db.js';

// 从官方API获取视频详情信息
async function fetchVideoDetail(pId) {
  const url = `https://v2-sc.miguvideo.com/program/v3/cont/playing-info/${pId}`;
  
  try {
    console.log(`🔗 获取视频详情: ${pId}`);
    
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
      return null;
    }
    
    const data = await response.json();
    
    if (data.code !== 200 || !data.body) {
      console.log(`❌ API错误: ${data.message || '无数据'}`);
      return null;
    }
    
    console.log(`✅ 获取视频详情成功: ${pId}`);
    return data.body;
  } catch (error) {
    console.error(`❌ 获取视频详情失败 ${pId}:`, error.message);
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
      console.log(`⚠️  视频 ${pId} 无简介信息`);
      return false;
    }
    
    // 更新数据库中的detail字段
    await executeSQL(
      'UPDATE videos SET detail = ? WHERE p_id = ?',
      [detail, pId]
    );
    
    console.log(`✅ 更新视频简介成功: ${pId}`);
    return true;
  } catch (error) {
    console.error(`❌ 更新视频简介失败 ${pId}:`, error.message);
    return false;
  }
}

// 获取所有视频ID
async function getAllVideoIds() {
  try {
    console.log('🔍 执行SQL查询所有视频...');
    const result = await executeSQL(
      'SELECT p_id, name FROM videos WHERE p_id IS NOT NULL ORDER BY created_at DESC'
    );
    
    console.log('📊 SQL查询结果结构:', JSON.stringify(result, null, 2));
    
    // 调试：检查不同的返回结构
    if (result && result.results) {
      return result.results;
    } else if (result && Array.isArray(result)) {
      return result;
    } else if (result && result.result && result.result[0] && result.result[0].results) {
      return result.result[0].results;
    } else {
      console.log('❓ 未知的返回结构');
      return [];
    }
  } catch (error) {
    console.error('获取所有视频ID失败:', error);
    return [];
  }
}

// 主函数：更新所有视频简介
async function updateAllVideoDetails() {
  checkEnv();
  
  console.log('🚀 开始更新所有视频简介信息');
  
  // 先测试数据库连接 - 修复返回结构处理
  try {
    const testResult = await executeSQL('SELECT COUNT(*) as count FROM videos');
    console.log('📊 数据库连接测试结果:', JSON.stringify(testResult, null, 2));
    
    let totalCount = 0;
    if (testResult && testResult.results && testResult.results[0]) {
      totalCount = testResult.results[0].count;
    } else if (testResult && testResult.result && testResult.result[0] && testResult.result[0].results && testResult.result[0].results[0]) {
      totalCount = testResult.result[0].results[0].count;
    } else if (testResult && testResult[0] && testResult[0].count) {
      totalCount = testResult[0].count;
    }
    
    console.log('📊 总视频数:', totalCount);
  } catch (error) {
    console.error('❌ 数据库连接失败:', error);
    return;
  }
  
  // 直接写死配置
  const delayMs = 1500; // 1.5秒间隔
  
  // 获取所有视频
  console.log('🔍 获取所有视频...');
  const videos = await getAllVideoIds();
  
  console.log(`📋 找到 ${videos.length} 个视频需要更新`);
  
  if (videos.length === 0) {
    console.log('❓ 为什么没有找到视频？检查数据库...');
    
    // 检查数据库中的视频
    const checkResult = await executeSQL('SELECT p_id, name FROM videos LIMIT 5');
    console.log('📊 数据库中的前5个视频:', JSON.stringify(checkResult, null, 2));
    return;
  }
  
  let successCount = 0;
  let failCount = 0;
  
  // 只测试前3个，避免运行太久
  const testVideos = videos.slice(0, 3);
  
  for (let i = 0; i < testVideos.length; i++) {
    const video = testVideos[i];
    console.log(`\n📝 处理视频 [${i + 1}/${testVideos.length}]: ${video.name} (${video.p_id})`);
    
    const success = await updateVideoDetail(video.p_id);
    
    if (success) {
      successCount++;
    } else {
      failCount++;
    }
    
    // 延迟，避免请求过快
    if (i < testVideos.length - 1) {
      console.log(`⏳ 等待 ${delayMs}ms 后继续...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  console.log(`\n🎊 测试更新完成!`);
  console.log(`✅ 成功更新: ${successCount} 个视频`);
  console.log(`❌ 更新失败: ${failCount} 个视频`);
}

// 执行更新
updateAllVideoDetails().catch(console.error);
