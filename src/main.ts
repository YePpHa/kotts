import { FanFictionTextExtractor } from "./extractors/FanFictionTextExtractor";
import { RoyalRoadTextExtractor } from "./extractors/RoyalRoadTextExtractor";
import { ScribbleHubTextExtractor } from "./extractors/ScribbleHubTextExtractor";
import { BufferingState, PlaybackState } from "./libs/MediaController";
import { createTTSApiService } from "./services/tts/createTTSApiService";
import { TTSService } from "./services/TTSService";
import { VoiceProfilesService } from "./services/VoiceProfilesService";
import { injectStyle } from "./style";
import type { ITextExtractor } from "./types/ITextExtractor";
import { setupUi } from "./ui";

console.log("Starting TTS service");
injectStyle();

function getTextExtractor(): ITextExtractor {
  const url = window.location.href;
  if (url.startsWith("https://www.royalroad.com/")) {
    return new RoyalRoadTextExtractor();
  }

  if (url.startsWith("https://www.scribblehub.com/")) {
    return new ScribbleHubTextExtractor();
  }

  if (url.startsWith("https://www.fanfiction.net/")) {
    return new FanFictionTextExtractor();
  }

  throw new Error("Unsupported site");
}

async function start() {
  const voiceSettings = await VoiceProfilesService.load();
  const activeProfile = VoiceProfilesService.getActiveProfile(voiceSettings);
  if (activeProfile === null) {
    return;
  }

  const textExtractor = getTextExtractor();
  const ttsApiService = createTTSApiService(activeProfile);
  const ttsService = new TTSService(ttsApiService, textExtractor);

  const {
    setPlaying,
    setBuffering,
    setCurrentTime,
    setDuration,
    setAutoScrolling,
    setAutoScrollingDirection,
    setSegmentHover,
  } = setupUi({
    isPlaying: ttsService.audio.getPlaybackState() === PlaybackState.Play,
    buffering: ttsService.getBufferingState() === BufferingState.Buffering,
    currentTime: ttsService.audio.currentTime,
    duration: ttsService.audio.duration,
    autoScrolling: ttsService.isAutoScrolling(),
    autoScrollingDirection: "up",
    segmentHoverRange: null,
    segmentHoverIndex: -1,
    onEnableAutoScrollingClick: () => {
      ttsService.setAutoScrolling(true);
    },
    onPlayPauseClick: () => {
      ttsService.togglePlayPause();
    },
    onSegmentHoverPlayClick: (index) => {
      setSegmentHover(-1, null);
      ttsService.playSegment(index);
    },
  });

  ttsService.audio.onStateChange.add((state) => {
    setPlaying(state === PlaybackState.Play);
  });

  ttsService.audio.onTimeUpdate.add((currentTime) => {
    setCurrentTime(currentTime);
  });

  ttsService.audio.onDurationChange.add((duration) => {
    setDuration(duration);
  });

  ttsService.onBufferingStateChange.add((state) => {
    setBuffering(state === BufferingState.Buffering);
  });

  ttsService.onAutoScrollingChange.add(({ enabled, direction }) => {
    setAutoScrolling(enabled);
    setAutoScrollingDirection(direction);
  });

  ttsService.onSegmentHighlight.add((index, segment) => {
    setSegmentHover(index, segment);
  });
}

void start();
