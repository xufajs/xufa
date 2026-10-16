/**
 * @openapi
 * tags:
 *   name: Books
 *   description: The books of the library.
 */

/**
 * The list of books.
 * @openapi
 * /books:
 *   get:
 *     summary: Lists the books
 *     tags: [Books]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: The books
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Book'
 * @param {object} req not a tag of OpenAPI
 */
function list() {}

/**
 * @swagger
 * paths:
 *   /books/{id}:
 *     get:
 *       summary: One book
 *       parameters:
 *         - in: path
 *           name: id
 *           required: true
 *       responses:
 *         200:
 *           description: The book
 *         404:
 *           description: null
 * components:
 *   schemas:
 *     Book:
 *       type: object
 *       properties:
 *         title:
 *           type: string
 *         published:
 *           type: string
 *           example: 2024-01-31
 *         active:
 *           type: boolean
 *           example: yes
 */
function one() {}

/**
 * @openapi
 * /books:
 *   get:
 *     parameters:
 *       - in: query
 *         name: page
 *         description: The page, from 1
 *       - in: query
 *         name: size
 *   post:
 *     summary: Adds a book
 *     tags:
 *       - Books
 * x-webhooks:
 *   newBook:
 *     post:
 *       summary: A book was added
 * x-internal: true
 */
module.exports = { list, one };
