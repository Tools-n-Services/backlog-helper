-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "board_visibility" AS ENUM ('public', 'private', 'readonly');

-- CreateEnum
CREATE TYPE "moderation" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "privacy" AS ENUM ('public', 'reporter_team', 'team_only');

-- CreateEnum
CREATE TYPE "frequency" AS ENUM ('always', 'sometimes', 'once');

-- CreateEnum
CREATE TYPE "resolution" AS ENUM ('fixed', 'duplicate', 'not_reproducible', 'by_design', 'wont_fix', 'auto_closed');

-- CreateEnum
CREATE TYPE "default_sort" AS ENUM ('trending', 'new', 'affected');

-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('user', 'moderator', 'admin', 'owner');

-- CreateEnum
CREATE TYPE "attachment_kind" AS ENUM ('image', 'video', 'log', 'har', 'other');

-- CreateEnum
CREATE TYPE "attachment_visibility" AS ENUM ('public', 'team_only');

-- CreateEnum
CREATE TYPE "subscription_source" AS ENUM ('vote', 'author', 'comment', 'manual');

-- CreateEnum
CREATE TYPE "change_kind" AS ENUM ('new', 'improved', 'fixed');

-- CreateEnum
CREATE TYPE "backlog_kind" AS ENUM ('feature', 'bug', 'tech', 'compliance');

-- CreateEnum
CREATE TYPE "backlog_decision" AS ENUM ('accepted', 'rejected', 'deferred');

-- CreateEnum
CREATE TYPE "insight_source" AS ENUM ('call', 'ticket', 'chat', 'interview', 'sales', 'other');

-- CreateTable
CREATE TABLE "board" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "visibility" "board_visibility" NOT NULL DEFAULT 'public',
    "hidden_from_nav" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL,
    "post_count" INTEGER NOT NULL DEFAULT 0,
    "require_category" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "board_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "board_id" UUID NOT NULL,
    "parent_id" UUID,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "post_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tag" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "board_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "post_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "status" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL,
    "show_on_roadmap" BOOLEAN NOT NULL DEFAULT false,
    "is_terminal" BOOLEAN NOT NULL DEFAULT false,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "status_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_type" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "form_schema" JSONB NOT NULL DEFAULT '[]',
    "allowed_status_ids" UUID[],
    "default_status_id" UUID,
    "default_privacy" "privacy" NOT NULL DEFAULT 'public',
    "allows_votes" BOOLEAN NOT NULL DEFAULT true,
    "vote_label" TEXT NOT NULL DEFAULT '',
    "default_sort" "default_sort" NOT NULL DEFAULT 'trending',
    "goes_to_backlog" BOOLEAN NOT NULL DEFAULT true,
    "public_feed" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intake_source" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "auto_publish" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intake_source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sla_policy" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "post_type_id" UUID,
    "severity" TEXT,
    "first_response_hours" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sla_policy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "domain" TEXT,
    "member_count" INTEGER NOT NULL DEFAULT 0,
    "monthly_spend" DECIMAL(12,2),
    "custom_fields" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_user" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" CITEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatar_url" TEXT,
    "role" TEXT NOT NULL DEFAULT '',
    "access_role" "user_role" NOT NULL DEFAULT 'user',
    "is_team" BOOLEAN NOT NULL DEFAULT false,
    "external_id" TEXT,
    "company_id" UUID,
    "segments" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notification_prefs" JSONB NOT NULL DEFAULT '{}',
    "banned_at" TIMESTAMPTZ(6),
    "trusted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "app_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "board_id" UUID NOT NULL,
    "type_id" UUID NOT NULL,
    "source_id" UUID,
    "author_id" UUID,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "details" TEXT NOT NULL DEFAULT '',
    "status_id" UUID NOT NULL,
    "category_id" UUID,
    "eta" TEXT,
    "moderation" "moderation" NOT NULL DEFAULT 'approved',
    "merged_into_id" UUID,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "vote_count" INTEGER NOT NULL DEFAULT 0,
    "comment_count" INTEGER NOT NULL DEFAULT 0,
    "affected_count" INTEGER NOT NULL DEFAULT 0,
    "trend_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status_changed_at" TIMESTAMPTZ(6),
    "impact" SMALLINT,
    "confidence" SMALLINT,
    "effort" SMALLINT,
    "custom_fields" JSONB NOT NULL DEFAULT '{}',
    "internal_note" TEXT,
    "search_tsv" tsvector,
    "severity" TEXT,
    "frequency" "frequency",
    "started_at" TEXT,
    "environment" JSONB,
    "diagnostics" JSONB,
    "fingerprint" TEXT,
    "regression_of" UUID,
    "privacy" "privacy" NOT NULL DEFAULT 'public',
    "priority" TEXT,
    "assignee_id" UUID,
    "first_response_at" TIMESTAMPTZ(6),
    "sla_due_at" TIMESTAMPTZ(6),
    "needs_info_since" TIMESTAMPTZ(6),
    "resolution" "resolution",
    "resolution_reason_public" TEXT,
    "resolution_reason_internal" TEXT,
    "resolved_by" UUID,
    "resolved_at" TIMESTAMPTZ(6),
    "attachments_purge_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vote" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "post_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "on_behalf_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "post_id" UUID NOT NULL,
    "author_id" UUID,
    "parent_id" UUID,
    "body" TEXT NOT NULL,
    "image_urls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "internal" BOOLEAN NOT NULL DEFAULT false,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "like_count" INTEGER NOT NULL DEFAULT 0,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comment_like" (
    "comment_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comment_like_pkey" PRIMARY KEY ("comment_id","user_id")
);

-- CreateTable
CREATE TABLE "comment_mention" (
    "comment_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comment_mention_pkey" PRIMARY KEY ("comment_id","user_id")
);

-- CreateTable
CREATE TABLE "attachment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "post_id" UUID,
    "comment_id" UUID,
    "kind" "attachment_kind" NOT NULL DEFAULT 'other',
    "storage_key" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "visibility" "attachment_visibility" NOT NULL DEFAULT 'team_only',
    "purge_at" TIMESTAMPTZ(6),
    "scanned_at" TIMESTAMPTZ(6),
    "scan_verdict" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "post_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "source" "subscription_source" NOT NULL DEFAULT 'manual',
    "unsubscribed_at" TIMESTAMPTZ(6),
    "token" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_tag" (
    "post_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,

    CONSTRAINT "post_tag_pkey" PRIMARY KEY ("post_id","tag_id")
);

-- CreateTable
CREATE TABLE "status_change" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "post_id" UUID NOT NULL,
    "from_status_id" UUID,
    "to_status_id" UUID NOT NULL,
    "changed_by" UUID,
    "note" TEXT,
    "notified_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "status_change_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merge_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "source_id" UUID NOT NULL,
    "target_id" UUID NOT NULL,
    "merged_by" UUID,
    "moved_vote_user_ids" UUID[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "merge_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "changelog_entry" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "version" TEXT,
    "lead" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "types" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "labels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "published_at" TIMESTAMPTZ(6),
    "scheduled_for" TIMESTAMPTZ(6),
    "reaction_counts" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "changelog_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "changelog_change" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entry_id" UUID NOT NULL,
    "kind" "change_kind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "changelog_change_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "changelog_post" (
    "entry_id" UUID NOT NULL,
    "post_id" UUID NOT NULL,

    CONSTRAINT "changelog_post_pkey" PRIMARY KEY ("entry_id","post_id")
);

-- CreateTable
CREATE TABLE "theme" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "theme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "internal_status" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "is_terminal" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "internal_status_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "status_map" (
    "internal_status_id" UUID NOT NULL,
    "status_id" UUID NOT NULL,

    CONSTRAINT "status_map_pkey" PRIMARY KEY ("internal_status_id","status_id")
);

-- CreateTable
CREATE TABLE "backlog_item" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" TEXT NOT NULL,
    "problem" TEXT NOT NULL DEFAULT '',
    "kind" "backlog_kind" NOT NULL DEFAULT 'feature',
    "theme_id" UUID,
    "parent_id" UUID,
    "owner_id" UUID,
    "internal_status_id" UUID,
    "reach" INTEGER NOT NULL DEFAULT 0,
    "impact" DECIMAL(6,2),
    "confidence" DECIMAL(6,2),
    "effort" DECIMAL(6,2),
    "score" DECIMAL(12,4),
    "rank" DECIMAL(20,10) NOT NULL DEFAULT 0,
    "mrr_sum" DECIMAL(14,2),
    "target_release" TEXT,
    "estimate" TEXT,
    "tracker_url" TEXT,
    "tracker_status" TEXT,
    "tracker_synced_at" TIMESTAMPTZ(6),
    "decision" "backlog_decision",
    "decision_reason_public" TEXT,
    "decision_reason_internal" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "backlog_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backlog_post" (
    "backlog_item_id" UUID NOT NULL,
    "post_id" UUID NOT NULL,

    CONSTRAINT "backlog_post_pkey" PRIMARY KEY ("backlog_item_id","post_id")
);

-- CreateTable
CREATE TABLE "insight" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "quote" TEXT NOT NULL,
    "post_id" UUID,
    "backlog_item_id" UUID,
    "author_id" UUID,
    "company_id" UUID,
    "source" "insight_source" NOT NULL DEFAULT 'other',
    "source_url" TEXT,
    "weight" SMALLINT NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "insight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "board_slug_key" ON "board"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "category_board_id_slug_key" ON "category"("board_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "category_board_id_parent_id_name_key" ON "category"("board_id", "parent_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "tag_board_id_name_key" ON "tag"("board_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "tag_board_id_slug_key" ON "tag"("board_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "status_key_key" ON "status"("key");

-- CreateIndex
CREATE UNIQUE INDEX "post_type_key_key" ON "post_type"("key");

-- CreateIndex
CREATE UNIQUE INDEX "intake_source_key_key" ON "intake_source"("key");

-- CreateIndex
CREATE UNIQUE INDEX "company_domain_key" ON "company"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "app_user_email_key" ON "app_user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "app_user_external_id_key" ON "app_user"("external_id");

-- CreateIndex
CREATE INDEX "post_board_id_status_id_idx" ON "post"("board_id", "status_id");

-- CreateIndex
CREATE INDEX "post_status_id_idx" ON "post"("status_id");

-- CreateIndex
CREATE INDEX "post_author_id_idx" ON "post"("author_id");

-- CreateIndex
CREATE UNIQUE INDEX "post_board_id_slug_key" ON "post"("board_id", "slug");

-- CreateIndex
CREATE INDEX "vote_user_id_idx" ON "vote"("user_id");

-- CreateIndex
CREATE INDEX "vote_post_id_created_at_idx" ON "vote"("post_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "vote_post_id_user_id_key" ON "vote"("post_id", "user_id");

-- CreateIndex
CREATE INDEX "comment_post_id_created_at_idx" ON "comment"("post_id", "created_at");

-- CreateIndex
CREATE INDEX "attachment_post_id_idx" ON "attachment"("post_id");

-- CreateIndex
CREATE INDEX "attachment_purge_at_idx" ON "attachment"("purge_at");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_token_key" ON "subscription"("token");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_post_id_user_id_key" ON "subscription"("post_id", "user_id");

-- CreateIndex
CREATE INDEX "status_change_post_id_created_at_idx" ON "status_change"("post_id", "created_at");

-- CreateIndex
CREATE INDEX "merge_log_target_id_idx" ON "merge_log"("target_id");

-- CreateIndex
CREATE UNIQUE INDEX "changelog_entry_slug_key" ON "changelog_entry"("slug");

-- CreateIndex
CREATE INDEX "changelog_entry_published_at_idx" ON "changelog_entry"("published_at");

-- CreateIndex
CREATE INDEX "changelog_change_entry_id_position_idx" ON "changelog_change"("entry_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "theme_slug_key" ON "theme"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "internal_status_key_key" ON "internal_status"("key");

-- CreateIndex
CREATE INDEX "backlog_item_rank_idx" ON "backlog_item"("rank");

-- CreateIndex
CREATE INDEX "insight_post_id_idx" ON "insight"("post_id");

-- CreateIndex
CREATE INDEX "insight_backlog_item_id_idx" ON "insight"("backlog_item_id");

-- AddForeignKey
ALTER TABLE "category" ADD CONSTRAINT "category_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "board"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category" ADD CONSTRAINT "category_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tag" ADD CONSTRAINT "tag_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "board"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_type" ADD CONSTRAINT "post_type_default_status_id_fkey" FOREIGN KEY ("default_status_id") REFERENCES "status"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sla_policy" ADD CONSTRAINT "sla_policy_post_type_id_fkey" FOREIGN KEY ("post_type_id") REFERENCES "post_type"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post" ADD CONSTRAINT "post_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "board"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post" ADD CONSTRAINT "post_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "post_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post" ADD CONSTRAINT "post_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "intake_source"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post" ADD CONSTRAINT "post_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post" ADD CONSTRAINT "post_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "status"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post" ADD CONSTRAINT "post_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post" ADD CONSTRAINT "post_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post" ADD CONSTRAINT "post_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post" ADD CONSTRAINT "post_merged_into_id_fkey" FOREIGN KEY ("merged_into_id") REFERENCES "post"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post" ADD CONSTRAINT "post_regression_of_fkey" FOREIGN KEY ("regression_of") REFERENCES "post"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vote" ADD CONSTRAINT "vote_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vote" ADD CONSTRAINT "vote_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vote" ADD CONSTRAINT "vote_on_behalf_by_fkey" FOREIGN KEY ("on_behalf_by") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment" ADD CONSTRAINT "comment_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment" ADD CONSTRAINT "comment_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment" ADD CONSTRAINT "comment_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "comment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment_like" ADD CONSTRAINT "comment_like_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment_like" ADD CONSTRAINT "comment_like_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment_mention" ADD CONSTRAINT "comment_mention_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment_mention" ADD CONSTRAINT "comment_mention_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_tag" ADD CONSTRAINT "post_tag_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_tag" ADD CONSTRAINT "post_tag_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_change" ADD CONSTRAINT "status_change_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_change" ADD CONSTRAINT "status_change_from_status_id_fkey" FOREIGN KEY ("from_status_id") REFERENCES "status"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_change" ADD CONSTRAINT "status_change_to_status_id_fkey" FOREIGN KEY ("to_status_id") REFERENCES "status"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_change" ADD CONSTRAINT "status_change_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merge_log" ADD CONSTRAINT "merge_log_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merge_log" ADD CONSTRAINT "merge_log_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merge_log" ADD CONSTRAINT "merge_log_merged_by_fkey" FOREIGN KEY ("merged_by") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "changelog_change" ADD CONSTRAINT "changelog_change_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "changelog_entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "changelog_post" ADD CONSTRAINT "changelog_post_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "changelog_entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "changelog_post" ADD CONSTRAINT "changelog_post_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_map" ADD CONSTRAINT "status_map_internal_status_id_fkey" FOREIGN KEY ("internal_status_id") REFERENCES "internal_status"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_map" ADD CONSTRAINT "status_map_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "status"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backlog_item" ADD CONSTRAINT "backlog_item_theme_id_fkey" FOREIGN KEY ("theme_id") REFERENCES "theme"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backlog_item" ADD CONSTRAINT "backlog_item_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "backlog_item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backlog_item" ADD CONSTRAINT "backlog_item_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backlog_item" ADD CONSTRAINT "backlog_item_internal_status_id_fkey" FOREIGN KEY ("internal_status_id") REFERENCES "internal_status"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backlog_post" ADD CONSTRAINT "backlog_post_backlog_item_id_fkey" FOREIGN KEY ("backlog_item_id") REFERENCES "backlog_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backlog_post" ADD CONSTRAINT "backlog_post_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insight" ADD CONSTRAINT "insight_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insight" ADD CONSTRAINT "insight_backlog_item_id_fkey" FOREIGN KEY ("backlog_item_id") REFERENCES "backlog_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insight" ADD CONSTRAINT "insight_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insight" ADD CONSTRAINT "insight_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
