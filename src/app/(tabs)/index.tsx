import { Redirect } from 'expo-router';

// Landing screen is the chat/community surface (level now lives under profile).
export default function Index() {
  return <Redirect href="/chat" />;
}
