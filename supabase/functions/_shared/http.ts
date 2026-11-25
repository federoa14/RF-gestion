export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Misma regla que src/utils/authEmail.ts */
export const SYNTHETIC_EMAIL_DOMAIN = 'usuarios.rf-gestion.invalid';

function slug(value: string): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function syntheticEmailFor(username: string, tenantCode?: string | null): string {
  const user = slug(username) || 'usuario';
  const code = slug(tenantCode || '');
  return code ? `${user}.${code}@${SYNTHETIC_EMAIL_DOMAIN}` : `${user}@${SYNTHETIC_EMAIL_DOMAIN}`;
}

export function isSyntheticEmail(email?: string | null): boolean {
  return Boolean(email && email.toLowerCase().endsWith(`@${SYNTHETIC_EMAIL_DOMAIN}`));
}
