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
    throw new Error(`D1 SQL Error: ${JSON.stringify(result.errors)}`);
  }
  
  return result;
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
