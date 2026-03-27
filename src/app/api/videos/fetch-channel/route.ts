import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

interface ChannelVideo {
  id: string;
  title: string;
  thumbnail: string;
  duration: number;
  url: string;
}

// Cookies file path
const COOKIES_DIR = join(process.cwd(), 'cookies');
const COOKIES_FILE = join(COOKIES_DIR, 'youtube_cookies.txt');

// Check if cookies file exists
function hasValidCookies(): boolean {
  if (!existsSync(COOKIES_FILE)) return false;
  try {
    const content = readFileSync(COOKIES_FILE, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim() && !line.startsWith('#'));
    return lines.length > 0;
  } catch {
    return false;
  }
}

// Get YouTube channel videos using yt-dlp
async function getChannelVideos(channelUrl: string, maxVideos: number = 30): Promise<ChannelVideo[]> {
  return new Promise((resolve) => {
    const args = [
      '--js-runtimes', 'node',
      '--flat-playlist',
      '--print', '%(id)s\n%(title)s\n%(duration)s',
      '--playlist-end', String(maxVideos),
      '--no-warnings',
    ];

    if (hasValidCookies()) {
      args.push('--cookies', COOKIES_FILE);
    }

    const ytdlp = spawn('/usr/local/bin/yt-dlp', [...args, channelUrl]);

    let stdout = '';
    let stderr = '';

    ytdlp.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    ytdlp.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    // Set timeout (2 minutes for channel)
    const timeout = setTimeout(() => {
      ytdlp.kill();
      console.log('[ChannelParser] Timeout');
      resolve([]);
    }, 120000);

    ytdlp.on('close', (code) => {
      clearTimeout(timeout);
      console.log('[ChannelParser] Exit code:', code);
      
      if (code === 0 && stdout.trim()) {
        const lines = stdout.trim().split('\n');
        const videos: ChannelVideo[] = [];
        
        // Parse 3 lines per video: id, title, duration (flat playlist doesn't return thumbnail)
        for (let i = 0; i < lines.length; i += 3) {
          if (i + 2 < lines.length) {
            const id = lines[i]?.trim();
            const title = lines[i + 1]?.trim();
            const durationStr = lines[i + 2]?.trim();
            
            if (id && title) {
              // Build thumbnail URL from video ID
              const thumbnail = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
              videos.push({
                id,
                title: title || 'Unknown Title',
                thumbnail,
                duration: parseInt(durationStr) || 0,
                url: `https://www.youtube.com/watch?v=${id}`,
              });
            }
          }
        }
        
        console.log('[ChannelParser] Found', videos.length, 'videos');
        resolve(videos);
      } else {
        console.error('[ChannelParser] Error:', stderr);
        resolve([]);
      }
    });

    ytdlp.on('error', (err) => {
      clearTimeout(timeout);
      console.error('[ChannelParser] Failed:', err.message);
      resolve([]);
    });
  });
}

// GET - Check status
export async function GET() {
  return NextResponse.json({
    success: true,
    hasCookies: hasValidCookies(),
  });
}

// POST - Fetch channel videos
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, maxVideos = 30 } = body;

    if (!url) {
      return NextResponse.json(
        { success: false, error: "请提供频道URL" },
        { status: 400 }
      );
    }

    // Validate YouTube channel URL
    const isYouTubeChannel = url.includes('youtube.com/@') || 
                             url.includes('youtube.com/channel/') ||
                             url.includes('youtube.com/c/') ||
                             url.includes('youtube.com/user/');

    if (!isYouTubeChannel) {
      return NextResponse.json(
        { success: false, error: "请提供有效的YouTube频道URL" },
        { status: 400 }
      );
    }

    console.log('[ChannelParser] Fetching videos from:', url);

    if (!hasValidCookies()) {
      return NextResponse.json({
        success: false,
        error: "需要cookies才能获取频道视频",
        needCookies: true,
      }, { status: 400 });
    }

    const videos = await getChannelVideos(url, maxVideos);

    if (videos.length === 0) {
      return NextResponse.json(
        { success: false, error: "未获取到视频，请检查URL或cookies是否有效" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: videos,
      total: videos.length,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error('[ChannelParser] Error:', errorMessage);
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
