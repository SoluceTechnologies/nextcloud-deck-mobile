import React from 'react';

import IconTile from './IconTile';
import Item from './Item';
import List from './List';
import Typography from './Typography';

export type SheetAction = {
  key: string;
  title: string;
  icon?: React.ReactNode;
  destructive?: boolean;
  onPress: () => void;
  testID?: string;
};

interface ActionListProps {
  actions: SheetAction[];
}

function ActionList({ actions }: ActionListProps) {
  return (
    <List>
      {actions.map((action) => (
        <Item
          key={action.key}
          testID={action.testID}
          title={
            action.destructive ? (
              <Typography variant="body1" color="danger">
                {action.title}
              </Typography>
            ) : (
              action.title
            )
          }
          leading={
            action.icon ? (
              <IconTile tint={action.destructive ? 'danger' : 'default'}>{action.icon}</IconTile>
            ) : undefined
          }
          onPress={action.onPress}
        />
      ))}
    </List>
  );
}

export default React.memo(ActionList);
