import { NextFunction, Request, Response } from 'express';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly expose: boolean;

  constructor(message: string, statusCode = 500, expose = true) {
    super(message);
    this.statusCode = statusCode;
    this.expose = expose;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: {
      message: `Route not found: ${req.method} ${req.originalUrl}`,
    },
  });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: { message: err.expose ? err.message : 'Internal Server Error' },
    });
    return;
  }

  // Unknown/unexpected error: never leak internals to the client.
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ error: { message: 'Internal Server Error' } });
}
