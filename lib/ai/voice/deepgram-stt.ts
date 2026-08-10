// Speech-to-text via Deepgram. Real provider; dormant without DEEPGRAM_API_KEY.
import type { STTProvider, STTResult } from "../providers";

export function deepgramSTT(): STTProvider {
  const key = process.env.DEEPGRAM_API_KEY;
  return {
    name: "deepgram",
    configured: !!key,
    async transcribe(audio, opts): Promise<STTResult> {
      if (!key) throw new Error("STT provider not configured");
      const body = audio instanceof Blob ? audio : new Blob([audio as ArrayBuffer]);
      const params = new URLSearchParams({
        model: process.env.DEEPGRAM_MODEL || "nova-2",
        smart_format: "true",
        ...(opts?.language ? { language: opts.language } : {}),
      });
      const res = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
        method: "POST",
        headers: { Authorization: `Token ${key}`, "Content-Type": (audio as Blob).type || "audio/webm" },
        body,
        signal: AbortSignal.timeout(45_000),
      });
      if (!res.ok) throw new Error(`Deepgram ${res.status}: ${(await res.text()).slice(0, 120)}`);
      const data = (await res.json()) as any;
      const alt = data?.results?.channels?.[0]?.alternatives?.[0];
      return {
        text: (alt?.transcript || "").trim(),
        durationSec: data?.metadata?.duration,
      };
    },
  };
}
