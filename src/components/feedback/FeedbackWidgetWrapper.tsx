'use client';

import dynamic from 'next/dynamic';

const FeedbackWidgetInner = dynamic(() => import('./FeedbackWidgetInner'), {
  ssr: false,
});

export function FeedbackWidgetWrapper() {
  return <FeedbackWidgetInner />;
}
