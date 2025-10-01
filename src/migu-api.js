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
