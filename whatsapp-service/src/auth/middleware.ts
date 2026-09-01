import { NextFunction, Request, Response } from "express";

import { UnauthorizedError, PermissionDeniedError } from "../core/errors";
import { DuplicateKeyError } from "../db/documentStore";
import { usersCollection, UserDoc } from "../db/collections";
import { getFirebaseAuth } from "./firebase";
import { AuthedUser, defaultPermissionsForRole, hasPermission } from "./permissions";

declare global {
  namespace Express {
    interface Request {
      user?: AuthedUser;
    }
  }
}

function extractToken(req: Request): string {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) {
    throw new UnauthorizedError("Missing or invalid Authorization header");
  }
  return header.slice("Bearer ".length).trim();
}

function toAuthedUser(doc: UserDoc): AuthedUser {
  return {
    _id: doc._id,
    uid: doc.uid,
    email: doc.email,
    name: doc.name,
    role: doc.role,
    modules: doc.modules || [],
    services: doc.services || [],
    fields: doc.fields || [],
    active: doc.active,
  };
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = extractToken(req);

    let decoded;
    try {
      decoded = await getFirebaseAuth().verifyIdToken(token, true);
    } catch (err: any) {
      if (err?.code === "auth/id-token-revoked") {
        throw new UnauthorizedError("Your session was revoked. Please sign in again.");
      }
      throw new UnauthorizedError("Invalid or expired session. Please sign in again.");
    }

    const uid = decoded.uid as string;
    let profile = await usersCollection.findOne({ uid });

    if (!profile) {
      const isFirstUserEver = (await usersCollection.countDocuments({})) === 0;
      const role = isFirstUserEver ? "super_admin" : "user";
      const perms = defaultPermissionsForRole(role);
      const email = (decoded.email as string) || "";
      const newProfile: UserDoc = {
        _id: "",
        uid,
        email,
        name: (decoded.name as string) || email.split("@")[0] || "",
        role: role as UserDoc["role"],
        modules: perms.modules,
        services: perms.services,
        fields: perms.fields,
        active: true,
        created_by: isFirstUserEver ? "self:bootstrap" : "self:signup",
        created_at: new Date(),
      };
      try {
        const { insertedId } = await usersCollection.insertOne(newProfile);
        profile = { ...newProfile, _id: insertedId };
      } catch (err) {
        if (err instanceof DuplicateKeyError) {
          profile = await usersCollection.findOne({ uid });
        } else {
          throw err;
        }
      }
    }

    if (!profile || !profile.active) {
      throw new PermissionDeniedError("This account has been deactivated. Contact your admin.");
    }

    req.user = toAuthedUser(profile);
    next();
  } catch (err) {
    next(err);
  }
}

export function requirePermission(moduleName: string, service?: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new UnauthorizedError("Not authenticated"));
      return;
    }
    if (!hasPermission(req.user, moduleName, service)) {
      next(new PermissionDeniedError(`You don't have access to ${moduleName}${service ? `:${service}` : ""}.`));
      return;
    }
    next();
  };
}
