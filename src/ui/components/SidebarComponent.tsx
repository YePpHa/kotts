import { Component } from "preact";
import { PlayButtonComponent } from "./PlayButtonComponent";
import { Button } from "./Button";
import { ArrowDown, ArrowUp, AudioLines, User } from "lucide-preact";

interface SidebarComponentProps {
  onPlayPauseClick?: () => void;
  onEnableAutoScrollingClick?: () => void;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  autoScrolling: boolean;
  autoScrollingDirection: "up" | "down";
}

export class SidebarComponent extends Component<SidebarComponentProps> {
  public render() {
    const {
      onPlayPauseClick,
      onEnableAutoScrollingClick,
      isPlaying,
      currentTime,
      duration,
      autoScrolling,
      autoScrollingDirection,
    } = this.props;

    const currentTimeString = `${
      Math.floor(currentTime / 60).toString().padStart(2, "0")
    }:${Math.floor(currentTime % 60).toString().padStart(2, "0")}`;

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
          <span>
            {currentTimeString}
          </span>
          <PlayButtonComponent
            isPlaying={isPlaying}
            progress={currentTime / duration}
            size={32}
            strokeWidth={2}
            onClick={onPlayPauseClick}
          />
          <div className="border-b-2 border-neutral-700 w-[32px]"></div>
          <Button onClick={() => {}}>
            <User size={18} color="#ffffff" strokeWidth={2} />
          </Button>
          <Button onClick={() => {}}>
            <AudioLines size={18} color="#ffffff" strokeWidth={2} />
          </Button>
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
