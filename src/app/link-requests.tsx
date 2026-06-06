import { Redirect } from 'expo-router';

// Link requests now live in the admin "requests" tab.
export default function LinkRequests() {
  return <Redirect href="/requests" />;
}
