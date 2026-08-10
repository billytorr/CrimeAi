// Vision provider — REAL, backed by Anthropic (already our LLM key, already
// vision-capable). No new vendor. Phase 4 of the master-prompt architecture,
// and the "upload an image for CrimeAI to read" feature.
//
// Registered in the Model Gateway; reports configured only when ANTHROPIC_API_KEY
// exists. When it doesn't, the gateway keeps the honest unconfigured stub.
//
// Scoped to CrimeAI's domain: the system prompt keeps it on public-safety
// interpretation and enforces the same hard rules as the text assistant —
// no identifying individuals, no race/ethnicity description, no "this is
// definitely Person X". A photo of a suspicious flyer, a police report, a
// street scene: describe what's relevant to safety, flag what can't be
// verified from an image.

import Anthropic from "@anthropic-ai/sdk";
import type { VisionProvider, VisionResult } from "../providers";

const VISION_SYSTEM = `You are CrimeAI's vision analyst. A user has shared an image or document and wants your read on it for public-safety purposes.

Describe what is actually visible and relevant to safety. If it's a document (a report, a notice, a letter), summarise its content and flag anything a resident should act on. If it's a scene or object, describe what you can see plainly.

HARD RULES — never break these:
- Never identify a specific individual, and never claim a photo shows a particular named person.
- Never describe anyone's race or ethnicity.
- Never guess at someone's guilt or predict criminal behaviour from an image.
- Say clearly what an image cannot establish (intent, identity, what happened before/after the frame).

Be useful and grounded. You are helping someone understand something they saw, not passing judgement on people.`;

// data URL or raw base64 → { media_type, data } for the Anthropic image block
function toImageBlock(image: string): { mediaType: string; data: string } {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(image);
  if (m) return { mediaType: m[1], data: m[2] };
  // assume already-bare base64 JPEG if no data-url header
  return { mediaType: "image/jpeg", data: image };
}

export function anthropicVision(): VisionProvider {
  const configured = !!process.env.ANTHROPIC_API_KEY;
  return {
    name: "anthropic",
    configured,
    async analyze(image, prompt): Promise<VisionResult> {
      if (!configured) throw new Error("Vision provider not configured");
      // Accept a data-URL/base64 string; Blob/ArrayBuffer callers convert first.
      if (typeof image !== "string") throw new Error("Vision expects a base64/data-URL image");
      const { mediaType, data } = toImageBlock(image);
      const client = new Anthropic();
      const model = process.env.CRIMEAI_VISION_MODEL || process.env.CRIMEAI_MODEL || "claude-sonnet-4-5";

      const msg = await client.messages.create({
        model,
        max_tokens: 900,
        system: VISION_SYSTEM,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType as any, data } },
            { type: "text", text: prompt?.trim() || "What is this, and is there anything here I should be aware of for my safety?" },
          ],
        }],
      });

      const description = msg.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text).join("\n").trim();

      return { description: description || "I couldn't read anything useful from that image." };
    },
  };
}
