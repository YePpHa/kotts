import { render } from "preact";
import { Signal, signal } from "@preact/signals";
import { SidebarComponent } from "./components/SidebarComponent";
import content from "./style.css" with { type: "css" };
import { SegmentHoverPlayButton } from "./components/SegmentHoverPlayButton";
import { set } from "zod";

function createStylesheet(content: string) {
  const style = new CSSStyleSheet();
  style.replaceSync(content);
  return style;
}

interface AppProps {
  isPlaying: Signal<boolean>;
  currentTime: Signal<number>;
  buffering: Signal<boolean>;
  duration: Signal<number>;
  autoScrolling: Signal<boolean>;
  autoScrollingDirection: Signal<"up" | "down">;
  segmentHoverIndex: Signal<number>;
  segmentHoverElement: Signal<HTMLElement | null>;
  onPlayPauseClick: () => void;
  onSegmentHoverPlayClick: (index: number) => void;
  onEnableAutoScrollingClick: () => void;
}

const App = (props: AppProps) => {
  return (
    <>
      <SidebarComponent
        isPlaying={props.isPlaying.value}
        buffering={props.buffering.value}
        currentTime={props.currentTime.value}
        duration={props.duration.value}
        autoScrolling={props.autoScrolling.value}
        autoScrollingDirection={props.autoScrollingDirection.value}
        onPlayPauseClick={props.onPlayPauseClick}
        onEnableAutoScrollingClick={props.onEnableAutoScrollingClick}
      />
      <SegmentHoverPlayButton
        onPlayClick={props.onSegmentHoverPlayClick}
        segmentHoverIndex={props.segmentHoverIndex}
        segmentHoverElement={props.segmentHoverElement}
      />
    </>
  );
};

interface Options {
  isPlaying: boolean;
  buffering: boolean;
  currentTime: number;
  duration: number;
  autoScrolling: boolean;
  autoScrollingDirection: "up" | "down";
  segmentHoverIndex: number;
  segmentHoverElement: HTMLElement | null;
  onPlayPauseClick: () => void;
  onSegmentHoverPlayClick: (index: number) => void;
  onEnableAutoScrollingClick: () => void;
}

export function setupUi(options: Options) {
  const uiContainer = document.createElement("div");
  uiContainer.className = "kokotts-ui";
  document.body.appendChild(uiContainer);
  const shadowRoot = uiContainer.attachShadow({ mode: "open" });
  shadowRoot.adoptedStyleSheets = [createStylesheet(content)];

  const isPlayingSignal = signal(options.isPlaying);
  const bufferingSignal = signal(options.buffering);
  const currentTimeSignal = signal(options.currentTime);
  const durationSignal = signal(options.duration);
  const autoScrollingSignal = signal(options.autoScrolling);
  const autoScrollingDirectionSignal = signal(options.autoScrollingDirection);
  const segmentHoverIndexSignal = signal(options.segmentHoverIndex);
  const segmentHoverElementSignal = signal(options.segmentHoverElement);

  render(
    <App
      isPlaying={isPlayingSignal}
      buffering={bufferingSignal}
      currentTime={currentTimeSignal}
      duration={durationSignal}
      autoScrolling={autoScrollingSignal}
      autoScrollingDirection={autoScrollingDirectionSignal}
      segmentHoverIndex={segmentHoverIndexSignal}
      segmentHoverElement={segmentHoverElementSignal}
      onPlayPauseClick={options.onPlayPauseClick}
      onSegmentHoverPlayClick={options.onSegmentHoverPlayClick}
      onEnableAutoScrollingClick={options.onEnableAutoScrollingClick}
    />,
    shadowRoot,
  );

  return {
    setPlaying: (playing: boolean) => {
      isPlayingSignal.value = playing;
    },
    setBuffering: (buffering: boolean) => {
      bufferingSignal.value = buffering;
    },
    setCurrentTime: (currentTime: number) => {
      currentTimeSignal.value = currentTime;
    },
    setDuration: (duration: number) => {
      durationSignal.value = duration;
    },
    setAutoScrolling: (enabled: boolean) => {
      autoScrollingSignal.value = enabled;
    },
    setAutoScrollingDirection: (direction: "up" | "down") => {
      autoScrollingDirectionSignal.value = direction;
    },
    setSegmentHover: (index: number, element: HTMLElement | null) => {
      segmentHoverIndexSignal.value = index;
      segmentHoverElementSignal.value = element;
    },
  };
}
