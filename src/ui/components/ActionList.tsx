import React from 'react';

import IconTile from './IconTile';
import Item from './Item';
import List from './List';
import Typography from './Typography';

export type SheetAction = {
  key: string;
  title: string;
  icon?: React.ReactNode;
  /** Paints the row red and tints its tile — for a delete, never for a rename. */
  destructive?: boolean;
  onPress: () => void;
  testID?: string;
};

interface ActionListProps {
  actions: SheetAction[];
}

/**
 * The rows of an action sheet, shared by every menu in the app so a delete
 * looks the same wherever it is offered. Callers build a plain array and
 * decide which actions exist; nothing here knows about boards, cards or
 * comments.
 *
 * `Item`'s `title` takes a node, so the destructive row is coloured by passing
 * its own Typography rather than by teaching `Item` about severity — the rest
 * of the app's rows have no use for that.
 */
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
