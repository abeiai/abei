CREATE TYPE "KnowledgeDocumentStatus" AS ENUM ('PROCESSING', 'READY', 'FAILED');

CREATE TYPE "WorkflowRunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');

ALTER TABLE "ai_scenarios"
ADD COLUMN "promptVariables" JSONB,
ADD COLUMN "defaultModelId" TEXT,
ADD COLUMN "fallbackModelId" TEXT;

ALTER TABLE "ai_models"
ADD COLUMN "fallbackModelId" TEXT;

ALTER TABLE "ai_tasks"
ADD COLUMN "knowledgeBaseId" TEXT,
ADD COLUMN "renderedPrompt" TEXT;

CREATE TABLE "knowledge_bases" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_bases_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "knowledge_documents" (
    "id" TEXT NOT NULL,
    "knowledgeBaseId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "status" "KnowledgeDocumentStatus" NOT NULL DEFAULT 'PROCESSING',
    "contentText" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "knowledge_chunks" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "embeddingId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_chunks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_tool_calls" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "output" JSONB,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_tool_calls_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_workflows" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "costCredits" INTEGER NOT NULL DEFAULT 0,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_workflows_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_workflow_steps" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_workflow_steps_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_workflow_runs" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "WorkflowRunStatus" NOT NULL DEFAULT 'RUNNING',
    "input" TEXT NOT NULL,
    "output" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ai_workflow_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_workflow_run_steps" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "input" TEXT NOT NULL,
    "output" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_workflow_run_steps_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ai_workflows_slug_key" ON "ai_workflows"("slug");
CREATE INDEX "ai_scenarios_defaultModelId_idx" ON "ai_scenarios"("defaultModelId");
CREATE INDEX "ai_scenarios_fallbackModelId_idx" ON "ai_scenarios"("fallbackModelId");
CREATE INDEX "ai_models_fallbackModelId_idx" ON "ai_models"("fallbackModelId");
CREATE INDEX "ai_tasks_knowledgeBaseId_idx" ON "ai_tasks"("knowledgeBaseId");
CREATE INDEX "knowledge_bases_userId_createdAt_idx" ON "knowledge_bases"("userId", "createdAt");
CREATE INDEX "knowledge_documents_knowledgeBaseId_createdAt_idx" ON "knowledge_documents"("knowledgeBaseId", "createdAt");
CREATE INDEX "knowledge_documents_status_idx" ON "knowledge_documents"("status");
CREATE INDEX "knowledge_chunks_documentId_sortOrder_idx" ON "knowledge_chunks"("documentId", "sortOrder");
CREATE INDEX "knowledge_chunks_embeddingId_idx" ON "knowledge_chunks"("embeddingId");
CREATE INDEX "ai_tool_calls_userId_createdAt_idx" ON "ai_tool_calls"("userId", "createdAt");
CREATE INDEX "ai_tool_calls_toolName_idx" ON "ai_tool_calls"("toolName");
CREATE INDEX "ai_workflows_isEnabled_idx" ON "ai_workflows"("isEnabled");
CREATE INDEX "ai_workflow_steps_workflowId_sortOrder_idx" ON "ai_workflow_steps"("workflowId", "sortOrder");
CREATE INDEX "ai_workflow_runs_workflowId_createdAt_idx" ON "ai_workflow_runs"("workflowId", "createdAt");
CREATE INDEX "ai_workflow_runs_userId_createdAt_idx" ON "ai_workflow_runs"("userId", "createdAt");
CREATE INDEX "ai_workflow_runs_status_idx" ON "ai_workflow_runs"("status");
CREATE INDEX "ai_workflow_run_steps_runId_sortOrder_idx" ON "ai_workflow_run_steps"("runId", "sortOrder");
CREATE INDEX "ai_workflow_run_steps_stepId_idx" ON "ai_workflow_run_steps"("stepId");

ALTER TABLE "ai_scenarios" ADD CONSTRAINT "ai_scenarios_defaultModelId_fkey" FOREIGN KEY ("defaultModelId") REFERENCES "ai_models"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ai_scenarios" ADD CONSTRAINT "ai_scenarios_fallbackModelId_fkey" FOREIGN KEY ("fallbackModelId") REFERENCES "ai_models"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ai_models" ADD CONSTRAINT "ai_models_fallbackModelId_fkey" FOREIGN KEY ("fallbackModelId") REFERENCES "ai_models"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ai_tasks" ADD CONSTRAINT "ai_tasks_knowledgeBaseId_fkey" FOREIGN KEY ("knowledgeBaseId") REFERENCES "knowledge_bases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "knowledge_bases" ADD CONSTRAINT "knowledge_bases_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_knowledgeBaseId_fkey" FOREIGN KEY ("knowledgeBaseId") REFERENCES "knowledge_bases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "knowledge_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_tool_calls" ADD CONSTRAINT "ai_tool_calls_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_workflow_steps" ADD CONSTRAINT "ai_workflow_steps_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "ai_workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_workflow_runs" ADD CONSTRAINT "ai_workflow_runs_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "ai_workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_workflow_runs" ADD CONSTRAINT "ai_workflow_runs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_workflow_run_steps" ADD CONSTRAINT "ai_workflow_run_steps_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ai_workflow_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_workflow_run_steps" ADD CONSTRAINT "ai_workflow_run_steps_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "ai_workflow_steps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
