import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Link, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { BookOpen, Brain, Flame, Trophy, Target, Monitor, ChevronRight, Sparkles, Play, CheckSquare } from "lucide-react";
import type { Semester, Subject, Material } from "@shared/schema";

export default function MobileStudy() {
  const [, setLocation] = useLocation();
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<number[]>([]);
  const [selectMode, setSelectMode] = useState(false);

  const { data: semesters = [] } = useQuery<Semester[]>({ queryKey: ["/api/semesters"] });

  const { data: allSubjects = [] } = useQuery<Subject[]>({
    queryKey: ["/api/subjects"],
    queryFn: async () => { const res = await apiRequest("GET", "/api/subjects"); return res.json(); },
  });

  const { data: todayData } = useQuery<{ today: any; streak: number }>({ queryKey: ["/api/stats/today"] });
  const { data: dailyStats = [] } = useQuery<any[]>({ queryKey: ["/api/stats/daily"] });

  const streak = todayData?.streak || 0;
  const todayAnswered = todayData?.today?.questionsAnswered || 0;
  const todayCorrect = todayData?.today?.correctCount || 0;
  const todayAccuracy = todayAnswered > 0 ? Math.round((todayCorrect / todayAnswered) * 100) : 0;

  const toggleMaterial = (id: number) => {
    setSelectedMaterialIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const startMixedQuiz = () => {
    if (selectedMaterialIds.length > 0) {
      setLocation(`/quiz/m/${selectedMaterialIds.join(",")}`);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-card/95 backdrop-blur-sm border-b border-border">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <span className="text-lg">🏥</span>
            </div>
            <h1 className="text-base font-bold">岐黃學堂</h1>
          </div>
          <div className="flex items-center gap-3">
            {streak > 0 && (
              <div className="flex items-center gap-1 text-orange-500">
                <Flame className="h-5 w-5" />
                <span className="text-sm font-bold">{streak}</span>
              </div>
            )}
            <Link href="/admin">
              <Button variant="ghost" size="sm" className="gap-1 text-xs">
                <Monitor className="h-3.5 w-3.5" />
                PC
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-5">
        {/* Today's Stats */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <div className="relative w-16 h-16 flex-shrink-0">
                <svg viewBox="0 0 64 64" className="w-16 h-16 -rotate-90">
                  <circle cx="32" cy="32" r="28" stroke="hsl(var(--muted))" strokeWidth="4" fill="none" />
                  <circle cx="32" cy="32" r="28" stroke="hsl(var(--primary))" strokeWidth="4" fill="none" strokeDasharray={`${(todayAnswered / 20) * 175.9} 175.9`} strokeLinecap="round" />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-lg font-bold">{todayAnswered}</span>
                  <span className="text-[10px] text-muted-foreground">今日</span>
                </div>
              </div>
              <div className="flex-1 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">今日目標 (20題)</span>
                  <span className="text-xs font-medium text-primary">{Math.min(100, Math.round((todayAnswered / 20) * 100))}%</span>
                </div>
                <Progress value={Math.min(100, (todayAnswered / 20) * 100)} className="h-2" />
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Target className="h-3 w-3" /> 正確率 {todayAccuracy}%</span>
                  <span className="flex items-center gap-1"><Trophy className="h-3 w-3" /> 答對 {todayCorrect} 題</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Select mode controls */}
        <div className="flex items-center justify-between">
          <Button
            variant={selectMode ? "default" : "outline"}
            size="sm"
            onClick={() => { setSelectMode(!selectMode); setSelectedMaterialIds([]); }}
            className="gap-1.5"
          >
            <CheckSquare className="h-3.5 w-3.5" />
            {selectMode ? "取消多選" : "混合課題測驗"}
          </Button>
          {selectMode && selectedMaterialIds.length > 0 && (
            <Button size="sm" onClick={startMixedQuiz} className="gap-1.5">
              <Play className="h-3.5 w-3.5" />
              開始測驗 ({selectedMaterialIds.length} 課題)
            </Button>
          )}
        </div>
        {selectMode && (
          <p className="text-xs text-muted-foreground">勾選想要混合測驗的課堂 PDF，可同時選擇多個</p>
        )}

        {/* Subject list with materials */}
        {semesters
          .sort((a, b) => a.year * 10 + a.semester - (b.year * 10 + b.semester))
          .map(sem => {
            const subjects = allSubjects.filter(s => s.semesterId === sem.id);
            if (subjects.length === 0) return null;
            return (
              <div key={sem.id}>
                <div className="flex items-center gap-2 mb-3 px-1">
                  <Badge variant="outline" className="text-xs font-medium">{sem.name}</Badge>
                  <div className="flex-1 h-px bg-border" />
                </div>
                <div className="space-y-2">
                  {subjects.map(subject => (
                    <SubjectMaterials
                      key={subject.id}
                      subject={subject}
                      selectMode={selectMode}
                      selectedIds={selectedMaterialIds}
                      onToggle={toggleMaterial}
                    />
                  ))}
                </div>
              </div>
            );
          })}

        {/* Weekly activity */}
        {dailyStats.length > 0 && (
          <Card>
            <CardContent className="p-4">
              <p className="text-sm font-medium mb-3">最近學習記錄</p>
              <div className="flex gap-1.5 justify-center">
                {Array.from({ length: 7 }).map((_, i) => {
                  const date = new Date(); date.setDate(date.getDate() - (6 - i));
                  const dateStr = date.toISOString().split("T")[0];
                  const stat = dailyStats.find((s: any) => s.date === dateStr);
                  const intensity = stat ? Math.min(4, Math.floor((stat as any).questionsAnswered / 5)) : 0;
                  const dayNames = ["日", "一", "二", "三", "四", "五", "六"];
                  return (
                    <div key={i} className="flex flex-col items-center gap-1">
                      <div className={`w-8 h-8 rounded-md flex items-center justify-center text-xs font-medium ${
                        intensity === 0 ? "bg-muted text-muted-foreground" :
                        intensity === 1 ? "bg-primary/20 text-primary" :
                        intensity === 2 ? "bg-primary/40 text-primary" :
                        intensity === 3 ? "bg-primary/60 text-primary-foreground" :
                        "bg-primary text-primary-foreground"
                      }`}>
                        {(stat as any)?.questionsAnswered || ""}
                      </div>
                      <span className="text-[10px] text-muted-foreground">{dayNames[date.getDay()]}</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

// Shows materials under a subject, each is a quiz-able lesson
function SubjectMaterials({ subject, selectMode, selectedIds, onToggle }: {
  subject: Subject; selectMode: boolean; selectedIds: number[]; onToggle: (id: number) => void;
}) {
  const { data: materials = [] } = useQuery<any[]>({
    queryKey: ["/api/materials", subject.id],
    queryFn: async () => { const res = await apiRequest("GET", `/api/materials?subjectId=${subject.id}`); return res.json(); },
  });

  const { data: qByMaterial = {} } = useQuery<Record<number, number>>({
    queryKey: ["/api/questions/by-material", subject.id],
    queryFn: async () => { const res = await apiRequest("GET", `/api/questions/by-material?subjectId=${subject.id}`); return res.json(); },
  });

  const readableMaterials = materials.filter(m => m.isReadable);
  if (readableMaterials.length === 0 && materials.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground px-1 flex items-center gap-1">
        <span>{subject.icon || "📚"}</span> {subject.name}
      </p>
      {readableMaterials.map(m => {
        const qCount = qByMaterial[m.id] || 0;
        const isSelected = selectedIds.includes(m.id);
        const lessonName = m.filename.replace(/\.[^.]+$/, "");
        const href = qCount > 0 ? `/quiz/m/${m.id}` : `/subject/${subject.id}`;

        if (selectMode) {
          return (
            <Card
              key={m.id}
              className={`transition-all active:scale-[0.98] cursor-pointer ${isSelected ? "ring-2 ring-primary bg-primary/5" : ""}`}
              onClick={() => qCount > 0 && onToggle(m.id)}
            >
              <CardContent className="p-3 flex items-center gap-3">
                <Checkbox checked={isSelected} onCheckedChange={() => onToggle(m.id)} disabled={qCount === 0} className="h-5 w-5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{lessonName}</p>
                  <span className="text-xs text-muted-foreground">{qCount > 0 ? `${qCount} 題` : "尚無題目"}</span>
                </div>
              </CardContent>
            </Card>
          );
        }

        return (
          <Link key={m.id} href={href}>
            <Card className="transition-all active:scale-[0.98] cursor-pointer hover:shadow-sm">
              <CardContent className="p-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/5 flex items-center justify-center text-sm flex-shrink-0">📄</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{lessonName}</p>
                  <span className="text-xs text-muted-foreground">{qCount > 0 ? `${qCount} 題` : "尚無題目，點擊前往生成"}</span>
                </div>
                {qCount > 0 ? (
                  <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                    <Brain className="h-4 w-4 text-primary-foreground" />
                  </div>
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                )}
              </CardContent>
            </Card>
          </Link>
        );
      })}
      {/* Show unreadable materials as disabled */}
      {materials.filter(m => !m.isReadable && m.extractedTextLength > 0).map(m => (
        <Card key={m.id} className="opacity-50">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-sm flex-shrink-0">⚠️</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate text-muted-foreground">{m.filename.replace(/\.[^.]+$/, "")}</p>
              <span className="text-xs text-destructive">字體無法解讀</span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
