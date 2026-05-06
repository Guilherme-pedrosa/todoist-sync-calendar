/**
 * Resolve um nome legível para um usuário.
 * Ordem de preferência: display_name -> parte antes do @ do email -> "Usuário".
 * Nunca retorna UUID truncado.
 */
export function userDisplayName(
  displayName?: string | null,
  email?: string | null,
): string {
  const name = (displayName || '').trim();
  if (name) return name;
  const mail = (email || '').trim();
  if (mail && mail.includes('@')) {
    const local = mail.split('@')[0];
    if (local) return local;
  }
  return 'Usuário';
}
