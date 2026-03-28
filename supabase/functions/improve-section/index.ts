import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { aiChatCompletions, getDefaultModel } from "../_shared/ai-provider.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE",
};

// ── Section-specific AI guidance ────────────────────────────────
const sectionGuidance: Record<string, string> = {
  summary:
    "Refine the existing summary into 3-4 polished sentences. Improve wording and add relevant ATS keywords. Do NOT add new claims, certifications, or experience not already mentioned.",
  professionalSummary:
    "Refine the existing summary into 3-4 polished sentences. Improve wording and add relevant ATS keywords. Do NOT add new claims, certifications, or experience not already mentioned.",
  experience:
    "Rewrite existing bullets using STAR format. Start each with strong action verbs (Led, Developed, Implemented, Achieved). If the original has numbers/metrics, keep them exact. If not, do NOT invent percentages or figures — instead restructure the sentence to highlight impact. Add relevant ATS keywords naturally.",
  skills:
    "Reorganize existing skills into categories (Technical, Soft, Tools). Use industry-standard terminology for the same skills mentioned. You may add closely related ATS keywords ONLY if they are clearly implied by the existing skills. Do NOT add unrelated skills.",
  education:
    "Format consistently with degree, institution, graduation year. Only include what is already provided. Do NOT invent GPA, honors, or coursework.",
  certifications:
    "Format in reverse chronological order. Only include what is already provided. Do NOT invent certifications, dates, or credential IDs.",
  languages:
    "List with proficiency levels. Only include languages already mentioned. Do NOT add languages the candidate did not list.",
  projects: "Improve project descriptions with impact and technologies used. Only include what is already provided.",
  bullet:
    "Improve this single resume bullet point. Make it achievement-focused using strong action verbs. Preserve all original facts. Add measurable impact phrasing if the original implies it, but do NOT invent numbers or percentages. Return ONLY the improved bullet text, no bullet character prefix.",
};

// ── Bullet micro-improvement types ──────────────────────────────
const bulletActionPrompts: Record<string, string> = {
  improve:
    "Improve this bullet point to be more impactful and achievement-focused while preserving all original facts.",
  rewrite:
    "Completely rewrite this bullet point in a more professional and impactful way while keeping the same meaning.",
  shorten: "Shorten this bullet point to be more concise while keeping the key achievement and impact.",
  achievement: "Rewrite this bullet point to focus on the achievement and result rather than just the task.",
  measurable:
    "Add measurable impact phrasing to this bullet point ONLY if the original text implies quantifiable results. Do NOT invent numbers.",
  ats: "Rewrite this bullet point with ATS-friendly keywords while preserving the original meaning and facts.",
};

function buildSystemPrompt(language: string): string {
  const langInstruction =
    language === "ar"
      ? "أجب باللغة العربية فقط. اكتب بأسلوب مهني وفقاً لمعايير ATS."
      : "Respond in English only. Write in a professional tone optimized for ATS systems.";

  return `You are an elite resume writer and ATS optimization specialist. ${langInstruction}

ABSOLUTE RULES:
1. NEVER invent, fabricate, or add information not present in the original text.
2. NEVER add fake metrics, percentages, dollar amounts, or team sizes.
3. NEVER add certifications, degrees, companies, or job titles not in the original.
4. ONLY improve wording, sentence structure, and add relevant ATS keywords.
5. If the original text is vague, make it clearer — but do NOT add specifics that weren't there.
6. Preserve all factual details exactly as provided (names, dates, numbers, companies).
7. If content is very short, improve it gently without inventing facts.`;
}

// ── Error response helper ───────────────────────────────────────
function errorResponse(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}



function normalizeLineBreaks(value: string): string {
  return String(value || "").replace(/\r/g, "").trim();
}

function splitPreservingLines(value: string): string[] {
  return normalizeLineBreaks(value).split("\n");
}

function isBulletLine(line: string): boolean {
  return /^\s*[•▪*\-]\s+/.test(line);
}

function bulletPrefix(line: string): string {
  const match = line.match(/^(\s*[•▪*\-]\s+)/);
  return match ? match[1] : "";
}

function stripBulletPrefix(line: string): string {
  return line.replace(/^\s*[•▪*\-]\s+/, "").trim();
}

function normalizeWhitespace(line: string): string {
  return line.replace(/\s+/g, " ").trim();
}

function isHeadingLike(line: string): boolean {
  const clean = normalizeWhitespace(stripBulletPrefix(line));
  if (!clean) return false;
  if (clean.length > 60) return false;
  return /^[A-Za-z0-9 &/()+,.:-]+$/.test(clean) && !/[.!?]$/.test(clean);
}

function structureSignature(value: string): string {
  return splitPreservingLines(value)
    .map((line) => {
      const clean = normalizeWhitespace(line);
      if (!clean) return "blank";
      if (isBulletLine(line)) return "bullet";
      if (isHeadingLike(line)) return "heading";
      return "text";
    })
    .join("|");
}

function shouldFallback(original: string, improved: string): boolean {
  const originalClean = normalizeLineBreaks(original);
  const improvedClean = normalizeLineBreaks(improved);
  if (!improvedClean) return true;
  if (originalClean.length > 40 && improvedClean.length < originalClean.length * 0.65) return true;
  if (structureSignature(originalClean) !== structureSignature(improvedClean)) return true;
  const originalLines = splitPreservingLines(originalClean).filter((l) => l.trim());
  const improvedLines = splitPreservingLines(improvedClean).filter((l) => l.trim());
  if (originalLines.length !== improvedLines.length) return true;
  return false;
}

async function callAi(language: string, userPrompt: string): Promise<string> {
  const response = await aiChatCompletions({
    model: getDefaultModel("fast"),
    messages: [
      { role: "system", content: buildSystemPrompt(language) },
      { role: "user", content: userPrompt },
    ],
  });

  if (!response.ok) {
    const status = response.status;
    if (status === 429) throw new Error("RATE_LIMIT");
    if (status === 402) throw new Error("CREDITS_EXHAUSTED");
    const t = await response.text();
    console.error("AI error:", status, t);
    throw new Error("AI_ERROR");
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}

// ── Enhance a single section ────────────────────────────────────
async function enhanceSingleSection(
  text: string,
  sectionType: string,
  language: string,
  options?: {
    customPrompt?: string;
    targetTitle?: string;
    targetKeywords?: string[];
  },
): Promise<string> {
  const original = normalizeLineBreaks(text);
  if (!original) return text;

  const guidance =
    sectionGuidance[sectionType] || "Improve wording and add ATS keywords. Do NOT invent new information.";
  const targetTitle = options?.targetTitle?.trim();
  const targetKeywords = (options?.targetKeywords || []).filter(Boolean);

  const lines = splitPreservingLines(original);
  const hasStructure = lines.filter((line) => line.trim()).length > 1;

  const structuredPromptBase = options?.customPrompt?.trim()
    ? `${options.customPrompt.trim()}

REFERENCE CONTEXT:
- Section type: ${sectionType}
- Target role: ${targetTitle || "Not specified"}
- Target keywords: ${targetKeywords.join(", ") || "None provided"}`
    : `Improve this "${sectionType}" section of a resume.

SECTION-SPECIFIC GUIDANCE:
${guidance}

TARGET ROLE:
${targetTitle || "Not specified"}

TARGET KEYWORDS:
${targetKeywords.join(", ") || "None provided"}

STRICT RULES:
- Keep the SAME structure (same line count, same bullets, same order)
- DO NOT merge lines
- DO NOT remove lines
- DO NOT reorder content
- DO NOT change companies, job titles, dates, or facts
- Use target keywords NATURALLY inside existing lines only
- NEVER force keywords into unnatural sentences
- NEVER fabricate metrics, achievements, certifications, or experience
- ONLY improve wording inside each line`;

  if (hasStructure) {
    const improvedLines: string[] = [];

    for (const line of lines) {
      if (!line.trim()) {
        improvedLines.push(line);
        continue;
      }

      if (isHeadingLike(line)) {
        improvedLines.push(line);
        continue;
      }

      const prefix = isBulletLine(line) ? bulletPrefix(line) : "";
      const lineBody = isBulletLine(line) ? stripBulletPrefix(line) : normalizeWhitespace(line);

      const linePrompt = `${structuredPromptBase}

IMPORTANT:
- Improve ONLY this one line
- Keep the same meaning and level of specificity
- Return ONLY the improved line text
- No bullet character prefix
- No explanations

ORIGINAL LINE:
${lineBody}`;

      try {
        const improvedLine = await callAi(language, linePrompt);
        const safeLine = normalizeWhitespace(improvedLine) || lineBody;
        improvedLines.push(prefix ? `${prefix}${safeLine}` : safeLine);
      } catch (err) {
        improvedLines.push(line);
      }
    }

    const improvedStructured = improvedLines.join("\n").trim();
    if (shouldFallback(original, improvedStructured)) return original;
    return improvedStructured;
  }

  const userPrompt = `${structuredPromptBase}

IMPORTANT:
- Keep the same structure and approximate length
- Improve wording only
- Return ONLY the improved text. No explanations, headers, or markdown formatting.

ORIGINAL TEXT:
${original}`;

  const improved = await callAi(language, userPrompt);
  if (shouldFallback(original, improved)) return original;
  return improved || original;
}


// ── Enhance a single bullet ─────────────────────────────────────
async function enhanceBullet(text: string, action: string, language: string): Promise<string> {
  const actionPrompt = bulletActionPrompts[action] || bulletActionPrompts.improve;

  const langInstruction =
    language === "ar" ? "أجب باللغة العربية فقط. حافظ على اللغة العربية." : "Respond in English only.";

  const userPrompt = `${actionPrompt}

${langInstruction}

STRICT RULES:
- Return ONLY the improved bullet text
- No bullet character prefix (no • or -)
- No explanations, headers, or markdown
- NEVER invent facts not in the original
- Keep the same language as the original

ORIGINAL BULLET:
${text}`;

  const result = (await callAi(language, userPrompt)) || text;
  // Remove leading bullet character if AI added one
  return result.replace(/^[•▪*\-]\s*/, "").trim();
}

// ── Main handler ────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const {
      text,
      sectionType,
      language,
      batchSections,
      bulletText,
      bulletAction,
      sectionPrompt,
      optimizeAllPrompt,
      batchPrompts,
      targetTitle,
      targetKeywords,
    } = body;

    // ── BULLET MODE: enhance a single bullet point ──────────────
    if (bulletText && typeof bulletText === "string") {
      console.log(`Bullet enhancement requested: action=${bulletAction || "improve"}`);
      const improved = await enhanceBullet(bulletText, bulletAction || "improve", language || "en");
      return new Response(JSON.stringify({ improved_bullet: improved }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── BATCH MODE: enhance multiple sections independently ─────
    if (batchSections && typeof batchSections === "object") {
      console.log("Batch section enhancement requested:", Object.keys(batchSections));

      const results: Record<string, string> = {};
      const errors: Record<string, string> = {};

      for (const [section, content] of Object.entries(batchSections as Record<string, string>)) {
        if (!content || !String(content).trim()) {
          results[section] = "";
          continue;
        }

        try {
          console.log(`Enhancing section: ${section} (${String(content).length} chars)`);
          const customPrompt =
            (batchPrompts && typeof batchPrompts === "object" && batchPrompts[section]) ||
            optimizeAllPrompt ||
            sectionPrompt;
          const improved = await enhanceSingleSection(String(content), section, language || "en", {
            customPrompt: typeof customPrompt === "string" ? customPrompt : undefined,
            targetTitle: typeof targetTitle === "string" ? targetTitle : undefined,
            targetKeywords: Array.isArray(targetKeywords) ? targetKeywords.map(String) : [],
          });
          results[section] = improved;
          console.log(`Section ${section} enhanced successfully`);
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : "Unknown error";
          console.error(`Section ${section} enhancement failed:`, errMsg);

          if (errMsg === "RATE_LIMIT") {
            return errorResponse(429, "Rate limit exceeded, please try again later.");
          }
          if (errMsg === "CREDITS_EXHAUSTED") {
            return errorResponse(402, "AI credits exhausted. Please add credits.");
          }

          errors[section] = errMsg;
          results[section] = String(content);
        }
      }

      return new Response(
        JSON.stringify({ improved_sections: results, errors: Object.keys(errors).length ? errors : undefined }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── SINGLE SECTION MODE ─────────────────────────────────────
    if (!text?.trim()) {
      return errorResponse(400, "No text provided");
    }

    const improved = await enhanceSingleSection(text, sectionType || "general", language || "en", {
      customPrompt:
        typeof sectionPrompt === "string"
          ? sectionPrompt
          : typeof optimizeAllPrompt === "string"
            ? optimizeAllPrompt
            : undefined,
      targetTitle: typeof targetTitle === "string" ? targetTitle : undefined,
      targetKeywords: Array.isArray(targetKeywords) ? targetKeywords.map(String) : [],
    });

    return new Response(JSON.stringify({ improved_text: improved }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("improve-section error:", e);

    if (e instanceof Error) {
      if (e.message === "RATE_LIMIT") return errorResponse(429, "Rate limit exceeded, please try again later.");
      if (e.message === "CREDITS_EXHAUSTED") return errorResponse(402, "AI credits exhausted. Please add credits.");
    }

    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
