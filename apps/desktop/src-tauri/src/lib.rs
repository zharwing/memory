use std::{
    collections::HashMap,
    env,
    io::{Read, Write},
    net::{TcpStream, ToSocketAddrs},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    thread,
    time::{Duration, Instant},
};

pub fn run() {
    let mut daemon = DaemonManager::from_environment();
    if let Err(error) = daemon.ensure_running() {
        eprintln!("Zharwing Memory desktop could not start the local daemon: {error}");
    }

    tauri::Builder::default()
        .manage(daemon)
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .run(tauri::generate_context!())
        .expect("failed to run Zharwing Memory desktop app");
}

struct DaemonManager {
    config: DaemonConfig,
    child: Option<Child>,
}

impl DaemonManager {
    fn from_environment() -> Self {
        Self {
            config: DaemonConfig::from_environment(),
            child: None,
        }
    }

    fn ensure_running(&mut self) -> Result<(), String> {
        if self.config.autostart_disabled {
            return Ok(());
        }

        if daemon_is_healthy(&self.config.host, self.config.port) {
            return Ok(());
        }

        let mut command = daemon_command(&self.config.workspace_root)?;
        command
            .current_dir(&self.config.workspace_root)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());

        let child = command.spawn().map_err(|error| {
            format!(
                "failed to spawn daemon from {}: {error}",
                self.config.workspace_root.display()
            )
        })?;
        self.child = Some(child);

        let deadline = Instant::now() + Duration::from_secs(12);
        while Instant::now() < deadline {
            if daemon_is_healthy(&self.config.host, self.config.port) {
                return Ok(());
            }

            if let Some(child) = self.child.as_mut() {
                if let Ok(Some(status)) = child.try_wait() {
                    return Err(format!("daemon exited before becoming healthy: {status}"));
                }
            }

            thread::sleep(Duration::from_millis(200));
        }

        Err(format!(
            "daemon did not become healthy at http://{}:{}/health",
            self.config.host, self.config.port
        ))
    }
}

impl Drop for DaemonManager {
    fn drop(&mut self) {
        if let Some(child) = self.child.as_mut() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

struct DaemonConfig {
    host: String,
    port: u16,
    workspace_root: PathBuf,
    autostart_disabled: bool,
}

impl DaemonConfig {
    fn from_environment() -> Self {
        let workspace_root = workspace_root();
        let file_env = read_dotenv(&workspace_root.join(".env"));
        let host = canonical_or_legacy_env_value(&file_env, "ZHARWING_MEMORY_HOST", "AIMEM_HOST")
            .unwrap_or_else(|| "127.0.0.1".to_string());
        let port = canonical_or_legacy_env_value(&file_env, "ZHARWING_MEMORY_PORT", "AIMEM_PORT")
            .and_then(|value| value.parse::<u16>().ok())
            .unwrap_or(37841);
        let autostart_disabled = canonical_or_legacy_env_value(
            &file_env,
            "ZHARWING_MEMORY_DESKTOP_AUTOSTART_DAEMON",
            "AIMEM_DESKTOP_AUTOSTART_DAEMON",
        )
        .map(|value| matches!(value.as_str(), "0" | "false" | "off" | "no"))
        .unwrap_or(false);

        Self {
            host,
            port,
            workspace_root,
            autostart_disabled,
        }
    }
}

fn workspace_root() -> PathBuf {
    if let Some(root) = process_env_value("ZHARWING_MEMORY_DESKTOP_PROJECT_ROOT")
        .or_else(|| process_env_value("AIMEM_DESKTOP_PROJECT_ROOT"))
    {
        return PathBuf::from(root);
    }

    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(Path::parent)
        .and_then(Path::parent)
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from("."))
}

fn daemon_command(workspace_root: &Path) -> Result<Command, String> {
    if let Some(command) = process_env_value("ZHARWING_MEMORY_DESKTOP_DAEMON_COMMAND")
        .or_else(|| process_env_value("AIMEM_DESKTOP_DAEMON_COMMAND"))
    {
        let mut parts = command.split_whitespace();
        if let Some(program) = parts.next() {
            let mut cmd = Command::new(program);
            cmd.args(parts);
            return Ok(cmd);
        }
    }

    if !workspace_root.join("package.json").exists() {
        return Err(format!(
            "no daemon command configured and no package.json found at {}",
            workspace_root.display()
        ));
    }

    let mut command = if cfg!(windows) {
        let mut command = Command::new("cmd.exe");
        command.args(["/d", "/s", "/c", "pnpm dev:daemon"]);
        command
    } else {
        let mut command = Command::new("pnpm");
        command.arg("dev:daemon");
        command
    };
    command.current_dir(workspace_root);
    Ok(command)
}

fn daemon_is_healthy(host: &str, port: u16) -> bool {
    let address = match (host, port)
        .to_socket_addrs()
        .ok()
        .and_then(|mut addresses| addresses.next())
    {
        Some(address) => address,
        None => return false,
    };

    let mut stream = match TcpStream::connect_timeout(&address, Duration::from_millis(500)) {
        Ok(stream) => stream,
        Err(_) => return false,
    };

    let _ = stream.set_read_timeout(Some(Duration::from_millis(800)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(800)));

    let request =
        format!("GET /health HTTP/1.1\r\nHost: {host}:{port}\r\nConnection: close\r\n\r\n");
    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }

    let mut response = String::new();
    if stream.read_to_string(&mut response).is_err() {
        return false;
    }

    response.starts_with("HTTP/1.1 200") && response.contains("\"status\":\"ok\"")
}

fn read_dotenv(path: &Path) -> HashMap<String, String> {
    let Ok(contents) = std::fs::read_to_string(path) else {
        return HashMap::new();
    };

    contents
        .lines()
        .filter_map(|line| {
            let trimmed = line.trim();
            if trimmed.is_empty() || trimmed.starts_with('#') {
                return None;
            }
            let (key, value) = trimmed.split_once('=')?;
            Some((
                key.trim().to_string(),
                value.trim().trim_matches('"').to_string(),
            ))
        })
        .collect()
}

fn env_value(file_env: &HashMap<String, String>, key: &str) -> Option<String> {
    env::var(key)
        .ok()
        .filter(|value| !value.trim().is_empty())
        .or_else(|| file_env.get(key).cloned())
}

fn canonical_or_legacy_env_value(
    file_env: &HashMap<String, String>,
    canonical: &str,
    legacy: &str,
) -> Option<String> {
    env_value(file_env, canonical).or_else(|| env_value(file_env, legacy))
}

fn process_env_value(key: &str) -> Option<String> {
    env::var(key).ok().filter(|value| !value.trim().is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn canonical_desktop_environment_wins_over_legacy_alias() {
        let canonical = "ZHARWING_MEMORY_TEST_CANONICAL";
        let legacy = "ZHARWING_MEMORY_TEST_LEGACY";
        let mut file_env = HashMap::new();
        file_env.insert(canonical.to_string(), "canonical".to_string());
        file_env.insert(legacy.to_string(), "legacy".to_string());

        assert_eq!(
            canonical_or_legacy_env_value(&file_env, canonical, legacy),
            Some("canonical".to_string())
        );
    }

    #[test]
    fn legacy_desktop_environment_remains_a_fallback() {
        let canonical = "ZHARWING_MEMORY_TEST_MISSING_CANONICAL";
        let legacy = "ZHARWING_MEMORY_TEST_PRESENT_LEGACY";
        let mut file_env = HashMap::new();
        file_env.insert(legacy.to_string(), "legacy".to_string());

        assert_eq!(
            canonical_or_legacy_env_value(&file_env, canonical, legacy),
            Some("legacy".to_string())
        );
    }
}
