import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  doublePrecision,
  vector,
  uniqueIndex,
} from "drizzle-orm/pg-core";
const id = () => uuid("id").primaryKey().defaultRandom();
const created = () =>
  timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
export const users = pgTable("users", {
  id: id(),
  emailHash: text("email_hash").notNull().unique(),
  emailEnc: text("email_enc").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("patient"),
  clinicId: uuid("clinic_id"),
  active: boolean("active").notNull().default(true),
  createdAt: created(),
});
export const profiles = pgTable("profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id),
  payloadEnc: text("payload_enc").notNull(),
});
export const reports = pgTable("reports", {
  id: id(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  payloadEnc: text("payload_enc").notNull(),
  rawEnc: text("raw_enc"),
  mime: text("mime").notNull(),
  state: text("state").notNull().default("uploaded"),
  processingStage: text("processing_stage").notNull().default("queued"),
  attempts: integer("attempts").notNull().default(0),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  errorCode: text("error_code"),
  createdAt: created(),
});
export const reportValues = pgTable("report_values", {
  id: id(),
  reportId: uuid("report_id")
    .notNull()
    .references(() => reports.id, { onDelete: "cascade" }),
  payloadEnc: text("payload_enc").notNull(),
});
export const referenceRanges = pgTable(
  "reference_ranges",
  {
    id: id(),
    testCode: text("test_code").notNull(),
    label: text("label").notNull(),
    unit: text("unit").notNull(),
    low: doublePrecision("low").notNull(),
    high: doublePrecision("high").notNull(),
    borderlineLow: doublePrecision("borderline_low"),
    borderlineHigh: doublePrecision("borderline_high"),
    criticalLow: doublePrecision("critical_low"),
    criticalHigh: doublePrecision("critical_high"),
    ageMin: integer("age_min").notNull().default(18),
    ageMax: integer("age_max").notNull().default(120),
    sex: text("sex").notNull().default("any"),
    sourceUrl: text("source_url").notNull(),
    sourceLabel: text("source_label").notNull(),
    verification: text("verification").notNull().default("draft"),
    version: integer("version").notNull().default(1),
  },
  (t) => [
    uniqueIndex("range_context_version").on(
      t.testCode,
      t.unit,
      t.sex,
      t.ageMin,
      t.ageMax,
      t.version,
    ),
  ],
);
export const explanations = pgTable(
  "explanations",
  {
    id: id(),
    reportId: uuid("report_id")
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    locale: text("locale").notNull(),
    payloadEnc: text("payload_enc").notNull(),
  },
  (t) => [uniqueIndex("report_explanation_locale").on(t.reportId, t.locale)],
);
export const medications = pgTable("medications", {
  id: id(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  payloadEnc: text("payload_enc").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: created(),
});
export const reminders = pgTable("reminders", {
  id: id(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  medicationId: uuid("medication_id").references(() => medications.id, {
    onDelete: "set null",
  }),
  payloadEnc: text("payload_enc").notNull(),
  dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
  intervalMinutes: integer("interval_minutes"),
  active: boolean("active").notNull().default(true),
  createdAt: created(),
});
export const followUps = pgTable("follow_ups", {
  id: id(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  payloadEnc: text("payload_enc").notNull(),
  dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
  completed: boolean("completed").notNull().default(false),
  createdAt: created(),
});
export const escalations = pgTable("escalations", {
  id: id(),
  reportId: uuid("report_id")
    .notNull()
    .unique()
    .references(() => reports.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  clinicId: uuid("clinic_id").notNull(),
  severity: text("severity").notNull(),
  state: text("state").notNull().default("open"),
  noteEnc: text("note_enc"),
  reviewerId: uuid("reviewer_id").references(() => users.id),
  createdAt: created(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
export const chatMessages = pgTable("chat_messages", {
  id: id(),
  reportId: uuid("report_id")
    .notNull()
    .references(() => reports.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  role: text("role").notNull(),
  contentEnc: text("content_enc").notNull(),
  createdAt: created(),
});
export const auditLogs = pgTable("audit_logs", {
  id: id(),
  actorId: uuid("actor_id"),
  patientId: uuid("patient_id"),
  action: text("action").notNull(),
  resourceId: text("resource_id"),
  outcome: text("outcome").notNull(),
  createdAt: created(),
});
export const knowledgeChunks = pgTable("knowledge_chunks", {
  id: id(),
  testCode: text("test_code").notNull(),
  locale: text("locale").notNull(),
  content: text("content").notNull(),
  source: text("source").notNull(),
  reviewed: boolean("reviewed").notNull().default(false),
  embedding: vector("embedding", { dimensions: 384 }).notNull(),
});
export const refreshTokens = pgTable("refresh_tokens", {
  id: id(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  familyId: uuid("family_id").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: created(),
});
export const automationEvents = pgTable("automation_events", {
  id: id(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  kind: text("kind").notNull(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  payloadEnc: text("payload_enc").notNull(),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: created(),
});
export const webhookNonces = pgTable("webhook_nonces", {
  nonce: text("nonce").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
