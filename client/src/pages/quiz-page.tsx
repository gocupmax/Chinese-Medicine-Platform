import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useParams, Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowLeft, X, Heart, Star, Sparkles, ChevronRight, Trophy, Flame,
  CheckCircle, XCircle, Loader2, Brain, RotateCcw, Home, BookOpen
} from "lucide-react";
import type { Subject, Question } from "@shared/schema";

const ENCOURAGEMENTS_CORRECT = [
  "太棒了！🎉", "妙手回春！💪", "學富五車！📚", "醫術精湛！⭐",
  "了不起！🌟", "華佗再世！🏆", "繼續保持！✨", "正確無誤！👏",
];
const ENCOURAGEMENTS_WRONG = [
  "別灰心，繼續加油！💪", "失敗乃成功之母 📖", "學無止境，再接再厲 🌿",
  "不要緊，記住就好 ✊", "下次一定答對 🎯", "溫故而知新 📚",
];

function getRandomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export default function QuizPage() {
  const { subjectId, materialIds: materialIdsParam } = useParams<{ subjectId?: string; materialIds?: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // Determine quiz mode: by material or by subject
  const isMaterialMode = !!materialIdsParam;
  const materialIds = materialIdsParam ? materialIdsParam.split(",").map(s => parseInt(s.trim())).filter(n => !isNaN(n)) : [];
  const sid = subjectId ? parseInt(subjectId) : 0;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [hearts, setHearts] = useState(5);
  const [quizComplete, setQuizComplete] = useState(false);
  const [encouragement, setEncouragement] = useState("");
  const [animClass, setAnimClass] = useState("");

  const { data: subject } = useQuery<Subject>({
    queryKey: ["/api/subjects", sid],
    queryFn: async () => {
      if (!sid) return null;
      const res = await apiRequest("GET", `/api/subjects/${sid}`);
      return res.json();
    },
    enabled: !!sid,
  });

  const queryParam = isMaterialMode
    ? `materialId=${materialIds.join(",")}&count=10`
    : `subjectId=${sid}&count=10`;

  const { data: questions = [], isLoading } = useQuery<Question[]>({
    queryKey: ["/api/questions/random", queryParam],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/questions/random?${queryParam}`);
      return res.json();
    },
  });

  const submitAnswer = useMutation({
    mutationFn: async ({ questionId, answer, correct }: { questionId: number; answer: string; correct: boolean }) => {
      return apiRequest("POST", "/api/study-records", {
        subjectId: sid,
        questionId,
        isCorrect: correct ? 1 : 0,
        userAnswer: answer,
        studiedAt: new Date().toISOString(),
        sessionType: "quiz",
      });
    },
  });

  const getExplanation = useMutation({
    mutationFn: async ({ questionId, userAnswer, isCorrect }: { questionId: number; userAnswer: string; isCorrect: boolean }) => {
      const res = await apiRequest("POST", "/api/ai/explain", { questionId, userAnswer, isCorrect });
      return res.json();
    },
    onSuccess: (data) => {
      setAiExplanation(data.explanation);
    },
  });

  const currentQuestion = questions[currentIndex];
  const totalQuestions = questions.length;
  const progress = totalQuestions > 0 ? ((currentIndex) / totalQuestions) * 100 : 0;

  // Normalize correct answer for comparison
  const normalizeAnswer = (answer: string, questionType: string): string => {
    const a = answer.trim().toUpperCase();
    if (questionType === "truefalse") {
      // Normalize various true/false representations
      if (["T", "TRUE", "正確", "對", "是"].includes(a)) return "T";
      if (["F", "FALSE", "錯誤", "錯", "否"].includes(a)) return "F";
    }
    return a;
  };

  const handleAnswer = (answer: string) => {
    if (showResult) return;
    setSelectedAnswer(answer);
    
    let correct = false;
    if (currentQuestion.questionType === "essay") {
      // Essay questions are always "submitted" - AI will grade later
      correct = true; // Don't penalize hearts for essays
    } else {
      const normalizedUser = normalizeAnswer(answer, currentQuestion.questionType);
      const normalizedCorrect = normalizeAnswer(currentQuestion.correctAnswer, currentQuestion.questionType);
      correct = normalizedUser === normalizedCorrect;
    }
    
    setIsCorrect(correct);
    setShowResult(true);

    if (correct) {
      setScore(s => s + 1);
      setEncouragement(getRandomItem(ENCOURAGEMENTS_CORRECT));
      setAnimClass("animate-correct");
    } else {
      setHearts(h => Math.max(0, h - 1));
      setEncouragement(getRandomItem(ENCOURAGEMENTS_WRONG));
      setAnimClass("animate-wrong");
    }

    // Submit record
    submitAnswer.mutate({ questionId: currentQuestion.id, answer, correct });

    // Show the pre-stored explanation immediately, do NOT call AI automatically
    // AI explanation is available on-demand via the button below

    setTimeout(() => setAnimClass(""), 500);
  };

  const handleNext = () => {
    if (hearts <= 0 || currentIndex >= totalQuestions - 1) {
      setQuizComplete(true);
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      return;
    }
    setCurrentIndex(i => i + 1);
    setSelectedAnswer(null);
    setShowResult(false);
    setAiExplanation(null);
    setAnimClass("");
  };

  const handleRestart = () => {
    setCurrentIndex(0);
    setSelectedAnswer(null);
    setShowResult(false);
    setIsCorrect(false);
    setAiExplanation(null);
    setScore(0);
    setHearts(5);
    setQuizComplete(false);
    setEncouragement("");
    setAnimClass("");
    queryClient.invalidateQueries({ queryKey: ["/api/questions/random", sid] });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-sm text-muted-foreground">載入題目中...</p>
        </div>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4 max-w-sm px-4">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-muted flex items-center justify-center">
            <Sparkles className="h-8 w-8 text-muted-foreground/40" />
          </div>
          <p className="font-medium">此科目尚未生成題目</p>
          <p className="text-sm text-muted-foreground">請先在管理後台上傳學習資料並生成題目</p>
          <Link href={`/subject/${sid}`}>
            <Button className="mt-2">前往管理</Button>
          </Link>
        </div>
      </div>
    );
  }

  // Quiz Complete Screen
  if (quizComplete) {
    const accuracy = totalQuestions > 0 ? Math.round((score / totalQuestions) * 100) : 0;
    const starCount = accuracy >= 90 ? 3 : accuracy >= 70 ? 2 : accuracy >= 50 ? 1 : 0;

    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-sm w-full text-center space-y-6">
          {/* Trophy animation area */}
          <div className="animate-correct">
            {accuracy >= 80 ? (
              <div className="w-24 h-24 mx-auto rounded-full bg-yellow-100 dark:bg-yellow-900/20 flex items-center justify-center">
                <Trophy className="h-12 w-12 text-yellow-500" />
              </div>
            ) : accuracy >= 50 ? (
              <div className="w-24 h-24 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
                <Star className="h-12 w-12 text-primary" />
              </div>
            ) : (
              <div className="w-24 h-24 mx-auto rounded-full bg-muted flex items-center justify-center">
                <Brain className="h-12 w-12 text-muted-foreground" />
              </div>
            )}
          </div>

          <div>
            <h2 className="text-xl font-bold" data-testid="text-quiz-complete">
              {accuracy >= 80 ? "太棒了！" : accuracy >= 50 ? "繼續加油！" : "不要氣餒！"}
            </h2>
            <p className="text-muted-foreground text-sm mt-1">
              {subject?.name} - 練習完成
            </p>
          </div>

          {/* Stars */}
          <div className="flex justify-center gap-2">
            {[1, 2, 3].map((s) => (
              <Star
                key={s}
                className={`h-10 w-10 transition-all ${
                  s <= starCount
                    ? "text-yellow-400 fill-yellow-400"
                    : "text-muted"
                }`}
              />
            ))}
          </div>

          {/* Stats */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">正確率</span>
                <span className="text-sm font-bold text-primary">{accuracy}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">答對</span>
                <span className="text-sm font-medium">{score} / {totalQuestions}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">剩餘生命</span>
                <span className="text-sm">{Array(hearts).fill("❤️").join("")}{Array(5 - hearts).fill("🖤").join("")}</span>
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button variant="outline" onClick={handleRestart} className="flex-1 gap-2" data-testid="button-restart-quiz">
              <RotateCcw className="h-4 w-4" />
              再來一次
            </Button>
            <Link href="/study" className="flex-1">
              <Button className="w-full gap-2" data-testid="button-back-home">
                <Home className="h-4 w-4" />
                返回首頁
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Parse options
  const options: string[] = currentQuestion.options ? JSON.parse(currentQuestion.options) : [];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top Bar */}
      <div className="sticky top-0 z-10 bg-card/95 backdrop-blur-sm border-b border-border">
        <div className="max-w-lg mx-auto px-4 py-3">
          <div className="flex items-center gap-3 mb-2">
            <Link href="/study">
              <button className="p-1" data-testid="button-quit-quiz">
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </Link>
            <Progress value={progress} className="flex-1 h-2.5" />
            <div className="flex items-center gap-1 text-red-400 min-w-[50px] justify-end">
              <Heart className="h-4 w-4 fill-current" />
              <span className="text-sm font-bold">{hearts}</span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{subject?.name}</span>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                {currentIndex + 1} / {totalQuestions}
              </Badge>
              <Badge variant="outline" className="text-xs gap-1">
                <Star className="h-3 w-3" />
                {score}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Question Area */}
      <div className="flex-1 flex flex-col max-w-lg mx-auto w-full px-4 py-6">
        <div className={`flex-1 ${animClass}`}>
          {/* Difficulty indicator */}
          <div className="flex items-center gap-1 mb-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className={`h-1 w-6 rounded-full ${
                  i < currentQuestion.difficulty ? "bg-primary" : "bg-muted"
                }`}
              />
            ))}
            <span className="text-xs text-muted-foreground ml-1">
              {currentQuestion.difficulty === 1 ? "基礎" : currentQuestion.difficulty === 2 ? "進階" : "挑戰"}
            </span>
          </div>

          {/* Question */}
          <h2 className="text-base font-semibold leading-relaxed mb-6" data-testid="text-question">
            {currentQuestion.questionText}
          </h2>

          {/* Options */}
          {currentQuestion.questionType === "mc" ? (
            <div className="space-y-3">
              {options.map((option, idx) => {
                const optionLetter = option.charAt(0);
                const isSelected = selectedAnswer === optionLetter;
                const isCorrectAnswer = optionLetter === currentQuestion.correctAnswer;

                let borderClass = "border-border hover:border-primary/50 hover:bg-primary/5";
                if (showResult) {
                  if (isCorrectAnswer) {
                    borderClass = "border-green-500 bg-green-50 dark:bg-green-950/20";
                  } else if (isSelected && !isCorrectAnswer) {
                    borderClass = "border-red-400 bg-red-50 dark:bg-red-950/20";
                  } else {
                    borderClass = "border-border opacity-50";
                  }
                } else if (isSelected) {
                  borderClass = "border-primary bg-primary/5";
                }

                return (
                  <button
                    key={idx}
                    onClick={() => handleAnswer(optionLetter)}
                    disabled={showResult}
                    className={`w-full text-left p-4 rounded-xl border-2 transition-all touch-target ${borderClass}`}
                    data-testid={`button-option-${idx}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                        showResult && isCorrectAnswer
                          ? "bg-green-500 text-white"
                          : showResult && isSelected && !isCorrectAnswer
                          ? "bg-red-400 text-white"
                          : isSelected
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      }`}>
                        {showResult && isCorrectAnswer ? (
                          <CheckCircle className="h-4 w-4" />
                        ) : showResult && isSelected && !isCorrectAnswer ? (
                          <XCircle className="h-4 w-4" />
                        ) : (
                          optionLetter
                        )}
                      </div>
                      <span className="text-sm leading-relaxed pt-1">{option.substring(3)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : currentQuestion.questionType === "truefalse" ? (
            <div className="grid grid-cols-2 gap-3">
              {[{ label: "正確", value: "T" }, { label: "錯誤", value: "F" }].map(({ label, value }) => {
                const isSelected = selectedAnswer === value;
                const normalizedCorrectTF = normalizeAnswer(currentQuestion.correctAnswer, "truefalse");
                const isCorrectAnswer = value === normalizedCorrectTF;

                let style = "border-border hover:border-primary/50";
                if (showResult) {
                  if (isCorrectAnswer) style = "border-green-500 bg-green-50 dark:bg-green-950/20";
                  else if (isSelected) style = "border-red-400 bg-red-50 dark:bg-red-950/20";
                  else style = "border-border opacity-50";
                } else if (isSelected) {
                  style = "border-primary bg-primary/5";
                }

                return (
                  <button
                    key={value}
                    onClick={() => handleAnswer(value)}
                    disabled={showResult}
                    className={`p-6 rounded-xl border-2 text-center font-medium transition-all touch-target ${style}`}
                    data-testid={`button-tf-${value}`}
                  >
                    <span className="text-2xl mb-2 block">{value === "T" ? "⭕" : "❌"}</span>
                    <span className="text-sm">{label}</span>
                  </button>
                );
              })}
            </div>
          ) : currentQuestion.questionType === "essay" ? (
            <div className="space-y-3">
              <textarea
                className="w-full min-h-[120px] p-3 rounded-xl border-2 border-border bg-background text-sm leading-relaxed resize-y focus:border-primary focus:outline-none"
                placeholder="請輸入你的答案..."
                value={selectedAnswer || ""}
                onChange={(e) => setSelectedAnswer(e.target.value)}
                disabled={showResult}
                data-testid="textarea-essay"
              />
              {!showResult && (
                <Button
                  onClick={() => handleAnswer(selectedAnswer || "")}
                  disabled={!selectedAnswer?.trim()}
                  className="w-full gap-2"
                >
                  提交答案
                </Button>
              )}
            </div>
          ) : null}
        </div>

        {/* Result & Explanation Area */}
        {showResult && (
          <div className="mt-4 space-y-3">
            {/* Encouragement */}
            <div className={`p-4 rounded-xl text-center ${
              isCorrect
                ? "bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800"
                : "bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800"
            }`}>
              <p className="text-base font-bold" data-testid="text-encouragement">{encouragement}</p>
            </div>

            {/* Explanation - show pre-stored immediately */}
            {/* Explanation - shown immediately, no AI call needed */}
            {currentQuestion.explanation && (
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <BookOpen className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">解題分析：</span>
                  </div>
                  <ScrollArea className="max-h-60">
                    <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90" data-testid="text-explanation">
                      {currentQuestion.explanation}
                    </p>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}

            {/* Next Button */}
            <Button
              onClick={handleNext}
              className="w-full h-12 text-base gap-2"
              data-testid="button-next-question"
            >
              {currentIndex >= totalQuestions - 1 ? (
                <>
                  查看結果
                  <Trophy className="h-4 w-4" />
                </>
              ) : (
                <>
                  下一題
                  <ChevronRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
