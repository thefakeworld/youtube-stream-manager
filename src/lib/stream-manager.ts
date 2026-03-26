import { spawn, execSync } from 'child_process';
import { writeFileSync, readFileSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';

// Stream process info
export interface StreamProcess {
  pid: number;
  videoTitle: string;
  videoUrl: string;
  rtmpUrl: string;
  startedAt: string;
  status: 'running' | 'stopping' | 'stopped';
}

// Stream state management
interface StreamState {
  status: 'idle' | 'streaming' | 'paused' | 'error';
  currentVideoIndex: number;
  currentLoop: number;
  queue: VideoInfo[];
  rtmpUrl: string;
  loopCount: number;
  error: string | null;
  startedAt: string | null;
  currentPid: number | null;
  sessionId: string | null;  // 用于检测热更新
}

interface VideoInfo {
  id: string;
  url: string;
  title: string;
}

// State file path
const STATE_FILE = join(process.cwd(), '.stream-state.json');

// 当前会话ID - 每次模块加载时生成新的
const CURRENT_SESSION_ID = Date.now().toString(36) + Math.random().toString(36).substr(2, 9);

// Default state
const defaultState: StreamState = {
  status: 'idle',
  currentVideoIndex: 0,
  currentLoop: 0,
  queue: [],
  rtmpUrl: '',
  loopCount: 10,
  error: null,
  startedAt: null,
  currentPid: null,
  sessionId: null,
};

// In-memory state (synced with file)
let streamState: StreamState = { ...defaultState };

// 单例控制 - 防止多次启动
let isStarting = false;
let isSwitching = false;

// Load state from file
function loadState(): void {
  try {
    if (existsSync(STATE_FILE)) {
      const data = readFileSync(STATE_FILE, 'utf-8');
      const saved = JSON.parse(data) as StreamState;
      streamState = { ...defaultState, ...saved };
      console.log('[StreamManager] Loaded state:', streamState.status, 'PID:', streamState.currentPid);
    }
  } catch (err) {
    console.error('[StreamManager] Failed to load state:', err);
  }
}

// Save state to file
function saveState(): void {
  try {
    writeFileSync(STATE_FILE, JSON.stringify(streamState, null, 2));
  } catch (err) {
    console.error('[StreamManager] Failed to save state:', err);
  }
}

// 初始化：恢复状态或清理孤儿进程
function initCleanup(): void {
  console.log('[StreamManager] ====== INITIALIZING ======');
  console.log('[StreamManager] Session ID:', CURRENT_SESSION_ID);
  
  // 先读取状态文件
  let savedState: StreamState | null = null;
  try {
    if (existsSync(STATE_FILE)) {
      const data = readFileSync(STATE_FILE, 'utf-8');
      savedState = JSON.parse(data) as StreamState;
      console.log('[StreamManager] Found state file:', savedState.status, 'PID:', savedState.currentPid, 'Session:', savedState.sessionId);
    }
  } catch (err) {
    console.error('[StreamManager] Error reading state file:', err);
  }
  
  // 检查是否有运行的 FFmpeg 进程
  const runningPids: string[] = [];
  try {
    const pids = execSync('pgrep -f "ffmpeg.*flv" 2>/dev/null || echo ""').toString().trim();
    if (pids) {
      runningPids.push(...pids.split('\n').filter(p => p.trim()));
    }
  } catch (err) {
    console.error('[StreamManager] Error checking processes:', err);
  }
  
  if (runningPids.length > 0) {
    console.log(`[StreamManager] Found ${runningPids.length} running FFmpeg processes`);
    
    // 如果有保存的状态且状态为 streaming，尝试恢复
    if (savedState && savedState.status === 'streaming') {
      console.log('[StreamManager] Restoring previous streaming state');
      streamState = { ...defaultState, ...savedState };
      
      // 检查保存的 PID 是否还在运行
      if (savedState.currentPid && runningPids.includes(savedState.currentPid.toString())) {
        console.log('[StreamManager] Current PID still running:', savedState.currentPid);
      } else {
        // PID 不匹配，使用第一个运行的进程
        console.log('[StreamManager] PID mismatch, using running process:', runningPids[0]);
        streamState.currentPid = parseInt(runningPids[0]);
      }
    } else {
      // 没有保存状态但有进程运行，创建新状态
      console.log('[StreamManager] No saved state but processes running, adopting first process');
      streamState = {
        ...defaultState,
        status: 'streaming',
        currentPid: parseInt(runningPids[0]),
        startedAt: new Date().toISOString(),
        sessionId: CURRENT_SESSION_ID,
        queue: [{ id: 'unknown', url: 'unknown', title: `FFmpeg进程 ${runningPids[0]}` }],
      };
      saveState();
    }
  } else {
    // 没有运行中的进程，重置状态
    console.log('[StreamManager] No running processes, resetting state');
    streamState = { ...defaultState };
    
    // 删除旧的状态文件
    try {
      if (existsSync(STATE_FILE)) {
        unlinkSync(STATE_FILE);
        console.log('[StreamManager] Deleted stale state file');
      }
    } catch (err) {
      console.error('[StreamManager] Error deleting state file:', err);
    }
  }
  
  console.log('[StreamManager] Final state:', streamState.status, 'PID:', streamState.currentPid);
  console.log('[StreamManager] ====== INIT COMPLETE ======');
}

// Initialize on module load
initCleanup();

// Get all active FFmpeg processes from system
export function getActiveProcesses(): StreamProcess[] {
  const processes: StreamProcess[] = [];
  
  try {
    const result = execSync('ps aux | grep -E "ffmpeg.*flv" | grep -v grep').toString().trim();
    
    if (result) {
      const lines = result.split('\n');
      
      for (const line of lines) {
        const match = line.match(/^(\S+)\s+(\d+)/);
        if (match) {
          const pid = parseInt(match[2]);
          
          // 尝试从命令行提取视频URL
          let videoUrl = 'unknown';
          let rtmpUrl = 'unknown';
          
          const urlMatch = line.match(/-i\s+(\S+)/);
          if (urlMatch) videoUrl = urlMatch[1];
          
          const rtmpMatch = line.match(/(rtmp:\/\/\S+)/);
          if (rtmpMatch) rtmpUrl = rtmpMatch[1];
          
          // 检查是否是当前进程
          let videoTitle = `FFmpeg进程 ${pid}`;
          if (streamState.currentPid === pid && streamState.queue[streamState.currentVideoIndex]) {
            videoTitle = streamState.queue[streamState.currentVideoIndex].title;
          }
          
          // 获取进程启动时间
          let startedAt = new Date().toISOString();
          try {
            const startTime = execSync(`ps -p ${pid} -o lstart= 2>/dev/null || echo ""`).toString().trim();
            if (startTime) {
              startedAt = new Date(startTime).toISOString();
            }
          } catch { /* ignore */ }
          
          processes.push({
            pid,
            videoTitle,
            videoUrl: videoUrl.substring(0, 50) + '...',
            rtmpUrl: rtmpUrl.substring(0, 30) + '...',
            startedAt,
            status: 'running'
          });
        }
      }
    }
  } catch {
    // pgrep returns non-zero when no match found
  }
  
  return processes;
}

// Kill specific process by PID
export function killProcess(pid: number): { success: boolean; error?: string } {
  try {
    // 检查进程是否存在
    process.kill(pid, 0);
    
    // 杀掉进程
    process.kill(pid, 'SIGTERM');
    console.log(`[StreamManager] Killed process ${pid}`);
    
    // 如果是当前进程，重置状态
    if (streamState.currentPid === pid) {
      streamState.currentPid = null;
      streamState.status = 'idle';
      saveState();
    }
    
    return { success: true };
  } catch {
    // 进程不存在或已停止
    if (streamState.currentPid === pid) {
      streamState.currentPid = null;
      streamState.status = 'idle';
      saveState();
    }
    return { success: false, error: '进程不存在或已停止' };
  }
}

// Kill all FFmpeg processes (only kill processes, don't reset state)
function killAllFfmpegProcesses(): void {
  try {
    execSync('pkill -9 -f "ffmpeg.*flv" 2>/dev/null || true');
    console.log('[StreamManager] Killed all FFmpeg processes');
  } catch (err) {
    console.error('[StreamManager] Error killing processes:', err);
  }
  
  // 只清除PID，不重置其他状态（由调用者决定）
  streamState.currentPid = null;
}

// Kill all FFmpeg processes and reset state completely
function killAllFfmpegProcessesAndReset(): void {
  killAllFfmpegProcesses();
  
  streamState = {
    status: 'idle',
    currentVideoIndex: 0,
    currentLoop: 0,
    queue: [],
    rtmpUrl: '',
    loopCount: 10,
    error: null,
    startedAt: null,
    currentPid: null,
    sessionId: null,
  };
  saveState();
}

// Check current state and sync with reality
export function getStreamState(): StreamState {
  // 检查当前进程是否还在运行
  if (streamState.currentPid) {
    try {
      process.kill(streamState.currentPid, 0);
    } catch {
      // 进程已死
      console.log('[StreamManager] Current process is dead');
      streamState.currentPid = null;
      streamState.status = 'idle';
      saveState();
    }
  }
  
  return { ...streamState };
}

// Start streaming
export async function startStream(
  rtmpUrl: string, 
  videos: VideoInfo[], 
  loopCount: number = 10,
  startIndex: number = 0
): Promise<{ success: boolean; error?: string }> {
  // 防止重复启动
  if (isStarting) {
    return { success: false, error: '正在启动中，请稍候' };
  }
  
  // 检查是否已有进程在运行
  const activeProcesses = getActiveProcesses();
  if (activeProcesses.length > 0) {
    return { success: false, error: `已有 ${activeProcesses.length} 个推流进程在运行，请先停止` };
  }
  
  if (streamState.status === 'streaming' && streamState.currentPid) {
    return { success: false, error: '已有推流正在进行' };
  }

  if (!rtmpUrl) {
    return { success: false, error: '请填写RTMP推流地址' };
  }

  if (videos.length === 0) {
    return { success: false, error: '视频队列为空' };
  }

  // 确保 startIndex 在有效范围内
  const validStartIndex = Math.max(0, Math.min(startIndex, videos.length - 1));

  isStarting = true;
  console.log('[StreamManager] Starting stream...');
  console.log('[StreamManager] Session ID:', CURRENT_SESSION_ID);
  console.log('[StreamManager] Start from video index:', validStartIndex);

  streamState = {
    status: 'streaming',
    currentVideoIndex: validStartIndex,
    currentLoop: 0,
    queue: videos,
    rtmpUrl,
    loopCount,
    error: null,
    startedAt: new Date().toISOString(),
    currentPid: null,
    sessionId: CURRENT_SESSION_ID,
  };
  saveState();

  try {
    const success = await startNextVideo();
    isStarting = false;
    
    if (success) {
      return { success: true };
    } else {
      streamState.status = 'idle';
      saveState();
      return { success: false, error: '启动推流失败' };
    }
  } catch (err) {
    isStarting = false;
    streamState.status = 'idle';
    saveState();
    return { success: false, error: `启动失败: ${err}` };
  }
}

// Stop streaming
export function stopStream(): { success: boolean } {
  console.log('[StreamManager] Stopping stream...');
  
  // First, set status to idle and clear queue to prevent close callback from starting next video
  streamState.status = 'idle';
  streamState.queue = [];
  saveState();
  
  // Now kill all FFmpeg processes
  killAllFfmpegProcesses();

  // Reset all state
  streamState = {
    status: 'idle',
    currentVideoIndex: 0,
    currentLoop: 0,
    queue: [],
    rtmpUrl: '',
    loopCount: 10,
    error: null,
    startedAt: null,
    currentPid: null,
  };
  saveState();

  // 删除状态文件
  try {
    if (existsSync(STATE_FILE)) {
      unlinkSync(STATE_FILE);
    }
  } catch { /* ignore */ }

  return { success: true };
}

// Switch to specific video (seamless - will auto-stop running processes)
export async function switchVideo(videoIndex: number): Promise<{ success: boolean; error?: string }> {
  if (isSwitching) {
    return { success: false, error: '正在切换中，请稍候' };
  }

  isSwitching = true;
  console.log(`[StreamManager] Switching to video index ${videoIndex}`);

  // 检查是否有活动的FFmpeg进程
  const activeProcesses = getActiveProcesses();
  if (activeProcesses.length > 0) {
    console.log(`[StreamManager] Found ${activeProcesses.length} running processes, stopping them...`);
    killAllFfmpegProcesses();
    // 等待进程完全结束
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // 检查队列是否有该视频
  if (!streamState.queue[videoIndex]) {
    isSwitching = false;
    return { success: false, error: '无效的视频索引' };
  }

  const video = streamState.queue[videoIndex];
  console.log(`[StreamManager] Switching to: ${video?.title}`);

  // 更新状态
  streamState.currentVideoIndex = videoIndex;
  streamState.currentPid = null;
  streamState.error = null;
  streamState.status = 'streaming';
  streamState.startedAt = new Date().toISOString();
  streamState.sessionId = CURRENT_SESSION_ID;
  saveState();

  try {
    const success = await startVideo(video);
    isSwitching = false;
    
    if (success) {
      return { success: true };
    } else {
      streamState.status = 'idle';
      saveState();
      return { success: false, error: '切换失败' };
    }
  } catch (err) {
    isSwitching = false;
    streamState.status = 'idle';
    saveState();
    return { success: false, error: `切换失败: ${err}` };
  }
}

// Force switch video - accepts external video info (from database)
export async function forceSwitchVideo(
  videoIndex: number,
  videos: VideoInfo[],
  rtmpUrl: string,
  loopCount: number = 10
): Promise<{ success: boolean; error?: string }> {
  if (isSwitching || isStarting) {
    return { success: false, error: '正在操作中，请稍候' };
  }

  if (!rtmpUrl) {
    return { success: false, error: '请配置RTMP推流地址' };
  }

  if (!videos || videos.length === 0) {
    return { success: false, error: '视频队列为空' };
  }

  if (videoIndex < 0 || videoIndex >= videos.length) {
    return { success: false, error: `无效的视频索引: ${videoIndex}, 队列长度: ${videos.length}` };
  }

  // 验证目标视频URL
  const targetVideo = videos[videoIndex];
  if (!targetVideo.url) {
    return { success: false, error: `视频URL为空: ${targetVideo.title}` };
  }

  isSwitching = true;
  console.log(`[StreamManager] ========== FORCE SWITCH START ==========`);
  console.log(`[StreamManager] Target video index: ${videoIndex}`);
  console.log(`[StreamManager] Target video title: ${targetVideo.title}`);
  console.log(`[StreamManager] Target video URL: ${targetVideo.url?.substring(0, 80)}...`);
  console.log(`[StreamManager] RTMP URL: ${rtmpUrl?.substring(0, 50)}...`);
  console.log(`[StreamManager] Total videos in queue: ${videos.length}`);
  videos.forEach((v, i) => {
    const marker = i === videoIndex ? '>>>' : '   ';
    console.log(`  ${marker} [${i}] ${v.title} - URL: ${v.url?.substring(0, 50)}...`);
  });

  // 停止所有FFmpeg进程
  const activeProcesses = getActiveProcesses();
  if (activeProcesses.length > 0) {
    console.log(`[StreamManager] Stopping ${activeProcesses.length} running processes...`);
    killAllFfmpegProcesses();
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // 更新状态
  streamState = {
    status: 'streaming',
    currentVideoIndex: videoIndex,
    currentLoop: 0,
    queue: videos,
    rtmpUrl,
    loopCount,
    error: null,
    startedAt: new Date().toISOString(),
    currentPid: null,
    sessionId: CURRENT_SESSION_ID,
  };
  saveState();

  try {
    const video = videos[videoIndex];
    const success = await startVideo(video);
    isSwitching = false;
    
    if (success) {
      return { success: true };
    } else {
      streamState.status = 'idle';
      saveState();
      return { success: false, error: '启动推流失败' };
    }
  } catch (err) {
    isSwitching = false;
    streamState.status = 'idle';
    saveState();
    return { success: false, error: `启动失败: ${err}` };
  }
}

// Start a specific video
async function startVideo(video: VideoInfo): Promise<boolean> {
  const videoUrl = video.url;
  console.log(`[StreamManager] startVideo called for: ${video.title}`);
  console.log(`[StreamManager] video.url: ${videoUrl?.substring(0, 80)}...`);
  console.log(`[StreamManager] streamState.rtmpUrl: ${streamState.rtmpUrl?.substring(0, 50)}...`);
  
  const isYouTube = videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be');

  if (isYouTube) {
    return new Promise((resolve) => {
      const ytdlp = spawn('yt-dlp', [
        '--get-url',
        '-f', 'best[ext=mp4][vcodec!=none]/best[vcodec!=none]/best',
        '--no-playlist',
        '--no-warnings',
        '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        videoUrl
      ]);

      let streamUrl = '';
      let stderr = '';

      ytdlp.stdout.on('data', (data) => {
        streamUrl += data.toString();
      });

      ytdlp.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      ytdlp.on('close', (code) => {
        if (code === 0 && streamUrl.trim()) {
          const urls = streamUrl.trim().split('\n').filter(u => u.trim());
          const finalUrl = urls[0].trim();
          console.log(`[StreamManager] yt-dlp got URL for: ${video.title}`);
          
          const success = runFFmpeg(video, finalUrl, streamState.rtmpUrl);
          resolve(success);
        } else {
          console.error(`[StreamManager] yt-dlp failed: ${stderr}`);
          resolve(false);
        }
      });

      ytdlp.on('error', (err) => {
        console.error(`[StreamManager] yt-dlp error: ${err.message}`);
        resolve(false);
      });
    });
  } else {
    console.log(`[StreamManager] Using direct URL for: ${video.title}`);
    return runFFmpeg(video, videoUrl, streamState.rtmpUrl);
  }
}

// Run FFmpeg process
function runFFmpeg(video: VideoInfo, videoUrl: string, rtmpUrl: string): boolean {
  try {
    const ffmpeg = spawn('ffmpeg', [
      '-re',
      '-i', videoUrl,
      '-c:v', 'copy',
      '-c:a', 'copy',
      '-f', 'flv',
      '-flv_metadata', '1',
      rtmpUrl
    ]);

    const pid = ffmpeg.pid;
    if (!pid) {
      console.error('[StreamManager] Failed to get FFmpeg PID');
      return false;
    }

    // 保存当前进程PID
    streamState.currentPid = pid;
    saveState();
    console.log(`[StreamManager] Started FFmpeg PID ${pid} for: ${video.title}`);

    ffmpeg.stderr.on('data', (data) => {
      const msg = data.toString();
      if (!msg.includes('frame=') && !msg.includes('fps=')) {
        console.log(`[FFmpeg:${pid}] ${msg.trim()}`);
      }
    });

    // 捕获当前的会话ID和队列ID，用于检测状态变化
    const callbackSessionId = CURRENT_SESSION_ID;
    const callbackQueueId = streamState.queue.length > 0 ? streamState.queue[0].id : '';
    const callbackVideoIndex = streamState.currentVideoIndex;

    ffmpeg.on('close', (code) => {
      console.log(`[StreamManager] FFmpeg PID ${pid} closed with code: ${code}`);
      console.log(`[StreamManager] Callback session: ${callbackSessionId}, Current session: ${CURRENT_SESSION_ID}`);
      console.log(`[StreamManager] Callback PID: ${pid}, Current PID: ${streamState.currentPid}`);
      
      // 检查会话ID是否匹配（防止热更新后旧回调继续执行）
      if (callbackSessionId !== CURRENT_SESSION_ID) {
        console.log('[StreamManager] Session mismatch, ignoring callback (hot reload detected)');
        return;
      }
      
      // 检查是否队列已经改变
      if (streamState.queue.length > 0 && streamState.queue[0].id !== callbackQueueId) {
        console.log('[StreamManager] Queue changed, ignoring callback from old queue');
        return;
      }
      
      // 只有当这是当前进程时才处理
      if (streamState.currentPid === pid) {
        streamState.currentPid = null;
        
        // 如果还在推流状态，继续下一个视频
        if (streamState.status === 'streaming' && !isSwitching) {
          streamState.currentVideoIndex++;
          saveState();
          
          // 检查是否需要循环
          if (streamState.currentVideoIndex >= streamState.queue.length) {
            streamState.currentLoop++;
            streamState.currentVideoIndex = 0;
            
            if (streamState.currentLoop >= streamState.loopCount) {
              console.log(`[StreamManager] Completed ${streamState.loopCount} loops`);
              streamState.status = 'idle';
              saveState();
              return;
            }
            
            console.log(`[StreamManager] Starting loop ${streamState.currentLoop + 1}`);
            saveState();
          }
          
          console.log(`[StreamManager] Auto-playing next video at index ${streamState.currentVideoIndex}`);
          // 启动下一个视频
          startNextVideo();
        }
      } else {
        console.log(`[StreamManager] PID mismatch, this close event is from old process ${pid}`);
      }
    });

    ffmpeg.on('error', (err) => {
      console.error(`[StreamManager] FFmpeg error: ${err.message}`);
      if (streamState.currentPid === pid) {
        streamState.currentPid = null;
      }
    });

    return true;
  } catch (err) {
    console.error('[StreamManager] Failed to start FFmpeg:', err);
    return false;
  }
}

// Start next video in queue
async function startNextVideo(): Promise<boolean> {
  if (streamState.status !== 'streaming') {
    return false;
  }

  const video = streamState.queue[streamState.currentVideoIndex];
  if (!video) {
    console.error('[StreamManager] No video at index', streamState.currentVideoIndex);
    return false;
  }

  console.log(`[StreamManager] Starting video: ${video.title}`);
  return startVideo(video);
}

// Update queue
export function updateQueue(newQueue: VideoInfo[]): { success: boolean } {
  streamState.queue = newQueue;
  
  if (streamState.currentVideoIndex >= newQueue.length) {
    streamState.currentVideoIndex = 0;
  }
  
  saveState();
  return { success: true };
}

// Test RTMP connection
export async function testRtmpConnection(rtmpUrl: string): Promise<{ success: boolean; message: string }> {
  return new Promise((resolve) => {
    const ffmpeg = spawn('ffmpeg', [
      '-f', 'lavfi',
      '-i', 'anullsrc=r=44100:cl=stereo',
      '-f', 'lavfi',
      '-i', 'color=c=black:s=640x360:r=1',
      '-c:v', 'libx264',
      '-c:a', 'aac',
      '-f', 'flv',
      '-t', '1',
      '-flv_metadata', '1',
      rtmpUrl
    ]);

    let hasConnected = false;

    ffmpeg.stderr.on('data', (data) => {
      const output = data.toString();
      if (output.includes('Opening') || output.includes('tcp') || output.includes('Connected')) {
        hasConnected = true;
      }
    });

    const timeout = setTimeout(() => {
      ffmpeg.kill('SIGTERM');
      resolve(hasConnected 
        ? { success: true, message: 'RTMP服务器连接成功' }
        : { success: false, message: '连接超时，请检查服务器地址' }
      );
    }, 10000);

    ffmpeg.on('close', (code) => {
      clearTimeout(timeout);
      resolve(code === 0 || hasConnected
        ? { success: true, message: 'RTMP服务器连接成功' }
        : { success: false, message: '连接失败，请检查服务器地址' }
      );
    });

    ffmpeg.on('error', () => {
      clearTimeout(timeout);
      resolve({ success: false, message: 'FFmpeg启动失败' });
    });
  });
}
