import { Report } from '@/components/report';

/**
 * Shareable crash-test report. The session comes from the stream service (memory or
 * PostgreSQL); the reader's size and delay travel in the URL hash, which never reaches
 * a server.
 */
export default async function ReportPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return <Report sessionId={sessionId} />;
}
