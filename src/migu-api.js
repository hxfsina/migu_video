import fetch from 'node-fetch';
import { executeSQL } from './db.js';

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
    console.log(`🔗 请求URL: ${url.replace(/(pageStart=)\d+/, '$1' + page)}`);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Dalvik/2.1.0 (Linux; U; Android 9; CM311-5-ZG Build/CM311-5-ZG)',
        //'Origin': 'https://www.miguvideo.com',
        //'Referer': 'https://www.miguvideo.com/',
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
   // console.log(`🔗 获取视频详情: ${pId}`);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Dalvik/2.1.0 (Linux; U; Android 9; CM311-5-ZG Build/CM311-5-ZG)',
        //'Origin': 'https://www.miguvideo.com',
        //'Referer': 'https://www.miguvideo.com/',
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
    
    console.log(`✅ 获取视频详情成功: ${pId}`);
    return data.body?.data || null;
    
  } catch (error) {
    console.error(`❌ 获取视频详情失败 ${pId}:`, error.message);
    return null;
  }
}

// 保存视频数据 - 主要逻辑
export async function saveVideoData(videoData, categoryId) {
  try {
    // 检查视频是否已存在
    const existingVideo = await checkVideoExists(videoData.pID);
    
    // 获取视频详情信息
    const videoDetail = await fetchVideoDetail(videoData.pID);
    
    const safeData = prepareVideoData(videoData, categoryId, videoDetail);
    
    // 判断是否需要更新
    const shouldUpdate = await shouldUpdateVideo(existingVideo, safeData);
    
    if (!shouldUpdate && existingVideo) {
      console.log(`⏭️  跳过更新: ${safeData.name} (无变化)`);
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
      
      console.log(`🔄 更新视频成功: ${safeData.name}`);
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
      
      console.log(`✅ 新增视频成功: ${safeData.name}`);
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
      
      // 保存剧集信息 - 只在新增或剧集类更新时处理
      if (!existingVideo || safeData.videoType !== 'movie') {
        const episodesSaved = await saveEpisodesData(videoId, safeData, videoDetail);
        
        if (episodesSaved) {
          console.log(`🎬 视频 ${safeData.name} 剧集保存成功`);
        }
      }
    }
    
    return true;
    
  } catch (error) {
    console.error(`❌ 保存视频失败 ${videoData.name}:`, error.message);
    return false;
  }
}

// 检查视频是否已存在
async function checkVideoExists(pId) {
  try {
    const result = await executeSQL(
      'SELECT id, score, update_ep, total_episodes FROM videos WHERE p_id = ?',
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
   //   console.log(`🎬 电影评分变化: ${oldScore} -> ${newScore}`);
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
   //   console.log(`📺 剧集评分变化: ${oldScore} -> ${newScore}`);
      return true;
    }
    
    // 检查集数信息变化
    if (oldUpdateEP !== newUpdateEP) {
   //   console.log(`📺 更新集数变化: "${oldUpdateEP}" -> "${newUpdateEP}"`);
      return true;
    }
    
    // 检查总集数变化
    if (oldTotalEpisodes !== newTotalEpisodes) {
   //   console.log(`📺 总集数变化: ${oldTotalEpisodes} -> ${newTotalEpisodes}`);
      return true;
    }
  }
  
  return false;
}

// 保存剧集数据 - 修正版本：detail是总简介，不是每集简介
// 在 saveEpisodesData 函数中，修改剧集保存逻辑：

// 保存剧集数据 - 简化版本：不需要每集的detail
async function saveEpisodesData(videoId, safeData, videoDetail) {
  try {
    let episodes = [];
    const videoPid = safeData.pID;
    const videoType = safeData.videoType;
    
  //  console.log(`🎬 处理剧集: ${safeData.name}, 类型: ${videoType}`);
    
    // 从详情数据获取剧集信息
    if (videoDetail && videoDetail.datas && Array.isArray(videoDetail.datas)) {
      console.log(`📋 从详情获取 ${videoDetail.datas.length} 个剧集`);
      
      episodes = videoDetail.datas.map((episodeData, index) => {
        const episodeId = episodeData.pID || `${videoPid}_${index + 1}`;
        const episodeName = episodeData.name || `第${index + 1}集`;
        const episodeIndex = episodeData.index ? parseInt(episodeData.index) : index + 1;
        
        return {
          episodeId: episodeId,
          episodeName: episodeName,
          episodeIndex: episodeIndex
        };
      });
    }
    // 从 extraData.episodes 获取剧集ID
    else if (safeData.extraData && safeData.extraData.episodes && Array.isArray(safeData.extraData.episodes)) {
      const episodeIds = safeData.extraData.episodes;
   //   console.log(`📋 从extraData获取 ${episodeIds.length} 个剧集ID`);
      
      episodes = episodeIds.map((episodeId, index) => {
        let episodeName = `第${index + 1}集`;
        
        // 尝试从 episodeList 获取剧集名称
        if (safeData.extraData.episodeList && safeData.extraData.episodeList[index]) {
          const episodeInfo = safeData.extraData.episodeList[index];
          episodeName = episodeInfo.name || `第${index + 1}集`;
        }
        
        return {
          episodeId: episodeId,
          episodeName: episodeName,
          episodeIndex: index + 1
        };
      });
    }
    // 从 updateEP 推断集数（电视剧/动漫）
    else if (videoType === 'tv' || videoType === 'anime') {
      const totalEpisodes = safeData.totalEpisodes;
      if (totalEpisodes > 1) {
        console.log(`📋 根据总集数创建 ${totalEpisodes} 个剧集`);
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
    // 电影和其他类型
    else {
      episodes.push({
        episodeId: videoPid,
        episodeName: videoType === 'movie' ? '正片' : '全集',
        episodeIndex: 1
      });
    }
    
    console.log(`📝 准备保存 ${episodes.length} 个剧集`);
    
    // 保存剧集到数据库 - 只保存基本信息
    let savedCount = 0;
    for (const episode of episodes) {
      try {
        // 检查剧集是否已存在
        const existingEpisode = await executeSQL(
          'SELECT id FROM episodes WHERE video_id = ? AND episode_id = ?',
          [videoId, episode.episodeId]
        );
        
        if (existingEpisode && existingEpisode.result && existingEpisode.result[0] && existingEpisode.result[0].results && existingEpisode.result[0].results.length > 0) {
          // 更新现有剧集
          await executeSQL(`
            UPDATE episodes SET
              episode_name = ?, episode_index = ?, updated_at = datetime('now')
            WHERE video_id = ? AND episode_id = ?
          `, [
            episode.episodeName,
            episode.episodeIndex,
            videoId,
            episode.episodeId
          ]);
        } else {
          // 新增剧集
          await executeSQL(`
            INSERT INTO episodes 
            (video_id, episode_id, episode_name, episode_index, created_at, updated_at)
            VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
          `, [
            videoId,
            episode.episodeId,
            episode.episodeName,
            episode.episodeIndex
          ]);
        }
        
        savedCount++;
      } catch (episodeError) {
        console.error(`❌ 保存剧集失败 ${episode.episodeName}:`, episodeError.message);
      }
    }
    
    console.log(`🎬 成功保存 ${savedCount}/${episodes.length} 个剧集`);
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

// 准备视频数据 - 修正版本：detail是总简介
// 在 prepareVideoData 函数中修正数据来源
function prepareVideoData(videoData, categoryId, videoDetail = null) {
  // 智能判断视频类型
  const videoType = determineVideoType(videoData, categoryId);
  
  const safeData = {
    pID: videoData.pID || 'unknown_' + Date.now(),
    // 🔥 所有基本信息都使用查询API的数据
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
    
    // 🔥 只有总简介从详情API获取
    detail: videoDetail?.detail || '',
    
    // 关键词和播放类型
    wcKeyword: videoData.wcKeyword || '',
    playType: videoData.playType || '',

    // 时间相关
    createTime: videoData.createTime || '',
    publishDate: videoData.publishDate || 0,

    // 付费类型字段
    tipCode: videoData.tip?.code || '',
    tipMsg: videoData.tip?.msg || '',
    storeTipCode: videoData.storeTip?.code || '',
    storeTipMsg: videoData.storeTip?.msg || '',
    
    // 额外数据
    extraData: videoData.extraData || {}
  };

  console.log(`📊 视频数据: ${safeData.name}`);
  //console.log(`  类型: ${safeData.videoType}, 地区: "${safeData.area}", 评分: ${safeData.score}, 集数: ${safeData.totalEpisodes}`);

  return safeData;
}

// 获取视频绑定参数
function getVideoBindParams(safeData) {
  const picUrl = getHighQualityPic(safeData.pics) || '';
  const picUrlH = safeData.pics.highResolutionH || safeData.pics.lowResolutionH || '';
  const picUrlV = safeData.pics.highResolutionV || safeData.pics.lowResolutionV || '';
  
  const is4k = safeData.recommendation.includes('4K') ? 1 : 0;
  const isOriginal = safeData.recommendation.includes('原画') ? 1 : 0;

  let totalEpisodes = safeData.totalEpisodes;

  const recommendationJson = JSON.stringify(safeData.recommendation);
  
  const extraDataJson = JSON.stringify({
    detail: safeData.detail, // 总简介也保存在extra_data中备份
    episodes: safeData.extraData.episodes || [],
    episodeList: safeData.extraData.episodeList || []
  });

  return [
    safeData.pID,                       // 1. p_id
    safeData.name,                      // 2. name
    safeData.subTitle,                  // 3. sub_title
    picUrl,                             // 4. pic_url
    picUrlH,                            // 5. pic_url_h
    picUrlV,                            // 6. pic_url_v
    safeData.programType,               // 7. program_type
    safeData.contDisplayType,           // 8. cont_display_type
    safeData.contDisplayName,           // 9. cont_display_name
    safeData.contentType,               // 10. cont_type
    safeData.score,                     // 11. score
    safeData.year,                      // 12. year
    safeData.area,                      // 13. area
    safeData.language,                  // 14. language
    safeData.director,                  // 15. director
    safeData.actor,                     // 16. actor
    safeData.contentStyle,              // 17. content_style
    safeData.updateEP,                  // 18. vod_remarks
    safeData.updateEP,                  // 19. update_ep
    totalEpisodes,                      // 20. total_episodes
    is4k,                               // 21. is_4k
    isOriginal,                         // 22. is_original
    safeData.way,                       // 23. way
    safeData.auth,                      // 24. auth
    safeData.assetId,                   // 25. asset_id
    safeData.publishTime,               // 26. publish_time
    safeData.publishTimestamp,          // 27. publish_timestamp
    recommendationJson,                 // 28. recommendation
    extraDataJson,                      // 29. extra_data
    safeData.sourcePublishTime,         // 30. source_publish_time
    safeData.sourcePublishTimestamp,    // 31. source_publish_timestamp
    safeData.videoType,                 // 32. video_type
    safeData.wcKeyword,                 // 33. wc_keyword
    safeData.playType,                  // 34. play_type
    safeData.createTime,                // 35. create_time
    safeData.publishDate,               // 36. publish_date
    safeData.tipCode,                   // 37. tip_code
    safeData.tipMsg,                    // 38. tip_msg
    safeData.storeTipCode,              // 39. store_tip_code
    safeData.storeTipMsg,               // 40. store_tip_msg
    safeData.detail                     // 41. detail (总简介)
  ];
}

// 获取高质量图片
function getHighQualityPic(pics) {
  return pics.highResolutionH || pics.lowResolutionH || 
         pics.highResolutionV || pics.lowResolutionV || '';
}

// 批量处理视频数据
export async function processVideoBatch(videoList, categoryId) {
  const results = {
    total: videoList.length,
    success: 0,
    failed: 0,
    details: []
  };
  
  for (const videoData of videoList) {
    try {
      const success = await saveVideoData(videoData, categoryId);
      
      if (success) {
        results.success++;
        results.details.push({
          name: videoData.name,
          status: 'success',
          message: '保存成功'
        });
      } else {
        results.failed++;
        results.details.push({
          name: videoData.name,
          status: 'failed',
          message: '保存失败'
        });
      }
    } catch (error) {
      results.failed++;
      results.details.push({
        name: videoData.name,
        status: 'error',
        message: error.message
      });
      console.error(`❌ 处理视频失败 ${videoData.name}:`, error.message);
    }
  }
  
  console.log(`📊 批量处理完成: 成功 ${results.success}/${results.total}, 失败 ${results.failed}`);
  return results;
}
