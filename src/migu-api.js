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
export async function saveVideoData(videoData, categoryId) {
  try {
    const safeData = prepareVideoData(videoData, categoryId);
    const bindParams = getVideoBindParams(safeData);
    
    // 保存视频基本信息
    await executeSQL(`
      INSERT OR REPLACE INTO videos (
        p_id, name, sub_title, pic_url, pic_url_h, pic_url_v,
        program_type, cont_display_type, cont_display_name, cont_type,
        score, year, area, language, director, actor,
        content_style, vod_remarks, update_ep, total_episodes, 
        is_4k, is_original, way, auth, asset_id, 
        publish_time, publish_timestamp, recommendation, extra_data,
        source_publish_time, source_publish_timestamp,
        video_type
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, bindParams);
    
    // 获取视频ID
    const result = await executeSQL(
      'SELECT id FROM videos WHERE p_id = ?',
      [safeData.pID]
    );
    
    const videoId = result[0]?.results?.[0]?.id;
    
    if (videoId) {
      // 保存搜索索引
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
      
      // 保存剧集信息
      const episodesSaved = await saveEpisodesData(videoId, safeData, videoData);
      
      if (episodesSaved) {
        console.log(`✅ 保存视频成功: ${safeData.name} (${safeData.videoType}) + 剧集`);
      } else {
        console.log(`✅ 保存视频成功: ${safeData.name} (${safeData.videoType})`);
      }
    } else {
      console.log(`✅ 保存视频成功: ${safeData.name} (${safeData.videoType})`);
    }
    
    return true;
    
  } catch (error) {
    console.error(`❌ 保存视频失败:`, error.message);
    return false;
  }
}

// 保存剧集数据 - 修复版本，正确解析 extraData
async function saveEpisodesData(videoId, safeData, originalData) {
  try {
    let episodes = [];
    const videoPid = safeData.pID;
    const videoType = safeData.videoType;
    
    console.log(`📋 处理剧集: ${safeData.name}, 类型: ${videoType}, updateEP: ${safeData.updateEP}`);
    
    // 方式1: 从 extraData.episodes 获取剧集ID
    if (originalData.extraData && originalData.extraData.episodes && Array.isArray(originalData.extraData.episodes)) {
      const episodeIds = originalData.extraData.episodes;
      console.log(`  从 extraData 获取 ${episodeIds.length} 个剧集ID`);
      
      episodes = episodeIds.map((episodeId, index) => {
        // 尝试从 episodeList 获取剧集名称
        let episodeName = `第${index + 1}集`;
        if (originalData.extraData.episodeList && originalData.extraData.episodeList[index]) {
          const episodeInfo = originalData.extraData.episodeList[index];
          // 清理名称，移除《》和视频名称
          episodeName = episodeInfo.name
            .replace(/《[^》]*》/, '')
            .replace(safeData.name, '')
            .trim() || `第${index + 1}集`;
        }
        
        return {
          episodeId: episodeId,
          episodeName: episodeName,
          episodeIndex: index + 1
        };
      });
    }
    // 方式2: 从 updateEP 推断集数（电视剧/动漫）
    else if (videoType === 'tv' || videoType === 'anime') {
      const totalEpisodes = safeData.totalEpisodes;
      if (totalEpisodes > 1) {
        console.log(`  根据总集数创建 ${totalEpisodes} 个剧集`);
        for (let i = 0; i < totalEpisodes; i++) {
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
    // 方式3: 电影和其他类型
    else {
      episodes.push({
        episodeId: videoPid,
        episodeName: videoType === 'movie' ? '正片' : '全集',
        episodeIndex: 1
      });
    }
    
    // 保存剧集到数据库
    let savedCount = 0;
    for (const episode of episodes) {
      try {
        await executeSQL(`
          INSERT OR REPLACE INTO episodes 
          (video_id, episode_id, episode_name, episode_index, created_at, updated_at)
          VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
        `, [videoId, episode.episodeId, episode.episodeName, episode.episodeIndex]);
        
        savedCount++;
      } catch (episodeError) {
        console.error(`  保存剧集失败 ${episode.episodeName}:`, episodeError.message);
      }
    }
    
    console.log(`🎬 成功保存 ${savedCount} 个剧集`);
    return savedCount > 0;
    
  } catch (error) {
    console.error('❌ 保存剧集失败:', error.message);
    return false;
  }
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
    return 'tv'; // 有多集信息，判定为电视剧
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
  
  return 'movie'; // 默认判定为电影
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
  
  // 默认为单集
  return 1;
}

function prepareVideoData(videoData, categoryId) {
  // 智能判断视频类型
  const videoType = determineVideoType(videoData, categoryId);
  
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
    contDisplayType: categoryId,
    videoType: videoType,
    totalEpisodes: calculateTotalEpisodes(videoData)
  };

  return safeData;
}

function getVideoBindParams(safeData) {
  const picUrl = getHighQualityPic(safeData.pics) || '';
  const picUrlH = safeData.pics.highResolutionH || safeData.pics.lowResolutionH || '';
  const picUrlV = safeData.pics.highResolutionV || safeData.pics.lowResolutionV || '';
  
  const is4k = safeData.recommendation.includes('4K') ? 1 : 0;
  const isOriginal = safeData.recommendation.includes('原画') ? 1 : 0;

  let totalEpisodes = safeData.totalEpisodes;

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
    safeData.sourcePublishTimestamp,
    safeData.videoType
  ];
}

function getHighQualityPic(pics) {
  return pics.highResolutionH || pics.lowResolutionH || 
         pics.highResolutionV || pics.lowResolutionV || '';
}
