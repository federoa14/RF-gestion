// Verifica que un pedido venga del cron de la base (pg_cron + pg_net).
// La clave es la guardada en Vault como rf_cron_secret. Si además existe la
// variable CRON_SECRET en la función, se usa esa (compatibilidad).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function isCronRequest(req: Request, db: any): Promise<boolean> {
  const header = req.headers.get('x-cron-secret') || '';
  if (!header) return false;
  let secret = Deno.env.get('CRON_SECRET') || '';
  if (!secret) {
    const { data } = await db.rpc('rf_cron_secret');
    secret = typeof data === 'string' ? data : '';
  }
  return secret.length >= 16 && header === secret;
}
