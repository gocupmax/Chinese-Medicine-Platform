import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
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

const client = createClient({
  url: process.env.TURSO_DATABASE_URL || "file:data.db",
  authToken: process.env.TURSO_AUTH_TOKEN,
});
export const db = drizzle(client);

export interface IStorage {
  // Semesters
  getSemesters(): Promise<Semester[]>;
  getSemester(id: number): Promise<Semester | undefined>;
  createSemester(data: InsertSemester): Promise<Semester>;
  deleteSemester(id: number): Promise<void>;

  // Subjects
  getSubjects(semesterId?: number): Promise<Subject[]>;
  getSubject(id: number): Promise<Subject | undefined>;
  createSubject(data: InsertSubject): Promise<Subject>;
  updateSubject(id: number, data: Partial<InsertSubject>): Promise<Subject | undefined>;
  deleteSubject(id: number): Promise<void>;

  // Materials
  getMaterials(subjectId: number): Promise<Material[]>;
  getMaterial(id: number): Promise<Material | undefined>;
  createMaterial(data: InsertMaterial): Promise<Material>;
  updateMaterial(id: number, data: Partial<InsertMaterial>): Promise<Material | undefined>;
  deleteMaterial(id: number): Promise<void>;

  // Study Content
  getStudyContents(subjectId: number): Promise<StudyContent[]>;
  getStudyContent(id: number): Promise<StudyContent | undefined>;
  createStudyContent(data: InsertStudyContent): Promise<StudyContent>;
  updateStudyContent(id: number, data: Partial<InsertStudyContent>): Promise<StudyContent | undefined>;
  deleteStudyContent(id: number): Promise<void>;

  // Questions
  getQuestions(subjectId: number, examType?: string): Promise<Question[]>;
  getQuestion(id: number): Promise<Question | undefined>;
  createQuestion(data: InsertQuestion): Promise<Question>;
  updateQuestion(id: number, data: Partial<InsertQuestion>): Promise<Question | undefined>;
  deleteQuestion(id: number): Promise<void>;
  getRandomQuestions(subjectId: number, count: number): Promise<Question[]>;

  // Study Records
  getStudyRecords(subjectId?: number): Promise<StudyRecord[]>;
  createStudyRecord(data: InsertStudyRecord): Promise<StudyRecord>;

  // Daily Stats
  getDailyStats(days?: number): Promise<DailyStat[]>;
  getTodayStats(): Promise<DailyStat | undefined>;
  updateTodayStats(correct: boolean): Promise<DailyStat>;

  // Analytics
  getSubjectAccuracy(subjectId: number): Promise<{ total: number; correct: number; accuracy: number }>;
  getStreak(): Promise<number>;
}

export class DatabaseStorage implements IStorage {
  async getSemesters(): Promise<Semester[]> {
    return await db.select().from(semesters).all();
  }

  async getSemester(id: number): Promise<Semester | undefined> {
    const [row] = await db.select().from(semesters).where(eq(semesters.id, id));
    return row;
  }

  async createSemester(data: InsertSemester): Promise<Semester> {
    const [row] = await db.insert(semesters).values(data).returning();
    return row;
  }

  async deleteSemester(id: number): Promise<void> {
    await db.delete(semesters).where(eq(semesters.id, id));
  }

  async getSubjects(semesterId?: number): Promise<Subject[]> {
    if (semesterId) {
      return await db.select().from(subjects).where(eq(subjects.semesterId, semesterId)).all();
    }
    return await db.select().from(subjects).all();
  }

  async getSubject(id: number): Promise<Subject | undefined> {
    const [row] = await db.select().from(subjects).where(eq(subjects.id, id));
    return row;
  }

  async createSubject(data: InsertSubject): Promise<Subject> {
    const [row] = await db.insert(subjects).values(data).returning();
    return row;
  }

  async updateSubject(id: number, data: Partial<InsertSubject>): Promise<Subject | undefined> {
    const [row] = await db.update(subjects).set(data).where(eq(subjects.id, id)).returning();
    return row;
  }

  async deleteSubject(id: number): Promise<void> {
    await db.delete(subjects).where(eq(subjects.id, id));
  }

  async getMaterials(subjectId: number): Promise<Material[]> {
    return await db.select().from(materials).where(eq(materials.subjectId, subjectId)).all();
  }

  async getMaterial(id: number): Promise<Material | undefined> {
    const [row] = await db.select().from(materials).where(eq(materials.id, id));
    return row;
  }

  async createMaterial(data: InsertMaterial): Promise<Material> {
    const [row] = await db.insert(materials).values(data).returning();
    return row;
  }

  async updateMaterial(id: number, data: Partial<InsertMaterial>): Promise<Material | undefined> {
    const [row] = await db.update(materials).set(data).where(eq(materials.id, id)).returning();
    return row;
  }

  async deleteMaterial(id: number): Promise<void> {
    await db.delete(materials).where(eq(materials.id, id));
  }

  async getStudyContents(subjectId: number): Promise<StudyContent[]> {
    return await db.select().from(studyContent).where(eq(studyContent.subjectId, subjectId)).all();
  }

  async getStudyContent(id: number): Promise<StudyContent | undefined> {
    const [row] = await db.select().from(studyContent).where(eq(studyContent.id, id));
    return row;
  }

  async createStudyContent(data: InsertStudyContent): Promise<StudyContent> {
    const [row] = await db.insert(studyContent).values(data).returning();
    return row;
  }

  async updateStudyContent(id: number, data: Partial<InsertStudyContent>): Promise<StudyContent | undefined> {
    const [row] = await db.update(studyContent).set(data).where(eq(studyContent.id, id)).returning();
    return row;
  }

  async deleteStudyContent(id: number): Promise<void> {
    await db.delete(studyContent).where(eq(studyContent.id, id));
  }

  async getQuestions(subjectId: number, examType?: string): Promise<Question[]> {
    if (examType) {
      return await db.select().from(questions).where(and(eq(questions.subjectId, subjectId), eq(questions.examType, examType))).all();
    }
    return await db.select().from(questions).where(eq(questions.subjectId, subjectId)).all();
  }

  async getQuestion(id: number): Promise<Question | undefined> {
    const [row] = await db.select().from(questions).where(eq(questions.id, id));
    return row;
  }

  async createQuestion(data: InsertQuestion): Promise<Question> {
    const [row] = await db.insert(questions).values(data).returning();
    return row;
  }

  async updateQuestion(id: number, data: Partial<InsertQuestion>): Promise<Question | undefined> {
    const [row] = await db.update(questions).set(data).where(eq(questions.id, id)).returning();
    return row;
  }

  async deleteQuestion(id: number): Promise<void> {
    await db.delete(questions).where(eq(questions.id, id));
  }

  async getRandomQuestions(subjectId: number, count: number): Promise<Question[]> {
    return await db.select().from(questions)
      .where(eq(questions.subjectId, subjectId))
      .orderBy(sql`RANDOM()`)
      .limit(count)
      .all();
  }

  async getStudyRecords(subjectId?: number): Promise<StudyRecord[]> {
    if (subjectId) {
      return await db.select().from(studyRecords).where(eq(studyRecords.subjectId, subjectId)).orderBy(desc(studyRecords.studiedAt)).all();
    }
    return await db.select().from(studyRecords).orderBy(desc(studyRecords.studiedAt)).all();
  }

  async createStudyRecord(data: InsertStudyRecord): Promise<StudyRecord> {
    const [row] = await db.insert(studyRecords).values(data).returning();
    return row;
  }

  async getDailyStats(days: number = 30): Promise<DailyStat[]> {
    return await db.select().from(dailyStats).orderBy(desc(dailyStats.date)).limit(days).all();
  }

  async getTodayStats(): Promise<DailyStat | undefined> {
    const today = new Date().toISOString().split("T")[0];
    const [row] = await db.select().from(dailyStats).where(eq(dailyStats.date, today));
    return row;
  }

  async updateTodayStats(correct: boolean): Promise<DailyStat> {
    const today = new Date().toISOString().split("T")[0];
    const existing = await this.getTodayStats();
    if (existing) {
      const [row] = await db.update(dailyStats).set({
        questionsAnswered: existing.questionsAnswered + 1,
        correctCount: existing.correctCount + (correct ? 1 : 0),
      }).where(eq(dailyStats.id, existing.id)).returning();
      return row;
    }
    // Calculate streak
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split("T")[0];
    const [yesterdayStats] = await db.select().from(dailyStats).where(eq(dailyStats.date, yesterdayStr));
    const streak = yesterdayStats ? yesterdayStats.streak + 1 : 1;

    const [row] = await db.insert(dailyStats).values({
      date: today,
      questionsAnswered: 1,
      correctCount: correct ? 1 : 0,
      streak,
    }).returning();
    return row;
  }

  async getSubjectAccuracy(subjectId: number): Promise<{ total: number; correct: number; accuracy: number }> {
    const records = await db.select().from(studyRecords)
      .where(and(eq(studyRecords.subjectId, subjectId), eq(studyRecords.sessionType, "quiz")))
      .all();
    const total = records.length;
    const correct = records.filter(r => r.isCorrect === 1).length;
    return { total, correct, accuracy: total > 0 ? Math.round((correct / total) * 100) : 0 };
  }

  async getStreak(): Promise<number> {
    const [stats] = await db.select().from(dailyStats).orderBy(desc(dailyStats.date)).limit(1);
    return stats?.streak || 0;
  }
}

export const storage = new DatabaseStorage();
