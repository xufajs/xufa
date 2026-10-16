/**
 * @openapi
 * tags:
 *   - name: Books
 *     description: Not added twice
 *   - name: Authors
 * components:
 *   parameters:
 *     AuthorId: &authorId
 *       in: path
 *       name: authorId
 *       required: true
 */

/**
 * @openapi
 * /authors/{authorId}:
 *   get:
 *     parameters:
 *       - *authorId
 *     responses:
 *       200:
 *         description: The author
 */

/**
 * @openapi
 * /broken:
 *   get: [unclosed
 */

/**
 * @openapi
 * components:
 *   schemas:
 *     Book:
 *       required: [title]
 *     Author:
 *       type: object
 * definitions: {}
 * responses:
 *   NotFound: {}
 */
