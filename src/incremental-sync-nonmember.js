import { incrementalSync } from './incremental-sync-common.js';
import { executeSQL } from './db.js';
import { fetchMiguCategory } from './migu-api.js';

const config = {
  syncName: '非会员',
  syncType: 'incremental_non_member',
  categories: ['1000', '1001', '1005', '1002', '1007', '601382'],
  categoryNames: {
    '1000': '电影', '1001': '电视剧', '1005': '综艺',
    '1002': '纪实', '1007': '动漫', '601382': '少儿'
  },
  getExistingVideosQuery: (cid) => executeSQL(
    'SELECT p_id, update_ep, total_episodes FROM videos WHERE cont_display_type = ? AND tip_code IN (?, ?, ?, ?)',
    [cid, '', 'USE_TICKET', 'FREE_LIMIT', 'HUIYUANZHEKOU01']
  ),
  fetchVideos: async (cid, page) => {
    const nonMemberPayTypes = ['1', '3', '4', '5'];
    let allVideos = [];
    
    for (const payType of nonMemberPayTypes) {
      try {
        const videos = await fetchMiguCategory(cid, page, 20, { payType });
        if (videos && videos.length > 0) {
          allVideos = allVideos.concat(videos);
        }
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`payType=${payType} 获取失败:`, error.message);
      }
    }
    
    return allVideos;
  },
  getTotalCountQuery: (cid) => executeSQL(
    'SELECT COUNT(*) as count FROM videos WHERE cont_display_type = ? AND tip_code IN (?, ?, ?, ?)',
    [cid, '', 'USE_TICKET', 'FREE_LIMIT', 'HUIYUANZHEKOU01']
  )
};

incrementalSync(config).catch(console.error);
