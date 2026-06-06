import { Redirect } from 'expo-router';

// Creator management now lives in the admin "creators" tab.
export default function ManageCreators() {
  return <Redirect href="/creators" />;
}
