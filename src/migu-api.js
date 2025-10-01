import fetch from 'node-fetch';
import { executeSQL } from './db.js';

// 从咪咕API获取分类数据
export async function fetchMiguCategory(cid, page, pageSize) {
  const apiBase = 'https://jadeite.migu.cn';
  const baseParams = 'packId=1002581,1003861,1003863,1003866,1002601,1004761,1004121,1004641,1005521,1005261,1015768&copyrightTerminal=3';
  const url = `${apiBase}/search/v3/category?${baseParams}&pageStart=${page}&pageNum=${pageSize}&contDisplayType=${cid}`;
  
  try {
    console.log(`🔗 请求URL: ${url.replace(/(pageStart=)\d+/, '$1' + page)}`);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Origin': 'https://www.miguvideo.com',
        'Referer': 'https://www.miguvideo.com/',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
      },
      timeout: 15000
    });
    
    if (!response.ok) {
      console.log(`❌ HTTP 错误: ${response.status}`);
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.code !== 200) {
      console.log(`❌ API错误: ${data.message}`);
      throw new Error(`API错误: ${data.message}`);
    }
    
    const videoCount = data.body?.data?.length || 0;
    console.log(`📥 获取分类 ${cid} 第 ${page} 页数据成功，共 ${videoCount} 个视频`);
    
    return data.body?.data || [];
  } catch (error) {
    console.error(`❌ 获取分类 ${cid} 第 ${page} 页数据失败:`, error.message);
    return [];
  }
}

// 保存视频数据
export async function saveVideoData(videoData, categoryId) {  // 确保这里有 export
  try {
    const safeData = prepareVideoData(videoData, categoryId);
    const bindParams = getVideoBindParams(safeData);
    
    await executeSQL(`
      INSERT OR REPLACE INTO videos (
        p_id, name, sub_title, pic_url, pic_url_h, pic_url_v,
        program_type, cont_display_type, cont_display_name, cont_type,
        score, year, area, language, director, actor,
        content_style, vod_remarks, update_ep, total_episodes, 
        is_4k, is_original, way, auth, asset_id, 
        publish_time, publish_timestamp, recommendation, extra_data,
        source_publish_time, source_publish_timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, bindParams);
    
    const result = await executeSQL(
      'SELECT id FROM videos WHERE p_id = ?',
      [safeData.pID]
    );
    
    const videoId = result[0]?.results?.[0]?.id;
    
    if (videoId) {
      await executeSQL(`
        INSERT OR REPLACE INTO search_index (video_id, name, sub_title, director, actor, content_style)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [
        videoId, 
        safeData.name, 
        safeData.subTitle, 
        safeData.director, 
        safeData.actor, 
        safeData.contentStyle
      ]);
    }
    
    console.log(`✅ 保存视频成功: ${safeData.name}`);
    return true;
    
  } catch (error) {
    console.error(`❌ 保存视频失败:`, error.message);
    return false;
  }
}

function prepareVideoData(videoData, categoryId) {
  const safeData = {
    pID: videoData.pID || 'unknown_' + Date.now(),
    name: videoData.name || '未知名称',
    subTitle: videoData.subTitle || '',
    pics: videoData.pics || {},
    programType: videoData.programType || '',
    score: videoData.score || '',
    year: videoData.year || '',
    area: videoData.area || '',
    language: videoData.language || '',
    director: videoData.director || '',
    actor: videoData.actor || '',
    contentStyle: videoData.contentStyle || '',
    updateEP: videoData.updateEP || '',
    recommendation: videoData.recommendation || [],
    publishTime: videoData.publishTime || '',
    way: videoData.way || '',
    auth: videoData.auth || '',
    contDisplayName: videoData.contDisplayName || '',
    contentType: videoData.contentType || '',
    assetId: videoData.assetID || videoData.assetId || '',
    publishTimestamp: videoData.publishTimestamp || '',
    sourcePublishTime: videoData.publishTime || '',
    sourcePublishTimestamp: videoData.publishTimestamp || '',
    contDisplayType: categoryId
  };

  return safeData;
}

function getVideoBindParams(safeData) {
  const picUrl = getHighQualityPic(safeData.pics) || '';
  const picUrlH = safeData.pics.highResolutionH || safeData.pics.lowResolutionH || '';
  const picUrlV = safeData.pics.highResolutionV || safeData.pics.lowResolutionV || '';
  
  const is4k = safeData.recommendation.includes('4K') ? 1 : 0;
  const isOriginal = safeData.recommendation.includes('原画') ? 1 : 0;

  let totalEpisodes = 0;
  if (safeData.updateEP && safeData.updateEP.includes('集全')) {
    const match = safeData.updateEP.match(/(\d+)集全/);
    totalEpisodes = match ? parseInt(match[1]) : 0;
  }

  const recommendationJson = JSON.stringify(safeData.recommendation);

  return [
    safeData.pID, 
    safeData.name, 
    safeData.subTitle, 
    picUrl,
    picUrlH,
    picUrlV,
    safeData.programType, 
    safeData.contDisplayType,
    safeData.contDisplayName,
    safeData.contentType,
    safeData.score, 
    safeData.year, 
    safeData.area, 
    safeData.language,
    safeData.director, 
    safeData.actor,
    safeData.contentStyle, 
    safeData.updateEP,
    safeData.updateEP,
    totalEpisodes,
    is4k, 
    isOriginal,
    safeData.way,
    safeData.auth,
    safeData.assetId,
    safeData.publishTime,
    safeData.publishTimestamp,
    recommendationJson,
    '{}',
    safeData.sourcePublishTime,
    safeData.sourcePublishTimestamp
  ];
}

function getHighQualityPic(pics) {
  return pics.highResolutionH || pics.lowResolutionH || 
         pics.highResolutionV || pics.lowResolutionV || '';
}
