import { createAnthropic } from "@ai-sdk/anthropic";

export const VERIFICATION_MODEL = "claude-sonnet-4-6";

export function getVerificationModel() {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }

  const anthropic = createAnthropic({ apiKey });
  return anthropic(VERIFICATION_MODEL);
}
