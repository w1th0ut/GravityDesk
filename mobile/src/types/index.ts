export interface BatteryInfo {
  percent: number;
  is_charging: boolean;
  secs_left: number;
}

export interface ActiveSessionInfo {
  is_alive: boolean;
  cwd: string;
  command: string;
  pid: number | null;
  current_seq: number;
}

export interface HealthResponse {
  status: "online" | "offline";
  tailscale_ip: string;
  active_session: ActiveSessionInfo | null;
  cpu_percent: number;
  memory_percent: number;
  battery: BatteryInfo | null;
  sleep_inhibit_active: boolean;
}

export interface Breadcrumb {
  name: string;
  path: string;
}

export interface DirectoryEntry {
  name: string;
  path: string;
  is_dir: boolean;
}

export interface WorkspacesResponse {
  current_path: string;
  entries: DirectoryEntry[];
  breadcrumbs: Breadcrumb[];
  drives: string[];
  error?: string;
}

export interface FavoriteItem {
  name: string;
  path: string;
}

export interface TerminalOutputMessage {
  type: "output";
  seq: number;
  data: string;
  ts: number;
}

export interface TerminalStatusMessage {
  type: "status";
  state: "RUNNING" | "STOPPED" | "TERMINATED";
  cwd?: string;
  seq?: number;
}

export type TerminalIncomingMessage = TerminalOutputMessage | TerminalStatusMessage;

export interface ConnectionConfig {
  hostUrl: string;
  token: string;
}
