export function getDefaultModel(kind: "json" | "chat" | "fast" = "json") {
  if (kind === "chat") return Deno.env.get("AI_CHAT_MODEL") || "gpt-4o-mini";
  if (kind === "fast") return Deno.env.get("AI_FAST_MODEL") || "gpt-4o-mini";
  return Deno.env.get("AI_JSON_MODEL") || "gpt-4o-mini";
}

export async function aiChatCompletions(body: Record<string, unknown>) {
  const openAiKey = Deno.env.get("OPENAI_API_KEY");
  const openRouterKey = Deno.env.get("OPENROUTER_API_KEY");

  let url = "";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (openRouterKey) {
    url = "https://openrouter.ai/api/v1/chat/completions";
    headers.Authorization = `Bearer ${openRouterKey}`;
    headers["HTTP-Referer"] = Deno.env.get("APP_BASE_URL") || "https://talentry.app";
    headers["X-Title"] = "Talentry";
  } else if (openAiKey) {
    url = "https://api.openai.com/v1/chat/completions";
    headers.Authorization = `Bearer ${openAiKey}`;
  } else {
    throw new Error("Missing AI provider key. Set OPENAI_API_KEY or OPENROUTER_API_KEY in Supabase secrets.");
  }

  return fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}
