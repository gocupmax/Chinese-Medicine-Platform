import type { Express } from "express";
import type { Server } from "http";
import { storage, db } from "./storage";
import { questions } from "@shared/schema";
import { eq } from "drizzle-orm";
import multer from "multer";
import path from "path";
import fs from "fs";
import Anthropic from "@anthropic-ai/sdk";
import { execSync } from "child_process";

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

function getAnthropicClient(): Anthropic | null {
  try {
    return new Anthropic();
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
  const client = getAnthropicClient();
  if (!client) {
    return "AI服務暫時不可用，請稍後再試。";
  }
  try {
    const message = await client.messages.create({
      model: "claude_sonnet_4_6",
      max_tokens: 4096,
      system: systemPrompt || "你是一位專業的中醫學教授，專門協助中醫碩士課程的學生學習。請用繁體中文回答。",
      messages: [{ role: "user", content: prompt }],
    });
    const block = message.content[0];
    return block.type === "text" ? block.text : "";
  } catch (e: any) {
    console.error("AI generation error:", e.message);
    return "AI生成失敗：" + e.message;
  }
}

export function registerRoutes(server: Server, app: Express) {
  // ==================== SEMESTERS ====================
  app.get("/api/semesters", (_req, res) => {
    const semesters = storage.getSemesters();
    res.json(semesters);
  });

  app.post("/api/semesters", (req, res) => {
    const semester = storage.createSemester(req.body);
    res.json(semester);
  });

  app.delete("/api/semesters/:id", (req, res) => {
    storage.deleteSemester(parseInt(req.params.id));
    res.json({ success: true });
  });

  // ==================== SUBJECTS ====================
  app.get("/api/subjects", (req, res) => {
    const semesterId = req.query.semesterId ? parseInt(req.query.semesterId as string) : undefined;
    const subjects = storage.getSubjects(semesterId);
    res.json(subjects);
  });

  app.get("/api/subjects/:id", (req, res) => {
    const subject = storage.getSubject(parseInt(req.params.id));
    if (!subject) return res.status(404).json({ error: "Subject not found" });
    res.json(subject);
  });

  app.post("/api/subjects", (req, res) => {
    const subject = storage.createSubject(req.body);
    res.json(subject);
  });

  app.patch("/api/subjects/:id", (req, res) => {
    const subject = storage.updateSubject(parseInt(req.params.id), req.body);
    res.json(subject);
  });

  app.delete("/api/subjects/:id", (req, res) => {
    storage.deleteSubject(parseInt(req.params.id));
    res.json({ success: true });
  });

  // ==================== MATERIALS ====================
  app.get("/api/materials", (req, res) => {
    const subjectId = parseInt(req.query.subjectId as string);
    const materials = storage.getMaterials(subjectId);
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
      const finalPath = path.join("uploads", uploadId + path.extname(originalName));
      const writeStream = fs.createWriteStream(finalPath);
      
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
      
      // Determine file type
      let fileType = "text";
      const ext = path.extname(originalName).toLowerCase();
      if ([".ppt", ".pptx"].includes(ext)) fileType = "ppt";
      else if ([".pdf"].includes(ext)) fileType = "pdf";
      else if ([".mp3", ".wav", ".m4a", ".ogg"].includes(ext)) fileType = "audio";
      else if ([".mp4", ".avi", ".mov", ".mkv"].includes(ext)) fileType = "video";
      else if ([".doc", ".docx"].includes(ext)) fileType = "doc";
      
      const material = storage.createMaterial({
        subjectId,
        filename: originalName,
        fileType,
        filePath: finalPath,
        status: "processing",
      });
      
      // Return immediately, extract text in background
      res.json(storage.getMaterial(material.id));
      
      // Background text extraction (including OCR if needed)
      extractTextFromFile(finalPath, fileType, originalName).then(extractedText => {
        if (extractedText) {
          storage.updateMaterial(material.id, { extractedText, status: "processed" });
        } else {
          storage.updateMaterial(material.id, { status: "processed" });
        }
        console.log(`Text extraction complete for ${originalName}: ${extractedText?.length || 0} chars`);
      }).catch(e => {
        console.error(`Text extraction failed for ${originalName}:`, e);
        storage.updateMaterial(material.id, { status: "error" });
      });
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

      const material = storage.createMaterial({
        subjectId,
        filename: originalName,
        fileType,
        filePath: file.path,
        status: "processing",
      });

      // Return immediately
      res.json(storage.getMaterial(material.id));

      // Background extraction
      extractTextFromFile(file.path, fileType, originalName).then(extractedText => {
        if (extractedText) {
          storage.updateMaterial(material.id, { extractedText, status: "processed" });
        } else {
          storage.updateMaterial(material.id, { status: "processed" });
        }
        console.log(`Text extraction complete for ${originalName}: ${extractedText?.length || 0} chars`);
      }).catch(e => {
        console.error(`Text extraction failed for ${originalName}:`, e);
        storage.updateMaterial(material.id, { status: "error" });
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/materials/:id", (req, res) => {
    const material = storage.getMaterial(parseInt(req.params.id));
    if (material?.filePath) {
      try { fs.unlinkSync(material.filePath); } catch {}
    }
    storage.deleteMaterial(parseInt(req.params.id));
    res.json({ success: true });
  });

  // ==================== REPROCESS MATERIALS ====================
  app.post("/api/materials/reprocess", async (req, res) => {
    try {
      const { subjectId } = req.body;
      const materials_list = storage.getMaterials(subjectId);
      const results: { id: number; filename: string; textLength: number; status: string }[] = [];
      
      for (const m of materials_list) {
        try {
          if (!m.filePath || !fs.existsSync(m.filePath)) {
            results.push({ id: m.id, filename: m.filename, textLength: 0, status: "file_missing" });
            continue;
          }
          const text = await extractTextFromFile(m.filePath, m.fileType, m.filename);
          const textLength = text?.length || 0;
          storage.updateMaterial(m.id, {
            extractedText: text || null,
            status: textLength > 0 ? "processed" : "error",
          });
          results.push({ id: m.id, filename: m.filename, textLength, status: textLength > 0 ? "processed" : "no_text" });
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
      const materials_list = storage.getMaterials(subjectId);
      const subject = storage.getSubject(subjectId);

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
            const sc = storage.createStudyContent({
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
      const sc = storage.createStudyContent({
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
      const subject = storage.getSubject(subjectId);
      
      let sourceText = "";
      let sourceName = subject?.name || "";
      
      const readableCheck = ["骨折","脫位","治療","骨傷","損傷","關節","筋","疼痛","固定","復位","中醫","手法","患者","藥","病","脈","血","氣"];
      
      if (materialId) {
        const material = storage.getMaterial(materialId);
        if (!material?.extractedText) {
          return res.status(400).json({ error: "該資料未提取到文字內容" });
        }
        // Check if text is readable
        const foundTerms = readableCheck.filter(t => material.extractedText!.includes(t)).length;
        if (foundTerms < 3) {
          return res.status(400).json({ error: "該PDF字體無法解讀，請重新上傳可選取文字的版本" });
        }
        sourceText = material.extractedText;
        sourceName = material.filename.replace(/\.[^.]+$/, "");
      } else {
        // Generate from all readable materials in subject
        const materials_list = storage.getMaterials(subjectId);
        sourceText = materials_list
          .filter(m => m.extractedText && readableCheck.filter(t => m.extractedText!.includes(t)).length >= 3)
          .map(m => `【${m.filename}】\n${m.extractedText}`)
          .join("\n\n---\n\n");
      }

      if (!sourceText.trim()) {
        return res.status(400).json({ error: "沒有可用的學習材料" });
      }

      // Limit text to 15k chars to ensure AI can process and return valid JSON
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

      // Robust JSON parsing - try multiple strategies
      let items: any[] | null = null;
      try {
        // Strategy 1: Find JSON array in response
        const jsonMatch = result.match(/\[[\s\S]*\]/);
        if (jsonMatch) items = JSON.parse(jsonMatch[0]);
      } catch {
        try {
          // Strategy 2: Try to fix truncated JSON by closing brackets
          const jsonMatch = result.match(/\[[\s\S]*/);
          if (jsonMatch) {
            let fixed = jsonMatch[0];
            // Count open/close braces and brackets
            const openBraces = (fixed.match(/\{/g) || []).length;
            const closeBraces = (fixed.match(/\}/g) || []).length;
            for (let i = 0; i < openBraces - closeBraces; i++) fixed += '}';
            if (!fixed.endsWith(']')) fixed += ']';
            items = JSON.parse(fixed);
          }
        } catch {
          try {
            // Strategy 3: Extract individual JSON objects
            const objMatches = result.match(/\{[^{}]*"questionType"[^{}]*\}/g);
            if (objMatches) items = objMatches.map(m => JSON.parse(m));
          } catch {}
        }
      }

      if (!items || items.length === 0) {
        console.error("Failed to parse AI response:", result.substring(0, 500));
        return res.status(500).json({ error: "AI生成題目格式解析失敗，請重試" });
      }

      const created = [];
      for (const item of items) {
        if (!item.questionText) continue;
        // Normalize question type
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
        const q = storage.createQuestion({
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
      return res.json(created);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/ai/explain", async (req, res) => {
    try {
      const { questionId, userAnswer, isCorrect } = req.body;
      const question = storage.getQuestion(questionId);
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
      const question = storage.getQuestion(questionId);
      if (!question) return res.status(404).json({ error: "Question not found" });

      // Get the source material for context
      const materials = storage.getMaterials(question.subjectId);
      const relevantText = materials
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
  app.get("/api/study-content", (req, res) => {
    const subjectId = parseInt(req.query.subjectId as string);
    res.json(storage.getStudyContents(subjectId));
  });

  app.post("/api/study-content", (req, res) => {
    const content = storage.createStudyContent(req.body);
    res.json(content);
  });

  app.delete("/api/study-content/:id", (req, res) => {
    storage.deleteStudyContent(parseInt(req.params.id));
    res.json({ success: true });
  });

  // ==================== QUESTIONS ====================
  app.get("/api/questions", (req, res) => {
    const subjectId = parseInt(req.query.subjectId as string);
    const examType = req.query.examType as string | undefined;
    res.json(storage.getQuestions(subjectId, examType));
  });

  // Get question count per material for a subject
  app.get("/api/questions/by-material", (req, res) => {
    const subjectId = parseInt(req.query.subjectId as string);
    const allQ = storage.getQuestions(subjectId);
    const byMaterial: Record<number, number> = {};
    for (const q of allQ) {
      const mid = (q as any).materialId || 0;
      byMaterial[mid] = (byMaterial[mid] || 0) + 1;
    }
    res.json(byMaterial);
  });

  // Random questions - supports filtering by materialIds OR subjectIds
  app.get("/api/questions/random", (req, res) => {
    const count = parseInt(req.query.count as string) || 10;
    const materialIds = (req.query.materialId as string || "").split(",").map(s => parseInt(s.trim())).filter(n => !isNaN(n));
    const subjectIds = (req.query.subjectId as string || "").split(",").map(s => parseInt(s.trim())).filter(n => !isNaN(n));
    
    let allQuestions: any[] = [];
    
    if (materialIds.length > 0) {
      // Get questions by material IDs
      for (const mid of materialIds) {
        const qs = db.select().from(questions).where(eq(questions.materialId, mid)).all();
        allQuestions = allQuestions.concat(qs);
      }
    } else if (subjectIds.length > 0) {
      for (const sid of subjectIds) {
        allQuestions = allQuestions.concat(storage.getRandomQuestions(sid, count * 2));
      }
    }
    
    // Shuffle
    for (let i = allQuestions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allQuestions[i], allQuestions[j]] = [allQuestions[j], allQuestions[i]];
    }
    res.json(allQuestions.slice(0, count));
  });

  app.post("/api/questions", (req, res) => {
    const q = storage.createQuestion(req.body);
    res.json(q);
  });

  app.delete("/api/questions/:id", (req, res) => {
    storage.deleteQuestion(parseInt(req.params.id));
    res.json({ success: true });
  });

  // ==================== STUDY RECORDS ====================
  app.get("/api/study-records", (req, res) => {
    const subjectId = req.query.subjectId ? parseInt(req.query.subjectId as string) : undefined;
    res.json(storage.getStudyRecords(subjectId));
  });

  app.post("/api/study-records", (req, res) => {
    const record = storage.createStudyRecord(req.body);
    // Update daily stats
    if (req.body.isCorrect !== undefined) {
      storage.updateTodayStats(!!req.body.isCorrect);
    }
    res.json(record);
  });

  // ==================== DAILY STATS ====================
  app.get("/api/stats/daily", (_req, res) => {
    res.json(storage.getDailyStats());
  });

  app.get("/api/stats/today", (_req, res) => {
    const today = storage.getTodayStats();
    const streak = storage.getStreak();
    res.json({ today, streak });
  });

  app.get("/api/stats/subject/:id", (req, res) => {
    const accuracy = storage.getSubjectAccuracy(parseInt(req.params.id));
    res.json(accuracy);
  });
}
