import { useEffect, useMemo, useRef, useState } from "preact/hooks";

import { KokoroTTSApiService } from "../../services/tts/KokoroTTSApiService";
import { OpenAITTSApiService } from "../../services/tts/OpenAITTSApiService";
import { type TTSBackendType, VoiceProfilesService } from "../../services/VoiceProfilesService";

type DiscoveryState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; models: string[]; defaultModel: string | null; voices: string[] }
  | { status: "error"; message: string };

interface VoiceProfilesPopupProps {
  open: boolean;
  onClose: () => void;
}

function normalizeHost(host: string): string {
  return host.trim().replace(/\/+$/, "");
}

export const VoiceProfilesPopup = ({ open, onClose }: VoiceProfilesPopupProps) => {
  const [settings, setSettings] = useState(() => VoiceProfilesService.defaultSettings());

  const activeProfile = useMemo(() => VoiceProfilesService.getActiveProfile(settings), [settings]);

  const [backendType, setBackendType] = useState<TTSBackendType>("kokoro");
  const knownHosts = useMemo(
    () => VoiceProfilesService.getKnownHosts(backendType, settings),
    [backendType, settings],
  );

  const [hostMode, setHostMode] = useState<"known" | "custom">("known");
  const [knownHost, setKnownHost] = useState<string>("");
  const [customHost, setCustomHost] = useState<string>("");

  const apiURL = useMemo(() => {
    if (hostMode === "custom") {
      return normalizeHost(customHost);
    }
    return normalizeHost(knownHost);
  }, [hostMode, knownHost, customHost]);

  const [discovery, setDiscovery] = useState<DiscoveryState>({ status: "idle" });
  const abortRef = useRef<AbortController | null>(null);

  const [name, setName] = useState<string>("");
  const [model, setModel] = useState<string>("");
  const [voice, setVoice] = useState<string>("");
  const [_voiceAudio, setVoiceAudio] = useState<string>("");
  const [_voiceAudioFilename, setVoiceAudioFilename] = useState<string>("");
  const [needsReload, setNeedsReload] = useState<boolean>(false);

  const refreshSettings = async () => setSettings(await VoiceProfilesService.load());

  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;
    void (async () => {
      const loaded = await VoiceProfilesService.load();
      if (cancelled) return;
      setSettings(loaded);
      setNeedsReload(false);

      // Prime the form from the active profile.
      const active = VoiceProfilesService.getActiveProfile(loaded);
      if (active) {
        setBackendType(active.type);
        setHostMode("known");
        setKnownHost(active.apiURL);
      } else {
        setBackendType("kokoro");
        setHostMode("known");
        setKnownHost(loaded.profiles.find((p) => p.type === "kokoro")?.apiURL ?? "");
      }

      setCustomHost("");
      setName("");
      setModel("");
      setVoice("");
      setVoiceAudio("");
      setVoiceAudioFilename("");
      setDiscovery({ status: "idle" });
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  const runDiscovery = async (signal: AbortSignal) => {
    if (!apiURL) {
      setDiscovery({ status: "idle" });
      return;
    }

    setDiscovery({ status: "loading" });
    try {
      if (backendType === "openai") {
        const [{ models, defaultModel }, voices] = await Promise.all([
          OpenAITTSApiService.getAvailableModels(apiURL, { signal }),
          OpenAITTSApiService.getAvailableVoices(apiURL, { signal }),
        ]);
        setDiscovery({ status: "loaded", models, defaultModel, voices });
        setModel((prev) => prev || defaultModel || models[0] || "");
        setVoice((prev) => prev || voices[0] || "");
        return;
      }

      const [{ models, defaultModel }, voices] = await Promise.all([
        KokoroTTSApiService.getAvailableModels(apiURL, { signal }),
        KokoroTTSApiService.getAvailableVoices(apiURL, { signal }),
      ]);
      setDiscovery({ status: "loaded", models, defaultModel, voices });
      setModel((prev) => prev || defaultModel || models[0] || "");
      setVoice((prev) => prev || voices[0] || "");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch models/voices";
      setDiscovery({ status: "error", message });
    }
  };

  useEffect(() => {
    if (!open) {
      return;
    }
    if (
      hostMode === "known" &&
      knownHost &&
      knownHosts.length > 0 &&
      !knownHosts.includes(knownHost)
    ) {
      setKnownHost(knownHosts[0] ?? "");
    }
  }, [open, backendType, knownHosts, hostMode, knownHost]);

  useEffect(() => {
    if (!open) {
      return;
    }
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;
    setModel("");
    setVoice("");
    void runDiscovery(abort.signal);
    return () => abort.abort();
  }, [open, backendType, apiURL]);

  const addProfile = async () => {
    if (!apiURL || !model) return;
    if (!voice) return;

    const profileName =
      name.trim().length > 0 ? name.trim() : `${backendType.toUpperCase()} ${voice}`;

    const { settings: next } = VoiceProfilesService.upsertProfile(
      {
        name: profileName,
        type: backendType,
        apiURL,
        model,
        voice,
      },
      settings,
    );
    await VoiceProfilesService.save(next);
    setSettings(next);
    setNeedsReload(true);
    setName("");
  };

  const setActive = async (profileId: string) => {
    const next = VoiceProfilesService.setActiveProfile(profileId, settings);
    await VoiceProfilesService.save(next);
    setSettings(next);
    setNeedsReload(true);
  };

  const remove = async (profileId: string) => {
    const next = VoiceProfilesService.removeProfile(profileId, settings);
    await VoiceProfilesService.save(next);
    setSettings(next);
    setNeedsReload(true);
  };

  if (!open) {
    return null;
  }

  return (
    <div class="fixed inset-0 z-[9999] pointer-events-none">
      <div
        class="absolute inset-y-0 left-0 right-[64px] bg-black/60 pointer-events-auto"
        onClick={() => onClose()}
      />
      <div class="absolute right-[76px] top-1/2 -translate-y-1/2 w-[380px] max-w-[calc(100vw-2rem)] bg-neutral-900 text-white rounded-2xl ring-1 ring-neutral-700 shadow-xl pointer-events-auto">
        <div class="p-4 flex items-center justify-between border-b border-neutral-800">
          <div class="font-semibold">Voices</div>
          <button
            type="button"
            class="w-9 h-9 -mr-1 -mt-1 rounded-lg flex items-center justify-center text-neutral-300 hover:text-white hover:bg-neutral-800 active:bg-neutral-700 focus:outline-none focus:ring-2 focus:ring-sky-500"
            onClick={() => onClose()}
            aria-label="Close"
            title="Close"
          >
            ✕
          </button>
        </div>

        <div class="p-4 space-y-4">
          <div class="space-y-2">
            <div class="text-xs uppercase tracking-wide text-neutral-400">Add voice profile</div>

            <label class="block text-sm">
              <div class="text-neutral-300 mb-1">Backend</div>
              <select
                class="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-2 py-2"
                value={backendType}
                onChange={(e) =>
                  setBackendType((e.currentTarget.value as TTSBackendType) || "kokoro")
                }
              >
                <option value="kokoro">Kokoro</option>
                <option value="openai">OpenAI</option>
              </select>
            </label>

            <div class="grid grid-cols-2 gap-2">
              <label class="block text-sm">
                <div class="text-neutral-300 mb-1">Host mode</div>
                <select
                  class="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-2 py-2"
                  value={hostMode}
                  onChange={(e) =>
                    setHostMode((e.currentTarget.value as "known" | "custom") || "known")
                  }
                >
                  <option value="known">Pick existing</option>
                  <option value="custom">Custom</option>
                </select>
              </label>

              {hostMode === "known" ? (
                <label class="block text-sm">
                  <div class="text-neutral-300 mb-1">Host</div>
                  <select
                    class="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-2 py-2"
                    value={knownHost}
                    onChange={(e) => setKnownHost(e.currentTarget.value)}
                  >
                    <option value="">Select…</option>
                    {knownHosts.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label class="block text-sm">
                  <div class="text-neutral-300 mb-1">Host</div>
                  <input
                    class="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-2 py-2"
                    placeholder="http://127.0.0.1:8000"
                    value={customHost}
                    onInput={(e) => setCustomHost(e.currentTarget.value)}
                  />
                </label>
              )}
            </div>

            <div class="flex items-center justify-between gap-2">
              <div class="text-xs text-neutral-400 truncate">API: {apiURL || "—"}</div>
              <button
                type="button"
                class="text-xs px-2 py-1 rounded-md border border-neutral-700 hover:bg-neutral-800"
                onClick={() => {
                  abortRef.current?.abort();
                  const abort = new AbortController();
                  abortRef.current = abort;
                  void runDiscovery(abort.signal);
                }}
              >
                Refresh
              </button>
            </div>

            {discovery.status === "loading" && (
              <div class="text-sm text-neutral-300">Loading models/voices…</div>
            )}
            {discovery.status === "error" && (
              <div class="text-sm text-red-300">{discovery.message}</div>
            )}

            <div class="grid grid-cols-2 gap-2">
              <label class="block text-sm">
                <div class="text-neutral-300 mb-1">Model</div>
                <select
                  class="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-2 py-2"
                  value={model}
                  onChange={(e) => setModel(e.currentTarget.value)}
                  disabled={discovery.status !== "loaded"}
                >
                  <option value="">Select…</option>
                  {discovery.status === "loaded" &&
                    discovery.models.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                </select>
              </label>

              <label class="block text-sm">
                <div class="text-neutral-300 mb-1">Voice</div>
                <select
                  class="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-2 py-2"
                  value={voice}
                  onChange={(e) => setVoice(e.currentTarget.value)}
                  disabled={discovery.status !== "loaded"}
                >
                  <option value="">Select…</option>
                  {discovery.status === "loaded" &&
                    discovery.voices.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                </select>
              </label>
            </div>

            <label class="block text-sm">
              <div class="text-neutral-300 mb-1">Name (optional)</div>
              <input
                class="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-2 py-2"
                placeholder="e.g. My local Echo voice"
                value={name}
                onInput={(e) => setName(e.currentTarget.value)}
              />
            </label>

            <button
              type="button"
              class="w-full px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 disabled:hover:bg-sky-600"
              disabled={!apiURL || !model || !voice}
              onClick={() => addProfile()}
            >
              Add profile
            </button>
          </div>

          <div class="space-y-2">
            <div class="text-xs uppercase tracking-wide text-neutral-400">Saved profiles</div>

            <div class="space-y-2 max-h-[220px] overflow-auto pr-1">
              {settings.profiles.length === 0 && (
                <div class="text-sm text-neutral-400">No profiles yet.</div>
              )}

              {settings.profiles.map((p) => {
                const isActive = activeProfile?.id === p.id;
                return (
                  <div
                    key={p.id}
                    class={`p-3 rounded-xl border ${isActive ? "border-sky-500 bg-sky-500/10" : "border-neutral-800 bg-neutral-950"}`}
                  >
                    <div class="flex items-start justify-between gap-2">
                      <div class="min-w-0">
                        <div class="font-medium truncate">
                          {p.name}
                          {isActive ? (
                            <span class="ml-2 text-xs text-sky-300">(active)</span>
                          ) : null}
                        </div>
                        <div class="text-xs text-neutral-400 truncate">
                          {p.type} · {p.apiURL}
                        </div>
                        <div class="text-xs text-neutral-400 truncate">
                          model: {p.model} · voice: {p.voice}
                        </div>
                      </div>
                      <div class="flex flex-col gap-2 shrink-0">
                        <button
                          type="button"
                          class="text-xs px-2 py-1 rounded-md border border-neutral-700 hover:bg-neutral-800"
                          onClick={() => setActive(p.id)}
                        >
                          Set active
                        </button>
                        <button
                          type="button"
                          class="text-xs px-2 py-1 rounded-md border border-neutral-700 hover:bg-neutral-800"
                          onClick={() => remove(p.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div class="flex items-center justify-between gap-2 pt-1">
              <button
                type="button"
                class="text-xs px-2 py-1 rounded-md border border-neutral-700 hover:bg-neutral-800"
                onClick={() => void refreshSettings()}
              >
                Reload list
              </button>
              {needsReload && (
                <button
                  type="button"
                  class="text-xs px-2 py-1 rounded-md bg-amber-500/20 border border-amber-400/50 hover:bg-amber-500/30"
                  onClick={() => location.reload()}
                >
                  Reload page to apply
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
