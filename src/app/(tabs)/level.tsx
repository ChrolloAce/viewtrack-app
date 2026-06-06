import { Redirect } from 'expo-router';

// Level progression now lives inside the Profile tab.
export default function LevelScreen() {
  return <Redirect href="/profile" />;
}
