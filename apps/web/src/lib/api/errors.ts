/** An error returned by the API, in the standard envelope: { error: { code, message, ... } }. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function parseErrorResponse(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as {
      error?: { code?: string; message?: string; details?: unknown; requestId?: string };
    };
    const e = body.error;
    return new ApiError(
      res.status,
      e?.code ?? "UNKNOWN_ERROR",
      e?.message ?? `Request failed (${res.status})`,
      e?.details,
      e?.requestId,
    );
  } catch {
    return new ApiError(res.status, "UNKNOWN_ERROR", `Request failed (${res.status})`);
  }
}
