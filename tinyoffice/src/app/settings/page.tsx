"use client";

import { useState, useEffect, useCallback } from "react";
import { getSettings, updateSettings, getAuthStatus, startOAuth, disconnectOAuth, type Settings, type AuthStatus } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Settings as SettingsIcon,
  Save,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Wifi,
  MessageSquare,
  Cpu,
  FolderOpen,
  Link,
  Unlink,
  Key,
  ExternalLink,
} from "lucide-react";

function OAuthCard({
  provider,
  label,
  description,
  icon,
}: {
  provider: "claude" | "codex";
  label: string;
  description: string;
  icon: React.ReactNode;
}) {
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [savingKey, setSavingKey] = useState(false);
  const [keyError, setKeyError] = useState("");

  const refresh = useCallback(async () => {
    const s = await getAuthStatus(provider);
    setStatus(s);
    setLoading(false);
  }, [provider]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
  }, [refresh]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const { url } = await startOAuth(provider);
      window.open(url, "_blank", "width=600,height=700,noopener");
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await disconnectOAuth(provider);
      await refresh();
    } finally {
      setDisconnecting(false);
    }
  };

  const handleSaveKey = async () => {
    if (!apiKey.trim()) return;
    setSavingKey(true);
    setKeyError("");
    try {
      const settingKey = provider === "claude" ? "anthropic" : "openai";
      await updateSettings({
        models: { [settingKey]: { apiKey: apiKey.trim(), auth_method: "api_key" } },
      } as Partial<Settings>);
      setApiKey("");
      await refresh();
    } catch (e) {
      setKeyError((e as Error).message);
    } finally {
      setSavingKey(false);
    }
  };

  const isConnected = status?.connected;
  const authMethod = status?.method;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {icon}
            <CardTitle className="text-base">{label}</CardTitle>
          </div>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : isConnected ? (
            <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/20">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Connected {authMethod === "oauth" ? "(OAuth)" : authMethod === "api_key" ? "(API Key)" : ""}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">Not connected</Badge>
          )}
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isConnected ? (
          <Button
            variant="outline"
            size="sm"
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="text-destructive border-destructive/30 hover:bg-destructive/10"
          >
            {disconnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink className="h-4 w-4" />}
            Disconnect
          </Button>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Option 1 — OAuth Login (recommended)</p>
              <Button size="sm" onClick={handleConnect} disabled={connecting}>
                {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                Connect with {label}
              </Button>
              <p className="text-[11px] text-muted-foreground">
                Opens a login window. No API key needed — uses your {label} account directly.
              </p>
            </div>
            <div className="relative">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">or</span>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Option 2 — API Key</p>
              <div className="flex gap-2">
                <Input
                  type="password"
                  placeholder={provider === "claude" ? "sk-ant-..." : "sk-..."}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="font-mono text-xs flex-1"
                />
                <Button size="sm" onClick={handleSaveKey} disabled={savingKey || !apiKey.trim()}>
                  {savingKey ? <Loader2 className="h-4 w-4 animate-spin" /> : <Key className="h-4 w-4" />}
                  Save
                </Button>
              </div>
              {keyError && <p className="text-xs text-destructive">{keyError}</p>}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [rawJson, setRawJson] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    getSettings()
      .then((s) => { setSettings(s); setRawJson(JSON.stringify(s, null, 2)); })
      .catch((err) => { setErrorMsg(err.message); setStatus("error"); })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    try {
      setSaving(true);
      const parsed = JSON.parse(rawJson);
      const result = await updateSettings(parsed);
      setSettings(result.settings);
      setRawJson(JSON.stringify(result.settings, null, 2));
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 3000);
    } catch (err) {
      setErrorMsg((err as Error).message);
      setStatus("error");
      setTimeout(() => setStatus("idle"), 5000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <SettingsIcon className="h-5 w-5 text-primary" />
            Settings
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Configure providers, channels, and authentication</p>
        </div>
        <div className="flex items-center gap-3">
          {status === "saved" && (
            <span className="flex items-center gap-1.5 text-sm text-emerald-500">
              <CheckCircle2 className="h-4 w-4" /> Saved
            </span>
          )}
          {status === "error" && (
            <span className="flex items-center gap-1.5 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" /> {errorMsg}
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-8">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Workspace</CardTitle>
                <FolderOpen className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-xs text-muted-foreground truncate">{settings?.workspace?.path || "Not set"}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Provider</CardTitle>
                <Cpu className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-xs font-medium capitalize">{settings?.models?.provider || "anthropic"}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Channels</CardTitle>
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="flex gap-1 flex-wrap">
                  {settings?.channels?.enabled?.map((ch) => (
                    <Badge key={ch} variant="secondary" className="text-[10px] px-1.5 py-0">{ch}</Badge>
                  )) || <span className="text-xs text-muted-foreground">None</span>}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Monitoring</CardTitle>
                <Wifi className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-xs text-muted-foreground">
                  {settings?.monitoring?.heartbeat_interval ? `${settings.monitoring.heartbeat_interval}ms` : "Default"}
                </div>
              </CardContent>
            </Card>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Link className="h-4 w-4 text-primary" />
              AI Provider Authentication
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              <OAuthCard
                provider="claude"
                label="Claude Code"
                description="Anthropic's Claude via OAuth login or API key. OAuth uses your claude.ai subscription with no usage limits."
                icon={<span className="text-lg">🤖</span>}
              />
              <OAuthCard
                provider="codex"
                label="Codex (OpenAI)"
                description="OpenAI's Codex CLI via OAuth login or API key. OAuth uses your ChatGPT Plus / OpenAI account."
                icon={<span className="text-lg">⚡</span>}
              />
            </div>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary" />
              Channel Tokens
            </h2>
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="discord-token">Discord Bot Token</Label>
                    <Input
                      id="discord-token"
                      type="password"
                      placeholder="Bot token from Discord Developer Portal"
                      defaultValue={settings?.channels?.discord?.bot_token || ""}
                      className="font-mono text-xs"
                      onBlur={async (e) => {
                        if (e.target.value) await updateSettings({ channels: { discord: { bot_token: e.target.value } } } as Partial<Settings>);
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="telegram-token">Telegram Bot Token</Label>
                    <Input
                      id="telegram-token"
                      type="password"
                      placeholder="Token from @BotFather"
                      defaultValue={settings?.channels?.telegram?.bot_token || ""}
                      className="font-mono text-xs"
                      onBlur={async (e) => {
                        if (e.target.value) await updateSettings({ channels: { telegram: { bot_token: e.target.value } } } as Partial<Settings>);
                      }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <SettingsIcon className="h-4 w-4 text-primary" />
              Raw Configuration (JSON)
            </h2>
            <Card>
              <CardHeader>
                <CardDescription>Full TinyClaw configuration. Edit directly and save.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  value={rawJson}
                  onChange={(e) => setRawJson(e.target.value)}
                  className="min-h-[400px] font-mono text-xs"
                  spellCheck={false}
                />
                <Button onClick={handleSave} disabled={saving || loading}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save Configuration
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
