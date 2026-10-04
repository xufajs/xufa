const { toEwkt, fromEwkb, toEwkb } = require('../lib/geo');

const crs = (srid) => ({ type: 'name', properties: { name: `EPSG:${srid}` } });

describe('geometries (GeoJSON, EWKT, EWKB)', () => {
  it('writes EWKT of every type', () => {
    expect(toEwkt({ type: 'Point', coordinates: [1, 2] })).toBe('POINT(1 2)');
    expect(toEwkt({ type: 'Point', coordinates: [1, 2], crs: crs(4326) })).toBe('SRID=4326;POINT(1 2)');
    expect(toEwkt({ type: 'Point', coordinates: [] })).toBe('POINT EMPTY');
    expect(
      toEwkt({
        type: 'LineString',
        coordinates: [
          [100, 0],
          [101, 1],
        ],
      })
    ).toBe('LINESTRING(100 0,101 1)');
    expect(
      toEwkt({
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 0],
          ],
        ],
      })
    ).toBe('POLYGON((0 0,1 0,1 1,0 0))');
    expect(
      toEwkt({
        type: 'MultiPoint',
        coordinates: [
          [1, 2],
          [3, 4],
        ],
      })
    ).toBe('MULTIPOINT((1 2),(3 4))');
    expect(
      toEwkt({
        type: 'MultiLineString',
        coordinates: [
          [
            [1, 2],
            [3, 4],
          ],
        ],
      })
    ).toBe('MULTILINESTRING((1 2,3 4))');
    expect(
      toEwkt({
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [0, 0],
              [1, 0],
              [0, 1],
              [0, 0],
            ],
          ],
        ],
      })
    ).toBe('MULTIPOLYGON(((0 0,1 0,0 1,0 0)))');
    expect(
      toEwkt({
        type: 'GeometryCollection',
        geometries: [
          { type: 'Point', coordinates: [1, 2] },
          {
            type: 'LineString',
            coordinates: [
              [1, 2],
              [3, 4],
            ],
          },
        ],
      })
    ).toBe('GEOMETRYCOLLECTION(POINT(1 2),LINESTRING(1 2,3 4))');
    expect(
      toEwkt({ type: 'Point', coordinates: [1, 2, 3], crs: { properties: { name: 'urn:ogc:def:crs:EPSG::3857' } } })
    ).toBe('SRID=3857;POINT(1 2 3)');
  });

  it('refuses what is no geometry (and SQL in coordinates)', () => {
    expect(() => toEwkt({ type: 'Circle', coordinates: [1, 2] })).toThrow('GeoJSON geometry');
    expect(() => toEwkt({ type: 'Point', coordinates: [1, "'); DROP TABLE x; --"] })).toThrow('must be numbers');
    expect(() => toEwkt({ type: 'LineString', coordinates: [1, 2] })).toThrow('must be arrays');
    expect(toEwkt({ type: 'Point', coordinates: ['1.5', 2] })).toBe('POINT(1.5 2)');
  });

  it('reads the EWKB of PostGIS (hex), with the SRID as crs', () => {
    // SELECT 'SRID=4326;POINT(1 2)'::geometry
    expect(fromEwkb('0101000020E6100000000000000000F03F0000000000000040')).toEqual({
      type: 'Point',
      coordinates: [1, 2],
      crs: crs(4326),
    });
    // SELECT 'POINT(1 2)'::geometry
    expect(fromEwkb('0101000000000000000000F03F0000000000000040')).toEqual({ type: 'Point', coordinates: [1, 2] });
    // Big-endian WKB.
    expect(fromEwkb('00000000013FF00000000000004000000000000000')).toEqual({ type: 'Point', coordinates: [1, 2] });
    expect(fromEwkb(null)).toBeNull();
  });

  it('round-trips every type through EWKB', () => {
    const values = [
      { type: 'Point', coordinates: [39.807222, -76.984722] },
      { type: 'Point', coordinates: [1, 2, 3], crs: crs(4326) },
      {
        type: 'LineString',
        coordinates: [
          [100, 0],
          [101, 1],
        ],
        crs: crs(4326),
      },
      {
        type: 'Polygon',
        coordinates: [
          [
            [100, 0],
            [101, 0],
            [101, 1],
            [100, 1],
            [100, 0],
          ],
        ],
      },
      {
        type: 'MultiPoint',
        coordinates: [
          [1, 2],
          [3, 4],
        ],
      },
      {
        type: 'MultiLineString',
        coordinates: [
          [
            [1, 2],
            [3, 4],
          ],
          [
            [5, 6],
            [7, 8],
          ],
        ],
      },
      {
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [0, 0],
              [1, 0],
              [0, 1],
              [0, 0],
            ],
          ],
        ],
        crs: crs(3857),
      },
      { type: 'GeometryCollection', geometries: [{ type: 'Point', coordinates: [1, 2] }] },
    ];
    values.forEach((value) => {
      expect(fromEwkb(toEwkb(value))).toEqual(value);
      expect(fromEwkb(toEwkb(value).toString('hex'))).toEqual(value);
    });
  });
});
