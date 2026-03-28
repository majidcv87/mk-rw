import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, User, Mail, Phone, Globe, Building2, Briefcase, BadgeCheck } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/i18n/LanguageContext";
import { useAccountType } from "@/contexts/AccountTypeContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const Profile = () => {
  const { user } = useAuth();
  const { t, language, setLanguage } = useLanguage();
  const { accountType, dbAccountType, switchView, refetch } = useAccountType();
  const isRecruiter = accountType === "recruiter" || dbAccountType === "recruiter";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [resumeCount, setResumeCount] = useState(0);
  const [analysisCount, setAnalysisCount] = useState(0);
  const [generatedCount, setGeneratedCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const [profileRes, resumesRes, analysesRes, generatedRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("user_id", user.id).single(),
        supabase.from("resumes").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("analyses").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("generated_resumes").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      ]);

      if (profileRes.data) {
        setName(profileRes.data.display_name || "");
        setEmail(profileRes.data.email || user.email || "");
        setPhone(profileRes.data.phone || "");
        setCompanyName(profileRes.data.company_name || "");
        setJobTitle(profileRes.data.job_title || "");
        setAvatarUrl(profileRes.data.avatar_url);
      } else {
        setEmail(user.email || "");
      }

      setResumeCount(resumesRes.count || 0);
      setAnalysisCount(analysesRes.count || 0);
      setGeneratedCount(generatedRes.count || 0);
    };
    load();
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);

    const payload = {
      display_name: name.trim() || null,
      phone: phone.trim() || null,
      language,
      company_name: isRecruiter ? companyName.trim() || null : null,
      job_title: isRecruiter ? jobTitle.trim() || null : null,
      onboarding_completed: isRecruiter ? true : undefined,
    };

    const { error } = await supabase.from("profiles").update(payload).eq("user_id", user.id);

    setSaving(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    await refetch();
    if (isRecruiter) switchView("recruiter");
    toast.success(language === "ar" ? "تم حفظ الملف الشخصي والإعدادات" : "Profile and account settings saved");
  };

  const stats = [
    { label: t.dashboard.myResumes, value: resumeCount },
    { label: t.dashboard.myAnalyses, value: analysisCount },
    { label: t.dashboard.myGenerated, value: generatedCount },
  ];

  const backPath = isRecruiter ? "/recruiter/dashboard" : "/dashboard";
  const backTitle = isRecruiter
    ? language === "ar"
      ? "لوحة التوظيف"
      : "Recruiter Dashboard"
    : language === "ar"
      ? "لوحة التحكم"
      : "Dashboard";

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border/80 bg-background/85 backdrop-blur">
        <div className="container flex items-center gap-4 h-16">
          <Button variant="ghost" size="icon" asChild>
            <Link to={backPath}>
              <ArrowLeft size={18} />
            </Link>
          </Button>
          <Link to={backPath} className="font-display text-lg font-bold text-foreground">
            TALEN<span className="text-primary">TRY</span>
          </Link>
          <span className="text-border/60 hidden sm:inline">/</span>
          <h1 className="font-display font-semibold text-foreground text-sm hidden sm:block">
            {language === "ar" ? "الملف الشخصي وإعدادات الحساب" : "Profile & Account Settings"}
          </h1>
        </div>
      </header>

      <main className="container py-8 md:py-12 max-w-2xl space-y-6">
        <div className="flex flex-col items-center mb-2">
          <div className="relative mb-4">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt="avatar"
                className="w-24 h-24 rounded-full object-cover border-2 border-primary/20"
              />
            ) : (
              <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center">
                <User size={36} className="text-primary" />
              </div>
            )}
          </div>
          <h2 className="font-display font-semibold text-lg text-foreground">{name || t.profile.yourProfile}</h2>
          <p className="text-sm text-muted-foreground font-body">{email}</p>
          <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
            <BadgeCheck size={14} className="text-primary" />
            <span>
              {isRecruiter
                ? language === "ar"
                  ? "حساب مسؤول توظيف"
                  : "Recruiter Account"
                : language === "ar"
                  ? "حساب باحث عن عمل"
                  : "Job Seeker Account"}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {stats.map((s) => (
            <div key={s.label} className="text-center p-3 bg-card rounded-xl border border-border">
              <p className="text-2xl font-display font-bold text-primary">{s.value}</p>
              <p className="text-xs text-muted-foreground font-body mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="p-4 bg-card rounded-xl border border-border">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="font-display font-semibold text-foreground">
                {language === "ar" ? "الوصول السريع" : "Quick Access"}
              </h3>
              <p className="text-sm text-muted-foreground font-body mt-1">
                {language === "ar"
                  ? `جميع إعدادات الحساب وبيانات الشركة محفوظة هنا بدل صفحات منفصلة. العودة إلى ${backTitle}.`
                  : `All account settings and company details are saved here instead of separate onboarding/settings pages. Back to ${backTitle}.`}
              </p>
            </div>
            <Button variant="outline" asChild>
              <Link to={backPath}>{language === "ar" ? "عودة" : "Back"}</Link>
            </Button>
          </div>
        </div>

        <div className="space-y-5 p-6 bg-card rounded-xl border border-border">
          <div>
            <h3 className="font-display font-semibold text-foreground text-base">
              {language === "ar" ? "بيانات المستخدم" : "User Information"}
            </h3>
            <p className="text-sm text-muted-foreground font-body mt-1">
              {language === "ar" ? "اسم المستخدم وبيانات الحساب الأساسية" : "Username and essential account details"}
            </p>
          </div>

          <div>
            <label className="text-sm font-display font-medium text-foreground mb-1.5 flex items-center gap-2">
              <User size={14} className="text-muted-foreground" />
              {t.profile.name}
            </label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="bg-background" />
          </div>

          <div>
            <label className="text-sm font-display font-medium text-foreground mb-1.5 flex items-center gap-2">
              <Mail size={14} className="text-muted-foreground" />
              {t.profile.email}
            </label>
            <Input value={email} disabled className="bg-background opacity-60" />
          </div>

          <div>
            <label className="text-sm font-display font-medium text-foreground mb-1.5 flex items-center gap-2">
              <Phone size={14} className="text-muted-foreground" />
              {t.profile.phone}
            </label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+966 5XX XXX XXXX"
              className="bg-background"
            />
          </div>

          {isRecruiter && (
            <>
              <div className="pt-2 border-t border-border" />
              <div>
                <h3 className="font-display font-semibold text-foreground text-base">
                  {language === "ar" ? "بيانات الشركة والتوظيف" : "Company & Hiring Details"}
                </h3>
                <p className="text-sm text-muted-foreground font-body mt-1">
                  {language === "ar"
                    ? "تم دمج الإعدادات والتهيئة هنا. هذه البيانات تبقى محفوظة داخل الملف الشخصي."
                    : "Onboarding and recruiter settings are merged here. These details stay saved in the profile."}
                </p>
              </div>

              <div>
                <label className="text-sm font-display font-medium text-foreground mb-1.5 flex items-center gap-2">
                  <Building2 size={14} className="text-muted-foreground" />
                  {language === "ar" ? "اسم الشركة" : "Company Name"}
                </label>
                <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="bg-background" />
              </div>

              <div>
                <label className="text-sm font-display font-medium text-foreground mb-1.5 flex items-center gap-2">
                  <Briefcase size={14} className="text-muted-foreground" />
                  {language === "ar" ? "المسمى الوظيفي" : "Job Title"}
                </label>
                <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} className="bg-background" />
              </div>
            </>
          )}

          <div className="pt-2 border-t border-border" />
          <div>
            <label className="text-sm font-display font-medium text-foreground mb-1.5 flex items-center gap-2">
              <Globe size={14} className="text-muted-foreground" />
              {t.profile.language}
            </label>
            <div className="flex gap-2">
              <Button variant={language === "en" ? "default" : "outline"} size="sm" onClick={() => setLanguage("en")}>
                English
              </Button>
              <Button variant={language === "ar" ? "default" : "outline"} size="sm" onClick={() => setLanguage("ar")}>
                العربية
              </Button>
            </div>
          </div>

          <Button className="w-full mt-2" onClick={handleSave} disabled={saving}>
            {saving ? t.common.loading : language === "ar" ? "حفظ الملف الشخصي والإعدادات" : "Save Profile & Settings"}
          </Button>
        </div>
      </main>
    </div>
  );
};

export default Profile;
