// A migration of xufa, written by hand: the table of the groups is accounts_group (named by its app, as every model
// of an app); 0002 made it as group. A rename keeps its rows (the references of accounts_user_groups follow it), and
// its unique index takes the name of the table.
export const operations = [
  { op: 'renameTable', from: 'group', to: 'accounts_group' },
  { op: 'dropIndex', table: 'accounts_group', name: 'group_name_uniq' },
  {
    op: 'createIndex',
    table: 'accounts_group',
    index: { name: 'accounts_group_name_uniq', columns: ['name'], unique: true },
  },
];
