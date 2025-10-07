import { incrementalSync } from './incremental-sync-common.js';
import { executeSQL } from './db.js';
import { fetchMiguCategory } from './migu-api.js';

const config = {
  syncName: '动漫和少儿',
  syncType: 'incremental_anime_kids',
  categories: ['1007', '601382'], // 只保留动漫和少儿
  categoryNames: {
    '1007': '动漫', 
    '601382': '少儿'
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
