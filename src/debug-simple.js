import { executeSQL, checkEnv } from './db.js';
import { fetchMiguCategory } from './migu-api.js';

async function debugEpisodesDetail() {
  checkEnv();
  
  console.log('🔍 详细调试剧集保存问题...\n');
  
  try {
    // 获取电视剧分类的数据来测试
    console.log('1. 获取电视剧分类数据...');
    const videos = await fetchMiguCategory('1001', 1, 3); // 只获取3个视频测试
    
    if (videos && videos.length > 0) {
      console.log(`获取到 ${videos.length} 个视频\n`);
      
      for (let i = 0; i < videos.length; i++) {
        const video = videos[i];
        console.log(`=== 调试视频 ${i+1}: ${video.name} ===`);
        
        // 检查视频数据结构
        console.log('视频关键字段:');
        console.log(`  pID: ${video.pID}`);
        console.log(`  updateEP: ${video.updateEP}`);
        console.log(`  programType: ${video.programType}`);
        console.log(`  videoType: ${video.videoType}`);
        
        // 检查是否有 extraData
        if (video.extraData) {
          console.log('✅ 有 extraData 字段');
          console.log(`  episodes: ${video.extraData.episodes ? `有 ${video.extraData.episodes.length} 个剧集` : '无'}`);
          console.log(`  episodeList: ${video.extraData.episodeList ? `有 ${video.extraData.episodeList.length} 个剧集详情` : '无'}`);
          
          if (video.extraData.episodes) {
            console.log('  前3个剧集ID:', video.extraData.episodes.slice(0, 3));
          }
        } else {
          console.log('❌ 没有 extraData 字段');
        }
        
        console.log('  完整数据结构:');
        console.log(JSON.stringify({
          pID: video.pID,
          name: video.name,
          updateEP: video.updateEP,
          programType: video.programType,
          hasExtraData: !!video.extraData,
          extraDataKeys: video.extraData ? Object.keys(video.extraData) : []
        }, null, 2));
        
        // 测试保存这个视频
        console.log('\n2. 尝试保存视频和剧集...');
        const { saveVideoData } = await import('./migu-api.js');
        
        // 修改 saveVideoData 来返回更多调试信息
        const originalSaveVideoData = saveVideoData;
        const debugSaveVideoData = async (videoData, categoryId) => {
          try {
            console.log('  开始保存视频...');
            const result = await originalSaveVideoData(videoData, categoryId);
            console.log(`  保存结果: ${result}`);
            return result;
          } catch (error) {
            console.log(`  保存错误: ${error.message}`);
            return false;
          }
        };
        
        const success = await debugSaveVideoData(video, '1001');
        console.log(`  最终保存结果: ${success ? '成功' : '失败'}`);
        
        console.log('----------------------------------------\n');
        
        // 检查数据库是否真的保存了
        await new Promise(resolve => setTimeout(resolve, 1000)); // 等待1秒
        
        const episodesCheck = await executeSQL(`
          SELECT COUNT(*) as count FROM episodes WHERE video_id IN (
            SELECT id FROM videos WHERE p_id = ?
          )
        `, [video.pID]);
        
        const episodeCount = episodesCheck?.result?.[0]?.results?.[0]?.count || 0;
        console.log(`📊 数据库检查: 视频 ${video.name} 有 ${episodeCount} 个剧集\n`);
      }
    }
    
    // 最终检查所有剧集
    console.log('3. 最终检查所有剧集...');
    const allEpisodes = await executeSQL('SELECT COUNT(*) as total FROM episodes');
    console.log(`剧集表总记录数: ${allEpisodes?.result?.[0]?.results?.[0]?.total || 0}`);
    
    // 检查是否有保存错误
    const episodesWithVideos = await executeSQL(`
      SELECT e.*, v.name as video_name 
      FROM episodes e
      LEFT JOIN videos v ON e.video_id = v.id
      LIMIT 5
    `);
    
    if (episodesWithVideos?.result?.[0]?.results?.length > 0) {
      console.log('剧集数据样例:');
      episodesWithVideos.result[0].results.forEach(ep => {
        console.log(`  ${ep.video_name} - ${ep.episode_name} (ID: ${ep.episode_id})`);
      });
    } else {
      console.log('❌ 剧集表中仍然没有数据');
    }
    
  } catch (error) {
    console.error('调试失败:', error);
  }
}

debugEpisodesDetail().catch(console.error);
