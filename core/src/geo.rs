//! Geodesy: WGS84 -> ECEF -> ENU, the Twin Earth transform.
//!
//! Constants match the quarry's cesium_bridge.py exactly (verified in
//! Extraction 001): a = 6378137.0, f = 1/298.257223563. The frame is the
//! Twin Earth Geospatial Transform Contract's: meters, Y-up, origin at a
//! surveyed anchor; the engine mapping emits [East, Up, -North] so North
//! points away from the default camera in three.js.

pub const A: f64 = 6378137.0; // WGS84 semi-major axis, meters
pub const F: f64 = 1.0 / 298.257223563; // WGS84 flattening
pub const E2: f64 = F * (2.0 - F); // first eccentricity squared
const D2R: f64 = std::f64::consts::PI / 180.0;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Origin {
    pub lat: f64,
    pub lon: f64,
    pub elev: f64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Enu {
    pub east: f64,
    pub north: f64,
    pub up: f64,
}

impl Enu {
    /// The engine frame: x = East, y = Up, z = -North.
    pub fn to_engine(self) -> [f64; 3] {
        [self.east, self.up, -self.north]
    }
}

pub fn ecef(lat_deg: f64, lon_deg: f64, h: f64) -> [f64; 3] {
    let lat = lat_deg * D2R;
    let lon = lon_deg * D2R;
    let sin_lat = lat.sin();
    let n = A / (1.0 - E2 * sin_lat * sin_lat).sqrt();
    [
        (n + h) * lat.cos() * lon.cos(),
        (n + h) * lat.cos() * lon.sin(),
        (n * (1.0 - E2) + h) * sin_lat,
    ]
}

pub fn enu(origin: &Origin, lat_deg: f64, lon_deg: f64, elev: f64) -> Enu {
    let [ox, oy, oz] = ecef(origin.lat, origin.lon, origin.elev);
    let [x, y, z] = ecef(lat_deg, lon_deg, elev);
    let (dx, dy, dz) = (x - ox, y - oy, z - oz);
    let lat0 = origin.lat * D2R;
    let lon0 = origin.lon * D2R;
    let (s_lat, c_lat) = (lat0.sin(), lat0.cos());
    let (s_lon, c_lon) = (lon0.sin(), lon0.cos());
    Enu {
        east: -s_lon * dx + c_lon * dy,
        north: -s_lat * c_lon * dx - s_lat * s_lon * dy + c_lat * dz,
        up: c_lat * c_lon * dx + c_lat * s_lon * dy + s_lat * dz,
    }
}
