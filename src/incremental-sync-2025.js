import { incrementalSync } from './incremental-sync-common.js';
import { executeSQL } from './db.js';
import { fetchMiguCategory } from './migu-api.js';

const config = {
  syncName: '2025年',
  syncType: 'incremental_2025',
  categories: ['1000', '1001', '1005', '1002', '1007', '601382'],
  categoryNames: {
    '1000': '电影', '1001': '电视剧', '1005': '综艺',
    '1002': '纪实', '1007': '动漫', '601382': '少儿'
  },
  getExistingVideosQuery: (cid) => executeSQL(
    'SELECT p_id, update_ep, total_episodes FROM videos WHERE cont_display_type = ? AND TRIM(year) = ?',
    [cid, '2025']
  ),
  fetchVideos: async (cid, page) => {
    const videos = await fetchMiguCategory(cid, page, 20, { mediaYear: '2025' });
    // 过滤出2025年的视频
    return videos.filter(video => {
      const videoYear = (video.year || '').toString().trim();
      return videoYear === '2025';
    });
  },
  getTotalCountQuery: (cid) => executeSQL(
    'SELECT COUNT(*) as count FROM videos WHERE cont_display_type = ? AND TRIM(year) = ?',
    [cid, '2025']
  )
};

incrementalSync(config).catch(console.error);
