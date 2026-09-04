export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ status: 'ok', service: 'web', version: process.env.SERVICE_VERSION ?? '0.1.0', streamUrl: process.env.NEXT_PUBLIC_STREAM_URL ?? 'http://localhost:4010' });
}
