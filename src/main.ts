import { FanFictionTextExtractor } from "./extractors/FanFictionTextExtractor";
import { RoyalRoadTextExtractor } from "./extractors/RoyalRoadTextExtractor";
import { ScribbleHubTextExtractor } from "./extractors/ScribbleHubTextExtractor";
import { BufferingState, PlaybackState } from "./libs/MediaController";
import { createTTSApiService } from "./services/tts/createTTSApiService";
import { TTSService } from "./services/TTSService";
import type { VoiceProfile } from "./services/VoiceProfilesService";
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

  let ttsService: TTSService | null = null;

  const textExtractor = getTextExtractor();

  const {
    setPlaying,
    setBuffering,
    setCurrentTime,
    setDuration,
    setAutoScrolling,
    setAutoScrollingDirection,
    setSegmentHover,
    setHasActiveProfile,
  } = setupUi({
    isPlaying: false,
    buffering: false,
    currentTime: 0,
    duration: 0,
    hasActiveProfile: activeProfile !== null,
    autoScrolling: false,
    autoScrollingDirection: "up",
    segmentHoverRange: null,
    segmentHoverIndex: -1,
    onEnableAutoScrollingClick: () => {
      ttsService?.setAutoScrolling(true);
    },
    onPlayPauseClick: () => {
      ttsService?.togglePlayPause();
    },
    onSegmentHoverPlayClick: (index) => {
      setSegmentHover(-1, null);
      ttsService?.playSegment(index);
    },
    onProfileChanged: (profile: VoiceProfile | null) => {
      initializeTTS(profile);
    },
  });

  function initializeTTS(profile: VoiceProfile | null) {
    if (ttsService) {
      ttsService[Symbol.dispose]();
      ttsService = null;
    }

    setHasActiveProfile(profile !== null);

    if (profile) {
      const ttsApiService = createTTSApiService(profile);
      ttsService = new TTSService(ttsApiService, textExtractor);

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
  }

  initializeTTS(activeProfile);
}

void start();
