import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { aiChatCompletions, getDefaultModel } from "../_shared/ai-provider.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { text, language } = await req.json();
    if (!text?.trim()) throw new Error("No text provided");

    const langInstruction = language === "ar"
      ? "أعد صياغة النص باللغة العربية بأسلوب مهني ومتوافق مع أنظمة ATS."
      : "Rephrase in English with a professional ATS-optimized tone.";

    const response = await aiChatCompletions({
      model: getDefaultModel("fast"),
      messages: [
        {
          role: "system",
          content: `You are an elite resume writer specializing in ATS optimization. ${langInstruction} Never invent facts. Return only the rewritten text.`,
        },
        {
          role: "user",
          content: `Rephrase this text professionally:\n\n${text}`,
        },
      ],
    });

    if (!response.ok) {
      const body = await response.text();
      console.error("rephrase-selection provider error:", response.status, body);
      return new Response(JSON.stringify({ error: "AI rephrase failed" }), {
        status: response.status === 429 ? 429 : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const rephrased = data.choices?.[0]?.message?.content;
    if (!rephrased) throw new Error("No rephrased text returned");

    return new Response(JSON.stringify({ rephrased: rephrased.trim() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("rephrase-selection error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
