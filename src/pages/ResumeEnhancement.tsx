import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/i18n/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { deductPoints } from "@/lib/points";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { StructuredResume, SECTION_ORDER, EMPTY_STRUCTURED } from "@/lib/resume-utils";
import {
  Sparkles,
  FileText,
  Loader2,
  Save,
  Download,
  RotateCcw,
  CheckCircle2,
  Wand2,
  Target,
  Globe,
  Briefcase,
  ArrowLeft,
  ArrowRight,
  Zap,
  Eye,
  Edit3,
  Upload,
} from "lucide-react";

/* ─── Types ─── */
interface ResumeOption {
  id: string;
  label: string;
  type: "uploaded" | "generated";
  date: string;
}

type Step = 1 | 2 | 3 | 4;

type Tone = "formal" | "balanced" | "creative";
type FocusKey = "experience" | "skills" | "leadership" | "achievements";

interface RewriteOptions {
  targetJobTitle: string;
  targetJobDescription: string;
  tone: Tone;
  language: "ar" | "en";
  focus: FocusKey[];
}

/* ─── Helpers ─── */
const SECTION_AR: Record<keyof StructuredResume, string> = {
  name: "الاسم",
  job_title: "المسمى الوظيفي",
  contact: "معلومات التواصل",
  summary: "الملخص المهني",
  experience: "الخبرة العملية",
  skills: "المهارات",
  education: "التعليم",
  certifications: "الشهادات والدورات",
  projects: "المشاريع",
  languages: "اللغات",
};

const SECTION_EN: Record<keyof StructuredResume, string> = {
  name: "Full Name",
  job_title: "Job Title",
  contact: "Contact Info",
  summary: "Professional Summary",
  experience: "Work Experience",
  skills: "Skills",
  education: "Education",
  certifications: "Certifications",
  projects: "Projects",
  languages: "Languages",
};

/**
 * normalizeSkillsText — cleans, deduplicates, and formats skills into a bullet list.
 */
function normalizeSkillsText(text: string): string {
  if (!text) return "";
  // Split by newline, comma, pipe, semicolon, Arabic comma/semicolon
  const raw = text.split(/[\n,|;،؛]+/);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of raw) {
    const cleaned = item.trim().replace(/^[•\-▪*]\s*/, "");
    if (!cleaned) continue;
    const lower = cleaned.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    result.push(`• ${cleaned}`);
  }
  return result.join("\n");
}

/**
 * safeStr — mirrors normalizeToText() in rebuild-resume edge function.
 * Converts any value (string | number | array | object | null) to a plain string.
 * Prevents "rebuilt[key]?.trim is not a function" when AI returns non-string values.
 * Accepts optional key to apply skills normalization.
 */
function safeStr(value: unknown, key?: string): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (key === "skills") return normalizeSkillsText(trimmed);
    return trimmed;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value).trim();
  if (Array.isArray(value)) {
    const joined = value
      .map((item) => safeStr(item))
      .filter(Boolean)
      .join("\n")
      .trim();
    if (key === "skills") return normalizeSkillsText(joined);
    return joined;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const preferredKeys = [
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
    const preferred = preferredKeys.map((k) => safeStr(obj[k])).filter(Boolean);
    const fallback = Object.values(obj)
      .map((v) => safeStr(v))
      .filter(Boolean);
    const joined = (preferred.length ? preferred : fallback).join("\n").trim();
    if (key === "skills") return normalizeSkillsText(joined);
    return joined;
  }
  return "";
}

function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/* ─── Progress Steps ─── */
const STEPS_AR = ["اختيار السيرة", "تخصيص الطلب", "كتابة الذكاء الاصطناعي", "المراجعة والتنزيل"];
const STEPS_EN = ["Select Resume", "Customize", "AI Writing", "Review & Download"];

const TONE_OPTIONS: { value: Tone; labelAr: string; labelEn: string; icon: string }[] = [
  { value: "formal", labelAr: "رسمي", labelEn: "Formal", icon: "👔" },
  { value: "balanced", labelAr: "متوازن", labelEn: "Balanced", icon: "⚖️" },
  { value: "creative", labelAr: "إبداعي", labelEn: "Creative", icon: "✨" },
];

const FOCUS_OPTIONS: { value: FocusKey; labelAr: string; labelEn: string }[] = [
  { value: "experience", labelAr: "إبراز الخبرة", labelEn: "Highlight Experience" },
  { value: "skills", labelAr: "المهارات التقنية", labelEn: "Technical Skills" },
  { value: "leadership", labelAr: "القيادة والإدارة", labelEn: "Leadership" },
  { value: "achievements", labelAr: "الإنجازات والأرقام", labelEn: "Achievements & Numbers" },
];

/* ─── Loading Stages ─── */
const LOADING_STAGES_AR = [
  "جاري قراءة سيرتك الذاتية...",
  "تحليل المحتوى والخبرات...",
  "صياغة الملخص المهني...",
  "تحسين وصف الخبرات...",
  "مراجعة الكلمات المفتاحية للـ ATS...",
  "اللمسات الأخيرة...",
];
const LOADING_STAGES_EN = [
  "Reading your resume...",
  "Analyzing content and experience...",
  "Crafting professional summary...",
  "Improving experience descriptions...",
  "Optimizing ATS keywords...",
  "Final touches...",
];

/* ══════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════ */
const ResumeEnhancement = () => {
  const { user } = useAuth();
  const { language } = useLanguage();
  const ar = language === "ar";

  /* State */
  const [step, setStep] = useState<Step>(1);
  const [resumes, setResumes] = useState<ResumeOption[]>([]);
  const [selectedResumeId, setSelectedResumeId] = useState<string>("");
  const [loadingResumes, setLoadingResumes] = useState(true);

  const [sourceData, setSourceData] = useState<StructuredResume | null>(null);
  const [sourceText, setSourceText] = useState("");

  const [options, setOptions] = useState<RewriteOptions>({
    targetJobTitle: "",
    targetJobDescription: "",
    tone: "balanced",
    language: language === "ar" ? "ar" : "en",
    focus: ["experience", "skills"],
  });

  const [rebuiltData, setRebuiltData] = useState<StructuredResume | null>(null);
  const [editedData, setEditedData] = useState<StructuredResume | null>(null);
  const [viewMode, setViewMode] = useState<"side" | "edit">("side");
  const [exportTemplate, setExportTemplate] = useState<"classic" | "modern">("classic");
  const [improvingSection, setImprovingSection] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState(0);
  const [saving, setSaving] = useState(false);

  /* Load resumes */
  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: uploaded }, { data: generated }] = await Promise.all([
        supabase
          .from("resumes")
          .select("id, file_name, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("generated_resumes")
          .select("id, title, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
      ]);
      const items: ResumeOption[] = [
        ...(uploaded || []).map((r) => ({
          id: r.id,
          label: r.file_name,
          type: "uploaded" as const,
          date: new Date(r.created_at).toLocaleDateString(ar ? "ar-SA" : "en-US"),
        })),
        ...(generated || []).map((r) => ({
          id: r.id,
          label: r.title,
          type: "generated" as const,
          date: new Date(r.created_at).toLocaleDateString(ar ? "ar-SA" : "en-US"),
        })),
      ];
      setResumes(items);
      setLoadingResumes(false);
    })();
  }, [user, ar]);

  /* Load selected resume */
  const loadResumeData = useCallback(
    async (resumeId: string) => {
      if (!user || !resumeId) return;
      const option = resumes.find((r) => r.id === resumeId);
      if (!option) return;
      setSourceData(null);
      setSourceText("");

      if (option.type === "uploaded") {
        const { data } = await supabase
          .from("user_resumes")
          .select("raw_resume_text, structured_resume_json")
          .eq("resume_id", resumeId)
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1);

        if (data && data.length > 0) {
          const row = data[0];
          setSourceText(row.raw_resume_text || "");
          if (row.structured_resume_json && typeof row.structured_resume_json === "object") {
            const s = row.structured_resume_json as Record<string, unknown>;
            const mapped: StructuredResume = { ...EMPTY_STRUCTURED };
            for (const key of Object.keys(mapped)) {
              if (s[key] !== undefined && s[key] !== null) (mapped as any)[key] = safeStr(s[key], key);
            }
            setSourceData(mapped);
          }
        } else {
          const { data: resumeRow } = await supabase
            .from("resumes")
            .select("extracted_text")
            .eq("id", resumeId)
            .single();
          if (resumeRow?.extracted_text) setSourceText(resumeRow.extracted_text);
        }
      } else {
        const { data } = await supabase.from("generated_resumes").select("content").eq("id", resumeId).single();
        if (data?.content && typeof data.content === "object") {
          const c = data.content as Record<string, unknown>;
          const mapped: StructuredResume = { ...EMPTY_STRUCTURED };
          for (const key of Object.keys(mapped)) {
            if (c[key] !== undefined && c[key] !== null) (mapped as any)[key] = safeStr(c[key], key);
          }
          setSourceData(mapped);
        }
      }
    },
    [user, resumes],
  );

  useEffect(() => {
    if (selectedResumeId) loadResumeData(selectedResumeId);
  }, [selectedResumeId, loadResumeData]);

  /* Loading stage ticker */
  useEffect(() => {
    if (!loading) {
      setLoadingStage(0);
      return;
    }
    const stages = ar ? LOADING_STAGES_AR : LOADING_STAGES_EN;
    const interval = setInterval(() => {
      setLoadingStage((p) => (p + 1 < stages.length ? p + 1 : p));
    }, 2200);
    return () => clearInterval(interval);
  }, [loading, ar]);

  /* Rebuild */
  const handleRebuild = async () => {
    if (!sourceData && !sourceText) return;
    setLoading(true);
    setStep(3);

    try {
      let weaknesses: string[] = [];
      if (user && selectedResumeId) {
        const { data: analyses } = await supabase
          .from("analyses")
          .select("weaknesses")
          .eq("resume_id", selectedResumeId)
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1);
        if (analyses?.[0]?.weaknesses) weaknesses = analyses[0].weaknesses;
      }

      const { data, error } = await supabase.functions.invoke("improve-resume", {
        body: {
          resumeText: sourceText,
          structuredResume: sourceData,
          targetJobTitle: options.targetJobTitle.trim() || undefined,
          targetJobDescription: options.targetJobDescription.trim() || undefined,
          weaknesses: weaknesses.length ? weaknesses : undefined,
          language: options.language,
          tone: options.tone,
          focus: options.focus,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data?.rebuilt) {
        const r = data.rebuilt as Record<string, unknown>;
        const mapped: StructuredResume = { ...EMPTY_STRUCTURED };
        for (const key of Object.keys(mapped)) {
          // safeStr handles array/object/string from AI — prevents ".trim is not a function" crash
          if (r[key] !== undefined && r[key] !== null) (mapped as any)[key] = safeStr(r[key], key);
        }
        setRebuiltData(mapped);
        setEditedData(mapped);

        // Deduct points server-side
        await deductPoints(user!.id, "builder", ar ? "إعادة كتابة السيرة بالذكاء الاصطناعي" : "AI Resume Rewrite");

        setStep(4);
        toast.success(ar ? "✓ تمت إعادة كتابة السيرة بالذكاء الاصطناعي" : "✓ Resume rewritten by AI");
      }
    } catch (err: any) {
      toast.error(err.message || (ar ? "حدث خطأ، حاول مجدداً" : "Something went wrong, try again"));
      setStep(2);
    } finally {
      setLoading(false);
    }
  };

  /* Save */
  const handleSave = async () => {
    if (!editedData || !user) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("generated_resumes").insert([
        {
          user_id: user.id,
          title: editedData.name
            ? `${editedData.name} — ${ar ? "إعادة كتابة AI" : "AI Rewrite"}`
            : ar
              ? "سيرة مُعاد كتابتها بالـ AI"
              : "AI Rewritten Resume",
          content: JSON.parse(JSON.stringify(editedData)),
          language: options.language,
        } as any,
      ]);
      if (error) throw error;
      toast.success(ar ? "✓ تم الحفظ بنجاح" : "✓ Saved successfully");
    } catch (err: any) {
      toast.error(err.message || (ar ? "خطأ في الحفظ" : "Save failed"));
    } finally {
      setSaving(false);
    }
  };

  /* handleImproveSection — per-section AI improvement */
  const handleImproveSection = async (sectionKey: string) => {
    if (!editedData || !user) return;

    setImprovingSection(sectionKey);
    try {
      const currentValue = safeStr((editedData as any)[sectionKey], sectionKey);
      const extraInstruction =
        sectionKey === "skills"
          ? "Clean, deduplicate, and organize skills into an ATS-friendly professional list. Do NOT invent new skills. Return as a bullet list using • character."
          : "";

      const { data, error } = await supabase.functions.invoke("improve-section", {
        body: {
          section: sectionKey,
          content: currentValue,
          jobTitle: options.targetJobTitle || editedData.job_title || "",
          language: options.language,
          extraInstruction,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const improved = data?.improved || data?.content || data?.result;
      if (improved) {
        const normalizedValue = safeStr(improved, sectionKey);
        setEditedData((d) => (d ? { ...d, [sectionKey]: normalizedValue } : d));
        toast.success(ar ? "✓ تم تحسين القسم" : "✓ Section improved");
      }
    } catch (err: any) {
      toast.error(err.message || (ar ? "فشل التحسين" : "Improvement failed"));
    } finally {
      setImprovingSection(null);
    }
  };

  /* Export — strict page count: 1, 2, or 3 pages only */
  const handleExport = () => {
    if (!editedData) return;
    const isRTL = options.language === "ar";
    const labels = isRTL ? SECTION_AR : SECTION_EN;
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    // Collect sections with content (excluding header fields handled separately)
    const contentSections: Array<{ key: keyof StructuredResume; lines: string[] }> = [];
    for (const key of SECTION_ORDER) {
      const value = safeStr(editedData[key], key);
      if (!value) continue;
      const lines = value.split("\n").filter(Boolean);
      contentSections.push({ key, lines });
    }

    // Count total lines (each section heading = 2 lines equivalent)
    const totalLines = contentSections.reduce((sum, s) => sum + s.lines.length + 2, 0);

    // Determine page count
    let pageCount = 1;
    if (totalLines > 75) pageCount = 3;
    else if (totalLines > 36) pageCount = 2;

    // Split sections into chunks
    const chunks: Array<typeof contentSections> = Array.from({ length: pageCount }, () => []);
    if (pageCount === 1) {
      chunks[0] = contentSections;
    } else {
      // Distribute sections evenly by line count, never split a section across pages
      const targetLines = totalLines / pageCount;
      let chunkIdx = 0;
      let chunkLines = 0;
      for (const section of contentSections) {
        const sectionLines = section.lines.length + 2;
        if (chunkIdx < pageCount - 1 && chunkLines + sectionLines > targetLines * 1.1) {
          chunkIdx++;
          chunkLines = 0;
        }
        chunks[chunkIdx].push(section);
        chunkLines += sectionLines;
      }
    }

    const renderSectionLines = (lines: string[]) =>
      lines
        .map((line) => {
          const isBullet = /^[•\-▪]/.test(line.trim());
          const text = line.trim().replace(/^[•\-▪]\s*/, "");
          return `<div class="c">${isBullet ? "• " : ""}${esc(text)}</div>`;
        })
        .join("");

    if (exportTemplate === "modern") {
      // ── MODERN TEMPLATE ───────────────────────────────────────────────
      // Separate sidebar sections (skills, languages) from main sections
      const sidebarKeys: (keyof StructuredResume)[] = ["skills", "languages"];
      const mainKeys: (keyof StructuredResume)[] = SECTION_ORDER.filter((k) => !sidebarKeys.includes(k));

      const sidebarSections = contentSections.filter((s) => sidebarKeys.includes(s.key));
      const mainSections = contentSections.filter((s) => mainKeys.includes(s.key));

      // Re-split main sections for multi-page
      const mainTotalLines = mainSections.reduce((sum, s) => sum + s.lines.length + 2, 0);
      let mainPageCount = 1;
      if (mainTotalLines > 75) mainPageCount = 3;
      else if (mainTotalLines > 36) mainPageCount = 2;

      const mainChunks: Array<typeof mainSections> = Array.from({ length: mainPageCount }, () => []);
      if (mainPageCount === 1) {
        mainChunks[0] = mainSections;
      } else {
        const targetLines = mainTotalLines / mainPageCount;
        let chunkIdx = 0;
        let chunkLines = 0;
        for (const section of mainSections) {
          const sectionLines = section.lines.length + 2;
          if (chunkIdx < mainPageCount - 1 && chunkLines + sectionLines > targetLines * 1.1) {
            chunkIdx++;
            chunkLines = 0;
          }
          mainChunks[chunkIdx].push(section);
          chunkLines += sectionLines;
        }
      }

      let html = `<!DOCTYPE html><html dir="${isRTL ? "rtl" : "ltr"}"><head><meta charset="utf-8">
<title>${esc(editedData.name || "Resume")}</title>
<style>
@page{size:A4;margin:0}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;color:#1e293b;line-height:1.6;font-size:10.5pt;background:#fff}
.page{width:210mm;min-height:297mm;page-break-after:always;page-break-inside:avoid;display:flex;flex-direction:column}
.page:last-child{page-break-after:auto}
.header{background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);color:#fff;padding:22px 28px 18px}
.header .name{font-size:22pt;font-weight:800;letter-spacing:-0.5px;color:#fff}
.header .title{font-size:11pt;color:#c7d2fe;font-weight:500;margin-top:3px}
.header .contact{font-size:9pt;color:#e0e7ff;margin-top:6px;opacity:0.9}
.body{display:grid;grid-template-columns:1fr 2fr;flex:1}
.sidebar{background:#f8fafc;padding:20px 18px;border-right:1px solid #e2e8f0}
.main{padding:20px 22px}
.sh{font-size:9.5pt;font-weight:700;color:#4f46e5;text-transform:uppercase;letter-spacing:0.8px;margin-top:14px;margin-bottom:5px;padding-bottom:3px;border-bottom:1.5px solid #e0e7ff}
.sh:first-child{margin-top:0}
.c{font-size:10pt;white-space:pre-wrap;line-height:1.65;color:#374151;margin-bottom:2px}
.main .sh{color:#3730a3;border-bottom-color:#ddd6fe}
</style></head><body>`;

      for (let p = 0; p < mainPageCount; p++) {
        html += `<div class="page">`;
        // Header only on first page
        if (p === 0) {
          html += `<div class="header">`;
          if (editedData.name) html += `<div class="name">${esc(editedData.name)}</div>`;
          if (editedData.job_title) html += `<div class="title">${esc(editedData.job_title)}</div>`;
          if (editedData.contact) html += `<div class="contact">${esc(editedData.contact)}</div>`;
          html += `</div>`;
        }
        html += `<div class="body">`;
        // Sidebar — only on first page
        html += `<div class="sidebar">`;
        if (p === 0) {
          for (const s of sidebarSections) {
            html += `<div class="sh">${esc(labels[s.key] || s.key)}</div>`;
            html += renderSectionLines(s.lines);
          }
        }
        html += `</div>`;
        // Main content
        html += `<div class="main">`;
        for (const s of mainChunks[p]) {
          html += `<div class="sh">${esc(labels[s.key] || s.key)}</div>`;
          html += renderSectionLines(s.lines);
        }
        html += `</div>`;
        html += `</div></div>`;
      }
      html += `</body></html>`;

      const w = window.open("", "_blank");
      if (!w) {
        toast.error(ar ? "تعذّر فتح نافذة الطباعة" : "Could not open print window");
        return;
      }
      w.document.write(html);
      w.document.close();
      setTimeout(() => {
        w.print();
        setTimeout(() => w.close(), 1000);
      }, 300);
      toast.success(ar ? "جارٍ التصدير..." : "Exporting...");
      return;
    }

    // ── CLASSIC TEMPLATE ─────────────────────────────────────────────────
    let html = `<!DOCTYPE html><html dir="${isRTL ? "rtl" : "ltr"}"><head><meta charset="utf-8">
<title>${esc(editedData.name || "Resume")}</title>
<style>
@page{size:A4;margin:20mm 18mm}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;color:#111827;line-height:1.65;font-size:11pt}
.page{page-break-after:always;page-break-inside:avoid}
.page:last-child{page-break-after:auto}
.name{font-size:22pt;font-weight:800;color:#0f172a;letter-spacing:-0.5px}
.title{font-size:12pt;color:#6366f1;font-weight:600;margin-top:2px}
.contact{font-size:9.5pt;color:#64748b;margin-top:4px;margin-bottom:18px;padding-bottom:12px;border-bottom:2px solid #e2e8f0}
.sh{font-size:10pt;font-weight:700;color:#4f46e5;text-transform:uppercase;letter-spacing:1px;margin-top:14px;margin-bottom:6px;display:flex;align-items:center;gap:6px;page-break-inside:avoid}
.sh::after{content:'';flex:1;height:1px;background:#e2e8f0}
.c{font-size:10.5pt;white-space:pre-wrap;line-height:1.7;page-break-inside:avoid}
</style></head><body>`;

    for (let p = 0; p < pageCount; p++) {
      html += `<div class="page">`;
      // Header only on first page
      if (p === 0) {
        if (editedData.name) html += `<div class="name">${esc(editedData.name)}</div>`;
        if (editedData.job_title) html += `<div class="title">${esc(editedData.job_title)}</div>`;
        if (editedData.contact) html += `<div class="contact">${esc(editedData.contact)}</div>`;
      }
      for (const s of chunks[p]) {
        html += `<div class="sh">${esc(labels[s.key] || s.key)}</div>`;
        html += renderSectionLines(s.lines);
      }
      html += `</div>`;
    }
    html += `</body></html>`;

    const w = window.open("", "_blank");
    if (!w) {
      toast.error(ar ? "تعذّر فتح نافذة الطباعة" : "Could not open print window");
      return;
    }
    w.document.write(html);
    w.document.close();
    setTimeout(() => {
      w.print();
      setTimeout(() => w.close(), 1000);
    }, 300);
    toast.success(ar ? "جارٍ التصدير..." : "Exporting...");
  };

  /* ─── Renders ─── */

  const renderProgressBar = () => {
    const steps = ar ? STEPS_AR : STEPS_EN;
    return (
      <div className="flex items-center gap-0 mb-10">
        {steps.map((label, i) => {
          const idx = i + 1;
          const isActive = idx === step;
          const isDone = idx < step;
          return (
            <div key={idx} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={`
                  w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300
                  ${
                    isDone
                      ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/30"
                      : isActive
                        ? "bg-violet-600 text-white shadow-lg shadow-violet-600/30 ring-4 ring-violet-600/20"
                        : "bg-muted text-muted-foreground"
                  }
                `}
                >
                  {isDone ? <CheckCircle2 className="w-5 h-5" /> : idx}
                </div>
                <span
                  className={`text-[11px] font-medium whitespace-nowrap hidden sm:block ${isActive ? "text-violet-600" : isDone ? "text-emerald-600" : "text-muted-foreground"}`}
                >
                  {label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mx-2 mt-[-14px] transition-all duration-500 ${isDone ? "bg-emerald-400" : "bg-muted"}`}
                />
              )}
            </div>
          );
        })}
      </div>
    );
  };

  /* STEP 1 — Select Resume */
  const renderStep1 = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="text-center space-y-2 pb-2">
        <div className="inline-flex items-center gap-2 bg-violet-100 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300 rounded-full px-4 py-1.5 text-sm font-medium">
          <FileText className="w-4 h-4" />
          {ar ? "الخطوة الأولى" : "Step One"}
        </div>
        <h2 className="text-xl font-bold text-foreground">
          {ar ? "اختر السيرة الذاتية التي ستُعاد كتابتها" : "Choose the resume to rewrite"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {ar
            ? "سيقرأها الذكاء الاصطناعي ويُعيد كتابتها بشكل احترافي"
            : "AI will read it and rewrite it professionally"}
        </p>
      </div>

      {loadingResumes ? (
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
            <p className="text-sm text-muted-foreground">
              {ar ? "جاري تحميل سيرك الذاتية..." : "Loading your resumes..."}
            </p>
          </div>
        </div>
      ) : resumes.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-16 border-2 border-dashed border-border rounded-2xl">
          <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center">
            <Upload className="w-7 h-7 text-muted-foreground" />
          </div>
          <div className="text-center">
            <p className="font-semibold text-foreground">{ar ? "لا توجد سيرة ذاتية بعد" : "No resumes yet"}</p>
            <p className="text-sm text-muted-foreground mt-1">
              {ar ? "ارفع سيرتك الذاتية أولاً من صفحة التحليل" : "Upload your resume first from the Analysis page"}
            </p>
          </div>
          <Button variant="outline" onClick={() => (window.location.href = "/analysis")}>
            {ar ? "اذهب لرفع السيرة" : "Go upload a resume"}
          </Button>
        </div>
      ) : (
        <div className="grid gap-3">
          {resumes.map((r) => (
            <button
              key={r.id}
              onClick={() => setSelectedResumeId(r.id)}
              className={`
                w-full flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all duration-200
                ${
                  selectedResumeId === r.id
                    ? "border-violet-500 bg-violet-50 dark:bg-violet-950/30 shadow-md shadow-violet-500/10"
                    : "border-border hover:border-violet-300 hover:bg-muted/50"
                }
              `}
            >
              <div
                className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${selectedResumeId === r.id ? "bg-violet-500 text-white" : "bg-muted text-muted-foreground"}`}
              >
                <FileText className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground truncate">{r.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{r.date}</p>
              </div>
              <Badge variant={r.type === "uploaded" ? "secondary" : "outline"} className="flex-shrink-0 text-xs">
                {r.type === "uploaded" ? (ar ? "مرفوعة" : "Uploaded") : ar ? "مُنشأة" : "Generated"}
              </Badge>
              {selectedResumeId === r.id && <CheckCircle2 className="w-5 h-5 text-violet-500 flex-shrink-0" />}
            </button>
          ))}
        </div>
      )}

      {/* Preview of selected */}
      {selectedResumeId && (sourceData || sourceText) && (
        <div className="border border-border rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/50 border-b border-border">
            <Eye className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">{ar ? "معاينة سريعة" : "Quick Preview"}</span>
          </div>
          <div className="p-4 max-h-48 overflow-y-auto">
            {sourceData?.summary ? (
              <div className="space-y-2">
                {sourceData.name && <p className="font-bold text-foreground">{sourceData.name}</p>}
                {sourceData.job_title && (
                  <p className="text-sm text-violet-600 dark:text-violet-400">{sourceData.job_title}</p>
                )}
                {sourceData.summary && (
                  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-4">{sourceData.summary}</p>
                )}
              </div>
            ) : (
              <pre className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed line-clamp-6 font-sans">
                {sourceText.slice(0, 600)}...
              </pre>
            )}
          </div>
        </div>
      )}

      <Button
        onClick={() => setStep(2)}
        disabled={!selectedResumeId || (!sourceData && !sourceText)}
        className="w-full h-12 bg-violet-600 hover:bg-violet-700 text-white font-semibold rounded-xl gap-2 text-base"
      >
        {ar ? "التالي — تخصيص الطلب" : "Next — Customize"}
        {ar ? <ArrowLeft className="w-5 h-5" /> : <ArrowRight className="w-5 h-5" />}
      </Button>
    </div>
  );

  /* STEP 2 — Options */
  const renderStep2 = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="text-center space-y-2 pb-2">
        <div className="inline-flex items-center gap-2 bg-violet-100 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300 rounded-full px-4 py-1.5 text-sm font-medium">
          <Target className="w-4 h-4" />
          {ar ? "الخطوة الثانية" : "Step Two"}
        </div>
        <h2 className="text-xl font-bold text-foreground">
          {ar ? "خصّص طلبك للذكاء الاصطناعي" : "Customize your AI request"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {ar ? "كلما كانت التفاصيل أوضح، كانت النتيجة أدق" : "The more details you provide, the better the result"}
        </p>
      </div>

      <div className="space-y-5">
        {/* Target Job Title */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Briefcase className="w-4 h-4 text-violet-500" />
            {ar ? "المسمى الوظيفي المستهدف" : "Target Job Title"}
            <span className="text-muted-foreground font-normal text-xs">({ar ? "اختياري" : "optional"})</span>
          </label>
          <Input
            value={options.targetJobTitle}
            onChange={(e) => setOptions((o) => ({ ...o, targetJobTitle: e.target.value }))}
            placeholder={
              ar ? "مثال: مهندس برمجيات أول / مدير مشاريع" : "e.g. Senior Software Engineer / Product Manager"
            }
            className="h-11 rounded-xl border-border focus:border-violet-500 focus:ring-violet-500/20"
          />
        </div>

        {/* Job Description */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <FileText className="w-4 h-4 text-violet-500" />
            {ar ? "وصف الوظيفة المستهدفة" : "Target Job Description"}
            <span className="text-muted-foreground font-normal text-xs">
              ({ar ? "الصقه لتحسين التطابق مع الـ ATS" : "paste to boost ATS match"})
            </span>
          </label>
          <div className="relative">
            <Textarea
              value={options.targetJobDescription}
              onChange={(e) => setOptions((o) => ({ ...o, targetJobDescription: e.target.value }))}
              placeholder={
                ar
                  ? "الصق وصف الوظيفة هنا للحصول على نتائج مُحسّنة ومتطابقة مع متطلبات الوظيفة..."
                  : "Paste the job description here for optimized results matching the role requirements..."
              }
              className="min-h-[110px] rounded-xl border-border resize-none focus:border-violet-500 focus:ring-violet-500/20 text-sm"
            />
            {options.targetJobDescription && (
              <div className="absolute bottom-2.5 right-3 text-[10px] text-muted-foreground bg-background px-1 rounded">
                {countWords(options.targetJobDescription)} {ar ? "كلمة" : "words"}
              </div>
            )}
          </div>
        </div>

        {/* Tone */}
        <div className="space-y-2.5">
          <label className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Wand2 className="w-4 h-4 text-violet-500" />
            {ar ? "نبرة الكتابة" : "Writing Tone"}
          </label>
          <div className="grid grid-cols-3 gap-2">
            {TONE_OPTIONS.map((t) => (
              <button
                key={t.value}
                onClick={() => setOptions((o) => ({ ...o, tone: t.value }))}
                className={`
                  flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all duration-200 text-sm
                  ${
                    options.tone === t.value
                      ? "border-violet-500 bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300 font-semibold"
                      : "border-border hover:border-violet-300 text-muted-foreground hover:text-foreground"
                  }
                `}
              >
                <span className="text-xl">{t.icon}</span>
                <span>{ar ? t.labelAr : t.labelEn}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Focus */}
        <div className="space-y-2.5">
          <label className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Zap className="w-4 h-4 text-violet-500" />
            {ar ? "ما الذي تريد إبرازه؟" : "What to emphasize?"}
            <span className="text-muted-foreground font-normal text-xs">
              ({ar ? "اختر واحداً أو أكثر" : "choose one or more"})
            </span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            {FOCUS_OPTIONS.map((f) => {
              const isOn = options.focus.includes(f.value);
              return (
                <button
                  key={f.value}
                  onClick={() =>
                    setOptions((o) => ({
                      ...o,
                      focus: isOn ? o.focus.filter((x) => x !== f.value) : [...o.focus, f.value],
                    }))
                  }
                  className={`
                    flex items-center gap-2.5 p-3 rounded-xl border-2 transition-all duration-200 text-sm text-left
                    ${
                      isOn
                        ? "border-violet-500 bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300 font-semibold"
                        : "border-border hover:border-violet-300 text-muted-foreground"
                    }
                  `}
                >
                  <div
                    className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${isOn ? "bg-violet-500 border-violet-500" : "border-muted-foreground"}`}
                  >
                    {isOn && <CheckCircle2 className="w-3 h-3 text-white" />}
                  </div>
                  {ar ? f.labelAr : f.labelEn}
                </button>
              );
            })}
          </div>
        </div>

        {/* Language */}
        <div className="space-y-2.5">
          <label className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Globe className="w-4 h-4 text-violet-500" />
            {ar ? "لغة السيرة الذاتية الجديدة" : "Output Resume Language"}
          </label>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { value: "en", labelAr: "🇺🇸 إنجليزي", labelEn: "🇺🇸 English" },
                { value: "ar", labelAr: "🇸🇦 عربي", labelEn: "🇸🇦 Arabic" },
              ] as const
            ).map((l) => (
              <button
                key={l.value}
                onClick={() => setOptions((o) => ({ ...o, language: l.value }))}
                className={`
                  p-3 rounded-xl border-2 transition-all duration-200 text-sm font-medium
                  ${
                    options.language === l.value
                      ? "border-violet-500 bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300"
                      : "border-border hover:border-violet-300 text-muted-foreground"
                  }
                `}
              >
                {ar ? l.labelAr : l.labelEn}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Cost notice */}
      <div className="flex items-center gap-3 p-3.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl text-sm">
        <Sparkles className="w-4 h-4 text-amber-500 flex-shrink-0" />
        <span className="text-amber-700 dark:text-amber-300">
          {ar ? "تكلفة هذه العملية 3 نقاط من رصيدك" : "This operation costs 3 points from your balance"}
        </span>
      </div>

      <div className="flex gap-3">
        <Button variant="outline" onClick={() => setStep(1)} className="flex-1 h-12 rounded-xl gap-2">
          {ar ? <ArrowRight className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
          {ar ? "السابق" : "Back"}
        </Button>
        <Button
          onClick={handleRebuild}
          disabled={options.focus.length === 0}
          className="flex-[3] h-12 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-semibold rounded-xl gap-2 text-base shadow-lg shadow-violet-500/25"
        >
          <Sparkles className="w-5 h-5" />
          {ar ? "ابدأ إعادة الكتابة بالذكاء الاصطناعي" : "Start AI Rewrite"}
        </Button>
      </div>
    </div>
  );

  /* STEP 3 — Loading */
  const renderStep3 = () => {
    const stages = ar ? LOADING_STAGES_AR : LOADING_STAGES_EN;
    const progress = Math.min(((loadingStage + 1) / stages.length) * 100, 95);
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-8 animate-in fade-in duration-700">
        {/* Animated orb */}
        <div className="relative w-28 h-28">
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 animate-pulse opacity-20 scale-110" />
          <div
            className="absolute inset-2 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 animate-spin opacity-30"
            style={{ animationDuration: "3s" }}
          />
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
            <Sparkles className="w-10 h-10 text-white animate-pulse" />
          </div>
        </div>

        <div className="text-center space-y-2">
          <h2 className="text-xl font-bold text-foreground">
            {ar ? "الذكاء الاصطناعي يعيد كتابة سيرتك..." : "AI is rewriting your resume..."}
          </h2>
          <p className="text-sm text-muted-foreground min-h-[20px] transition-all duration-500">
            {stages[loadingStage]}
          </p>
        </div>

        {/* Progress bar */}
        <div className="w-full max-w-xs space-y-2">
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full transition-all duration-700 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{ar ? "جاري المعالجة..." : "Processing..."}</span>
            <span>{Math.round(progress)}%</span>
          </div>
        </div>

        {/* Dots */}
        <div className="flex gap-2">
          {stages.map((_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition-all duration-300 ${i <= loadingStage ? "bg-violet-500" : "bg-muted"}`}
            />
          ))}
        </div>
      </div>
    );
  };

  /* STEP 4 — Review & Download */
  const renderStep4 = () => {
    if (!rebuiltData || !editedData) return null;
    const labels = options.language === "ar" ? SECTION_AR : SECTION_EN;
    const allKeys: (keyof StructuredResume)[] = ["name", "job_title", "contact", ...SECTION_ORDER];

    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="inline-flex items-center gap-2 bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 rounded-full px-3 py-1 text-xs font-medium mb-2">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {ar ? "اكتملت إعادة الكتابة بنجاح" : "Rewrite completed successfully"}
            </div>
            <h2 className="text-xl font-bold text-foreground">
              {ar ? "راجع سيرتك الذاتية الجديدة" : "Review your new resume"}
            </h2>
          </div>
          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setStep(2);
                setRebuiltData(null);
                setEditedData(null);
              }}
              className="rounded-lg gap-1.5 text-xs"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              {ar ? "أعد الكتابة" : "Rewrite Again"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg gap-1.5 text-xs"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {ar ? "حفظ" : "Save"}
            </Button>
            {/* Template selector */}
            <div className="flex items-center gap-1 p-0.5 bg-muted rounded-lg border border-border">
              <button
                onClick={() => setExportTemplate("classic")}
                className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${exportTemplate === "classic" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {ar ? "كلاسيكي" : "Classic"}
              </button>
              <button
                onClick={() => setExportTemplate("modern")}
                className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${exportTemplate === "modern" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {ar ? "حديث" : "Modern"}
              </button>
            </div>
            <Button
              size="sm"
              onClick={handleExport}
              className="rounded-lg gap-1.5 text-xs bg-violet-600 hover:bg-violet-700 text-white"
            >
              <Download className="w-3.5 h-3.5" />
              {ar ? "تصدير PDF" : "Export PDF"}
            </Button>
          </div>
        </div>

        {/* View toggle */}
        <div className="flex items-center gap-1 p-1 bg-muted rounded-xl w-fit">
          <button
            onClick={() => setViewMode("side")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${viewMode === "side" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Eye className="w-4 h-4" />
            {ar ? "مقارنة جانبية" : "Side by Side"}
          </button>
          <button
            onClick={() => setViewMode("edit")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${viewMode === "edit" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Edit3 className="w-4 h-4" />
            {ar ? "تعديل" : "Edit"}
          </button>
        </div>

        {/* Side by side */}
        {viewMode === "side" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Original */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 px-3 py-2 bg-muted/60 rounded-xl">
                <div className="w-2 h-2 rounded-full bg-slate-400" />
                <span className="text-sm font-semibold text-muted-foreground">
                  {ar ? "السيرة الأصلية" : "Original Resume"}
                </span>
              </div>
              <div className="border border-border rounded-xl overflow-hidden divide-y divide-border">
                {allKeys.map((key) => {
                  const val = safeStr(sourceData?.[key], key);
                  if (!val) return null;
                  return (
                    <div key={key} className="p-3 space-y-1 bg-muted/20">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        {labels[key]}
                      </p>
                      <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">{val}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* New */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 px-3 py-2 bg-violet-100 dark:bg-violet-950/40 rounded-xl">
                <div className="w-2 h-2 rounded-full bg-violet-500" />
                <span className="text-sm font-semibold text-violet-700 dark:text-violet-300">
                  {ar ? "السيرة الجديدة (AI)" : "New Resume (AI)"}
                </span>
                <Sparkles className="w-3.5 h-3.5 text-violet-500 mr-auto" />
              </div>
              <div className="border-2 border-violet-200 dark:border-violet-800 rounded-xl overflow-hidden divide-y divide-violet-100 dark:divide-violet-900">
                {allKeys.map((key) => {
                  const orig = safeStr(sourceData?.[key], key);
                  const newVal = safeStr(rebuiltData[key], key);
                  if (!newVal) return null;
                  const changed = orig !== newVal;
                  return (
                    <div
                      key={key}
                      className={`p-3 space-y-1 ${changed ? "bg-violet-50/50 dark:bg-violet-950/20" : ""}`}
                    >
                      <div className="flex items-center gap-1.5">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-violet-600 dark:text-violet-400">
                          {labels[key]}
                        </p>
                        {changed && (
                          <span className="text-[9px] bg-violet-500 text-white px-1.5 py-0.5 rounded-full font-semibold">
                            {ar ? "محسّن" : "Improved"}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">{newVal}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Edit mode */}
        {viewMode === "edit" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {ar ? "يمكنك تعديل أي قسم قبل التصدير أو الحفظ" : "You can edit any section before exporting or saving"}
            </p>

            {/* Professional review notice — shown above the name field */}
            <div className="flex gap-3 p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-xl">
              <div className="flex-shrink-0 mt-0.5">
                <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center">
                  <Eye className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                  {ar ? "مراجعة إلزامية قبل الاستخدام" : "Review Required Before Use"}
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                  {ar
                    ? "يُنشئ الذكاء الاصطناعي المحتوى استناداً إلى بياناتك، غير أنه قد يُدخل صياغات تحتاج إلى تدقيق. تأكد من مراجعة جميع الأقسام والتحقق من دقة المعلومات قبل إرسال سيرتك الذاتية لأي جهة."
                    : "AI-generated content is based on your data, but may contain phrasing that requires review. Please read through every section carefully and verify all information is accurate before submitting your resume to any employer."}
                </p>
              </div>
            </div>

            <div className="divide-y divide-border border border-border rounded-xl overflow-hidden">
              {allKeys.map((key) => {
                const isPersonalField = key === "name" || key === "job_title" || key === "contact";
                const isImproving = improvingSection === key;
                const currentVal = String((editedData as any)[key] ?? "");
                return (
                  <div key={key} className="p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        {labels[key]}
                      </label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleImproveSection(key)}
                        disabled={isImproving || !currentVal.trim()}
                        className="h-7 px-2.5 text-xs gap-1.5 text-violet-600 hover:text-violet-700 hover:bg-violet-50 dark:hover:bg-violet-950/30 rounded-lg flex-shrink-0"
                      >
                        {isImproving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                        {isImproving
                          ? ar
                            ? "جاري..."
                            : "Improving..."
                          : ar
                            ? "تحسين بالذكاء الاصطناعي"
                            : "Improve with AI"}
                      </Button>
                    </div>
                    {isPersonalField ? (
                      <Input
                        value={currentVal}
                        onChange={(e) => setEditedData((d) => (d ? { ...d, [key]: e.target.value } : d))}
                        className="h-10 rounded-lg text-sm border-border focus:border-violet-500"
                      />
                    ) : (
                      <Textarea
                        value={currentVal}
                        onChange={(e) => setEditedData((d) => (d ? { ...d, [key]: e.target.value } : d))}
                        rows={Math.max(3, currentVal.split("\n").length + 1)}
                        className="rounded-lg text-sm resize-none border-border focus:border-violet-500"
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Save edits notice */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              {ar
                ? "تعديلاتك محفوظة محلياً، اضغط 'حفظ' لحفظها في المنصة"
                : "Edits are saved locally, press 'Save' to store on platform"}
            </div>
          </div>
        )}

        {/* ── Apply to Jobs CTA ── */}
        <div className="mt-6 rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/8 to-teal-500/5 p-6 text-center space-y-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center mx-auto">
            <Briefcase className="w-5 h-5 text-emerald-600" />
          </div>
          <h3 className="text-base font-bold text-foreground">
            {ar ? "سيرتك جاهزة — ابدأ التقديم الآن!" : "Your resume is ready — start applying!"}
          </h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            {ar
              ? "تصفّح الوظائف المناسبة وقدّم طلبك بسيرة ذاتية محسّنة."
              : "Browse matching jobs and apply with your enhanced resume."}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-1">
            <Button
              asChild
              className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-md shadow-emerald-500/20 gap-2"
            >
              <Link to="/job-search">
                <Briefcase className="w-4 h-4" />
                {ar ? "تقدم على الوظائف" : "Apply to Jobs"}
              </Link>
            </Button>
            <Button variant="outline" asChild className="rounded-xl gap-2">
              <Link to="/analysis">
                <Sparkles className="w-4 h-4" />
                {ar ? "تحليل السيرة مجدداً" : "Re-analyze Resume"}
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
  };

  /* ─── Main render ─── */
  return (
    <div className="min-h-screen bg-background" dir={ar ? "rtl" : "ltr"}>
      <div className="container max-w-3xl mx-auto py-8 px-4">
        {/* Page Header */}
        <div className="mb-8 text-center space-y-3">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-lg shadow-violet-500/30 mb-2">
            <Wand2 className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold text-foreground tracking-tight">
            {ar ? "إعادة كتابة السيرة بالذكاء الاصطناعي" : "AI Resume Rewriter"}
          </h1>
          <p className="text-muted-foreground max-w-lg mx-auto text-sm leading-relaxed">
            {ar
              ? "يقرأ الذكاء الاصطناعي سيرتك الذاتية ويُعيد كتابتها بالكامل بأسلوب احترافي محسّن لأنظمة الـ ATS ومتناسب مع الوظيفة المستهدفة"
              : "AI reads your resume and completely rewrites it in a professional style optimized for ATS systems and tailored to your target role"}
          </p>
        </div>

        {/* Progress bar */}
        {renderProgressBar()}

        {/* Step content */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
          {step === 4 && renderStep4()}
        </div>

        {/* Back button on step 3 if stuck */}
        {step === 3 && !loading && (
          <div className="mt-4 text-center">
            <Button variant="ghost" size="sm" onClick={() => setStep(2)} className="text-muted-foreground gap-2">
              {ar ? <ArrowRight className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
              {ar ? "العودة" : "Go Back"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ResumeEnhancement;
