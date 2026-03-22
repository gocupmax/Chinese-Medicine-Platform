import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Academic years and semesters
export const semesters = sqliteTable("semesters", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  year: integer("year").notNull(), // 1-4
  semester: integer("semester").notNull(), // 1 or 2
  name: text("name").notNull(), // e.g. "第一學年 上學期"
});

// Subjects/courses
export const subjects = sqliteTable("subjects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  semesterId: integer("semester_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  icon: text("icon"), // emoji or icon name
});

// Uploaded materials (PPT, audio, video, PDF, etc.)
export const materials = sqliteTable("materials", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  subjectId: integer("subject_id").notNull(),
  filename: text("filename").notNull(),
  fileType: text("file_type").notNull(), // ppt, pdf, audio, video, text
  filePath: text("file_path").notNull(),
  extractedText: text("extracted_text"), // text content extracted from the file
  aiSummary: text("ai_summary"), // AI-generated summary
  status: text("status").notNull().default("uploaded"), // uploaded, processing, processed, error
});

// AI-generated study content from materials
export const studyContent = sqliteTable("study_content", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  subjectId: integer("subject_id").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(), // rich text / markdown content
  contentType: text("content_type").notNull().default("lesson"), // lesson, summary, keypoints, mnemonic
  orderIndex: integer("order_index").notNull().default(0),
});

// Quiz questions
export const questions = sqliteTable("questions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  subjectId: integer("subject_id").notNull(),
  materialId: integer("material_id"), // links question to specific PDF
  questionType: text("question_type").notNull().default("mc"), // mc, truefalse, essay
  questionText: text("question_text").notNull(),
  options: text("options"), // JSON array for MC options
  correctAnswer: text("correct_answer").notNull(),
  explanation: text("explanation"), // AI explanation of why this is correct
  difficulty: integer("difficulty").notNull().default(1), // 1-3
  examType: text("exam_type"), // midterm, final, or null for general
});

// Study progress and quiz results
export const studyRecords = sqliteTable("study_records", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  subjectId: integer("subject_id").notNull(),
  questionId: integer("question_id"),
  isCorrect: integer("is_correct"), // 0 or 1
  userAnswer: text("user_answer"),
  studiedAt: text("studied_at").notNull(), // ISO date string
  sessionType: text("session_type").notNull().default("quiz"), // quiz, review, lesson
});

// Daily streak and stats
export const dailyStats = sqliteTable("daily_stats", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(), // YYYY-MM-DD
  questionsAnswered: integer("questions_answered").notNull().default(0),
  correctCount: integer("correct_count").notNull().default(0),
  studyMinutes: integer("study_minutes").notNull().default(0),
  streak: integer("streak").notNull().default(0),
});

// Insert schemas
export const insertSemesterSchema = createInsertSchema(semesters).omit({ id: true });
export const insertSubjectSchema = createInsertSchema(subjects).omit({ id: true });
export const insertMaterialSchema = createInsertSchema(materials).omit({ id: true });
export const insertStudyContentSchema = createInsertSchema(studyContent).omit({ id: true });
export const insertQuestionSchema = createInsertSchema(questions).omit({ id: true });
export const insertStudyRecordSchema = createInsertSchema(studyRecords).omit({ id: true });
export const insertDailyStatsSchema = createInsertSchema(dailyStats).omit({ id: true });

// Types
export type Semester = typeof semesters.$inferSelect;
export type InsertSemester = z.infer<typeof insertSemesterSchema>;
export type Subject = typeof subjects.$inferSelect;
export type InsertSubject = z.infer<typeof insertSubjectSchema>;
export type Material = typeof materials.$inferSelect;
export type InsertMaterial = z.infer<typeof insertMaterialSchema>;
export type StudyContent = typeof studyContent.$inferSelect;
export type InsertStudyContent = z.infer<typeof insertStudyContentSchema>;
export type Question = typeof questions.$inferSelect;
export type InsertQuestion = z.infer<typeof insertQuestionSchema>;
export type StudyRecord = typeof studyRecords.$inferSelect;
export type InsertStudyRecord = z.infer<typeof insertStudyRecordSchema>;
export type DailyStat = typeof dailyStats.$inferSelect;
export type InsertDailyStat = z.infer<typeof insertDailyStatsSchema>;
