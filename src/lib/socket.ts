import { Server as HttpServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import clientIo from "socket.io-client";

// Stream service configuration
const STREAM_SERVICE_URL = process.env.STREAM_SERVICE_URL || "http://localhost:3030";

// Global io instance for server-side use
let io: SocketIOServer | null = null;

// Client socket for connecting to stream service
let streamServiceClient: Socket | null = null;

// Types for stream events
interface VideoProgress {
  taskId: string;
  videoId: string;
  currentIndex: number;
  totalVideos: number;
  loopIteration: number;
  timestamp: number;
}

// Initialize Socket.IO server
export function initSocketServer(httpServer: HttpServer) {
  if (io) {
    return io;
  }

  io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  // Handle client connections
  io.on("connection", (socket: Socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    // Join stream room for updates
    socket.on("join:stream", (taskId: string) => {
      socket.join(`stream:${taskId}`);
      console.log(`[Socket] Client ${socket.id} joined stream:${taskId}`);
    });

    // Leave stream room
    socket.on("leave:stream", (taskId: string) => {
      socket.leave(`stream:${taskId}`);
      console.log(`[Socket] Client ${socket.id} left stream:${taskId}`);
    });

    // Handle disconnect
    socket.on("disconnect", () => {
      console.log(`[Socket] Client disconnected: ${socket.id}`);
    });
  });

  // Connect to stream service as client
  connectToStreamService();

  return io;
}

// Connect to stream service (port 3030)
function connectToStreamService() {
  if (streamServiceClient?.connected) {
    return;
  }

  streamServiceClient = clientIo(STREAM_SERVICE_URL, {
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
  });

  streamServiceClient.on("connect", () => {
    console.log("[Socket] Connected to stream service on port 3030");
  });

  streamServiceClient.on("disconnect", () => {
    console.log("[Socket] Disconnected from stream service");
  });

  // Forward events from stream service to frontend clients
  streamServiceClient.on("stream:progress", (data: VideoProgress) => {
    if (io) {
      io.to(`stream:${data.taskId}`).emit("stream:progress", data);
    }
  });

  streamServiceClient.on("stream:error", (data: { taskId: string; error: string }) => {
    if (io) {
      io.to(`stream:${data.taskId}`).emit("stream:error", data);
    }
  });

  streamServiceClient.on("stream:complete", (data: { taskId: string; videoId: string }) => {
    if (io) {
      io.to(`stream:${data.taskId}`).emit("stream:complete", data);
    }
  });

  streamServiceClient.on("stream:started", (data: { taskId: string; configId: string }) => {
    if (io) {
      io.emit("stream:started", data);
    }
  });

  streamServiceClient.on("stream:stopped", (data: { taskId: string }) => {
    if (io) {
      io.to(`stream:${data.taskId}`).emit("stream:stopped", data);
    }
  });
}

// Get IO instance
export function getIO(): SocketIOServer | null {
  return io;
}

// Emit event to all clients in a room
export function emitToRoom(room: string, event: string, data: unknown) {
  if (io) {
    io.to(room).emit(event, data);
  }
}

// Emit event to all clients
export function emitToAll(event: string, data: unknown) {
  if (io) {
    io.emit(event, data);
  }
}

// Send command to stream service
export function sendStreamCommand(command: string, data: Record<string, unknown>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (!streamServiceClient?.connected) {
      reject(new Error("Not connected to stream service"));
      return;
    }

    streamServiceClient.emit(command, data, (response: { success: boolean; data?: unknown; error?: string }) => {
      if (response.success) {
        resolve(response.data);
      } else {
        reject(new Error(response.error || "Command failed"));
      }
    });
  });
}

// Start stream via socket
export async function startStreamViaSocket(taskId: string, configId: string): Promise<void> {
  try {
    await sendStreamCommand("stream:start", { taskId, configId });
  } catch (error) {
    console.error("[Socket] Failed to start stream:", error);
    throw error;
  }
}

// Stop stream via socket
export async function stopStreamViaSocket(taskId: string): Promise<void> {
  try {
    await sendStreamCommand("stream:stop", { taskId });
  } catch (error) {
    console.error("[Socket] Failed to stop stream:", error);
    throw error;
  }
}

// Pause stream via socket
export async function pauseStreamViaSocket(taskId: string): Promise<void> {
  try {
    await sendStreamCommand("stream:pause", { taskId });
  } catch (error) {
    console.error("[Socket] Failed to pause stream:", error);
    throw error;
  }
}

// Resume stream via socket
export async function resumeStreamViaSocket(taskId: string): Promise<void> {
  try {
    await sendStreamCommand("stream:resume", { taskId });
  } catch (error) {
    console.error("[Socket] Failed to resume stream:", error);
    throw error;
  }
}
