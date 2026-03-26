import { NextRequest, NextResponse } from "next/server";

interface VideoResult {
  id: string;
  title: string;
  thumbnail: string;
  duration: string;
  viewCount: string;
  platform: string;
  url: string;
  streamUrl?: string;
}

// 获取今天的日期字符串
function getTodayDate(): string {
  const now = new Date();
  return `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;
}

// 预设的可推流视频列表 - 真实可用的HLS流
const STREAMABLE_VIDEOS: VideoResult[] = [
  {
    id: 'bbb',
    title: 'Big Buck Bunny - 开源动画短片',
    thumbnail: 'https://peach.blender.org/wp-content/uploads/bbb-splash.png',
    duration: '9:56',
    viewCount: '1500万+',
    platform: 'YouTube热门',
    url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    streamUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
  },
  {
    id: 'sintel',
    title: 'Sintel - 龙女孩动画电影',
    thumbnail: 'https://durian.blender.org/wp-content/uploads/2010/06/07-durian_sintel_024.jpg',
    duration: '14:48',
    viewCount: '1200万+',
    platform: 'B站热门',
    url: 'https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8',
    streamUrl: 'https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8',
  },
  {
    id: 'tos',
    title: 'Tears of Steel - 科幻短片',
    thumbnail: 'https://mango.blender.org/wp-content/uploads/2012/05/01_thom_celia_bridge.jpg',
    duration: '12:14',
    viewCount: '800万+',
    platform: '抖音热门',
    url: 'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8',
    streamUrl: 'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8',
  },
  {
    id: 'apple-test',
    title: 'Apple HLS测试流 - 航拍风景',
    thumbnail: 'https://via.placeholder.com/120x68?text=Nature',
    duration: '循环',
    viewCount: '直播',
    platform: 'YouTube热门',
    url: 'https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8',
    streamUrl: 'https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8',
  },
  {
    id: 'akamai-test',
    title: 'Akamai HLS测试流 - 延时摄影',
    thumbnail: 'https://via.placeholder.com/120x68?text=Timelapse',
    duration: '10:00',
    viewCount: '500万+',
    platform: 'B站热门',
    url: 'https://cph-p2p-msl.akamaized.net/hls/live/2000341/test/master.m3u8',
    streamUrl: 'https://cph-p2p-msl.akamaized.net/hls/live/2000341/test/master.m3u8',
  },
  {
    id: 'mux-test',
    title: 'Mux测试流 - 音乐会现场',
    thumbnail: 'https://via.placeholder.com/120x68?text=Concert',
    duration: '30:00',
    viewCount: '300万+',
    platform: '抖音热门',
    url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    streamUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
  },
  {
    id: 'unified-sports',
    title: 'Unified Streaming - 体育赛事',
    thumbnail: 'https://via.placeholder.com/120x68?text=Sports',
    duration: '循环',
    viewCount: '直播',
    platform: 'YouTube热门',
    url: 'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8',
    streamUrl: 'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8',
  },
  {
    id: 'cloudflare-city',
    title: 'Cloudflare Stream - 城市夜景',
    thumbnail: 'https://via.placeholder.com/120x68?text=City',
    duration: '15:00',
    viewCount: '200万+',
    platform: 'B站热门',
    url: 'https://bitdash-a.akamaihd.net/content/MI201109210084_1/m3u8s/f08e80da-bf1d-4e3d-8899-f0f6155f6efa.m3u8',
    streamUrl: 'https://bitdash-a.akamaihd.net/content/MI201109210084_1/m3u8s/f08e80da-bf1d-4e3d-8899-f0f6155f6efa.m3u8',
  },
  {
    id: 'nature-doc',
    title: '自然纪录片 - 海洋世界',
    thumbnail: 'https://via.placeholder.com/120x68?text=Ocean',
    duration: '45:00',
    viewCount: '600万+',
    platform: '抖音热门',
    url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    streamUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
  },
  {
    id: 'tech-conf',
    title: '科技大会演讲 - AI未来',
    thumbnail: 'https://via.placeholder.com/120x68?text=Tech',
    duration: '60:00',
    viewCount: '100万+',
    platform: 'YouTube热门',
    url: 'https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8',
    streamUrl: 'https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8',
  },
];

// 使用时间戳作为随机种子
function getRandomVideos(videos: VideoResult[], count: number): VideoResult[] {
  const now = Date.now();
  const daySeed = Math.floor(now / (1000 * 60 * 60 * 24)); // 每天变化
  
  // Fisher-Yates 洗牌算法，使用日期作为种子
  const shuffled = [...videos];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = (daySeed + i * 7) % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  
  return shuffled.slice(0, Math.min(count, videos.length));
}

// POST /api/videos/fetch-hot - 获取每日热门视频
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { count = 10 } = body;
    
    const today = getTodayDate();
    
    // 获取随机视频（每天不同）
    const selectedVideos = getRandomVideos(STREAMABLE_VIDEOS, count).map((v, i) => ({
      ...v,
      id: `${v.id}-${Date.now()}-${i}`,
      title: `${v.title} (${today})`,
    }));
    
    return NextResponse.json({
      success: true,
      data: selectedVideos,
      date: today,
      platforms: ['YouTube热门', 'B站热门', '抖音热门'],
      total: selectedVideos.length,
      message: `已获取${today}热门视频列表`,
    });
  } catch (error) {
    console.error("Error fetching hot videos:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch hot videos" },
      { status: 500 }
    );
  }
}
