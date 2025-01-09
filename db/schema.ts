import { pgTable, text, serial, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const uploads = pgTable("uploads", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  ipAddress: text("ip_address").notNull(),
  fileName: text("file_name").notNull(),
  fileId: text("file_id").notNull(),
  isAi: boolean("is_ai"),
  confidenceScore: text("confidence_score"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUploadSchema = createInsertSchema(uploads);
export const selectUploadSchema = createSelectSchema(uploads);
export type InsertUpload = typeof uploads.$inferInsert;
export type SelectUpload = typeof uploads.$inferSelect;
