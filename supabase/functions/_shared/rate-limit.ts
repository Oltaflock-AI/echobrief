// In-memory rate limiting for Edge Functions
// Note: This resets on cold starts, but provides protection against sustained attacks

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

// Store rate limit data in memory (per-instance)
const rateLimitStore = new Map<string, RateLimitEntry>();

// Clean up old entries periodically
function cleanupExpiredEntries() {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}

// Run cleanup every minute
setInterval(cleanupExpiredEntries, 60000);

export interface RateLimitConfig {
  // Maximum requests allowed in the window
  maxRequests: number;
  // Window duration in seconds
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetIn: number; // seconds until reset
}

export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): RateLimitResult {
  const now = Date.now();
  const windowMs = config.windowSeconds * 1000;
  const key = identifier;
  
  let entry = rateLimitStore.get(key);
  
  // If no entry or window expired, create new entry
  if (!entry || now > entry.resetTime) {
    entry = {
      count: 1,
      resetTime: now + windowMs,
    };
    rateLimitStore.set(key, entry);
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetIn: config.windowSeconds,
    };
  }
  
  // Increment count
  entry.count++;
  
  const resetIn = Math.ceil((entry.resetTime - now) / 1000);
  
  if (entry.count > config.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetIn,
    };
  }
  
  return {
    allowed: true,
    remaining: config.maxRequests - entry.count,
    resetIn,
  };
}

export function getClientIdentifier(req: Request): string {
  // Try to get real IP from various headers (Cloudflare, proxies, etc.)
  const cfConnectingIp = req.headers.get("cf-connecting-ip");
  const xRealIp = req.headers.get("x-real-ip");
  const xForwardedFor = req.headers.get("x-forwarded-for");
  const remoteAddr = req.headers.get("x-envoy-external-address");
  
  // Priority: CF > X-Real-IP > X-Forwarded-For (first IP) > Envoy
  if (cfConnectingIp) return cfConnectingIp;
  if (xRealIp) return xRealIp;
  if (xForwardedFor) return xForwardedFor.split(",")[0].trim();
  if (remoteAddr) return remoteAddr;
  
  // Fallback - not ideal but better than nothing
  return "unknown";
}

export function createRateLimitResponse(
  result: RateLimitResult,
  corsHeaders: Record<string, string>
): Response {
  return new Response(
    JSON.stringify({
      error: "Too many requests",
      retryAfter: result.resetIn,
    }),
    {
      status: 429,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Retry-After": result.resetIn.toString(),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": result.resetIn.toString(),
      },
    }
  );
}

// Preset configurations for different endpoint types
export const RATE_LIMITS = {
  // Auth endpoints - stricter limits
  AUTH: { maxRequests: 10, windowSeconds: 60 },
  // OAuth flows - moderate limits
  OAUTH: { maxRequests: 20, windowSeconds: 60 },
  // General API endpoints
  API: { maxRequests: 60, windowSeconds: 60 },
  // Public endpoints (like getting client IDs)
  PUBLIC: { maxRequests: 100, windowSeconds: 60 },
} as const;
