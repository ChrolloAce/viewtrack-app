import { Image } from 'expo-image';
import { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Border, brutalShadow, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Card: thin outline + soft drop shadow. The base surface. */
export function BrutalCard({
  children,
  style,
  color,
  shadow = 5,
}: {
  children: ReactNode;
  style?: ViewStyle | ViewStyle[];
  color?: string;
  shadow?: number;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: color ?? theme.card, borderColor: theme.border },
        brutalShadow(theme.shadow, shadow),
        style,
      ]}>
      {children}
    </View>
  );
}

type ButtonVariant = 'primary' | 'accent' | 'neutral' | 'danger';

/** Rounded pill button that softly dips on press. */
export function BrutalButton({
  label,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const theme = useTheme();
  const bg =
    variant === 'primary'
      ? theme.primary
      : variant === 'accent'
        ? theme.accent
        : variant === 'danger'
          ? theme.danger
          : theme.background;
  const fg =
    variant === 'accent'
      ? theme.text
      : variant === 'neutral'
        ? theme.text
        : theme.primaryText;
  const isOff = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isOff}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: isOff ? theme.backgroundElement : bg, borderColor: theme.border },
        brutalShadow(theme.shadow, 5),
        pressed && !isOff && { transform: [{ translateX: 2 }, { translateY: 2 }] },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator size="small" color={fg} />
      ) : (
        <ThemedText style={[styles.buttonLabel, { color: isOff ? theme.textSecondary : fg }]}>
          {label}
        </ThemedText>
      )}
    </Pressable>
  );
}

/** Text input with a thin rounded outline. */
export function BrutalInput(props: TextInputProps & { style?: ViewStyle }) {
  const theme = useTheme();
  return (
    <TextInput
      placeholderTextColor={theme.textSecondary}
      {...props}
      style={[
        styles.input,
        { backgroundColor: theme.background, color: theme.text, borderColor: theme.border },
        props.style,
      ]}
    />
  );
}

/** Circular avatar — shows the photo if set, else a white initial on orange. */
export function BrutalAvatar({
  name,
  uri,
  size = 44,
  color,
}: {
  name?: string | null;
  uri?: string | null;
  size?: number;
  color?: string;
}) {
  const theme = useTheme();
  const initial = (name ?? '?').trim().charAt(0).toUpperCase() || '?';

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: theme.backgroundElement }}
        contentFit="cover"
        transition={150}
      />
    );
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color ?? theme.primary,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <ThemedText style={{ fontWeight: '800', fontSize: size * 0.42, color: '#FFFFFF' }}>
        {initial}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: Border.width,
    borderRadius: Radius.lg,
    padding: Spacing.three,
  },
  button: {
    minHeight: 54,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.md,
    borderWidth: Border.width,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLabel: {
    fontWeight: '800',
    fontSize: 16,
  },
  input: {
    minHeight: 52,
    borderRadius: Radius.md,
    borderWidth: Border.width,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
    fontWeight: '500',
  },
});
