'use client';

import { FeedbackWidget } from './widget/FeedbackWidget';
import { useAuth } from '@/contexts/AuthContext';

export default function FeedbackWidgetInner() {
  const { user } = useAuth();

  return (
    <FeedbackWidget
      appId="opsample"
      apiUrl="https://8uagz9y5bh.execute-api.us-east-2.amazonaws.com/feedback"
      position="bottom-right"
      user={user ? { id: user.id, label: user.email } : undefined}
    />
  );
}
