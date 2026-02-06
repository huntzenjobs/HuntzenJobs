


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."can_user_perform_action"("p_user_id" "uuid", "p_action" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_plan RECORD;
  v_usage RECORD;
  v_limit INT;
  v_used INT;
BEGIN
  SELECT * INTO v_plan FROM get_user_plan(p_user_id);
  IF NOT FOUND THEN RETURN FALSE; END IF;

  SELECT * INTO v_usage FROM get_user_usage(p_user_id);

  CASE p_action
    WHEN 'cv_analysis' THEN
      v_limit := (v_plan.limits->>'cv_analyses_per_day')::INT;
      v_used := COALESCE(v_usage.cv_analyses_used, 0);
    WHEN 'coach_message' THEN
      v_limit := (v_plan.limits->>'coach_seconds_per_day')::INT;
      v_used := COALESCE(v_usage.coach_seconds_used, 0);
    WHEN 'job_search' THEN
      v_limit := (v_plan.limits->>'job_searches_per_day')::INT;
      v_used := COALESCE(v_usage.job_searches_used, 0);
    ELSE RETURN FALSE;
  END CASE;

  IF v_limit = -1 THEN RETURN TRUE; END IF;
  RETURN v_used < v_limit;
END;
$$;


ALTER FUNCTION "public"."can_user_perform_action"("p_user_id" "uuid", "p_action" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_plan"("p_user_id" "uuid") RETURNS TABLE("plan_name" "text", "plan_display_name" "text", "limits" "jsonb", "features" "jsonb")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT sp.name, sp.display_name, sp.limits, sp.features
  FROM user_subscriptions us
  JOIN subscription_plans sp ON us.plan_id = sp.id
  WHERE us.user_id = p_user_id AND us.status = 'active'
  ORDER BY us.created_at DESC
  LIMIT 1;
END;
$$;


ALTER FUNCTION "public"."get_user_plan"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_usage"("p_user_id" "uuid") RETURNS TABLE("cv_analyses_used" integer, "coach_seconds_used" integer, "job_searches_used" integer, "quota_date" "date")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT uq.cv_analyses_used, uq.coach_seconds_used, uq.job_searches_used, uq.quota_date
  FROM usage_quotas uq
  WHERE uq.user_id = p_user_id AND uq.quota_date = CURRENT_DATE
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 0, 0, 0, CURRENT_DATE;
  END IF;
END;
$$;


ALTER FUNCTION "public"."get_user_usage"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  user_email TEXT;
  user_full_name TEXT;
  free_plan_id UUID;
BEGIN
  -- Extract user info
  user_email := NEW.email;
  user_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', '');

  -- Get free plan ID
  SELECT id INTO free_plan_id
  FROM subscription_plans
  WHERE name = 'free'
  LIMIT 1;

  -- 1. Create profile
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, user_email, user_full_name);

  -- 2. Create initial usage quota record (today)
  INSERT INTO public.usage_quotas (
    id, user_id, quota_date, cv_analyses_used, coach_seconds_used, job_searches_used, last_reset_at
  )
  VALUES (
    gen_random_uuid(), NEW.id, CURRENT_DATE, 0, 0, 0, NOW()
  )
  ON CONFLICT (user_id, quota_date) DO NOTHING;

  -- 3. Create free subscription if free plan exists
  IF free_plan_id IS NOT NULL THEN
    INSERT INTO public.user_subscriptions (
      id, user_id, plan_id, status, current_period_start, current_period_end, cancel_at_period_end
    )
    VALUES (
      gen_random_uuid(), NEW.id, free_plan_id, 'active', NOW(), NOW() + INTERVAL '1 year', FALSE
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_usage"("p_user_id" "uuid", "p_action" "text", "p_amount" integer DEFAULT 1) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO usage_quotas (
    id, user_id, quota_date, cv_analyses_used, coach_seconds_used, job_searches_used, last_reset_at
  )
  VALUES (
    gen_random_uuid(), p_user_id, CURRENT_DATE,
    CASE WHEN p_action = 'cv_analysis' THEN p_amount ELSE 0 END,
    CASE WHEN p_action = 'coach_message' THEN p_amount ELSE 0 END,
    CASE WHEN p_action = 'job_search' THEN p_amount ELSE 0 END,
    NOW()
  )
  ON CONFLICT (user_id, quota_date)
  DO UPDATE SET
    cv_analyses_used = CASE WHEN p_action = 'cv_analysis' THEN usage_quotas.cv_analyses_used + p_amount ELSE usage_quotas.cv_analyses_used END,
    coach_seconds_used = CASE WHEN p_action = 'coach_message' THEN usage_quotas.coach_seconds_used + p_amount ELSE usage_quotas.coach_seconds_used END,
    job_searches_used = CASE WHEN p_action = 'job_search' THEN usage_quotas.job_searches_used + p_amount ELSE usage_quotas.job_searches_used END,
    updated_at = NOW();
END;
$$;


ALTER FUNCTION "public"."increment_usage"("p_user_id" "uuid", "p_action" "text", "p_amount" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_coach_conversation_metadata"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();

  -- Update last_message_at from last message timestamp
  IF jsonb_typeof(NEW.messages) = 'array' AND jsonb_array_length(NEW.messages) > 0 THEN
    NEW.last_message_at = (NEW.messages->-1->>'timestamp')::timestamptz;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_coach_conversation_metadata"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."coach_conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "session_id" "text" NOT NULL,
    "messages" "jsonb" DEFAULT '[]'::"jsonb",
    "context" "jsonb",
    "title" "text",
    "is_favorite" boolean DEFAULT false NOT NULL,
    "message_count" integer GENERATED ALWAYS AS (
CASE
    WHEN ("jsonb_typeof"("messages") = 'array'::"text") THEN "jsonb_array_length"("messages")
    ELSE 0
END) STORED,
    "last_message_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."coach_conversations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cv_analyses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "pdf_url" "text",
    "cv_text" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "result" "jsonb",
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "cv_analyses_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'completed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."cv_analyses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "full_name" "text",
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "last_login_at" timestamp with time zone,
    "onboarding_completed" boolean DEFAULT false,
    "onboarding_completed_at" timestamp with time zone
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subscription_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "description" "text",
    "price_monthly" numeric(10,2) DEFAULT 0 NOT NULL,
    "price_yearly" numeric(10,2) DEFAULT 0 NOT NULL,
    "limits" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "features" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "is_active" boolean DEFAULT true,
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."subscription_plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."usage_quotas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "quota_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "cv_analyses_used" integer DEFAULT 0,
    "coach_seconds_used" integer DEFAULT 0,
    "job_searches_used" integer DEFAULT 0,
    "last_reset_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."usage_quotas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "plan_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "current_period_start" timestamp with time zone NOT NULL,
    "current_period_end" timestamp with time zone NOT NULL,
    "cancel_at_period_end" boolean DEFAULT false,
    "stripe_subscription_id" "text",
    "stripe_customer_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "user_subscriptions_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'canceled'::"text", 'expired'::"text", 'past_due'::"text"])))
);


ALTER TABLE "public"."user_subscriptions" OWNER TO "postgres";


ALTER TABLE ONLY "public"."coach_conversations"
    ADD CONSTRAINT "coach_conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cv_analyses"
    ADD CONSTRAINT "cv_analyses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscription_plans"
    ADD CONSTRAINT "subscription_plans_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."subscription_plans"
    ADD CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."usage_quotas"
    ADD CONSTRAINT "usage_quotas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."usage_quotas"
    ADD CONSTRAINT "usage_quotas_user_id_quota_date_key" UNIQUE ("user_id", "quota_date");



ALTER TABLE ONLY "public"."user_subscriptions"
    ADD CONSTRAINT "user_subscriptions_pkey" PRIMARY KEY ("id");



CREATE INDEX "coach_conversations_is_favorite_idx" ON "public"."coach_conversations" USING "btree" ("user_id", "is_favorite") WHERE ("is_favorite" = true);



CREATE INDEX "coach_conversations_last_message_idx" ON "public"."coach_conversations" USING "btree" ("user_id", "last_message_at" DESC);



CREATE INDEX "coach_conversations_session_id_idx" ON "public"."coach_conversations" USING "btree" ("session_id");



CREATE INDEX "coach_conversations_title_gin_idx" ON "public"."coach_conversations" USING "gin" ("to_tsvector"('"french"'::"regconfig", COALESCE("title", ''::"text")));



CREATE INDEX "coach_conversations_user_id_idx" ON "public"."coach_conversations" USING "btree" ("user_id");



CREATE INDEX "idx_cv_analyses_status" ON "public"."cv_analyses" USING "btree" ("status");



CREATE INDEX "idx_cv_analyses_user" ON "public"."cv_analyses" USING "btree" ("user_id");



CREATE INDEX "idx_profiles_email" ON "public"."profiles" USING "btree" ("email");



CREATE INDEX "idx_subscription_plans_active" ON "public"."subscription_plans" USING "btree" ("is_active");



CREATE INDEX "idx_subscription_plans_name" ON "public"."subscription_plans" USING "btree" ("name");



CREATE INDEX "idx_usage_quotas_user_date" ON "public"."usage_quotas" USING "btree" ("user_id", "quota_date");



CREATE INDEX "idx_user_subscriptions_status" ON "public"."user_subscriptions" USING "btree" ("status");



CREATE INDEX "idx_user_subscriptions_user" ON "public"."user_subscriptions" USING "btree" ("user_id");



CREATE OR REPLACE TRIGGER "update_coach_conversations_metadata" BEFORE INSERT OR UPDATE ON "public"."coach_conversations" FOR EACH ROW EXECUTE FUNCTION "public"."update_coach_conversation_metadata"();



ALTER TABLE ONLY "public"."coach_conversations"
    ADD CONSTRAINT "coach_conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cv_analyses"
    ADD CONSTRAINT "cv_analyses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."usage_quotas"
    ADD CONSTRAINT "usage_quotas_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_subscriptions"
    ADD CONSTRAINT "user_subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id");



ALTER TABLE ONLY "public"."user_subscriptions"
    ADD CONSTRAINT "user_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Users can delete own conversations" ON "public"."coach_conversations" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own conversations" ON "public"."coach_conversations" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own cv analyses" ON "public"."cv_analyses" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own conversations" ON "public"."coach_conversations" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view own conversations" ON "public"."coach_conversations" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own cv analyses" ON "public"."cv_analyses" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view own subscriptions" ON "public"."user_subscriptions" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own usage" ON "public"."usage_quotas" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."coach_conversations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cv_analyses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."usage_quotas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_subscriptions" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."can_user_perform_action"("p_user_id" "uuid", "p_action" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."can_user_perform_action"("p_user_id" "uuid", "p_action" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_user_perform_action"("p_user_id" "uuid", "p_action" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_plan"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_plan"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_plan"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_usage"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_usage"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_usage"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_usage"("p_user_id" "uuid", "p_action" "text", "p_amount" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."increment_usage"("p_user_id" "uuid", "p_action" "text", "p_amount" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_usage"("p_user_id" "uuid", "p_action" "text", "p_amount" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_coach_conversation_metadata"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_coach_conversation_metadata"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_coach_conversation_metadata"() TO "service_role";


















GRANT ALL ON TABLE "public"."coach_conversations" TO "anon";
GRANT ALL ON TABLE "public"."coach_conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."coach_conversations" TO "service_role";



GRANT ALL ON TABLE "public"."cv_analyses" TO "anon";
GRANT ALL ON TABLE "public"."cv_analyses" TO "authenticated";
GRANT ALL ON TABLE "public"."cv_analyses" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."subscription_plans" TO "anon";
GRANT ALL ON TABLE "public"."subscription_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."subscription_plans" TO "service_role";



GRANT ALL ON TABLE "public"."usage_quotas" TO "anon";
GRANT ALL ON TABLE "public"."usage_quotas" TO "authenticated";
GRANT ALL ON TABLE "public"."usage_quotas" TO "service_role";



GRANT ALL ON TABLE "public"."user_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."user_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."user_subscriptions" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































