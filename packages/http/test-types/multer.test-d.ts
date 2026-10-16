// Types of @xufa/http/multer (xufa's, not ported).
import { expectTypeOf } from '@xufa/test';
import multer from '@xufa/http/multer';

const upload = multer({ storage: multer.memoryStorage(), defParamCharset: 'utf8', limits: { fileSize: 1e6 } });
expectTypeOf(upload.single('photo')).toEqualTypeOf<multer.Middleware>();
upload.fields([{ name: 'a', maxCount: 1 }, { name: 'b' }]);
multer({ dest: 'uploads', fileFilter: (req, file, cb) => cb(null, file.mimetype.startsWith('image/')) });
multer.diskStorage({ destination: 'uploads', filename: (req, file, cb) => cb(null, file.originalname) });
const error = new multer.MulterError('LIMIT_FILE_SIZE', 'photo');
expectTypeOf(error.code).toEqualTypeOf<multer.ErrorCode>();
declare const file: multer.File;
expectTypeOf(file.buffer).toEqualTypeOf<Buffer>();
// @ts-expect-error
multer({ storage: 'memory' });
// @ts-expect-error
new multer.MulterError('LIMIT_NOTHING');
