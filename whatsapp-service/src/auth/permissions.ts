import { NotFoundError } from "../core/errors";

export const MODULE_SERVICES: Record<string, string[]> = {
  dashboard: ["view"],
  tts: ["view", "generate", "delete"],
  stt: ["view", "transcribe"],
  voices: ["view", "create", "delete"],
  campaigns: ["view", "create", "edit", "delete", "trigger"],
  whatsapp: ["view", "create", "edit", "delete", "trigger", "templates_manage"],
  sms: ["view", "create", "edit", "delete", "send", "trigger"],
  rcs: ["view", "create", "edit", "delete", "trigger", "templates_manage"],
  users: ["view", "create", "edit", "delete"],
};

export const MODULE_KEYS = Object.keys(MODULE_SERVICES) as readonly string[];

const ALL_SERVICES: string[] = Object.entries(MODULE_SERVICES).flatMap(([mod, svcs]) =>
  svcs.map((s) => `${mod}:${s}`)
);

export interface DefaultPermissions {
  modules: string[];
  services: string[];
  fields: string[];
}

export function defaultPermissionsForRole(role: string): DefaultPermissions {
  if (role === "super_admin" || role === "admin") {
    return { modules: [...MODULE_KEYS], services: [...ALL_SERVICES], fields: [] };
  }
  return { modules: MODULE_KEYS.filter((m) => m !== "users"), services: [], fields: [] };
}

export interface AuthedUser {
  _id: string;
  uid: string;
  email: string;
  name: string;
  role: string;
  modules: string[];
  services: string[];
  fields: string[];
  active: boolean;
}

export function hasPermission(user: AuthedUser, moduleName: string, service?: string): boolean {
  if (user.role === "super_admin" || user.role === "admin") return true;
  if (!(user.modules || []).includes(moduleName)) return false;
  if (!service) return true;
  return (user.services || []).includes(`${moduleName}:${service}`);
}

export function ownerFilter(user: AuthedUser): Record<string, unknown> {
  if (user.role === "super_admin" || user.role === "admin") return {};
  return { created_by: user.uid };
}

export function assertOwnsOrAdmin(user: AuthedUser, doc: { created_by?: string } | null): void {
  if (!doc) {
    throw new NotFoundError("Not found");
  }
  if (user.role === "super_admin" || user.role === "admin") return;
  if (doc.created_by !== user.uid) {
    throw new NotFoundError("Not found");
  }
}
