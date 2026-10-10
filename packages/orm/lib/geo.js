// Geometries of PostGIS as GeoJSON values: written as EWKT ('SRID=4326;POINT(1 2)'), which PostgreSQL reads for
// geometry and geography columns, and read from EWKB (the hex text PostGIS gives, or its bytes). The SRID of a
// geometry is the crs of its GeoJSON ({ type: 'name', properties: { name: 'EPSG:4326' } }), as Sequelize gives it.

const TYPES = {
  Point: 1,
  LineString: 2,
  Polygon: 3,
  MultiPoint: 4,
  MultiLineString: 5,
  MultiPolygon: 6,
  GeometryCollection: 7,
};
const NAMES = Object.fromEntries(Object.entries(TYPES).map(([name, code]) => [code, name]));
const WKT = {
  Point: 'POINT',
  LineString: 'LINESTRING',
  Polygon: 'POLYGON',
  MultiPoint: 'MULTIPOINT',
  MultiLineString: 'MULTILINESTRING',
  MultiPolygon: 'MULTIPOLYGON',
  GeometryCollection: 'GEOMETRYCOLLECTION',
};

const EWKB_Z = 0x80000000;
const EWKB_M = 0x40000000;
const EWKB_SRID = 0x20000000;

// The SRID of a crs ('EPSG:4326', 'urn:ogc:def:crs:EPSG::4326'), or null.
function sridOf(geojson) {
  const name = geojson && geojson.crs && geojson.crs.properties && geojson.crs.properties.name;
  if (typeof name !== 'string') return null;
  const match = /(\d+)\s*$/.exec(name);
  return match ? Number(match[1]) : null;
}

function crsOf(srid) {
  return { type: 'name', properties: { name: `EPSG:${srid}` } };
}

// A GeoJSON geometry checked: its type, and coordinates of numbers (numeric text is taken as its number).
function checkGeometry(value) {
  if (!value || typeof value !== 'object' || !TYPES[value.type]) {
    throw new TypeError(
      'The value must be a GeoJSON geometry (Point, LineString, Polygon, Multi..., GeometryCollection).'
    );
  }
  if (value.type === 'GeometryCollection') {
    if (!Array.isArray(value.geometries)) throw new TypeError('A GeometryCollection needs geometries.');
    value.geometries.forEach(checkGeometry);
    return value;
  }
  const depth = { Point: 0, LineString: 1, MultiPoint: 1, Polygon: 2, MultiLineString: 2, MultiPolygon: 3 }[value.type];
  const check = (coordinates, level) => {
    if (!Array.isArray(coordinates)) throw new TypeError(`The coordinates of a ${value.type} must be arrays.`);
    if (level === 0) {
      coordinates.forEach((number) => {
        if (!Number.isFinite(Number(number)) || number === null || number === '') {
          throw new TypeError(`The coordinates of a ${value.type} must be numbers.`);
        }
      });
      return;
    }
    coordinates.forEach((item) => check(item, level - 1));
  };
  check(value.coordinates, depth);
  return value;
}

// The WKT of a geometry, without its SRID.
function wkt(geometry) {
  const position = (coordinates) => coordinates.map(Number).join(' ');
  const list = (items, fn) => `(${items.map(fn).join(',')})`;
  const tag = WKT[geometry.type];
  const { coordinates } = geometry;
  switch (geometry.type) {
    case 'Point':
      return coordinates.length ? `${tag}(${position(coordinates)})` : `${tag} EMPTY`;
    case 'LineString':
    case 'MultiPoint':
      if (!coordinates.length) return `${tag} EMPTY`;
      return geometry.type === 'MultiPoint'
        ? `${tag}${list(coordinates, (point) => `(${position(point)})`)}`
        : `${tag}${list(coordinates, position)}`;
    case 'Polygon':
    case 'MultiLineString':
      if (!coordinates.length) return `${tag} EMPTY`;
      return `${tag}${list(coordinates, (ring) => list(ring, position))}`;
    case 'MultiPolygon':
      if (!coordinates.length) return `${tag} EMPTY`;
      return `${tag}${list(coordinates, (polygon) => list(polygon, (ring) => list(ring, position)))}`;
    default:
      if (!geometry.geometries.length) return `${tag} EMPTY`;
      return `${tag}(${geometry.geometries.map(wkt).join(',')})`;
  }
}

// The EWKT of a GeoJSON geometry (its crs as SRID=...;).
function toEwkt(geojson) {
  checkGeometry(geojson);
  const srid = sridOf(geojson);
  return `${srid !== null ? `SRID=${srid};` : ''}${wkt(geojson)}`;
}

// The GeoJSON of an EWKB (hex text or bytes; ISO WKB with Z/M type codes too).
function fromEwkb(input) {
  if (input === null || input === undefined) return null;
  if (typeof input === 'object' && !Buffer.isBuffer(input) && !(input instanceof Uint8Array)) return input;
  const buffer = typeof input === 'string' ? Buffer.from(input, 'hex') : Buffer.from(input);
  let offset = 0;
  const read = (top) => {
    const little = buffer[offset] === 1;
    offset += 1;
    const uint32 = () => {
      const value = little ? buffer.readUInt32LE(offset) : buffer.readUInt32BE(offset);
      offset += 4;
      return value;
    };
    const double = () => {
      const value = little ? buffer.readDoubleLE(offset) : buffer.readDoubleBE(offset);
      offset += 8;
      return value;
    };
    let code = uint32();
    let hasZ = Boolean(code & EWKB_Z);
    let hasM = Boolean(code & EWKB_M);
    let srid = null;
    if (code & EWKB_SRID) srid = uint32();
    code &= 0x0fffffff;
    // ISO WKB: 1001 (Z), 2001 (M), 3001 (ZM)...
    if (code > 1000) {
      const dimensions = Math.floor(code / 1000);
      hasZ = hasZ || dimensions === 1 || dimensions === 3;
      hasM = hasM || dimensions === 2 || dimensions === 3;
      code %= 1000;
    }
    const position = () => {
      const point = [double(), double()];
      if (hasZ) point.push(double());
      if (hasM) double();
      return point;
    };
    const many = (fn) => {
      const count = uint32();
      const items = [];
      for (let i = 0; i < count; i += 1) items.push(fn());
      return items;
    };
    const type = NAMES[code];
    if (!type) throw new TypeError(`Unknown WKB geometry type ${code}`);
    let geometry;
    switch (type) {
      case 'Point': {
        const point = position();
        geometry = { type, coordinates: point.every(Number.isNaN) ? [] : point };
        break;
      }
      case 'LineString':
        geometry = { type, coordinates: many(position) };
        break;
      case 'Polygon':
        geometry = { type, coordinates: many(() => many(position)) };
        break;
      case 'MultiPoint':
        geometry = { type, coordinates: many(() => read(false).coordinates) };
        break;
      case 'MultiLineString':
      case 'MultiPolygon':
        geometry = { type, coordinates: many(() => read(false).coordinates) };
        break;
      default:
        geometry = { type, geometries: many(() => read(false)) };
    }
    if (top && srid) geometry.crs = crsOf(srid);
    return geometry;
  };
  return read(true);
}

// The EWKB (bytes) of a GeoJSON geometry, little-endian (tests, and values given as bytes).
function toEwkb(geojson) {
  checkGeometry(geojson);
  const parts = [];
  const write = (geometry, top) => {
    const srid = top ? sridOf(geojson) : null;
    const hasZ = (() => {
      const first = (coordinates) => (Array.isArray(coordinates[0]) ? first(coordinates[0]) : coordinates);
      if (geometry.type === 'GeometryCollection') return false;
      const point = geometry.coordinates.length ? first(geometry.coordinates) : [];
      return point.length > 2;
    })();
    let code = TYPES[geometry.type];
    if (hasZ) code |= EWKB_Z;
    if (srid) code |= EWKB_SRID;
    const head = Buffer.alloc(srid ? 9 : 5);
    head[0] = 1;
    head.writeUInt32LE(code >>> 0, 1);
    if (srid) head.writeUInt32LE(srid, 5);
    parts.push(head);
    const uint32 = (value) => {
      const buffer = Buffer.alloc(4);
      buffer.writeUInt32LE(value, 0);
      parts.push(buffer);
    };
    const position = (point) => {
      const buffer = Buffer.alloc(8 * (hasZ ? 3 : 2));
      buffer.writeDoubleLE(Number(point[0]), 0);
      buffer.writeDoubleLE(Number(point[1]), 8);
      if (hasZ) buffer.writeDoubleLE(Number(point[2] || 0), 16);
      parts.push(buffer);
    };
    const { coordinates } = geometry;
    switch (geometry.type) {
      case 'Point':
        position(coordinates.length ? coordinates : [NaN, NaN]);
        break;
      case 'LineString':
        uint32(coordinates.length);
        coordinates.forEach(position);
        break;
      case 'Polygon':
        uint32(coordinates.length);
        coordinates.forEach((ring) => {
          uint32(ring.length);
          ring.forEach(position);
        });
        break;
      case 'MultiPoint':
        uint32(coordinates.length);
        coordinates.forEach((point) => write({ type: 'Point', coordinates: point }, false));
        break;
      case 'MultiLineString':
        uint32(coordinates.length);
        coordinates.forEach((line) => write({ type: 'LineString', coordinates: line }, false));
        break;
      case 'MultiPolygon':
        uint32(coordinates.length);
        coordinates.forEach((polygon) => write({ type: 'Polygon', coordinates: polygon }, false));
        break;
      default:
        uint32(geometry.geometries.length);
        geometry.geometries.forEach((item) => write(item, false));
    }
  };
  write(geojson, true);
  return Buffer.concat(parts);
}

export { toEwkt, fromEwkb, toEwkb, checkGeometry, sridOf };
