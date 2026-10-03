export function GET() {
  return Response.json({
    status: 'ok',
    app: 'sharespace',
    version: '0.1.0',
    scope: 'web_process',
    agent_ingestion_backend: 'supabase_edge_functions',
    provider_health: 'not_checked',
  }, { headers: { 'Cache-Control': 'no-store' } });
}
