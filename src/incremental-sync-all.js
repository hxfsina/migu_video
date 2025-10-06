import { incrementalSync } from './incremental-sync-common.js';
import { executeSQL } from './db.js';
import { fetchMiguCategory } from './migu-api.js';

const config = {
  syncName: '所有分类',
  syncType: 'incremental',
  categories: ['1000', '1001', '1005', '1002', '1007', '601382'],
  categoryNames: {
    '1000': '电影', '1001': '电视剧', '1005': '综艺',
    '1002': '纪实', '1007': '动漫', '601382': '少儿'
  },
  getExistingVideosQuery: (cid) => executeSQL(
    'SELECT p_id, update_ep, total_episodes FROM videos WHERE cont_display_type = ?',
    [cid]
  ),
  fetchVideos: (cid, page) => fetchMiguCategory(cid, page, 20),
  getTotalCountQuery: (cid) => executeSQL(
    'SELECT COUNT(*) as count FROM videos WHERE cont_display_type = ?',
    [cid]
  )
};

incrementalSync(config).catch(console.error);
