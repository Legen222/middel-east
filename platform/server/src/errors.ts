/** Errors the API returns to the player. Messages are German, codes are stable for the frontend. */
export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const fail = (code: string, message: string, status = 400, details?: Record<string, unknown>): never => {
  throw new AppError(code, message, status, details);
};
