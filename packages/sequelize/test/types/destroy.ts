// Ported from sequelize (test/types/destroy.ts, MIT License) by tools/port-types/port.js: do not edit, change the tool.
import { User } from './models/User';

(async () => {
  const user = await User.create();

  await user.destroy({
    hooks: true
  });

  await User.destroy({
    hooks: false,
    where: { firstName: 'John' }
  });
})();
