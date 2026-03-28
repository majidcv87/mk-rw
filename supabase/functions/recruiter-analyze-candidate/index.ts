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
    name: "submit_recruiter_report",
    description: "Return a strict recruiter-focused candidate evaluation report for hiring decisions.",
    parameters: {
      type: "object",
      properties: {
        executive_hiring_summary: { type: "object" },
        scoring_table: { type: "object" },
        strengths: { type: "array", items: { type: "string" } },
        risks: { type: "array", items: { type: "string" } },
        missing_requirements: { type: "array", items: { type: "string" } },
        hiring_recommendation: { type: "string" },
        interview_focus_areas: { type: "array", items: { type: "string" } },
        why_this_candidate: { type: "array", items: { type: "string" } },
        why_not_this_candidate: { type: "array", items: { type: "string" } },
      },
      required: ["executive_hiring_summary", "scoring_table", "strengths", "risks", "missing_requirements", "hiring_recommendation", "interview_focus_areas", "why_this_candidate", "why_not_this_candidate"],
      additionalProperties: false,
    },
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { candidateText, candidateName, candidateTitle, language } = await req.json();
    if (!candidateText) {
      return new Response(JSON.stringify({ error: "Missing candidateText" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const lang = language === "ar" ? "Arabic" : "English";
    const response = await aiChatCompletions({
      model: getDefaultModel("json"),
      messages: [
        {
          role: "system",
          content: `You are a Senior Recruitment Manager and ATS evaluator. Respond in ${lang}. Evaluate ONLY evidence present in the CV.`,
        },
        {
          role: "user",
          content: `Analyze this candidate for a recruiter dashboard.\nCandidate Name: ${candidateName || "Unknown"}\nCurrent Title: ${candidateTitle || "Unknown"}\n\nCV Content:\n${String(candidateText).substring(0, 12000)}`,
        },
      ],
      tools: [toolSchema],
      tool_choice: { type: "function", function: { name: "submit_recruiter_report" } },
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("recruiter-analyze-candidate provider error:", response.status, text);
      return new Response(JSON.stringify({ error: "Recruiter analysis failed" }), {
        status: response.status === 429 ? 429 : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await response.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) throw new Error("No tool call in response");

    const report = typeof toolCall.function.arguments === "string" ? JSON.parse(toolCall.function.arguments) : toolCall.function.arguments;

    return new Response(JSON.stringify({ report }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("recruiter-analyze-candidate error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
