import { createServer } from 'http'
import { Server, Socket } from 'socket.io'
import { spawn, ChildProcess } from 'child_process'

const httpServer = createServer()
const io = new Server(httpServer, {
  path: '/',
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  pingTimeout: 60000,
  pingInterval: 25000
})

// =====================================================
// Types
// =====================================================

interface VideoInfo {
  id: string
  youtubeUrl: string
  title: string
  duration?: number
  streamUrl?: string
  addedAt: Date
}

interface StreamConfig {
  rtmpUrl: string
  streamKey: string
  loopCount: number // Number of times to loop the entire queue
}

interface StreamState {
  status: 'idle' | 'streaming' | 'paused' | 'error'
  currentVideoIndex: number
  currentLoop: number
  queue: VideoInfo[]
  config: StreamConfig | null
  error: string | null
  startedAt: Date | null
  ffmpegLog: string[]
}

// =====================================================
// State Management
// =====================================================

const state: StreamState = {
  status: 'idle',
  currentVideoIndex: 0,
  currentLoop: 0,
  queue: [],
  config: null,
  error: null,
  startedAt: null,
  ffmpegLog: []
}

let ffmpegProcess: ChildProcess | null = null
const MAX_QUEUE_SIZE = 10
const DEFAULT_LOOP_COUNT = 10

// =====================================================
// Helper Functions
// =====================================================

const generateId = (): string => Math.random().toString(36).substr(2, 9)

const emitStatus = (socket?: Socket): void => {
  const statusData = {
    status: state.status,
    currentVideoIndex: state.currentVideoIndex,
    currentLoop: state.currentLoop,
    queueLength: state.queue.length,
    currentVideo: state.queue[state.currentVideoIndex] || null,
    startedAt: state.startedAt,
    error: state.error
  }
  
  if (socket) {
    socket.emit('stream:status', statusData)
  } else {
    io.emit('stream:status', statusData)
  }
}

const emitQueue = (socket?: Socket): void => {
  const queueData = {
    queue: state.queue,
    currentIndex: state.currentVideoIndex,
    currentLoop: state.currentLoop
  }
  
  if (socket) {
    socket.emit('stream:get-queue', queueData)
  } else {
    io.emit('stream:get-queue', queueData)
  }
}

const addLog = (message: string): void => {
  const timestamp = new Date().toISOString()
  const logEntry = `[${timestamp}] ${message}`
  state.ffmpegLog.push(logEntry)
  
  // Keep only last 100 logs
  if (state.ffmpegLog.length > 100) {
    state.ffmpegLog.shift()
  }
  
  console.log(logEntry)
  io.emit('stream:log', { timestamp, message })
}

// =====================================================
// YouTube URL Extraction (using yt-dlp)
// =====================================================

const extractStreamUrl = async (youtubeUrl: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    // 检查是否是直接视频URL（非YouTube）
    if (!youtubeUrl.includes('youtube.com') && !youtubeUrl.includes('youtu.be')) {
      addLog(`使用直接视频URL: ${youtubeUrl.substring(0, 50)}...`)
      resolve(youtubeUrl)
      return
    }
    
    // YouTube URL需要通过yt-dlp提取
    addLog(`Extracting stream URL from: ${youtubeUrl}`)
    
    const ytdlp = spawn('yt-dlp', [
      '-g', // Get URL only
      '-f', 'best[ext=mp4]/best', // Best quality MP4 format
      '--no-playlist', // Don't download playlists
      youtubeUrl
    ])
    
    let stdout = ''
    let stderr = ''
    
    ytdlp.stdout.on('data', (data) => {
      stdout += data.toString()
    })
    
    ytdlp.stderr.on('data', (data) => {
      stderr += data.toString()
    })
    
    ytdlp.on('close', (code) => {
      if (code === 0 && stdout.trim()) {
        // yt-dlp may return multiple URLs, take the first one
        const urls = stdout.trim().split('\n')
        const streamUrl = urls[0].trim()
        addLog(`Successfully extracted stream URL`)
        resolve(streamUrl)
      } else {
        const errorMsg = stderr || `yt-dlp exited with code ${code}`
        addLog(`Failed to extract URL: ${errorMsg}`)
        reject(new Error(`Failed to extract stream URL: ${errorMsg}`))
      }
    })
    
    ytdlp.on('error', (err) => {
      addLog(`yt-dlp error: ${err.message}`)
      reject(new Error(`yt-dlp failed: ${err.message}`))
    })
  })
}

const getVideoInfo = async (youtubeUrl: string): Promise<{ title: string; duration: number }> => {
  return new Promise((resolve, reject) => {
    const ytdlp = spawn('yt-dlp', [
      '--dump-json',
      '--no-playlist',
      youtubeUrl
    ])
    
    let stdout = ''
    let stderr = ''
    
    ytdlp.stdout.on('data', (data) => {
      stdout += data.toString()
    })
    
    ytdlp.stderr.on('data', (data) => {
      stderr += data.toString()
    })
    
    ytdlp.on('close', (code) => {
      if (code === 0 && stdout.trim()) {
        try {
          const info = JSON.parse(stdout)
          resolve({
            title: info.title || 'Unknown Title',
            duration: info.duration || 0
          })
        } catch {
          resolve({ title: 'Unknown Title', duration: 0 })
        }
      } else {
        resolve({ title: 'Unknown Title', duration: 0 })
      }
    })
    
    ytdlp.on('error', () => {
      resolve({ title: 'Unknown Title', duration: 0 })
    })
  })
}

// =====================================================
// FFmpeg Process Management
// =====================================================

const startFFmpeg = async (video: VideoInfo): Promise<void> => {
  return new Promise(async (resolve, reject) => {
    if (!state.config) {
      reject(new Error('No stream configuration set'))
      return
    }
    
    try {
      // Get stream URL if not already cached
      if (!video.streamUrl) {
        video.streamUrl = await extractStreamUrl(video.youtubeUrl)
      }
      
      const { rtmpUrl, streamKey } = state.config
      const fullRtmpUrl = streamKey ? `${rtmpUrl}/${streamKey}` : rtmpUrl
      
      addLog(`Starting FFmpeg for: ${video.title}`)
      addLog(`RTMP URL: ${fullRtmpUrl.replace(streamKey, '***')}`)
      
      ffmpegProcess = spawn('ffmpeg', [
        '-re', // Read input at native frame rate
        '-i', video.streamUrl,
        '-c:v', 'copy', // Copy video codec
        '-c:a', 'copy', // Copy audio codec
        '-f', 'flv', // Output format
        '-flv_metadata', '1', // Enable FLV metadata
        fullRtmpUrl
      ])
      
      ffmpegProcess.stdout?.on('data', (data) => {
        addLog(`FFmpeg stdout: ${data.toString().trim()}`)
      })
      
      ffmpegProcess.stderr?.on('data', (data) => {
        const message = data.toString().trim()
        // Only log important stderr messages (not frame updates)
        if (message && !message.includes('frame=') && !message.includes('fps=')) {
          addLog(`FFmpeg: ${message}`)
        }
      })
      
      ffmpegProcess.on('close', (code) => {
        addLog(`FFmpeg process closed with code: ${code}`)
        ffmpegProcess = null
        
        if (code === 0) {
          resolve()
        } else if (state.status === 'paused') {
          // Process was killed due to pause, don't proceed
          addLog('Stream paused, FFmpeg stopped')
          resolve()
        } else if (state.status === 'idle') {
          // Process was killed due to stop
          addLog('Stream stopped')
          resolve()
        } else {
          // Unexpected exit
          reject(new Error(`FFmpeg exited with code ${code}`))
        }
      })
      
      ffmpegProcess.on('error', (err) => {
        addLog(`FFmpeg error: ${err.message}`)
        ffmpegProcess = null
        reject(err)
      })
      
    } catch (err: any) {
      addLog(`Failed to start FFmpeg: ${err.message}`)
      reject(err)
    }
  })
}

const stopFFmpeg = (): void => {
  if (ffmpegProcess) {
    addLog('Stopping FFmpeg process...')
    ffmpegProcess.kill('SIGTERM')
    
    // Force kill after 5 seconds if still running
    setTimeout(() => {
      if (ffmpegProcess) {
        ffmpegProcess.kill('SIGKILL')
      }
    }, 5000)
  }
}

// =====================================================
// Stream Control Logic
// =====================================================

const streamNextVideo = async (): Promise<void> => {
  if (state.queue.length === 0) {
    addLog('Queue is empty, stopping stream')
    state.status = 'idle'
    state.currentVideoIndex = 0
    state.currentLoop = 0
    emitStatus()
    return
  }
  
  // 检查是否应该停止
  if (state.status === 'idle' || state.status === 'paused') {
    return
  }
  
  if (state.currentVideoIndex >= state.queue.length) {
    // Finished current loop
    state.currentLoop++
    state.currentVideoIndex = 0
    
    if (state.config && state.currentLoop >= state.config.loopCount) {
      addLog(`Completed ${state.config.loopCount} loops, stopping stream`)
      state.status = 'idle'
      emitStatus()
      return
    }
    
    addLog(`Starting loop ${state.currentLoop + 1} of ${state.config?.loopCount}`)
  }
  
  const currentVideo = state.queue[state.currentVideoIndex]
  
  if (!currentVideo) {
    addLog('No video at current index, skipping')
    state.currentVideoIndex++
    await streamNextVideo()
    return
  }
  
  addLog(`Now streaming: ${currentVideo.title}`)
  emitStatus()
  
  try {
    await startFFmpeg(currentVideo)
    
    // Video finished successfully, move to next
    if (state.status === 'streaming') {
      state.currentVideoIndex++
      io.emit('stream:video-complete', {
        video: currentVideo,
        nextIndex: state.currentVideoIndex
      })
      await streamNextVideo()
    }
  } catch (err: any) {
    addLog(`Error streaming video: ${err.message}`)
    state.error = err.message
    io.emit('stream:error', { error: err.message, video: currentVideo })
    
    // Skip to next video after error
    if (state.status === 'streaming') {
      addLog('Skipping to next video after error')
      state.currentVideoIndex++
      await streamNextVideo()
    }
  }
}

const startStream = async (config: StreamConfig): Promise<void> => {
  if (state.status !== 'idle') {
    throw new Error('Stream is already running')
  }
  
  if (state.queue.length === 0) {
    throw new Error('Queue is empty, add videos first')
  }
  
  state.config = {
    ...config,
    loopCount: config.loopCount || DEFAULT_LOOP_COUNT
  }
  state.currentVideoIndex = 0
  state.currentLoop = 0
  state.error = null
  state.startedAt = new Date()
  state.status = 'streaming'
  
  addLog(`Starting stream with ${state.queue.length} videos, ${state.config.loopCount} loops`)
  
  // 立即广播状态
  emitStatus()
  
  // 启动推流（不等待完成）
  streamNextVideo().catch(err => {
    addLog(`Stream error: ${err.message}`)
    state.status = 'error'
    state.error = err.message
    emitStatus()
  })
}

const stopStream = (): void => {
  addLog('Stopping stream...')
  stopFFmpeg()
  
  state.status = 'idle'
  state.currentVideoIndex = 0
  state.currentLoop = 0
  state.startedAt = null
  state.error = null
  
  emitStatus()
}

const pauseStream = (): void => {
  if (state.status !== 'streaming') {
    throw new Error('No active stream to pause')
  }
  
  addLog('Pausing stream...')
  state.status = 'paused'
  stopFFmpeg()
  
  emitStatus()
}

const resumeStream = async (): Promise<void> => {
  if (state.status !== 'paused') {
    throw new Error('Stream is not paused')
  }
  
  addLog('Resuming stream...')
  state.status = 'streaming'
  state.error = null
  
  emitStatus()
  
  await streamNextVideo()
}

// =====================================================
// Queue Management
// =====================================================

const addVideoToQueue = async (youtubeUrl: string): Promise<VideoInfo> => {
  if (state.queue.length >= MAX_QUEUE_SIZE) {
    throw new Error(`Queue is full (max ${MAX_QUEUE_SIZE} videos)`)
  }
  
  addLog(`Adding video to queue: ${youtubeUrl}`)
  
  // Get video info
  const info = await getVideoInfo(youtubeUrl)
  
  const video: VideoInfo = {
    id: generateId(),
    youtubeUrl,
    title: info.title,
    duration: info.duration,
    addedAt: new Date()
  }
  
  state.queue.push(video)
  addLog(`Added: ${video.title}`)
  
  emitQueue()
  
  return video
}

const removeVideoFromQueue = (videoId: string): void => {
  const index = state.queue.findIndex(v => v.id === videoId)
  
  if (index === -1) {
    throw new Error('Video not found in queue')
  }
  
  const removed = state.queue.splice(index, 1)[0]
  addLog(`Removed from queue: ${removed.title}`)
  
  // Adjust current index if needed
  if (index < state.currentVideoIndex) {
    state.currentVideoIndex--
  } else if (index === state.currentVideoIndex && state.status === 'streaming') {
    // Currently playing video was removed, restart with next
    stopFFmpeg()
    streamNextVideo()
  }
  
  emitQueue()
}

// =====================================================
// Socket.io Event Handlers
// =====================================================

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`)
  
  // Send current status to new client
  emitStatus(socket)
  emitQueue(socket)
  
  // Stream control events
  socket.on('stream:start', async (data: { 
    rtmpUrl: string; 
    streamKey: string; 
    loopCount?: number;
    videos?: Array<{ id: string; youtubeUrl: string; title: string }>;
  }) => {
    try {
      // 如果提供了视频列表，先清空队列并添加新视频
      if (data.videos && data.videos.length > 0) {
        state.queue = data.videos.map(v => ({
          id: v.id,
          youtubeUrl: v.youtubeUrl,
          title: v.title,
          addedAt: new Date()
        }))
        addLog(`收到视频队列: ${state.queue.length} 个视频`)
      }
      
      if (state.queue.length === 0) {
        throw new Error('视频队列为空')
      }
      
      await startStream({
        rtmpUrl: data.rtmpUrl,
        streamKey: data.streamKey,
        loopCount: data.loopCount || DEFAULT_LOOP_COUNT
      })
      socket.emit('stream:start:success', { message: 'Stream started successfully' })
    } catch (err: any) {
      addLog(`启动失败: ${err.message}`)
      socket.emit('stream:start:error', { error: err.message })
    }
  })
  
  socket.on('stream:stop', () => {
    try {
      stopStream()
      socket.emit('stream:stop:success', { message: 'Stream stopped' })
    } catch (err: any) {
      socket.emit('stream:stop:error', { error: err.message })
    }
  })
  
  socket.on('stream:pause', () => {
    try {
      pauseStream()
      socket.emit('stream:pause:success', { message: 'Stream paused' })
    } catch (err: any) {
      socket.emit('stream:pause:error', { error: err.message })
    }
  })
  
  socket.on('stream:resume', async () => {
    try {
      await resumeStream()
      socket.emit('stream:resume:success', { message: 'Stream resumed' })
    } catch (err: any) {
      socket.emit('stream:resume:error', { error: err.message })
    }
  })
  
  // 切换视频 - 跳转到指定视频
  socket.on('stream:switch', async (data: { 
    videoIndex: number
    videoId: string
    video: { id: string; youtubeUrl: string; title: string }
  }) => {
    try {
      if (state.status === 'idle') {
        throw new Error('推流未启动，请先开始推流')
      }
      
      if (state.status === 'paused') {
        throw new Error('推流已暂停，请先恢复推流')
      }
      
      const { videoIndex, video } = data
      
      // 检查索引是否有效
      if (videoIndex < 0 || videoIndex >= state.queue.length) {
        throw new Error('无效的视频索引')
      }
      
      addLog(`切换到视频: ${video.title}`)
      
      // 停止当前FFmpeg进程
      stopFFmpeg()
      
      // 更新当前视频索引
      state.currentVideoIndex = videoIndex
      state.error = null
      
      // 广播状态更新
      emitStatus()
      
      // 开始推流新视频
      if (state.status === 'streaming') {
        streamNextVideo().catch(err => {
          addLog(`切换视频失败: ${err.message}`)
          state.status = 'error'
          state.error = err.message
          emitStatus()
        })
      }
      
      socket.emit('stream:switch:success', { 
        message: `已切换到: ${video.title}`,
        videoIndex 
      })
      
    } catch (err: any) {
      addLog(`切换视频失败: ${err.message}`)
      socket.emit('stream:switch:error', { error: err.message })
    }
  })
  
  socket.on('stream:status', () => {
    emitStatus(socket)
  })
  
  // Queue management events
  socket.on('stream:add-video', async (data: { youtubeUrl: string }) => {
    try {
      const video = await addVideoToQueue(data.youtubeUrl)
      socket.emit('stream:add-video:success', { video })
    } catch (err: any) {
      socket.emit('stream:add-video:error', { error: err.message })
    }
  })
  
  socket.on('stream:remove-video', (data: { videoId: string }) => {
    try {
      removeVideoFromQueue(data.videoId)
      socket.emit('stream:remove-video:success', { videoId: data.videoId })
    } catch (err: any) {
      socket.emit('stream:remove-video:error', { error: err.message })
    }
  })
  
  socket.on('stream:get-queue', () => {
    emitQueue(socket)
  })
  
  // Clear queue
  socket.on('stream:clear-queue', () => {
    state.queue = []
    state.currentVideoIndex = 0
    addLog('Queue cleared')
    emitQueue()
    socket.emit('stream:clear-queue:success', { message: 'Queue cleared' })
  })
  
  // Get logs
  socket.on('stream:get-logs', () => {
    socket.emit('stream:logs', { logs: state.ffmpegLog })
  })
  
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`)
  })
  
  socket.on('error', (error) => {
    console.error(`Socket error (${socket.id}):`, error)
  })
})

// =====================================================
// Server Startup
// =====================================================

const PORT = 3030

httpServer.listen(PORT, () => {
  console.log(`Stream Service running on port ${PORT}`)
  console.log('Socket.io path: /')
  console.log(`Max queue size: ${MAX_QUEUE_SIZE}`)
  console.log(`Default loop count: ${DEFAULT_LOOP_COUNT}`)
})

// =====================================================
// Graceful Shutdown
// =====================================================

const gracefulShutdown = () => {
  console.log('\nShutting down stream service...')
  
  // Stop any active stream
  if (ffmpegProcess) {
    console.log('Stopping FFmpeg process...')
    ffmpegProcess.kill('SIGTERM')
  }
  
  // Close HTTP server
  httpServer.close(() => {
    console.log('HTTP server closed')
    process.exit(0)
  })
  
  // Force exit after 10 seconds
  setTimeout(() => {
    console.log('Forcing exit...')
    process.exit(1)
  }, 10000)
}

process.on('SIGTERM', gracefulShutdown)
process.on('SIGINT', gracefulShutdown)
