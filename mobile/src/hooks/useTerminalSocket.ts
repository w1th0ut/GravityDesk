import { useState, useEffect, useRef, useCallback } from "react";
import { loadCredentials } from "../storage/credentials";
import { TerminalIncomingMessage } from "../types";

export interface UseTerminalSocketReturn {
  logs: string[];
  isWsConnected: boolean;
  isSessionRunning: boolean;
  sendInput: (data: string) => void;
  sendSignal: (signal: string) => void;
  clearLogs: () => void;
  reconnect: () => void;
}

export const AGY_BANNER =
  "\x1b[36m ███  ████   ███  █   █ ███ █████ █   █\x1b[0m\r\n" +
  "\x1b[36m█     █   █ █   █ █   █  █    █    █ █ \x1b[0m\r\n" +
  "\x1b[36m█ ██  ████  █████  █ █   █    █     █  \x1b[0m\r\n" +
  "\x1b[36m ███  █  █  █   █   █   ███   █     █  \x1b[0m\r\n" +
  "\x1b[36m        ████  █████  ████ █   █        \x1b[0m\r\n" +
  "\x1b[36m        █   █ █     █     ████         \x1b[0m\r\n" +
  "\x1b[36m        █   █ ████     ██ █  █         \x1b[0m\r\n" +
  "\x1b[36m        ████  █████ ████  █   █        \x1b[0m\r\n" +
  "\x1b[90m───────────────────────────────────────\x1b[0m\r\n" +
  "\x1b[36mAnti-Gravity\x1b[0m \x1b[37m(AGY) Remote CLI\x1b[0m\r\n" +
  "\x1b[90mReady for prompts & commands.\x1b[0m\r\n\r\n" +
  "\x1b[32mprompt>\x1b[0m ";

export function cleanChunk(chunk: string): string {
  return chunk
    .replace(/(\x1B\]|\x9D)[0-9;]*[^\x07\x1B\r\n]*(\x07|\x1B\\)?/g, "")
    .replace(/\x1B\[[0-9;?]*[A-LN-Za-ln-z]/g, "")
    .replace(/\[[0-9;?]*[A-LN-Za-ln-z]/g, "")
    .replace(/Microsoft Windows \[Version[^\]]+\]/gi, "")
    .replace(/\(c\) Microsoft Corporation[^\r\n]*/gi, "")
    .replace(/All rights reserved[^\r\n]*/gi, "");
}

export function processChunksIntoLines(
  chunks: string[],
  currentLines: string[],
  maxLines: number = 2000
): string[] {
  const lines = currentLines.length === 0 ? [""] : [...currentLines];

  for (const chunk of chunks) {
    const cleaned = cleanChunk(chunk);
    for (let i = 0; i < cleaned.length; i++) {
      const ch = cleaned[i];
      if (lines.length === 0) lines.push("");

      if (ch === "\r") {
        if (i + 1 < cleaned.length && cleaned[i + 1] === "\n") {
          continue;
        }
        // Standalone carriage return (\r): Overwrite the current active line in-place
        lines[lines.length - 1] = "";
      } else if (ch === "\n") {
        lines.push("");
        if (lines.length > maxLines) {
          lines.shift();
        }
      } else {
        lines[lines.length - 1] += ch;
      }
    }
  }

  return lines;
}

export function useTerminalSocket(
  batchIntervalMs: number = 50,
  onRevoked?: () => void
): UseTerminalSocketReturn {
  const [logs, setLogs] = useState<string[]>([]);
  const [isWsConnected, setIsWsConnected] = useState<boolean>(false);
  const [isSessionRunning, setIsSessionRunning] = useState<boolean>(false);

  const wsRef = useRef<WebSocket | null>(null);
  const currentSeqRef = useRef<number>(0);
  const bufferRef = useRef<string[]>([]);
  const linesRef = useRef<string[]>([]);
  const flushTimerRef = useRef<any>(null);
  const reconnectTimeoutRef = useRef<any>(null);

  // Throttled batch flusher assembling raw chunks into coherent terminal lines
  const flushBuffer = useCallback(() => {
    if (bufferRef.current.length > 0) {
      const incoming = bufferRef.current;
      bufferRef.current = [];
      const updated = processChunksIntoLines(incoming, linesRef.current, 2000);
      linesRef.current = updated;
      setLogs(updated);
    }
  }, []);

  const connect = useCallback(async () => {
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const creds = await loadCredentials();
    if (!creds?.hostUrl || !creds?.token) {
      return;
    }

    try {
      const base = creds.hostUrl.replace(/\/+$/, "");
      const isSecure = base.startsWith("https:");
      const wsProto = isSecure ? "wss:" : "ws:";
      const hostPart = base.replace(/^https?:\/\//, "");
      const devParam = creds.deviceId ? `&device_id=${encodeURIComponent(creds.deviceId)}` : "";
      const wsUrl = `${wsProto}//${hostPart}/ws/terminal?token=${encodeURIComponent(creds.token)}${devParam}`;

      const socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        setIsWsConnected(true);
        // Request missing logs since last sequence
        socket.send(
          JSON.stringify({
            type: "subscribe",
            last_seq: currentSeqRef.current,
          })
        );
      };

      socket.onmessage = (event) => {
        try {
          const msg: any = JSON.parse(event.data);
          if (msg.type === "revoked") {
            setIsWsConnected(false);
            onRevoked?.();
            return;
          }
          if (msg.type === "output") {
            if (msg.seq > currentSeqRef.current) {
              currentSeqRef.current = msg.seq;
            }
            bufferRef.current.push(msg.data);
            if (!flushTimerRef.current) {
              flushTimerRef.current = setTimeout(() => {
                flushTimerRef.current = null;
                flushBuffer();
              }, batchIntervalMs);
            }
          } else if (msg.type === "status") {
            setIsSessionRunning(msg.state === "RUNNING");
            if (msg.seq && msg.seq > currentSeqRef.current) {
              currentSeqRef.current = msg.seq;
            }
          }
        } catch {
          // Fallback if payload is raw string
          bufferRef.current.push(event.data);
          if (!flushTimerRef.current) {
            flushTimerRef.current = setTimeout(() => {
              flushTimerRef.current = null;
              flushBuffer();
            }, batchIntervalMs);
          }
        }
      };

      socket.onclose = (event: any) => {
        if (flushTimerRef.current) {
          clearTimeout(flushTimerRef.current);
          flushTimerRef.current = null;
        }
        flushBuffer();
        setIsWsConnected(false);
        wsRef.current = null;
        if (event && (event.code === 4001 || event.code === 1008)) {
          // Device access was revoked by host or unauthorized
          onRevoked?.();
          return;
        }
        // Schedule auto-reconnect
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = setTimeout(connect, 2500);
      };

      socket.onerror = () => {
        if (wsRef.current) {
          wsRef.current.close();
        }
      };
    } catch (err) {
      console.warn("[TerminalSocket] Connection error:", err);
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = setTimeout(connect, 3000);
    }
  }, [batchIntervalMs, flushBuffer, onRevoked]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimeoutRef.current);
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  const sendInput = useCallback((data: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "stdin", data }));
    }
  }, []);

  const sendSignal = useCallback((signal: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "signal", signal }));
    }
  }, []);

  const clearLogs = useCallback(() => {
    bufferRef.current = [];
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    const initialLines = processChunksIntoLines([AGY_BANNER], []);
    linesRef.current = initialLines;
    setLogs(initialLines);
  }, []);

  return {
    logs,
    isWsConnected,
    isSessionRunning,
    sendInput,
    sendSignal,
    clearLogs,
    reconnect: connect,
  };
}
