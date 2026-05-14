import type { ITTSApiService } from "../../types/ITTSApiService";
import type { VoiceProfile } from "../VoiceProfilesService";
import { KokoroTTSApiService } from "./KokoroTTSApiService";
import { OpenAITTSApiService } from "./OpenAITTSApiService";

export function createTTSApiService(profile: VoiceProfile): ITTSApiService {
  switch (profile.type) {
    case "kokoro":
      return new KokoroTTSApiService({
        apiURL: profile.apiURL,
        model: profile.model,
        voice: profile.voice,
      });
    case "openai":
      return new OpenAITTSApiService({
        apiURL: profile.apiURL,
        model: profile.model,
        voice: profile.voice,
      });
  }
}
