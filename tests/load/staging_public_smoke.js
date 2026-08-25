import http from "k6/http";
import { check, sleep } from "k6";
import { Rate } from "k6/metrics";

const baseUrl = (__ENV.BASE_URL || "").replace(/\/$/, "");
const expectedHost = __ENV.EXPECTED_STAGING_HOST || "";
const virtualUsers = Number.parseInt(__ENV.VUS || "10", 10);
const duration = __ENV.DURATION || "15s";
const criticalErrors = new Rate("critical_errors");

if (!baseUrl || !expectedHost) {
  throw new Error("BASE_URL et EXPECTED_STAGING_HOST sont obligatoires");
}

if (baseUrl !== `https://${expectedHost}`) {
  throw new Error("La cible ne correspond pas au host staging explicitement autorisé");
}
if (expectedHost === "huntzenjobs-production.up.railway.app") {
  throw new Error("Ce scénario refuse explicitement la production");
}
if (!Number.isInteger(virtualUsers) || virtualUsers < 1 || virtualUsers > 500) {
  throw new Error("VUS doit être compris entre 1 et 500");
}

export const options = {
  vus: virtualUsers,
  duration,
  thresholds: {
    critical_errors: ["rate<0.005"],
    http_req_failed: ["rate<0.005"],
    http_req_duration: ["p(95)<500", "p(99)<1000"],
  },
};

export default function () {
  const response = http.get(`${baseUrl}/api/health/ping`, {
    tags: { name: "BackendHealthPing" },
    timeout: "5s",
  });
  const valid = check(response, {
    "health returns 200": (result) => result.status === 200,
    "health payload is ok": (result) => {
      try {
        return result.json("status") === "ok";
      } catch {
        return false;
      }
    },
  });
  criticalErrors.add(!valid);
  sleep(0.2);
}
