// The behavior of Sequelize on every dialect: the same models and operations give the same results in SQLite and
// PostgreSQL. Each test file calls defineSuite with a function that makes a Sequelize of its dialect.
const {
  DataTypes,
  Op,
  ValidationError,
  UniqueConstraintError,
  ForeignKeyConstraintError,
  EmptyResultError,
} = require('..');
const { Sequelize } = require('..');

function defineModels(sequelize) {
  const Publisher = sequelize.define('Publisher', { name: { type: DataTypes.STRING, allowNull: false, unique: true } });
  const Author = sequelize.define(
    'Author',
    {
      name: { type: DataTypes.STRING(100), allowNull: false, validate: { len: [2, 100] } },
      email: { type: DataTypes.STRING, validate: { isEmail: true } },
      active: { type: DataTypes.BOOLEAN, defaultValue: true },
      fullName: {
        type: DataTypes.VIRTUAL,
        get() {
          return `${this.getDataValue('name')} (${this.getDataValue('email') || 'no email'})`;
        },
      },
    },
    {
      hooks: {
        beforeValidate(author) {
          if (typeof author.name === 'string') author.name = author.name.trim();
        },
      },
    }
  );
  const Book = sequelize.define(
    'Book',
    {
      title: { type: DataTypes.STRING(200), allowNull: false },
      pages: { type: DataTypes.INTEGER, validate: { min: 1 } },
      rating: DataTypes.DOUBLE,
      price: DataTypes.DECIMAL(10, 2),
      published: DataTypes.DATEONLY,
      data: DataTypes.JSON,
      status: { type: DataTypes.ENUM('draft', 'published'), defaultValue: 'draft' },
      slug: {
        type: DataTypes.STRING,
        set(value) {
          this.setDataValue('slug', String(value).toLowerCase().replace(/\s+/g, '-'));
        },
      },
    },
    { underscored: true }
  );
  const Profile = sequelize.define('Profile', { bio: DataTypes.TEXT });
  const Tag = sequelize.define('Tag', { name: { type: DataTypes.STRING, unique: true } }, { timestamps: false });
  const Note = sequelize.define('Note', { text: DataTypes.STRING }, { paranoid: true });
  const Token = sequelize.define('Token', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    value: DataTypes.STRING,
    big: DataTypes.BIGINT,
    blob: DataTypes.BLOB,
  });

  Author.belongsTo(Publisher, { as: 'publisher', foreignKey: 'publisherId' });
  Publisher.hasMany(Author, { as: 'authors', foreignKey: 'publisherId' });
  Book.belongsTo(Author, { as: 'author', foreignKey: { name: 'authorId', allowNull: false }, onDelete: 'CASCADE' });
  Author.hasMany(Book, { as: 'books', foreignKey: 'authorId' });
  Author.hasOne(Profile, { as: 'profile', foreignKey: 'authorId' });
  Book.belongsToMany(Tag, { through: 'BookTags', as: 'tags', foreignKey: 'bookId', otherKey: 'tagId' });
  Tag.belongsToMany(Book, { through: 'BookTags', as: 'books', foreignKey: 'tagId', otherKey: 'bookId' });
  // Default names: the key is <Model><Pk> (NoteId on Book... here AuthorId on Note).
  Note.belongsTo(Author);
  return { Publisher, Author, Book, Profile, Tag, Note, Token };
}

function defineSuite(name, makeSequelize) {
  describe(`${name} dialect`, () => {
    let sequelize;
    let models;

    beforeAll(async () => {
      sequelize = makeSequelize();
      models = defineModels(sequelize);
      await sequelize.sync({ force: true });
    });

    afterAll(async () => {
      if (sequelize) {
        await sequelize.drop();
        await sequelize.close();
      }
    });

    beforeEach(async () => {
      const { Publisher, Author, Book, Profile, Tag, Note, Token } = models;
      await sequelize.model('BookTags').destroy({ where: {} });
      await Note.destroy({ where: {}, force: true });
      await Book.destroy({ where: {} });
      await Profile.destroy({ where: {} });
      await Author.destroy({ where: {} });
      await Publisher.destroy({ where: {} });
      await Tag.destroy({ where: {} });
      await Token.destroy({ where: {} });
    });

    async function seed() {
      const { Publisher, Author, Book } = models;
      const penguin = await Publisher.create({ name: 'Penguin' });
      const ada = await Author.create({ name: 'Ada', email: 'ada@example.com', publisherId: penguin.id });
      const grace = await Author.create({ name: 'Grace', email: null, active: false });
      const alan = await Author.create({ name: 'Alan', email: 'alan@example.com', publisherId: penguin.id });
      await Book.bulkCreate([
        { title: 'Notes on the Engine', pages: 120, rating: 4.5, authorId: ada.id, data: { tags: ['math'] } },
        { title: 'The Analytical Engine', pages: 300, rating: 3.5, authorId: ada.id },
        { title: 'Compilers', pages: 250, rating: null, authorId: grace.id },
        { title: 'Computing Machinery', pages: null, rating: 5, authorId: alan.id },
      ]);
      return { penguin, ada, grace, alan };
    }

    const titles = (books) => books.map((book) => book.title);

    describe('models', () => {
      it('names tables, keys and columns as Sequelize', () => {
        const { Author, Book, Note, Tag } = models;
        expect(Author.tableName).toBe('Authors');
        expect(Book.tableName).toBe('books');
        expect(Book.rawAttributes.createdAt.field).toBe('created_at');
        expect(Book.rawAttributes.authorId.field).toBe('author_id');
        expect(Note.rawAttributes.AuthorId).toBeDefined();
        expect(Tag.rawAttributes.createdAt).toBeUndefined();
        expect(Author.primaryKeyAttribute).toBe('id');
        expect(Object.keys(Book.associations).sort()).toEqual(['author', 'tags']);
        expect(sequelize.isDefined('BookTags')).toBe(true);
      });

      it('builds, saves and tracks changes', async () => {
        const { Author } = models;
        const ada = Author.build({ name: 'Ada' });
        expect(ada.isNewRecord).toBe(true);
        expect(ada.active).toBe(true);
        await ada.save();
        expect(ada.isNewRecord).toBe(false);
        expect(typeof ada.id).toBe('number');
        expect(ada.createdAt).toBeInstanceOf(Date);
        expect(ada.changed()).toBe(false);
        ada.name = 'Ada L.';
        expect(ada.changed()).toEqual(['name']);
        expect(ada.changed('name')).toBe(true);
        expect(ada.previous('name')).toBe('Ada');
        await ada.save();
        const found = await Author.findByPk(ada.id);
        expect(found.name).toBe('Ada L.');
        expect(found.get('name')).toBe('Ada L.');
        expect(found.dataValues.name).toBe('Ada L.');
        await found.update({ email: 'ada@lovelace.com' });
        expect((await Author.findByPk(ada.id)).email).toBe('ada@lovelace.com');
        expect(found.fullName).toBe('Ada L. (ada@lovelace.com)');
        const json = found.toJSON();
        expect(json).toMatchObject({ id: ada.id, name: 'Ada L.', email: 'ada@lovelace.com', active: true });
        expect(JSON.parse(JSON.stringify(found)).name).toBe('Ada L.');
      });

      it('saves only the attributes changed', async () => {
        const { Author } = models;
        const ada = await Author.create({ name: 'Ada', email: 'ada@example.com' });
        const copy = await Author.findByPk(ada.id);
        copy.email = 'other@example.com';
        await copy.save();
        ada.name = 'Ada Byron';
        await ada.save();
        const fresh = await Author.findByPk(ada.id);
        expect(fresh.name).toBe('Ada Byron');
        expect(fresh.email).toBe('other@example.com');
      });

      it('reloads, increments, decrements and destroys', async () => {
        const { Book } = models;
        const { ada } = await seed();
        const book = await Book.findOne({ where: { title: 'Compilers' } });
        await book.increment('pages', { by: 10 });
        expect(book.pages).toBe(260);
        await book.reload();
        expect(book.pages).toBe(260);
        await book.decrement(['pages']);
        await book.reload();
        expect(book.pages).toBe(259);
        await Book.increment({ pages: 1 }, { where: { authorId: ada.id } });
        expect((await Book.findOne({ where: { title: 'Notes on the Engine' } })).pages).toBe(121);
        await book.destroy();
        expect(await Book.findByPk(book.id)).toBeNull();
      });

      it('uses defaults, setters, enums, decimals, dates, uuids, big integers and bytes', async () => {
        const { Book, Token } = models;
        const { ada } = await seed();
        const book = await Book.create({
          title: 'X',
          authorId: ada.id,
          slug: 'Hello World',
          price: '12.50',
          published: '2024-02-29',
        });
        expect(book.status).toBe('draft');
        expect(book.slug).toBe('hello-world');
        const found = await Book.findByPk(book.id);
        expect(Number(found.price)).toBe(12.5);
        expect(found.published).toBe('2024-02-29');
        const token = await Token.create({ value: 'a', big: 2n ** 60n, blob: Buffer.from([1, 2, 3]) });
        expect(token.id).toMatch(/^[0-9a-f-]{36}$/);
        const loaded = await Token.findByPk(token.id);
        expect(loaded.big).toBe(2n ** 60n);
        expect([...loaded.blob]).toEqual([1, 2, 3]);
        await expect(Book.create({ title: 'Y', authorId: ada.id, status: 'gone' })).rejects.toBeInstanceOf(
          ValidationError
        );
      });
    });

    describe('validation', () => {
      it('throws ValidationErrors as Sequelize', async () => {
        const { Author } = models;
        const error = await Author.create({ email: 'nope' }).catch((err) => err);
        expect(error).toBeInstanceOf(ValidationError);
        expect(error.name).toBe('SequelizeValidationError');
        const byPath = Object.fromEntries(error.errors.map((item) => [item.path, item]));
        expect(byPath.name.type).toBe('notNull Violation');
        expect(byPath.name.message).toBe('Author.name cannot be null');
        expect(byPath.email.type).toBe('Validation error');
        expect(byPath.email.validatorKey).toBe('isEmail');
        const short = await Author.create({ name: ' A ' }).catch((err) => err);
        expect(short.errors[0].message).toBe('Validation len on name failed');
        const object = await Author.create({ name: { a: 1 } }).catch((err) => err);
        expect(object.errors[0].type).toBe('string violation');
        const ada = await Author.create({ name: '  Ada  ' });
        expect(ada.name).toBe('Ada');
        ada.email = 'bad';
        await expect(ada.save()).rejects.toBeInstanceOf(ValidationError);
        await expect(ada.save({ validate: false })).resolves.toBe(ada);
      });

      it('throws UniqueConstraintError and ForeignKeyConstraintError', async () => {
        const { Publisher, Book } = models;
        await Publisher.create({ name: 'Penguin' });
        const error = await Publisher.create({ name: 'Penguin' }).catch((err) => err);
        expect(error).toBeInstanceOf(UniqueConstraintError);
        expect(error).toBeInstanceOf(ValidationError);
        expect(error.name).toBe('SequelizeUniqueConstraintError');
        expect(Object.keys(error.fields)).toEqual(['name']);
        const missing = await Book.create({ title: 'X', authorId: 99999 }).catch((err) => err);
        expect(missing).toBeInstanceOf(ForeignKeyConstraintError);
      });
    });

    describe('finding', () => {
      it('handles polymorphic associations (one key, several models, by scopes)', async () => {
        const Post = sequelize.define('PolyPost', { title: DataTypes.STRING });
        const Image = sequelize.define('PolyImage', { url: DataTypes.STRING });
        const Comment = sequelize.define('PolyComment', {
          text: DataTypes.STRING,
          commentable: DataTypes.STRING,
          commentableId: DataTypes.INTEGER,
        });
        Post.hasMany(Comment, { foreignKey: 'commentableId', constraints: false, scope: { commentable: 'post' } });
        Image.hasMany(Comment, { foreignKey: 'commentableId', constraints: false, scope: { commentable: 'image' } });
        Comment.belongsTo(Post, { foreignKey: 'commentableId', constraints: false, as: 'post' });
        Comment.belongsTo(Image, { foreignKey: 'commentableId', constraints: false, as: 'image' });
        await sequelize.sync({ force: true });
        const post = await Post.create({ title: 'p' });
        const image = await Image.create({ url: 'i' });
        // The same key value for both: the scopes tell them apart.
        expect(post.id).toBe(image.id);
        await post.createPolyComment({ text: 'on post' });
        await image.createPolyComment({ text: 'on image' });
        expect((await post.getPolyComments()).map((comment) => comment.text)).toEqual(['on post']);
        expect((await image.getPolyComments()).map((comment) => comment.commentable)).toEqual(['image']);
        const posts = await Post.findAll({ include: [{ model: Comment }] });
        expect(posts[0].PolyComments.map((comment) => comment.text)).toEqual(['on post']);
        const comment = await Comment.findOne({ where: { text: 'on image' }, include: ['image'] });
        expect(comment.image.url).toBe('i');
        await Post.create({ title: 'none' });
        const commented = await Post.findAll({ include: [{ model: Comment, required: true }] });
        expect(commented.map((item) => item.title)).toEqual(['p']);
      });

      it('orders by the rows of includes of many, with limits', async () => {
        const { Book, Author, Tag } = models;
        await seed();
        const books = await Book.findAll({ order: [['title', 'ASC']] });
        const [zeta, alpha] = await Tag.bulkCreate([{ name: 'zeta' }, { name: 'alpha' }]);
        await books[0].addTags([zeta]);
        await books[1].addTags([alpha, zeta]);
        // By the first tag of each book, as a join orders them.
        const byTag = await Book.findAll({
          include: [{ association: 'tags', required: true }],
          order: [['tags', 'name', 'ASC']],
          limit: 2,
        });
        expect(titles(byTag)).toEqual([books[1].title, books[0].title]);
        const authors = await Author.findAll({
          include: [{ association: 'books', where: { pages: { [Op.ne]: null } } }],
          order: [['books', 'pages', 'DESC']],
          limit: 1,
        });
        expect(authors[0].name).toBe('Ada');
      });

      it('filters with operators', async () => {
        const { Book, Author } = models;
        await seed();
        const count = (where) => Book.count({ where });
        expect(await count({ pages: { [Op.gt]: 200 } })).toBe(2);
        expect(await count({ pages: { [Op.gte]: 120, [Op.lte]: 250 } })).toBe(2);
        expect(await count({ pages: [120, 300, 7] })).toBe(2);
        expect(await count({ pages: { [Op.in]: [] } })).toBe(0);
        expect(await count({ pages: { [Op.notIn]: [120] } })).toBe(2);
        expect(await count({ pages: { [Op.ne]: 120 } })).toBe(2);
        expect(await count({ pages: null })).toBe(1);
        expect(await count({ pages: { [Op.is]: null } })).toBe(1);
        expect(await count({ pages: { [Op.not]: null } })).toBe(3);
        expect(await count({ pages: { [Op.between]: [100, 260] } })).toBe(2);
        expect(await count({ pages: { [Op.notBetween]: [100, 260] } })).toBe(1);
        expect(await count({ title: { [Op.like]: 'Comp%' } })).toBe(2);
        expect(await count({ title: { [Op.notLike]: '%Engine' } })).toBe(2);
        expect(await count({ title: { [Op.iLike]: '%engine%' } })).toBe(2);
        expect(await count({ title: { [Op.startsWith]: 'The' } })).toBe(1);
        expect(await count({ title: { [Op.endsWith]: 'Engine' } })).toBe(2);
        expect(await count({ title: { [Op.substring]: 'puting' } })).toBe(1);
        expect(await count({ [Op.or]: [{ pages: 120 }, { rating: 5 }] })).toBe(2);
        expect(await count({ [Op.or]: { pages: 120, rating: 5 } })).toBe(2);
        expect(await count({ [Op.and]: [{ pages: { [Op.gt]: 100 } }, { rating: { [Op.lt]: 4 } }] })).toBe(1);
        expect(await count({ [Op.not]: { pages: 120 } })).toBe(3);
        expect(await count({ pages: { [Op.or]: [120, { [Op.gt]: 280 }] } })).toBe(2);
        expect(await count({ rating: { [Op.gt]: Sequelize.col('pages') } })).toBe(0);
        expect(await Author.count({ where: { active: false } })).toBe(1);
        expect(await Author.count({ where: { '$publisher.name$': 'Penguin' }, include: ['publisher'] })).toBe(2);
      });

      it('filters by values inside JSON attributes', async () => {
        const { Book } = models;
        const { ada } = await seed();
        await Book.bulkCreate([
          { title: 'J1', authorId: ada.id, data: { meta: { lang: 'en', year: 1990 }, flags: ['a'] } },
          { title: 'J2', authorId: ada.id, data: { meta: { lang: 'es', year: 2001 } } },
        ]);
        const count = (where) => Book.count({ where });
        expect(await count({ data: { meta: { lang: 'en' } } })).toBe(1);
        expect(await count({ data: { meta: { year: { [Op.gt]: 1995 } } } })).toBe(1);
        expect(await count({ 'data.meta.lang': 'es' })).toBe(1);
        expect(await count({ 'data.meta.year': { [Op.between]: [1980, 2010] } })).toBe(2);
        expect(await count({ data: { meta: { lang: ['en', 'es'] } } })).toBe(2);
        expect(await count(Sequelize.json('data.meta.lang', 'en'))).toBe(1);
        expect(await count({ [Op.and]: [Sequelize.where(Sequelize.json('data.meta.year'), Op.lt, 2000)] })).toBe(1);
        expect(await count(Sequelize.where(Sequelize.col('pages'), '>', 200))).toBe(2);
        expect(await count({ data: { flags: { 0: 'a' } } })).toBe(1);
      });

      it('takes literals and functions in conditions, orders and attributes', async () => {
        const { Book, Author } = models;
        await seed();
        const { fn, col, literal, where } = Sequelize;
        const count = (condition) => Book.count({ where: condition });
        expect(await count(literal('pages > 200'))).toBe(2);
        expect(await count({ [Op.and]: [literal('"Book".pages > 200'), { rating: { [Op.lt]: 4 } }] })).toBe(1);
        expect(await count(where(fn('lower', col('title')), 'compilers'))).toBe(1);
        expect(await count(where(fn('length', col('title')), { [Op.gt]: 20 }))).toBe(1);
        expect(await count({ pages: { [Op.gt]: literal('100 + 100') } })).toBe(2);
        expect(await count({ title: { [Op.regexp]: '^Comp' } })).toBe(2);
        expect(await count({ title: { [Op.notRegexp]: 'Engine$' } })).toBe(2);
        expect(await count({ pages: { [Op.eq]: { [Op.any]: [120, 300] } } })).toBe(2);
        const books = await Book.findAll({
          where: { pages: { [Op.ne]: null } },
          order: [[fn('length', col('title')), 'DESC']],
        });
        expect(books[0].title).toBe('The Analytical Engine');
        const ordered = await Book.findAll({ where: { pages: { [Op.ne]: null } }, order: literal('pages DESC') });
        expect(ordered.map((book) => book.pages)).toEqual([300, 250, 120]);
        const [author] = await Author.findAll({
          attributes: {
            include: [
              [literal('(SELECT COUNT(*) FROM "books" WHERE "books"."author_id" = "Author"."id")'), 'books'],
              [fn('upper', col('name')), 'upper'],
            ],
          },
          where: { name: 'Ada' },
        });
        expect(Number(author.get('books'))).toBe(2);
        expect(author.get('upper')).toBe('ADA');
      });

      it('orders, limits and selects attributes', async () => {
        const { Book, Author } = models;
        await seed();
        expect(titles(await Book.findAll({ order: [['pages', 'DESC']], where: { pages: { [Op.ne]: null } } }))).toEqual(
          ['The Analytical Engine', 'Compilers', 'Notes on the Engine']
        );
        expect(titles(await Book.findAll({ order: ['title'], limit: 2, offset: 1 }))).toEqual([
          'Computing Machinery',
          'Notes on the Engine',
        ]);
        const books = await Book.findAll({ attributes: ['id', 'title'], order: [['title', 'ASC']] });
        expect(Object.keys(books[0].dataValues).sort()).toEqual(['id', 'title']);
        const renamed = await Book.findAll({ attributes: [['title', 'name']], order: [['title', 'ASC']], limit: 1 });
        expect(renamed[0].get('name')).toBe('Compilers');
        const excluded = await Author.findOne({ attributes: { exclude: ['email', 'createdAt', 'updatedAt'] } });
        expect(excluded.dataValues.email).toBeUndefined();
        expect(excluded.dataValues.name).toBeDefined();
        const ordered = await Book.findAll({
          include: ['author'],
          order: [
            ['author', 'name', 'DESC'],
            ['title', 'ASC'],
          ],
        });
        expect(ordered.map((book) => book.author.name)).toEqual(['Grace', 'Alan', 'Ada', 'Ada']);
        const raw = await Book.findAll({ raw: true, where: { title: 'Compilers' } });
        expect(raw[0].constructor === Object || Object.getPrototypeOf(raw[0]) === null).toBe(true);
        expect(raw[0].title).toBe('Compilers');
      });

      it('finds one, by key, and counts', async () => {
        const { Book, Author } = models;
        const { ada } = await seed();
        expect((await Author.findByPk(ada.id)).name).toBe('Ada');
        expect(await Author.findByPk(99999)).toBeNull();
        expect(await Author.findByPk(null)).toBeNull();
        expect((await Book.findOne({ where: { pages: 300 } })).title).toBe('The Analytical Engine');
        expect(await Book.findOne({ where: { pages: 1 } })).toBeNull();
        await expect(Book.findOne({ where: { pages: 1 }, rejectOnEmpty: true })).rejects.toBeInstanceOf(
          EmptyResultError
        );
        const { count, rows } = await Book.findAndCountAll({ where: { pages: { [Op.gt]: 100 } }, limit: 1 });
        expect(count).toBe(3);
        expect(rows).toHaveLength(1);
        expect(await Book.max('pages')).toBe(300);
        expect(await Book.min('pages')).toBe(120);
        expect(Number(await Book.sum('pages'))).toBe(670);
        const groups = await Book.count({ group: ['authorId'] });
        expect(groups.find((group) => group.authorId === ada.id).count).toBe(2);
        const stats = await Book.findAll({
          attributes: ['authorId', [Sequelize.fn('COUNT', Sequelize.col('id')), 'books']],
          group: ['authorId'],
          order: [['authorId', 'ASC']],
        });
        expect(stats.find((row) => row.get('authorId') === ada.id).get('books')).toBe(2);
      });
    });

    describe('associations', () => {
      it('includes belongsTo (joined), with conditions and nested', async () => {
        const { Book, Author, Publisher } = models;
        await seed();
        const books = await Book.findAll({ include: [{ model: Author, as: 'author' }], order: [['title', 'ASC']] });
        expect(books[0].author.name).toBe('Grace');
        expect(books[0].get('author')).toBe(books[0].author);
        const nested = await Book.findAll({
          include: [{ model: Author, as: 'author', include: [{ model: Publisher, as: 'publisher' }] }],
          order: [['title', 'ASC']],
        });
        expect(nested[0].author.publisher).toBeNull();
        expect(nested[1].author.publisher.name).toBe('Penguin');
        const filtered = await Book.findAll({ include: [{ model: Author, as: 'author', where: { name: 'Ada' } }] });
        expect(filtered).toHaveLength(2);
        const json = filtered[0].toJSON();
        expect(json.author.name).toBe('Ada');
        const authors = await Author.findAll({ include: [{ association: 'publisher', required: true }] });
        expect(authors.map((author) => author.name).sort()).toEqual(['Ada', 'Alan']);
      });

      it('includes hasMany, hasOne and belongsToMany', async () => {
        const { Author, Book, Profile, Tag } = models;
        const { ada } = await seed();
        await Profile.create({ bio: 'Mathematician', authorId: ada.id });
        const authors = await Author.findAll({ include: ['books', 'profile'], order: [['name', 'ASC']] });
        expect(authors.map((author) => author.books.length)).toEqual([2, 1, 1]);
        expect(authors[0].profile.bio).toBe('Mathematician');
        expect(authors[1].profile).toBeNull();
        const sorted = await Author.findAll({
          include: ['books'],
          order: [
            ['name', 'ASC'],
            ['books', 'pages', 'DESC'],
          ],
        });
        expect(sorted[0].books.map((book) => book.pages)).toEqual([300, 120]);
        // limit of a separate include: the first rows of each parent, by a window of the query.
        const logged = [];
        const firsts = await Author.findAll({
          include: [{ model: Book, as: 'books', separate: true, limit: 1, order: [['pages', 'ASC']] }],
          order: [['name', 'ASC']],
          logging: (sql) => logged.push(sql),
        });
        expect(firsts.map((author) => author.books.map((item) => item.pages))).toEqual([[120], [null], [250]]);
        expect(logged.some((sql) => /ROW_NUMBER\(\) OVER \(PARTITION BY/.test(sql))).toBe(true);
        const withLong = await Author.findAll({
          include: [{ model: Book, as: 'books', where: { pages: { [Op.gte]: 250 } } }],
        });
        expect(withLong.map((author) => author.name).sort()).toEqual(['Ada', 'Grace']);
        expect(withLong.find((author) => author.name === 'Ada').books.map((book) => book.pages)).toEqual([300]);
        const book = await Book.findOne({ where: { title: 'Compilers' } });
        const [math, code] = await Tag.bulkCreate([{ name: 'math' }, { name: 'code' }]);
        await book.addTags([math, code]);
        await book.addTag(math);
        expect(await book.countTags()).toBe(2);
        expect(await book.hasTag(code)).toBe(true);
        const loaded = await Book.findOne({ where: { id: book.id }, include: ['tags'] });
        expect(loaded.tags.map((tag) => tag.name).sort()).toEqual(['code', 'math']);
        expect(loaded.tags[0].BookTags.bookId).toBe(book.id);
        const tagged = await Tag.findAll({
          include: [{ association: 'books', include: ['author'] }],
          order: [['name', 'ASC']],
        });
        expect(tagged[0].books[0].author.name).toBe('Grace');
        await book.removeTag(math);
        expect((await book.getTags()).map((tag) => tag.name)).toEqual(['code']);
        await book.setTags([math]);
        expect((await book.getTags()).map((tag) => tag.name)).toEqual(['math']);
        expect(await Book.count({ include: [{ association: 'tags', where: { name: 'math' } }] })).toBe(1);
      });

      it('has the accessors of Sequelize', async () => {
        const { Author, Book, Publisher, Note } = models;
        const { ada, grace, penguin } = await seed();
        const book = await Book.findOne({ where: { title: 'Compilers' } });
        expect((await book.getAuthor()).name).toBe('Grace');
        await book.setAuthor(ada);
        expect((await Book.findByPk(book.id)).authorId).toBe(ada.id);
        expect(await ada.countBooks()).toBe(3);
        expect((await ada.getBooks({ where: { pages: { [Op.gt]: 200 } } })).length).toBe(2);
        const created = await grace.createBook({ title: 'COBOL' });
        expect(created.authorId).toBe(grace.id);
        expect(await grace.hasBook(created)).toBe(true);
        expect((await penguin.getAuthors()).length).toBe(2);
        await penguin.removeAuthor(ada);
        expect(await penguin.countAuthors()).toBe(1);
        const profile = await ada.createProfile({ bio: 'x' });
        expect((await ada.getProfile()).id).toBe(profile.id);
        const note = await Note.create({ text: 'n', AuthorId: ada.id });
        expect((await note.getAuthor()).id).toBe(ada.id);
        expect(await Publisher.count()).toBe(1);
        expect(await Author.count()).toBe(3);
      });

      it('deletes in the database as onDelete says', async () => {
        const { Author, Book, Publisher } = models;
        const { ada, penguin } = await seed();
        await Author.destroy({ where: { id: ada.id } });
        expect(await Book.count({ where: { authorId: ada.id } })).toBe(0);
        await penguin.destroy();
        expect(await Author.count({ where: { publisherId: null } })).toBe(2);
        expect(await Publisher.count()).toBe(0);
      });
    });

    describe('writing', () => {
      it('saves SQL expressions, checks versions and keeps keys set', async () => {
        const Counter = sequelize.define('Counter', { n: DataTypes.INTEGER, m: DataTypes.INTEGER }, { version: true });
        await Counter.sync({ force: true });
        const counter = await Counter.create({ n: sequelize.literal('2 + 3'), m: 1 });
        await counter.reload();
        expect(counter.n).toBe(5);
        expect(counter.version).toBe(0);
        counter.set({ m: sequelize.col('n'), id: 99 });
        expect(counter.id).not.toBe(99);
        await counter.save();
        await counter.reload();
        expect(counter.m).toBe(5);
        expect(counter.version).toBe(1);
        const stale = await Counter.findByPk(counter.id);
        await counter.update({ n: 6 });
        await expect(stale.update({ n: 7 })).rejects.toBeInstanceOf(Sequelize.OptimisticLockError);
      });

      it('updates and destroys in bulk, with hooks', async () => {
        const { Book, Author } = models;
        const { ada } = await seed();
        const [count] = await Book.update({ rating: 1 }, { where: { authorId: ada.id } });
        expect(count).toBe(2);
        expect(await Book.count({ where: { rating: 1 } })).toBe(2);
        await expect(Book.update({ pages: 0 }, { where: {} })).rejects.toBeInstanceOf(ValidationError);
        const seen = [];
        const hook = (author) => seen.push(author.name);
        Author.addHook('beforeUpdate', 'track', hook);
        await Author.update({ active: false }, { where: { name: 'Ada' }, individualHooks: true });
        Author.removeHook('beforeUpdate', 'track');
        expect(seen).toEqual(['Ada']);
        expect(await Book.destroy({ where: { pages: { [Op.lt]: 200 } } })).toBe(1);
        await expect(Book.destroy()).rejects.toThrow('Missing where');
      });

      it('bulk creates with validation, and finds or creates', async () => {
        const { Author, Tag } = models;
        const tags = await Tag.bulkCreate([{ name: 'a' }, { name: 'b' }]);
        expect(tags.map((tag) => typeof tag.id)).toEqual(['number', 'number']);
        // As Sequelize 6: an AggregateError with a BulkRecordError (its ValidationError and record) for each record.
        const bulk = await Author.bulkCreate([{ name: 'x' }, { name: 'Ok' }], { validate: true }).catch((err) => err);
        expect(bulk.name).toBe('AggregateError');
        expect(bulk.errors).toHaveLength(1);
        expect(bulk.errors[0].errors).toBeInstanceOf(ValidationError);
        expect(bulk.errors[0].record.name).toBe('x');
        const [first, created] = await Tag.findOrCreate({ where: { name: 'c' } });
        expect(created).toBe(true);
        const [again, createdAgain] = await Tag.findOrCreate({ where: { name: 'c' } });
        expect(createdAgain).toBe(false);
        expect(again.id).toBe(first.id);
        // As Sequelize 6 in SQLite and PostgreSQL: [instance, null].
        const [upserted, created1] = await Tag.upsert({ name: 'd' });
        expect(created1).toBeNull();
        expect(typeof upserted.id).toBe('number');
        const [updated, created2] = await Tag.upsert({ id: upserted.id, name: 'e' });
        expect(created2).toBeNull();
        expect(updated.name).toBe('e');
        expect(updated.id).toBe(upserted.id);
        // By a unique attribute.
        await Tag.upsert({ name: 'e' });
        await Tag.bulkCreate([{ name: 'a' }, { name: 'z' }], { ignoreDuplicates: true });
        await Tag.bulkCreate([{ name: 'z' }], { updateOnDuplicate: ['name'] });
        expect(await Tag.count()).toBe(5);
        expect(await Tag.count({ where: { name: 'z' } })).toBe(1);
      });

      it('runs hooks', async () => {
        const { Tag } = models;
        const events = [];
        Tag.beforeCreate((tag) => {
          events.push(`before ${tag.name}`);
          tag.name = tag.name.toUpperCase();
        });
        Tag.afterCreate('after', (tag) => events.push(`after ${tag.name}`));
        Tag.addHook('beforeBulkCreate', (items) => events.push(`bulk ${items.length}`));
        const tag = await Tag.create({ name: 'x' });
        await Tag.bulkCreate([{ name: 'y' }]);
        Tag.xufaHooks = {};
        expect(tag.name).toBe('X');
        expect(events).toEqual(['before x', 'after X', 'bulk 1']);
      });

      it('soft deletes paranoid models', async () => {
        const { Note } = models;
        const note = await Note.create({ text: 'a' });
        await Note.create({ text: 'b' });
        await note.destroy();
        expect(note.isSoftDeleted()).toBe(true);
        expect(await Note.count()).toBe(1);
        expect(await Note.count({ paranoid: false })).toBe(2);
        expect(await Note.findByPk(note.id)).toBeNull();
        await note.restore();
        expect(await Note.count()).toBe(2);
        await Note.destroy({ where: { text: 'b' } });
        expect(await Note.count()).toBe(1);
        await Note.restore({ where: { text: 'b' } });
        expect(await Note.count()).toBe(2);
        await Note.destroy({ where: {}, force: true });
        expect(await Note.count({ paranoid: false })).toBe(0);
      });

      it('applies scopes', async () => {
        const { Author } = models;
        await seed();
        Author.addScope('defaultScope', { where: { active: true } });
        Author.addScope('named', (name) => ({ where: { name } }));
        Author.addScope('withBooks', { include: ['books'] });
        try {
          expect(await Author.count()).toBe(2);
          expect(await Author.unscoped().count()).toBe(3);
          expect(await Author.scope({ method: ['named', 'Grace'] }).count()).toBe(1);
          const [ada] = await Author.scope('defaultScope', 'withBooks').findAll({ where: { name: 'Ada' } });
          expect(ada.books).toHaveLength(2);
        } finally {
          Author.xufaScope = null;
        }
      });
    });

    describe('transactions', () => {
      it('commits and rolls back managed transactions', async () => {
        const { Tag } = models;
        let committed = false;
        await sequelize.transaction(async (t) => {
          t.afterCommit(() => {
            committed = true;
          });
          await Tag.create({ name: 'in' }, { transaction: t });
          expect(await Tag.count({ transaction: t })).toBe(1);
        });
        expect(committed).toBe(true);
        await expect(
          sequelize.transaction(async (t) => {
            await Tag.create({ name: 'out' }, { transaction: t });
            throw new Error('rollback');
          })
        ).rejects.toThrow('rollback');
        expect((await Tag.findAll()).map((tag) => tag.name)).toEqual(['in']);
      });

      it('commits and rolls back transactions that are not managed', async () => {
        const { Tag } = models;
        const t = await sequelize.transaction();
        await Tag.create({ name: 'kept' }, { transaction: t });
        await t.commit();
        const other = await sequelize.transaction();
        await Tag.create({ name: 'lost' }, { transaction: other });
        expect(await Tag.count({ transaction: other })).toBe(2);
        await other.rollback();
        expect((await Tag.findAll()).map((tag) => tag.name)).toEqual(['kept']);
        await expect(Tag.count({ transaction: other })).rejects.toThrow('rollback has been called');
      });
    });

    describe('models without a primary key', () => {
      it('makes tables without one, and writes their rows with where', async () => {
        const Log = sequelize.define('NoKeyLog', { level: DataTypes.STRING, hits: DataTypes.INTEGER });
        Log.removeAttribute('id');
        const Owner = sequelize.define('NoKeyOwner', { username: { type: DataTypes.STRING, unique: true } });
        Owner.removeAttribute('id');
        const Task = sequelize.define('NoKeyTask', { title: DataTypes.STRING });
        Task.belongsTo(Owner, { foreignKey: 'ownerName', targetKey: 'username' });
        await Log.sync({ force: true });
        await Owner.sync({ force: true });
        await Task.sync({ force: true });
        const columns = await sequelize.getQueryInterface().describeTable(Log.tableName);
        expect(Object.keys(columns).sort()).toEqual(['createdAt', 'hits', 'level', 'updatedAt']);
        const log = await Log.create({ level: 'info', hits: 1 });
        await Log.bulkCreate([
          { level: 'error', hits: 2 },
          { level: 'error', hits: 3 },
        ]);
        const logs = await Log.findAll({ order: [['hits', 'ASC']] });
        expect(logs.map((item) => [item.level, item.get('id')])).toEqual([
          ['info', undefined],
          ['error', undefined],
          ['error', undefined],
        ]);
        expect(await Log.update({ hits: 9 }, { where: { level: 'error' } })).toEqual([2]);
        expect(await Log.count({ where: { hits: 9 } })).toBe(2);
        // An instance cannot be found again: it is only created.
        log.hits = 5;
        await expect(log.save()).rejects.toThrow('has no primary key');
        await expect(log.destroy()).rejects.toThrow('has no primary key');
        await expect(log.reload()).rejects.toThrow('has no primary key');
        expect(await Log.destroy({ where: { level: 'info' } })).toBe(1);
        expect(await Log.count()).toBe(2);
        // A belongsTo to one of them, by a unique key.
        const bob = await Owner.create({ username: 'bob' });
        const task = await Task.create({ title: 'write' });
        await task.setNoKeyOwner(bob);
        const found = await Task.findOne({ where: { title: 'write' }, include: [Owner] });
        expect(found.NoKeyOwner.username).toBe('bob');
        expect((await found.getNoKeyOwner()).username).toBe('bob');
        await Task.drop();
        await Owner.drop();
        await Log.drop();
      });
    });

    describe('raw queries', () => {
      it('runs SQL with replacements and binds', async () => {
        const { Tag } = models;
        await Tag.bulkCreate([{ name: 'a' }, { name: 'b' }, { name: 'c' }]);
        const select = Sequelize.QueryTypes.SELECT;
        const named = await sequelize.query('SELECT name FROM "Tags" WHERE name IN (:names) ORDER BY name', {
          replacements: { names: ['a', 'c'] },
          type: select,
        });
        expect(named.map((row) => row.name)).toEqual(['a', 'c']);
        const positional = await sequelize.query('SELECT name FROM "Tags" WHERE name = ? AND name <> \'?\'', {
          replacements: ['b'],
          type: select,
        });
        expect(positional).toHaveLength(1);
        const bound = await sequelize.query('SELECT name FROM "Tags" WHERE name = $name OR name = $name', {
          bind: { name: 'a' },
          type: select,
        });
        expect(bound).toHaveLength(1);
        const mapped = await sequelize.query('SELECT * FROM "Tags" ORDER BY name', { model: Tag, mapToModel: true });
        expect(mapped[0]).toBeInstanceOf(Tag);
        expect(mapped[0].name).toBe('a');
        const [rows] = await sequelize.query('SELECT COUNT(*) AS n FROM "Tags"');
        expect(Number(rows[0].n)).toBe(3);
      });
    });
  });
}

module.exports = { defineSuite };
