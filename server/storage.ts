import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, desc, and, sql } from "drizzle-orm";
import {
  semesters, subjects, materials, studyContent, questions, studyRecords, dailyStats,
  type Semester, type InsertSemester,
  type Subject, type InsertSubject,
  type Material, type InsertMaterial,
  type StudyContent, type InsertStudyContent,
  type Question, type InsertQuestion,
  type StudyRecord, type InsertStudyRecord,
  type DailyStat, type InsertDailyStat,
} from "@shared/schema";

const sqlite = new Database("data.db");
sqlite.pragma("journal_mode = WAL");
export const db = drizzle(sqlite);

export interface IStorage {
  // Semesters
  getSemesters(): Semester[];
  getSemester(id: number): Semester | undefined;
  createSemester(data: InsertSemester): Semester;
  deleteSemester(id: number): void;

  // Subjects
  getSubjects(semesterId?: number): Subject[];
  getSubject(id: number): Subject | undefined;
  createSubject(data: InsertSubject): Subject;
  updateSubject(id: number, data: Partial<InsertSubject>): Subject | undefined;
  deleteSubject(id: number): void;

  // Materials
  getMaterials(subjectId: number): Material[];
  getMaterial(id: number): Material | undefined;
  createMaterial(data: InsertMaterial): Material;
  updateMaterial(id: number, data: Partial<InsertMaterial>): Material | undefined;
  deleteMaterial(id: number): void;

  // Study Content
  getStudyContents(subjectId: number): StudyContent[];
  getStudyContent(id: number): StudyContent | undefined;
  createStudyContent(data: InsertStudyContent): StudyContent;
  updateStudyContent(id: number, data: Partial<InsertStudyContent>): StudyContent | undefined;
  deleteStudyContent(id: number): void;

  // Questions
  getQuestions(subjectId: number, examType?: string): Question[];
  getQuestion(id: number): Question | undefined;
  createQuestion(data: InsertQuestion): Question;
  updateQuestion(id: number, data: Partial<InsertQuestion>): Question | undefined;
  deleteQuestion(id: number): void;
  getRandomQuestions(subjectId: number, count: number): Question[];

  // Study Records
  getStudyRecords(subjectId?: number): StudyRecord[];
  createStudyRecord(data: InsertStudyRecord): StudyRecord;

  // Daily Stats
  getDailyStats(days?: number): DailyStat[];
  getTodayStats(): DailyStat | undefined;
  updateTodayStats(correct: boolean): DailyStat;

  // Analytics
  getSubjectAccuracy(subjectId: number): { total: number; correct: number; accuracy: number };
  getStreak(): number;
}

export class DatabaseStorage implements IStorage {
  getSemesters(): Semester[] {
    return db.select().from(semesters).all();
  }

  getSemester(id: number): Semester | undefined {
    return db.select().from(semesters).where(eq(semesters.id, id)).get();
  }

  createSemester(data: InsertSemester): Semester {
    return db.insert(semesters).values(data).returning().get();
  }

  deleteSemester(id: number): void {
    db.delete(semesters).where(eq(semesters.id, id)).run();
  }

  getSubjects(semesterId?: number): Subject[] {
    if (semesterId) {
      return db.select().from(subjects).where(eq(subjects.semesterId, semesterId)).all();
    }
    return db.select().from(subjects).all();
  }

  getSubject(id: number): Subject | undefined {
    return db.select().from(subjects).where(eq(subjects.id, id)).get();
  }

  createSubject(data: InsertSubject): Subject {
    return db.insert(subjects).values(data).returning().get();
  }

  updateSubject(id: number, data: Partial<InsertSubject>): Subject | undefined {
    return db.update(subjects).set(data).where(eq(subjects.id, id)).returning().get();
  }

  deleteSubject(id: number): void {
    db.delete(subjects).where(eq(subjects.id, id)).run();
  }

  getMaterials(subjectId: number): Material[] {
    return db.select().from(materials).where(eq(materials.subjectId, subjectId)).all();
  }

  getMaterial(id: number): Material | undefined {
    return db.select().from(materials).where(eq(materials.id, id)).get();
  }

  createMaterial(data: InsertMaterial): Material {
    return db.insert(materials).values(data).returning().get();
  }

  updateMaterial(id: number, data: Partial<InsertMaterial>): Material | undefined {
    return db.update(materials).set(data).where(eq(materials.id, id)).returning().get();
  }

  deleteMaterial(id: number): void {
    db.delete(materials).where(eq(materials.id, id)).run();
  }

  getStudyContents(subjectId: number): StudyContent[] {
    return db.select().from(studyContent).where(eq(studyContent.subjectId, subjectId)).all();
  }

  getStudyContent(id: number): StudyContent | undefined {
    return db.select().from(studyContent).where(eq(studyContent.id, id)).get();
  }

  createStudyContent(data: InsertStudyContent): StudyContent {
    return db.insert(studyContent).values(data).returning().get();
  }

  updateStudyContent(id: number, data: Partial<InsertStudyContent>): StudyContent | undefined {
    return db.update(studyContent).set(data).where(eq(studyContent.id, id)).returning().get();
  }

  deleteStudyContent(id: number): void {
    db.delete(studyContent).where(eq(studyContent.id, id)).run();
  }

  getQuestions(subjectId: number, examType?: string): Question[] {
    if (examType) {
      return db.select().from(questions).where(and(eq(questions.subjectId, subjectId), eq(questions.examType, examType))).all();
    }
    return db.select().from(questions).where(eq(questions.subjectId, subjectId)).all();
  }

  getQuestion(id: number): Question | undefined {
    return db.select().from(questions).where(eq(questions.id, id)).get();
  }

  createQuestion(data: InsertQuestion): Question {
    return db.insert(questions).values(data).returning().get();
  }

  updateQuestion(id: number, data: Partial<InsertQuestion>): Question | undefined {
    return db.update(questions).set(data).where(eq(questions.id, id)).returning().get();
  }

  deleteQuestion(id: number): void {
    db.delete(questions).where(eq(questions.id, id)).run();
  }

  getRandomQuestions(subjectId: number, count: number): Question[] {
    return db.select().from(questions)
      .where(eq(questions.subjectId, subjectId))
      .orderBy(sql`RANDOM()`)
      .limit(count)
      .all();
  }

  getStudyRecords(subjectId?: number): StudyRecord[] {
    if (subjectId) {
      return db.select().from(studyRecords).where(eq(studyRecords.subjectId, subjectId)).orderBy(desc(studyRecords.studiedAt)).all();
    }
    return db.select().from(studyRecords).orderBy(desc(studyRecords.studiedAt)).all();
  }

  createStudyRecord(data: InsertStudyRecord): StudyRecord {
    return db.insert(studyRecords).values(data).returning().get();
  }

  getDailyStats(days: number = 30): DailyStat[] {
    return db.select().from(dailyStats).orderBy(desc(dailyStats.date)).limit(days).all();
  }

  getTodayStats(): DailyStat | undefined {
    const today = new Date().toISOString().split("T")[0];
    return db.select().from(dailyStats).where(eq(dailyStats.date, today)).get();
  }

  updateTodayStats(correct: boolean): DailyStat {
    const today = new Date().toISOString().split("T")[0];
    const existing = this.getTodayStats();
    if (existing) {
      return db.update(dailyStats).set({
        questionsAnswered: existing.questionsAnswered + 1,
        correctCount: existing.correctCount + (correct ? 1 : 0),
      }).where(eq(dailyStats.id, existing.id)).returning().get();
    }
    // Calculate streak
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split("T")[0];
    const yesterdayStats = db.select().from(dailyStats).where(eq(dailyStats.date, yesterdayStr)).get();
    const streak = yesterdayStats ? yesterdayStats.streak + 1 : 1;

    return db.insert(dailyStats).values({
      date: today,
      questionsAnswered: 1,
      correctCount: correct ? 1 : 0,
      streak,
    }).returning().get();
  }

  getSubjectAccuracy(subjectId: number): { total: number; correct: number; accuracy: number } {
    const records = db.select().from(studyRecords)
      .where(and(eq(studyRecords.subjectId, subjectId), eq(studyRecords.sessionType, "quiz")))
      .all();
    const total = records.length;
    const correct = records.filter(r => r.isCorrect === 1).length;
    return { total, correct, accuracy: total > 0 ? Math.round((correct / total) * 100) : 0 };
  }

  getStreak(): number {
    const stats = db.select().from(dailyStats).orderBy(desc(dailyStats.date)).limit(1).get();
    return stats?.streak || 0;
  }
}

export const storage = new DatabaseStorage();
