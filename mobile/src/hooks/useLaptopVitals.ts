import { useState, useEffect, useCallback } from "react";
import { fetchHealth } from "../api/health";
import { HealthResponse } from "../types";

export function useLaptopVitals(pollIntervalMs: number = 3000) {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isChecking, setIsChecking] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const checkHealth = useCallback(async () => {
    try {
      const data = await fetchHealth();
      setHealth(data);
      setIsConnected(true);
      setError(null);
    } catch (err: any) {
      setIsConnected(false);
      setError(err.message || "Unable to reach laptop");
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    checkHealth();
    const timer = setInterval(checkHealth, pollIntervalMs);
    return () => clearInterval(timer);
  }, [checkHealth, pollIntervalMs]);

  return { health, isConnected, isChecking, error, refresh: checkHealth };
}
