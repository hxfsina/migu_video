import { executeSQL, checkEnv } from './db.js';
import { fetchMiguCategory, processVideoBatch } from './migu-api.js';

async function fullSyncAllCategories() {
  checkEnv();
  
  // 同步配置
  const pageLimit = 1; // 0=全量，1=测试，其他数字=限制页数
  const delayMs = 2000;
  
  // 同步模式说明
  let syncMode = pageLimit === 0 ? '全量模式(所有页面)' : 
                pageLimit === 1 ? '测试模式(每类1页)' : 
                `限制模式(最多${pageLimit}页)`;
  
  console.log(`🚀 开始全量同步所有分类数据 - ${syncMode}`);
  
  // 分类定义
  const allCategories = ['1000', '1001', '1005', '1002', '1007', '601382'];
  const categoryNames = {
    '1000': '电影', '1001': '电视剧', '1005': '综艺',
    '1002': '纪实', '1007': '动漫', '601382': '少儿'
  };
  
  const results = {};
  
  for (const cid of allCategories) {
    const categoryName = categoryNames[cid] || cid;
    console.log(`\n📁 开始同步分类: ${categoryName} (${cid})`);
    
    try {
      let currentPage = 1;
      let categoryVideos = 0;
      let hasMoreData = true;
      
      while (hasMoreData) {
        // 检查页数限制
        if (pageLimit > 0 && currentPage > pageLimit) {
          console.log(`⏹️  达到页数限制 ${pageLimit} 页，停止同步`);
          break;
        }
        
        console.log(`📄 获取分类 ${categoryName} 第 ${currentPage} 页数据`);
        const videos = await fetchMiguCategory(cid, currentPage, 10);
        
        // 如果没有数据，停止同步
        if (!videos || videos.length === 0) {
          console.log(`⏹️  分类 ${categoryName} 第 ${currentPage} 页无数据，停止同步`);
          hasMoreData = false;
          break;
        }
        
        // 批量处理视频数据
        const batchResult = await processVideoBatch(videos, cid);
        categoryVideos += batchResult.success;
        
        console.log(`✅ 分类 ${categoryName} 第 ${currentPage} 页同步完成: ${batchResult.success} 个视频`);
        currentPage++;
        
        // 请求延迟
        if (hasMoreData) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
      
      results[cid] = {
        name: categoryName,
        videos: categoryVideos,
        pages: currentPage - 1,
        status: 'completed'
      };
      
      console.log(`🎉 分类 ${categoryName} 同步完成: ${categoryVideos} 个视频`);
      
    } catch (error) {
      console.error(`❌ 分类 ${categoryName} 同步失败:`, error);
      results[cid] = {
        name: categoryName,
        videos: 0,
        pages: 0,
        status: 'error',
        error: error.message
      };
    }
    
    // 分类间延迟
    if (cid !== allCategories[allCategories.length - 1]) {
      console.log(`⏳ 等待 3 秒后开始下一个分类...`);
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  
  // 输出最终结果
  console.log(`\n🎊 所有分类同步完成!`);
  console.log(`📊 详细结果:`);
  Object.values(results).forEach(result => {
    const statusIcon = result.status === 'completed' ? '✅' : '❌';
    console.log(`${statusIcon} ${result.name}: ${result.videos} 个视频, ${result.pages} 页`);
    if (result.error) {
      console.log(`   错误: ${result.error}`);
    }
  });
}

// 执行同步
fullSyncAllCategories().catch(console.error);
