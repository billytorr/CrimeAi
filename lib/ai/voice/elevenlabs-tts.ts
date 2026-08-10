// Text-to-speech via ElevenLabs. Real provider; dormant without both an API
// key and a voice id.
import type { TTSProvider, TTSResult } from "../providers";

export function elevenlabsTTS(): TTSProvider {
  const key = process.env.ELEVENLABS_API_KEY;
  const defaultVoice = process.env.ELEVENLABS_VOICE_ID;
  return {
    name: "elevenlabs",
    configured: !!(key && defaultVoice),
    async synthesize(text, opts): Promise<TTSResult> {
      if (!key || !defaultVoice) throw new Error("TTS provider not configured");
      const voice = opts?.voice || defaultVoice;
      // Cap text so a runaway prompt can't generate minutes of paid audio.
      const clipped = text.slice(0, 2_000);
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
        method: "POST",
        headers: { "xi-api-key": key, "Content-Type": "application/json", accept: "audio/mpeg" },
        body: JSON.stringify({
          text: clipped,
          model_id: process.env.ELEVENLABS_MODEL || "eleven_turbo_v2_5",
        }),
        signal: AbortSignal.timeout(45_000),
      });
      if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 120)}`);
      return { audio: await res.arrayBuffer(), contentType: "audio/mpeg" };
    },
  };
}
