import fetch from 'node-fetch';
import { executeSQL, batchInsertEpisodes } from './db.js';

// 缓存机制
const videoCache = new Map();
const episodeCache = new Map();

// 从咪咕API获取分类数据
export async function fetchMiguCategory(cid, page, pageSize, filters = {}) {
  const apiBase = 'https://jadeiteapp.migu.cn';
  const baseParams = 'packId=1002581,1003861,1003863,1003866,1002601,1004761,1004121,1004641,1005521,1005261,1015768&uiVersion=A3.31.0';
  
  // 构建查询参数
  let url = `${apiBase}/search/v3/category?${baseParams}&pageStart=${page}&pageNum=${pageSize}&contDisplayType=${cid}`;
  
  // 添加筛选参数
  if (filters.mediaYear) {
    url += `&mediaYear=${filters.mediaYear}`;
  }
  if (filters.mediaArea) {
    url += `&mediaArea=${filters.mediaArea}`;
  }
  if (filters.mediaType) {
    url += `&mediaType=${filters.mediaType}`;
  }
  if (filters.payType) {
    url += `&payType=${filters.payType}`;
  }
  
  try {
    console.log(`🔗 请求分类 ${cid} 第 ${page} 页数据`);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Dalvik/2.1.0 (Linux; U; Android 9; CM311-5-ZG Build/CM311-5-ZG)',
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

// 获取视频详情信息
export async function fetchVideoDetail(pId) {
  const url = `https://program-sc.miguvideo.com/program/v4/cont/content-info/${pId}/1`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Dalvik/2.1.0 (Linux; U; Android 9; CM311-5-ZG Build/CM311-5-ZG)',
        //'Origin': 'https://www.miguvideo.com',
       // 'Referer': 'https://www.miguvideo.com/',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
      },
      timeout: 10000
    });
    
    if (!response.ok) {
      console.log(`❌ 获取详情HTTP错误: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    
    if (data.code !== 200) {
      console.log(`❌ 获取详情API错误: ${data.message}`);
      return null;
    }
    
    return data.body?.data || null;
    
  } catch (error) {
    console.error(`❌ 获取视频详情失败 ${pId}:`, error.message);
    return null;
  }
}

// 并行获取多个视频详情
export async function fetchVideoDetailsParallel(videoList) {
  const details = {};
  const batchSize = 3; // 降低并发数避免被限制
  
  console.log(`🚀 开始并行获取 ${videoList.length} 个视频详情`);
  
  for (let i = 0; i < videoList.length; i += batchSize) {
    const batch = videoList.slice(i, i + batchSize);
    const promises = batch.map(video => 
      fetchVideoDetail(video.pID).then(detail => ({
        pID: video.pID,
        detail: detail
      })).catch(error => ({
        pID: video.pID,
        error: error.message
      }))
    );
    
    const results = await Promise.allSettled(promises);
    
    results.forEach(result => {
      if (result.status === 'fulfilled' && result.value.detail) {
        details[result.value.pID] = result.value.detail;
      }
    });
    
    console.log(`📦 批量获取详情进度: ${Math.min(i + batchSize, videoList.length)}/${videoList.length}`);
    
    // 避免请求过快
    if (i + batchSize < videoList.length) {
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }
  
  console.log(`✅ 并行获取详情完成，成功: ${Object.keys(details).length}/${videoList.length}`);
  return details;
}

// 检查视频是否已存在
async function checkVideoExists(pId) {
  try {
    const result = await executeSQL(
      'SELECT id, p_id, score, update_ep, total_episodes FROM videos WHERE p_id = ?',
      [pId]
    );
    
    if (result && result.result && result.result[0] && result.result[0].results && result.result[0].results.length > 0) {
      return result.result[0].results[0];
    }
    return null;
  } catch (error) {
    console.error(`❌ 检查视频存在失败:`, error.message);
    return null;
  }
}

// 判断是否需要更新视频
async function shouldUpdateVideo(existingVideo, newData) {
  if (!existingVideo) {
    return true; // 新增视频
  }
  
  // 电影类：主要检查评分是否有变化
  if (newData.videoType === 'movie') {
    const oldScore = parseFloat(existingVideo.score) || 0;
    const newScore = parseFloat(newData.score) || 0;
    
    if (Math.abs(oldScore - newScore) > 0.1) {
      return true;
    }
  } 
  // 剧集类：检查评分、集数信息
  else {
    const oldScore = parseFloat(existingVideo.score) || 0;
    const newScore = parseFloat(newData.score) || 0;
    const oldUpdateEP = existingVideo.update_ep || '';
    const newUpdateEP = newData.updateEP || '';
    const oldTotalEpisodes = existingVideo.total_episodes || 0;
    const newTotalEpisodes = newData.totalEpisodes || 0;
    
    // 检查评分变化
    if (Math.abs(oldScore - newScore) > 0.1) {
      return true;
    }
    
    // 检查集数信息变化
    if (oldUpdateEP !== newUpdateEP) {
      return true;
    }
    
    // 检查总集数变化
    if (oldTotalEpisodes !== newTotalEpisodes) {
      return true;
    }
  }
  
  return false;
}

// 智能判断视频类型
function determineVideoType(videoData, categoryId) {
  const updateEP = videoData.updateEP || '';
  const programType = videoData.programType || '';
  const name = videoData.name || '';
  
  // 1. 根据分类ID初步判断
  switch(categoryId) {
    case '1000': return 'movie';      // 电影
    case '1001': return 'tv';         // 电视剧
    case '1005': return 'variety';    // 综艺
    case '1002': return 'documentary'; // 纪实
    case '1007': return 'anime';      // 动漫
    case '601382': return 'kids';     // 少儿
  }
  
  // 2. 根据集数信息判断
  if (updateEP.includes('集全') || updateEP.includes('更新至') || updateEP.includes('第') ) {
    return 'tv';
  }
  
  // 3. 根据节目类型判断
  if (programType.includes('MOVIE') || programType.includes('电影')) {
    return 'movie';
  } else if (programType.includes('TV') || programType.includes('剧集')) {
    return 'tv';
  }
  
  // 4. 根据名称关键词判断
  const tvKeywords = ['剧', '季', '部', '系列', '连载'];
  const movieKeywords = ['电影', '剧场版', '大电影'];
  
  if (tvKeywords.some(keyword => name.includes(keyword))) {
    return 'tv';
  } else if (movieKeywords.some(keyword => name.includes(keyword))) {
    return 'movie';
  }
  
  // 5. 根据总集数判断
  const totalEpisodes = calculateTotalEpisodes(videoData);
  if (totalEpisodes > 1) {
    return 'tv';
  }
  
  return 'movie';
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

// 准备视频数据
function prepareVideoData(videoData, categoryId, videoDetail = null) {
  const videoType = determineVideoType(videoData, categoryId);
  
  const safeData = {
    pID: videoData.pID || 'unknown_' + Date.now(),
    name: videoData.name || '未知名称',
    subTitle: videoData.subTitle || '',
    pics: videoData.pics || {},
    programType: videoData.programType || '',
    score: videoData.score || '',
    year: videoData.year || '',
    area: videoData.mediaArea || videoData.area || '',
    language: videoData.language || '',
    director: (videoData.director || '').trim(),
    actor: (videoData.actor || '').trim(),
    contentStyle: (videoData.contentStyle || '').trim(),
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
    contDisplayType: categoryId,
    videoType: videoType,
    totalEpisodes: calculateTotalEpisodes(videoData),
    detail: videoDetail?.detail || '',
    wcKeyword: videoData.wcKeyword || '',
    playType: videoData.playType || '',
    createTime: videoData.createTime || '',
    publishDate: videoData.publishDate || 0,
    tipCode: videoData.tip?.code || '',
    tipMsg: videoData.tip?.msg || '',
    storeTipCode: videoData.storeTip?.code || '',
    storeTipMsg: videoData.storeTip?.msg || '',
    extraData: videoData.extraData || {}
  };

  return safeData;
}

// 获取视频绑定参数
function getVideoBindParams(safeData) {
  const picUrl = getHighQualityPic(safeData.pics) || '';
  const picUrlH = safeData.pics.highResolutionH || safeData.pics.lowResolutionH || '';
  const picUrlV = safeData.pics.highResolutionV || safeData.pics.lowResolutionV || '';
  
  const is4k = safeData.recommendation.includes('4K') ? 1 : 0;
  const isOriginal = safeData.recommendation.includes('原画') ? 1 : 0;

  const totalEpisodes = safeData.totalEpisodes;
  const recommendationJson = JSON.stringify(safeData.recommendation);
  
  const extraDataJson = JSON.stringify({
    detail: safeData.detail,
    episodes: safeData.extraData.episodes || [],
    episodeList: safeData.extraData.episodeList || []
  });

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
    extraDataJson,
    safeData.sourcePublishTime,
    safeData.sourcePublishTimestamp,
    safeData.videoType,
    safeData.wcKeyword,
    safeData.playType,
    safeData.createTime,
    safeData.publishDate,
    safeData.tipCode,
    safeData.tipMsg,
    safeData.storeTipCode,
    safeData.storeTipMsg,
    safeData.detail
  ];
}

// 获取高质量图片
function getHighQualityPic(pics) {
  return pics.highResolutionH || pics.lowResolutionH || 
         pics.highResolutionV || pics.lowResolutionV || '';
}

// 保存视频数据 - 优化版本（无事务）
export async function saveVideoData(videoData, categoryId, videoDetail = null) {
  const startTime = Date.now();
  
  try {
    // 检查缓存
    const cacheKey = `${videoData.pID}_${categoryId}`;
    if (videoCache.has(cacheKey)) {
      const cached = videoCache.get(cacheKey);
      if (cached.timestamp > Date.now() - 10 * 60 * 1000) { // 10分钟缓存
        return true;
      }
    }

    // 检查视频是否已存在
    const existingVideo = await checkVideoExists(videoData.pID);
    
    // 如果没有提供详情，则获取
    if (!videoDetail) {
      videoDetail = await fetchVideoDetail(videoData.pID);
    }
    
    const safeData = prepareVideoData(videoData, categoryId, videoDetail);
    
    // 判断是否需要更新
    const shouldUpdate = await shouldUpdateVideo(existingVideo, safeData);
    
    if (!shouldUpdate && existingVideo) {
      videoCache.set(cacheKey, { timestamp: Date.now() });
      return true;
    }
    
    const bindParams = getVideoBindParams(safeData);
    
    if (existingVideo && shouldUpdate) {
      // 更新现有记录
      await executeSQL(`
        UPDATE videos SET
          name = ?, sub_title = ?, pic_url = ?, pic_url_h = ?, pic_url_v = ?,
          program_type = ?, cont_display_type = ?, cont_display_name = ?, cont_type = ?,
          score = ?, year = ?, area = ?, language = ?, director = ?, actor = ?,
          content_style = ?, vod_remarks = ?, update_ep = ?, total_episodes = ?,
          is_4k = ?, is_original = ?, way = ?, auth = ?, asset_id = ?,
          publish_time = ?, publish_timestamp = ?, recommendation = ?, extra_data = ?,
          source_publish_time = ?, source_publish_timestamp = ?,
          video_type = ?, wc_keyword = ?, play_type = ?, create_time = ?, publish_date = ?,
          tip_code = ?, tip_msg = ?, store_tip_code = ?, store_tip_msg = ?,
          detail = ?, updated_at = datetime('now')
        WHERE p_id = ?
      `, [...bindParams.slice(1), safeData.pID]);
      
      console.log(`🔄 更新视频: ${safeData.name}`);
    } else {
      // 新增记录
      await executeSQL(`
        INSERT INTO videos (
          p_id, name, sub_title, pic_url, pic_url_h, pic_url_v,
          program_type, cont_display_type, cont_display_name, cont_type,
          score, year, area, language, director, actor,
          content_style, vod_remarks, update_ep, total_episodes, 
          is_4k, is_original, way, auth, asset_id, 
          publish_time, publish_timestamp, recommendation, extra_data,
          source_publish_time, source_publish_timestamp,
          video_type, wc_keyword, play_type, create_time, publish_date,
          tip_code, tip_msg, store_tip_code, store_tip_msg, detail,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `, bindParams);
      
      console.log(`✅ 新增视频: ${safeData.name}`);
    }
    
    // 获取视频ID
    const result = await executeSQL(
      'SELECT id FROM videos WHERE p_id = ?',
      [safeData.pID]
    );
    
    let videoId = null;
    if (result && result.result && result.result[0] && result.result[0].results && result.result[0].results.length > 0) {
      videoId = result.result[0].results[0].id;
    }
    
    if (videoId) {
      // 更新搜索索引
      await executeSQL(`
        INSERT OR REPLACE INTO search_index (video_id, name, sub_title, director, actor, content_style, wc_keyword)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        videoId, 
        safeData.name, 
        safeData.subTitle, 
        safeData.director, 
        safeData.actor, 
        safeData.contentStyle,
        safeData.wcKeyword
      ]);
      
      // 保存剧集信息
      if (!existingVideo || safeData.videoType !== 'movie') {
        await saveEpisodesData(videoId, safeData, videoDetail);
      }
    }
    
    // 更新缓存
    videoCache.set(cacheKey, { timestamp: Date.now() });
    
    const duration = Date.now() - startTime;
    if (duration > 1000) {
      console.log(`⏱️ 视频保存耗时: ${duration}ms`);
    }
    
    return true;
    
  } catch (error) {
    console.error(`❌ 保存视频失败 ${videoData.name}:`, error.message);
    return false;
  }
}

// 准备剧集数据
function prepareEpisodesData(videoId, safeData, videoDetail) {
  const episodes = [];
  const videoPid = safeData.pID;
  const videoType = safeData.videoType;
  
  // 1. 优先从详情API获取
  if (videoDetail?.datas?.length > 0) {
    episodes.push(...videoDetail.datas.map((episodeData, index) => ({
      episodeId: episodeData.pID || `${videoPid}_${index + 1}`,
      episodeName: episodeData.name || `第${index + 1}集`,
      episodeIndex: episodeData.index ? parseInt(episodeData.index) : index + 1
    })));
  }
  
  // 2. 从extraData获取
  if (episodes.length === 0 && safeData.extraData?.episodes?.length > 0) {
    episodes.push(...safeData.extraData.episodes.map((episodeId, index) => {
      let episodeName = `第${index + 1}集`;
      if (safeData.extraData.episodeList?.[index]) {
        episodeName = safeData.extraData.episodeList[index].name || episodeName;
      }
      return {
        episodeId: episodeId,
        episodeName: episodeName,
        episodeIndex: index + 1
      };
    }));
  }
  
  // 3. 根据视频类型生成默认剧集
  if (episodes.length === 0) {
    if (videoType === 'movie') {
      episodes.push({
        episodeId: videoPid,
        episodeName: '正片',
        episodeIndex: 1
      });
    } else if (safeData.totalEpisodes > 1) {
      for (let i = 0; i < safeData.totalEpisodes; i++) {
        episodes.push({
          episodeId: `${videoPid}_${i + 1}`,
          episodeName: `第${i + 1}集`,
          episodeIndex: i + 1
        });
      }
    } else {
      episodes.push({
        episodeId: videoPid,
        episodeName: '第1集',
        episodeIndex: 1
      });
    }
  }
  
  return episodes;
}

// 保存剧集数据 - 高性能版本
async function saveEpisodesData(videoId, safeData, videoDetail) {
  const startTime = Date.now();
  
  try {
    // 检查缓存
    const cacheKey = `episodes_${videoId}`;
    if (episodeCache.has(cacheKey)) {
      const cached = episodeCache.get(cacheKey);
      if (cached.timestamp > Date.now() - 10 * 60 * 1000) {
        return true;
      }
    }

    const episodes = prepareEpisodesData(videoId, safeData, videoDetail);
    
    if (episodes.length === 0) {
      episodes.push({
        episodeId: safeData.pID,
        episodeName: safeData.videoType === 'movie' ? '正片' : '第1集',
        episodeIndex: 1
      });
    }
    
    // 准备批量插入数据
    const episodesData = episodes.map(episode => ({
      video_id: videoId,
      episode_id: episode.episodeId,
      episode_name: episode.episodeName,
      episode_index: episode.episodeIndex
    }));
    
    // 使用优化的批量插入
    const result = await batchInsertEpisodes(episodesData);
    
    if (result.success > 0) {
      episodeCache.set(cacheKey, { timestamp: Date.now() });
      const duration = Date.now() - startTime;
      console.log(`🎬 保存剧集: ${result.success} 个 (${duration}ms)`);
      return true;
    }
    
    return false;
    
  } catch (error) {
    console.error('❌ 保存剧集失败:', error.message);
    return false;
  }
}

// 批量处理视频数据 - 优化版本
export async function processVideoBatch(videoList, categoryId) {
  const startTime = Date.now();
  const results = {
    total: videoList.length,
    success: 0,
    failed: 0,
    details: []
  };
  
  console.log(`🚀 开始批量处理 ${videoList.length} 个视频`);
  
  // 并行获取所有视频详情
  const videoDetails = await fetchVideoDetailsParallel(videoList);
  
  // 批量处理视频
  for (let i = 0; i < videoList.length; i++) {
    const videoData = videoList[i];
    const videoDetail = videoDetails[videoData.pID] || null;
    
    try {
      const success = await saveVideoData(videoData, categoryId, videoDetail);
      
      if (success) {
        results.success++;
        results.details.push({
          name: videoData.name,
          status: 'success'
        });
      } else {
        results.failed++;
        results.details.push({
          name: videoData.name,
          status: 'failed'
        });
      }
    } catch (error) {
      results.failed++;
      results.details.push({
        name: videoData.name,
        status: 'error',
        message: error.message
      });
    }
    
    // 显示进度
    if ((i + 1) % 5 === 0 || i === videoList.length - 1) {
      console.log(`📊 处理进度: ${i + 1}/${videoList.length}, 成功: ${results.success}, 失败: ${results.failed}`);
    }
  }
  
  const totalDuration = Date.now() - startTime;
  console.log(`🎉 批量处理完成: 成功 ${results.success}/${results.total}, 失败 ${results.failed} (总耗时: ${totalDuration}ms)`);
  
  return results;
}
