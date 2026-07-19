import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getCorsHeaders } from "./cors.ts";

export interface OperatorIdentity {
  email: string;
}

export function parseOperatorEmails(raw: string): Set<string> {
  return new Set(
    raw
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isVerifiedOperatorUser(
  user: {
    email_confirmed_at?: string | null;
    app_metadata?: Record<string, unknown>;
  } | null,
): boolean {
  if (!user) return false;
  if (user.email_confirmed_at) return true;
  return user.app_metadata?.email_verified === true;
}

function jsonError(
  req: Request,
  methods: string,
  status: number,
  error: string,
): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: {
      ...getCorsHeaders(req, methods),
      "Content-Type": "application/json",
    },
  });
}

export async function requireOperator(
  req: Request,
  options: {
    supabaseUrl: string;
    anonKey: string;
    methods: string;
    operatorEmails?: string;
  },
): Promise<OperatorIdentity | Response> {
  const authHeader = req.headers.get("authorization") ||
    req.headers.get("Authorization") || "";
  if (!authHeader) {
    return jsonError(req, options.methods, 401, "Unauthorized");
  }

  const supabaseAuth = createClient(options.supabaseUrl, options.anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await supabaseAuth.auth.getUser();
  const user = data?.user ?? null;

  if (error || !user?.email) {
    return jsonError(req, options.methods, 401, "Unauthorized");
  }

  if (!isVerifiedOperatorUser(user)) {
    return jsonError(req, options.methods, 403, "Email not verified");
  }

  const email = user.email.toLowerCase();
  const allowlist = parseOperatorEmails(
    options.operatorEmails ?? Deno.env.get("OPERATOR_EMAILS") ?? "",
  );
  if (!allowlist.has(email)) {
    return jsonError(req, options.methods, 403, "Forbidden");
  }

  return { email };
}
