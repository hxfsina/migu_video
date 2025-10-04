import sys
import requests
import json
sys.path.append('..')
from base.spider import Spider

class Spider(Spider):
    def init(self, extend):
        self.api_base = "https://miguvideo.hxfrock.ggff.net/api"
        self.timeout = 15
        print(f"咪咕视频API桥接服务已初始化，API地址: {self.api_base}")

    def _call_api(self, endpoint, params=None):
        """统一的API调用方法，带错误处理"""
        try:
            url = f"{self.api_base}/{endpoint}"
            print(f"调用API: {url}, 参数: {params}")
            
            response = requests.get(url, params=params, timeout=self.timeout)
            if response.status_code == 200:
                data = response.json()
                if data.get('code') == 200:
                    print(f"API调用成功: {endpoint}")
                    return data['data']
                else:
                    print(f"API返回错误: {data.get('msg')}")
            else:
                print(f"HTTP请求失败: {response.status_code}")
        except requests.exceptions.Timeout:
            print(f"API调用超时: {endpoint}")
        except requests.exceptions.ConnectionError:
            print(f"API连接错误: {endpoint}")
        except Exception as e:
            print(f"API调用异常 {endpoint}: {e}")
        return None

    def homeContent(self, filter):
        """首页分类"""
        print("获取首页分类")
        result = self._call_api('categories')
        return result or {'class': [], 'filters': {}}

    def categoryContent(self, cid, page, filter, ext):
        """分类内容"""
        print(f"获取分类内容: cid={cid}, page={page}, filter={filter}, ext={ext}")
        
        params = {'cid': cid, 'page': page}
        if ext:
            # 正确处理ext参数
            ext_params = {}
            for k, v in ext.items():
                if v:  # 只传递有值的参数
                    ext_params[k] = v
            if ext_params:
                params['ext'] = json.dumps(ext_params)
        
        result = self._call_api('category', params)
        return result or {'list': []}

    def detailContent(self, did):
        """视频详情"""
        p_id = did[0] if isinstance(did, list) else did
        print(f"获取视频详情: {p_id}")
        
        result = self._call_api('detail', {'did': p_id})
        return result or {'list': []}

    def playerContent(self, flag, pid, vipFlags):
        """播放地址"""
        print(f"获取播放地址: flag={flag}, pid={pid}")
        
        result = self._call_api('player', {'flag': flag, 'pid': pid})
        if result:
            return result
        
        # 返回错误视频地址
        return {
            'parse': 0,
            'url': 'https://sf1-cdn-tos.huoshanstatic.com/obj/media-fe/xgplayer_doc_video/mp4/xgplayer-demo-720p.mp4',
            'header': {},
            'jx': 0
        }

    def searchContent(self, key, quick, page=1):
        """搜索"""
        print(f"搜索内容: key={key}, page={page}")
        
        result = self._call_api('search', {'key': key, 'page': page})
        return result or {'list': []}

    def homeVideoContent(self):
        """首页推荐视频"""
        print("获取首页推荐视频")
        result = self._call_api('homeVideo')
        return result or {'list': []}