// Cabeceras de seguridad aplicadas a todas las respuestas del servidor.
// Se define en un módulo propio para reutilizarlas también en las respuestas
// de error de src/server.ts, que no pasan por el middleware de request.

// Origen de Supabase para el CSP; cambia entre 127.0.0.1 (dev) y el proyecto
// remoto según VITE_SUPABASE_URL.
const supabaseConnectSrc = (() => {
  try {
    const origin = new URL(import.meta.env["VITE_SUPABASE_URL"] ?? "").origin;
    // http -> ws y https -> wss, para cubrir también el canal realtime.
    return [origin, origin.replace(/^http/, "ws")];
  } catch {
    return [];
  }
})();

export const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Content-Security-Policy": [
    "default-src 'self'",
    // 'unsafe-inline' cubre el script de preferencias y los estilos de temas;
    // sigue bloqueando la carga de scripts externos inyectados.
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob:",
    `connect-src 'self'${supabaseConnectSrc.length ? ` ${supabaseConnectSrc.join(" ")}` : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; "),
};

export function applySecurityHeaders(response: Response): Response {
  for (const [header, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(header, value);
  }
  return response;
}
