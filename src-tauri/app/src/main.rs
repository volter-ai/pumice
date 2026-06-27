// Pumice desktop binary (Tauri v2). Wraps the native capability layer (pumice-core) as
// Tauri commands the web UI invokes via `src/desktop/tauri-bridge.js`, and opens the
// vault-display app in a native window with the OS webview (no bundled Chromium).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use pumice_core::{request_url, run_command, ProcOutput, Stat, UrlResponse, VaultFs};

#[tauri::command]
fn vault_read(base: String, path: String) -> Result<String, String> {
    VaultFs::new(base).read(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn vault_write(base: String, path: String, content: String) -> Result<(), String> {
    VaultFs::new(base).write(&path, &content).map_err(|e| e.to_string())
}

#[tauri::command]
fn vault_list(base: String) -> Result<Vec<String>, String> {
    VaultFs::new(base).list().map_err(|e| e.to_string())
}

#[tauri::command]
fn vault_stat(base: String, path: String) -> Option<Stat> {
    VaultFs::new(base).stat(&path)
}

#[tauri::command]
fn vault_remove(base: String, path: String) -> Result<(), String> {
    VaultFs::new(base).remove(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn vault_rename(base: String, from: String, to: String) -> Result<(), String> {
    VaultFs::new(base).rename(&from, &to).map_err(|e| e.to_string())
}

#[tauri::command]
fn net_request(
    url: String,
    method: String,
    headers: Vec<(String, String)>,
    body: Option<String>,
) -> Result<UrlResponse, String> {
    request_url(&url, &method, &headers, body.as_deref())
}

#[tauri::command]
fn proc_run(cmd: String, args: Vec<String>) -> Result<ProcOutput, String> {
    run_command(&cmd, &args)
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            vault_read,
            vault_write,
            vault_list,
            vault_stat,
            vault_remove,
            vault_rename,
            net_request,
            proc_run
        ])
        .run(tauri::generate_context!())
        .expect("error while running pumice");
}

fn main() {
    run();
}
