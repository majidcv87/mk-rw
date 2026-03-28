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
    name: "generate_email",
    description: "Return the generated job application email, cover letter, and signature.",
    parameters: {
      type: "object",
      properties: {
        subject: { type: "string" },
        body: { type: "string" },
        cover_letter: { type: "string" },
        signature: { type: "string" },
      },
      required: ["subject", "body", "cover_letter", "signature"],
      additionalProperties: false,
    },
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { jobTitle, industry, companyName, language, tone, resumeContext, profileContext, analysisContext, recipientEmail, recruiterName } = await req.json();

    const langInstruction = language === "ar"
      ? "اكتب الرسالة وخطاب التقديم باللغة العربية الفصحى. استخدم أسلوباً مهنياً ورسمياً."
      : "Write the email and cover letter in English. Use a professional tone.";

    const toneInstruction = tone === "confident"
      ? "Use a confident, assertive tone that highlights achievements and unique value."
      : tone === "concise"
      ? "Keep the email brief and to the point, no more than 5 sentences in the body."
      : "Use a formal, polite, and professional tone.";

    const systemPrompt = `You are an expert career consultant, professional email writer, and cover letter specialist. ${langInstruction} ${toneInstruction}
Never invent facts. Use only the candidate data provided.`;

    const userPrompt = `Generate a job application email AND a short cover letter.
Job title: ${jobTitle || "Not provided"}
Industry: ${industry || "Not provided"}
Company: ${companyName || "Not provided"}
Recruiter: ${recruiterName || "Not provided"}
Recipient email: ${recipientEmail || "Not provided"}

Profile context:
${profileContext || ""}

Resume context:
${resumeContext || ""}

Analysis context:
${analysisContext || ""}`;

    const response = await aiChatCompletions({
      model: getDefaultModel("json"),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      tools: [tool],
      tool_choice: { type: "function", function: { name: "generate_email" } },
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("generate-email provider error:", response.status, text);
      return new Response(JSON.stringify({ error: "AI email generation failed" }), {
        status: response.status === 429 ? 429 : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) throw new Error("No tool call in response");

    const result = typeof toolCall.function.arguments === "string"
      ? JSON.parse(toolCall.function.arguments)
      : toolCall.function.arguments;

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-email error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
