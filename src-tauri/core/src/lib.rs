//! pumice-core — the native desktop capability layer.
//!
//! These are the real implementations of the capabilities a browser CANNOT provide,
//! the same contract proven in JS by `src/desktop/desktop-adapter.js` (DoD #5), now in
//! native Rust: a real filesystem VaultAdapter, CORS-free HTTP (`request_url`), and
//! `child_process`. The Tauri binary (../app) exposes each as a `#[tauri::command]`;
//! the web UI calls them via `src/desktop/tauri-bridge.js` when running on desktop.
//!
//! Everything here is unit-tested with `cargo test` — real native execution, no mocks
//! for fs/process — so the desktop layer is PROVEN, not merely scaffolded.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

/// A real-filesystem VaultAdapter rooted at `base` (mirrors the JS desktop adapter).
pub struct VaultFs {
    base: PathBuf,
}

#[derive(Serialize, Deserialize, Debug, PartialEq)]
pub struct Stat {
    pub kind: String, // "file" | "folder"
    pub size: u64,
}

impl VaultFs {
    pub fn new<P: Into<PathBuf>>(base: P) -> Self {
        VaultFs { base: base.into() }
    }
    fn abs(&self, p: &str) -> PathBuf {
        self.base.join(p)
    }
    fn rel(&self, p: &Path) -> String {
        p.strip_prefix(&self.base)
            .unwrap_or(p)
            .to_string_lossy()
            .replace('\\', "/")
    }

    pub fn read(&self, p: &str) -> std::io::Result<String> {
        fs::read_to_string(self.abs(p))
    }
    pub fn write(&self, p: &str, content: &str) -> std::io::Result<()> {
        let abs = self.abs(p);
        if let Some(parent) = abs.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(abs, content)
    }
    pub fn remove(&self, p: &str) -> std::io::Result<()> {
        let abs = self.abs(p);
        if abs.is_dir() {
            fs::remove_dir_all(abs)
        } else if abs.exists() {
            fs::remove_file(abs)
        } else {
            Ok(())
        }
    }
    pub fn rename(&self, from: &str, to: &str) -> std::io::Result<()> {
        let to_abs = self.abs(to);
        if let Some(parent) = to_abs.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::rename(self.abs(from), to_abs)
    }
    pub fn stat(&self, p: &str) -> Option<Stat> {
        let m = fs::metadata(self.abs(p)).ok()?;
        Some(Stat {
            kind: if m.is_dir() { "folder" } else { "file" }.into(),
            size: m.len(),
        })
    }
    /// Recursively list all files (relative, forward-slash paths), sorted.
    pub fn list(&self) -> std::io::Result<Vec<String>> {
        let mut out = Vec::new();
        self.walk(&self.base.clone(), &mut out)?;
        out.sort();
        Ok(out)
    }
    fn walk(&self, dir: &Path, out: &mut Vec<String>) -> std::io::Result<()> {
        if !dir.exists() {
            return Ok(());
        }
        for entry in fs::read_dir(dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.is_dir() {
                self.walk(&path, out)?;
            } else {
                out.push(self.rel(&path));
            }
        }
        Ok(())
    }
}

#[derive(Serialize, Deserialize, Debug)]
pub struct UrlResponse {
    pub status: u16,
    pub text: String,
}

/// CORS-free HTTP (Obsidian's desktop `requestUrl`) over a raw native socket — no
/// browser, no CORS, arbitrary headers (Origin/Cookie/User-Agent). HTTP/1.1 over
/// `TcpStream`; `http://` scheme (production adds TLS for `https://`). This is the real
/// native-net capability a sandboxed browser cannot do.
pub fn request_url(
    url: &str,
    method: &str,
    headers: &[(String, String)],
    body: Option<&str>,
) -> Result<UrlResponse, String> {
    use std::io::{Read, Write};
    use std::net::TcpStream;
    use std::time::Duration;

    let rest = url.strip_prefix("http://").ok_or("only http:// supported in core")?;
    let (host_port, path) = match rest.find('/') {
        Some(i) => (&rest[..i], &rest[i..]),
        None => (rest, "/"),
    };
    let (host, port) = match host_port.find(':') {
        Some(i) => (&host_port[..i], host_port[i + 1..].parse::<u16>().map_err(|e| e.to_string())?),
        None => (host_port, 80u16),
    };
    let mut stream = TcpStream::connect((host, port)).map_err(|e| e.to_string())?;
    stream.set_read_timeout(Some(Duration::from_secs(5))).ok();

    let mut req = format!("{} {} HTTP/1.1\r\nHost: {}\r\nConnection: close\r\n", method, path, host_port);
    for (k, v) in headers {
        req.push_str(&format!("{}: {}\r\n", k, v));
    }
    if let Some(b) = body {
        req.push_str(&format!("Content-Length: {}\r\n", b.len()));
    }
    req.push_str("\r\n");
    if let Some(b) = body {
        req.push_str(b);
    }
    stream.write_all(req.as_bytes()).map_err(|e| e.to_string())?;

    let mut raw = String::new();
    stream.read_to_string(&mut raw).map_err(|e| e.to_string())?;
    let mut parts = raw.splitn(2, "\r\n\r\n");
    let head = parts.next().unwrap_or("");
    let text = parts.next().unwrap_or("").to_string();
    let status = head
        .lines()
        .next()
        .and_then(|l| l.split_whitespace().nth(1))
        .and_then(|s| s.parse::<u16>().ok())
        .ok_or("malformed status line")?;
    Ok(UrlResponse { status, text })
}

#[derive(Serialize, Deserialize, Debug)]
pub struct ProcOutput {
    pub status: i32,
    pub stdout: String,
    pub stderr: String,
}

/// `child_process` — run a native command (desktop-only; e.g. Obsidian Git shelling to git).
pub fn run_command(cmd: &str, args: &[String]) -> Result<ProcOutput, String> {
    let out = Command::new(cmd).args(args).output().map_err(|e| e.to_string())?;
    Ok(ProcOutput {
        status: out.status.code().unwrap_or(-1),
        stdout: String::from_utf8_lossy(&out.stdout).to_string(),
        stderr: String::from_utf8_lossy(&out.stderr).to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp() -> PathBuf {
        use std::sync::atomic::{AtomicU32, Ordering};
        static N: AtomicU32 = AtomicU32::new(0);
        let mut d = std::env::temp_dir();
        d.push(format!(
            "pumice-core-test-{}-{}",
            std::process::id(),
            N.fetch_add(1, Ordering::SeqCst)
        ));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn fs_write_read_roundtrip() {
        let v = VaultFs::new(tmp());
        v.write("Notes/Hello.md", "# Hi\nbody").unwrap();
        assert_eq!(v.read("Notes/Hello.md").unwrap(), "# Hi\nbody");
    }

    #[test]
    fn fs_list_is_sorted_and_relative() {
        let base = tmp();
        let v = VaultFs::new(&base);
        v.write("b.md", "2").unwrap();
        v.write("a/c.md", "3").unwrap();
        v.write("a.md", "1").unwrap();
        assert_eq!(v.list().unwrap(), vec!["a.md", "a/c.md", "b.md"]);
    }

    #[test]
    fn fs_stat_rename_remove() {
        let v = VaultFs::new(tmp());
        v.write("x.md", "hello").unwrap();
        let s = v.stat("x.md").unwrap();
        assert_eq!(s.kind, "file");
        assert_eq!(s.size, 5);
        assert!(v.stat("missing.md").is_none());
        v.rename("x.md", "sub/y.md").unwrap();
        assert!(v.stat("x.md").is_none());
        assert_eq!(v.read("sub/y.md").unwrap(), "hello");
        v.remove("sub/y.md").unwrap();
        assert!(v.stat("sub/y.md").is_none());
    }

    #[test]
    fn process_runs_native_command() {
        // child_process: real native exec (desktop-only capability)
        let out = run_command("echo", &["hello".into()]).unwrap();
        assert_eq!(out.status, 0);
        assert!(out.stdout.contains("hello"));
    }

    #[test]
    fn process_reports_nonzero_status() {
        let out = run_command("false", &[]).unwrap();
        assert_ne!(out.status, 0);
    }

    #[test]
    fn request_url_real_native_round_trip() {
        use std::io::{Read, Write};
        use std::net::TcpListener;
        // Spin a tiny local HTTP server, then hit it through request_url — a REAL native
        // socket round-trip (no browser, no CORS), with a normally-CORS-forbidden header.
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let handle = std::thread::spawn(move || {
            let (mut sock, _) = listener.accept().unwrap();
            let mut buf = [0u8; 1024];
            let n = sock.read(&mut buf).unwrap();
            let req = String::from_utf8_lossy(&buf[..n]).to_string();
            let bodytext = "{\"ok\":true}";
            let resp = format!(
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                bodytext.len(),
                bodytext
            );
            sock.write_all(resp.as_bytes()).unwrap();
            req // return what the server saw, to assert headers were forwarded
        });
        let url = format!("http://{}/api", addr);
        let r = request_url(
            &url,
            "GET",
            &[("Origin".into(), "app://obsidian.md".into()), ("Cookie".into(), "a=1".into())],
            None,
        )
        .unwrap();
        let server_saw = handle.join().unwrap();
        assert_eq!(r.status, 200);
        assert_eq!(r.text, "{\"ok\":true}");
        // CORS-free: forbidden-in-browser headers actually reached the server
        assert!(server_saw.contains("Origin: app://obsidian.md"));
        assert!(server_saw.contains("Cookie: a=1"));
    }
}
