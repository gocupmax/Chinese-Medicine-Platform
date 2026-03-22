import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BookOpen, Upload, Brain, GraduationCap, Plus, Trash2, FileText, Music, Video, Sparkles, BarChart3, Smartphone, ChevronRight, Loader2 } from "lucide-react";
import type { Semester, Subject, Material } from "@shared/schema";
import { Link } from "wouter";

const YEAR_LABELS = ["第一學年", "第二學年", "第三學年", "第四學年（實習）"];
const SEMESTER_LABELS = ["上學期", "下學期"];
const SUBJECT_ICONS = ["📚", "🌿", "💊", "🔬", "🏥", "🧬", "🫀", "🦴", "🧠", "🩺", "⚕️", "🍵"];

export default function AdminDashboard() {
  const { toast } = useToast();
  const [selectedSemesterId, setSelectedSemesterId] = useState<number | null>(null);
  const [newSubjectName, setNewSubjectName] = useState("");
  const [newSubjectIcon, setNewSubjectIcon] = useState("📚");
  const [addSemesterOpen, setAddSemesterOpen] = useState(false);
  const [addSubjectOpen, setAddSubjectOpen] = useState(false);
  const [newYear, setNewYear] = useState("1");
  const [newSem, setNewSem] = useState("1");

  const { data: semesters = [] } = useQuery<Semester[]>({
    queryKey: ["/api/semesters"],
  });

  const { data: subjects = [] } = useQuery<Subject[]>({
    queryKey: ["/api/subjects", selectedSemesterId],
    queryFn: async () => {
      const url = selectedSemesterId
        ? `/api/subjects?semesterId=${selectedSemesterId}`
        : "/api/subjects";
      const res = await apiRequest("GET", url);
      return res.json();
    },
  });

  const { data: todayStats } = useQuery({
    queryKey: ["/api/stats/today"],
  });

  const createSemester = useMutation({
    mutationFn: async () => {
      const y = parseInt(newYear);
      const s = parseInt(newSem);
      const name = `${YEAR_LABELS[y - 1]} ${SEMESTER_LABELS[s - 1]}`;
      return apiRequest("POST", "/api/semesters", { year: y, semester: s, name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/semesters"] });
      setAddSemesterOpen(false);
      toast({ title: "學期已添加" });
    },
  });

  const createSubject = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/subjects", {
        semesterId: selectedSemesterId,
        name: newSubjectName,
        icon: newSubjectIcon,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subjects"] });
      setAddSubjectOpen(false);
      setNewSubjectName("");
      toast({ title: "學科已添加" });
    },
  });

  const deleteSemester = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/semesters/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/semesters"] });
      setSelectedSemesterId(null);
      toast({ title: "學期已刪除" });
    },
  });

  const deleteSubject = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/subjects/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subjects"] });
      toast({ title: "學科已刪除" });
    },
  });

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <div className="w-72 border-r border-border bg-sidebar flex flex-col">
        <div className="p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <span className="text-xl">🏥</span>
            </div>
            <div>
              <h1 className="text-base font-bold text-foreground" data-testid="text-app-title">岐黃學堂</h1>
              <p className="text-xs text-muted-foreground">中醫碩士學習平台</p>
            </div>
          </div>
        </div>

        <div className="p-3">
          <div className="flex items-center justify-between mb-2 px-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">學期</span>
            <Dialog open={addSemesterOpen} onOpenChange={setAddSemesterOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" data-testid="button-add-semester">
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>添加學期</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  <Select value={newYear} onValueChange={setNewYear}>
                    <SelectTrigger><SelectValue placeholder="選擇學年" /></SelectTrigger>
                    <SelectContent>
                      {YEAR_LABELS.map((l, i) => (
                        <SelectItem key={i} value={String(i + 1)}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={newSem} onValueChange={setNewSem}>
                    <SelectTrigger><SelectValue placeholder="選擇學期" /></SelectTrigger>
                    <SelectContent>
                      {SEMESTER_LABELS.map((l, i) => (
                        <SelectItem key={i} value={String(i + 1)}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button onClick={() => createSemester.mutate()} disabled={createSemester.isPending} className="w-full" data-testid="button-confirm-add-semester">
                    {createSemester.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    確認添加
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <ScrollArea className="h-[calc(100vh-280px)]">
            <div className="space-y-1">
              {semesters
                .sort((a, b) => a.year * 10 + a.semester - (b.year * 10 + b.semester))
                .map((sem) => (
                <button
                  key={sem.id}
                  onClick={() => setSelectedSemesterId(sem.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors flex items-center justify-between group ${
                    selectedSemesterId === sem.id
                      ? "bg-primary/10 text-primary font-medium"
                      : "hover:bg-accent text-foreground"
                  }`}
                  data-testid={`button-semester-${sem.id}`}
                >
                  <div className="flex items-center gap-2">
                    <GraduationCap className="h-4 w-4 flex-shrink-0" />
                    <span className="truncate">{sem.name}</span>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteSemester.mutate(sem.id); }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:text-destructive"
                    data-testid={`button-delete-semester-${sem.id}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>

        <div className="mt-auto p-3 border-t border-border">
          <Link href="/study">
            <Button variant="outline" className="w-full justify-start gap-2" data-testid="button-mobile-view">
              <Smartphone className="h-4 w-4" />
              切換到手機學習模式
            </Button>
          </Link>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        {!selectedSemesterId ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-4 max-w-md">
              <div className="w-20 h-20 mx-auto rounded-2xl bg-primary/5 flex items-center justify-center">
                <BookOpen className="h-10 w-10 text-primary/40" />
              </div>
              <h2 className="text-lg font-semibold text-foreground">選擇學期開始管理</h2>
              <p className="text-sm text-muted-foreground">
                從左側選擇一個學期，或添加新的學期來開始建立你的中醫學習課程。
              </p>
            </div>
          </div>
        ) : (
          <div className="p-6">
            {/* Header with stats */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold" data-testid="text-semester-title">
                  {semesters.find(s => s.id === selectedSemesterId)?.name}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">管理學科、上傳資料、生成學習內容</p>
              </div>
              <div className="flex items-center gap-3">
                {(todayStats as any)?.streak > 0 && (
                  <Badge variant="secondary" className="gap-1">
                    🔥 連續 {(todayStats as any)?.streak} 天
                  </Badge>
                )}
                <Dialog open={addSubjectOpen} onOpenChange={setAddSubjectOpen}>
                  <DialogTrigger asChild>
                    <Button className="gap-2" data-testid="button-add-subject">
                      <Plus className="h-4 w-4" />
                      添加學科
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>添加新學科</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 mt-4">
                      <Input
                        placeholder="學科名稱（如：中醫基礎理論）"
                        value={newSubjectName}
                        onChange={(e) => setNewSubjectName(e.target.value)}
                        data-testid="input-subject-name"
                      />
                      <div>
                        <p className="text-sm text-muted-foreground mb-2">選擇圖標</p>
                        <div className="flex flex-wrap gap-2">
                          {SUBJECT_ICONS.map((icon) => (
                            <button
                              key={icon}
                              onClick={() => setNewSubjectIcon(icon)}
                              className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg transition-all ${
                                newSubjectIcon === icon
                                  ? "bg-primary/10 ring-2 ring-primary"
                                  : "bg-secondary hover:bg-accent"
                              }`}
                            >
                              {icon}
                            </button>
                          ))}
                        </div>
                      </div>
                      <Button
                        onClick={() => createSubject.mutate()}
                        disabled={!newSubjectName.trim() || createSubject.isPending}
                        className="w-full"
                        data-testid="button-confirm-add-subject"
                      >
                        {createSubject.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        確認添加
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            {/* Subject Grid */}
            {subjects.length === 0 ? (
              <div className="text-center py-16 space-y-3">
                <div className="w-16 h-16 mx-auto rounded-xl bg-muted flex items-center justify-center">
                  <BookOpen className="h-8 w-8 text-muted-foreground" />
                </div>
                <p className="text-muted-foreground">尚未添加學科</p>
                <p className="text-sm text-muted-foreground">點擊「添加學科」開始</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {subjects.map((subject) => (
                  <SubjectCard key={subject.id} subject={subject} onDelete={() => deleteSubject.mutate(subject.id)} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SubjectCard({ subject, onDelete }: { subject: Subject; onDelete: () => void }) {
  const { data: materials = [] } = useQuery<Material[]>({
    queryKey: ["/api/materials", subject.id],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/materials?subjectId=${subject.id}`);
      return res.json();
    },
  });

  const { data: accuracy } = useQuery({
    queryKey: ["/api/stats/subject", subject.id],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/stats/subject/${subject.id}`);
      return res.json();
    },
  });

  return (
    <Card className="group hover:shadow-md transition-all" data-testid={`card-subject-${subject.id}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-primary/5 flex items-center justify-center text-xl">
              {subject.icon || "📚"}
            </div>
            <div>
              <CardTitle className="text-base">{subject.name}</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {materials.length} 份資料
              </p>
            </div>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md hover:bg-destructive/10 hover:text-destructive"
            data-testid={`button-delete-subject-${subject.id}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Accuracy bar */}
        {(accuracy as any)?.total > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">準確率</span>
              <span className="font-medium">{(accuracy as any)?.accuracy}%</span>
            </div>
            <Progress value={(accuracy as any)?.accuracy || 0} className="h-1.5" />
          </div>
        )}

        {/* Material type icons */}
        {materials.length > 0 && (
          <div className="flex gap-1.5 flex-wrap">
            {materials.slice(0, 5).map((m) => (
              <Badge key={m.id} variant="secondary" className="text-xs gap-1 py-0.5">
                {m.fileType === "ppt" && <FileText className="h-3 w-3" />}
                {m.fileType === "pdf" && <FileText className="h-3 w-3" />}
                {m.fileType === "audio" && <Music className="h-3 w-3" />}
                {m.fileType === "video" && <Video className="h-3 w-3" />}
                {!["ppt", "pdf", "audio", "video"].includes(m.fileType) && <FileText className="h-3 w-3" />}
                {m.filename.length > 12 ? m.filename.substring(0, 12) + "..." : m.filename}
              </Badge>
            ))}
            {materials.length > 5 && (
              <Badge variant="secondary" className="text-xs">+{materials.length - 5}</Badge>
            )}
          </div>
        )}

        <Separator />

        {/* Actions */}
        <div className="flex gap-2">
          <Link href={`/subject/${subject.id}`} className="flex-1">
            <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs" data-testid={`button-manage-subject-${subject.id}`}>
              <Upload className="h-3 w-3" />
              管理
            </Button>
          </Link>
          <Link href={`/learn/${subject.id}`} className="flex-1">
            <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs" data-testid={`button-learn-subject-${subject.id}`}>
              <Brain className="h-3 w-3" />
              學習
            </Button>
          </Link>
          <Link href={`/quiz/${subject.id}`} className="flex-1">
            <Button size="sm" className="w-full gap-1.5 text-xs" data-testid={`button-quiz-subject-${subject.id}`}>
              <Sparkles className="h-3 w-3" />
              測驗
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
