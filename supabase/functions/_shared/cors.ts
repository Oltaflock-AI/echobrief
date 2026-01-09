// Shared CORS configuration for all Edge Functions
// Only allows requests from the production app and local development

const ALLOWED_ORIGINS = [
  // Production
  "https://zuljmldniwynmnilnffu.lovableproject.com",
  // Local development
  "http://localhost:5173",
  "http://localhost:3000",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:3000",
];

export function getCorsHeaders(origin: string | null): Record<string, string> {
  // Check if the origin is in our allowed list
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
}

export function handleCorsPrelight(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    const origin = req.headers.get("origin");
    return new Response(null, { headers: getCorsHeaders(origin) });
  }
  return null;
}
