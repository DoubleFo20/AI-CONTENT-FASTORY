import type { ErrorCode } from '../shared/contracts.js';

export class AppError extends Error {
  constructor(public readonly code: ErrorCode, public readonly status = 400) {
    super(code);
  }
}
