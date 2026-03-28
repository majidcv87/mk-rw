import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/i18n/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Brain, Video } from "lucide-react";
import { useNavigate } from "react-router-dom";

const RecruiterInterviews = () => {
  const { user } = useAuth();
  const { language } = useLanguage();
  const navigate = useNavigate();
  const ar = language === "ar";
  const [aiInterviews, setAiInterviews] = useState<any[]>([]);
  const [liveInterviews, setLiveInterviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [{ data: ai }, { data: live }] = await Promise.all([
      supabase.from("recruiter_ai_interviews").select("*, recruiter_candidates(name, current_title)").eq("recruiter_id", user.id).order("created_at", { ascending: false }).limit(100),
      supabase.from("recruiter_live_interviews").select("*, recruiter_candidates(name, current_title)").eq("recruiter_id", user.id).order("created_at", { ascending: false }).limit(100),
    ]);
    setAiInterviews(ai || []);
    setLiveInterviews(live || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl mx-auto">
      <h1 className="text-xl font-display font-bold text-foreground">{ar ? "المقابلات" : "Interviews"}</h1>
      <Tabs defaultValue="ai">
        <TabsList>
          <TabsTrigger value="ai"><Brain size={14} className="mr-1.5" /> {ar ? "مقابلات AI" : "AI Interviews"}</TabsTrigger>
          <TabsTrigger value="live"><Video size={14} className="mr-1.5" /> {ar ? "مقابلات حية" : "Live Interviews"}</TabsTrigger>
        </TabsList>
        <TabsContent value="ai" className="mt-4">
          {aiInterviews.length === 0 ? (
            <Card className="p-8 text-center"><p className="text-sm text-muted-foreground">{ar ? "لا توجد مقابلات AI بعد" : "No AI interviews yet"}</p></Card>
          ) : (
            <div className="space-y-2">
              {aiInterviews.map((i: any) => (
                <Card key={i.id} className="p-3 flex items-center justify-between cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => navigate(`/recruiter/candidates/${i.candidate_id}`)}>
                  <div>
                    <p className="text-sm font-medium text-foreground">{i.recruiter_candidates?.name || "—"}</p>
                    <p className="text-xs text-muted-foreground">{i.recruiter_candidates?.current_title || "—"}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {i.overall_score != null && <span className="text-sm font-bold text-primary">{i.overall_score}</span>}
                    <Badge className={i.status === "completed" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}>
                      {i.status}
                    </Badge>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
        <TabsContent value="live" className="mt-4">
          {liveInterviews.length === 0 ? (
            <Card className="p-8 text-center"><p className="text-sm text-muted-foreground">{ar ? "لا توجد مقابلات حية بعد" : "No live interviews yet"}</p></Card>
          ) : (
            <div className="space-y-2">
              {liveInterviews.map((i: any) => (
                <Card key={i.id} className="p-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">{i.recruiter_candidates?.name || "—"}</p>
                    <p className="text-xs text-muted-foreground">{i.scheduled_at ? new Date(i.scheduled_at).toLocaleString() : "—"}</p>
                  </div>
                  <Badge className={i.status === "completed" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}>{i.status}</Badge>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default RecruiterInterviews;
