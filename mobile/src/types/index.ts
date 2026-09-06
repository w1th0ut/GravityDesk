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

export interface QuotaLimit {
  hourly_percent: number | null;
  hourly_reset: string | null;
  weekly_percent: number | null;
  weekly_reset: string | null;
}

export interface AntigravityUsage {
  gemini: QuotaLimit;
  claude_gpt: QuotaLimit;
}

export interface AntigravityStatus {
  model: string;
  usage: AntigravityUsage;
  last_updated: number | null;
  is_refreshing: boolean;
}

export interface HealthResponse {
  status: "online" | "offline";
  tailscale_ip: string;
  active_session: ActiveSessionInfo | null;
  cpu_percent: number;
  memory_percent: number;
  battery: BatteryInfo | null;
  sleep_inhibit_active: boolean;
  antigravity?: AntigravityStatus;
  ffmpeg_available?: boolean;
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

export interface ConversationItem {
  id: string;
  title?: string;
  summary?: string;
  preview?: string;
  steps?: number;
  time_str?: string;
  relative_time?: string;
  workspace?: string;
  workspace_name?: string;
  workspace_path?: string;
  is_current?: boolean;
}

export interface ConversationsResponse {
  conversations: ConversationItem[];
  active_id: string | null;
  current_repo?: string;
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
  deviceId?: string;
  deviceName?: string;
}
