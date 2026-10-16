/**
 * @swagger
 * /pets:
 *   get:
 *     produces: [application/json]
 *     responses:
 *       200:
 *         description: The pets
 *         schema:
 *           $ref: '#/definitions/Pet'
 * definitions:
 *   Pet:
 *     type: object
 * securityDefinitions:
 *   key:
 *     type: apiKey
 *     in: header
 *     name: x-key
 * parameters: {}
 * tags: [{ name: Pets }]
 */
