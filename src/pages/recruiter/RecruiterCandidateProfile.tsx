import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/i18n/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  ArrowLeft,
  Brain,
  FileText,
  MessageSquareText,
  Video,
  StickyNote,
  Loader2,
  Send,
  Star,
  AlertTriangle,
  CheckCircle2,
  User,
  Briefcase,
  ShieldAlert,
  CircleHelp,
  ArrowRightLeft,
  Target,
  Sparkles,
} from "lucide-react";
import {
  useCandidateJobMatches,
  triggerMatchCalculation,
  matchScoreColor,
  matchScoreBg,
  matchScoreLabel,
  type JobMatch,
} from "@/hooks/useJobMatches";

const STAGES = [
  "new",
  "under_review",
  "shortlisted",
  "interview_scheduled",
  "ai_interview_sent",
  "ai_interview_completed",
  "live_interview_scheduled",
  "rejected",
  "hired",
];

interface CandidateData {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  current_title: string | null;
  experience_years: number | null;
  stage: string;
  fit_score: number | null;
  fit_label: string | null;
  file_name: string | null;
  file_path: string | null;
  extracted_text: string | null;
  structured_data: any;
  ai_report: any;
  created_at: string;
}

interface Note {
  id: string;
  content: string;
  created_at: string;
}

function MatchedJobsSection({
  candidateId,
  ar,
  navigate,
}: {
  candidateId: string | undefined;
  ar: boolean;
  navigate: (p: string) => void;
}) {
  const { matches, loading, load } = useCandidateJobMatches(candidateId);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {ar ? "جاري تحميل الوظائف المطابقة..." : "Loading matched jobs…"}
        </div>
      </Card>
    );
  }

  if (!matches.length) return null;

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={14} className="text-primary" />
        <h3 className="text-sm font-display font-semibold text-foreground">
          {ar ? "الوظائف المطابقة" : "Matched Jobs"}
        </h3>
        <Badge variant="secondary" className="text-[10px]">
          {matches.length}
        </Badge>
      </div>
      <div className="space-y-2">
        {matches.map((m) => (
          <div
            key={m.id}
            className="flex items-center gap-3 rounded-lg border border-border p-3 hover:bg-muted/30 transition-colors"
          >
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Briefcase size={14} className="text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{m.job_title || "—"}</p>
              <p className="text-xs text-muted-foreground truncate">{m.job_department || "—"}</p>
              {m.match_reasons?.length > 0 && (
                <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{m.match_reasons[0]}</p>
              )}
            </div>
            <div className="shrink-0 text-end">
              <div className={`text-lg font-bold leading-none ${matchScoreColor(m.match_score)}`}>{m.match_score}%</div>
              <div className={`text-[10px] mt-0.5 ${matchScoreBg(m.match_score)} rounded px-1.5 py-0.5 inline-block`}>
                {matchScoreLabel(m.match_score, ar)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

const RecruiterCandidateProfile = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { language } = useLanguage();
  const navigate = useNavigate();
  const ar = language === "ar";

  const [candidate, setCandidate] = useState<CandidateData | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [generatingQuestions, setGeneratingQuestions] = useState(false);
  const [stageUpdating, setStageUpdating] = useState(false);

  const loadCandidate = useCallback(async () => {
    if (!user || !id) return;
    setLoading(true);
    const { data } = await supabase
      .from("recruiter_candidates")
      .select("*")
      .eq("id", id)
      .eq("recruiter_id", user.id)
      .single();
    setCandidate(data as CandidateData | null);

    const { data: notesData } = await supabase
      .from("recruiter_candidate_notes")
      .select("id, content, created_at")
      .eq("candidate_id", id)
      .eq("recruiter_id", user.id)
      .order("created_at", { ascending: false });
    setNotes((notesData || []) as Note[]);
    setLoading(false);
  }, [user, id]);

  useEffect(() => {
    loadCandidate();
  }, [loadCandidate]);

  const handleStageChange = async (newStage: string) => {
    if (!candidate) return;
    setStageUpdating(true);
    await supabase.from("recruiter_candidates").update({ stage: newStage }).eq("id", candidate.id);
    setCandidate((prev) => (prev ? { ...prev, stage: newStage } : null));
    setStageUpdating(false);
    toast.success(ar ? "تم تحديث المرحلة" : "Stage updated");
  };

  const handleAddNote = async () => {
    if (!user || !candidate || !newNote.trim()) return;
    setSavingNote(true);
    const { error } = await supabase.from("recruiter_candidate_notes").insert({
      candidate_id: candidate.id,
      recruiter_id: user.id,
      content: newNote.trim(),
    });
    setSavingNote(false);
    if (error) {
      toast.error("Failed");
      return;
    }
    setNewNote("");
    loadCandidate();
  };

  const handleGenerateReport = async () => {
    if (!candidate?.extracted_text) {
      toast.error(ar ? "لا يوجد نص مستخرج من السيرة" : "No extracted text available");
      return;
    }
    setGeneratingReport(true);
    try {
      const { data, error } = await supabase.functions.invoke("recruiter-analyze-candidate", {
        body: {
          candidateText: candidate.extracted_text,
          candidateName: candidate.name,
          candidateTitle: candidate.current_title,
          language,
        },
      });
      if (error) throw error;
      const report = data?.report;
      if (report) {
        const derivedFitScore =
          Number(report?.executive_hiring_summary?.overall_fit_score) ||
          Number(report?.scoring_table?.role_match) ||
          Number(report?.score) ||
          null;
        const derivedRecommendation =
          report?.hiring_recommendation?.decision || report?.recommendation || report?.fit_label || null;

        await supabase
          .from("recruiter_candidates")
          .update({ ai_report: report, fit_score: derivedFitScore, fit_label: derivedRecommendation })
          .eq("id", candidate.id);

        setCandidate((prev) =>
          prev ? { ...prev, ai_report: report, fit_score: derivedFitScore, fit_label: derivedRecommendation } : null,
        );
        toast.success(ar ? "تم إنشاء التقرير" : "Report generated");

        // ── Re-run matching after AI analysis updates candidate data ──
        // This ensures match scores reflect the newly extracted/updated fields.
        triggerMatchCalculation({ candidate_id: candidate.id });
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to generate report");
    } finally {
      setGeneratingReport(false);
    }
  };

  const handleGenerateQuestions = async () => {
    if (!candidate?.extracted_text) {
      toast.error(ar ? "لا يوجد نص مستخرج" : "No extracted text available");
      return;
    }
    setGeneratingQuestions(true);
    try {
      const { data, error } = await supabase.functions.invoke("recruiter-generate-questions", {
        body: {
          candidateText: candidate.extracted_text,
          candidateName: candidate.name,
          candidateTitle: candidate.current_title,
          language,
        },
      });
      if (error) throw error;
      const questions = data?.questions;
      if (questions && user) {
        await supabase.from("recruiter_question_sets").insert({
          recruiter_id: user.id,
          candidate_id: candidate.id,
          title: `${candidate.name} - Interview Questions`,
          questions,
        });
        toast.success(ar ? "تم إنشاء الأسئلة" : "Questions generated");
        navigate("/recruiter/questions");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed");
    } finally {
      setGeneratingQuestions(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!candidate) {
    return (
      <div className="p-6 text-center text-muted-foreground">{ar ? "المرشح غير موجود" : "Candidate not found"}</div>
    );
  }

  const report = normalizeReport(candidate.ai_report);

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
      <Button variant="ghost" size="sm" onClick={() => navigate("/recruiter/candidates")}>
        <ArrowLeft size={14} className="mr-1" /> {ar ? "العودة" : "Back"}
      </Button>

      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-display font-bold text-foreground">{candidate.name}</h1>
              <p className="text-sm text-muted-foreground">{candidate.current_title || "—"}</p>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                {candidate.email ? <Badge variant="outline">{candidate.email}</Badge> : null}
                {candidate.phone ? <Badge variant="outline">{candidate.phone}</Badge> : null}
                <Badge variant="secondary">{getExperienceLabel(candidate.experience_years, ar)}</Badge>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <ExecutivePill
              label={ar ? "Overall Fit" : "Overall Fit"}
              value={`${report.executive.overallFitScore ?? candidate.fit_score ?? "—"}%`}
              valueClassName={getFitColor(report.executive.overallFitScore ?? candidate.fit_score)}
            />
            <ExecutivePill
              label={ar ? "Decision" : "Decision"}
              value={report.decision || candidate.fit_label || "—"}
              valueClassName={getDecisionColor(report.decision || candidate.fit_label)}
            />
            <Select value={candidate.stage} onValueChange={handleStageChange} disabled={stageUpdating}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STAGES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid lg:grid-cols-4 gap-3 mt-4 pt-4 border-t border-border">
          <ExecutiveStat
            title={ar ? "Candidate Level" : "Candidate Level"}
            value={report.executive.candidateLevel || getExperienceLabel(candidate.experience_years, ar)}
            icon={Briefcase}
          />
          <ExecutiveStat
            title={ar ? "Best Role" : "Best Role"}
            value={report.executive.bestFitRoles?.[0] || candidate.current_title || "—"}
            icon={Target}
          />
          <ExecutiveStat
            title={ar ? "Why this candidate?" : "Why this candidate?"}
            value={report.whyThisCandidate || (ar ? "بانتظار التحليل" : "Awaiting analysis")}
            icon={CheckCircle2}
          />
          <ExecutiveStat
            title={ar ? "Why not this candidate?" : "Why not this candidate?"}
            value={report.whyNotThisCandidate || (ar ? "لا يوجد سبب حاسم بعد" : "No decisive blocker yet")}
            icon={ShieldAlert}
          />
        </div>

        <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-border">
          <Button size="sm" onClick={handleGenerateReport} disabled={generatingReport}>
            {generatingReport ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
            ) : (
              <Brain size={14} className="mr-1.5" />
            )}
            {ar ? "تحديث تحليل AI" : "Refresh AI Analysis"}
          </Button>
          <Button size="sm" variant="outline" onClick={handleGenerateQuestions} disabled={generatingQuestions}>
            {generatingQuestions ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
            ) : (
              <MessageSquareText size={14} className="mr-1.5" />
            )}
            {ar ? "أسئلة المقابلة" : "Interview Questions"}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              navigate(`/recruiter/questions?candidate=${candidate.id}&name=${encodeURIComponent(candidate.name)}`)
            }
          >
            <Brain size={14} className="mr-1.5" />
            {ar ? "مقابلة AI" : "AI Interview"}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => handleStageChange("shortlisted")}>
            <Star size={14} className="mr-1.5" /> {ar ? "Shortlist" : "Shortlist"}
          </Button>
          <Button size="sm" variant="destructive" onClick={() => handleStageChange("rejected")}>
            <AlertTriangle size={14} className="mr-1.5" /> {ar ? "Reject" : "Reject"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              navigate(`/recruiter/questions?candidate=${candidate.id}&name=${encodeURIComponent(candidate.name)}`)
            }
          >
            <Send size={14} className="mr-1.5" /> {ar ? "دعوة لمقابلة AI" : "Send AI Interview"}
          </Button>
          <Button size="sm" variant="outline" disabled>
            <Video size={14} className="mr-1.5" /> {ar ? "جدولة مقابلة حية" : "Schedule Live Interview"}
          </Button>
        </div>
      </Card>

      <MatchedJobsSection candidateId={id} ar={ar} navigate={navigate} />

      <Tabs defaultValue="report">
        <TabsList className="w-full justify-start flex-wrap h-auto">
          <TabsTrigger value="report">
            <Brain size={14} className="mr-1.5" /> {ar ? "التحليل" : "AI Analysis"}
          </TabsTrigger>
          <TabsTrigger value="resume">
            <FileText size={14} className="mr-1.5" /> {ar ? "السيرة" : "Resume"}
          </TabsTrigger>
          <TabsTrigger value="notes">
            <StickyNote size={14} className="mr-1.5" /> {ar ? "ملاحظات" : "Notes"}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="report" className="mt-4 space-y-4">
          {!candidate.ai_report ? (
            <Card className="p-8 text-center">
              <Brain className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground mb-3">
                {ar ? "لم يتم إنشاء تقرير بعد" : "No AI report generated yet"}
              </p>
              <Button size="sm" onClick={handleGenerateReport} disabled={generatingReport || !candidate.extracted_text}>
                {generatingReport ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                {ar ? "إنشاء التقرير الآن" : "Generate Report Now"}
              </Button>
            </Card>
          ) : (
            <>
              <div className="grid xl:grid-cols-3 gap-4">
                <Card className="p-4 xl:col-span-2">
                  <h3 className="text-sm font-display font-semibold text-foreground mb-2">
                    {ar ? "الملخص التنفيذي للتوظيف" : "Executive Hiring Summary"}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-7">{report.summaryText}</p>
                </Card>
                <Card className="p-4 space-y-3">
                  <SummaryLabel
                    label={ar ? "Recommended Role(s)" : "Recommended Role(s)"}
                    value={report.executive.bestFitRoles.join("، ") || "—"}
                  />
                  <SummaryLabel
                    label={ar ? "Hiring Decision" : "Hiring Decision"}
                    value={report.decision || "—"}
                    valueClassName={getDecisionColor(report.decision)}
                  />
                  <SummaryLabel label={ar ? "Reasoning" : "Reasoning"} value={report.reasoning || "—"} />
                </Card>
              </div>

              <Card className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <ArrowRightLeft size={14} className="text-primary" />
                  <h3 className="text-sm font-display font-semibold text-foreground">
                    {ar ? "Visual Score Breakdown" : "Visual Score Breakdown"}
                  </h3>
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  {report.scoreItems.map((item) => (
                    <ScoreRow key={item.key} label={item.label} value={item.value} />
                  ))}
                </div>
              </Card>

              <div className="grid xl:grid-cols-2 gap-4">
                <ListCard
                  title={ar ? "نقاط القوة" : "Strengths"}
                  icon={CheckCircle2}
                  iconClassName="text-success"
                  items={report.strengths}
                  empty={ar ? "لا توجد نقاط قوة محددة" : "No strengths identified"}
                />
                <ListCard
                  title={ar ? "المخاطر / الإشارات الحمراء" : "Risks / Red Flags"}
                  icon={ShieldAlert}
                  iconClassName="text-destructive"
                  items={report.risks}
                  empty={ar ? "لا توجد مخاطر واضحة" : "No major risk flags"}
                />
                <ListCard
                  title={ar ? "المتطلبات الناقصة" : "Missing Requirements"}
                  icon={AlertTriangle}
                  iconClassName="text-yellow-600"
                  items={report.missingRequirements}
                  empty={ar ? "لا توجد متطلبات ناقصة واضحة" : "No clear missing requirements"}
                />
                <ListCard
                  title={ar ? "محاور المقابلة" : "Interview Focus Areas"}
                  icon={CircleHelp}
                  iconClassName="text-primary"
                  items={report.interviewFocusAreas}
                  empty={ar ? "لا توجد محاور مقترحة" : "No interview focus areas"}
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <Card className="p-4">
                  <h3 className="text-sm font-display font-semibold text-foreground mb-2">
                    {ar ? "Why this candidate?" : "Why this candidate?"}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-7">{report.whyThisCandidate || "—"}</p>
                </Card>
                <Card className="p-4">
                  <h3 className="text-sm font-display font-semibold text-foreground mb-2">
                    {ar ? "Why NOT this candidate?" : "Why NOT this candidate?"}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-7">{report.whyNotThisCandidate || "—"}</p>
                </Card>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="resume" className="mt-4">
          <Card className="p-4">
            {candidate.file_name && (
              <div className="flex items-center gap-2 mb-3 pb-3 border-b border-border">
                <FileText size={14} className="text-primary" />
                <span className="text-sm font-medium text-foreground">{candidate.file_name}</span>
              </div>
            )}
            {candidate.extracted_text ? (
              <pre className="text-sm text-muted-foreground font-body whitespace-pre-wrap leading-relaxed max-h-[60vh] overflow-y-auto">
                {candidate.extracted_text}
              </pre>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                {ar ? "لا يوجد نص مستخرج" : "No extracted text available"}
              </p>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="notes" className="mt-4 space-y-3">
          <Card className="p-4">
            <div className="flex gap-2">
              <Textarea
                placeholder={ar ? "أضف ملاحظة..." : "Add a note..."}
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                className="bg-card"
                rows={2}
              />
              <Button size="sm" onClick={handleAddNote} disabled={savingNote || !newNote.trim()} className="self-end">
                {savingNote ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <StickyNote size={14} />}
              </Button>
            </div>
          </Card>
          {notes.map((n) => (
            <Card key={n.id} className="p-3">
              <p className="text-sm text-foreground font-body">{n.content}</p>
              <p className="text-[10px] text-muted-foreground mt-1">{new Date(n.created_at).toLocaleString()}</p>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
};

// ─── Sub-components ──────────────────────────────────────────────────────────

function ExecutivePill({ label, value, valueClassName }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2 min-w-[110px] text-center">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={`text-sm font-display font-bold mt-1 ${valueClassName || "text-foreground"}`}>{value}</div>
    </div>
  );
}

function ExecutiveStat({ title, value, icon: Icon }: { title: string; value: string; icon: any }) {
  return (
    <div className="rounded-lg bg-muted/40 p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
        <Icon size={13} className="text-primary" />
        {title}
      </div>
      <div className="text-sm font-medium text-foreground leading-6">{value}</div>
    </div>
  );
}

function SummaryLabel({ label, value, valueClassName }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div>
      <div className="text-[11px] text-muted-foreground mb-1">{label}</div>
      <div className={`text-sm font-medium leading-6 ${valueClassName || "text-foreground"}`}>{value}</div>
    </div>
  );
}

function ScoreRow({ label, value }: { label: string; value: number | null }) {
  const normalized = value == null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="text-foreground font-medium">{label}</span>
        <span className={getFitColor(value)}>{value ?? "—"}</span>
      </div>
      <Progress value={normalized} />
    </div>
  );
}

function ListCard({
  title,
  icon: Icon,
  iconClassName,
  items,
  empty,
}: {
  title: string;
  icon: any;
  iconClassName: string;
  items: string[];
  empty: string;
}) {
  return (
    <Card className="p-4">
      <h3 className="text-sm font-display font-semibold text-foreground flex items-center gap-1.5 mb-3">
        <Icon size={14} className={iconClassName} /> {title}
      </h3>
      {items.length ? (
        <ul className="space-y-2">
          {items.map((item, index) => (
            <li key={`${title}-${index}`} className="text-sm text-muted-foreground flex items-start gap-2 leading-7">
              <span className="mt-2 h-1.5 w-1.5 rounded-full bg-current shrink-0" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{empty}</p>
      )}
    </Card>
  );
}

// ─── Report normalizer ────────────────────────────────────────────────────────

function normalizeReport(raw: any) {
  const executive = raw?.executive_hiring_summary || {};
  const scoringTable = raw?.scoring_table || {};
  const hiringRecommendation = raw?.hiring_recommendation || {};

  const strengths = normalizeStringArray(raw?.strengths || raw?.top_strengths);
  const risks = normalizeStringArray(raw?.risks || raw?.concerns || raw?.red_flags);
  const missingRequirements = normalizeStringArray(raw?.missing_requirements || raw?.missing_info);
  const interviewFocusAreas = normalizeStringArray(raw?.interview_focus_areas || raw?.interview_focus);

  return {
    executive: {
      candidateLevel: firstNonEmpty([executive?.candidate_level, raw?.seniority_estimate]),
      bestFitRoles: normalizeStringArray(executive?.best_fit_roles || raw?.role_fit),
      overallFitScore:
        normalizeNumber(executive?.overall_fit_score) ||
        normalizeNumber(scoringTable?.role_match) ||
        normalizeNumber(raw?.score),
    },
    summaryText: firstNonEmpty([executive?.summary, raw?.executive_summary]) || firstNonEmpty(strengths) || "—",
    strengths,
    risks,
    missingRequirements,
    interviewFocusAreas,
    decision: firstNonEmpty([hiringRecommendation?.decision, raw?.recommendation, raw?.fit_label]),
    reasoning: firstNonEmpty([hiringRecommendation?.reasoning]),
    whyThisCandidate: firstNonEmpty([raw?.why_this_candidate, strengths[0]]),
    whyNotThisCandidate: firstNonEmpty([raw?.why_not_this_candidate, risks[0]]),
    scoreItems: [
      { key: "ats", label: "ATS Compatibility", value: normalizeNumber(scoringTable?.ats_compatibility) },
      { key: "role", label: "Role Match", value: normalizeNumber(scoringTable?.role_match) },
      {
        key: "depth",
        label: "Experience Depth",
        value: normalizeNumber(scoringTable?.experience_depth || raw?.experience_quality_score),
      },
      {
        key: "skills",
        label: "Skill Relevance",
        value: normalizeNumber(scoringTable?.skill_relevance || raw?.skills_match_score),
      },
      {
        key: "progress",
        label: "Career Progression",
        value: normalizeNumber(scoringTable?.career_progression || raw?.career_progression_score),
      },
      { key: "stability", label: "Stability", value: normalizeNumber(raw?.stability_score) },
      { key: "education", label: "Education Strength", value: normalizeNumber(raw?.education_strength_score) },
    ],
  };
}

function normalizeStringArray(input: any): string[] {
  if (Array.isArray(input)) return input.map((i) => String(i || "").trim()).filter(Boolean);
  if (typeof input === "string" && input.trim())
    return input
      .split(/\n|•|- /)
      .map((i) => i.trim())
      .filter(Boolean);
  return [];
}

function normalizeNumber(value: any): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? Math.max(0, Math.min(100, Math.round(num))) : null;
}

function firstNonEmpty(values: any): string {
  const list = Array.isArray(values) ? values : [values];
  for (const v of list) if (typeof v === "string" && v.trim()) return v.trim();
  return "";
}

function getExperienceLabel(years: number | null | undefined, ar: boolean) {
  if (years == null) return ar ? "غير محدد" : "Not specified";
  if (years < 2) return "Junior";
  if (years < 6) return "Mid-Level";
  return "Senior";
}

function getFitColor(score: number | null | undefined) {
  if (score == null) return "text-muted-foreground";
  if (score >= 80) return "text-success";
  if (score >= 60) return "text-primary";
  if (score >= 40) return "text-yellow-600";
  return "text-destructive";
}

function getDecisionColor(decision?: string) {
  const v = String(decision || "").toLowerCase();
  if (v.includes("strong")) return "text-success";
  if (v.includes("reject") || v.includes("weak")) return "text-destructive";
  if (v.includes("consider") || v.includes("potential")) return "text-primary";
  return "text-foreground";
}

export default RecruiterCandidateProfile;
