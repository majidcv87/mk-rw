import {
  LayoutDashboard,
  Users,
  Video,
  Briefcase,
  MessageSquareText,
  BarChart3,
  Settings,
  Globe,
  ArrowRightLeft,
  User,
  LogOut,
  ChevronUp,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation, useNavigate } from "react-router-dom";
import { useLanguage } from "@/i18n/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useAccountType } from "@/contexts/AccountTypeContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";

export function RecruiterSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { language, setLanguage } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { switchView } = useAccountType();
  const ar = language === "ar";

  // User display info
  const fullName: string = (user?.user_metadata?.full_name as string) || "";
  const email: string = user?.email || "";
  const initials = fullName
    ? fullName
        .split(" ")
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : email.slice(0, 2).toUpperCase();

  const mainItems = [
    { title: ar ? "لوحة التحكم" : "Dashboard", url: "/recruiter/dashboard", icon: LayoutDashboard },
    { title: ar ? "المرشحون" : "Candidates", url: "/recruiter/candidates", icon: Users },
    { title: ar ? "المقابلات" : "Interviews", url: "/recruiter/interviews", icon: Video },
    { title: ar ? "الوظائف" : "Jobs", url: "/recruiter/jobs", icon: Briefcase },
    { title: ar ? "أسئلة المقابلة" : "AI Questions", url: "/recruiter/questions", icon: MessageSquareText },
    { title: ar ? "التقارير" : "Reports", url: "/recruiter/reports", icon: BarChart3 },
  ];

  const renderItem = (item: { title: string; url: string; icon: any }) => (
    <SidebarMenuItem key={item.url}>
      <SidebarMenuButton
        asChild
        isActive={location.pathname === item.url || location.pathname.startsWith(item.url + "/")}
      >
        <NavLink
          to={item.url}
          end={item.url === "/recruiter/dashboard"}
          className="hover:bg-muted/50"
          activeClassName="bg-muted text-primary font-medium"
        >
          <item.icon className="h-4 w-4 shrink-0" />
          {!collapsed && <span className="truncate">{item.title}</span>}
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );

  const handleSwitchToSeeker = () => {
    switchView("job_seeker");
    navigate("/dashboard");
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  const toggleLanguage = () => setLanguage(ar ? "en" : "ar");

  return (
    <Sidebar collapsible="icon" side={ar ? "right" : "left"}>
      <SidebarHeader className="p-4">
        {!collapsed && (
          <div className="font-display font-bold text-lg text-foreground">
            TALEN<span className="text-primary">TRY</span>
            <span className="text-xs ml-2 text-muted-foreground font-body">{ar ? "التوظيف" : "Hiring"}</span>
          </div>
        )}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{!collapsed && (ar ? "القائمة" : "Menu")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{mainItems.map(renderItem)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* ── Avatar Footer ── */}
      <SidebarFooter className="p-3 border-t border-sidebar-border">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={`flex items-center w-full rounded-xl px-2 py-2 gap-3 hover:bg-sidebar-accent transition-colors group ${collapsed ? "justify-center" : ""}`}
            >
              <Avatar className="h-8 w-8 shrink-0 ring-2 ring-sidebar-primary/20 group-hover:ring-sidebar-primary/40 transition-all">
                <AvatarImage src={user?.user_metadata?.avatar_url as string} />
                <AvatarFallback className="bg-sidebar-primary/15 text-sidebar-primary text-xs font-bold">
                  {initials}
                </AvatarFallback>
              </Avatar>

              {!collapsed && (
                <>
                  <div className="flex-1 min-w-0 text-start">
                    {fullName && (
                      <p className="text-xs font-semibold text-sidebar-foreground truncate leading-tight">{fullName}</p>
                    )}
                    <p className="text-[10px] text-muted-foreground truncate leading-tight">{email}</p>
                  </div>
                  <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0 group-hover:text-sidebar-foreground transition-colors" />
                </>
              )}
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent side="top" align={ar ? "end" : "start"} sideOffset={8} className="w-56 mb-1">
            {/* User info header */}
            <div className="px-3 py-2 border-b border-border mb-1">
              <p className="text-xs font-semibold text-foreground truncate">{fullName || email}</p>
              {fullName && <p className="text-[10px] text-muted-foreground truncate">{email}</p>}
            </div>

            {/* Profile */}
            <DropdownMenuItem onClick={() => navigate("/profile")} className="gap-2.5 cursor-pointer">
              <User className="h-4 w-4 text-muted-foreground" />
              {ar ? "الملف الشخصي" : "Profile"}
            </DropdownMenuItem>

            {/* Settings */}
            <DropdownMenuItem onClick={() => navigate("/recruiter/settings")} className="gap-2.5 cursor-pointer">
              <Settings className="h-4 w-4 text-muted-foreground" />
              {ar ? "الإعدادات" : "Settings"}
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            {/* Switch to job seeker */}
            <DropdownMenuItem onClick={handleSwitchToSeeker} className="gap-2.5 cursor-pointer">
              <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
              {ar ? "لوحة الباحث عن عمل" : "Job Seeker Panel"}
            </DropdownMenuItem>

            {/* Language */}
            <DropdownMenuItem onClick={toggleLanguage} className="gap-2.5 cursor-pointer">
              <Globe className="h-4 w-4 text-muted-foreground" />
              {ar ? "Switch to English" : "التبديل للعربية"}
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            {/* Sign out */}
            <DropdownMenuItem
              onClick={handleSignOut}
              className="gap-2.5 cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
            >
              <LogOut className="h-4 w-4" />
              {ar ? "تسجيل الخروج" : "Sign Out"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
