import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";

// POST /api/test-rtmp - Test RTMP connection
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { rtmpUrl, streamKey } = body;

    if (!rtmpUrl) {
      return NextResponse.json(
        { success: false, error: "RTMP URL is required" },
        { status: 400 }
      );
    }

    // Build full RTMP URL
    const fullRtmpUrl = streamKey ? `${rtmpUrl}/${streamKey}` : rtmpUrl;

    console.log(`Testing RTMP connection to: ${fullRtmpUrl.replace(streamKey || '', '***')}`);

    // Use ffmpeg to test RTMP connection with a short test
    // We'll try to connect and immediately disconnect
    const testResult = await new Promise<{ success: boolean; message: string }>((resolve) => {
      const timeout = 10000; // 10 seconds timeout
      
      const ffmpeg = spawn('ffmpeg', [
        '-f', 'lavfi',          // Use lavfi (libavfilter) as input
        '-i', 'anullsrc=r=44100:cl=stereo', // Generate silent audio
        '-f', 'lavfi',
        '-i', 'color=c=black:s=640x360:r=1', // Generate black video
        '-c:v', 'libx264',      // Encode video
        '-c:a', 'aac',          // Encode audio
        '-f', 'flv',            // Output format
        '-t', '1',              // Only 1 second
        '-flv_metadata', '1',
        fullRtmpUrl
      ]);

      let stderr = '';
      let hasConnected = false;

      ffmpeg.stderr.on('data', (data) => {
        const output = data.toString();
        stderr += output;
        
        // Check for successful connection indicators
        if (output.includes('Opening') || output.includes('tcp') || output.includes('Connected')) {
          hasConnected = true;
        }
      });

      const timer = setTimeout(() => {
        ffmpeg.kill('SIGTERM');
        if (hasConnected) {
          resolve({ success: true, message: 'RTMP服务器连接成功' });
        } else {
          resolve({ 
            success: false, 
            message: '连接超时，请检查服务器地址和网络连接' 
          });
        }
      }, timeout);

      ffmpeg.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0 || hasConnected) {
          resolve({ success: true, message: 'RTMP服务器连接成功' });
        } else if (stderr.includes('Connection refused') || stderr.includes('Network is unreachable')) {
          resolve({ 
            success: false, 
            message: '无法连接到服务器，请检查服务器地址是否正确' 
          });
        } else if (stderr.includes('Authentication') || stderr.includes('auth')) {
          resolve({ 
            success: false, 
            message: '认证失败，请检查推流密钥是否正确' 
          });
        } else {
          resolve({ 
            success: false, 
            message: `连接失败: ${stderr.slice(-200)}` 
          });
        }
      });

      ffmpeg.on('error', (err) => {
        clearTimeout(timer);
        resolve({ 
          success: false, 
          message: `FFmpeg错误: ${err.message}` 
        });
      });
    });

    return NextResponse.json({
      success: testResult.success,
      message: testResult.message,
      testedUrl: fullRtmpUrl.replace(streamKey || '', '***'),
    });

  } catch (error: unknown) {
    console.error("Error testing RTMP:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to test RTMP connection";
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
