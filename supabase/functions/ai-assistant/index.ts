import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { aiChatCompletions, getDefaultModel } from "../_shared/ai-provider.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are Talentry's AI Career Assistant — a friendly, knowledgeable guide that helps users get the most out of the Talentry platform.

TALENTRY FEATURES (only reference these — never invent features):
1. CV Upload & Parsing
2. CV Analysis
3. Resume Enhancement
4. Resume Builder
5. Job Search
6. Smart Apply
7. SmartSend (Marketing)
8. Interview Practice
9. Points System
10. Recruiter Portal

RULES:
- Be concise, warm, and professional.
- Never invent unsupported features.
- Keep responses under 150 words.
- End with helpful action buttons when relevant using [ACTION:/route:Label].`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, userContext } = await req.json();

    let contextStr = "- No user context available.\n";
    if (userContext) {
      contextStr = [
        `- Has resume uploaded: ${userContext.hasResume ? "Yes" : "No"}`,
        `- Has analysis done: ${userContext.hasAnalysis ? "Yes" : "No"}`,
        userContext.atsScore != null ? `- Latest ATS score: ${userContext.atsScore}/100` : null,
        userContext.jobTitle ? `- Detected job title: ${userContext.jobTitle}` : null,
        userContext.skills ? `- Key skills: ${userContext.skills}` : null,
        `- Has enhanced resume: ${userContext.hasEnhanced ? "Yes" : "No"}`,
        `- Has used job search: ${userContext.hasSearchedJobs ? "Yes" : "No"}`,
      ].filter(Boolean).join("\n");
    }

    const response = await aiChatCompletions({
      model: getDefaultModel("chat"),
      messages: [
        { role: "system", content: `${SYSTEM_PROMPT}\n\nUSER CONTEXT:\n${contextStr}` },
        ...(Array.isArray(messages) ? messages : []),
      ],
      stream: true,
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("ai-assistant provider error:", response.status, text);
      return new Response(JSON.stringify({ error: "AI service unavailable" }), {
        status: response.status === 429 ? 429 : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("ai-assistant error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
