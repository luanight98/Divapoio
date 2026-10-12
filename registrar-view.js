// Roda no servidor da Vercel. Lê as chaves das variáveis de ambiente (nunca vão ao navegador).
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método inválido' });

  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) return res.status(401).json({ erro: 'Não autorizado' });

  // A regra (1 visualização a cada ~15 s e entrada na fila aos 1.000) fica no banco.
  const { data, error: e2 } = await admin.rpc('registrar_view', { uid: user.id });
  if (e2) return res.status(500).json({ erro: 'Erro ao registrar' });
  if (data === null) return res.status(429).json({ erro: 'Aguarde alguns segundos antes de assistir de novo.' });
  res.json({ ok: true, views: data });
}
