import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

export class DomainError extends Error {
  statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends DomainError {
  statusCode = 404;
}

export class ValidationError extends DomainError {
  statusCode = 422;
}

export class PermissionDeniedError extends DomainError {
  statusCode = 403;
}

export class UnauthorizedError extends DomainError {
  statusCode = 401;
}

export class ConflictError extends DomainError {
  statusCode = 409;
}

export class UpstreamServiceError extends DomainError {
  statusCode = 502;
  readonly ambiguous: boolean;
  constructor(message: string, ambiguous = false) {
    super(message);
    this.ambiguous = ambiguous;
  }
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction): void {
  if (err instanceof DomainError) {
    res.status(err.statusCode).json({ detail: err.message });
    return;
  }
  if (err instanceof ZodError) {
    const zodErr = err as ZodError;
    const first = zodErr.issues[0];
    const field = first?.path?.join(".") || "input";
    res.status(422).json({ detail: `Invalid ${field}: ${first?.message || "validation failed"}` });
    return;
  }
  console.error("Unhandled error:", err);
  res.status(500).json({ detail: "Internal server error" });
}
