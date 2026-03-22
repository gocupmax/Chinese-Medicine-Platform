import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest, API_BASE } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useParams, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, Upload, FileText, Music, Video, Trash2, Sparkles, Brain,
  BookOpen, Loader2, CheckCircle, AlertCircle, Play, RefreshCw, Layers
} from "lucide-react";
import type { Subject, Material, StudyContent, Question } from "@shared/schema";

export default function SubjectDetail() {
  const { id } = useParams<{ id: string }>();
  const subjectId = parseInt(id!);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: subject } = useQuery<Subject>({
    queryKey: ["/api/subjects", subjectId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/subjects/${subjectId}`);
      return res.json();
    },
  });

  const { data: materials = [] } = useQuery<Material[]>({
    queryKey: ["/api/materials", subjectId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/materials?subjectId=${subjectId}`);
      return res.json();
    },
  });

  const { data: studyContents = [] } = useQuery<StudyContent[]>({
    queryKey: ["/api/study-content", subjectId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/study-content?subjectId=${subjectId}`);
      return res.json();
    },
  });

  const { data: questions = [] } = useQuery<Question[]>({
    queryKey: ["/api/questions", subjectId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/questions?subjectId=${subjectId}`);
      return res.json();
    },
  });

  const { data: qByMaterial = {} } = useQuery<Record<number, number>>({
    queryKey: ["/api/questions/by-material", subjectId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/questions/by-material?subjectId=${subjectId}`);
      return res.json();
    },
  });

  const [uploadProgress, setUploadProgress] = useState<{ [key: string]: number }>({});
  const [genCount, setGenCount] = useState(10);

  // Batch generation state
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchSelected, setBatchSelected] = useState<number[]>([]);
  const [batchCount, setBatchCount] = useState("30");
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState<Record<number, { status: string; count?: number; error?: string }>>({});

  const uploadMaterial = useMutation({
    mutationFn: async (file: File) => {
      const CHUNK_SIZE = 4 * 1024 * 1024; // 4MB per chunk (Railway proxy limit)
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
      const filename = file.name;

      // Step 1: Initialize upload session
      const initRes = await apiRequest("POST", "/api/materials/upload/init", {
        filename,
        totalChunks,
        subjectId,
      });
      const { uploadId } = await initRes.json();

      // Step 2: Upload chunks with retry
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);

        const formData = new FormData();
        formData.append("chunk", chunk, `chunk_${i}`);
        formData.append("uploadId", uploadId);
        formData.append("chunkIndex", String(i));

        let lastErr = "";
        let success = false;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const chunkRes = await fetch(`${API_BASE}/api/materials/upload/chunk`, {
              method: "POST",
              body: formData,
            });
            if (chunkRes.ok) {
              success = true;
              break;
            }
            lastErr = await chunkRes.text().catch(() => chunkRes.statusText);
          } catch (e: any) {
            lastErr = e.message;
          }
          // Wait before retry
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        }
        if (!success) {
          throw new Error(`分片 ${i + 1}/${totalChunks} 上傳失敗: ${lastErr}`);
        }
        setUploadProgress(prev => ({ ...prev, [filename]: Math.round(((i + 1) / totalChunks) * 100) }));
      }

      // Step 3: Finalize
      const finalRes = await apiRequest("POST", "/api/materials/upload/finalize", { uploadId });
      setUploadProgress(prev => { const n = { ...prev }; delete n[filename]; return n; });
      return finalRes.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/materials", subjectId] });
      toast({ title: "檔案上傳成功", description: "系統正在處理內容..." });
    },
    onError: (e) => {
      setUploadProgress({});
      toast({ title: "上傳失敗", description: e.message, variant: "destructive" });
    },
  });

  const deleteMaterial = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/materials/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/materials", subjectId] });
      toast({ title: "檔案已刪除" });
    },
  });

  const reprocessMaterials = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/materials/reprocess", { subjectId });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/materials", subjectId] });
      const totalK = (data.totalTextExtracted / 1000).toFixed(1);
      toast({
        title: `解析完成：共提取 ${totalK}k 字`,
        description: `成功解析 ${data.processed} 份資料`,
      });
    },
    onError: (e: any) => {
      toast({ title: "解析失敗", description: e.message, variant: "destructive" });
    },
  });

  const generateContent = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ai/generate-study-content", { subjectId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/study-content", subjectId] });
      toast({ title: "學習內容已生成", description: "AI已根據你的資料生成了學習筆記" });
    },
    onError: (e: any) => {
      toast({ title: "生成失敗", description: e.message, variant: "destructive" });
    },
  });

  const generateQuestions = useMutation({
    mutationFn: async (params: { materialId?: number; examType?: string; count?: number }) => {
      const res = await apiRequest("POST", "/api/ai/generate-questions", {
        subjectId,
        materialId: params.materialId,
        count: params.count || 15,
        examType: params.examType,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/questions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/questions/by-material"] });
      toast({ title: "題目已生成", description: "AI已根據課程內容生成了測驗題目" });
    },
    onError: (e: any) => {
      toast({ title: "生成失敗", description: e.message, variant: "destructive" });
    },
  });

  const deleteContent = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/study-content/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/study-content", subjectId] }),
  });

  const deleteQuestion = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/questions/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/questions"] }); queryClient.invalidateQueries({ queryKey: ["/api/questions/by-material"] }); },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      Array.from(files).forEach((file) => uploadMaterial.mutate(file));
    }
    e.target.value = "";
  };

  const fileTypeIcon = (type: string) => {
    switch (type) {
      case "ppt": return <FileText className="h-4 w-4 text-orange-500" />;
      case "pdf": return <FileText className="h-4 w-4 text-red-500" />;
      case "audio": return <Music className="h-4 w-4 text-blue-500" />;
      case "video": return <Video className="h-4 w-4 text-purple-500" />;
      default: return <FileText className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const readableMaterials = materials.filter(m => (m as any).isReadable);

  const toggleBatchItem = (id: number) => {
    setBatchSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const startBatchGeneration = useCallback(async () => {
    if (batchSelected.length === 0) return;
    setBatchRunning(true);
    setBatchProgress({});

    // Initialize all as "pending"
    const initial: Record<number, { status: string }> = {};
    batchSelected.forEach(id => { initial[id] = { status: "pending" }; });
    setBatchProgress(initial);

    try {
      const items = batchSelected.map(materialId => ({ materialId, count: parseInt(batchCount) }));
      const response = await fetch(`${API_BASE}/api/ai/generate-questions-batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // Process SSE events
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.type === "status") {
                  setBatchProgress(prev => ({
                    ...prev,
                    [data.materialId]: { status: "generating" },
                  }));
                } else if (data.type === "progress") {
                  setBatchProgress(prev => ({
                    ...prev,
                    [data.materialId]: {
                      status: data.success ? "done" : "error",
                      count: data.count,
                      error: data.error,
                    },
                  }));
                } else if (data.type === "done") {
                  // Refresh question data
                  queryClient.invalidateQueries({ queryKey: ["/api/questions"] });
                  queryClient.invalidateQueries({ queryKey: ["/api/questions/by-material"] });
                }
              } catch {}
            }
          }
        }
      }
    } catch (e: any) {
      toast({ title: "批量生成失敗", description: e.message, variant: "destructive" });
    } finally {
      setBatchRunning(false);
      queryClient.invalidateQueries({ queryKey: ["/api/questions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/questions/by-material"] });
    }
  }, [batchSelected, batchCount, toast]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="sm" className="gap-1.5" data-testid="button-back">
              <ArrowLeft className="h-4 w-4" />
              返回
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-2xl">{subject?.icon || "📚"}</span>
            <div>
              <h1 className="text-lg font-bold" data-testid="text-subject-name">{subject?.name}</h1>
              <p className="text-xs text-muted-foreground">
                {materials.length} 份資料 · {studyContents.length} 篇學習內容 · {questions.length} 道題目
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6">
        <Tabs defaultValue="materials" className="space-y-6">
          <TabsList className="grid grid-cols-2 w-full max-w-sm">
            <TabsTrigger value="materials" className="gap-1.5" data-testid="tab-materials">
              <Upload className="h-3.5 w-3.5" />
              學習資料
            </TabsTrigger>
            <TabsTrigger value="questions" className="gap-1.5" data-testid="tab-questions">
              <Sparkles className="h-3.5 w-3.5" />
              題庫 ({questions.length} 題)
            </TabsTrigger>
          </TabsList>

          {/* Materials Tab */}
          <TabsContent value="materials" className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <p className="text-sm text-muted-foreground">上傳課程的PPT、錄音、視頻等資料，系統會自動提取內容</p>
              <div className="flex gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".ppt,.pptx,.pdf,.doc,.docx,.txt,.md,.mp3,.wav,.m4a,.mp4,.avi,.mov"
                  className="hidden"
                  onChange={handleFileSelect}
                  data-testid="input-file-upload"
                />
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  className="gap-2"
                  disabled={uploadMaterial.isPending}
                  data-testid="button-upload"
                >
                  {uploadMaterial.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {uploadMaterial.isPending ? "上傳中..." : "上傳檔案"}
                </Button>
                {materials.length > 0 && (
                  <Button
                    variant="outline"
                    onClick={() => reprocessMaterials.mutate()}
                    disabled={reprocessMaterials.isPending}
                    className="gap-2"
                    data-testid="button-reprocess"
                  >
                    {reprocessMaterials.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    {reprocessMaterials.isPending ? "解析中..." : "重新解析所有資料"}
                  </Button>
                )}
              </div>
            </div>

            {/* Upload Progress */}
            {Object.entries(uploadProgress).length > 0 && (
              <div className="space-y-2">
                {Object.entries(uploadProgress).map(([name, pct]) => (
                  <div key={name} className="flex items-center gap-3 p-3 bg-primary/5 rounded-lg">
                    <Loader2 className="h-4 w-4 animate-spin text-primary flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{name}</p>
                      <Progress value={pct} className="h-1.5 mt-1" />
                    </div>
                    <span className="text-xs font-medium text-primary flex-shrink-0">{pct}%</span>
                  </div>
                ))}
              </div>
            )}

            {materials.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-12 text-center">
                  <Upload className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
                  <p className="text-muted-foreground">尚未上傳任何資料</p>
                  <p className="text-sm text-muted-foreground mt-1">支援 PPT、PDF、Word、文字檔、音頻、視頻</p>
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    選擇檔案上傳
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {materials.map((m) => (
                  <Card key={m.id} className="hover:shadow-sm transition-shadow" data-testid={`card-material-${m.id}`}>
                    <CardContent className="py-3 px-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {fileTypeIcon(m.fileType)}
                        <div>
                          <p className="text-sm font-medium">{m.filename}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <Badge variant="secondary" className="text-xs">{m.fileType.toUpperCase()}</Badge>
                            {m.status === "processed" && (m as any).isReadable ? (
                              <span className="flex items-center gap-1 text-xs text-green-600">
                                <CheckCircle className="h-3 w-3" />
                                已提取 {((m as any).extractedTextLength / 1000).toFixed(1)}k 字 ✓
                              </span>
                            ) : m.status === "processed" && (m as any).extractedTextLength > 0 ? (
                              <span className="flex items-center gap-1 text-xs text-orange-500">
                                <AlertCircle className="h-3 w-3" />
                                PDF字體無法解讀，請重新上傳可選取文字的版本
                              </span>
                            ) : m.status === "processed" ? (
                              <span className="flex items-center gap-1 text-xs text-orange-500">
                                <AlertCircle className="h-3 w-3" />
                                未提取到文字
                              </span>
                            ) : m.status === "processing" ? (
                              <span className="flex items-center gap-1 text-xs text-blue-500">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                解析中...
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-xs text-destructive">
                                <AlertCircle className="h-3 w-3" />
                                解析失敗
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteMaterial.mutate(m.id)}
                        className="text-muted-foreground hover:text-destructive"
                        data-testid={`button-delete-material-${m.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Questions Tab - per PDF lesson sections */}
          <TabsContent value="questions" className="space-y-4">
            {/* Count selector + batch button */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">每次生成</span>
                <div className="flex gap-1">
                  {[5, 10, 20, 30, 50].map(n => (
                    <Button key={n} size="sm" variant={genCount === n ? "default" : "outline"} onClick={() => setGenCount(n)} className="h-7 px-2 text-xs">
                      {n}題
                    </Button>
                  ))}
                </div>
              </div>
              {readableMaterials.length > 1 && (
                <Dialog open={batchOpen} onOpenChange={setBatchOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1.5">
                      <Layers className="h-3.5 w-3.5" />
                      批量生成
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>批量生成題目</DialogTitle>
                      <DialogDescription>
                        選擇多份PDF同時生成題目
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      {/* Count selector */}
                      <div className="flex items-center gap-3">
                        <span className="text-sm">每份生成</span>
                        <Select value={batchCount} onValueChange={setBatchCount}>
                          <SelectTrigger className="w-24">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="10">10 題</SelectItem>
                            <SelectItem value="20">20 題</SelectItem>
                            <SelectItem value="30">30 題</SelectItem>
                            <SelectItem value="50">50 題</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Select all */}
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={batchSelected.length === readableMaterials.length && readableMaterials.length > 0}
                          onCheckedChange={(checked) => {
                            setBatchSelected(checked ? readableMaterials.map(m => m.id) : []);
                          }}
                        />
                        <span className="text-sm font-medium">全選 ({readableMaterials.length} 份)</span>
                      </div>

                      <Separator />

                      {/* Material list */}
                      <ScrollArea className="max-h-60">
                        <div className="space-y-2">
                          {readableMaterials.map(m => {
                            const progress = batchProgress[m.id];
                            return (
                              <div key={m.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50">
                                <Checkbox
                                  checked={batchSelected.includes(m.id)}
                                  onCheckedChange={() => toggleBatchItem(m.id)}
                                  disabled={batchRunning}
                                />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm truncate">{m.filename.replace(/\.[^.]+$/, "")}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {((m as any).extractedTextLength / 1000).toFixed(1)}k 字 · {qByMaterial[m.id] || 0} 題
                                  </p>
                                </div>
                                {progress && (
                                  <div className="flex-shrink-0">
                                    {progress.status === "pending" && (
                                      <span className="text-xs text-muted-foreground">等待中</span>
                                    )}
                                    {progress.status === "generating" && (
                                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                    )}
                                    {progress.status === "done" && (
                                      <span className="flex items-center gap-1 text-xs text-green-600">
                                        <CheckCircle className="h-3.5 w-3.5" />
                                        +{progress.count}題
                                      </span>
                                    )}
                                    {progress.status === "error" && (
                                      <span className="flex items-center gap-1 text-xs text-destructive">
                                        <AlertCircle className="h-3.5 w-3.5" />
                                        失敗
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </ScrollArea>

                      <Button
                        className="w-full gap-2"
                        onClick={startBatchGeneration}
                        disabled={batchSelected.length === 0 || batchRunning}
                      >
                        {batchRunning ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            生成中...
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-4 w-4" />
                            開始生成 ({batchSelected.length} 份 × {batchCount} 題)
                          </>
                        )}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </div>

            {readableMaterials.map((m) => {
              const qCount = qByMaterial[m.id] || 0;
              const lessonName = m.filename.replace(/\.[^.]+$/, "");
              return (
                <Card key={m.id}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <FileText className="h-5 w-5 text-primary flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-bold truncate">{lessonName}</p>
                          <p className="text-xs text-muted-foreground">
                            {((m as any).extractedTextLength / 1000).toFixed(1)}k 字 · {qCount} 題
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => generateQuestions.mutate({ materialId: m.id, count: genCount })}
                          disabled={generateQuestions.isPending}
                          className="gap-1.5"
                        >
                          {generateQuestions.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                          +{genCount}題
                        </Button>
                        {qCount > 0 && (
                          <Link href={`/quiz/m/${m.id}`}>
                            <Button size="sm" className="gap-1.5">
                              <Play className="h-3.5 w-3.5" />
                              測驗
                            </Button>
                          </Link>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            {/* Unreadable PDFs */}
            {materials.filter(m => !(m as any).isReadable && (m as any).extractedTextLength > 0).map(m => (
              <Card key={m.id} className="opacity-50">
                <CardContent className="p-4 flex items-center gap-3">
                  <span>⚠️</span>
                  <div>
                    <p className="text-sm text-muted-foreground">{m.filename}</p>
                    <p className="text-xs text-destructive">字體無法解讀，請重新上傳可選取文字的版本</p>
                  </div>
                </CardContent>
              </Card>
            ))}

            {/* Bulk generation */}
            <Separator />
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => generateQuestions.mutate({ examType: "midterm", count: 20 })} disabled={generateQuestions.isPending} className="gap-1.5">
                <Sparkles className="h-3.5 w-3.5" /> 期中綜合題
              </Button>
              <Button variant="outline" size="sm" onClick={() => generateQuestions.mutate({ examType: "final", count: 20 })} disabled={generateQuestions.isPending} className="gap-1.5">
                <Sparkles className="h-3.5 w-3.5" /> 期末綜合題
              </Button>
            </div>

            {/* Stats */}
            {questions.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                <Badge variant="outline">總計 {questions.length} 題</Badge>
                <Badge variant="secondary">選擇 {questions.filter(q => q.questionType === "mc").length}</Badge>
                <Badge variant="secondary">判斷 {questions.filter(q => q.questionType === "truefalse").length}</Badge>
                <Badge variant="secondary">簡答 {questions.filter(q => q.questionType === "essay").length}</Badge>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
