// scripts/generate-sports-data.js
const fs = require('fs');
const path = require('path');

// 确保数据目录存在
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

async function fetchData() {
  try {
    console.log('开始获取数据...');
    
    // 获取 M3U 数据
    console.log('获取 M3U 数据...');
    const m3uResponse = await fetch('http://nas.hxfkof.top:35455/miguevent.m3u?userid=1769382755&usertoken=nlps537E52A0F575296BF984');
    const m3uText = await m3uResponse.text();
    
    // 获取 JSON 数据
    console.log('获取 JSON 数据...');
    const jsonResponse = await fetch('https://vms-sc.miguvideo.com/vms-match/v6/staticcache/basic/match-list/normal-match-list/0/all/default/1/miguvideo');
    const jsonData = await jsonResponse.json();
    
    console.log('数据获取成功，开始处理...');
    
    // 解析 M3U 数据
    const m3uChannels = parseM3U(m3uText);
    console.log(`解析到 ${m3uChannels.length} 个 M3U 频道`);
    
    // 处理 JSON 数据并与 M3U 匹配
    const mergedData = processJsonData(jsonData, m3uChannels);
    console.log(`处理完成，共 ${mergedData.data.length} 场比赛`);
    
    // 保存合并后的数据
    const outputPath = path.join(dataDir, 'sports-data.json');
    fs.writeFileSync(outputPath, JSON.stringify(mergedData, null, 2));
    console.log(`数据已保存到 ${outputPath}`);
    
  } catch (error) {
    console.error('数据处理失败:', error);
    process.exit(1);
  }
}

// 解析 M3U 文件
function parseM3U(m3uText) {
  const channels = [];
  const lines = m3uText.split('\n');
  
  let currentChannel = {};
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    
    if (trimmedLine.startsWith('#EXTINF:')) {
      currentChannel = {};
      
      // 解析标题（逗号后的部分）
      const titleMatch = trimmedLine.match(/,(.*)$/);
      if (titleMatch) {
        currentChannel.title = titleMatch[1].trim();
        
        // 从标题中提取时间、赛事名称、队伍信息
        extractChannelInfo(currentChannel);
      }
      
    } else if (trimmedLine.startsWith('http')) {
      // 这是 URL 行
      currentChannel.url = trimmedLine;
      
      // 从 URL 中提取 pID
      const pidMatch = trimmedLine.match(/\/(\d+)\.m3u8/);
      if (pidMatch) {
        currentChannel.pID = pidMatch[1];
      }
      
      if (currentChannel.title) {
        channels.push(currentChannel);
      }
      currentChannel = {};
    }
  }
  
  return channels;
}

// 从频道标题中提取信息
function extractChannelInfo(channel) {
  const title = channel.title;
  
  // 提取时间 (格式: MM/DD HH:mm)
  const timeMatch = title.match(/(\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2})/);
  if (timeMatch) {
    channel.extractedTime = timeMatch[1];
  }
  
  // 提取赛事名称
  const competitionKeywords = [
    'NBA', '意甲', '英超', '西甲', '德甲', '法甲', '中超', '中甲', '中乙',
    '斯诺克', '乒乓球', '网球', '田径', '篮球', '足球', 'UFC', 'WTT',
    '超三联赛', '浙江省城市篮球联赛', '四川省城市足球联赛', '乌鲁木齐城市足球联赛',
    '江苏省城市足球联赛', '江西省城市足球超级联赛', '湖南省足球联赛'
  ];
  
  for (const keyword of competitionKeywords) {
    if (title.includes(keyword)) {
      channel.extractedCompetition = keyword;
      break;
    }
  }
  
  // 提取队伍信息 (包含 VS 或 vs)
  const teamMatch = title.match(/(.+)(?:VS|vs)(.+)$/);
  if (teamMatch) {
    channel.extractedTeams = {
      team1: teamMatch[1].trim(),
      team2: teamMatch[2].trim()
    };
  }
  
  return channel;
}

// 处理 JSON 数据并与 M3U 匹配
function processJsonData(jsonData, m3uChannels) {
  const result = [];
  const matchList = jsonData.body.matchList;
  
  // 按日期处理所有比赛
  for (const [date, matches] of Object.entries(matchList)) {
    for (const match of matches) {
      const mergedMatch = {
        date: date,
        pID: match.pID,
        title: match.title,
        keyword: match.keyword,
        competitionName: match.competitionName,
        pkInfoTitle: match.pkInfoTitle,
        modifyTitle: match.modifyTitle,
        matchInfo: {
          time: extractTimeFromKeyword(match.keyword),
          competition: match.competitionName,
          teams: match.pkInfoTitle
        },
        nodes: []
      };
      
      // 三级匹配：时间 -> 赛事名称 -> 比赛队伍
      const matchedChannels = findMatchingChannels(mergedMatch, m3uChannels);
      
      // 添加匹配的 M3U 频道信息
      if (matchedChannels.length > 0) {
        mergedMatch.nodes = matchedChannels.map(channel => ({
          title: channel.title,
          pID: channel.pID,
          url: channel.url,
          matchScore: channel.matchScore
        }));
      }
      
      result.push(mergedMatch);
    }
  }
  
  // 按日期和时间排序
  result.sort((a, b) => {
    if (a.date !== b.date) {
      return a.date.localeCompare(b.date);
    }
    return a.matchInfo.time.localeCompare(b.matchInfo.time);
  });
  
  return {
    timestamp: new Date().toISOString(),
    updateTime: new Date().toLocaleString('zh-CN'),
    data: result
  };
}

// 三级匹配策略
function findMatchingChannels(match, m3uChannels) {
  const matchedChannels = [];
  
  for (const channel of m3uChannels) {
    let matchScore = 0;
    
    // 第一级：时间匹配
    if (channel.extractedTime && match.matchInfo.time) {
      if (isTimeMatch(channel.extractedTime, match.matchInfo.time, match.date)) {
        matchScore += 3;
      }
    }
    
    // 第二级：赛事名称匹配
    if (channel.extractedCompetition && match.matchInfo.competition) {
      if (isCompetitionMatch(channel.extractedCompetition, match.matchInfo.competition)) {
        matchScore += 2;
      }
    }
    
    // 第三级：队伍名称匹配
    if (channel.extractedTeams && match.matchInfo.teams) {
      if (isTeamMatch(channel.extractedTeams, match.matchInfo.teams)) {
        matchScore += 1;
      }
    }
    
    // 如果匹配分数达到阈值，认为是有效匹配
    if (matchScore >= 2) {
      matchedChannels.push({
        ...channel,
        matchScore: matchScore
      });
    }
  }
  
  // 按匹配分数排序
  return matchedChannels.sort((a, b) => b.matchScore - a.matchScore);
}

// 时间匹配逻辑
function isTimeMatch(channelTime, matchTime, matchDate) {
  // 将频道时间转换为与比赛日期对应的格式
  const month = matchDate.slice(4, 6);
  const day = matchDate.slice(6, 8);
  
  // 频道时间格式: "10/07 19:30" -> 转换为 "10月07日19:30"
  const normalizedChannelTime = channelTime.replace(/\//g, '月') + '日';
  const normalizedMatchTime = `${month}月${day}日${matchTime}`;
  
  return normalizedChannelTime === normalizedMatchTime;
}

// 赛事名称匹配逻辑
function isCompetitionMatch(channelCompetition, matchCompetition) {
  return channelCompetition === matchCompetition || 
         matchCompetition.includes(channelCompetition) ||
         channelCompetition.includes(matchCompetition);
}

// 队伍匹配逻辑
function isTeamMatch(channelTeams, matchTeams) {
  const matchTeamStr = matchTeams.toLowerCase();
  
  if (channelTeams.team1 && matchTeamStr.includes(channelTeams.team1.toLowerCase())) {
    return true;
  }
  
  if (channelTeams.team2 && matchTeamStr.includes(channelTeams.team2.toLowerCase())) {
    return true;
  }
  
  return false;
}

// 从关键词中提取时间
function extractTimeFromKeyword(keyword) {
  if (!keyword) return '00:00';
  
  const timeMatch = keyword.match(/(\d{1,2}月\d{1,2}日)(\d{2}:\d{2})/);
  return timeMatch ? timeMatch[2] : '00:00';
}

// 执行主函数
fetchData();
