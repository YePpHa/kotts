import { ArrowDown, ArrowUp, AudioLines, User } from "lucide-preact";
import { Component } from "preact";

import type { VoiceProfile } from "../../services/VoiceProfilesService";
import { Button } from "./Button";
import { PlayButtonComponent } from "./PlayButtonComponent";
import { VoicePickerMenu } from "./VoicePickerMenu";

interface SidebarComponentProps {
  onPlayPauseClick?: () => void;
  onEnableAutoScrollingClick?: () => void;
  isPlaying: boolean;
  buffering: boolean;
  currentTime: number;
  duration: number;
  autoScrolling: boolean;
  autoScrollingDirection: "up" | "down";
  hasActiveProfile: boolean;
  onProfileChanged?: (profile: VoiceProfile | null) => void;
  onOpenSettings?: () => void;
}

export class SidebarComponent extends Component<SidebarComponentProps> {
  state = {
    menuOpen: false,
  };

  public render() {
    const {
      onPlayPauseClick,
      onEnableAutoScrollingClick,
      isPlaying,
      buffering,
      currentTime,
      duration,
      autoScrolling,
      autoScrollingDirection,
      hasActiveProfile,
      onProfileChanged,
      onOpenSettings,
    } = this.props;

    const currentTimeString = `${Math.floor(currentTime / 60)
      .toString()
      .padStart(2, "0")}:${Math.floor(currentTime % 60)
      .toString()
      .padStart(2, "0")}`;

    return (
      <aside class="fixed right-4 top-1/2 transform -translate-y-1/2 flex flex-col items-center">
        {!autoScrolling && isPlaying && autoScrollingDirection === "up" && (
          <div class="absolute -top-[48px] bg-neutral-900 rounded-full mb-2 ring-sky-300 glow w-[40px] h-[40px] flex items-center justify-center animate-top-slide-in z-0">
            <Button size={40} onClick={onEnableAutoScrollingClick} className="">
              <ArrowUp size={24} color="#ffffff" strokeWidth={2} />
            </Button>
          </div>
        )}
        <div class="bg-neutral-900 rounded-2xl p-2 ring-sky-300 glow w-[48px] flex flex-col items-center space-y-4 z-10">
          <span class="text-white">{currentTimeString}</span>
          <PlayButtonComponent
            isPlaying={isPlaying}
            buffering={buffering}
            progress={currentTime / duration}
            size={32}
            strokeWidth={2}
            onClick={onPlayPauseClick}
            disabled={!hasActiveProfile}
          />
          <div className="border-b-2 border-neutral-700 w-[32px]" />
          <Button onClick={() => {}}>
            <User size={18} color="#ffffff" strokeWidth={2} />
          </Button>
          <div class="relative">
            <Button onClick={() => this.setState({ menuOpen: !this.state.menuOpen })}>
              <AudioLines size={18} color="#ffffff" strokeWidth={2} />
            </Button>
            <VoicePickerMenu
              open={this.state.menuOpen}
              onClose={() => this.setState({ menuOpen: false })}
              onOpenSettings={onOpenSettings ?? (() => {})}
              onProfileChanged={onProfileChanged}
            />
          </div>
        </div>
        {!autoScrolling && isPlaying && autoScrollingDirection === "down" && (
          <div class="absolute -bottom-[48px] bg-neutral-900 rounded-full mt-2 ring-sky-300 glow w-[40px] h-[40px] flex items-center justify-center animate-bottom-slide-in z-0">
            <Button size={40} onClick={onEnableAutoScrollingClick} className="">
              <ArrowDown size={24} color="#ffffff" strokeWidth={2} />
            </Button>
          </div>
        )}
      </aside>
    );
  }
}
