import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { aiChatCompletions, getDefaultModel } from "../_shared/ai-provider.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE",
};

const toolSchema = {
  type: "function" as const,
  function: {
    name: "submit_questions",
    description: "Return structured interview questions for the candidate.",
    parameters: {
      type: "object",
      properties: {
        questions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              category: { type: "string" },
              question: { type: "string" },
              why_it_matters: { type: "string" },
              strong_answer_signals: { type: "string" },
            },
            required: ["category", "question", "why_it_matters", "strong_answer_signals"],
          },
        },
      },
      required: ["questions"],
    },
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { candidateText, candidateName, candidateTitle, language } = await req.json();
    if (!candidateText) {
      return new Response(JSON.stringify({ error: "Missing candidateText" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const lang = language === "ar" ? "Arabic" : "English";
    const response = await aiChatCompletions({
      model: getDefaultModel("json"),
      messages: [
        {
          role: "system",
          content: `You are a senior interviewer and hiring expert. Respond in ${lang}. Generate specific questions grounded only in the CV content.`,
        },
        {
          role: "user",
          content: `Generate interview questions for this candidate.\nName: ${candidateName || "Unknown"}\nTitle: ${candidateTitle || "Not specified"}\n\nCV Content:\n${String(candidateText).substring(0, 6000)}`,
        },
      ],
      tools: [toolSchema],
      tool_choice: { type: "function", function: { name: "submit_questions" } },
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("recruiter-generate-questions provider error:", response.status, text);
      return new Response(JSON.stringify({ error: "Question generation failed" }), { status: response.status === 429 ? 429 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const result = await response.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) throw new Error("No tool call in response");

    const parsed = typeof toolCall.function.arguments === "string" ? JSON.parse(toolCall.function.arguments) : toolCall.function.arguments;
    return new Response(JSON.stringify({ questions: parsed.questions }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("recruiter-generate-questions error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
