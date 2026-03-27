'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Separator } from '@/components/ui/separator'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Play,
  Square,
  Plus,
  Search,
  Youtube,
  Radio,
  Clock,
  Video,
  AlertCircle,
  CheckCircle2,
  Settings,
  RefreshCw,
  Trash2,
  GripVertical,
  Info,
  AlertTriangle,
  Monitor,
  Wifi,
  WifiOff,
  X,
  Activity,
  StopCircle,
  Pause,
  Cookie,
  Upload,
  FileText
} from 'lucide-react'

// Types
type StreamStatus = 'streaming' | 'idle' | 'error' | 'paused'
type VideoStatus = 'pending' | 'streaming' | 'done' | 'error'
type LogType = 'info' | 'warning' | 'error' | 'success'
type Platform = 'bilibili' | 'douyin' | 'huya' | 'other'

interface VideoItem {
  id: string
  title: string
  thumbnailUrl: string | null
  duration: number | null
  status: VideoStatus
  priority: number
  youtubeId: string
  streamUrl?: string | null
}

interface StreamProcess {
  pid: number
  videoTitle: string
  videoUrl: string
  rtmpUrl: string
  startedAt: string
  status: 'running' | 'stopping' | 'stopped'
  runningTime: number
}

interface CurrentStream {
  status: StreamStatus
  currentVideoIndex: number
  currentVideo: {
    id: string
    title: string
    url: string
  } | null
  startedAt: string | null
  queueLength: number
  loop: {
    current: number
    total: number
  }
}

interface LogEntry {
  id: string
  timestamp: Date
  type: LogType
  message: string
}

interface StreamConfig {
  rtmpUrl: string
  streamKey: string
  platform: Platform
  loopCount: number
}

interface FetchedVideo {
  id: string
  title: string
  thumbnail?: string
  duration?: string
  streamUrl?: string
  url?: string
}

const platforms = [
  { value: 'bilibili', label: 'B站' },
  { value: 'douyin', label: '抖音' },
  { value: 'huya', label: '虎牙' },
  { value: 'other', label: '其他' },
]

// Clean title - remove date patterns like "(2026年3月25日)"
function cleanTitle(title: string): string {
  return title
    .replace(/\s*\(\d{4}年\d{1,2}月\d{1,2}日?\)\s*/g, '')
    .replace(/\s*\d{4}[-\/]\d{1,2}[-\/]\d{1,2}\s*/g, '')
    .trim()
}

// Format duration helper
function formatDuration(seconds: number | null): string {
  if (!seconds) return '--:--'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }
  return `${m}:${s.toString().padStart(2, '0')}`
}

// Sortable Video Item Component
function SortableVideoItem({ 
  video, 
  index, 
  isPlaying,
  runningTime,
  onPlay,
  onPause,
  onRemove,
  disabled 
}: { 
  video: VideoItem
  index: number
  isPlaying: boolean
  runningTime: number
  onPlay: () => void
  onPause: () => void
  onRemove: () => void
  disabled: boolean
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: video.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  // Calculate progress percentage
  const progress = video.duration ? Math.min((runningTime / video.duration) * 100, 100) : 0
  const displayTitle = cleanTitle(video.title)

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'p-3 rounded-lg border transition-all',
        isPlaying && 'bg-green-50 dark:bg-green-950 border-green-500 dark:border-green-600 ring-2 ring-green-500/30 shadow-md',
        !isPlaying && video.status === 'done' && 'opacity-50',
        !isPlaying && video.status === 'pending' && 'hover:border-gray-300'
      )}
    >
      {/* First row: thumbnail, title, duration */}
      <div className="flex items-start gap-2 sm:gap-3">
        {/* Drag Handle + Index */}
        <div className="flex items-center gap-1 sm:gap-2 text-muted-foreground shrink-0 pt-0.5">
          <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
            <GripVertical className="w-4 h-4 hidden sm:block hover:text-foreground" />
          </div>
          <span className={cn(
            "text-sm font-medium w-5 sm:w-6 text-center",
            isPlaying && "text-green-600 font-bold"
          )}>{index + 1}</span>
        </div>

        {/* Thumbnail */}
        <div className="relative shrink-0">
          <img 
            src={video.thumbnailUrl || 'https://via.placeholder.com/120x68?text=Video'} 
            alt={displayTitle} 
            className={cn(
              "w-20 h-12 sm:w-24 sm:h-14 object-cover rounded",
              isPlaying && "ring-2 ring-green-500"
            )} 
          />
          {isPlaying && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded">
              <Radio className="w-5 h-5 text-white animate-pulse" />
            </div>
          )}
        </div>

        {/* Info - Title and Duration */}
        <div className="flex-1 min-w-0">
          <h4 className={cn(
            "font-medium text-sm line-clamp-2",
            isPlaying && "text-green-700 dark:text-green-400 font-semibold"
          )}>{displayTitle}</h4>
          <span className="text-xs text-muted-foreground mt-0.5 block">
            {formatDuration(video.duration)}
          </span>
        </div>
      </div>

      {/* Second row: progress bar (when playing) and action buttons */}
      <div className="mt-2 flex items-center gap-2 pl-8 sm:pl-10">
        {/* Mini Player Progress - only show when playing */}
        {isPlaying && video.duration ? (
          <div className="flex-1 min-w-0">
            <div className="relative h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div 
                className="absolute inset-y-0 left-0 bg-green-500 rounded-full transition-all duration-1000"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
              <span className="font-mono text-green-600">{formatDuration(runningTime)}</span>
              <span className="font-mono">{formatDuration(video.duration)}</span>
            </div>
          </div>
        ) : (
          <div className="flex-1" />
        )}
        
        {/* Action Buttons - always visible */}
        <div className="flex items-center gap-1 shrink-0">
          {isPlaying ? (
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3 border-orange-300 text-orange-600 hover:bg-orange-50 hover:text-orange-700"
              onClick={onPause}
              title="暂停推流"
            >
              <Pause className="w-4 h-4 mr-1" />
              暂停
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3 text-green-600 border-green-300 hover:bg-green-50 hover:text-green-700"
              onClick={onPlay}
              disabled={disabled}
              title="播放此视频"
            >
              <Play className="w-4 h-4 mr-1" />
              播放
            </Button>
          )}
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50" 
            onClick={onRemove} 
            disabled={isPlaying} 
            title="删除"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function YouTubeStreamDashboard() {
  // State
  const [currentTime, setCurrentTime] = useState<Date | null>(null)
  const [mounted, setMounted] = useState(false)
  const [streamStatus, setStreamStatus] = useState<StreamStatus>('idle')
  const [videos, setVideos] = useState<VideoItem[]>([])
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [config, setConfig] = useState<StreamConfig>({
    rtmpUrl: '',
    streamKey: '',
    platform: 'douyin',
    loopCount: 10,
  })
  const [configSaved, setConfigSaved] = useState(false)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [logFilter, setLogFilter] = useState<LogType | 'all'>('all')
  const [testingRtmp, setTestingRtmp] = useState(false)
  const [rtmpTestResult, setRtmpTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [serviceConnected, setServiceConnected] = useState(true)
  const [processes, setProcesses] = useState<StreamProcess[]>([])
  const [currentStream, setCurrentStream] = useState<CurrentStream | null>(null)
  const [fetchedVideos, setFetchedVideos] = useState<FetchedVideo[]>([])
  const [selectedVideos, setSelectedVideos] = useState<Set<string>>(new Set())
  const [isSelectDialogOpen, setIsSelectDialogOpen] = useState(false)
  const [isFetching, setIsFetching] = useState(false)
  const [isParsingYouTube, setIsParsingYouTube] = useState(false)
  const [currentPlayingId, setCurrentPlayingId] = useState<string | null>(null)
  const [streamRunningTime, setStreamRunningTime] = useState(0)
  const [cookiesInfo, setCookiesInfo] = useState<{hasCookies: boolean; cookieCount?: number} | null>(null)
  const [isUploadingCookies, setIsUploadingCookies] = useState(false)
  const [showCookiesHelp, setShowCookiesHelp] = useState(false)

  const logContainerRef = useRef<HTMLDivElement>(null)
  const statusIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Add log entry
  const addLog = useCallback((type: LogType, message: string) => {
    const newLog: LogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      type,
      message,
    }
    setLogs((prev) => [...prev.slice(-99), newLog])
  }, [])

  // Load videos from database
  const loadVideos = useCallback(async () => {
    try {
      const response = await fetch('/api/videos')
      const result = await response.json()
      if (result.success && result.data) {
        setVideos(result.data.map((v: VideoItem) => ({
          ...v,
          status: v.status as VideoStatus
        })))
      }
    } catch {
      addLog('error', '加载视频列表失败')
    }
  }, [addLog])

  // Load cookies status
  const loadCookiesStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/videos/youtube')
      const result = await response.json()
      if (result.success) {
        setCookiesInfo({
          hasCookies: result.data.hasCookies,
          cookieCount: result.data.cookiesInfo?.cookieCount
        })
      }
    } catch {
      // Silent fail
    }
  }, [])

  // Load saved config on mount
  useEffect(() => {
    const loadSavedConfig = async () => {
      try {
        const response = await fetch('/api/stream-configs')
        const result = await response.json()
        if (result.success && result.data && result.data.length > 0) {
          const savedConfig = result.data[0]
          setConfig({
            rtmpUrl: savedConfig.rtmpUrl || '',
            streamKey: savedConfig.streamKey || '',
            platform: savedConfig.platform as Platform,
            loopCount: savedConfig.loopCount || 10,
          })
          setConfigSaved(true)
        }
      } catch {
        // Silent fail
      }
    }
    loadSavedConfig()
    loadVideos()
    loadCookiesStatus()
  }, [loadVideos, loadCookiesStatus])

  // Poll stream status and processes
  useEffect(() => {
    const pollStatus = async () => {
      try {
        // Get active processes and current stream info
        const processesResponse = await fetch('/api/stream/processes')
        const processesResult = await processesResponse.json()
        
        if (processesResult.success) {
          setProcesses(processesResult.processes)
          setCurrentStream(processesResult.currentStream)
          setStreamStatus(processesResult.currentStream?.status || 'idle')
          
          // 更新当前播放视频ID
          if (processesResult.currentStream?.currentVideo) {
            setCurrentPlayingId(processesResult.currentStream.currentVideo.id)
            setStreamRunningTime(processesResult.processes[0]?.runningTime || 0)
          } else {
            setCurrentPlayingId(null)
            setStreamRunningTime(0)
          }
        }

        setServiceConnected(true)
      } catch {
        setServiceConnected(false)
      }
    }

    pollStatus()
    statusIntervalRef.current = setInterval(pollStatus, 2000)

    return () => {
      if (statusIntervalRef.current) {
        clearInterval(statusIntervalRef.current)
      }
    }
  }, [])

  // Time update
  useEffect(() => {
    setMounted(true)
    setCurrentTime(new Date())
    const timer = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  // Auto-scroll logs
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [logs])

  // Format time
  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    }
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  // Save config
  const handleSaveConfig = async () => {
    if (!config.rtmpUrl) {
      addLog('error', '请先填写RTMP服务器地址')
      return
    }

    try {
      const response = await fetch('/api/stream-configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${config.platform} 推流配置`,
          rtmpUrl: config.rtmpUrl,
          streamKey: config.streamKey,
          platform: config.platform,
          loopCount: config.loopCount,
        }),
      })
      const result = await response.json()
      if (response.ok && result.success) {
        addLog('success', '配置已保存')
        setConfigSaved(true)
      } else {
        addLog('error', `保存失败: ${result.error || '未知错误'}`)
      }
    } catch {
      addLog('error', '保存配置失败')
    }
  }

  // Test RTMP connection
  const handleTestRtmp = async () => {
    if (!config.rtmpUrl) {
      addLog('error', '请先填写RTMP服务器地址')
      return
    }

    setTestingRtmp(true)
    setRtmpTestResult(null)
    addLog('info', '正在测试RTMP连接...')

    try {
      const finalRtmpUrl = config.streamKey ? `${config.rtmpUrl}/${config.streamKey}` : config.rtmpUrl
      const response = await fetch('/api/test-rtmp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rtmpUrl: finalRtmpUrl }),
      })
      const result = await response.json()
      setRtmpTestResult({ success: result.success, message: result.message })
      addLog(result.success ? 'success' : 'error', result.message)
    } catch {
      const errorMsg = '测试RTMP连接失败'
      setRtmpTestResult({ success: false, message: errorMsg })
      addLog('error', errorMsg)
    } finally {
      setTestingRtmp(false)
    }
  }

  // Play video (always use force-switch for seamless transition)
  const handlePlayVideo = async (videoIndex: number) => {
    // 先从数据库重新加载视频列表，确保数据是最新的
    try {
      const freshResponse = await fetch('/api/videos')
      const freshResult = await freshResponse.json()
      if (freshResult.success && freshResult.data) {
        const freshVideos = freshResult.data.map((v: VideoItem) => ({
          ...v,
          status: v.status as VideoStatus
        }))
        setVideos(freshVideos)
        
        // 使用最新加载的视频
        const video = freshVideos[videoIndex]
        if (!video) {
          addLog('error', '视频索引无效')
          return
        }

        // 获取正确的视频URL
        const videoUrl = video.streamUrl || video.youtubeId
        if (!videoUrl) {
          addLog('error', '视频URL无效')
          return
        }

        const finalRtmpUrl = config.streamKey ? `${config.rtmpUrl}/${config.streamKey}` : config.rtmpUrl

        if (!finalRtmpUrl) {
          addLog('error', '请先配置RTMP推流地址')
          return
        }

        console.log('[PlayVideo] Playing video:', video.title, 'URL:', videoUrl?.substring(0, 60))

        // 使用 force-switch API，自动处理停止和启动
        const actionText = streamStatus === 'streaming' ? '切换到' : '推流'
        addLog('info', `正在${actionText}: ${video.title}...`)
        
        const response = await fetch('/api/stream/force-switch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            videoIndex,
            videos: freshVideos.map((v: VideoItem) => ({
              id: v.id,
              url: v.streamUrl || v.youtubeId,
              title: v.title,
            })),
            rtmpUrl: finalRtmpUrl,
            loopCount: config.loopCount,
          }),
        })
        const result = await response.json()
        if (result.success) {
          setStreamStatus('streaming')
          setCurrentPlayingId(video.id)
          addLog('success', `已${actionText}: ${video.title}`)
        } else {
          addLog('error', `${actionText}失败: ${result.error}`)
          setStreamStatus('error')
        }
      } else {
        addLog('error', '加载视频列表失败')
      }
    } catch {
      addLog('error', '播放失败')
      setStreamStatus('error')
    }
  }

  // Stop stream
  const handleStopStream = async () => {
    try {
      const response = await fetch('/api/stream/stop', { method: 'POST' })
      const result = await response.json()
      if (result.success) {
        setStreamStatus('idle')
        setProcesses([])
        setCurrentPlayingId(null)
        setCurrentStream(null)
        addLog('info', '推流已停止')
      }
    } catch {
      addLog('error', '停止推流失败')
    }
  }

  // Kill specific process
  const handleKillProcess = async (pid: number) => {
    try {
      const response = await fetch('/api/stream/process/kill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pid }),
      })
      const result = await response.json()
      if (result.success) {
        addLog('info', `已停止进程 ${pid}`)
        setCurrentPlayingId(null)
      } else {
        addLog('error', `停止进程失败: ${result.error}`)
      }
    } catch {
      addLog('error', '停止进程失败')
    }
  }

  // Video management
  const handleRemoveVideo = async (id: string) => {
    try {
      await fetch(`/api/videos?id=${id}`, { method: 'DELETE' })
      setVideos((prev) => prev.filter((v) => v.id !== id))
      addLog('info', '已移除视频')
    } catch {
      addLog('error', '移除视频失败')
    }
  }

  // Drag and drop handler
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const oldIndex = videos.findIndex((v) => v.id === active.id)
      const newIndex = videos.findIndex((v) => v.id === over.id)
      
      const newVideos = arrayMove(videos, oldIndex, newIndex)
        .map((v, i) => ({ ...v, priority: i + 1 }))
      
      setVideos(newVideos)

      // Update priorities in database
      try {
        await fetch('/api/videos', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ videos: newVideos.map(v => ({ id: v.id, priority: v.priority })) })
        })
      } catch {
        addLog('error', '更新顺序失败')
      }
    }
  }

  const handleAddVideo = async (video: { url: string; title: string; thumbnail?: string; duration?: string }) => {
    try {
      const response = await fetch('/api/videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          youtubeId: video.url,
          title: video.title,
          thumbnailUrl: video.thumbnail,
          duration: video.duration ? parseInt(video.duration) : null,
          streamUrl: video.url
        })
      })
      const result = await response.json()
      if (result.success) {
        loadVideos()
        addLog('success', `已添加视频: ${video.title}`)
        setIsSearchOpen(false)
      } else {
        addLog('error', result.error || '添加视频失败')
      }
    } catch {
      addLog('error', '添加视频失败')
    }
  }

  // Parse and add video from URL (Vimeo, Bilibili, direct URLs)
  const handleAddYouTubeVideo = async (url: string) => {
    setIsParsingYouTube(true)
    addLog('info', '正在解析视频...')

    try {
      const response = await fetch('/api/videos/youtube', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const result = await response.json()

      if (result.success && result.data) {
        const video = result.data
        // Add to database
        const addResponse = await fetch('/api/videos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            youtubeId: video.id,
            title: video.title,
            thumbnailUrl: video.thumbnail,
            duration: video.duration,
            streamUrl: video.streamUrl
          })
        })
        const addResult = await addResponse.json()
        
        if (addResult.success) {
          loadVideos()
          addLog('success', `已添加视频: ${video.title}`)
          setIsSearchOpen(false)
          setSearchQuery('')
        } else {
          addLog('error', addResult.error || '添加视频失败')
        }
      } else {
        // Show detailed error message
        const errorMsg = result.error || '解析视频失败'
        addLog('error', errorMsg)
        
        // Need cookies for YouTube
        if (result.needCookies) {
          setShowCookiesHelp(true)
        }
        
        // Show alternatives if available
        if (result.alternatives) {
          const altMsg = result.alternatives.map((a: { platform: string; example: string }) => `${a.platform}: ${a.example}`).join('\n')
          addLog('info', `支持的格式: ${altMsg.replace(/\n/g, ', ')}`)
        }
      }
    } catch {
      addLog('error', '解析视频失败，请检查网络连接')
    } finally {
      setIsParsingYouTube(false)
    }
  }

  // Upload cookies file
  const handleUploadCookies = async (file: File) => {
    setIsUploadingCookies(true)
    addLog('info', '正在上传cookies文件...')

    try {
      const formData = new FormData()
      formData.append('cookies', file)
      
      const response = await fetch('/api/videos/youtube', {
        method: 'PUT',
        body: formData
      })
      const result = await response.json()
      
      if (result.success) {
        addLog('success', `Cookies上传成功，共${result.data.cookieCount}条`)
        loadCookiesStatus()
        setShowCookiesHelp(false)
      } else {
        addLog('error', result.error || '上传失败')
      }
    } catch {
      addLog('error', '上传cookies失败')
    } finally {
      setIsUploadingCookies(false)
    }
  }

  // Delete cookies
  const handleDeleteCookies = async () => {
    try {
      const response = await fetch('/api/videos/youtube', { method: 'DELETE' })
      const result = await response.json()
      if (result.success) {
        addLog('info', 'Cookies已删除')
        setCookiesInfo({ hasCookies: false })
      }
    } catch {
      addLog('error', '删除cookies失败')
    }
  }

  const handleAutoFetch = async () => {
    setIsFetching(true)
    addLog('info', '正在获取测试视频...')

    try {
      const response = await fetch('/api/videos/fetch-hot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platforms: ['youtube', 'bilibili', 'douyin'], count: 10 }),
      })
      const result = await response.json()

      if (result.success && result.data && result.data.length > 0) {
        setFetchedVideos(result.data)
        setSelectedVideos(new Set())
        setIsSelectDialogOpen(true)
        addLog('info', `获取到 ${result.data.length} 个视频，请选择要添加的`)
      } else {
        const mockVideos: FetchedVideo[] = [
          { id: 'm1', title: 'Big Buck Bunny (测试视频)', thumbnail: 'https://peach.blender.org/wp-content/uploads/bbb-splash.png', duration: '9:56', streamUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8' },
          { id: 'm2', title: 'Sintel (测试视频)', thumbnail: 'https://durian.blender.org/wp-content/uploads/2010/06/07-durian_sintel_024.jpg', duration: '14:48', streamUrl: 'https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8' },
          { id: 'm3', title: 'Tears of Steel (测试视频)', thumbnail: 'https://mango.blender.org/wp-content/uploads/2012/05/01_thom_celia_bridge.jpg', duration: '12:14', streamUrl: 'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8' },
        ]
        setFetchedVideos(mockVideos)
        setSelectedVideos(new Set())
        setIsSelectDialogOpen(true)
        addLog('info', '使用测试视频，请选择要添加的')
      }
    } catch {
      addLog('error', '获取视频失败')
    } finally {
      setIsFetching(false)
    }
  }

  const handleSelectVideo = (id: string, checked: boolean) => {
    setSelectedVideos(prev => {
      const next = new Set(prev)
      if (checked) {
        next.add(id)
      } else {
        next.delete(id)
      }
      return next
    })
  }

  const handleSelectAll = () => {
    if (selectedVideos.size === fetchedVideos.length) {
      setSelectedVideos(new Set())
    } else {
      setSelectedVideos(new Set(fetchedVideos.map(v => v.id)))
    }
  }

  const handleAddSelectedVideos = async () => {
    const videosToAdd = fetchedVideos.filter(v => selectedVideos.has(v.id))
    if (videosToAdd.length === 0) {
      addLog('warning', '请先选择要添加的视频')
      return
    }

    try {
      const response = await fetch('/api/videos/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videos: videosToAdd.map(v => ({
            youtubeId: v.streamUrl || v.url || v.id,
            title: v.title,
            thumbnailUrl: v.thumbnail,
            streamUrl: v.streamUrl || v.url
          }))
        })
      })
      const result = await response.json()
      if (result.success) {
        addLog('success', `已添加 ${result.added} 个视频`)
        if (result.skipped > 0) {
          addLog('warning', `${result.skipped} 个视频已存在，已跳过`)
        }
        loadVideos()
        setIsSelectDialogOpen(false)
        setSelectedVideos(new Set())
      } else {
        addLog('error', result.error || '添加失败')
      }
    } catch {
      addLog('error', '添加视频失败')
    }
  }

  const handleClearVideos = async () => {
    try {
      await fetch('/api/videos/clear', { method: 'POST' })
      setVideos([])
      addLog('info', '视频队列已清空')
    } catch {
      addLog('error', '清空视频队列失败')
    }
  }

  // Get log icon
  const getLogIcon = (type: LogType) => {
    const icons = {
      info: <Info className="w-4 h-4 text-blue-500" />,
      warning: <AlertTriangle className="w-4 h-4 text-yellow-500" />,
      error: <AlertCircle className="w-4 h-4 text-red-500" />,
      success: <CheckCircle2 className="w-4 h-4 text-green-500" />,
    }
    return icons[type]
  }

  // Filter logs
  const filteredLogs = logFilter === 'all' ? logs : logs.filter((log) => log.type === logFilter)

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Youtube className="w-8 h-8 text-red-500" />
              <h1 className="text-xl font-bold">YouTube自动推流管理系统</h1>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                {serviceConnected ? <Wifi className="w-4 h-4 text-green-500" /> : <WifiOff className="w-4 h-4 text-red-500" />}
                <span className="text-sm text-muted-foreground">{serviceConnected ? '服务就绪' : '服务离线'}</span>
              </div>
              <Separator orientation="vertical" className="h-6" />
              <div className="flex items-center gap-2">
                {streamStatus === 'streaming' && (
                  <Badge className="bg-green-600 text-white">
                    <Radio className="w-3 h-3 mr-1 animate-pulse" />
                    推流中
                  </Badge>
                )}
                {streamStatus === 'idle' && (
                  <Badge variant="secondary">
                    <Square className="w-3 h-3 mr-1" />
                    空闲
                  </Badge>
                )}
                {streamStatus === 'error' && (
                  <Badge variant="destructive">
                    <AlertCircle className="w-3 h-3 mr-1" />
                    错误
                  </Badge>
                )}
              </div>
              {streamStatus === 'streaming' && currentStream?.currentVideo && (
                <>
                  <Separator orientation="vertical" className="h-6" />
                  <div className="text-sm">
                    <span className="text-muted-foreground">播放中: </span>
                    <span className="font-medium truncate max-w-[150px] inline-block align-bottom">
                      {currentStream.currentVideo.title}
                    </span>
                    <span className="text-muted-foreground ml-2">({formatTime(streamRunningTime)})</span>
                  </div>
                </>
              )}
              <Separator orientation="vertical" className="h-6" />
              <div className="text-sm font-mono" suppressHydrationWarning>
                {mounted && currentTime ? currentTime.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--/-- --:--:--'}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-4 py-6">
        {/* Process List */}
        {processes.length > 0 && (
          <Card className="mb-6 border-orange-200 bg-orange-50/50 dark:border-orange-800 dark:bg-orange-950/20">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base text-orange-700 dark:text-orange-400">
                <Activity className="w-4 h-4" />
                活动进程 ({processes.length})
              </CardTitle>
              <CardDescription>以下FFmpeg进程正在运行</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {processes.map((proc) => (
                  <div key={proc.pid} className="flex items-center justify-between p-2 bg-white dark:bg-gray-900 rounded border">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="font-mono">PID: {proc.pid}</Badge>
                      <span className="font-medium text-sm truncate max-w-[200px]">{proc.videoTitle}</span>
                      <span className="text-xs text-muted-foreground">运行: {formatTime(proc.runningTime)}</span>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleKillProcess(proc.pid)}
                    >
                      <StopCircle className="w-4 h-4 mr-1" />
                      停止
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Stream Configuration */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Settings className="w-5 h-5" />推流配置</CardTitle>
                <CardDescription>配置RTMP推流参数</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>RTMP 服务器地址 *</Label>
                    <Input placeholder="rtmp://push.example.com/live" value={config.rtmpUrl} onChange={(e) => setConfig((prev) => ({ ...prev, rtmpUrl: e.target.value }))} />
                    <p className="text-xs text-muted-foreground">如: rtmp://a.rtmp.youtube.com/live2</p>
                  </div>
                  <div className="space-y-2">
                    <Label>推流密钥 *</Label>
                    <Input placeholder="xxx-xxx-xxx-xxx" value={config.streamKey} onChange={(e) => setConfig((prev) => ({ ...prev, streamKey: e.target.value }))} />
                    <p className="text-xs text-muted-foreground">YouTube/B站推流密钥</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>目标平台</Label>
                    <Select value={config.platform} onValueChange={(value: Platform) => setConfig((prev) => ({ ...prev, platform: value }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{platforms.map((p) => (<SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>循环次数: {config.loopCount}</Label>
                    <Slider value={[config.loopCount]} min={1} max={100} step={1} onValueChange={(value) => setConfig((prev) => ({ ...prev, loopCount: value[0] }))} />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button variant="outline" onClick={handleSaveConfig}><Settings className="w-4 h-4 mr-2" />保存配置</Button>
                  <Button variant="outline" onClick={handleTestRtmp} disabled={testingRtmp || !config.rtmpUrl}>
                    {testingRtmp ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Radio className="w-4 h-4 mr-2" />}测试连接
                  </Button>
                  {configSaved && <Badge variant="outline" className="bg-green-50 text-green-600 border-green-200">已保存</Badge>}
                  {rtmpTestResult && <Badge variant="outline" className={rtmpTestResult.success ? "bg-green-50 text-green-600 border-green-200" : "bg-red-50 text-red-600 border-red-200"}>{rtmpTestResult.success ? '连接正常' : '连接失败'}</Badge>}
                </div>
                <Separator />
                <div className="flex flex-wrap gap-2 pt-2">
                  {streamStatus === 'streaming' && (
                    <Button onClick={handleStopStream} variant="destructive">
                      <Square className="w-4 h-4 mr-2" />停止推流
                    </Button>
                  )}
                  {streamStatus === 'error' && (
                    <Button onClick={() => videos.length > 0 && handlePlayVideo(0)} className="bg-green-600 hover:bg-green-700">
                      <RefreshCw className="w-4 h-4 mr-2" />重试
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Video Queue */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2"><Video className="w-5 h-5" />视频队列</CardTitle>
                    <CardDescription>
                      拖拽排序，点击播放按钮推流指定视频
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={handleAutoFetch} disabled={isFetching}>
                      {isFetching ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}获取视频
                    </Button>
                    <Dialog open={isSearchOpen} onOpenChange={setIsSearchOpen}>
                      <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 mr-2" />添加视频</Button></DialogTrigger>
                      <DialogContent className="max-w-3xl max-h-[80vh]">
                        <DialogHeader>
                          <DialogTitle className="flex items-center gap-2"><Video className="w-5 h-5" />添加视频</DialogTitle>
                          <DialogDescription>支持Vimeo、Bilibili或直接视频URL</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                          {/* Video URL */}
                          <div className="space-y-2 p-4 border rounded-lg bg-muted/50">
                            <Label className="text-sm font-medium">视频URL</Label>
                            <div className="flex gap-2">
                              <Input 
                                placeholder="https://vimeo.com/76979871 或直接视频.mp4/.m3u8" 
                                value={searchQuery} 
                                onChange={(e) => setSearchQuery(e.target.value)} 
                                className="flex-1" 
                              />
                              <Button 
                                onClick={() => {
                                  if (searchQuery.trim()) {
                                    handleAddYouTubeVideo(searchQuery.trim())
                                  }
                                }}
                                disabled={isParsingYouTube}
                              >
                                {isParsingYouTube ? (
                                  <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />解析中...</>
                                ) : (
                                  <><Plus className="w-4 h-4 mr-2" />添加</>
                                )}
                              </Button>
                            </div>
                            <div className="flex flex-wrap gap-2 mt-2">
                              <Badge variant="outline" className="text-xs">Vimeo ✓</Badge>
                              <Badge variant="outline" className="text-xs">.mp4 ✓</Badge>
                              <Badge variant="outline" className="text-xs">.m3u8 ✓</Badge>
                              <Badge variant="outline" className={cn("text-xs", cookiesInfo?.hasCookies ? "text-green-600" : "text-muted-foreground")}>
                                YouTube {cookiesInfo?.hasCookies ? '✓' : '(需cookies)'}
                              </Badge>
                            </div>
                          </div>

                          {/* Cookies Upload Section */}
                          <div className="space-y-2 p-4 border rounded-lg bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
                            <div className="flex items-center justify-between">
                              <Label className="text-sm font-medium flex items-center gap-2">
                                <Cookie className="w-4 h-4" />
                                YouTube Cookies
                              </Label>
                              {cookiesInfo?.hasCookies && (
                                <Badge variant="outline" className="text-xs bg-green-50 text-green-600 border-green-200">
                                  已配置 ({cookiesInfo.cookieCount}条)
                                </Badge>
                              )}
                            </div>
                            
                            {!cookiesInfo?.hasCookies ? (
                              <div className="text-xs text-muted-foreground space-y-2">
                                <p>YouTube视频需要cookies才能解析。请按以下步骤操作：</p>
                                <ol className="list-decimal list-inside space-y-1 ml-2">
                                  <li>在本地浏览器登录YouTube账号</li>
                                  <li>安装cookies导出扩展（如"Get cookies.txt LOCALLY"）</li>
                                  <li>访问YouTube视频页面，点击扩展导出cookies.txt</li>
                                  <li>在下方上传导出的cookies.txt文件</li>
                                </ol>
                                <div className="mt-2">
                                  <input
                                    type="file"
                                    accept=".txt"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0]
                                      if (file) {
                                        handleUploadCookies(file)
                                        e.target.value = ''
                                      }
                                    }}
                                    className="hidden"
                                    id="cookies-upload"
                                  />
                                  <Button 
                                    variant="outline" 
                                    size="sm" 
                                    onClick={() => document.getElementById('cookies-upload')?.click()}
                                    disabled={isUploadingCookies}
                                    className="w-full"
                                  >
                                    {isUploadingCookies ? (
                                      <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />上传中...</>
                                    ) : (
                                      <><Upload className="w-4 h-4 mr-2" />上传 cookies.txt</>
                                    )}
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex gap-2">
                                <input
                                  type="file"
                                  accept=".txt"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0]
                                    if (file) {
                                      handleUploadCookies(file)
                                      e.target.value = ''
                                    }
                                  }}
                                  className="hidden"
                                  id="cookies-update"
                                />
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  onClick={() => document.getElementById('cookies-update')?.click()}
                                  disabled={isUploadingCookies}
                                  className="flex-1"
                                >
                                  <FileText className="w-4 h-4 mr-2" />
                                  更新cookies
                                </Button>
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  onClick={handleDeleteCookies}
                                  className="text-red-600 hover:text-red-700"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            )}
                          </div>
                          
                          {/* Quick add test videos */}
                          <div className="space-y-2 p-4 border rounded-lg bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
                            <Label className="text-sm font-medium">快速添加测试视频</Label>
                            <div className="flex flex-wrap gap-2">
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => handleAddYouTubeVideo('https://vimeo.com/76979871')}
                                disabled={isParsingYouTube}
                              >
                                Vimeo示例
                              </Button>
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => handleAddVideo({
                                  url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
                                  title: 'Mux测试流',
                                  thumbnail: 'https://via.placeholder.com/120x68?text=Mux'
                                })}
                              >
                                HLS测试流
                              </Button>
                            </div>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                    {videos.length > 0 && (
                      <Button variant="outline" size="sm" onClick={handleClearVideos} className="text-red-600 hover:text-red-700">
                        <Trash2 className="w-4 h-4 mr-2" />清空
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {videos.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Video className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>视频队列为空</p>
                    <p className="text-sm">点击"获取视频"添加视频</p>
                  </div>
                ) : (
                  <ScrollArea className="h-96">
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleDragEnd}
                    >
                      <SortableContext
                        items={videos.map(v => v.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="space-y-2">
                          {videos.map((video, index) => (
                            <SortableVideoItem
                              key={video.id}
                              video={video}
                              index={index}
                              isPlaying={currentPlayingId === video.id}
                              runningTime={currentPlayingId === video.id ? streamRunningTime : 0}
                              onPlay={() => handlePlayVideo(index)}
                              onPause={handleStopStream}
                              onRemove={() => handleRemoveVideo(video.id)}
                              disabled={streamStatus === 'streaming' && currentPlayingId !== video.id}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Logs */}
          <div className="space-y-6">
            <Card className="h-[400px] flex flex-col">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base"><Monitor className="w-4 h-4" />推流日志</CardTitle>
                  <Select value={logFilter} onValueChange={(value: LogType | 'all') => setLogFilter(value)}>
                    <SelectTrigger className="w-24 h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部</SelectItem>
                      <SelectItem value="info">信息</SelectItem>
                      <SelectItem value="success">成功</SelectItem>
                      <SelectItem value="warning">警告</SelectItem>
                      <SelectItem value="error">错误</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent className="flex-1 overflow-hidden p-0">
                <div ref={logContainerRef} className="h-full overflow-y-auto p-4 space-y-2">
                  {filteredLogs.length === 0 ? (
                    <div className="text-center text-muted-foreground py-8">暂无日志</div>
                  ) : (
                    filteredLogs.map((log) => (
                      <div key={log.id} className="flex items-start gap-2 text-sm">
                        {getLogIcon(log.type)}
                        <span className="text-xs text-muted-foreground whitespace-nowrap">{log.timestamp.toLocaleTimeString('zh-CN')}</span>
                        <span className={cn(log.type === 'error' && 'text-red-500', log.type === 'success' && 'text-green-500', log.type === 'warning' && 'text-yellow-500')}>{log.message}</span>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t py-4 mt-auto">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">YouTube自动推流管理系统 © 2024</div>
      </footer>

      {/* Video Selection Dialog */}
      <Dialog open={isSelectDialogOpen} onOpenChange={setIsSelectDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Video className="w-5 h-5" />
              选择要添加的视频
            </DialogTitle>
            <DialogDescription>
              已获取 {fetchedVideos.length} 个视频，请选择要添加到队列的视频
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-between py-2 border-b">
            <div className="flex items-center gap-2">
              <Checkbox
                id="select-all"
                checked={selectedVideos.size === fetchedVideos.length && fetchedVideos.length > 0}
                onCheckedChange={handleSelectAll}
              />
              <Label htmlFor="select-all" className="text-sm cursor-pointer">全选 ({selectedVideos.size}/{fetchedVideos.length})</Label>
            </div>
            <Button size="sm" onClick={handleAddSelectedVideos} disabled={selectedVideos.size === 0}>
              <Plus className="w-4 h-4 mr-2" />
              添加选中 ({selectedVideos.size})
            </Button>
          </div>
          <ScrollArea className="h-[400px]">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-1">
              {fetchedVideos.map((video) => (
                <div
                  key={video.id}
                  className={cn(
                    "border rounded-lg overflow-hidden transition-all cursor-pointer",
                    selectedVideos.has(video.id) && "ring-2 ring-green-500 border-green-500"
                  )}
                  onClick={() => handleSelectVideo(video.id, !selectedVideos.has(video.id))}
                >
                  <div className="relative">
                    <img src={video.thumbnail || 'https://via.placeholder.com/120x68?text=Video'} alt={video.title} className="w-full aspect-video object-cover" />
                    <div className="absolute top-2 left-2">
                      <Checkbox
                        checked={selectedVideos.has(video.id)}
                        onCheckedChange={(checked) => handleSelectVideo(video.id, checked === true)}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-white"
                      />
                    </div>
                  </div>
                  <div className="p-3">
                    <h4 className="font-medium text-sm line-clamp-2 mb-1">{video.title}</h4>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">{video.duration || '未知时长'}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSelectDialogOpen(false)}>
              <X className="w-4 h-4 mr-2" />
              取消
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
