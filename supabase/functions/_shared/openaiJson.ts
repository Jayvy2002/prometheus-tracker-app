/** Compact OpenAI JSON helper. Same latency class as analyze-product / verify-exercise. */

export const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";
export const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
export const OPENAI_TIMEOUT_MS = 20_000;

export function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function parseLlmJson(text: string): Record<string, unknown> | null {
  const trimmed = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/```$/, "").trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed: unknown = JSON.parse(trimmed.slice(start, end + 1));
    return asObject(parsed);
  } catch {
    return null;
  }
}

export async function openaiJson(
  apiKey: string,
  messages: Array<{ role: string; content: string }>,
  opts?: { maxTokens?: number; timeoutMs?: number; model?: string; temperature?: number },
): Promise<Record<string, unknown> | null> {
  const model = (opts?.model || Deno.env.get("OPENAI_MODEL") || DEFAULT_OPENAI_MODEL).trim() || DEFAULT_OPENAI_MODEL;
  try {
    const res = await fetch(OPENAI_CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: opts?.temperature ?? 0.2,
        max_tokens: opts?.maxTokens ?? 1600,
        messages,
      }),
      signal: AbortSignal.timeout(opts?.timeoutMs ?? OPENAI_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const body = asObject(await res.json());
    const choices = Array.isArray(body.choices) ? body.choices : [];
    const message = asObject(asObject(choices[0]).message);
    const content = typeof message.content === "string" ? message.content : "";
    return parseLlmJson(content);
  } catch {
    return null;
  }
}
