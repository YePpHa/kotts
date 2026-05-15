import { useEffect, useMemo, useRef, useState } from "preact/hooks";

import { BACKENDS, type BackendType, BACKEND_TYPES } from "../../services/tts/backends";
import {
  type BackendInfo,
  type VoiceProfileData,
  OpenAITTSApiService,
} from "../../services/tts/OpenAITTSApiService";
import {
  type SavedVoice,
  type TTSProvider,
  type VoiceProfile,
  type VoiceSettings,
  VoiceProfilesService,
} from "../../services/VoiceProfilesService";

type Tab = "providers" | "voices" | "saved";

interface FullSettingsPopupProps {
  open: boolean;
  onClose: () => void;
  onProfileChanged?: (profile: VoiceProfile | null) => void;
}

export const FullSettingsPopup = ({ open, onClose, onProfileChanged }: FullSettingsPopupProps) => {
  const [tab, setTab] = useState<Tab>("providers");
  const [settings, setSettings] = useState<VoiceSettings>(() =>
    VoiceProfilesService.defaultSettings(),
  );
  const activeVoice = useMemo(
    () =>
      settings.activeVoiceId
        ? (settings.voices.find((v) => v.id === settings.activeVoiceId) ?? null)
        : null,
    [settings],
  );

  const refreshSettings = async () => setSettings(await VoiceProfilesService.load());

  useEffect(() => {
    if (!open) {
      return;
    }
    void refreshSettings();
  }, [open]);

  const saveAndEmit = async (next: VoiceSettings) => {
    await VoiceProfilesService.save(next);
    setSettings(next);
    onProfileChanged?.(VoiceProfilesService.getActiveProfile(next));
  };

  if (!open) {
    return null;
  }

  return (
    <div class="fixed inset-0 z-[9999] flex bg-neutral-950/80 p-8">
      <div class="flex flex-1 bg-neutral-900 rounded-2xl ring-1 ring-neutral-700 shadow-2xl overflow-hidden">
        <div class="w-[200px] shrink-0 border-r border-neutral-800 p-4 flex flex-col">
          <div class="text-sm font-semibold text-neutral-200 mb-4">Settings</div>
          <div class="flex flex-col gap-1">
            {(["providers", "voices", "saved"] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                class={`px-3 py-2 rounded-lg text-sm text-left transition-colors ${
                  tab === t
                    ? "bg-neutral-800 text-white font-medium"
                    : "text-neutral-400 hover:text-white hover:bg-neutral-800/50"
                }`}
                onClick={() => setTab(t)}
              >
                {t === "providers" ? "Providers" : t === "voices" ? "Voices" : "Saved"}
              </button>
            ))}
          </div>
        </div>
        <div class="flex-1 flex flex-col min-w-0">
          <div class="p-4 flex items-center justify-between border-b border-neutral-800 shrink-0">
            <div class="text-sm font-medium text-neutral-200">
              {tab === "providers" ? "Providers" : tab === "voices" ? "Voices" : "Saved voices"}
            </div>
            <button
              type="button"
              class="w-9 h-9 rounded-lg flex items-center justify-center text-neutral-300 hover:text-white hover:bg-neutral-800"
              onClick={onClose}
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          <div class="flex-1 overflow-auto p-6">
            {tab === "providers" && (
              <ProvidersTab settings={settings} onSettingsChange={saveAndEmit} />
            )}
            {tab === "voices" && <VoicesTab settings={settings} onSettingsChange={saveAndEmit} />}
            {tab === "saved" && (
              <SavedTab
                settings={settings}
                activeVoice={activeVoice}
                onSettingsChange={saveAndEmit}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

function ProvidersTab({
  settings,
  onSettingsChange,
}: {
  settings: VoiceSettings;
  onSettingsChange: (s: VoiceSettings) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState<BackendType>("kokoro");
  const [apiURL, setApiURL] = useState("");
  const [authorization, setAuthorization] = useState("");

  const startAdd = () => {
    setEditId(null);
    setName("");
    setType("kokoro");
    setApiURL("");
    setAuthorization("");
    setShowForm(true);
  };

  const startEdit = (p: TTSProvider) => {
    setEditId(p.id);
    setName(p.name);
    setType(p.type as BackendType);
    setApiURL(p.apiURL);
    setAuthorization(p.authorization ?? "");
    setShowForm(true);
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditId(null);
  };

  const saveProvider = () => {
    if (!name.trim() || !apiURL.trim()) {
      return;
    }
    const { settings: next } = VoiceProfilesService.upsertProvider(
      {
        id: editId ?? undefined,
        name: name.trim(),
        type,
        apiURL: apiURL.trim(),
        authorization: authorization.trim() || undefined,
      },
      settings,
    );
    onSettingsChange(next);
    setShowForm(false);
    setEditId(null);
  };

  const deleteProvider = (id: string) => {
    const next = VoiceProfilesService.removeProvider(id, settings);
    onSettingsChange(next);
  };

  return (
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <div class="text-sm font-medium text-neutral-300">TTS Providers</div>
        <button
          type="button"
          class="px-3 py-1.5 rounded-lg text-sm bg-sky-600 hover:bg-sky-500"
          onClick={startAdd}
        >
          Add provider
        </button>
      </div>

      {showForm && (
        <div class="p-4 rounded-xl border border-neutral-800 bg-neutral-950 space-y-3">
          <div class="text-xs uppercase tracking-wide text-neutral-400">
            {editId ? "Edit provider" : "New provider"}
          </div>
          <div class="grid grid-cols-2 gap-3">
            <label class="block text-sm">
              <div class="text-neutral-300 mb-1">Name</div>
              <input
                class="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-2 py-2 text-sm"
                placeholder="My Server"
                value={name}
                onInput={(e) => setName(e.currentTarget.value)}
              />
            </label>
            <label class="block text-sm">
              <div class="text-neutral-300 mb-1">Backend type</div>
              <select
                class="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-2 py-2 text-sm"
                value={type}
                onChange={(e) => setType(e.currentTarget.value as BackendType)}
              >
                {BACKEND_TYPES.map((bt) => (
                  <option key={bt} value={bt}>
                    {BACKENDS[bt].label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label class="block text-sm">
            <div class="text-neutral-300 mb-1">Host URL</div>
            <input
              class="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-2 py-2 text-sm"
              placeholder="http://127.0.0.1:8000"
              value={apiURL}
              onInput={(e) => setApiURL(e.currentTarget.value)}
            />
          </label>
          <label class="block text-sm">
            <div class="text-neutral-300 mb-1">Authorization (optional)</div>
            <input
              class="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-2 py-2 text-sm"
              type="password"
              placeholder="Bearer sk-... or Api-Key ..."
              value={authorization}
              onInput={(e) => setAuthorization(e.currentTarget.value)}
            />
          </label>
          <div class="flex gap-2">
            <button
              type="button"
              class="px-3 py-1.5 rounded-lg text-sm bg-sky-600 hover:bg-sky-500 disabled:opacity-50"
              disabled={!name.trim() || !apiURL.trim()}
              onClick={saveProvider}
            >
              Save
            </button>
            <button
              type="button"
              class="px-3 py-1.5 rounded-lg text-sm border border-neutral-700 hover:bg-neutral-800"
              onClick={cancelForm}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div class="space-y-2">
        {settings.providers.length === 0 && (
          <div class="text-sm text-neutral-400">No providers yet.</div>
        )}
        {settings.providers.map((p) => {
          const voiceCount = settings.voices.filter((v) => v.providerId === p.id).length;
          return (
            <div
              key={p.id}
              class="p-3 rounded-xl border border-neutral-800 bg-neutral-950 flex items-center justify-between"
            >
              <div class="min-w-0">
                <div class="font-medium text-sm truncate">{p.name}</div>
                <div class="text-xs text-neutral-400 truncate">
                  {BACKENDS[p.type as BackendType]?.label ?? p.type} · {p.apiURL}
                  {p.authorization ? " · auth" : ""} · {voiceCount} voice
                  {voiceCount !== 1 ? "s" : ""}
                </div>
              </div>
              <div class="flex gap-2 shrink-0 ml-3">
                <button
                  type="button"
                  class="text-xs px-2 py-1 rounded-md border border-neutral-700 hover:bg-neutral-800"
                  onClick={() => startEdit(p)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  class="text-xs px-2 py-1 rounded-md border border-red-800 hover:bg-red-900/30 text-red-300"
                  onClick={() => deleteProvider(p.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type ProviderDiscovery = {
  backendInfos: BackendInfo[];
  voices: VoiceProfileData[];
  loading: boolean;
  error: string | null;
};

type SimpleDiscovery = {
  models: string[];
  voices: string[];
  loading: boolean;
  error: string | null;
};

function VoicesTab({
  settings,
  onSettingsChange,
}: {
  settings: VoiceSettings;
  onSettingsChange: (s: VoiceSettings) => void;
}) {
  const [selectedProviderId, setSelectedProviderId] = useState<string>("");
  const provider = useMemo(
    () => settings.providers.find((p) => p.id === selectedProviderId) ?? null,
    [settings, selectedProviderId],
  );

  const backend = provider ? BACKENDS[provider.type as BackendType] : null;
  const abortRef = useRef<AbortController | null>(null);

  const [simpleDiscovery, setSimpleDiscovery] = useState<SimpleDiscovery>({
    models: [],
    voices: [],
    loading: false,
    error: null,
  });

  const [providerDiscovery, setProviderDiscovery] = useState<ProviderDiscovery>({
    backendInfos: [],
    voices: [],
    loading: false,
    error: null,
  });
  const [selectedBackend, setSelectedBackend] = useState<string>("");

  const [cloneName, setCloneName] = useState("");
  const [cloneAudio, setCloneAudio] = useState<File | null>(null);
  const [cloneRefText, setCloneRefText] = useState("");
  const [cloneLoading, setCloneLoading] = useState(false);
  const [cloneError, setCloneError] = useState<string | null>(null);
  const [createName, setCreateName] = useState("");
  const [createVoiceRef, setCreateVoiceRef] = useState("");
  const [createLoading, setCreateLoading] = useState(false);

  useEffect(() => {
    if (!provider || !backend) {
      setSimpleDiscovery({ models: [], voices: [], loading: false, error: null });
      setProviderDiscovery({ backendInfos: [], voices: [], loading: false, error: null });
      return;
    }

    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    if (backend.hasVoiceManagement) {
      setProviderDiscovery((d) => ({ ...d, loading: true, error: null }));
      void (async () => {
        try {
          const [backendInfos, voices] = await Promise.all([
            backend.discoverBackends?.(provider.apiURL, {
              signal: abort.signal,
              authorization: provider.authorization,
            }) ?? Promise.resolve([]),
            OpenAITTSApiService.getAvailableVoices(provider.apiURL, {
              signal: abort.signal,
              authorization: provider.authorization,
            }),
          ]);
          if (abort.signal.aborted) {
            return;
          }
          setProviderDiscovery({ backendInfos, voices, loading: false, error: null });
          if (backendInfos.length > 0 && !selectedBackend) {
            setSelectedBackend(backendInfos[0].name);
          }
        } catch (err) {
          if (abort.signal.aborted) {
            return;
          }
          setProviderDiscovery((d) => ({
            ...d,
            loading: false,
            error: err instanceof Error ? err.message : "Failed to discover",
          }));
        }
      })();
    } else {
      setSimpleDiscovery((d) => ({ ...d, loading: true, error: null }));
      void (async () => {
        try {
          const [modelResult, voices] = await Promise.all([
            backend.discoverModels(provider.apiURL, {
              signal: abort.signal,
              authorization: provider.authorization,
            }),
            backend.discoverVoices(provider.apiURL, {
              signal: abort.signal,
              authorization: provider.authorization,
            }),
          ]);
          if (abort.signal.aborted) {
            return;
          }
          setSimpleDiscovery({
            models: modelResult.models,
            voices,
            loading: false,
            error: null,
          });
        } catch (err) {
          if (abort.signal.aborted) {
            return;
          }
          setSimpleDiscovery((d) => ({
            ...d,
            loading: false,
            error: err instanceof Error ? err.message : "Failed to discover",
          }));
        }
      })();
    }

    return () => abort.abort();
  }, [provider?.id, provider?.apiURL]);

  const addSavedVoice = async (voiceId: string, voiceName: string, model: string) => {
    if (!provider) {
      return;
    }
    const { settings: next } = VoiceProfilesService.upsertVoice(
      { providerId: provider.id, name: voiceName, model, voice: voiceId },
      settings,
    );
    await VoiceProfilesService.save(next);
    onSettingsChange(next);
  };

  const selectedBackendInfo = useMemo(
    () => providerDiscovery.backendInfos.find((b) => b.name === selectedBackend) ?? null,
    [providerDiscovery.backendInfos, selectedBackend],
  );

  const presetVoices = useMemo(
    () => selectedBackendInfo?.preset_voices ?? [],
    [selectedBackendInfo],
  );

  const customVoices = useMemo(
    () => providerDiscovery.voices.filter((v) => v.backend === selectedBackend),
    [providerDiscovery.voices, selectedBackend],
  );

  const handleClone = async () => {
    if (!provider || !cloneName.trim() || !cloneAudio || !selectedBackend) {
      return;
    }
    setCloneLoading(true);
    setCloneError(null);
    try {
      const result = await OpenAITTSApiService.cloneVoice(
        provider.apiURL,
        {
          name: cloneName.trim(),
          backend: selectedBackend,
          audio: cloneAudio,
          ref_text: cloneRefText.trim() || undefined,
        },
        { authorization: provider.authorization },
      );
      setProviderDiscovery((d) => ({ ...d, voices: [...d.voices, result] }));
      setCloneName("");
      setCloneAudio(null);
      setCloneRefText("");
    } catch (err) {
      setCloneError(err instanceof Error ? err.message : "Clone failed");
    } finally {
      setCloneLoading(false);
    }
  };

  const handleCreatePreset = async () => {
    if (!provider || !createName.trim() || !createVoiceRef.trim() || !selectedBackend) {
      return;
    }
    setCreateLoading(true);
    try {
      const result = await OpenAITTSApiService.createVoice(
        provider.apiURL,
        {
          name: createName.trim(),
          backend: selectedBackend,
          voice_type: "preset",
          voice_ref: createVoiceRef.trim(),
        },
        { authorization: provider.authorization },
      );
      setProviderDiscovery((d) => ({ ...d, voices: [...d.voices, result] }));
      setCreateName("");
      setCreateVoiceRef("");
    } finally {
      setCreateLoading(false);
    }
  };

  const handleDeleteCustom = async (voiceId: string) => {
    if (!provider) {
      return;
    }
    try {
      await OpenAITTSApiService.deleteVoice(provider.apiURL, voiceId, {
        authorization: provider.authorization,
      });
      setProviderDiscovery((d) => ({
        ...d,
        voices: d.voices.filter((v) => v.id !== voiceId),
      }));
    } catch {
      // ignore
    }
  };

  const voiceListLabel = backend?.label ?? provider?.type ?? "Backend";

  return (
    <div class="space-y-4">
      <label class="block text-sm">
        <div class="text-neutral-300 mb-1">Provider</div>
        <select
          class="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-2 py-2 text-sm"
          value={selectedProviderId}
          onChange={(e) => setSelectedProviderId(e.currentTarget.value)}
        >
          <option value="">Select provider…</option>
          {settings.providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({BACKENDS[p.type as BackendType]?.label ?? p.type})
            </option>
          ))}
        </select>
      </label>

      {!provider && (
        <div class="text-sm text-neutral-400">Select a provider to discover voices.</div>
      )}

      {provider && backend && !backend.hasVoiceManagement && (
        <div class="space-y-4">
          {simpleDiscovery.loading && <div class="text-sm text-neutral-300">Discovering…</div>}
          {simpleDiscovery.error && <div class="text-sm text-red-300">{simpleDiscovery.error}</div>}

          {simpleDiscovery.models.length > 0 && (
            <div class="text-xs text-neutral-400">Models: {simpleDiscovery.models.join(", ")}</div>
          )}

          {simpleDiscovery.voices.length > 0 && (
            <div class="space-y-2">
              <div class="text-xs uppercase tracking-wide text-neutral-400">Available voices</div>
              <div class="grid grid-cols-2 gap-2 max-h-[300px] overflow-auto">
                {simpleDiscovery.voices.map((voice) => {
                  const alreadySaved = settings.voices.some(
                    (v) => v.voice === voice && v.providerId === provider.id,
                  );
                  return (
                    <div
                      key={voice}
                      class="p-2 rounded-lg border border-neutral-800 bg-neutral-950 flex items-center justify-between"
                    >
                      <div class="text-sm truncate">{voice}</div>
                      <button
                        type="button"
                        class="text-xs px-2 py-1 rounded-md bg-sky-600 hover:bg-sky-500 disabled:opacity-40 shrink-0 ml-2"
                        disabled={alreadySaved}
                        onClick={() =>
                          addSavedVoice(
                            voice,
                            `${voice} (${provider.name})`,
                            simpleDiscovery.models[0] ?? voiceListLabel,
                          )
                        }
                      >
                        {alreadySaved ? "Saved" : "Use"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {provider && backend?.hasVoiceManagement && (
        <div class="space-y-4">
          {providerDiscovery.loading && <div class="text-sm text-neutral-300">Discovering…</div>}
          {providerDiscovery.error && (
            <div class="text-sm text-red-300">{providerDiscovery.error}</div>
          )}

          {providerDiscovery.backendInfos.length > 0 && (
            <label class="block text-sm">
              <div class="text-neutral-300 mb-1">Backend</div>
              <select
                class="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-2 py-2 text-sm"
                value={selectedBackend}
                onChange={(e) => setSelectedBackend(e.currentTarget.value)}
              >
                {providerDiscovery.backendInfos.map((b) => (
                  <option key={b.name} value={b.name}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {selectedBackendInfo && (
            <div class="text-xs text-neutral-400 space-x-3">
              {selectedBackendInfo.capabilities.has_preset_voices && (
                <span class="text-sky-300">preset voices</span>
              )}
              {selectedBackendInfo.capabilities.supports_voice_design && (
                <span class="text-emerald-300">voice design</span>
              )}
              {selectedBackendInfo.capabilities.supports_voice_cloning && (
                <span class="text-amber-300">voice cloning</span>
              )}
            </div>
          )}

          {presetVoices.length > 0 && (
            <div class="space-y-2">
              <div class="text-xs uppercase tracking-wide text-neutral-400">Preset voices</div>
              <div class="grid grid-cols-2 gap-2 max-h-[160px] overflow-auto">
                {presetVoices.map((voice) => {
                  const alreadySaved = settings.voices.some(
                    (v) => v.voice === voice && v.providerId === provider.id,
                  );
                  return (
                    <div
                      key={voice}
                      class="p-2 rounded-lg border border-neutral-800 bg-neutral-950 flex items-center justify-between"
                    >
                      <div class="text-sm truncate">{voice}</div>
                      <button
                        type="button"
                        class="text-xs px-2 py-1 rounded-md bg-sky-600 hover:bg-sky-500 disabled:opacity-40 shrink-0 ml-2"
                        disabled={alreadySaved}
                        onClick={() =>
                          addSavedVoice(voice, `${voice} (${provider.name})`, selectedBackend)
                        }
                      >
                        {alreadySaved ? "Saved" : "Use"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {customVoices.length > 0 && (
            <div class="space-y-2">
              <div class="text-xs uppercase tracking-wide text-neutral-400">Custom voices</div>
              <div class="space-y-2 max-h-[200px] overflow-auto">
                {customVoices.map((v) => {
                  const alreadySaved = settings.voices.some(
                    (sv) => sv.voice === v.id && sv.providerId === provider.id,
                  );
                  return (
                    <div
                      key={v.id}
                      class="p-2 rounded-lg border border-neutral-800 bg-neutral-950 flex items-center justify-between"
                    >
                      <div class="min-w-0">
                        <div class="text-sm truncate">{v.name}</div>
                        <div class="text-xs text-neutral-400">
                          {v.voice_type} · {v.id}
                        </div>
                      </div>
                      <div class="flex gap-2 shrink-0 ml-2">
                        <button
                          type="button"
                          class="text-xs px-2 py-1 rounded-md bg-sky-600 hover:bg-sky-500 disabled:opacity-40"
                          disabled={alreadySaved}
                          onClick={() => addSavedVoice(v.id, v.name, selectedBackend)}
                        >
                          {alreadySaved ? "Saved" : "Use"}
                        </button>
                        <button
                          type="button"
                          class="text-xs px-2 py-1 rounded-md border border-red-800 hover:bg-red-900/30 text-red-300"
                          onClick={() => handleDeleteCustom(v.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {selectedBackendInfo?.capabilities.supports_voice_cloning && (
            <div class="p-3 rounded-xl border border-neutral-800 bg-neutral-950 space-y-2">
              <div class="text-xs uppercase tracking-wide text-neutral-400">Clone voice</div>
              <input
                class="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-2 py-2 text-sm"
                placeholder="Voice name"
                value={cloneName}
                onInput={(e) => setCloneName(e.currentTarget.value)}
              />
              <input
                class="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-2 py-2 text-sm text-neutral-400 file:mr-2 file:text-white"
                type="file"
                accept="audio/*"
                onChange={(e) => setCloneAudio(e.currentTarget.files?.[0] ?? null)}
              />
              <input
                class="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-2 py-2 text-sm"
                placeholder="Reference text (optional)"
                value={cloneRefText}
                onInput={(e) => setCloneRefText(e.currentTarget.value)}
              />
              {cloneError && <div class="text-xs text-red-300">{cloneError}</div>}
              <button
                type="button"
                class="px-3 py-1.5 rounded-lg text-sm bg-amber-600 hover:bg-amber-500 disabled:opacity-50"
                disabled={!cloneName.trim() || !cloneAudio || cloneLoading}
                onClick={handleClone}
              >
                {cloneLoading ? "Cloning…" : "Clone voice"}
              </button>
            </div>
          )}

          {selectedBackendInfo?.capabilities.has_preset_voices && (
            <div class="p-3 rounded-xl border border-neutral-800 bg-neutral-950 space-y-2">
              <div class="text-xs uppercase tracking-wide text-neutral-400">
                Create preset voice
              </div>
              <input
                class="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-2 py-2 text-sm"
                placeholder="Voice name"
                value={createName}
                onInput={(e) => setCreateName(e.currentTarget.value)}
              />
              <input
                class="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-2 py-2 text-sm"
                placeholder="Voice ref (e.g. af_heart)"
                value={createVoiceRef}
                onInput={(e) => setCreateVoiceRef(e.currentTarget.value)}
              />
              <button
                type="button"
                class="px-3 py-1.5 rounded-lg text-sm bg-sky-600 hover:bg-sky-500 disabled:opacity-50"
                disabled={!createName.trim() || !createVoiceRef.trim() || createLoading}
                onClick={handleCreatePreset}
              >
                {createLoading ? "Creating…" : "Create voice"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SavedTab({
  settings,
  activeVoice,
  onSettingsChange,
}: {
  settings: VoiceSettings;
  activeVoice: SavedVoice | null;
  onSettingsChange: (s: VoiceSettings) => void;
}) {
  const setActive = async (voiceId: string) => {
    const next = VoiceProfilesService.setActiveVoice(voiceId, settings);
    onSettingsChange(next);
  };

  const removeVoice = async (voiceId: string) => {
    const next = VoiceProfilesService.removeVoice(voiceId, settings);
    onSettingsChange(next);
  };

  return (
    <div class="space-y-2">
      <div class="text-xs uppercase tracking-wide text-neutral-400">
        Saved voices ({settings.voices.length})
      </div>

      {settings.voices.length === 0 && (
        <div class="text-sm text-neutral-400">
          No voices saved yet. Go to the Voices tab to discover and pick voices.
        </div>
      )}

      <div class="space-y-2 max-h-[500px] overflow-auto">
        {settings.voices.map((v) => {
          const provider = settings.providers.find((p) => p.id === v.providerId);
          const isActive = activeVoice?.id === v.id;
          return (
            <div
              key={v.id}
              class={`p-3 rounded-xl border ${
                isActive ? "border-sky-500 bg-sky-500/10" : "border-neutral-800 bg-neutral-950"
              }`}
            >
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <div class="font-medium text-sm truncate">
                    {v.name}
                    {isActive && <span class="ml-2 text-xs text-sky-300">active</span>}
                  </div>
                  <div class="text-xs text-neutral-400 truncate">
                    {provider
                      ? `${BACKENDS[provider.type as BackendType]?.label ?? provider.type} · ${provider.name}`
                      : "Unknown provider"}
                  </div>
                  <div class="text-xs text-neutral-500 truncate">
                    model: {v.model} · voice: {v.voice}
                  </div>
                </div>
                <div class="flex flex-col gap-2 shrink-0">
                  <button
                    type="button"
                    class="text-xs px-2 py-1 rounded-md border border-neutral-700 hover:bg-neutral-800"
                    onClick={() => setActive(v.id)}
                  >
                    {isActive ? "Active" : "Set active"}
                  </button>
                  <button
                    type="button"
                    class="text-xs px-2 py-1 rounded-md border border-red-800 hover:bg-red-900/30 text-red-300"
                    onClick={() => removeVoice(v.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
