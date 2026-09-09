import React from 'react';
import { StyleSheet, TextInput, TextInputProps, View } from 'react-native';
import { useTheme } from 'expo-router';
import Typography from './Typography';

interface TextFieldProps extends TextInputProps {
  label?: string;
  error?: string;
  right?: React.ReactNode;
}

function TextField({ label, error, right, style, ...rest }: TextFieldProps) {
  const { colors, radius } = useTheme();

  return (
    <View style={styles.container}>
      {label ? (
        <Typography variant="body2" color="secondary" style={styles.label}>
          {label}
        </Typography>
      ) : null}
      <View
        style={[
          styles.field,
          {
            backgroundColor: colors.surface,
            borderRadius: radius.md,
            borderColor: error ? colors.danger : colors.border,
          },
        ]}
      >
        <TextInput
          {...rest}
          placeholderTextColor={colors.text + '66'}
          style={[styles.input, { color: colors.text }, style]}
        />
        {right}
      </View>
      {error ? (
        <Typography variant="caption" color="danger" style={styles.error}>
          {error}
        </Typography>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', gap: 6 },
  label: { marginLeft: 2 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingHorizontal: 14,
    minHeight: 48,
  },
  input: { flex: 1, paddingVertical: 12, fontSize: 15 },
  error: { marginLeft: 2 },
});

export default React.memo(TextField);
