import fetch from 'node-fetch';

// Cloudflare D1 配置
const config = {
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
  apiToken: process.env.CLOUDFLARE_API_TOKEN,
  databaseId: process.env.D1_DATABASE_ID
};

// D1 API 基础URL
const D1_API_BASE = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/d1/database/${config.databaseId}`;

// 执行 D1 SQL
export async function executeSQL(sql, params = []) {
  try {
    const response = await fetch(`${D1_API_BASE}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sql,
        params
      })
    });

    const result = await response.json();
    
    if (!result.success) {
      console.error(`❌ D1 SQL Error:`, result.errors);
      throw new Error(`D1 SQL Error: ${JSON.stringify(result.errors)}`);
    }
    
    return result;
  } catch (error) {
    console.error(`❌ 数据库请求失败:`, error.message);
    throw error;
  }
}

// 检查环境变量
export function checkEnv() {
  if (!config.accountId || !config.apiToken || !config.databaseId) {
    console.error('错误: 请设置以下环境变量:');
    console.error('CLOUDFLARE_ACCOUNT_ID - Cloudflare 账户ID');
    console.error('CLOUDFLARE_API_TOKEN - Cloudflare API Token');
    console.error('D1_DATABASE_ID - D1 数据库ID');
    process.exit(1);
  }
}

// 批量执行SQL - 性能优化
export async function executeBatchSQL(queries) {
  try {
    const response = await fetch(`${D1_API_BASE}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(queries)
    });

    const result = await response.json();
    
    if (!result.success) {
      console.error(`❌ D1 SQL Batch Error:`, result.errors);
      throw new Error(`D1 SQL Batch Error: ${JSON.stringify(result.errors)}`);
    }
    
    return result;
  } catch (error) {
    console.error(`❌ 批量数据库请求失败:`, error.message);
    throw error;
  }
}

// 优化批量插入 - 专门用于剧集批量插入
export async function batchInsertEpisodes(episodesData) {
  if (episodesData.length === 0) return { success: 0 };
  
  try {
    // 每批最多100条记录
    const batchSize = 100;
    let totalInserted = 0;
    
    for (let i = 0; i < episodesData.length; i += batchSize) {
      const batch = episodesData.slice(i, i + batchSize);
      const placeholders = batch.map(() => '(?, ?, ?, ?, datetime("now"), datetime("now"))').join(',');
      const values = batch.flatMap(ep => [
        ep.video_id, ep.episode_id, ep.episode_name, ep.episode_index
      ]);
      
      const sql = `
        INSERT OR REPLACE INTO episodes 
        (video_id, episode_id, episode_name, episode_index, created_at, updated_at)
        VALUES ${placeholders}
      `;
      
      await executeSQL(sql, values);
      totalInserted += batch.length;
    }
    
    return { success: totalInserted };
  } catch (error) {
    console.error('❌ 批量插入剧集失败:', error.message);
    return { success: 0, error: error.message };
  }
}
