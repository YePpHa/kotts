import { RoyalRoadTextExtractor } from "./extractors/RoyalRoadTextExtractor";
import { BufferingState, PlaybackState } from "./libs/MediaController";
import { KokoroTTSApiService } from "./services/KokoroTTSApiService";
import { TTSService } from "./services/TTSService";
import { injectStyle } from "./style";
import { setupUi } from "./ui";
import { firstMatch } from "./utils/Text";

console.log("Starting TTS service");
injectStyle();

const kokoroApiService = new KokoroTTSApiService({
  apiURL: "http://127.0.0.1:8880",
  voice: "af_heart",
});
const textExtractor = new RoyalRoadTextExtractor();

const ttsService = new TTSService(kokoroApiService, textExtractor);

(window as any)["ttsService"] = ttsService;
(window as any)["firstMatch"] = firstMatch;

const {
  setPlaying,
  setBuffering,
  setCurrentTime,
  setDuration,
  setAutoScrolling,
  setAutoScrollingDirection,
  setSegmentHover,
} = setupUi({
  isPlaying: ttsService.isPlaying(),
  buffering: ttsService.buffering,
  currentTime: ttsService.currentTime,
  duration: ttsService.duration,
  autoScrolling: ttsService.isAutoScrolling(),
  autoScrollingDirection: "up",
  segmentHoverElement: null,
  segmentHoverIndex: -1,
  onEnableAutoScrollingClick: () => {
    ttsService.setAutoScrolling(true);
  },
  onPlayPauseClick: () => {
    if (ttsService.isPlaying()) {
      ttsService.pause();
    } else {
      ttsService.play();
    }
  },
  onSegmentHoverPlayClick: (index) => {
    setSegmentHover(-1, null);
    ttsService.playSegment(index);
  },
});

ttsService.onStateChange.add((state) => {
  setPlaying(state === PlaybackState.Play);
});

ttsService.onTimeUpdate.add((currentTime) => {
  setCurrentTime(currentTime);
});

ttsService.onDurationChange.add((duration) => {
  setDuration(duration);
});

ttsService.onAutoScrollingChange.add((enabled) => {
  setAutoScrolling(enabled);
});

ttsService.onSegmentHighlight.add((index, element) => {
  setSegmentHover(index, element);
});

ttsService.onBufferingStateChange.add((state) => {
  setBuffering(state === BufferingState.Buffering);
});
