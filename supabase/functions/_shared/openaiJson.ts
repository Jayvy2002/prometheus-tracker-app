/** Compact OpenAI JSON helper. Same latency class as analyze-product / verify-exercise. */

export const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";
export const DEFAULT_OPENAI_MODEL = "gpt-5.6-luna";
export const OPENAI_TIMEOUT_MS = 30_000;

export function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

/** GPT-5 / o-series reject `max_tokens` and often `temperature`. */
export function usesMaxCompletionTokens(model: string): boolean {
  const id = model.toLowerCase();
  return id.startsWith("gpt-5") || /^o[1-9]/.test(id);
}

export function resolveOpenAiModel(override?: string): string {
  return (override || Deno.env.get("OPENAI_MODEL") || DEFAULT_OPENAI_MODEL).trim() || DEFAULT_OPENAI_MODEL;
}

export function chatCompletionsBody(opts: {
  model: string;
  messages: unknown[];
  maxTokens?: number;
  temperature?: number;
}): Record<string, unknown> {
  const maxTokens = opts.maxTokens ?? 1600;
  if (usesMaxCompletionTokens(opts.model)) {
    return {
      model: opts.model,
      messages: opts.messages,
      max_completion_tokens: maxTokens,
    };
  }
  return {
    model: opts.model,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.2,
    max_tokens: maxTokens,
  };
}

function messageText(message: Record<string, unknown>): string {
  const content = message.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map(part => {
      if (typeof part === "string") return part;
      const row = asObject(part);
      return typeof row.text === "string" ? row.text : "";
    })
    .join("");
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
  const model = resolveOpenAiModel(opts?.model);
  try {
    console.log(JSON.stringify({
      event: "openai_chat",
      model,
      max_tokens: opts?.maxTokens ?? 1600,
    }));
    const res = await fetch(OPENAI_CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(chatCompletionsBody({
        model,
        messages,
        maxTokens: opts?.maxTokens,
        temperature: opts?.temperature,
      })),
      signal: AbortSignal.timeout(opts?.timeoutMs ?? OPENAI_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const body = asObject(await res.json());
    const choices = Array.isArray(body.choices) ? body.choices : [];
    const message = asObject(asObject(choices[0]).message);
    return parseLlmJson(messageText(message));
  } catch {
    return null;
  }
}
