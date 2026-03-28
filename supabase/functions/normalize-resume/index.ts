import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { aiChatCompletions, getDefaultModel } from "../_shared/ai-provider.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE",
};

const tool = {
  type: "function",
  function: {
    name: "submit_structured_resume",
    description: "Submit structured resume data extracted from raw text.",
    parameters: {
      type: "object",
      properties: {
        full_name: { type: "string" },
        job_title: { type: "string" },
        contact_info: {
          type: "object",
          properties: {
            email: { type: "string" },
            phone: { type: "string" },
            location: { type: "string" },
            linkedin: { type: "string" },
          },
          required: ["email", "phone"],
          additionalProperties: false,
        },
        summary: { type: "string" },
        work_experience: { type: "array", items: { type: "object" } },
        skills: { type: "array", items: { type: "string" } },
        education: { type: "array", items: { type: "object" } },
        certifications: { type: "array", items: { type: "string" } },
        projects: { type: "array", items: { type: "object" } },
        languages: { type: "array", items: { type: "string" } },
        detected_language: { type: "string", enum: ["en", "ar", "mixed"] },
      },
      required: ["full_name", "contact_info", "detected_language"],
      additionalProperties: false,
    },
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { rawText, language } = await req.json();
    const langInstruction = language === "ar" ? "Respond in Arabic." : "Respond in English.";

    const response = await aiChatCompletions({
      model: getDefaultModel("json"),
      messages: [
        {
          role: "system",
          content: `You are an expert resume parser. ${langInstruction} Do not invent facts. Return missing_information when unclear.`,
        },
        {
          role: "user",
          content: `Parse this raw resume text into structured sections.\n\n${rawText}`,
        },
      ],
      tools: [tool],
      tool_choice: { type: "function", function: { name: "submit_structured_resume" } },
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("normalize-resume provider error:", response.status, text);
      return new Response(JSON.stringify({ error: "AI normalization failed" }), {
        status: response.status === 429 ? 429 : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) throw new Error("No structured data returned from AI");

    const structured = typeof toolCall.function.arguments === "string"
      ? JSON.parse(toolCall.function.arguments)
      : toolCall.function.arguments;

    return new Response(JSON.stringify(structured), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("normalize-resume error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
