/**
 * Typed errors with stable exit codes so scripts / Claude can branch on failure mode.
 *   1 generic · 2 usage/validation · 3 auth/config · 4 insufficient credits
 *   5 rate limited · 6 not found · 7 network
 */
export class VirloError extends Error {
  exitCode = 1;
  /** Machine-readable error type for --json error output. */
  type = 'error';
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class ConfigError extends VirloError {
  override exitCode = 3;
  override type = 'config_error';
}

export class AuthError extends VirloError {
  override exitCode = 3;
  override type = 'auth_error';
}

export class ValidationError extends VirloError {
  override exitCode = 2;
  override type = 'validation_error';
}

export interface CreditDetails {
  requiredCredits?: number;
  remainingCredits?: number;
  requiredAmount?: string;
  remainingBalance?: string;
}

export class InsufficientCreditsError extends VirloError {
  override exitCode = 4;
  override type = 'insufficient_credits';
  constructor(
    message: string,
    public details: CreditDetails = {},
  ) {
    super(message);
  }
}

export class RateLimitError extends VirloError {
  override exitCode = 5;
  override type = 'rate_limited';
  constructor(
    message: string,
    public retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

export class NotFoundError extends VirloError {
  override exitCode = 6;
  override type = 'not_found';
}

export class NetworkError extends VirloError {
  override exitCode = 7;
  override type = 'network_error';
}

export class ApiError extends VirloError {
  override type = 'api_error';
  constructor(
    message: string,
    public status: number,
    public body: unknown,
  ) {
    super(message);
  }
}
