// The behavior of Sequelize on every dialect: the same models and operations give the same results in SQLite and
// PostgreSQL. Each test file calls defineSuite with a function that makes a Sequelize of its dialect.
import {
  DataTypes,
  Op,
  ValidationError,
  UniqueConstraintError,
  ForeignKeyConstraintError,
  EmptyResultError,
} from '../index.js';
import { Sequelize } from '../index.js';

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
        // Virtual attributes in the order of the attributes (as Sequelize 7).
        expect(Object.keys(json).slice(0, 5)).toEqual(['id', 'name', 'email', 'active', 'fullName']);
        // A saved instance built again from its JSON keeps its timestamps (as Sequelize 7).
        const rebuilt = Author.build(found.toJSON(), { isNewRecord: false });
        expect(rebuilt.createdAt).toEqual(found.createdAt);
        expect(rebuilt.updatedAt).toEqual(found.updatedAt);
        rebuilt.set('createdAt', new Date(0));
        expect(rebuilt.createdAt).toEqual(found.createdAt);
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
        if (sequelize.getDialect() === 'postgres') {
          expect(missing.fields).toEqual(['author_id']);
          expect(missing.value).toEqual(['99999']);
        }
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
        // Keys named as lookups or with __, keys in double quotes (dots in them), and indexes up to 2^31 - 1.
        await Book.create({ title: 'J3', authorId: ada.id, data: { in: 1, a__b: 2, 'x.y': 3, '': 4, list: [5] } });
        expect(await count({ data: { in: 1 } })).toBe(1);
        expect(await count({ 'data.in': { [Op.gte]: 1 } })).toBe(1);
        expect(await count({ data: { a__b: 2 } })).toBe(1);
        expect(await count({ data: { '"x.y"': 3 } })).toBe(1);
        expect(await count({ 'data."x.y"': 3 })).toBe(1);
        expect(await count({ 'data.""': 4 })).toBe(1);
        expect(await count({ 'data.list[0]::integer': 5 })).toBe(1);
        expect(await count(Sequelize.json('data."x.y"', 3))).toBe(1);
        await expect(Book.count({ where: { data: { 'list[2147483648]': 1 } } })).rejects.toThrow('indexes go up to');
        await expect(Book.count({ where: { data: { 'level::123': 1 } } })).rejects.toThrow('Invalid cast type');
        await expect(Book.count({ where: { data: { 'a..b': 1 } } })).rejects.toThrow('Invalid json path');
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
        // create with ignoreDuplicates: no error, nor a key, for a row that is there.
        const ignored = await Tag.create({ name: 'z' }, { ignoreDuplicates: true });
        expect(ignored.isNewRecord).toBe(false);
        expect(ignored.id).toBeNull();
        expect(await Tag.count()).toBe(5);
      });

      it('upserts what beforeUpsert changes', async () => {
        const { Tag } = models;
        Tag.addHook('beforeUpsert', (values) => {
          values.name = `${values.name}!`;
        });
        try {
          const [tag] = await Tag.upsert({ name: 'hooked' });
          expect(tag.name).toBe('hooked!');
          expect(await Tag.count({ where: { name: 'hooked!' } })).toBe(1);
        } finally {
          Tag.xufaHooks = {};
        }
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

    describe('query interface rows', () => {
      const qi = () => sequelize.getQueryInterface();

      it('inserts, selects, upserts and deletes rows', async () => {
        const { Tag } = models;
        const [row] = await qi().insert(null, 'Tags', { name: 'a' });
        expect(row.name).toBe('a');
        await qi().bulkInsert('Tags', [{ name: 'b' }, { name: 'c' }]);
        const rows = await qi().select(null, 'Tags', { where: { name: { [Op.ne]: 'a' } }, order: [['name', 'DESC']] });
        expect(rows.map((item) => item.name)).toEqual(['c', 'b']);
        const page = await qi().select(Tag, 'Tags', { order: [['name', 'ASC']], offset: 1 });
        expect(page[0]).toBeInstanceOf(Tag);
        expect(page.map((item) => item.name)).toEqual(['b', 'c']);
        const [upserted] = await qi().upsert(
          'Tags',
          { id: row.id, name: 'z' },
          { name: 'z' },
          { id: row.id },
          { model: Tag }
        );
        expect(upserted).toBeInstanceOf(Tag);
        expect((await Tag.findByPk(row.id)).name).toBe('z');
        await qi().delete(null, 'Tags', { name: 'z' });
        expect(await Tag.count()).toBe(2);
      });

      it('selects instances by the columns of their attributes', async () => {
        const { Book } = models;
        const { ada } = await seed();
        const books = await qi().select(Book, 'books', { where: { author_id: ada.id }, order: [['pages', 'ASC']] });
        expect(books.map((book) => [book.title, book.authorId])).toEqual([
          ['Notes on the Engine', ada.id],
          ['The Analytical Engine', ada.id],
        ]);
      });

      it('increments columns and reads single values', async () => {
        const { Book } = models;
        const { ada } = await seed();
        await qi().increment(Book, 'books', { author_id: ada.id }, { pages: 10 }, {});
        await qi().decrement(Book, 'books', { title: 'Compilers' }, { pages: 50 });
        const max = await qi().rawSelect(
          'books',
          { attributes: [[sequelize.fn('max', sequelize.col('pages')), 'max']], dataType: DataTypes.INTEGER },
          'max'
        );
        expect(max).toBe(310);
        expect(Number(await qi().rawSelect('books', { where: { title: 'Compilers' } }, 'pages'))).toBe(200);
      });

      it('names the foreign keys of tables and quotes identifiers', async () => {
        const keys = await qi().getForeignKeysForTables(['books']);
        expect(Array.isArray(keys.books)).toBe(true);
        if (name === 'postgres') expect(keys.books.length).toBeGreaterThan(0);
        expect(qi().quoteIdentifiers('a.b')).toBe('"a"."b"');
      });
    });

    describe('changeColumns (Sequelize 7)', () => {
      it('changes only what is given, of several columns', async () => {
        const qi = sequelize.getQueryInterface();
        await qi.createTable('changed_columns', {
          id: { type: DataTypes.INTEGER, primaryKey: true },
          a: { type: DataTypes.STRING, allowNull: false, defaultValue: 'x' },
          b: { type: DataTypes.INTEGER, defaultValue: 3 },
        });
        try {
          await qi.changeColumns('changed_columns', { a: { type: DataTypes.TEXT }, b: { allowNull: false } });
          let columns = await qi.describeTable('changed_columns');
          expect(columns.a).toMatchObject({ type: 'TEXT', allowNull: false, defaultValue: 'x' });
          expect(columns.b).toMatchObject({ allowNull: false });
          expect(String(columns.b.defaultValue)).toBe('3');
          await qi.changeColumns('changed_columns', { b: { dropDefaultValue: true } });
          columns = await qi.describeTable('changed_columns');
          expect(columns.b.defaultValue ?? null).toBeNull();
          await expect(
            qi.changeColumns('changed_columns', { c: DataTypes.STRING, d: DataTypes.STRING })
          ).rejects.toThrow("doesn't have the columns c, d");
        } finally {
          await qi.dropTable('changed_columns');
        }
      });
    });

    describe('names and indexes (Sequelize 7)', () => {
      it('orders parents by the rows of includes several levels down, with limits', async () => {
        const Continent = sequelize.define('Continent', { name: DataTypes.STRING });
        const Country = sequelize.define('Country', { name: DataTypes.STRING });
        const Person = sequelize.define('Person', { lastName: DataTypes.STRING });
        const Label = sequelize.define('Label', { text: DataTypes.STRING });
        Continent.hasMany(Country);
        Country.hasMany(Person, { as: 'residents' });
        Person.belongsToMany(Label, { through: 'PersonLabels' });
        await Continent.sync({ force: true });
        await Country.sync({ force: true });
        await Person.sync({ force: true });
        await Label.sync({ force: true });
        await sequelize.models.PersonLabels.sync({ force: true });
        try {
          // Inserted so that the first continent is not the one of the first resident.
          const [asia, europe] = await Continent.bulkCreate([{ name: 'Asia' }, { name: 'Europe' }]);
          const [china, france] = await Country.bulkCreate([
            { name: 'China', ContinentId: asia.id },
            { name: 'France', ContinentId: europe.id },
          ]);
          const [zhang, adams] = await Person.bulkCreate([
            { lastName: 'Zhang', CountryId: china.id },
            { lastName: 'Adams', CountryId: france.id },
          ]);
          const [z, a] = await Label.bulkCreate([{ text: 'z' }, { text: 'a' }]);
          await zhang.addLabel(a);
          await adams.addLabel(z);
          const include = [{ model: Country, include: [{ model: Person, as: 'residents', include: [Label] }] }];
          const names = async (path, direction) =>
            (await Continent.findAll({ include, order: [[...path, direction]], limit: 5 })).map((row) => row.name);
          const byResident = [{ model: Country }, { model: Person, as: 'residents' }, 'lastName'];
          const byLabel = [{ model: Country }, { model: Person, as: 'residents' }, { model: Label }, 'text'];
          expect(await names(byResident, 'ASC')).toEqual(['Europe', 'Asia']);
          expect(await names(byResident, 'DESC')).toEqual(['Asia', 'Europe']);
          expect(await names(byLabel, 'ASC')).toEqual(['Asia', 'Europe']);
          expect(await names(byLabel, 'DESC')).toEqual(['Europe', 'Asia']);
        } finally {
          await sequelize.models.PersonLabels.drop();
          await Label.drop();
          await Person.drop();
          await Country.drop();
          await Continent.drop();
        }
      });

      it('takes attribute names with __ (the separator of paths of @xufa/orm)', async () => {
        const Spaced = sequelize.define('Spaced', { a__b: DataTypes.STRING, n__count: DataTypes.INTEGER });
        await Spaced.sync({ force: true });
        try {
          await Spaced.bulkCreate([
            { a__b: 'v', n__count: 3 },
            { a__b: 'w', n__count: 5 },
          ]);
          expect(await Spaced.count({ where: { a__b: 'v' } })).toBe(1);
          expect(await Spaced.count({ where: { n__count: { [Op.gt]: 4 } } })).toBe(1);
          expect((await Spaced.findAll({ order: [['n__count', 'DESC']] })).map((row) => row.a__b)).toEqual(['w', 'v']);
          const [made, created] = await Spaced.findOrCreate({ where: { a__b: 'x' }, defaults: { n__count: 1 } });
          expect([made.a__b, created]).toEqual(['x', true]);
          expect(await Spaced.sum('n__count')).toBe(9);
        } finally {
          await Spaced.drop();
        }
      });

      it('takes attribute names with any character in conditions and orders', async () => {
        const Odd = sequelize.define('Odd', {
          'first-name': DataTypes.STRING,
          'a b': DataTypes.STRING,
          café: DataTypes.STRING,
        });
        await Odd.sync({ force: true });
        try {
          await Odd.create({ 'first-name': 'Ada', 'a b': 'x', café: 'y' });
          expect(await Odd.count({ where: { 'first-name': 'Ada', 'a b': 'x', café: { [Op.like]: 'y%' } } })).toBe(1);
          expect((await Odd.findAll({ order: [['café', 'DESC']] })).length).toBe(1);
        } finally {
          await Odd.drop();
        }
      });

      it('describes the order and collation of the fields of indexes', async () => {
        const qi = sequelize.getQueryInterface();
        await qi.createTable('described_indexes', {
          id: { type: DataTypes.INTEGER, primaryKey: true },
          a: DataTypes.STRING,
          b: DataTypes.INTEGER,
        });
        try {
          await qi.addIndex('described_indexes', [{ name: 'a', order: 'DESC' }, 'b'], { name: 'described_ab' });
          const index = (await qi.showIndex('described_indexes')).find((item) => item.name === 'described_ab');
          // The keys of Sequelize 6 (with the order in PostgreSQL); the name of Sequelize 7 is not enumerable.
          expect(index.fields.map((field) => [field.attribute, field.name])).toEqual([
            ['a', 'a'],
            ['b', 'b'],
          ]);
          const postgres = sequelize.getDialect() === 'postgres';
          expect(Object.keys(index.fields[0]).sort()).toEqual(
            postgres ? ['attribute', 'collate', 'length', 'order'] : ['attribute', 'length', 'order']
          );
          expect(index.fields[0].order).toBe(postgres ? 'DESC' : undefined);
          // showIndexes (Sequelize 7): the order of every field, in SQLite too.
          const info = (await qi.showIndexes('described_indexes')).find((item) => item.name === 'described_ab');
          expect(info).toEqual({
            name: 'described_ab',
            ...(postgres ? { method: 'BTREE', includes: [] } : {}),
            unique: false,
            primary: false,
            fields: [
              { name: 'a', order: 'DESC', collate: undefined },
              { name: 'b', order: 'ASC', collate: undefined },
            ],
          });
        } finally {
          await qi.dropTable('described_indexes');
        }
      });
    });

    describe('attributes computed by the database (Sequelize 7)', () => {
      it('selects VIRTUALs made by SQL (include as), in includes too, and exposes runtime attributes', async () => {
        const { literal } = Sequelize;
        const Writer = sequelize.define('Writer', {
          name: DataTypes.STRING,
          essays: DataTypes.VIRTUAL(DataTypes.INTEGER, (as) => [
            literal(`(SELECT COUNT(*) FROM "Essays" e WHERE e."WriterId" = "${as}"."id")`),
            'essays',
          ]),
          loud: DataTypes.VIRTUAL(DataTypes.STRING, (as) => literal(`upper(${as}.name)`)),
        });
        const Essay = sequelize.define('Essay', { title: DataTypes.STRING });
        Writer.hasMany(Essay);
        Essay.belongsTo(Writer, { as: 'author', foreignKey: 'WriterId' });
        await Writer.sync({ force: true });
        await Essay.sync({ force: true });
        try {
          const writer = await Writer.create({ name: 'ada' });
          await Essay.bulkCreate([
            { title: 'a', WriterId: writer.id },
            { title: 'b', WriterId: writer.id },
          ]);
          const [found] = await Writer.findAll({ attributes: ['id', 'essays', 'loud'] });
          expect([Number(found.essays), found.loud]).toEqual([2, 'ADA']);
          // Not selected unless asked for.
          expect((await Writer.findByPk(writer.id)).essays).toBeUndefined();
          const [essay] = await Essay.findAll({
            include: [{ model: Writer, as: 'author', attributes: ['id', 'loud'] }],
          });
          expect(essay.author.loud).toBe('ADA');
          const [withEssays] = await Writer.findAll({ include: [{ model: Essay, attributes: ['id', 'title'] }] });
          expect(withEssays.Essays).toHaveLength(2);
          // Runtime attributes: properties of the instances with enableRuntimeAttributes.
          const attributes = ['id', [literal('7'), 'seven']];
          const [plain] = await Writer.findAll({ attributes });
          expect([plain.get('seven'), plain.seven]).toEqual([7, undefined]);
          const [runtime] = await Writer.findAll({ attributes, enableRuntimeAttributes: true });
          expect(runtime.seven).toBe(7);
          runtime.seven = 8;
          expect(runtime.get('seven')).toBe(8);
        } finally {
          await Essay.drop();
          await Writer.drop();
        }
      });
    });

    describe('the bigint option', () => {
      it('gives BIGINT values as numbers (the default), bigints or strings', async () => {
        const read = async (bigint) => {
          const other = makeSequelize(bigint ? { bigint } : {});
          try {
            const Counter = other.define('BigCounter', {
              id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
              n: DataTypes.BIGINT,
            });
            const Tick = other.define('BigTick', { at: DataTypes.STRING });
            Counter.hasMany(Tick);
            Tick.belongsTo(Counter);
            await Counter.sync({ force: true });
            await Tick.sync({ force: true });
            const small = await Counter.create({ n: 5 });
            await Counter.create({ n: '9007199254740993' });
            await Tick.create({ at: 'now', BigCounterId: small.id });
            const rows = await Counter.findAll({ order: [['id', 'ASC']], include: [Tick] });
            const count = await Counter.count({ where: { n: 9007199254740993n } });
            const tick = await Tick.findOne({ include: [Counter] });
            await Tick.drop();
            await Counter.drop();
            // The keys (BIGINT and autoIncrement) and the foreign keys to them in the same mode; includes find them.
            return [
              small.n,
              rows[0].n,
              rows[1].n,
              count,
              small.id,
              tick.BigCounterId,
              tick.BigCounter.id,
              rows[0].BigTicks.length,
            ];
          } finally {
            await other.close();
          }
        };
        expect(await read()).toEqual([5, 5, 9007199254740993n, 1, 1, 1, 1, 1]);
        expect(await read('bigint')).toEqual([5n, 5n, 9007199254740993n, 1, 1n, 1n, 1n, 1]);
        expect(await read('string')).toEqual(['5', '5', '9007199254740993', 1, '1', '1', '1', 1]);
        expect(() => makeSequelize({ bigint: 'text' })).toThrow('The bigint option is number, bigint or string');
      });
    });

    describe('features of Sequelize 7', () => {
      it('writes SELECTs (queryGenerator.selectQuery) and compares with subqueries (Op.in of a literal)', async () => {
        const { Tag } = models;
        await Tag.bulkCreate([{ name: 'sub-a' }, { name: 'sub-b' }, { name: 'sub-c' }]);
        const generator = sequelize.getQueryInterface().queryGenerator;
        const counted = generator.selectQuery('Tags', {
          attributes: [[Sequelize.literal('count(*)'), 'cnt']],
          where: { name: { [Op.like]: 'sub-%' } },
        });
        expect(counted).toMatch(/^SELECT count\(\*\) AS "cnt" FROM "Tags" AS "Tags" WHERE/);
        expect(Number((await sequelize.query(counted, { plain: true })).cnt)).toBe(3);
        const ids = generator
          .selectQuery('Tags', { attributes: ['id'], where: { name: ['sub-b', 'sub-c'] } })
          .slice(0, -1);
        const inside = await Tag.findAll({
          where: { id: { [Op.in]: Sequelize.literal(`(${ids})`) } },
          order: [['name', 'ASC']],
        });
        expect(inside.map((tag) => tag.name)).toEqual(['sub-b', 'sub-c']);
        const outside = await Tag.findAll({
          where: { name: { [Op.like]: 'sub-%' }, id: { [Op.notIn]: Sequelize.literal(ids) } },
        });
        expect(outside.map((tag) => tag.name)).toEqual(['sub-a']);
      });

      it('finds by several primary keys (findByPks)', async () => {
        const { Tag } = models;
        const tags = await Tag.bulkCreate([{ name: 'pk1' }, { name: 'pk2' }, { name: 'pk3' }]);
        const found = await Tag.findByPks([tags[2].id, tags[0].id, 999999], { order: [['id', 'ASC']] });
        expect(found.map((tag) => tag.name)).toEqual(['pk1', 'pk3']);
        expect(await Tag.findByPks([tags[0].id, tags[1].id], { where: { name: 'pk2' } })).toHaveLength(1);
        expect(await Tag.findByPks([])).toEqual([]);
        await expect(Tag.findByPks(tags[0].id)).rejects.toThrow('takes an array');
        const Pair = sequelize.define('KeyPair', {
          a: { type: DataTypes.INTEGER, primaryKey: true },
          b: { type: DataTypes.INTEGER, primaryKey: true },
        });
        await Pair.sync({ force: true });
        try {
          await Pair.bulkCreate([
            { a: 1, b: 1 },
            { a: 1, b: 2 },
            { a: 2, b: 1 },
          ]);
          const pairs = await Pair.findByPks(
            [
              { a: 1, b: 2 },
              { a: 2, b: 1 },
            ],
            { order: [['a', 'ASC']] }
          );
          expect(pairs.map((pair) => [pair.a, pair.b])).toEqual([
            [1, 2],
            [2, 1],
          ]);
          await expect(Pair.findByPks([1])).rejects.toThrow('are objects of a, b');
        } finally {
          await Pair.drop();
        }
      });

      it('indexes the foreign keys of associations when asked (indexForeignKeys, foreignKey.index)', async () => {
        const indexed = (options) => {
          const other = makeSequelize(options);
          const Writer = other.define('FkWriter', { name: DataTypes.STRING });
          const Note = other.define('FkNote', { text: DataTypes.STRING });
          Note.belongsTo(Writer);
          Note.belongsTo(Writer, { as: 'editor', foreignKey: { name: 'editorId', index: false } });
          Note.belongsTo(Writer, {
            as: 'reviewer',
            foreignKey: { name: 'reviewerId', index: { unique: true, name: 'one_review' } },
          });
          return { other, Note };
        };
        const names = async (options) => {
          const { other, Note } = indexed(options);
          try {
            await other.sync({ force: true });
            const indexes = await other.getQueryInterface().showIndex(Note.tableName);
            await other.drop();
            return indexes
              .filter((index) => !index.primary)
              .map((index) => `${index.name}${index.unique ? '!' : ''}`)
              .sort();
          } finally {
            await other.close();
          }
        };
        expect(await names({})).toEqual(['one_review!']);
        expect(await names({ indexForeignKeys: true })).toEqual(['fk_notes__fk_writer_id', 'one_review!']);
      });

      it('makes STRICT tables of SQLite (strict)', async () => {
        if (sequelize.getDialect() !== 'sqlite') {
          expect(() => sequelize.define('Strict', { a: DataTypes.STRING }, { strict: true })).toThrow(
            'The STRICT tables of SQLite'
          );
          return;
        }
        const Veg = sequelize.define(
          'Veg',
          { name: DataTypes.STRING, n: DataTypes.INTEGER, ok: DataTypes.BOOLEAN, at: DataTypes.DATE },
          { strict: true }
        );
        await Veg.sync({ force: true });
        try {
          const definition = async () =>
            (await sequelize.query("SELECT sql FROM sqlite_master WHERE name = 'Vegs'", { type: 'SELECT' }))[0].sql;
          expect(await definition()).toMatch(/"name" TEXT, "n" INTEGER, "ok" INTEGER, "at" TEXT.*\) STRICT$/);
          const made = await Veg.create({ name: 'a', n: 1, ok: true, at: new Date() });
          const found = await Veg.findByPk(made.id);
          expect([found.ok, found.at instanceof Date]).toEqual([true, true]);
          await expect(
            sequelize.query(`INSERT INTO "Vegs" (name, n, "createdAt", "updatedAt") VALUES ('b', 'x', '', '')`)
          ).rejects.toThrow('cannot store TEXT value in INTEGER column');
          // A table made again for a change stays STRICT.
          await sequelize
            .getQueryInterface()
            .changeColumn('Vegs', 'name', { type: DataTypes.STRING(20), allowNull: false });
          expect(await definition()).toMatch(/\) STRICT$/);
        } finally {
          await Veg.drop();
        }
      });

      it('has generated columns (generatedAs, generatedColumn)', async () => {
        const Line = sequelize.define('Line', {
          price: DataTypes.INTEGER,
          quantity: DataTypes.INTEGER,
          total: { type: DataTypes.INTEGER, allowNull: false, generatedAs: Sequelize.literal('"price" * "quantity"') },
          half: { type: DataTypes.FLOAT, generatedAs: Sequelize.literal('"price" / 2.0'), generatedColumn: 'VIRTUAL' },
        });
        await Line.sync({ force: true });
        try {
          const line = await Line.create({ price: 3, quantity: 4 });
          expect([line.total, line.half]).toEqual([12, 1.5]);
          line.quantity = 5;
          await line.save();
          expect(line.total).toBe(15);
          // Values given for them are not written: the database makes them.
          await Line.bulkCreate([{ price: 10, quantity: 1, total: 999 }]);
          await Line.update({ price: 4 }, { where: { id: line.id } });
          const rows = await Line.findAll({ order: [['id', 'ASC']] });
          expect(rows.map((row) => row.total)).toEqual([20, 10]);
          expect(await Line.count({ where: { total: { [Op.gt]: 15 } } })).toBe(1);
          // sync({ alter }) and changes of the other columns keep them (SQLite makes the table again).
          await Line.sync({ alter: true });
          await sequelize
            .getQueryInterface()
            .changeColumn('Lines', 'price', { type: DataTypes.INTEGER, allowNull: true });
          expect((await Line.findByPk(line.id)).total).toBe(20);
          expect(() =>
            sequelize.define('BadLine', {
              a: { type: DataTypes.INTEGER, generatedAs: Sequelize.literal('1'), defaultValue: 2 },
            })
          ).toThrow('cannot have a defaultValue');
          expect(() =>
            sequelize.define('BadLine', {
              a: { type: DataTypes.INTEGER, generatedAs: Sequelize.literal('1'), generatedColumn: 'X' },
            })
          ).toThrow('is STORED or VIRTUAL');
        } finally {
          await Line.drop();
        }
      });

      it('takes instances of classes as values (their getters)', async () => {
        const Person = sequelize.define('ClassPerson', {
          name: { type: DataTypes.STRING, unique: true },
          age: DataTypes.INTEGER,
        });
        await Person.sync({ force: true });
        try {
          class Input {
            constructor(n) {
              this.n = n;
            }

            get name() {
              return `ada${this.n}`;
            }

            get age() {
              return 36;
            }
          }
          const made = await Person.create(new Input(1));
          expect([made.name, made.age]).toEqual(['ada1', 36]);
          const [upserted] = await Person.upsert(new Input(1));
          expect(upserted.id).toBe(made.id);
          await Person.update(
            new (class {
              get age() {
                return 40;
              }
            })(),
            { where: { id: made.id } }
          );
          expect((await Person.findByPk(made.id)).age).toBe(40);
          expect(Person.build(new Input(2)).name).toBe('ada2');
          expect((await Person.bulkCreate([new Input(3)]))[0].name).toBe('ada3');
        } finally {
          await Person.drop();
        }
      });

      it('sets values and SQL of their own on conflicts (updateOnDuplicate pairs, updateValues, includes)', async () => {
        const Usage = sequelize.define('Usage', {
          actor: { type: DataTypes.STRING, unique: true },
          hits: { type: DataTypes.INTEGER, defaultValue: 1 },
          last: DataTypes.STRING,
        });
        await Usage.sync({ force: true });
        try {
          await Usage.bulkCreate([{ actor: 'a' }, { actor: 'b' }]);
          await Usage.bulkCreate(
            [
              { actor: 'a', last: 'r1' },
              { actor: 'c', last: 'r2' },
            ],
            {
              conflictAttributes: ['actor'],
              updateOnDuplicate: ['last', ['hits', Sequelize.literal('"Usage"."hits" + 1')]],
            }
          );
          await Usage.bulkCreate([{ actor: 'a' }], {
            conflictAttributes: ['actor'],
            updateOnDuplicate: [
              ['hits', Sequelize.literal('"Usages"."hits" + excluded."hits"')],
              ['last', "it's"],
            ],
          });
          const rows = await Usage.findAll({ order: [['actor', 'ASC']] });
          expect(rows.map((row) => [row.actor, row.hits, row.last])).toEqual([
            ['a', 3, "it's"],
            ['b', 1, null],
            ['c', 1, 'r2'],
          ]);
          // upsert: what a row there gets (updateValues), not the values inserted.
          const counted = { updateValues: { hits: Sequelize.literal('"Usage"."hits" + 1') } };
          const [first] = await Usage.upsert({ actor: 'd', last: 'x' }, counted);
          const [second] = await Usage.upsert({ actor: 'd', last: 'y' }, counted);
          expect([first.hits, second.hits, second.last]).toEqual([1, 2, 'y']);
          // updateOnDuplicate of includes, for their rows.
          const Player = sequelize.define('Player', {
            code: { type: DataTypes.STRING, primaryKey: true },
            name: DataTypes.STRING,
          });
          const Team = sequelize.define('Team', {
            code: { type: DataTypes.STRING, primaryKey: true },
            country: DataTypes.STRING,
          });
          Team.hasMany(Player, { as: 'players' });
          await Team.sync({ force: true });
          await Player.sync({ force: true });
          const data = (v) => [{ code: 'T1', country: `ES${v}`, players: [{ code: 'P1', name: `Ann${v}` }] }];
          await Team.bulkCreate(data(1), { include: [{ model: Player, as: 'players' }] });
          await Team.bulkCreate(data(2), {
            updateOnDuplicate: ['country'],
            include: [{ model: Player, as: 'players', updateOnDuplicate: ['name'] }],
          });
          const team = await Team.findByPk('T1', { include: ['players'] });
          expect([team.country, team.players.map((player) => player.name)]).toEqual(['ES2', ['Ann2']]);
          await Player.drop();
          await Team.drop();
        } finally {
          await Usage.drop();
        }
      });

      it('creates targets given as objects to set() and add(), and several at once (createChores)', async () => {
        const Owner = sequelize.define('Owner', { name: DataTypes.STRING });
        const Chore = sequelize.define('Chore', { title: DataTypes.STRING });
        const Badge = sequelize.define('Badge', { label: DataTypes.STRING });
        Owner.hasMany(Chore, { as: 'chores' });
        Owner.belongsToMany(Badge, { through: 'OwnerBadges', as: 'badges' });
        await Owner.sync({ force: true });
        await Chore.sync({ force: true });
        await Badge.sync({ force: true });
        await sequelize.models.OwnerBadges.sync({ force: true });
        try {
          const owner = await Owner.create({ name: 'a' });
          const old = await Chore.create({ title: 'old' });
          await owner.setChores([old, { title: 't1' }]);
          await owner.addChore({ title: 't2' });
          const many = await owner.createChores([{ title: 't3' }, { title: 't4' }]);
          expect(many.map((chore) => typeof chore.id)).toEqual(['number', 'number']);
          const titles = async () => (await owner.getChores({ order: [['id', 'ASC']] })).map((chore) => chore.title);
          expect(await titles()).toEqual(['old', 't1', 't2', 't3', 't4']);
          await owner.setChores([{ title: 'only' }]);
          expect(await titles()).toEqual(['only']);
          await owner.setBadges([{ label: 'admin' }]);
          await owner.addBadges([{ label: 'dev' }, await Badge.create({ label: 'ops' })]);
          const made = await owner.createBadges([{ label: 'qa' }]);
          expect(made[0].label).toBe('qa');
          expect((await owner.getBadges()).map((badge) => badge.label).sort()).toEqual(['admin', 'dev', 'ops', 'qa']);
        } finally {
          await sequelize.models.OwnerBadges.drop();
          await Badge.drop();
          await Chore.drop();
          await Owner.drop();
        }
      });

      it('updates the rows whose includes are there (update with include)', async () => {
        const Writer = sequelize.define('UpdWriter', { name: DataTypes.STRING });
        const Article = sequelize.define('UpdArticle', { title: DataTypes.STRING, flag: DataTypes.STRING });
        const Remark = sequelize.define('UpdRemark', { text: DataTypes.STRING });
        Article.belongsTo(Writer, { as: 'writer' });
        Article.hasMany(Remark, { as: 'remarks' });
        await Writer.sync({ force: true });
        await Article.sync({ force: true });
        await Remark.sync({ force: true });
        try {
          const [john, ann] = await Writer.bulkCreate([{ name: 'John' }, { name: 'Ann' }]);
          const articles = await Article.bulkCreate([
            { title: 'a', writerId: john.id },
            { title: 'b', writerId: ann.id },
            { title: 'c', writerId: john.id },
          ]);
          await Remark.create({ text: 'spam!', UpdArticleId: articles[2].id });
          const [byJohn] = await Article.update(
            { flag: 'john' },
            { where: {}, include: [{ model: Writer, as: 'writer', where: { name: 'John' } }] }
          );
          const [spammed] = await Article.update(
            { flag: 'spam' },
            { where: {}, include: [{ model: Remark, as: 'remarks', where: { text: { [Op.like]: '%spam%' } } }] }
          );
          expect([byJohn, spammed]).toEqual([2, 1]);
          const rows = await Article.findAll({ order: [['title', 'ASC']] });
          expect(rows.map((row) => row.flag)).toEqual(['john', null, 'spam']);
        } finally {
          await Remark.drop();
          await Article.drop();
          await Writer.drop();
        }
      });

      it('makes UUIDs of version 7, in order', async () => {
        const Event = sequelize.define('Event7', {
          id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV7 },
          n: DataTypes.INTEGER,
        });
        await Event.sync({ force: true });
        try {
          const ids = [];
          for (let i = 0; i < 20; i += 1) ids.push((await Event.create({ n: i })).id);
          expect(
            ids.every((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id))
          ).toBe(true);
          expect([...ids].sort()).toEqual(ids);
          const found = await Event.findAll({ order: [['id', 'ASC']] });
          expect(found.map((event) => event.n)).toEqual(ids.map((_, i) => i));
        } finally {
          await Event.drop();
        }
      });

      it('updates rows of conflicts only where a condition holds (onConflictUpdateWhere)', async () => {
        const Score = sequelize.define('Score', {
          name: { type: DataTypes.STRING, unique: true },
          points: DataTypes.INTEGER,
          day: DataTypes.INTEGER,
        });
        await Score.sync({ force: true });
        try {
          await Score.bulkCreate([
            { name: 'a', points: 1, day: 5 },
            { name: 'b', points: 1, day: 1 },
          ]);
          const made = await Score.bulkCreate(
            [
              { name: 'a', points: 9, day: 6 },
              { name: 'b', points: 9, day: 2 },
              { name: 'c', points: 9, day: 9 },
            ],
            {
              conflictAttributes: ['name'],
              updateOnDuplicate: ['points', 'day'],
              onConflictUpdateWhere: { day: { [Op.gte]: 3 } },
            }
          );
          const rows = await Score.findAll({ order: [['name', 'ASC']] });
          expect(rows.map((row) => `${row.name}${row.points}`)).toEqual(['a9', 'b1', 'c9']);
          // The keys of the rows inserted or updated; none for the row left as it was.
          expect(made.map((row) => row.id)).toEqual([rows[0].id, null, rows[2].id]);
          const [kept] = await Score.upsert(
            { name: 'a', points: 2, day: 3 },
            { onConflictUpdateWhere: Sequelize.literal('excluded."points" > "Scores"."points"') }
          );
          expect(kept.points).toBe(9);
          // ignoreDuplicates: the keys of the rows inserted.
          const ignored = await Score.bulkCreate([{ name: 'a' }, { name: 'd' }], { ignoreDuplicates: true });
          expect(ignored[0].id).toBeNull();
          expect(ignored[1].id).toBe((await Score.findOne({ where: { name: 'd' } })).id);
        } finally {
          await Score.drop();
        }
      });
    });

    describe('the rest of the API of Sequelize', () => {
      it('names tables, columns and indexes as Sequelize does (its inflection)', () => {
        const names = {
          User1: 'User1s',
          Task2: 'Task2s',
          Person: 'People',
          Category: 'Categories',
          Status: 'Statuses',
          Leaf: 'Leafs',
          Criterion: 'Criteria',
          Octopus: 'Octopuses',
          Bus: 'Buses',
          Analysis: 'Analyses',
          Equipment: 'Equipment',
          UserXYZ: 'UserXYZs',
        };
        Object.entries(names).forEach(([model, table]) => {
          expect(Sequelize.Utils.pluralize(model)).toBe(table);
          // (inflection gives AnalyAsis for Analyses: Sequelize too.)
          if (model !== 'Analysis') expect(Sequelize.Utils.singularize(table)).toBe(model);
        });
        // The rules apply to the whole name (as in Sequelize): a prefix changes what matches.
        expect(sequelize.define('NamingCriterion', {}).tableName).toBe('NamingCriterions');
        expect(sequelize.define('NamingUser1', {}).tableName).toBe('NamingUser1s');
        const Upper = sequelize.define(
          'HTTPServer',
          { serverName: DataTypes.STRING, IOStream: DataTypes.STRING },
          { underscored: true }
        );
        expect(Upper.tableName).toBe('h_t_t_p_servers');
        expect(Upper.rawAttributes.serverName.field).toBe('server_name');
        expect(Upper.rawAttributes.IOStream.field).toBe('i_o_stream');
        expect(Sequelize.Utils.camelize('user_id')).toBe('userId');
        expect(Sequelize.Utils.camelize('a b')).toBe('aB');
      });

      it('has the types, errors, hints and helpers of Sequelize', () => {
        const { Author } = models;
        expect(DataTypes.INTEGER(11)).toBeInstanceOf(DataTypes.NUMBER);
        expect(DataTypes.DECIMAL(10, 2)).toBeInstanceOf(Sequelize.NUMBER);
        expect(DataTypes.STRING()).not.toBeInstanceOf(DataTypes.NUMBER);
        expect(DataTypes.ARRAY.is(DataTypes.ARRAY(DataTypes.ENUM('a')), DataTypes.ENUM)).toBe(true);
        expect(DataTypes.ABSTRACT.key).toBe('ABSTRACT');
        expect(Sequelize.IndexHints.FORCE).toBe('FORCE');
        expect(Sequelize.TableHints.NOLOCK).toBe('NOLOCK');
        expect(Author.associations.publisher).toBeInstanceOf(Sequelize.BelongsTo);
        expect(Author.associations.books).toBeInstanceOf(Sequelize.HasMany);
        expect(sequelize.getQueryInterface()).toBeInstanceOf(Sequelize.QueryInterface);
        expect(() => Author.scope('missing')).toThrow(Sequelize.SequelizeScopeError);
        expect(Sequelize.Utils.camelize('author_id name')).toBe('authorIdName');
        expect(Sequelize.Utils.combineTableNames('Tags', 'Books')).toBe('BooksTags');
        expect(Sequelize.Utils.mergeDefaults({ a: 1, b: { c: 1 } }, { a: 2, b: { d: 2 }, e: 3 })).toEqual({
          a: 1,
          b: { c: 1, d: 2 },
          e: 3,
        });
        expect(Sequelize.Validator.regex('abc', '^a')).toBe(true);
      });

      it('takes an inflector for the names of tables', () => {
        Sequelize.useInflection({ pluralize: (word) => `${word}_list`, singularize: (word) => word });
        try {
          const Item = sequelize.define('XufaItem', {});
          expect(Item.tableName).toBe('XufaItem_list');
        } finally {
          Sequelize.useInflection(null);
          sequelize.modelManager.removeModel(sequelize.model('XufaItem'));
        }
        expect(Sequelize.Utils.pluralize('person')).toBe('people');
      });

      it('has the hooks of models on their instances', async () => {
        const { Tag } = models;
        const seen = [];
        const tag = await Tag.create({ name: 'hooked' });
        tag.addHook('beforeUpdate', 'mark', () => seen.push('update'));
        expect(tag.hasHooks('beforeUpdate')).toBe(true);
        expect(tag.equalsOneOf([await Tag.findByPk(tag.id)])).toBe(true);
        tag.setAttributes({ name: 'renamed' });
        await tag.save();
        tag.removeHook('beforeUpdate', 'mark');
        expect(Tag.hasHook('beforeUpdate')).toBe(false);
        expect(seen).toEqual(['update']);
        await expect(sequelize.set({ a: 1 })).rejects.toThrow('only supported for mysql or mariadb');
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

    describe('as Sequelize does it inside', () => {
      it('ends transactions with COMMIT; and ROLLBACK; of sequelize.query, logged with their id', async () => {
        const logs = [];
        const query = sequelize.query.bind(sequelize);
        const calls = [];
        sequelize.query = (sql, options) => {
          calls.push(options && options.transaction);
          return query(sql, options);
        };
        try {
          const committed = await sequelize.transaction({ logging: (line) => logs.push(line) });
          await committed.commit();
          const rolledBack = await sequelize.transaction({ logging: (line) => logs.push(line) });
          await rolledBack.rollback();
          expect(logs).toEqual([
            `Executing (${committed.id}): COMMIT;`,
            `Executing (${rolledBack.id}): ROLLBACK;`,
          ]);
          expect(calls).toEqual([committed, rolledBack]);
        } finally {
          sequelize.query = query;
        }
        await expect(new Sequelize.Transaction(sequelize).rollback()).rejects.toThrow(
          'Transaction cannot be rolled back because it never started'
        );
      });

      it('counts through aggregate(), without limit, offset nor order', async () => {
        const { Tag } = models;
        await Tag.bulkCreate([{ name: 'a' }, { name: 'b' }]);
        const aggregate = Tag.aggregate;
        const seen = [];
        Tag.aggregate = function counted(attribute, fn, options) {
          seen.push([attribute, fn, options.limit, options.where]);
          return aggregate.call(this, attribute, fn, options);
        };
        try {
          expect(await Tag.count({ where: { name: 'a' }, limit: 5 })).toBe(1);
          expect(seen).toEqual([['*', 'count', null, { name: 'a' }]]);
        } finally {
          Tag.aggregate = aggregate;
        }
      });

      it('takes operatorsAliases, and writes fragments as SQL (queryGenerator)', async () => {
        const aliased = new Sequelize({
          ...sequelize.options,
          hooks: undefined,
          operatorsAliases: { $gt: Op.gt, $in: Op.in },
        });
        try {
          const Item = aliased.define('AliasedItem', { n: DataTypes.INTEGER });
          await Item.sync({ force: true });
          await Item.bulkCreate([{ n: 1 }, { n: 2 }, { n: 3 }]);
          expect(await Item.count({ where: { n: { $gt: 1 } } })).toBe(2);
          expect(await Item.count({ where: { n: { $in: [1, 3] } } })).toBe(2);
          expect(aliased.dialect.queryGenerator.OperatorsAliasMap).toEqual({ $gt: Op.gt, $in: Op.in });
          await Item.drop();
        } finally {
          await aliased.close();
        }
        const generator = sequelize.getQueryInterface().queryGenerator;
        const json = Sequelize.json('meta.size', 'L');
        const extract =
          sequelize.getDialect() === 'postgres' ? '("meta"#>>\'{size}\') = \'L\'' : 'json_extract("meta",\'$.size\') = \'L\'';
        expect(generator.handleSequelizeMethod(json)).toBe(extract);
        expect(generator.handleSequelizeMethod(Sequelize.fn('lower', Sequelize.col('Tags.name')))).toBe('lower("Tags"."name")');
        expect(generator.handleSequelizeMethod(Sequelize.cast(Sequelize.literal('1'), 'text'))).toBe('CAST(1 AS TEXT)');
        expect(sequelize.dialect.defaultVersion).toMatch(/^\d+\.\d+\.\d+$/);
        expect(sequelize.options.databaseVersion).toBe(0);
      });

      it('gives the foreign keys of a table (queryGenerator.getForeignKeysQuery)', async () => {
        const { Book } = models;
        const keys = await sequelize.query(sequelize.getQueryInterface().queryGenerator.getForeignKeysQuery(Book.getTableName()), {
          type: Sequelize.QueryTypes.FOREIGNKEYS,
        });
        const columns = keys.map((key) => key.from.replace(/"/g, '')).sort();
        expect(columns).toContain(Book.rawAttributes.authorId.field);
      });
    });
  });
}

export { defineSuite };
