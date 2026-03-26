import { NextResponse } from "next/server";
import { getActiveProcesses, getStreamState } from "@/lib/stream-manager";

export async function GET() {
  try {
    const processes = getActiveProcesses();
    const state = getStreamState();

    // 获取当前播放视频的详细信息
    const currentVideo = state.status === 'streaming' && state.currentVideoIndex < state.queue.length
      ? state.queue[state.currentVideoIndex]
      : null;

    return NextResponse.json({
      success: true,
      processes: processes.map(p => ({
        pid: p.pid,
        videoTitle: p.videoTitle,
        videoUrl: p.videoUrl,
        rtmpUrl: p.rtmpUrl,
        startedAt: p.startedAt,
        status: p.status,
        runningTime: Math.floor((Date.now() - new Date(p.startedAt).getTime()) / 1000)
      })),
      // 当前播放信息
      currentStream: {
        status: state.status,
        currentVideoIndex: state.currentVideoIndex,
        currentVideo: currentVideo ? {
          id: currentVideo.id,
          title: currentVideo.title,
          url: currentVideo.url
        } : null,
        startedAt: state.startedAt,
        queueLength: state.queue.length,
        loop: {
          current: state.currentLoop + 1,
          total: state.loopCount
        }
      }
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to get processes" },
      { status: 500 }
    );
  }
}
