import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { aiChatCompletions, getDefaultModel } from "../_shared/ai-provider.ts";

// ─── CORS ────────────────────────────────────────────────────
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE",
};

// ─── Types ───────────────────────────────────────────────────
type JsonRecord = Record<string, unknown>;

const SECTION_KEYS = [
  "name",
  "job_title",
  "contact",
  "summary",
  "experience",
  "skills",
  "education",
  "certifications",
  "projects",
  "languages",
] as const;

// ─── Helpers ─────────────────────────────────────────────────
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isPlainObject(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * normalizeToText — converts ANY value (string | number | array | object | null)
 * to a plain string. This prevents "rebuilt[key]?.trim is not a function" errors
 * when the AI returns unexpected types.
 */
function normalizeToText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value).trim();

  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeToText(item))
      .filter(Boolean)
      .join("\n")
      .trim();
  }

  if (isPlainObject(value)) {
    const preferredOrder = [
      "title",
      "name",
      "role",
      "company",
      "institution",
      "date",
      "period",
      "description",
      "details",
    ];
    const preferred = preferredOrder.map((k) => normalizeToText(value[k])).filter(Boolean);
    const fallback = Object.values(value)
      .map((v) => normalizeToText(v))
      .filter(Boolean);
    return (preferred.length ? preferred : fallback).join("\n").trim();
  }

  return "";
}

function normalizeStructuredResume(value: unknown): JsonRecord {
  if (!isPlainObject(value)) return {};
  const normalized: JsonRecord = {};
  for (const [key, raw] of Object.entries(value)) {
    normalized[key] = normalizeToText(raw);
  }
  return normalized;
}

// ─── Auth helper ─────────────────────────────────────────────
async function requireUser(authHeader: string | null) {
  if (!authHeader) throw new Error("Unauthorized");

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Unauthorized");
  return user;
}

// ─── Main ────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Verify authenticated user
    await requireUser(req.headers.get("Authorization"));

    const { resumeText, structuredResume, targetJobTitle, targetJobDescription, weaknesses, language, tone, focus } =
      await req.json();

    const isArabic = language === "ar";

    // Normalize structured resume — all values become plain strings
    const normalizedStructuredResume = normalizeStructuredResume(structuredResume);

    // Build resume context text
    let resumeContext = "";
    if (Object.keys(normalizedStructuredResume).length) {
      resumeContext = Object.entries(normalizedStructuredResume)
        .filter(([, v]) => typeof v === "string" && (v as string).trim())
        .map(([k, v]) => `### ${k}\n${v}`)
        .join("\n\n");
    }

    const fallbackResumeText = normalizeToText(resumeText);
    if (!resumeContext && fallbackResumeText) resumeContext = fallbackResumeText;
    if (!resumeContext) return json({ error: "No resume data provided" }, 400);

    // Build optional blocks
    const normalizedWeaknesses = Array.isArray(weaknesses)
      ? weaknesses.map((w) => normalizeToText(w)).filter(Boolean)
      : [];
    const weaknessesBlock = normalizedWeaknesses.length
      ? `\n\nPrevious CV analysis found these weaknesses:\n${normalizedWeaknesses.map((w) => `- ${w}`).join("\n")}`
      : "";

    const normalizedJobTitle = normalizeToText(targetJobTitle);
    const normalizedJobDesc = normalizeToText(targetJobDescription);
    const jobBlock =
      normalizedJobTitle || normalizedJobDesc
        ? `\n\nTarget position:\n${normalizedJobTitle ? `Job Title: ${normalizedJobTitle}` : ""}${normalizedJobDesc ? `\nJob Description:\n${normalizedJobDesc}` : ""}`
        : "";

    const toneInstruction = normalizeToText(tone) ? `\n- Writing tone should be ${normalizeToText(tone)}` : "";
    const focusInstruction =
      Array.isArray(focus) && focus.length
        ? `\n- Give extra attention to these areas: ${focus
            .map((f) => normalizeToText(f))
            .filter(Boolean)
            .join(", ")}`
        : "";

    // Build prompts
    const systemPrompt = `You are a senior ATS resume writer and professional CV strategist with 15+ years of experience.
Your task: Rewrite the resume into a HIGH-QUALITY, ATS-OPTIMIZED version.
Write ${isArabic ? "in Arabic" : "in English"}.

STRICT RULES (MANDATORY):
- DO NOT invent any experience, job titles, companies, dates, certifications, or skills not clearly present or implied
- DO NOT fabricate numbers or achievements
- DO NOT exaggerate beyond the source
- If information is missing, leave the field as an empty string

WHAT YOU ARE ALLOWED TO DO:
- Improve wording, clarity, structure, and formatting
- Rewrite sentences professionally
- Convert responsibilities into stronger impact statements WITHOUT adding fake data
- Improve ATS keyword alignment based on job description if provided
- Organize sections properly
- Make experience more impactful using the STAR method where applicable

SPECIAL LOGIC:
- If summary is weak → rewrite professionally (max 4 sentences)
- If experience lacks impact → improve phrasing ONLY, never invent achievements
- If skills are scattered → organize into a clean comma-separated list (NO paragraphs)
- If job description exists → align keywords naturally
- If something is unclear → do NOT guess${jobBlock ? "\n- Tailor content towards the target position" : ""}${weaknessesBlock ? "\n- Address the identified ATS weaknesses" : ""}${toneInstruction}${focusInstruction}

OUTPUT FORMAT (STRICT):
Return ONLY a valid JSON object with these exact keys: name, job_title, contact, summary, experience, skills, education, certifications, projects, languages.
Every value MUST be a plain string. Do not return arrays, nested objects, or markdown.
No markdown fences, no explanation, no comments, no text outside JSON.`;

    const userPrompt = `Here is the resume to rebuild:\n\n${resumeContext}${weaknessesBlock}${jobBlock}`;

    // Call AI
    const response = await aiChatCompletions({
      model: getDefaultModel("json"),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.4,
    });

    if (!response.ok) {
      if (response.status === 429) return json({ error: "Rate limit exceeded. Please try again later." }, 429);
      if (response.status === 402) return json({ error: "Payment required. Please add credits." }, 402);
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      throw new Error("AI gateway error");
    }

    const aiResult = await response.json();
    const raw = aiResult.choices?.[0]?.message?.content || "";

    // Parse AI JSON response
    let rebuilt: JsonRecord;
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found");
      rebuilt = JSON.parse(jsonMatch[0]);
    } catch {
      console.error("Failed to parse AI response:", raw.slice(0, 500));
      return json({ error: "Failed to parse AI response" }, 500);
    }

    // Normalize ALL values — this is the core fix for ".trim is not a function"
    const normalizedRebuilt: JsonRecord = {};
    for (const key of SECTION_KEYS) {
      normalizedRebuilt[key] = normalizeToText(rebuilt[key]);
    }

    // Validate skills (should not be a long paragraph)
    const skillsText = normalizeToText(normalizedRebuilt.skills);
    if (skillsText && skillsText.split("\n").some((line) => line.length > 200)) {
      normalizedRebuilt.skills = normalizeToText(normalizedStructuredResume.skills);
    }

    // Validate summary length
    const summaryText = normalizeToText(normalizedRebuilt.summary);
    if (summaryText.length > 1200) {
      normalizedRebuilt.summary = summaryText.slice(0, 1200).trim();
    }

    // Reject if output is too short
    const totalLen = Object.values(normalizedRebuilt)
      .map((v) => normalizeToText(v))
      .join("").length;
    if (totalLen < 100) {
      return json({ error: "AI produced insufficient output" }, 500);
    }

    // Fallback empty fields to original
    for (const key of SECTION_KEYS) {
      const rebuiltValue = normalizeToText(normalizedRebuilt[key]);
      const originalValue = normalizeToText(normalizedStructuredResume[key]);
      if (!rebuiltValue && originalValue) {
        normalizedRebuilt[key] = originalValue;
      }
    }

    return json({ rebuilt: normalizedRebuilt, model: "google/gemini-3-flash-preview" });
  } catch (e) {
    console.error("rebuild-resume error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
