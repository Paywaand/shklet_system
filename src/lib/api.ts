import { NextResponse } from "next/server";
import { AuthError } from "./auth";

/**
 * Wraps an API route handler so `AuthError` → the correct status code, and
 * any other thrown error → a generic 500 without leaking internals to the
 * client. Use for every route handler in `src/app/api/**`.
 */
export function withApiError<Args extends unknown[]>(
  handler: (...args: Args) => Promise<NextResponse>,
) {
  return async (...args: Args): Promise<NextResponse> => {
    try {
      return await handler(...args);
    } catch (err) {
      if (err instanceof AuthError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      console.error(err);
      return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
    }
  };
}

export async function safeJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new AuthError("Invalid JSON body", 400);
  }
}
