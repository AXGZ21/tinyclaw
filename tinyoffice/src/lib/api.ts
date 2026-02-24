const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3777";

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || res.statusText);
  }
  return res.json();
}

export interface AgentConfig {
  name: string;
  provider: string;
  model: string;
  working_directory: string;
  system_prompt?: string;
  prompt_file?: string;
}

export interface TeamConfig {
  name: string;
  agents: string[];
  leader_agent: string;
}

export interface Settings {
  workspace?: { path?: string; name?: string };
  channels?: {
    enabled?: string[];
    discord?: { bot_token?: string };
    telegram?: { bot_token?: string };
    whatsapp?: Record<string, unknown>;
  };
  models?: {
    provider?: string;
    anthropic?: { model?: string; apiKey?: string; auth_method?: string };
    openai?: { model?: string; apiKey?: string; auth_method?: string };
    opencode?: { model?: string };
  };
  agents?: Record<string, AgentConfig>;
  teams?: Record<string, TeamConfig>;
  monitoring?: { heartbeat_interval?: number };
}

export interface AuthStatus {
  connected: boolean;
  method: "oauth" | "api_key" | null;
}

export interface QueueStatus {
  incoming: number;
  processing: number;
  outgoing: number;
  activeConversations: number;
}

export interface ResponseData {
  channel: string;
  sender: string;
  message: string;
  originalMessage: string;
  timestamp: number;
  messageId: string;
  agent?: string;
  files?: string[];
}

export interface EventData {
  type: string;
  timestamp: number;
  [key: string]: unknown;
}

export async function getAgents(): Promise<Record<string, AgentConfig>> {
  return apiFetch("/api/agents");
}

export async function getTeams(): Promise<Record<string, TeamConfig>> {
  return apiFetch("/api/teams");
}

export async function getSettings(): Promise<Settings> {
  return apiFetch("/api/settings");
}

export async function updateSettings(settings: Partial<Settings>): Promise<{ ok: boolean; settings: Settings }> {
  return apiFetch("/api/settings", { method: "PUT", body: JSON.stringify(settings) });
}

export async function getAuthStatus(provider: "claude" | "codex"): Promise<AuthStatus> {
  return apiFetch(`/api/auth/${provider}/status`);
}

export async function startOAuth(provider: "claude" | "codex"): Promise<{ url: string }> {
  return apiFetch(`/api/auth/${provider}/start`);
}

export async function disconnectOAuth(provider: "claude" | "codex"): Promise<{ ok: boolean }> {
  return apiFetch(`/api/auth/${provider}/disconnect`, { method: "DELETE" });
}

export async function getQueueStatus(): Promise<QueueStatus> {
  return apiFetch("/api/queue/status");
}

export async function getResponses(limit = 20): Promise<ResponseData[]> {
  return apiFetch(`/api/responses?limit=${limit}`);
}

export async function getLogs(limit = 100): Promise<{ lines: string[] }> {
  return apiFetch(`/api/logs?limit=${limit}`);
}

export async function sendMessage(data: {
  channel: string;
  message: string;
  target?: string;
}): Promise<{ ok: boolean; messageId: string }> {
  return apiFetch("/api/send", { method: "POST", body: JSON.stringify(data) });
}

export function subscribeToEvents(
  onEvent: (event: EventData) => void,
  onDisconnect?: () => void
): () => void {
  const es = new EventSource(`${API_BASE}/api/events`);
  es.onmessage = (e) => {
    try {
      const event = JSON.parse(e.data);
      onEvent(event);
    } catch (err) {
      console.error("SSE parse error:", err);
    }
  };
  es.onerror = () => {
    onDisconnect?.();
    es.close();
  };
  return () => es.close();
}
