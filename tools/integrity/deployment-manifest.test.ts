import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

const repositoryRoot = join(import.meta.dirname, "..", "..");
const servicesPath = join(repositoryRoot, "infra", "deploy", "staging", "services.yaml");
const secretsPath = join(repositoryRoot, "infra", "deploy", "staging", "secrets.example.yaml");

type RecordValue = Record<string, unknown>;

const readYaml = (path: string): RecordValue => {
  const value = parse(readFileSync(path, "utf8")) as unknown;
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${path} must contain a YAML object`);
  return value as RecordValue;
};

const asRecord = (value: unknown, label: string): RecordValue => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label} must be an object`);
  return value as RecordValue;
};

const asArray = (value: unknown, label: string): unknown[] => {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
};

const includes = (value: unknown, expected: string, label: string): void => {
  if (!asArray(value, label).includes(expected)) throw new Error(`${label} is missing ${expected}`);
};

const services = readYaml(servicesPath);
const secrets = readYaml(secretsPath);
const serviceMap = asRecord(services.services, "services.services");
const network = asRecord(services.network, "network");
const privateNetwork = asRecord(network.private, "network.private");
const publicNetwork = asRecord(network.public, "network.public");
const imageMap = asRecord(services.images, "images");
const environment = asRecord(services.environment, "environment");

for (const [key, expected] of Object.entries({
  NODE_ENV: "production",
  APP_ENV: "staging",
  QUEUE_PREFIX: "plume-staging",
  OPENAI_PROVIDER_MODE: "mock",
})) {
  if (environment[key] !== expected) throw new Error(`environment.${key} must be ${expected}`);
}

const requiredServices = [
  "web",
  "api",
  "worker",
  "scheduler",
  "postgres",
  "redis",
  "object-storage",
];
for (const name of requiredServices) {
  const service = asRecord(serviceMap[name], `services.${name}`);
  if (!service.role || !service.health)
    throw new Error(`${name} must declare role and health checks`);
  if (!service.resources)
    throw new Error(`${name} must declare resources or a managed-service equivalent`);
}

const web = asRecord(serviceMap.web, "services.web");
const api = asRecord(serviceMap.api, "services.api");
const worker = asRecord(serviceMap.worker, "services.worker");
const scheduler = asRecord(serviceMap.scheduler, "services.scheduler");
const apiScaling = asRecord(api.scaling, "services.api.scaling");
const workerScaling = asRecord(worker.scaling, "services.worker.scaling");
const schedulerScaling = asRecord(scheduler.scaling, "services.scheduler.scaling");

if (privateNetwork.visibility !== "private")
  throw new Error("database dependencies must use a private network");
for (const name of ["api", "worker", "scheduler", "postgres", "redis", "object-storage"])
  includes(privateNetwork.services, name, "network.private.services");
for (const name of ["web", "api"])
  includes(publicNetwork.services, name, "network.public.services");
for (const name of ["postgres", "redis", "object-storage", "worker", "scheduler"]) {
  if (
    asArray(
      serviceMap[name] && asRecord(serviceMap[name], `services.${name}`).networks,
      `services.${name}.networks`,
    ).includes("public")
  )
    throw new Error(`${name} cannot be public`);
}

if (apiScaling.independentScaleKey !== "api" || workerScaling.independentScaleKey !== "worker")
  throw new Error("API and Worker must scale independently");
includes(apiScaling.independentFrom, "worker", "services.api.scaling.independentFrom");
includes(workerScaling.independentFrom, "api", "services.worker.scaling.independentFrom");
if (
  schedulerScaling.mode !== "singleton" ||
  schedulerScaling.maxReplicas !== 1 ||
  schedulerScaling.policy !== "lease_singleton"
)
  throw new Error("Scheduler must use a single lease-controlled replica");

for (const name of ["web", "api", "worker", "scheduler"]) {
  const image = asRecord(serviceMap[name], `services.${name}`).image;
  if (typeof image !== "string" || !imageMap[image])
    throw new Error(`${name} image must reference an image contract`);
}
for (const name of ["web", "api", "worker", "scheduler"]) {
  const image = asRecord(imageMap[name], `images.${name}`);
  if (typeof image.repository !== "string" || image.repository.includes("<"))
    throw new Error(`${name} image repository must be concrete`);
  if (typeof image.digest !== "string" || !/^sha256:[a-f0-9]{64}$/u.test(image.digest))
    throw new Error(`${name} must use a sha256 image digest`);
  if (typeof image.ref !== "string" || image.ref !== `${image.repository}@${image.digest}`)
    throw new Error(`${name} image ref must be repository@digest`);
  if ("tag" in image || image.ref.includes(":latest"))
    throw new Error(`${name} must not use a mutable tag`);
}

if (asRecord(api.health, "services.api.health").liveness?.path !== "/api/v1/health/live")
  throw new Error("API liveness path must use /api/v1/health/live");
if (asRecord(api.health, "services.api.health").readiness?.path !== "/api/v1/health/ready")
  throw new Error("API readiness path must use /api/v1/health/ready");
for (const [name, service] of Object.entries({ web, api, worker })) {
  const scaling = asRecord(asRecord(service, `services.${name}`).scaling, `services.${name}.scaling`);
  if (scaling.minReplicas !== 1) throw new Error(`${name} initial staging replicas must be 1`);
}
if (asRecord(asRecord(serviceMap.worker, "services.worker").config, "services.worker.config").OPENAI_PROVIDER_MODE !== "mock")
  throw new Error("worker must start in mock provider mode");
if (asArray(asRecord(serviceMap.worker, "services.worker").secretRefs, "services.worker.secretRefs").some((value) =>
  asArray(asRecord(value, "worker secret ref").keys, "worker secret ref keys").includes("OPENAI_API_KEY")))
  throw new Error("mock worker must not require OPENAI_API_KEY");
if (asRecord(asRecord(services.database, "database").migration, "database.migration").command !== "pnpm db:migrate:staging")
  throw new Error("staging must use the staging-safe migration command");

const secretContract = asRecord(secrets.secrets, "secrets.secrets");
const requiredSecretKeys = asArray(
  services.secrets && asRecord(services.secrets, "secrets").requiredKeys,
  "secrets.requiredKeys",
);
for (const key of requiredSecretKeys) {
  const definition = asRecord(secretContract[String(key)], `secrets.${String(key)}`);
  const placeholder = definition.placeholder;
  if (typeof placeholder !== "string" || !placeholder.startsWith("<secret-manager://"))
    throw new Error(`${String(key)} must be a secret-manager reference placeholder`);
}
const secretText = readFileSync(secretsPath, "utf8");
for (const pattern of [
  /sk-[A-Za-z0-9]/i,
  /-----BEGIN [A-Z ]+-----/,
  /postgres(?:ql)?:\/\/[^\s/:]+:[^\s@]+@/i,
  /plume_local_only/i,
]) {
  if (pattern.test(secretText))
    throw new Error(`secret literal detected in secrets.example.yaml: ${pattern}`);
}
if (asRecord(secrets.browserExposure, "browserExposure").forbidden === undefined)
  throw new Error("browser secret exposure policy is required");
if (
  asRecord(services.observability, "observability").tracing === undefined ||
  asRecord(services.observability, "observability").metrics === undefined
)
  throw new Error("observability interface is required");
if (asRecord(services.database, "database").migration === undefined)
  throw new Error("database migration ownership is required");
if (
  asRecord(services.operations, "operations").backups === undefined ||
  asRecord(services.operations, "operations").rollback === undefined
)
  throw new Error("backup and rollback assumptions are required");

console.log(
  `Deployment manifest PASS: ${requiredServices.length} services, private network, independent API/Worker scale, secret literals 0`,
);
