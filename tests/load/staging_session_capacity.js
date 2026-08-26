import http from "k6/http";
import exec from "k6/execution";
import { check } from "k6";
import { SharedArray } from "k6/data";
import encoding from "k6/encoding";
import { Counter, Rate, Trend } from "k6/metrics";

const frontendUrl = (__ENV.FRONTEND_URL || "").replace(/\/$/, "");
const backendUrl = (__ENV.BACKEND_URL || "").replace(/\/$/, "");
const scenario = __ENV.SCENARIO || "public";
const equivalentUsers = Number.parseInt(__ENV.EQUIVALENT_USERS || "100", 10);
const duration = __ENV.DURATION || "30s";
const singleAuthToken = __ENV.AUTH_TOKEN || "";
const allowSingleTokenSmoke = __ENV.ALLOW_SINGLE_TOKEN_SMOKE === "true";
const authTokensFile = __ENV.AUTH_TOKENS_FILE || "";
function tokenSubject(token) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Chaque token staging doit être un JWT Supabase");
  const payload = JSON.parse(encoding.b64decode(parts[1], "rawurl", "s"));
  if (typeof payload.sub !== "string" || !payload.sub) {
    throw new Error("Chaque JWT staging doit contenir un sub utilisateur");
  }
  return payload.sub;
}

function normalizeAuthEntry(entry) {
  if (typeof entry === "string") {
    return { user_id: tokenSubject(entry), token: entry };
  }
  if (
    entry &&
    typeof entry.user_id === "string" &&
    entry.user_id &&
    typeof entry.token === "string" &&
    entry.token
  ) {
    if (tokenSubject(entry.token) !== entry.user_id) {
      throw new Error("user_id ne correspond pas au sub du JWT staging");
    }
    return entry;
  }
  throw new Error("Le pool doit contenir des objets {user_id, token}");
}

let inlineAuthEntries = [];
if (__ENV.AUTH_TOKENS_JSON) {
  try {
    inlineAuthEntries = JSON.parse(__ENV.AUTH_TOKENS_JSON).map(normalizeAuthEntry);
  } catch {
    throw new Error("AUTH_TOKENS_JSON doit être un pool JSON staging valide");
  }
} else if (singleAuthToken) {
  inlineAuthEntries = [normalizeAuthEntry(singleAuthToken)];
}
const sharedAuthEntries = authTokensFile
  ? new SharedArray("staging-auth-tokens", () =>
      JSON.parse(open(authTokensFile)).map(normalizeAuthEntry),
    )
  : null;
const authEntries = sharedAuthEntries || inlineAuthEntries;
const publicMethod = (__ENV.PUBLIC_METHOD || "GET").toUpperCase();
const connectedVisibleRatio = Number.parseFloat(__ENV.CONNECTED_VISIBLE_RATIO || "1");
const capacityErrors = new Rate("capacity_errors");
const unexpectedStatuses = new Counter("unexpected_statuses");
const presenceDuration = new Trend("presence_duration", true);
const authMeDuration = new Trend("auth_me_duration", true);

const allowedScenarios = new Set(["public", "connected", "active_read"]);
const productionMarkers = ["www.huntzenjobs.com", "huntzenjobs-production", "production.up.railway.app"];

if (frontendUrl !== "https://staging.huntzenjobs.com") {
  throw new Error("FRONTEND_URL doit cibler exactement le staging HuntZen");
}
if (backendUrl !== "https://api-staging.huntzenjobs.com") {
  throw new Error("BACKEND_URL doit cibler exactement l'API staging HuntZen");
}
if (productionMarkers.some((marker) => `${frontendUrl} ${backendUrl}`.includes(marker))) {
  throw new Error("Ce scénario refuse explicitement toute cible de production");
}
if (!allowedScenarios.has(scenario)) {
  throw new Error(`SCENARIO invalide: ${scenario}`);
}
if (!Number.isInteger(equivalentUsers) || equivalentUsers < 1 || equivalentUsers > 5000) {
  throw new Error("EQUIVALENT_USERS doit être compris entre 1 et 5000");
}
if (!new Set(["GET", "HEAD"]).has(publicMethod)) {
  throw new Error("PUBLIC_METHOD doit valoir GET ou HEAD");
}
if (!Number.isFinite(connectedVisibleRatio) || connectedVisibleRatio <= 0 || connectedVisibleRatio > 1) {
  throw new Error("CONNECTED_VISIBLE_RATIO doit être supérieur à 0 et inférieur ou égal à 1");
}

function durationInSeconds(value) {
  const match = /^(\d+)(s|m|h)$/.exec(value);
  if (!match) throw new Error("DURATION doit utiliser le format k6: 30s, 5m ou 1h");
  const amount = Number.parseInt(match[1], 10);
  return amount * { s: 1, m: 60, h: 3600 }[match[2]];
}

const durationSeconds = durationInSeconds(duration);
if (scenario === "connected" && durationSeconds < 300) {
  throw new Error("Le scénario connected exige DURATION>=5m pour couvrir un cycle complet");
}
if (scenario === "active_read" && durationSeconds < 300) {
  throw new Error("Le scénario active_read exige DURATION>=5m");
}

const visibleConnectedUsers = Math.max(1, Math.ceil(equivalentUsers * connectedVisibleRatio));
const authenticatedUsers = scenario === "connected" ? visibleConnectedUsers : equivalentUsers;

if (scenario !== "public") {
  if (!Array.isArray(authEntries) || authEntries.some((entry) => !entry.user_id || !entry.token)) {
    throw new Error("Le pool staging contient une entrée d'authentification invalide");
  }
  if (allowSingleTokenSmoke) {
    if (authenticatedUsers !== 1 || authEntries.length !== 1) {
      throw new Error("Le smoke à token unique est limité à EQUIVALENT_USERS=1");
    }
  } else if (authEntries.length < authenticatedUsers) {
    throw new Error(
      `Le scénario ${scenario} exige ${authenticatedUsers} comptes staging distincts; reçus: ${authEntries.length}`,
    );
  }
  const uniqueUsers = new Set(
    authEntries.slice(0, authenticatedUsers).map((entry) => entry.user_id),
  );
  if (uniqueUsers.size !== authenticatedUsers) {
    throw new Error("Chaque utilisateur équivalent doit avoir un sub Supabase distinct");
  }
  if (authenticatedUsers > 100 && !authTokensFile) {
    throw new Error("AUTH_TOKENS_FILE est obligatoire au-delà de 100 comptes staging");
  }
}

const rates = {
  // Une page publique consultée par minute et par personne.
  public: { rate: equivalentUsers, timeUnit: "1m" },
  // Six présences (45–55 s) + un abonnement / 5 min par onglet visible.
  connected: { rate: visibleConnectedUsers * 7, timeUnit: "5m" },
  // Une action de lecture toutes les 10 s pour un utilisateur réellement actif.
  active_read: { rate: equivalentUsers, timeUnit: "10s" },
};

const estimatedRps = rates[scenario].rate / ({ "5m": 300, "1m": 60, "10s": 10 })[rates[scenario].timeUnit];
const preAllocatedVUs = Math.max(10, Math.min(500, Math.ceil(estimatedRps * 2)));
const maxVUs = Math.max(preAllocatedVUs, Math.min(1500, preAllocatedVUs * 3));

export const options = {
  scenarios: {
    capacity: {
      executor: "constant-arrival-rate",
      rate: rates[scenario].rate,
      timeUnit: rates[scenario].timeUnit,
      duration,
      preAllocatedVUs,
      maxVUs,
      gracefulStop: "5s",
    },
  },
  thresholds: {
    capacity_errors: ["rate<0.01"],
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<1000", "p(99)<2000"],
    presence_duration: ["p(95)<1000"],
    auth_me_duration: ["p(95)<1000"],
    dropped_iterations: ["count<1"],
  },
};

const publicPaths = ["/", "/pricing", "/login", "/signup", "/privacy"];
const activeReadPaths = [
  "/api/saved-jobs",
  "/api/notifications/preferences",
];

function record(response, label, acceptedStatuses = [200]) {
  if (label === "presence") presenceDuration.add(response.timings.duration);
  if (label === "auth_me") authMeDuration.add(response.timings.duration);

  if (!acceptedStatuses.includes(response.status)) {
    unexpectedStatuses.add(1, { endpoint: label, status: String(response.status) });
  }
  const valid = check(response, {
    [`${label}: statut attendu`]: (result) => acceptedStatuses.includes(result.status),
    [`${label}: réponse sous 2 s`]: (result) => result.timings.duration < 2000,
  });
  capacityErrors.add(!valid, { endpoint: label });
}

function authorizationHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

function runPublic(iteration) {
  const path = publicPaths[iteration % publicPaths.length];
  const response = http.request(publicMethod, `${frontendUrl}${path}`, null, {
    redirects: 2,
    tags: { endpoint: path, workload: "public" },
    timeout: "5s",
  });
  record(response, path, [200]);
}

function runConnected(iteration) {
  const userIndex = iteration % visibleConnectedUsers;
  const cycle = Math.floor(iteration / visibleConnectedUsers) % 7;
  const token = authEntries[userIndex].token;

  if (cycle < 6) {
    const response = http.post(
      `${backendUrl}/api/presence/heartbeat`,
      JSON.stringify({ page: "/dashboard", feature: null }),
      {
        headers: authorizationHeaders(token),
        tags: { endpoint: "presence", workload: "connected" },
        timeout: "5s",
      },
    );
    let recorded = false;
    try {
      recorded = response.json("recorded") === true;
    } catch {}
    const validPresence = check(response, {
      "presence: enregistrée dans Redis": () => recorded,
    });
    capacityErrors.add(!validPresence, { endpoint: "presence_recorded" });
    record(response, "presence", [200]);
    return;
  }

  const response = http.get(`${frontendUrl}/api/auth/me`, {
    headers: authorizationHeaders(token),
    tags: { endpoint: "auth_me", workload: "connected" },
    timeout: "5s",
  });
  record(response, "auth_me", [200]);
}

function runActiveRead(iteration) {
  const userIndex = iteration % equivalentUsers;
  const token = authEntries[userIndex].token;
  const cycle = Math.floor(iteration / equivalentUsers);
  const path = activeReadPaths[cycle % activeReadPaths.length];
  const response = http.get(`${backendUrl}${path}`, {
    headers: authorizationHeaders(token),
    tags: { endpoint: path, workload: "active_read" },
    timeout: "10s",
  });
  record(response, path, [200]);

  // Superpose le trafic de fond réel sur un cycle de 5 min (30 actions à 10 s).
  if (cycle % 30 === 29) {
    const authResponse = http.get(`${frontendUrl}/api/auth/me`, {
      headers: authorizationHeaders(token),
      tags: { endpoint: "auth_me", workload: "active_read_background" },
      timeout: "5s",
    });
    record(authResponse, "auth_me", [200]);
  } else if (cycle % 5 === 0) {
    const presenceResponse = http.post(
      `${backendUrl}/api/presence/heartbeat`,
      JSON.stringify({ page: "/dashboard", feature: null }),
      {
        headers: authorizationHeaders(token),
        tags: { endpoint: "presence", workload: "active_read_background" },
        timeout: "5s",
      },
    );
    let recorded = false;
    try {
      recorded = presenceResponse.json("recorded") === true;
    } catch {}
    capacityErrors.add(!recorded, { endpoint: "presence_recorded" });
    record(presenceResponse, "presence", [200]);
  }
}

export function setup() {
  const health = http.get(`${backendUrl}/api/health/ping`, { timeout: "5s" });
  if (health.status !== 200) {
    throw new Error(`Staging indisponible avant le test: HTTP ${health.status}`);
  }
  return { scenario };
}

export default function () {
  const iteration = exec.scenario.iterationInTest;
  if (scenario === "public") {
    runPublic(iteration);
  } else if (scenario === "connected") {
    runConnected(iteration);
  } else {
    runActiveRead(iteration);
  }
}
