/**
 * Supabase Auth necesita un email por usuario. Los usuarios que no tienen email
 * (por ejemplo, vendedores que entran con usuario + código de empresa) reciben un
 * email interno que nunca recibe correos (dominio reservado ".invalid").
 * El login con "usuario + código de empresa" arma ese mismo email.
 *
 * IMPORTANTE: la Edge Function admin-users y el script de migración usan la misma regla.
 */
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
