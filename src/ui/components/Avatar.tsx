import React from 'react';
import { Image, View } from 'react-native';
import { useTheme } from 'expo-router';
import Typography from './Typography';

interface AvatarProps {
  uri?: string | null;
  name?: string;
  size?: number;
}

function initials(name?: string): string {
  if (!name) return '?';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

function Avatar({ uri, name, size = 40 }: AvatarProps) {
  const { colors } = useTheme();
  const radius = size / 2;

  if (uri) {
    return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: radius }} />;
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Typography variant="body2" color="light" style={{ fontSize: size * 0.4, lineHeight: size }}>
        {initials(name)}
      </Typography>
    </View>
  );
}

export default React.memo(Avatar);
