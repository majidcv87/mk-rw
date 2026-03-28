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
    name: "submit_evaluation",
    description: "Submit the evaluation of a candidate's interview answer.",
    parameters: {
      type: "object",
      properties: {
        score: { type: "number" },
        strengths: { type: "array", items: { type: "string" } },
        improvements: { type: "array", items: { type: "string" } },
        ideal_answer: { type: "string" },
        confidence_assessment: { type: "string" },
        relevance_assessment: { type: "string" },
      },
      required: ["score", "strengths", "improvements", "ideal_answer", "confidence_assessment", "relevance_assessment"],
      additionalProperties: false,
    },
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { job_title, cv_summary, question, transcript, language } = await req.json();
    if (!question || !transcript) {
      return new Response(JSON.stringify({ error: "Missing question or transcript" }), {
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
          content: `You are an expert HR interviewer and interview coach. Respond in ${lang}. Be practical, concise, and honest.`,
        },
        {
          role: "user",
          content: `Job Title: ${job_title || "General"}\nCandidate CV Summary: ${cv_summary || "Not provided"}\nInterview Question: ${question}\nCandidate Answer: ${transcript}`,
        },
      ],
      tools: [toolSchema],
      tool_choice: { type: "function", function: { name: "submit_evaluation" } },
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("evaluate-interview-answer provider error:", response.status, text);
      return new Response(JSON.stringify({ error: "AI evaluation failed" }), {
        status: response.status === 429 ? 429 : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      return new Response(JSON.stringify({ error: "No evaluation returned" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const evaluation = typeof toolCall.function.arguments === "string" ? JSON.parse(toolCall.function.arguments) : toolCall.function.arguments;
    return new Response(JSON.stringify(evaluation), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("evaluate-interview-answer error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
