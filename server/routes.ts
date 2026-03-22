import type { Express } from "express";
import type { Server } from "http";
import { storage, db } from "./storage";
import { questions } from "@shared/schema";
import { eq } from "drizzle-orm";
import { uploadFile, downloadFile, deleteFile } from "./supabase";
import multer from "multer";
import path from "path";
import fs from "fs";
import os from "os";
import OpenAI from "openai";
import { execSync } from "child_process";

const BUCKET = "materials";

const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
});

// Ensure uploads directory
if (!fs.existsSync("uploads")) {
  fs.mkdirSync("uploads", { recursive: true });
}

// Fix Chinese filename encoding from multer
// multer reads originalname as latin1, but browsers send UTF-8 bytes
function fixFilename(rawName: string): string {
  try {
    // Check if the name is already valid UTF-8 Chinese
    if (/[\u4e00-\u9fff]/.test(rawName)) return rawName;
    // Try to decode as latin1-encoded UTF-8 bytes
    const bytes = Buffer.from(rawName, 'latin1');
    const decoded = bytes.toString('utf-8');
    // Verify the decoded result contains CJK characters or is at least valid
    if (/[\u4e00-\u9fff]/.test(decoded)) return decoded;
    return rawName;
  } catch {
    return rawName;
  }
}

function getAIClient(): OpenAI | null {
  const apiKey = process.env.KIMI_API_KEY || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  try {
    return new OpenAI({
      apiKey,
      baseURL: process.env.AI_BASE_URL || "https://api.moonshot.ai/v1",
    });
  } catch {
    return null;
  }
}

async function extractTextFromFile(filePath: string, fileType: string, originalName: string): Promise<string> {
  try {
    if (fileType === "text" || originalName.endsWith(".txt") || originalName.endsWith(".md")) {
      return fs.readFileSync(filePath, "utf-8");
    }

    // PDF extraction using PyMuPDF via Python subprocess
    if (fileType === "pdf" || originalName.toLowerCase().endsWith(".pdf")) {
      try {
        const absPath = path.resolve(filePath);
        const scriptPath = path.resolve("extract_pdf.py");
        const result = execSync(`python3 ${scriptPath} "${absPath}"`, {
          encoding: "utf-8",
          timeout: 180000, // 3 minute timeout for OCR
          maxBuffer: 50 * 1024 * 1024, // 50MB buffer
        });
        const parsed = JSON.parse(result.trim());
        if (parsed.text && parsed.text.length > 0) {
          console.log(`PDF extracted: ${originalName}, ${parsed.totalChars} chars, ${parsed.pages} pages`);
          return parsed.text;
        } else {
          console.log(`PDF extraction empty for ${originalName}: ${parsed.error || 'no text'}`);
          return "";
        }
      } catch (e: any) {
        console.error(`PyMuPDF extraction failed for ${originalName}:`, e.message);
        return "";
      }
    }

    // For other types, try to read as text
    const buffer = fs.readFileSync(filePath);
    const text = buffer.toString("utf-8").replace(/[^\x20-\x7E\u4E00-\u9FFF\u3400-\u4DBF\u3000-\u303F\uFF00-\uFFEF\u2000-\u206F\u00A0-\u00FF\n\r\t]/g, " ");
    return text.replace(/\s+/g, " ").trim().substring(0, 80000);
  } catch (e) {
    console.error(`Text extraction failed for ${originalName}:`, e);
    return "";
  }
}

async function generateWithAI(prompt: string, systemPrompt?: string): Promise<string> {
  const client = getAIClient();
  if (!client) {
    return "AI服務未配置，請設置 KIMI_API_KEY 環境變量。";
  }
  try {
    const model = process.env.AI_MODEL || "kimi-k2.5";
    console.log(`[AI] Calling model=${model}, prompt length=${prompt.length}`);
    const requestBody: any = {
      model,
      max_tokens: 8192,
      messages: [
        { role: "system", content: systemPrompt || "你是一位專業的中醫學教授，專門協助中醫碩士課程的學生學習。請用繁體中文回答。" },
        { role: "user", content: prompt },
      ],
    };
    // Disable thinking mode for Kimi K2.5 to get direct JSON output
    if (model.includes("kimi")) {
      requestBody.thinking = { type: "disabled" };
    }
    const completion = await client.chat.completions.create(requestBody);
    const content = completion.choices[0]?.message?.content || "";
    console.log(`[AI] Response received: ${content.length} chars, first 300: ${content.substring(0, 300)}`);
    return content;
  } catch (e: any) {
    console.error("AI generation error:", e.message);
    if (e.response) {
      try {
        const errBody = typeof e.response.body === 'string' ? e.response.body : JSON.stringify(e.response.data || e.response.body);
        console.error("AI error response body:", errBody?.substring?.(0, 500));
      } catch {}
    }
    return "AI生成失敗：" + e.message;
  }
}

// Helper to download a file from Supabase to a temp local path for processing
async function downloadToTemp(storedPath: string, originalName: string): Promise<string | null> {
  // If file is already local (no Supabase), just return the path
  if (fs.existsSync(storedPath)) return storedPath;
  // Try downloading from Supabase
  const buffer = await downloadFile(BUCKET, storedPath);
  if (!buffer) return null;
  const tmpPath = path.join(os.tmpdir(), `tcm_${Date.now()}_${originalName}`);
  fs.writeFileSync(tmpPath, buffer);
  return tmpPath;
}

// Core question generation logic (reused by single and batch endpoints)
async function generateQuestionsForMaterial(
  subjectId: number,
  materialId: number | null,
  count: number,
  examType: string | null,
): Promise<{ created: any[]; error?: string }> {
  const subject = await storage.getSubject(subjectId);

  let sourceText = "";
  let sourceName = subject?.name || "";

  const readableCheck = ["骨折","脫位","治療","骨傷","損傷","關節","筋","疼痛","固定","復位","中醫","手法","患者","藥","病","脈","血","氣"];

  if (materialId) {
    const material = await storage.getMaterial(materialId);
    if (!material?.extractedText) {
      return { created: [], error: "該資料未提取到文字內容" };
    }
    const foundTerms = readableCheck.filter(t => material.extractedText!.includes(t)).length;
    if (foundTerms < 3) {
      return { created: [], error: "該PDF字體無法解讀，請重新上傳可選取文字的版本" };
    }
    sourceText = material.extractedText;
    sourceName = material.filename.replace(/\.[^.]+$/, "");
  } else {
    const materials_list = await storage.getMaterials(subjectId);
    sourceText = materials_list
      .filter(m => m.extractedText && readableCheck.filter(t => m.extractedText!.includes(t)).length >= 3)
      .map(m => `【${m.filename}】\n${m.extractedText}`)
      .join("\n\n---\n\n");
  }

  if (!sourceText.trim()) {
    return { created: [], error: "沒有可用的學習材料" };
  }

  const trimmedText = sourceText.substring(0, 15000);
  const mcCount = Math.max(5, Math.floor(count * 0.6));
  const tfCount = Math.max(2, Math.floor(count * 0.2));
  const essayCount = Math.max(1, count - mcCount - tfCount);

  const prompt = `你是中醫碩士課程考試出題專家。以下是「${sourceName}」的課程內容：

${trimmedText}

請生成${count}道題目（${mcCount}題選擇題 + ${tfCount}題判斷題 + ${essayCount}題簡答題）。
題目必須基於課程內容。explanation要簡潔但準確。判斷題 correctAnswer 只能是"T"或"F"。用繁體中文。
${examType ? `這是${examType === "midterm" ? "期中考" : "期末考"}題目。` : ""}

直接輸出JSON數組，不要加其他文字：
[{"questionType":"mc","questionText":"","options":["A. ","B. ","C. ","D. "],"correctAnswer":"A","explanation":"","difficulty":1}]`;

  const result = await generateWithAI(prompt);

  if (result.startsWith("AI生成失敗") || result.startsWith("AI服務未配置")) {
    return { created: [], error: result };
  }

  let cleanResult = result;
  cleanResult = cleanResult.replace(/```json\s*/gi, "").replace(/```\s*/g, "");

  let items: any[] | null = null;
  try {
    const jsonMatch = cleanResult.match(/\[[\s\S]*\]/);
    if (jsonMatch) items = JSON.parse(jsonMatch[0]);
  } catch {
    try {
      const jsonMatch = cleanResult.match(/\[[\s\S]*/);
      if (jsonMatch) {
        let fixed = jsonMatch[0];
        const openBraces = (fixed.match(/\{/g) || []).length;
        const closeBraces = (fixed.match(/\}/g) || []).length;
        for (let i = 0; i < openBraces - closeBraces; i++) fixed += '}';
        if (!fixed.endsWith(']')) fixed += ']';
        items = JSON.parse(fixed);
      }
    } catch {
      try {
        const objMatches = cleanResult.match(/\{[^{}]*"questionType"[^{}]*\}/g);
        if (objMatches) items = objMatches.map(m => JSON.parse(m));
      } catch {}
    }
  }

  if (!items || items.length === 0) {
    return { created: [], error: "AI生成題目格式解析失敗，請重試" };
  }

  const created = [];
  for (const item of items) {
    if (!item.questionText) continue;
    let qType = (item.questionType || "mc").toLowerCase();
    if (qType === "tf" || qType === "true_false" || qType === "truefalse") qType = "truefalse";
    if (qType === "sa" || qType === "short_answer" || qType === "essay" || qType === "long_answer") qType = "essay";
    if (qType !== "truefalse" && qType !== "essay") qType = "mc";

    let correctAnswer = item.correctAnswer || "";
    if (qType === "truefalse") {
      const ca = String(correctAnswer).trim().toUpperCase();
      if (["T", "TRUE", "正確", "對", "是"].includes(ca)) correctAnswer = "T";
      else correctAnswer = "F";
    }
    const q = await storage.createQuestion({
      subjectId,
      materialId: materialId || null,
      questionType: qType,
      questionText: item.questionText,
      options: JSON.stringify(item.options || []),
      correctAnswer,
      explanation: item.explanation || "",
      difficulty: item.difficulty || 1,
      examType: examType || null,
    });
    created.push(q);
  }
  return { created };
}

export function registerRoutes(server: Server, app: Express) {
  // ==================== AI DIAGNOSTIC ====================
  app.get("/api/ai/test", async (_req, res) => {
    try {
      const client = getAIClient();
      if (!client) return res.json({ status: "error", message: "No API key configured" });
      const model = process.env.AI_MODEL || "kimi-k2.5";
      const baseURL = process.env.AI_BASE_URL || "https://api.moonshot.ai/v1";
      console.log(`[AI Test] model=${model}, baseURL=${baseURL}`);
      const requestBody: any = {
        model,
        max_tokens: 256,
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: '回覆一個JSON: {"status": "ok", "message": "Kimi連接成功"}' },
        ],
      };
      if (model.includes("kimi")) {
        requestBody.thinking = { type: "disabled" };
      }
      const start = Date.now();
      const completion = await client.chat.completions.create(requestBody);
      const elapsed = Date.now() - start;
      const content = completion.choices[0]?.message?.content || "";
      const reasoning = (completion.choices[0]?.message as any)?.reasoning_content || null;
      res.json({
        status: "ok",
        model,
        baseURL,
        elapsed_ms: elapsed,
        content,
        reasoning_content: reasoning,
        finish_reason: completion.choices[0]?.finish_reason,
        usage: completion.usage,
      });
    } catch (e: any) {
      res.json({ status: "error", message: e.message, code: e.code, status_code: e.status });
    }
  });

  // ==================== SEMESTERS ====================
  app.get("/api/semesters", async (_req, res) => {
    const semesters = await storage.getSemesters();
    res.json(semesters);
  });

  app.post("/api/semesters", async (req, res) => {
    const semester = await storage.createSemester(req.body);
    res.json(semester);
  });

  app.delete("/api/semesters/:id", async (req, res) => {
    await storage.deleteSemester(parseInt(req.params.id));
    res.json({ success: true });
  });

  // ==================== SUBJECTS ====================
  app.get("/api/subjects", async (req, res) => {
    const semesterId = req.query.semesterId ? parseInt(req.query.semesterId as string) : undefined;
    const subjects = await storage.getSubjects(semesterId);
    res.json(subjects);
  });

  app.get("/api/subjects/:id", async (req, res) => {
    const subject = await storage.getSubject(parseInt(req.params.id));
    if (!subject) return res.status(404).json({ error: "Subject not found" });
    res.json(subject);
  });

  app.post("/api/subjects", async (req, res) => {
    const subject = await storage.createSubject(req.body);
    res.json(subject);
  });

  app.patch("/api/subjects/:id", async (req, res) => {
    const subject = await storage.updateSubject(parseInt(req.params.id), req.body);
    res.json(subject);
  });

  app.delete("/api/subjects/:id", async (req, res) => {
    await storage.deleteSubject(parseInt(req.params.id));
    res.json({ success: true });
  });

  // ==================== MATERIALS ====================
  app.get("/api/materials", async (req, res) => {
    const subjectId = parseInt(req.query.subjectId as string);
    const materials = await storage.getMaterials(subjectId);
    // Add text length info and quality indicator
    const readableTerms = ["骨折","脫位","治療","骨傷","損傷","關節","筋","疼痛","腫脹","固定","復位","中醫","手法","患者","症狀","脈","血","氣","藥","病"];
    const materialsWithInfo = materials.map(m => {
      const text = m.extractedText || "";
      const totalLen = text.length;
      const foundTerms = readableTerms.filter(t => text.includes(t)).length;
      const isReadable = totalLen > 100 && foundTerms >= 3;
      return {
        ...m,
        extractedTextLength: totalLen,
        isReadable,
        readableTermCount: foundTerms,
        extractedText: undefined,
      };
    });
    res.json(materialsWithInfo);
  });

  // Chunked upload: initialize
  app.post("/api/materials/upload/init", (req, res) => {
    try {
      const { filename, totalChunks, subjectId } = req.body;
      const uploadId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      const uploadDir = path.join("uploads", "chunks_" + uploadId);
      fs.mkdirSync(uploadDir, { recursive: true });
      // Store metadata
      fs.writeFileSync(path.join(uploadDir, "_meta.json"), JSON.stringify({
        filename: fixFilename(filename),
        totalChunks,
        subjectId,
        receivedChunks: 0,
      }));
      res.json({ uploadId });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Chunked upload: receive a chunk
  app.post("/api/materials/upload/chunk", upload.single("chunk"), (req, res) => {
    try {
      const { uploadId, chunkIndex } = req.body;
      const file = req.file;
      if (!file || !uploadId) return res.status(400).json({ error: "Missing chunk data" });

      const uploadDir = path.join("uploads", "chunks_" + uploadId);
      if (!fs.existsSync(uploadDir)) return res.status(404).json({ error: "Upload session not found" });

      // Move chunk to numbered file
      const chunkPath = path.join(uploadDir, `chunk_${String(chunkIndex).padStart(5, '0')}`);
      fs.renameSync(file.path, chunkPath);

      // Update metadata
      const metaPath = path.join(uploadDir, "_meta.json");
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
      meta.receivedChunks++;
      fs.writeFileSync(metaPath, JSON.stringify(meta));

      res.json({ received: meta.receivedChunks, total: meta.totalChunks });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Chunked upload: finalize and merge
  app.post("/api/materials/upload/finalize", async (req, res) => {
    try {
      const { uploadId } = req.body;
      const uploadDir = path.join("uploads", "chunks_" + uploadId);
      if (!fs.existsSync(uploadDir)) return res.status(404).json({ error: "Upload session not found" });

      const meta = JSON.parse(fs.readFileSync(path.join(uploadDir, "_meta.json"), "utf-8"));
      const originalName = meta.filename;
      const subjectId = parseInt(meta.subjectId);

      // Merge chunks into single file
      const localTmpPath = path.join("uploads", uploadId + path.extname(originalName));
      const writeStream = fs.createWriteStream(localTmpPath);

      for (let i = 0; i < meta.totalChunks; i++) {
        const chunkPath = path.join(uploadDir, `chunk_${String(i).padStart(5, '0')}`);
        if (fs.existsSync(chunkPath)) {
          const data = fs.readFileSync(chunkPath);
          writeStream.write(data);
        }
      }
      writeStream.end();

      await new Promise<void>((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });

      // Clean up chunks directory
      fs.rmSync(uploadDir, { recursive: true, force: true });

      // Upload to Supabase Storage
      const fileBuffer = fs.readFileSync(localTmpPath);
      const ext = path.extname(originalName).toLowerCase();
      const supabasePath = `${subjectId}/${uploadId}${ext}`;
      const storedPath = await uploadFile(BUCKET, supabasePath, fileBuffer, getMimeType(ext));

      // Determine file type
      let fileType = "text";
      if ([".ppt", ".pptx"].includes(ext)) fileType = "ppt";
      else if ([".pdf"].includes(ext)) fileType = "pdf";
      else if ([".mp3", ".wav", ".m4a", ".ogg"].includes(ext)) fileType = "audio";
      else if ([".mp4", ".avi", ".mov", ".mkv"].includes(ext)) fileType = "video";
      else if ([".doc", ".docx"].includes(ext)) fileType = "doc";

      const material = await storage.createMaterial({
        subjectId,
        filename: originalName,
        fileType,
        filePath: storedPath || localTmpPath,
        status: "processing",
      });

      // Return immediately, extract text in background
      const refreshed = await storage.getMaterial(material.id);
      res.json(refreshed);

      // Background text extraction
      (async () => {
        try {
          // Download from Supabase to temp file for extraction
          const tmpFile = await downloadToTemp(material.filePath, originalName);
          if (!tmpFile) {
            await storage.updateMaterial(material.id, { status: "error" });
            return;
          }
          const extractedText = await extractTextFromFile(tmpFile, fileType, originalName);
          if (extractedText) {
            await storage.updateMaterial(material.id, { extractedText, status: "processed" });
          } else {
            await storage.updateMaterial(material.id, { status: "processed" });
          }
          console.log(`Text extraction complete for ${originalName}: ${extractedText?.length || 0} chars`);
          // Clean up temp files
          if (tmpFile !== material.filePath && tmpFile !== localTmpPath) {
            try { fs.unlinkSync(tmpFile); } catch {}
          }
          // Clean up local tmp if stored in Supabase
          if (storedPath && storedPath !== localTmpPath) {
            try { fs.unlinkSync(localTmpPath); } catch {}
          }
        } catch (e) {
          console.error(`Text extraction failed for ${originalName}:`, e);
          await storage.updateMaterial(material.id, { status: "error" });
        }
      })();
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Legacy single-file upload (for small files < 8MB)
  app.post("/api/materials/upload", upload.single("file"), async (req, res) => {
    try {
      const file = req.file;
      if (!file) return res.status(400).json({ error: "No file uploaded" });
      const subjectId = parseInt(req.body.subjectId);
      const originalName = fixFilename(file.originalname);

      let fileType = "text";
      const ext = path.extname(originalName).toLowerCase();
      if ([".ppt", ".pptx"].includes(ext)) fileType = "ppt";
      else if ([".pdf"].includes(ext)) fileType = "pdf";
      else if ([".mp3", ".wav", ".m4a", ".ogg"].includes(ext)) fileType = "audio";
      else if ([".mp4", ".avi", ".mov", ".mkv"].includes(ext)) fileType = "video";
      else if ([".doc", ".docx"].includes(ext)) fileType = "doc";

      // Upload to Supabase
      const fileBuffer = fs.readFileSync(file.path);
      const uploadId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      const supabasePath = `${subjectId}/${uploadId}${ext}`;
      const storedPath = await uploadFile(BUCKET, supabasePath, fileBuffer, getMimeType(ext));

      const material = await storage.createMaterial({
        subjectId,
        filename: originalName,
        fileType,
        filePath: storedPath || file.path,
        status: "processing",
      });

      // Return immediately
      const refreshed = await storage.getMaterial(material.id);
      res.json(refreshed);

      // Background extraction
      (async () => {
        try {
          const tmpFile = await downloadToTemp(material.filePath, originalName);
          if (!tmpFile) {
            await storage.updateMaterial(material.id, { status: "error" });
            return;
          }
          const extractedText = await extractTextFromFile(tmpFile, fileType, originalName);
          if (extractedText) {
            await storage.updateMaterial(material.id, { extractedText, status: "processed" });
          } else {
            await storage.updateMaterial(material.id, { status: "processed" });
          }
          console.log(`Text extraction complete for ${originalName}: ${extractedText?.length || 0} chars`);
          if (tmpFile !== material.filePath && tmpFile !== file.path) {
            try { fs.unlinkSync(tmpFile); } catch {}
          }
          // Clean up local file if stored in Supabase
          if (storedPath && storedPath !== file.path) {
            try { fs.unlinkSync(file.path); } catch {}
          }
        } catch (e) {
          console.error(`Text extraction failed for ${originalName}:`, e);
          await storage.updateMaterial(material.id, { status: "error" });
        }
      })();
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/materials/:id", async (req, res) => {
    const material = await storage.getMaterial(parseInt(req.params.id));
    if (material?.filePath) {
      await deleteFile(BUCKET, material.filePath);
    }
    await storage.deleteMaterial(parseInt(req.params.id));
    res.json({ success: true });
  });

  // ==================== REPROCESS MATERIALS ====================
  app.post("/api/materials/reprocess", async (req, res) => {
    try {
      const { subjectId } = req.body;
      const materials_list = await storage.getMaterials(subjectId);
      const results: { id: number; filename: string; textLength: number; status: string }[] = [];

      for (const m of materials_list) {
        try {
          const tmpFile = await downloadToTemp(m.filePath, m.filename);
          if (!tmpFile) {
            results.push({ id: m.id, filename: m.filename, textLength: 0, status: "file_missing" });
            continue;
          }
          const text = await extractTextFromFile(tmpFile, m.fileType, m.filename);
          const textLength = text?.length || 0;
          await storage.updateMaterial(m.id, {
            extractedText: text || null,
            status: textLength > 0 ? "processed" : "error",
          });
          results.push({ id: m.id, filename: m.filename, textLength, status: textLength > 0 ? "processed" : "no_text" });
          // Clean up temp file
          if (tmpFile !== m.filePath) {
            try { fs.unlinkSync(tmpFile); } catch {}
          }
        } catch (e: any) {
          results.push({ id: m.id, filename: m.filename, textLength: 0, status: "error: " + e.message });
        }
      }

      const totalText = results.reduce((sum, r) => sum + r.textLength, 0);
      res.json({
        processed: results.length,
        totalTextExtracted: totalText,
        results,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ==================== AI CONTENT GENERATION ====================
  app.post("/api/ai/generate-study-content", async (req, res) => {
    try {
      const { subjectId } = req.body;
      const materials_list = await storage.getMaterials(subjectId);
      const subject = await storage.getSubject(subjectId);

      const allText = materials_list
        .filter(m => m.extractedText)
        .map(m => `【${m.filename}】\n${m.extractedText}`)
        .join("\n\n---\n\n");

      if (!allText.trim()) {
        return res.status(400).json({ error: "沒有可用的學習材料文字內容" });
      }

      const prompt = `以下是「${subject?.name || ""}」這門課的學習材料：

${allText.substring(0, 30000)}

請根據以上材料，生成有趣生動的學習內容。要求：
1. 將內容整理成3-5個主題模塊
2. 每個模塊包含：標題、核心知識點、有趣的記憶方法或口訣
3. 用通俗易懂的語言解釋中醫概念
4. 適當加入類比和生活化的例子
5. 輸出格式為JSON數組：[{"title": "標題", "content": "內容(markdown格式)", "contentType": "lesson"}]`;

      const result = await generateWithAI(prompt);

      // Parse AI response
      try {
        const jsonMatch = result.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const items = JSON.parse(jsonMatch[0]);
          const created = [];
          for (let i = 0; i < items.length; i++) {
            const sc = await storage.createStudyContent({
              subjectId,
              title: items[i].title,
              content: items[i].content,
              contentType: items[i].contentType || "lesson",
              orderIndex: i,
            });
            created.push(sc);
          }
          return res.json(created);
        }
      } catch {}

      // Fallback: save as single content
      const sc = await storage.createStudyContent({
        subjectId,
        title: `${subject?.name} - 學習筆記`,
        content: result,
        contentType: "lesson",
        orderIndex: 0,
      });
      res.json([sc]);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Generate questions per material (PDF) - supports MC, true/false, and essay
  app.post("/api/ai/generate-questions", async (req, res) => {
    try {
      const { subjectId, materialId, count = 15, examType } = req.body;
      const result = await generateQuestionsForMaterial(subjectId, materialId || null, count, examType || null);
      if (result.error) {
        return res.status(result.created.length === 0 ? 400 : 200).json({ error: result.error });
      }
      return res.json(result.created);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ==================== BATCH QUESTION GENERATION ====================
  app.post("/api/ai/generate-questions-batch", async (req, res) => {
    try {
      const { items } = req.body as { items: { materialId: number; count: number }[] };
      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "請提供要生成題目的資料列表" });
      }

      // Set up SSE
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();

      const results: { materialId: number; success: boolean; count: number; error?: string }[] = [];
      const CONCURRENCY = 3;

      // Process with concurrency limit
      let index = 0;
      const pending: Promise<void>[] = [];

      const processItem = async (item: { materialId: number; count: number }) => {
        const material = await storage.getMaterial(item.materialId);
        const subjectId = material?.subjectId;
        if (!subjectId) {
          const r = { materialId: item.materialId, success: false, count: 0, error: "資料不存在" };
          results.push(r);
          res.write(`data: ${JSON.stringify({ type: "progress", ...r })}\n\n`);
          return;
        }

        // Send "generating" status
        res.write(`data: ${JSON.stringify({ type: "status", materialId: item.materialId, status: "generating" })}\n\n`);

        try {
          const result = await generateQuestionsForMaterial(subjectId, item.materialId, item.count, null);
          const r = {
            materialId: item.materialId,
            success: !result.error,
            count: result.created.length,
            error: result.error,
          };
          results.push(r);
          res.write(`data: ${JSON.stringify({ type: "progress", ...r })}\n\n`);
        } catch (e: any) {
          const r = { materialId: item.materialId, success: false, count: 0, error: e.message };
          results.push(r);
          res.write(`data: ${JSON.stringify({ type: "progress", ...r })}\n\n`);
        }
      };

      // Simple concurrency limiter
      const queue = [...items];
      const runNext = async (): Promise<void> => {
        if (queue.length === 0) return;
        const item = queue.shift()!;
        await processItem(item);
        await runNext();
      };

      const workers = [];
      for (let i = 0; i < Math.min(CONCURRENCY, queue.length); i++) {
        workers.push(runNext());
      }
      await Promise.all(workers);

      // Send final summary
      res.write(`data: ${JSON.stringify({ type: "done", results })}\n\n`);
      res.end();
    } catch (e: any) {
      // If headers already sent, try to write error via SSE
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ type: "error", error: e.message })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: e.message });
      }
    }
  });

  app.post("/api/ai/explain", async (req, res) => {
    try {
      const { questionId, userAnswer, isCorrect } = req.body;
      const question = await storage.getQuestion(questionId);
      if (!question) return res.status(404).json({ error: "Question not found" });

      const options = question.options ? JSON.parse(question.options) : [];

      const prompt = `學生回答了以下中醫題目：

題目：${question.questionText}
選項：${options.join(", ")}
學生答案：${userAnswer}
正確答案：${question.correctAnswer}
學生${isCorrect ? "答對了" : "答錯了"}

${question.explanation ? `參考解釋：${question.explanation}` : ""}

請給出詳細且鼓勵性的解釋：
1. 如果答對了，表揚學生並深入解釋這個知識點，讓學生更深刻地理解
2. 如果答錯了，溫和地指出錯誤，解釋正確答案的邏輯，並用生動的方式幫助記憶
3. 可以適當擴展相關的中醫知識
4. 語氣要友善、有趣，像一位好老師在聊天`;

      const explanation = await generateWithAI(prompt);
      res.json({ explanation });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ==================== ESSAY GRADING ====================
  app.post("/api/ai/grade-essay", async (req, res) => {
    try {
      const { questionId, userAnswer } = req.body;
      const question = await storage.getQuestion(questionId);
      if (!question) return res.status(404).json({ error: "Question not found" });

      // Get the source material for context
      const mats = await storage.getMaterials(question.subjectId);
      const relevantText = mats
        .filter(m => m.extractedText)
        .map(m => m.extractedText!.substring(0, 5000))
        .join("\n");

      const prompt = `你是中醫碩士課程的評分老師。請對以下簡答題進行評分。

題目：${question.questionText}
模範答案：${question.explanation || question.correctAnswer}
學生答案：${userAnswer}

課程相關內容：${relevantText.substring(0, 10000)}

請評分並給出回饋：
1. 給出分數 (0-100)
2. 優點：學生答對了哪些部分
3. 不足：還缺少什麼重要知識點
4. 模範答案補充：完整的答案應該包含什麼

輸出格式JSON：{"score": 75, "feedback": "詳細回饋", "strengths": "優點", "weaknesses": "不足", "modelAnswer": "模範答案"}`;

      const result = await generateWithAI(prompt);
      try {
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const grading = JSON.parse(jsonMatch[0]);
          return res.json(grading);
        }
      } catch {}
      res.json({ score: 0, feedback: result, strengths: "", weaknesses: "", modelAnswer: question.explanation || "" });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ==================== STUDY CONTENT ====================
  app.get("/api/study-content", async (req, res) => {
    const subjectId = parseInt(req.query.subjectId as string);
    res.json(await storage.getStudyContents(subjectId));
  });

  app.post("/api/study-content", async (req, res) => {
    const content = await storage.createStudyContent(req.body);
    res.json(content);
  });

  app.delete("/api/study-content/:id", async (req, res) => {
    await storage.deleteStudyContent(parseInt(req.params.id));
    res.json({ success: true });
  });

  // ==================== QUESTIONS ====================
  app.get("/api/questions", async (req, res) => {
    const subjectId = parseInt(req.query.subjectId as string);
    const examType = req.query.examType as string | undefined;
    res.json(await storage.getQuestions(subjectId, examType));
  });

  // Get question count per material for a subject
  app.get("/api/questions/by-material", async (req, res) => {
    const subjectId = parseInt(req.query.subjectId as string);
    const allQ = await storage.getQuestions(subjectId);
    const byMaterial: Record<number, number> = {};
    for (const q of allQ) {
      const mid = (q as any).materialId || 0;
      byMaterial[mid] = (byMaterial[mid] || 0) + 1;
    }
    res.json(byMaterial);
  });

  // Random questions - supports filtering by materialIds OR subjectIds
  app.get("/api/questions/random", async (req, res) => {
    const count = parseInt(req.query.count as string) || 10;
    const materialIds = (req.query.materialId as string || "").split(",").map(s => parseInt(s.trim())).filter(n => !isNaN(n));
    const subjectIds = (req.query.subjectId as string || "").split(",").map(s => parseInt(s.trim())).filter(n => !isNaN(n));

    let allQuestions: any[] = [];

    if (materialIds.length > 0) {
      // Get questions by material IDs
      for (const mid of materialIds) {
        const qs = await db.select().from(questions).where(eq(questions.materialId, mid)).all();
        allQuestions = allQuestions.concat(qs);
      }
    } else if (subjectIds.length > 0) {
      for (const sid of subjectIds) {
        const qs = await storage.getRandomQuestions(sid, count * 2);
        allQuestions = allQuestions.concat(qs);
      }
    }

    // Shuffle
    for (let i = allQuestions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allQuestions[i], allQuestions[j]] = [allQuestions[j], allQuestions[i]];
    }
    res.json(allQuestions.slice(0, count));
  });

  app.post("/api/questions", async (req, res) => {
    const q = await storage.createQuestion(req.body);
    res.json(q);
  });

  app.delete("/api/questions/:id", async (req, res) => {
    await storage.deleteQuestion(parseInt(req.params.id));
    res.json({ success: true });
  });

  // ==================== STUDY RECORDS ====================
  app.get("/api/study-records", async (req, res) => {
    const subjectId = req.query.subjectId ? parseInt(req.query.subjectId as string) : undefined;
    res.json(await storage.getStudyRecords(subjectId));
  });

  app.post("/api/study-records", async (req, res) => {
    const record = await storage.createStudyRecord(req.body);
    // Update daily stats
    if (req.body.isCorrect !== undefined) {
      await storage.updateTodayStats(!!req.body.isCorrect);
    }
    res.json(record);
  });

  // ==================== DAILY STATS ====================
  app.get("/api/stats/daily", async (_req, res) => {
    res.json(await storage.getDailyStats());
  });

  app.get("/api/stats/today", async (_req, res) => {
    const today = await storage.getTodayStats();
    const streak = await storage.getStreak();
    res.json({ today, streak });
  });

  app.get("/api/stats/subject/:id", async (req, res) => {
    const accuracy = await storage.getSubjectAccuracy(parseInt(req.params.id));
    res.json(accuracy);
  });
}

function getMimeType(ext: string): string {
  const map: Record<string, string> = {
    ".pdf": "application/pdf",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
    ".mp4": "video/mp4",
    ".avi": "video/x-msvideo",
    ".mov": "video/quicktime",
  };
  return map[ext] || "application/octet-stream";
}
