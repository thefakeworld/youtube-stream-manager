import { NextResponse } from "next/server";
import { execSync } from "child_process";
import { writeFileSync } from "fs";
import { join } from "path";

// Force stop all streaming - emergency stop
export async function POST() {
  try {
    // First, write a "stopped" state file to prevent restarts
    const stateFile = join(process.cwd(), '.stream-state.json');
    const stoppedState = {
      status: 'idle',
      currentVideoIndex: 0,
      currentLoop: 0,
      queue: [],
      rtmpUrl: '',
      loopCount: 0,
      error: null,
      startedAt: null,
      currentPid: null,
      sessionId: 'FORCE_STOPPED_' + Date.now()
    };
    
    try {
      writeFileSync(stateFile, JSON.stringify(stoppedState, null, 2));
    } catch {
      // Ignore write errors
    }
    
    // Wait a moment for state to be written
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Kill all FFmpeg processes multiple times
    for (let i = 0; i < 5; i++) {
      execSync('killall -9 ffmpeg 2>/dev/null || true');
      execSync('pkill -9 -f "ffmpeg" 2>/dev/null || true');
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    console.log('[ForceStop] All FFmpeg processes killed');
    
    return NextResponse.json({
      success: true,
      message: "All streaming processes forcefully stopped"
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
