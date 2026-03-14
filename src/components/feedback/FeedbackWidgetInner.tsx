'use client';

import { FeedbackWidget } from './widget/FeedbackWidget';

export default function FeedbackWidgetInner() {
  return (
    <FeedbackWidget
      appId="opsample"
      apiUrl="https://8uagz9y5bh.execute-api.us-east-2.amazonaws.com/feedback"
      position="bottom-right"
    />
  );
}
