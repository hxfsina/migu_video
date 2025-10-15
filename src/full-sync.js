import { checkEnv } from './db.js';
import { fetchMiguCategory, processVideoBatch } from './migu-api.js';

async function fullSyncAllCategories() {
  checkEnv();
  
  // 同步配置
  const pageLimit = 1; // 0=全量，1=测试，其他数字=限制页数
  const delayMs = 1000; // 降低延迟
  
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
  const startTime = Date.now();
  
  for (const cid of allCategories) {
    const categoryName = categoryNames[cid] || cid;
    const categoryStartTime = Date.now();
    
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
      
      const categoryDuration = Date.now() - categoryStartTime;
      results[cid] = {
        name: categoryName,
        videos: categoryVideos,
        pages: currentPage - 1,
        status: 'completed',
        duration: categoryDuration
      };
      
      console.log(`🎉 分类 ${categoryName} 同步完成: ${categoryVideos} 个视频 (耗时: ${categoryDuration}ms)`);
      
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
      console.log(`⏳ 等待 2 秒后开始下一个分类...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  // 输出最终结果
  const totalDuration = Date.now() - startTime;
  console.log(`\n🎊 所有分类同步完成! (总耗时: ${totalDuration}ms)`);
  console.log(`📊 详细结果:`);
  
  let totalVideos = 0;
  let totalPages = 0;
  
  Object.values(results).forEach(result => {
    const statusIcon = result.status === 'completed' ? '✅' : '❌';
    console.log(`${statusIcon} ${result.name}: ${result.videos} 个视频, ${result.pages} 页${result.duration ? ` (${result.duration}ms)` : ''}`);
    
    if (result.error) {
      console.log(`   错误: ${result.error}`);
    }
    
    totalVideos += result.videos;
    totalPages += result.pages;
  });
  
  console.log(`\n📈 统计汇总:`);
  console.log(`   总视频: ${totalVideos} 个`);
  console.log(`   总页数: ${totalPages} 页`);
  console.log(`   总耗时: ${totalDuration}ms`);
  console.log(`   平均速度: ${(totalVideos / (totalDuration / 1000)).toFixed(2)} 视频/秒`);
}

// 执行同步
fullSyncAllCategories().catch(console.error);
