'use client';

import { FeedbackWidget } from '@sevaro/feedback';
import { useAuth } from '@/contexts/AuthContext';

export default function FeedbackWidgetInner() {
  const { user } = useAuth();

  return (
    <FeedbackWidget
      appId="opsample"
      apiUrl="https://8uagz9y5bh.execute-api.us-east-2.amazonaws.com/feedback"
      chatApiUrl="https://8uagz9y5bh.execute-api.us-east-2.amazonaws.com/feedback/chat"
      apiKey="eF9ER216oHw78IEkb-XJFI8ARG9evsPb-Cr9OlDklpQ"
      position="bottom-right"
      user={user ? { id: user.id, label: user.email } : undefined}
    />
  );
}
