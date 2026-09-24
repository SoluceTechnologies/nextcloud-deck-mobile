import React from 'react';
import { StyleSheet, View } from 'react-native';
import Typography from './Typography';

interface SectionHeaderProps {
  title: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
}

function SectionHeader({ title, leading, trailing }: SectionHeaderProps) {
  return (
    <View style={styles.container}>
      <View style={styles.left}>
        {leading}
        <Typography variant="body2" color="secondary">
          {title}
        </Typography>
      </View>
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 6,
    marginBottom: 12,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});

export default React.memo(SectionHeader);
