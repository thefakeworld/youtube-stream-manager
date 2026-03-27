import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { execSync } from "child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

interface VideoInfo {
  id: string;
  title: string;
  thumbnail: string;
  duration: number;
  streamUrl: string;
  originalUrl: string;
}

// Cookies file path
const COOKIES_DIR = join(process.cwd(), 'cookies');
const COOKIES_FILE = join(COOKIES_DIR, 'youtube_cookies.txt');

// Find yt-dlp executable
function findYtDlp(): string {
  const paths = [
    '/usr/local/bin/yt-dlp',  // Primary location (downloaded binary)
    '/home/z/.local/bin/yt-dlp',
    'yt-dlp',
    '/usr/bin/yt-dlp'
  ];
  
  for (const path of paths) {
    try {
      execSync(`${path} --version 2>/dev/null`);
      console.log('[VideoParser] Found yt-dlp at:', path);
      return path;
    } catch {
      continue;
    }
  }
  return 'yt-dlp'; // fallback
}

const YT_DLP = findYtDlp();

// Check if cookies file exists and is valid
function hasValidCookies(): boolean {
  if (!existsSync(COOKIES_FILE)) return false;
  
  try {
    const content = readFileSync(COOKIES_FILE, 'utf-8');
    // Check if it's a valid Netscape format cookies file
    const lines = content.split('\n').filter(line => 
      line.trim() && !line.startsWith('#')
    );
    return lines.length > 0;
  } catch {
    return false;
  }
}

// Extract video info from URL using yt-dlp
async function extractVideoInfo(url: string, useCookies: boolean = true): Promise<VideoInfo | null> {
  return new Promise((resolve) => {
    const args = [
      '--js-runtimes', 'node',  // Use Node.js for YouTube signature solving
      '--print', '%(id)s\n%(title)s\n%(thumbnail)s\n%(duration)s',
      '--get-url',
      '-f', 'best[ext=mp4][vcodec!=none]/best[vcodec!=none]/best',
      '--no-playlist',
      '--no-warnings',
      '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    ];

    // Add cookies if available and requested
    if (useCookies && hasValidCookies()) {
      args.push('--cookies', COOKIES_FILE);
      console.log('[VideoParser] Using cookies file:', COOKIES_FILE);
    }

    const ytdlp = spawn(YT_DLP, [...args, url]);

    let stdout = '';
    let stderr = '';

    ytdlp.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    ytdlp.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    // Set timeout
    const timeout = setTimeout(() => {
      ytdlp.kill();
      console.log('[VideoParser] Timeout, killed yt-dlp process');
      resolve(null);
    }, 60000); // 60 seconds timeout

    ytdlp.on('close', (code) => {
      clearTimeout(timeout);
      console.log('[VideoParser] yt-dlp exit code:', code);
      console.log('[VideoParser] stdout:', stdout.substring(0, 500));
      if (stderr) console.log('[VideoParser] stderr:', stderr.substring(0, 500));
      
      if (code === 0 && stdout.trim()) {
        const lines = stdout.trim().split('\n');
        if (lines.length >= 5) {
          const [id, title, thumbnail, durationStr, streamUrl] = lines;
          resolve({
            id,
            title: title || 'Unknown Title',
            thumbnail: thumbnail || 'https://via.placeholder.com/120x68?text=Video',
            duration: parseInt(durationStr) || 0,
            streamUrl: streamUrl,
            originalUrl: url
          });
        } else if (lines.length >= 1) {
          const streamUrl = lines[lines.length - 1];
          resolve({
            id: Date.now().toString(),
            title: '视频',
            thumbnail: 'https://via.placeholder.com/120x68?text=Video',
            duration: 0,
            streamUrl: streamUrl,
            originalUrl: url
          });
        } else {
          resolve(null);
        }
      } else {
        console.error('[VideoParser] yt-dlp error:', stderr);
        resolve(null);
      }
    });

    ytdlp.on('error', (err) => {
      clearTimeout(timeout);
      console.error('[VideoParser] Failed to run yt-dlp:', err.message);
      resolve(null);
    });
  });
}

// GET - Check cookies status
export async function GET() {
  const hasCookies = hasValidCookies();
  let cookiesInfo = null;
  
  if (hasCookies) {
    try {
      const content = readFileSync(COOKIES_FILE, 'utf-8');
      const lines = content.split('\n').filter(line => 
        line.trim() && !line.startsWith('#')
      );
      cookiesInfo = {
        exists: true,
        cookieCount: lines.length,
        file: COOKIES_FILE
      };
    } catch (e) {
      cookiesInfo = { exists: false };
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      hasCookies,
      cookiesInfo,
      ytDlpPath: YT_DLP
    }
  });
}

// POST - Extract video info from various platforms
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, useCookies = true } = body;

    if (!url) {
      return NextResponse.json(
        { success: false, error: "请提供视频URL" },
        { status: 400 }
      );
    }

    // Detect platform
    const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');
    const isVimeo = url.includes('vimeo.com');
    const isBilibili = url.includes('bilibili.com');
    const isTwitter = url.includes('twitter.com') || url.includes('x.com');
    const isDirectVideo = /\.(mp4|m3u8|webm|mov|avi)($|\?)/i.test(url);

    if (isDirectVideo) {
      // Direct video URL - return as-is
      return NextResponse.json({
        success: true,
        data: {
          id: Date.now().toString(),
          title: '直接视频',
          thumbnail: 'https://via.placeholder.com/120x68?text=Video',
          duration: 0,
          streamUrl: url,
          originalUrl: url
        }
      });
    }

    if (isYouTube) {
      // Check if we have cookies for YouTube
      if (!hasValidCookies()) {
        return NextResponse.json({
          success: false,
          error: "YouTube视频需要cookies才能解析。请先上传cookies.txt文件。",
          needCookies: true,
          instructions: [
            "1. 在本地浏览器登录YouTube账号",
            "2. 安装cookies导出扩展（如'Get cookies.txt LOCALLY'）",
            "3. 访问YouTube视频页面，点击扩展导出cookies.txt",
            "4. 在下方上传导出的cookies.txt文件",
            "5. 再次尝试解析视频"
          ]
        }, { status: 400 });
      }

      console.log('[VideoParser] Extracting YouTube video with cookies:', url);
      console.log('[VideoParser] Using yt-dlp at:', YT_DLP);
      
      const videoInfo = await extractVideoInfo(url, useCookies);
      
      if (!videoInfo) {
        return NextResponse.json(
          { 
            success: false, 
            error: "无法获取YouTube视频信息。可能cookies已过期，请重新导出并上传。",
            needCookies: true
          },
          { status: 400 }
        );
      }

      console.log('[VideoParser] Got YouTube video info:', videoInfo.title);

      return NextResponse.json({
        success: true,
        data: videoInfo
      });
    }

    console.log('[VideoParser] Extracting info for:', url);
    console.log('[VideoParser] Using yt-dlp at:', YT_DLP);
    
    const videoInfo = await extractVideoInfo(url, false);
    
    if (!videoInfo) {
      return NextResponse.json(
        { success: false, error: "无法获取视频信息，请检查URL是否正确或尝试其他平台" },
        { status: 400 }
      );
    }

    console.log('[VideoParser] Got video info:', videoInfo.title);

    return NextResponse.json({
      success: true,
      data: videoInfo
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error('[VideoParser] Error:', errorMessage);
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}

// PUT - Upload cookies file
export async function PUT(request: NextRequest) {
  try {
    const formData = await request.formData();
    const cookiesFile = formData.get('cookies') as File | null;

    if (!cookiesFile) {
      return NextResponse.json(
        { success: false, error: "请上传cookies文件" },
        { status: 400 }
      );
    }

    const content = await cookiesFile.text();
    
    // Validate cookies format (Netscape format)
    const lines = content.split('\n').filter(line => 
      line.trim() && !line.startsWith('#')
    );
    
    if (lines.length === 0) {
      return NextResponse.json(
        { success: false, error: "cookies文件格式无效，请确保是Netscape格式" },
        { status: 400 }
      );
    }

    // Check for YouTube cookies
    const hasYouTubeCookies = content.includes('youtube.com') || content.includes('.youtube');
    
    // Ensure cookies directory exists
    if (!existsSync(COOKIES_DIR)) {
      mkdirSync(COOKIES_DIR, { recursive: true });
      console.log('[Cookies] Created directory:', COOKIES_DIR);
    }
    
    // Save cookies file
    writeFileSync(COOKIES_FILE, content, 'utf-8');
    console.log('[Cookies] Saved cookies file:', COOKIES_FILE);
    console.log('[Cookies] Cookie count:', lines.length);
    console.log('[Cookies] Has YouTube cookies:', hasYouTubeCookies);

    return NextResponse.json({
      success: true,
      message: "Cookies上传成功",
      data: {
        cookieCount: lines.length,
        hasYouTubeCookies,
        file: COOKIES_FILE
      }
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error('[Cookies] Error:', errorMessage);
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}

// DELETE - Remove cookies file
export async function DELETE() {
  try {
    if (existsSync(COOKIES_FILE)) {
      const { unlinkSync } = await import('fs');
      unlinkSync(COOKIES_FILE);
      console.log('[Cookies] Deleted cookies file');
    }
    
    return NextResponse.json({
      success: true,
      message: "Cookies已删除"
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
