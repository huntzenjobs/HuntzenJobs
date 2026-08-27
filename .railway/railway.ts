import {
  defineRailway,
  github,
  preserve,
  project,
  redis,
  service,
  volume,
} from "railway/iac";

const REGION = "europe-west4-drams3a";
const REDIS_START_COMMAND =
  "/bin/sh -c \"rm -rf $RAILWAY_VOLUME_MOUNT_PATH/lost+found/ && exec docker-entrypoint.sh redis-server --requirepass $REDIS_PASSWORD --save 60 1 --dir $RAILWAY_VOLUME_MOUNT_PATH\"";
const STAGING_WORKER_START_COMMAND =
  "sh -c 'mkdir -p /tmp/worker-health/api/health && printf ok > /tmp/worker-health/api/health/ping && python -m http.server ${PORT:-8080} --directory /tmp/worker-health >/dev/null 2>&1 & exec python -m arq src.workers.settings.WorkerSettings'";

function preservedVariables(names: readonly string[]) {
  return Object.fromEntries(names.map((name) => [name, preserve()]));
}

const productionApiVariables = [
  "ADMIN_EMAIL",
  "ADZUNA_API_KEY",
  "ADZUNA_APP_ID",
  "APOLLO_API_KEY",
  "CACHE_ENABLED",
  "CACHE_TTL_HOURS",
  "CAREERJET_AFFID",
  "CLIENT_ID",
  "CLIENT_SECRET",
  "CORS_ORIGINS",
  "CRON_SECRET",
  "DATABASE_URL",
  "DEBUG",
  "ENVIRONMENT",
  "FRANCE_TRAVAIL_CLIENT_ID",
  "FRANCE_TRAVAIL_CLIENT_SECRET",
  "FROM_EMAIL",
  "FRONTEND_URL",
  "GROQ_API_KEY",
  "HUNTER_API_KEY",
  "JINA_API_KEY",
  "JOOBLE_API_KEY",
  "JWT_ALGORITHM",
  "JWT_EXPIRATION_DAYS",
  "JWT_SECRET",
  "LANGCHAIN_API_KEY",
  "LANGCHAIN_ENDPOINT",
  "LANGCHAIN_PROJECT",
  "LANGCHAIN_TRACING_V2",
  "LLM_MODEL_FAST",
  "MODAL_CALLBACK_SECRET",
  "MODAL_ENABLED",
  "MODAL_PDF_EXTRACT_URL",
  "MODAL_PROXY_TOKEN_ID",
  "MODAL_PROXY_TOKEN_SECRET",
  "MODAL_WEBHOOK_URL",
  "PORT",
  "RAPIDAPI_KEY",
  "RECRUITER_CONTACT_PRICE_ID",
  "REDIS_LIMITER_URL",
  "REDIS_TOKEN",
  "REDIS_URL",
  "RESEND_API_KEY",
  "SENTRY_DSN",
  "SERPAPI_KEY",
  "STRIPE_PUBLISHABLE_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "SUPABASE_JWT_SECRET",
  "SUPABASE_KEY",
  "SUPABASE_POOLER_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_URL",
  "WORKERS",
] as const;

const productionStressWorkerVariables = productionApiVariables.filter(
  (name) =>
    ![
      "MODAL_ENABLED",
      "MODAL_PROXY_TOKEN_ID",
      "MODAL_PROXY_TOKEN_SECRET",
    ].includes(name),
);

const productionWorkerVariables = [
  "ADMIN_EMAIL",
  "DATABASE_URL",
  "ENVIRONMENT",
  "FROM_EMAIL",
  "FRONTEND_URL",
  "GROQ_API_KEY",
  "REDIS_URL",
  "RESEND_API_KEY",
  "SENTRY_DSN",
  "STRIPE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_URL",
] as const;

const stagingApiVariables = [
  "CORS_ORIGINS",
  "CRON_SECRET",
  "DATABASE_URL",
  "DEBUG",
  "ENVIRONMENT",
  "FROM_EMAIL",
  "FRONTEND_URL",
  "GROQ_API_KEY",
  "LANGCHAIN_TRACING_V2",
  "MODAL_CALLBACK_SECRET",
  "MODAL_ENABLED",
  "MODAL_PROXY_TOKEN_ID",
  "MODAL_PROXY_TOKEN_SECRET",
  "MODAL_WEBHOOK_URL",
  "REDIS_URL",
  "RESEND_API_KEY",
  "SENTRY_DSN",
  "STRIPE_PUBLISHABLE_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "SUPABASE_KEY",
  "SUPABASE_POOLER_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_URL",
  "WORKERS",
] as const;

const stagingWorkerVariables = [
  "CORS_ORIGINS",
  "DATABASE_URL",
  "DEBUG",
  "ENVIRONMENT",
  "FROM_EMAIL",
  "FRONTEND_URL",
  "GROQ_API_KEY",
  "LANGCHAIN_TRACING_V2",
  "MODAL_WEBHOOK_URL",
  "REDIS_URL",
  "RESEND_API_KEY",
  "SENTRY_DSN",
  "STRIPE_SECRET_KEY",
  "SUPABASE_KEY",
  "SUPABASE_POOLER_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_URL",
] as const;

function productionResources() {
  const source = github("huntzenjobs/HuntzenJobs", {
    branch: "Production",
    checkSuites: false,
    rootDirectory: "backend",
  });
  const cache = redis("Redis", { region: REGION });
  cache.deploy = { startCommand: REDIS_START_COMMAND };
  const cacheVolume = volume("redis-volume", {
    alerts: { usage: { "80": {}, "95": {}, "100": {} } },
    allowOnlineResize: true,
    region: REGION,
    sizeMB: 50000,
  });

  const api = service("HuntzenJobs", {
    source,
    build: { builder: "DOCKERFILE", dockerfilePath: "Dockerfile" },
    deploy: {
      healthcheckPath: "/api/health/ping",
      healthcheckTimeout: 300,
      ipv6EgressEnabled: false,
      restartPolicyMaxRetries: 3,
      runtime: "V2",
      useLegacyStacker: false,
    },
    replicas: { [REGION]: 2 },
    networking: { privateNetworkEndpoint: "huntzenjobs" },
    env: preservedVariables(productionApiVariables),
  });

  const worker = service("arq-worker", {
    source,
    build: { builder: "DOCKERFILE", dockerfilePath: "Dockerfile" },
    start: "python -m arq src.workers.settings.WorkerSettings",
    deploy: {
      ipv6EgressEnabled: false,
      restartPolicyMaxRetries: 5,
      runtime: "V2",
      useLegacyStacker: false,
    },
    replicas: { [REGION]: 1 },
    env: preservedVariables(productionWorkerVariables),
  });

  const stressWorker = service("worker-stress", {
    source,
    build: { builder: "DOCKERFILE", dockerfilePath: "Dockerfile" },
    start: "python -m arq src.workers.stress_settings.StressWorkerSettings",
    deploy: {
      ipv6EgressEnabled: false,
      restartPolicyMaxRetries: 3,
      runtime: "V2",
      useLegacyStacker: false,
    },
    replicas: { [REGION]: 1 },
    env: preservedVariables(productionStressWorkerVariables),
  });

  return [api, worker, stressWorker, cache, cacheVolume];
}

function stagingResources() {
  const apiSource = github("huntzenjobs/HuntzenJobs", {
    branch: "Pre-production",
    checkSuites: false,
    rootDirectory: "backend",
  });
  const workerSource = github("huntzenjobs/HuntzenJobs", {
    branch: "Pre-production",
    checkSuites: false,
    rootDirectory: "backend",
  });
  const cache = redis("Redis-SU2L", { region: REGION });
  cache.deploy = { startCommand: REDIS_START_COMMAND };
  const cacheVolume = volume("redis-volume-ehtB", {
    alerts: { usage: { "80": {}, "95": {}, "100": {} } },
    allowOnlineResize: true,
    region: REGION,
    sizeMB: 50000,
  });

  const api = service("ravishing-reprieve", {
    source: apiSource,
    build: {
      builder: "DOCKERFILE",
      buildEnvironment: "V3",
      dockerfilePath: "Dockerfile",
    },
    deploy: {
      healthcheckPath: "/api/health/ping",
      healthcheckTimeout: 300,
      ipv6EgressEnabled: false,
      restartPolicyMaxRetries: 3,
      runtime: "V2",
      useLegacyStacker: false,
    },
    replicas: { [REGION]: 2 },
    domains: [{ domain: "api-staging.huntzenjobs.com", port: 8080 }],
    env: preservedVariables(stagingApiVariables),
  });

  const worker = service("respectful-rebirth", {
    source: workerSource,
    build: {
      builder: "DOCKERFILE",
      buildEnvironment: "V3",
      dockerfilePath: "Dockerfile",
    },
    start: STAGING_WORKER_START_COMMAND,
    deploy: {
      ipv6EgressEnabled: false,
      restartPolicyMaxRetries: 5,
      runtime: "V2",
      useLegacyStacker: false,
    },
    replicas: { [REGION]: 1 },
    env: preservedVariables(stagingWorkerVariables),
  });

  return [api, worker, cache, cacheVolume];
}

export default defineRailway((ctx) => {
  if (!ctx.isEnvironment("production") && !ctx.isEnvironment("staging")) {
    throw new Error(`Environnement Railway non géré : ${ctx.environment}`);
  }

  return project("HuntzenJobs", {
    resources: ctx.isEnvironment("production")
      ? productionResources()
      : stagingResources(),
  });
});
