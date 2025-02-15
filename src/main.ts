import { RoyalRoadTextExtractor } from "./extractors/RoyalRoadTextExtractor";
import { KokoroTTSApiService } from "./services/KokoroTTSApiService";
import { TTSService } from "./services/TTSService";
import { injectStyle } from "./style";

console.log("Starting TTS service");
injectStyle();

const kokoroApiService = new KokoroTTSApiService({
  apiURL: "http://127.0.0.1:8880",
  voice: "af_heart",
});
const textExtractor = new RoyalRoadTextExtractor();

const ttsService = new TTSService(kokoroApiService, textExtractor);

(window as any)["ttsService"] = ttsService;