export function GET() {
  return Response.json({ status: 'ok', app: 'sharespace', version: '0.1.0', live_agent_ingestion: false }, { headers: { 'Cache-Control': 'no-store' } });
}
