import React from 'react';
import { View } from 'react-native';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import AnimatedPressable from './AnimatedPressable';
import Stack from './Stack';
import Typography from './Typography';
import Icon from './Icon';

interface AccordionProps {
  title: string;
  open: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
}

function Accordion({ title, open, onToggle, children }: AccordionProps) {
  return (
    <View>
      <AnimatedPressable
        onPress={onToggle}
        animated={false}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <Stack direction="horizontal" vAlign="center" padding={[16, 16]}>
          <Typography variant="body2" color="secondary">
            {title}
          </Typography>
          <View style={{ marginLeft: 'auto' }}>
            <Icon size={18}>{open ? <ChevronUp /> : <ChevronDown />}</Icon>
          </View>
        </Stack>
      </AnimatedPressable>
      {open ? children : null}
    </View>
  );
}

export default React.memo(Accordion);
