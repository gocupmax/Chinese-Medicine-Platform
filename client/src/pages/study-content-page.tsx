import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useParams, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, BookOpen, Brain, Sparkles, ChevronRight, ChevronLeft } from "lucide-react";
import { useState } from "react";
import type { Subject, StudyContent } from "@shared/schema";

export default function StudyContentPage() {
  const { subjectId } = useParams<{ subjectId: string }>();
  const sid = parseInt(subjectId!);
  const [currentContentIndex, setCurrentContentIndex] = useState(0);

  const { data: subject } = useQuery<Subject>({
    queryKey: ["/api/subjects", sid],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/subjects/${sid}`);
      return res.json();
    },
  });

  const { data: studyContents = [] } = useQuery<StudyContent[]>({
    queryKey: ["/api/study-content", sid],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/study-content?subjectId=${sid}`);
      return res.json();
    },
  });

  const currentContent = studyContents[currentContentIndex];

  if (studyContents.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4 max-w-sm px-4">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-muted flex items-center justify-center">
            <BookOpen className="h-8 w-8 text-muted-foreground/40" />
          </div>
          <p className="font-medium">尚未生成學習內容</p>
          <p className="text-sm text-muted-foreground">請先在管理後台上傳學習資料並生成內容</p>
          <Link href={`/subject/${sid}`}>
            <Button className="mt-2">前往管理</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-card/95 backdrop-blur-sm border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/study">
            <Button variant="ghost" size="sm" className="gap-1" data-testid="button-back-study">
              <ArrowLeft className="h-4 w-4" />
              返回
            </Button>
          </Link>
          <div className="text-center">
            <p className="text-sm font-medium">{subject?.name}</p>
            <p className="text-xs text-muted-foreground">
              {currentContentIndex + 1} / {studyContents.length}
            </p>
          </div>
          <Link href={`/quiz/${sid}`}>
            <Button size="sm" variant="outline" className="gap-1" data-testid="button-go-quiz">
              <Sparkles className="h-3.5 w-3.5" />
              做題
            </Button>
          </Link>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Content navigation dots */}
        <div className="flex items-center justify-center gap-1.5 mb-6">
          {studyContents.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentContentIndex(idx)}
              className={`h-2 rounded-full transition-all ${
                idx === currentContentIndex
                  ? "w-6 bg-primary"
                  : "w-2 bg-muted hover:bg-muted-foreground/30"
              }`}
              data-testid={`button-content-dot-${idx}`}
            />
          ))}
        </div>

        {currentContent && (
          <Card className="tcm-scroll" data-testid="card-study-content">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">{currentContent.title}</CardTitle>
              </div>
              <Badge variant="secondary" className="w-fit text-xs">
                {currentContent.contentType === "lesson" ? "📖 課程筆記" :
                 currentContent.contentType === "summary" ? "📝 摘要" :
                 currentContent.contentType === "keypoints" ? "🔑 重點" :
                 currentContent.contentType === "mnemonic" ? "🧠 記憶法" : "📚 學習"}
              </Badge>
            </CardHeader>
            <CardContent>
              <div className="prose prose-sm max-w-none whitespace-pre-wrap leading-relaxed text-foreground/90" data-testid="text-study-content">
                {currentContent.content}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Navigation buttons */}
        <div className="flex gap-3 mt-6">
          <Button
            variant="outline"
            onClick={() => setCurrentContentIndex(i => Math.max(0, i - 1))}
            disabled={currentContentIndex === 0}
            className="flex-1 gap-1"
            data-testid="button-prev-content"
          >
            <ChevronLeft className="h-4 w-4" />
            上一篇
          </Button>
          {currentContentIndex < studyContents.length - 1 ? (
            <Button
              onClick={() => setCurrentContentIndex(i => Math.min(studyContents.length - 1, i + 1))}
              className="flex-1 gap-1"
              data-testid="button-next-content"
            >
              下一篇
              <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Link href={`/quiz/${sid}`} className="flex-1">
              <Button className="w-full gap-1" data-testid="button-start-quiz-from-content">
                開始測驗
                <Sparkles className="h-4 w-4" />
              </Button>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
