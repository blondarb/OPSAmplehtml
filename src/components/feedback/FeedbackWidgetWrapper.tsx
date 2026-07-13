'use client';

import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';

const FeedbackWidgetInner = dynamic(() => import('./FeedbackWidgetInner'), {
  ssr: false,
});

export function FeedbackWidgetWrapper() {
  const pathname = usePathname();
  // The Clara R&D voice-test surface (/rnd/clara) has its own feedback UI and a
  // mic/start control pinned in the same bottom corner — the global "Give
  // Feedback" widget overlaps the start button there on mobile. Suppress it on
  // that route and its subpages (e.g. /rnd/clara/results).
  if (pathname?.startsWith('/rnd/clara')) return null;
  return <FeedbackWidgetInner />;
}
