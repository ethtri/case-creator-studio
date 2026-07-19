export function requireServiceRequest(
  req: Request,
  allowedKeys: Array<string | undefined>,
): Response | null {
  if (req.headers.get("origin")) {
    return jsonServiceError(403, "Browser requests are not allowed");
  }

  const authorization = req.headers.get("authorization") ?? "";
  const bearer = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";
  const apiKey = req.headers.get("apikey") ?? "";
  const validKeys = allowedKeys
    .map((value) => value?.trim() ?? "")
    .filter(Boolean);

  if (
    validKeys.length === 0 ||
    (!validKeys.includes(bearer) && !validKeys.includes(apiKey))
  ) {
    return jsonServiceError(401, "Unauthorized");
  }

  return null;
}

export function jsonServiceError(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
