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

export function useTerminalSocket(batchIntervalMs: number = 50): UseTerminalSocketReturn {
  const [logs, setLogs] = useState<string[]>([]);
  const [isWsConnected, setIsWsConnected] = useState<boolean>(false);
  const [isSessionRunning, setIsSessionRunning] = useState<boolean>(false);

  const wsRef = useRef<WebSocket | null>(null);
  const currentSeqRef = useRef<number>(0);
  const bufferRef = useRef<string[]>([]);
  const flushTimerRef = useRef<any>(null);
  const reconnectTimeoutRef = useRef<any>(null);

  // Throttled batch flusher to protect React Native JS thread from log flooding
  const flushBuffer = useCallback(() => {
    if (bufferRef.current.length > 0) {
      const incoming = bufferRef.current;
      bufferRef.current = [];
      setLogs((prev) => {
        // Keep maximum 2,000 lines in mobile memory for butter-smooth scrolling
        const combined = [...prev, ...incoming];
        return combined.length > 2000 ? combined.slice(combined.length - 2000) : combined;
      });
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
            return;
          }
          if (msg.type === "output") {
            if (msg.seq > currentSeqRef.current) {
              currentSeqRef.current = msg.seq;
            }
            bufferRef.current.push(msg.data);
          } else if (msg.type === "status") {
            setIsSessionRunning(msg.state === "RUNNING");
            if (msg.seq && msg.seq > currentSeqRef.current) {
              currentSeqRef.current = msg.seq;
            }
          }
        } catch {
          // Fallback if payload is raw string
          bufferRef.current.push(event.data);
        } finally {
          flushBuffer();
        }
      };

      socket.onclose = (event: any) => {
        setIsWsConnected(false);
        wsRef.current = null;
        if (event && event.code === 4001) {
          // Device access was revoked by host
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
  }, [batchIntervalMs, flushBuffer]);

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
    setLogs([]);
    bufferRef.current = [];
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
