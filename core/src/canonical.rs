//! Canonical JSON, byte-identical to Python's
//! `json.dumps(value, sort_keys=True, separators=(",", ":"))` with its
//! default ASCII escaping — the serialization the quarry's journal
//! hashes. Keys sort at every depth; strings escape the way Python
//! escapes them (non-ASCII as \uXXXX, surrogate pairs above the BMP);
//! numbers print in shortest round-trip form (serde_json's ryu output
//! matches CPython repr for the values the island uses).

use serde_json::Value;

fn escape_string(s: &str, out: &mut String) {
    out.push('"');
    for ch in s.chars() {
        let cp = ch as u32;
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            '\u{0008}' => out.push_str("\\b"),
            '\u{000C}' => out.push_str("\\f"),
            _ if cp < 0x20 || cp > 0x7E => {
                if cp > 0xFFFF {
                    let v = cp - 0x10000;
                    out.push_str(&format!("\\u{:04x}", 0xD800 + (v >> 10)));
                    out.push_str(&format!("\\u{:04x}", 0xDC00 + (v & 0x3FF)));
                } else {
                    out.push_str(&format!("\\u{:04x}", cp));
                }
            }
            _ => out.push(ch),
        }
    }
    out.push('"');
}

pub fn canonical(value: &Value) -> String {
    let mut out = String::new();
    write_value(value, &mut out);
    out
}

fn write_value(value: &Value, out: &mut String) {
    match value {
        Value::Null => out.push_str("null"),
        Value::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
        Value::Number(n) => out.push_str(&n.to_string()),
        Value::String(s) => escape_string(s, out),
        Value::Array(items) => {
            out.push('[');
            for (i, item) in items.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                write_value(item, out);
            }
            out.push(']');
        }
        Value::Object(map) => {
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort();
            out.push('{');
            for (i, key) in keys.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                escape_string(key, out);
                out.push(':');
                write_value(&map[*key], out);
            }
            out.push('}');
        }
    }
}
