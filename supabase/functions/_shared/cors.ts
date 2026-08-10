// En-têtes CORS communs. Le formulaire public est servi par la fonction elle-même (même origine),
// mais on autorise large pour tolérer un POST depuis une autre origine (lien partagé, etc.).
export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
