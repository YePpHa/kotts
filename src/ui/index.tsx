import { render } from "preact";
import { Signal, signal } from "@preact/signals";
import { SidebarComponent } from "./components/SidebarComponent";
import content from "./style.css" with { type: "css" };

function createStylesheet(content: string) {
  const style = new CSSStyleSheet();
  style.replaceSync(content);
  return style;
}

interface AppProps {
  isPlaying: Signal<boolean>;
  currentTime: Signal<number>;
  duration: Signal<number>;
  autoScrolling: Signal<boolean>;
  autoScrollingDirection: Signal<"up" | "down">;
  onPlayPauseClick: () => void;
  onEnableAutoScrollingClick: () => void;
}

const App = (props: AppProps) => {
  return (
    <SidebarComponent
      isPlaying={props.isPlaying.value}
      currentTime={props.currentTime.value}
      duration={props.duration.value}
      autoScrolling={props.autoScrolling.value}
      autoScrollingDirection={props.autoScrollingDirection.value}
      onPlayPauseClick={props.onPlayPauseClick}
      onEnableAutoScrollingClick={props.onEnableAutoScrollingClick}
    />
  );
};

interface Options {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  autoScrolling: boolean;
  autoScrollingDirection: "up" | "down";
  onPlayPauseClick: () => void;
  onEnableAutoScrollingClick: () => void;
}

export function setupUi(options: Options) {
  const uiContainer = document.createElement("div");
  uiContainer.className = "kokotts-ui";
  document.body.appendChild(uiContainer);
  const shadowRoot = uiContainer.attachShadow({ mode: "open" });
  shadowRoot.adoptedStyleSheets = [createStylesheet(content)];

  const isPlayingSignal = signal(options.isPlaying);
  const currentTimeSignal = signal(options.currentTime);
  const durationSignal = signal(options.duration);
  const autoScrollingSignal = signal(options.autoScrolling);
  const autoScrollingDirectionSignal = signal(options.autoScrollingDirection);

  render(
    <App
      isPlaying={isPlayingSignal}
      currentTime={currentTimeSignal}
      duration={durationSignal}
      autoScrolling={autoScrollingSignal}
      autoScrollingDirection={autoScrollingDirectionSignal}
      onPlayPauseClick={options.onPlayPauseClick}
      onEnableAutoScrollingClick={options.onEnableAutoScrollingClick}
    />,
    shadowRoot,
  );

  return {
    setPlaying: (playing: boolean) => {
      isPlayingSignal.value = playing;
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
    }
  };
}
