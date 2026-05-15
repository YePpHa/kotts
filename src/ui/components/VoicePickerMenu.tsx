import { useEffect, useRef, useState } from "preact/hooks";

import type { VoiceProfile, VoiceSettings } from "../../services/VoiceProfilesService";
import { VoiceProfilesService } from "../../services/VoiceProfilesService";

interface VoicePickerMenuProps {
  open: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
  onProfileChanged?: (profile: VoiceProfile | null) => void;
}

export const VoicePickerMenu = ({
  open,
  onClose,
  onOpenSettings,
  onProfileChanged,
}: VoicePickerMenuProps) => {
  const [settings, setSettings] = useState<VoiceSettings>(() =>
    VoiceProfilesService.defaultSettings(),
  );
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    void VoiceProfilesService.load().then(setSettings);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !e.composedPath().includes(menuRef.current)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [open, onClose]);

  const setActive = async (voiceId: string) => {
    const next = VoiceProfilesService.setActiveVoice(voiceId, settings);
    await VoiceProfilesService.save(next);
    setSettings(next);
    onProfileChanged?.(VoiceProfilesService.getActiveProfile(next));
  };

  if (!open) {
    return null;
  }

  const activeVoiceId = settings.activeVoiceId;

  return (
    <div ref={menuRef} class="absolute right-full mr-3 top-0 z-50">
      <div class="bg-neutral-900 rounded-xl ring-1 ring-neutral-700 shadow-xl min-w-[220px] max-w-[320px]">
        <div class="p-2 border-b border-neutral-800">
          <div class="text-xs uppercase tracking-wide text-neutral-400 px-2 py-1">Voices</div>
        </div>

        <div class="max-h-[300px] overflow-auto p-1">
          {settings.voices.length === 0 && (
            <div class="text-xs text-neutral-400 px-2 py-3 text-center">No voices saved yet.</div>
          )}

          {settings.voices.map((v) => {
            const isActive = activeVoiceId === v.id;
            const provider = settings.providers.find((p) => p.id === v.providerId);
            return (
              <button
                key={v.id}
                type="button"
                class={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive ? "bg-sky-500/10 text-sky-200" : "text-neutral-200 hover:bg-neutral-800"
                }`}
                onClick={() => setActive(v.id)}
              >
                <div class="truncate font-medium">{v.name}</div>
                <div class="text-xs text-neutral-500 truncate">
                  {v.model} · {v.voice}
                  {provider ? ` · ${provider.name}` : ""}
                </div>
              </button>
            );
          })}
        </div>

        <div class="p-2 border-t border-neutral-800">
          <button
            type="button"
            class="w-full text-left px-3 py-2 rounded-lg text-sm text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
            onClick={onOpenSettings}
          >
            Manage voices…
          </button>
        </div>
      </div>
    </div>
  );
};
