use std::{
    env, fs,
    io::{Read, Write},
    net::{TcpStream, ToSocketAddrs},
    path::{Path, PathBuf},
    process::{self, Child, Command, Stdio},
    sync::Mutex,
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

const MAX_RPC_BYTES: usize = 8 * 1024 * 1024;

pub fn run() {
    let mut daemon = DaemonManager::from_environment();
    if let Err(error) = daemon.ensure_project(None) {
        eprintln!("Zharwing Memory desktop could not start the local daemon: {error}");
    }

    tauri::Builder::default()
        .manage(Mutex::new(daemon))
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![memory_rpc])
        .run(tauri::generate_context!())
        .expect("failed to run Zharwing Memory desktop app");
}

#[tauri::command]
fn memory_rpc(
    state: tauri::State<'_, Mutex<DaemonManager>>,
    request: String,
    project_id: Option<String>,
) -> Result<String, String> {
    if request.is_empty() || request.len() > MAX_RPC_BYTES {
        return Err("The desktop RPC request is empty or exceeds the byte limit.".to_string());
    }
    validate_project_id(project_id.as_deref())?;
    let mut daemon = state
        .lock()
        .map_err(|_| "The native daemon authority lock is unavailable.".to_string())?;
    daemon.ensure_project(project_id.as_deref())?;
    daemon.call_rpc(&request)
}

struct DaemonManager {
    config: DaemonConfig,
    child: Option<Child>,
    bound_project: Option<String>,
    credential: Vec<u8>,
}

impl DaemonManager {
    fn from_environment() -> Self {
        Self {
            config: DaemonConfig::from_environment(),
            child: None,
            bound_project: None,
            credential: Vec::new(),
        }
    }

    fn ensure_project(&mut self, project_id: Option<&str>) -> Result<(), String> {
        if self.config.autostart_disabled {
            return Err(
                "Native daemon autostart is disabled; no trusted desktop authority is available."
                    .to_string(),
            );
        }
        if self.child.is_some()
            && self.bound_project.as_deref() == project_id
            && daemon_is_healthy(&self.config.host, self.config.port)
        {
            return Ok(());
        }

        self.stop_owned_daemon();
        if daemon_is_healthy(&self.config.host, self.config.port) {
            return Err(
                "An existing daemon does not belong to this desktop authority; refusing to attach."
                    .to_string(),
            );
        }

        let credential_file = credential_exchange_path();

        let launch = daemon_launch()?;
        let mut command = launch.command;
        command
            .current_dir(&launch.working_directory)
            .env("ZHARWING_MEMORY_PROFILE", "hardened-local")
            .env("ZHARWING_MEMORY_AUTH_MODE", "token")
            .env("ZHARWING_MEMORY_HOST", &self.config.host)
            .env("ZHARWING_MEMORY_PORT", self.config.port.to_string())
            .env("ZHARWING_MEMORY_DESKTOP_CREDENTIAL_FILE", &credential_file)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        if let Some(project_id) = project_id {
            command.env("ZHARWING_MEMORY_DESKTOP_PROJECT_ID", project_id);
        } else {
            command.env_remove("ZHARWING_MEMORY_DESKTOP_PROJECT_ID");
        }

        let child = command.spawn().map_err(|error| {
            format!(
                "failed to spawn daemon from {}: {error}",
                launch.working_directory.display()
            )
        })?;
        self.child = Some(child);
        self.bound_project = project_id.map(str::to_string);

        let deadline = Instant::now() + Duration::from_secs(12);
        while Instant::now() < deadline {
            if daemon_is_healthy(&self.config.host, self.config.port) {
                match read_and_remove_credential(&credential_file) {
                    Ok(credential) => {
                        self.clear_credential();
                        self.credential = credential;
                        return Ok(());
                    }
                    Err(_) => {
                        thread::sleep(Duration::from_millis(50));
                        continue;
                    }
                }
            }

            if let Some(child) = self.child.as_mut() {
                if let Ok(Some(status)) = child.try_wait() {
                    return Err(format!("daemon exited before becoming healthy: {status}"));
                }
            }

            thread::sleep(Duration::from_millis(200));
        }

        let _ = fs::remove_file(&credential_file);
        self.stop_owned_daemon();

        Err(format!(
            "daemon did not become healthy at http://{}:{}/health",
            self.config.host, self.config.port
        ))
    }

    fn call_rpc(&self, body: &str) -> Result<String, String> {
        let credential = std::str::from_utf8(&self.credential)
            .map_err(|_| "The native desktop credential is invalid.".to_string())?;
        if credential.is_empty() {
            return Err("The native desktop authority is not established.".to_string());
        }
        post_rpc(&self.config.host, self.config.port, credential, body)
    }

    fn stop_owned_daemon(&mut self) {
        if let Some(mut child) = self.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        self.bound_project = None;
        self.clear_credential();
    }

    fn clear_credential(&mut self) {
        self.credential.fill(0);
        self.credential.clear();
    }
}

impl Drop for DaemonManager {
    fn drop(&mut self) {
        self.stop_owned_daemon();
    }
}

struct DaemonConfig {
    host: String,
    port: u16,
    autostart_disabled: bool,
}

impl DaemonConfig {
    fn from_environment() -> Self {
        let host = process_env_value("ZHARWING_MEMORY_HOST")
            .or_else(|| process_env_value("AIMEM_HOST"))
            .unwrap_or_else(|| "127.0.0.1".to_string());
        if !matches!(host.as_str(), "127.0.0.1" | "localhost" | "::1") {
            panic!("The native daemon host must be an exact loopback host.");
        }
        let port = process_env_value("ZHARWING_MEMORY_PORT")
            .or_else(|| process_env_value("AIMEM_PORT"))
            .and_then(|value| value.parse::<u16>().ok())
            .unwrap_or(37841);
        let autostart_disabled = process_env_value("ZHARWING_MEMORY_DESKTOP_AUTOSTART_DAEMON")
            .or_else(|| process_env_value("AIMEM_DESKTOP_AUTOSTART_DAEMON"))
            .map(|value| matches!(value.as_str(), "0" | "false" | "off" | "no"))
            .unwrap_or(false);

        Self {
            host,
            port,
            autostart_disabled,
        }
    }
}

const DEFAULT_MEMORY_ROOT_NAME: &str = "AI Memory Root";
const DESKTOP_DATA_DIRECTORY_NAME: &str = "Zharwing Memory";

struct DaemonLaunch {
    command: Command,
    working_directory: PathBuf,
}

#[derive(Debug, PartialEq)]
enum DaemonProgram {
    Explicit { program: String, args: Vec<String> },
    Packaged(PathBuf),
    DebugPnpm,
}

#[derive(Debug, PartialEq)]
struct DaemonLaunchSpec {
    program: DaemonProgram,
    working_directory: PathBuf,
    default_memory_root: Option<PathBuf>,
    create_working_directory: bool,
}

struct DaemonLaunchInputs {
    explicit_command: Option<String>,
    operator_working_directory: Option<PathBuf>,
    packaged_executable: Option<PathBuf>,
    debug_workspace_root: Option<PathBuf>,
    user_data_directory: Option<PathBuf>,
    memory_root_is_configured: bool,
    debug_build: bool,
}

fn daemon_launch() -> Result<DaemonLaunch, String> {
    let operator_working_directory = process_env_value("ZHARWING_MEMORY_DESKTOP_PROJECT_ROOT")
        .or_else(|| process_env_value("AIMEM_DESKTOP_PROJECT_ROOT"))
        .map(PathBuf::from)
        .map(absolute_path)
        .transpose()?;
    let executable_directory = env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(Path::to_path_buf));
    let spec = select_daemon_launch(DaemonLaunchInputs {
        explicit_command: process_env_value("ZHARWING_MEMORY_DESKTOP_DAEMON_COMMAND")
            .or_else(|| process_env_value("AIMEM_DESKTOP_DAEMON_COMMAND")),
        operator_working_directory,
        packaged_executable: executable_directory
            .as_deref()
            .and_then(find_packaged_daemon),
        debug_workspace_root: cfg!(debug_assertions)
            .then(discover_debug_workspace_root)
            .flatten(),
        user_data_directory: user_data_directory(),
        memory_root_is_configured: process_env_value("ZHARWING_MEMORY_ROOT")
            .or_else(|| process_env_value("AIMEM_MEMORY_ROOT"))
            .is_some(),
        debug_build: cfg!(debug_assertions),
    })?;

    if spec.create_working_directory {
        fs::create_dir_all(&spec.working_directory).map_err(|error| {
            format!(
                "failed to create native daemon data directory {}: {error}",
                spec.working_directory.display()
            )
        })?;
    }

    let mut command = match spec.program {
        DaemonProgram::Explicit { program, args } => {
            let mut command = Command::new(program);
            command.args(args);
            command
        }
        DaemonProgram::Packaged(executable) => Command::new(executable),
        DaemonProgram::DebugPnpm => {
            if cfg!(windows) {
                let mut command = Command::new("cmd.exe");
                command.args(["/d", "/s", "/c", "pnpm dev:daemon"]);
                command
            } else {
                let mut command = Command::new("pnpm");
                command.arg("dev:daemon");
                command
            }
        }
    };
    if let Some(memory_root) = spec.default_memory_root {
        command.env("ZHARWING_MEMORY_ROOT", memory_root);
    }

    Ok(DaemonLaunch {
        command,
        working_directory: spec.working_directory,
    })
}

fn select_daemon_launch(inputs: DaemonLaunchInputs) -> Result<DaemonLaunchSpec, String> {
    let operator_working_directory = inputs.operator_working_directory;

    if let Some(explicit_command) = inputs.explicit_command {
        let mut parts = explicit_command.split_whitespace();
        let program = parts
            .next()
            .ok_or_else(|| "The explicit native daemon command is empty.".to_string())?;
        let (working_directory, uses_default_directory) =
            launch_working_directory(operator_working_directory, inputs.user_data_directory)?;
        return Ok(DaemonLaunchSpec {
            program: DaemonProgram::Explicit {
                program: program.to_string(),
                args: parts.map(str::to_string).collect(),
            },
            default_memory_root: (!inputs.memory_root_is_configured)
                .then(|| working_directory.join(DEFAULT_MEMORY_ROOT_NAME)),
            working_directory,
            create_working_directory: uses_default_directory,
        });
    }

    if let Some(packaged_executable) = inputs.packaged_executable {
        let (working_directory, uses_default_directory) =
            launch_working_directory(operator_working_directory, inputs.user_data_directory)?;
        return Ok(DaemonLaunchSpec {
            program: DaemonProgram::Packaged(packaged_executable),
            default_memory_root: (!inputs.memory_root_is_configured)
                .then(|| working_directory.join(DEFAULT_MEMORY_ROOT_NAME)),
            working_directory,
            create_working_directory: uses_default_directory,
        });
    }

    if inputs.debug_build {
        let workspace_root = operator_working_directory
            .or(inputs.debug_workspace_root)
            .filter(|path| is_debug_workspace(path))
            .ok_or_else(|| {
                "The debug daemon workspace could not be found; configure ZHARWING_MEMORY_DESKTOP_PROJECT_ROOT."
                    .to_string()
            })?;
        return Ok(DaemonLaunchSpec {
            program: DaemonProgram::DebugPnpm,
            working_directory: workspace_root,
            default_memory_root: None,
            create_working_directory: false,
        });
    }

    Err("No packaged daemon sidecar or explicit native daemon command is available.".to_string())
}

fn launch_working_directory(
    operator_working_directory: Option<PathBuf>,
    user_data_directory: Option<PathBuf>,
) -> Result<(PathBuf, bool), String> {
    match operator_working_directory {
        Some(directory) => Ok((directory, false)),
        None => user_data_directory.map(|directory| (directory, true)).ok_or_else(|| {
            "The OS user-data directory is unavailable; configure ZHARWING_MEMORY_DESKTOP_PROJECT_ROOT explicitly."
                .to_string()
        }),
    }
}

fn find_packaged_daemon(executable_directory: &Path) -> Option<PathBuf> {
    let executable_name = if cfg!(windows) {
        "zharwing-memory-daemon.exe"
    } else {
        "zharwing-memory-daemon"
    };
    [
        executable_directory.join(executable_name),
        executable_directory.join("resources").join(executable_name),
    ]
    .into_iter()
    .find(|candidate| candidate.is_file())
}

fn discover_debug_workspace_root() -> Option<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(current_directory) = env::current_dir() {
        candidates.push(current_directory);
    }
    if let Ok(executable) = env::current_exe() {
        if let Some(directory) = executable.parent() {
            candidates.push(directory.to_path_buf());
        }
    }
    candidates.into_iter().find_map(|candidate| {
        candidate
            .ancestors()
            .find(|directory| is_debug_workspace(directory))
            .map(Path::to_path_buf)
    })
}

fn is_debug_workspace(path: &Path) -> bool {
    path.join("package.json").is_file()
        && path
            .join("apps")
            .join("daemon")
            .join("src")
            .join("index.ts")
            .is_file()
}

fn absolute_path(path: PathBuf) -> Result<PathBuf, String> {
    if path.is_absolute() {
        return Ok(path);
    }
    env::current_dir()
        .map(|current_directory| current_directory.join(path))
        .map_err(|_| "The native daemon working directory could not be resolved.".to_string())
}

#[cfg(target_os = "windows")]
fn user_data_directory() -> Option<PathBuf> {
    process_env_value("LOCALAPPDATA")
        .or_else(|| process_env_value("APPDATA"))
        .map(PathBuf::from)
        .filter(|path| path.is_absolute())
        .map(|path| path.join(DESKTOP_DATA_DIRECTORY_NAME))
}

#[cfg(target_os = "macos")]
fn user_data_directory() -> Option<PathBuf> {
    process_env_value("HOME")
        .map(PathBuf::from)
        .filter(|path| path.is_absolute())
        .map(|path| {
            path.join("Library")
                .join("Application Support")
                .join(DESKTOP_DATA_DIRECTORY_NAME)
        })
}

#[cfg(all(unix, not(target_os = "macos")))]
fn user_data_directory() -> Option<PathBuf> {
    process_env_value("XDG_DATA_HOME")
        .map(PathBuf::from)
        .filter(|path| path.is_absolute())
        .or_else(|| {
            process_env_value("HOME")
                .map(PathBuf::from)
                .filter(|path| path.is_absolute())
                .map(|path| path.join(".local").join("share"))
        })
        .map(|path| path.join(DESKTOP_DATA_DIRECTORY_NAME))
}

#[cfg(not(any(target_os = "windows", unix)))]
fn user_data_directory() -> Option<PathBuf> {
    None
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

fn credential_exchange_path() -> PathBuf {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    env::temp_dir().join(format!(
        "zharwing-memory-desktop-{}-{nonce}.credential",
        process::id()
    ))
}

fn read_and_remove_credential(path: &Path) -> Result<Vec<u8>, String> {
    let metadata = fs::symlink_metadata(path)
        .map_err(|_| "The daemon credential exchange is not ready.".to_string())?;
    if !metadata.file_type().is_file() || metadata.file_type().is_symlink() || metadata.len() > 256
    {
        return Err("The daemon credential exchange is not a bounded regular file.".to_string());
    }
    let mut credential = fs::read(path)
        .map_err(|_| "The daemon credential exchange could not be read.".to_string())?;
    let _ = fs::remove_file(path);
    while credential
        .last()
        .is_some_and(|byte| byte.is_ascii_whitespace())
    {
        credential.pop();
    }
    if credential.len() != 64 || !credential.iter().all(u8::is_ascii_hexdigit) {
        credential.fill(0);
        return Err("The daemon supplied an invalid desktop credential.".to_string());
    }
    Ok(credential)
}

fn validate_project_id(project_id: Option<&str>) -> Result<(), String> {
    let Some(project_id) = project_id else {
        return Ok(());
    };
    if project_id.is_empty()
        || project_id.len() > 128
        || !project_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    {
        return Err("The native project binding is invalid.".to_string());
    }
    Ok(())
}

fn post_rpc(host: &str, port: u16, credential: &str, body: &str) -> Result<String, String> {
    let address = (host, port)
        .to_socket_addrs()
        .map_err(|_| "The local daemon address is invalid.".to_string())?
        .next()
        .ok_or_else(|| "The local daemon address did not resolve.".to_string())?;
    let mut stream = TcpStream::connect_timeout(&address, Duration::from_secs(2))
        .map_err(|_| "The local daemon is unavailable.".to_string())?;
    stream
        .set_read_timeout(Some(Duration::from_secs(65)))
        .map_err(|_| "The local daemon read timeout could not be set.".to_string())?;
    stream
        .set_write_timeout(Some(Duration::from_secs(5)))
        .map_err(|_| "The local daemon write timeout could not be set.".to_string())?;
    let host_header = if host.contains(':') {
        format!("[{host}]:{port}")
    } else {
        format!("{host}:{port}")
    };
    let headers = format!(
        "POST /rpc HTTP/1.1\r\nHost: {host_header}\r\nAuthorization: Bearer {credential}\r\nContent-Type: application/json\r\nAccept: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    );
    stream
        .write_all(headers.as_bytes())
        .and_then(|_| stream.write_all(body.as_bytes()))
        .map_err(|_| "The local daemon request could not be written.".to_string())?;

    let mut response = Vec::new();
    stream
        .take((MAX_RPC_BYTES + 64 * 1024) as u64)
        .read_to_end(&mut response)
        .map_err(|_| "The local daemon response could not be read.".to_string())?;
    parse_http_json_response(&response)
}

fn parse_http_json_response(response: &[u8]) -> Result<String, String> {
    let boundary = response
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
        .ok_or_else(|| "The local daemon returned a malformed HTTP response.".to_string())?;
    let headers = std::str::from_utf8(&response[..boundary])
        .map_err(|_| "The local daemon returned invalid HTTP headers.".to_string())?;
    let lower_headers = headers.to_ascii_lowercase();
    if !headers.starts_with("HTTP/1.1 200 ")
        || !lower_headers.contains("content-type: application/json")
        || lower_headers.contains("transfer-encoding: chunked")
    {
        return Err("The local daemon returned an unsupported response.".to_string());
    }
    let body = &response[boundary + 4..];
    if body.is_empty() || body.len() > MAX_RPC_BYTES {
        return Err("The local daemon returned an empty or oversized response.".to_string());
    }
    let content_length = headers
        .lines()
        .find_map(|line| {
            let (name, value) = line.split_once(':')?;
            name.eq_ignore_ascii_case("content-length")
                .then(|| value.trim().parse::<usize>().ok())
                .flatten()
        })
        .ok_or_else(|| "The local daemon omitted a valid content length.".to_string())?;
    if content_length != body.len() || content_length > MAX_RPC_BYTES {
        return Err("The local daemon response length is invalid.".to_string());
    }
    let body = std::str::from_utf8(body)
        .map_err(|_| "The local daemon returned invalid UTF-8.".to_string())?
        .trim();
    if !(body.starts_with('{') && body.ends_with('}')) {
        return Err("The local daemon returned a non-object response.".to_string());
    }
    Ok(body.to_string())
}

fn process_env_value(key: &str) -> Option<String> {
    env::var(key).ok().filter(|value| !value.trim().is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn launch_inputs() -> DaemonLaunchInputs {
        DaemonLaunchInputs {
            explicit_command: None,
            operator_working_directory: None,
            packaged_executable: None,
            debug_workspace_root: None,
            user_data_directory: None,
            memory_root_is_configured: false,
            debug_build: false,
        }
    }

    #[test]
    fn project_binding_accepts_only_bounded_slug_ids() {
        assert!(validate_project_id(None).is_ok());
        assert!(validate_project_id(Some("project-a_2")).is_ok());
        assert!(validate_project_id(Some("../project-a")).is_err());
        assert!(validate_project_id(Some("project a")).is_err());
    }

    #[test]
    fn rpc_response_parser_requires_a_bounded_json_object() {
        let response = b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 11\r\n\r\n{\"ok\":true}";
        assert_eq!(parse_http_json_response(response).unwrap(), "{\"ok\":true}");
        assert!(parse_http_json_response(b"HTTP/1.1 200 OK\r\n\r\nsecret").is_err());
    }

    #[test]
    fn packaged_launch_uses_user_data_and_absolute_legacy_named_memory_root() {
        let user_data = env::temp_dir()
            .join("zharwing-native-launch-test")
            .join(DESKTOP_DATA_DIRECTORY_NAME);
        let sidecar = env::temp_dir().join("zharwing-memory-daemon-test");
        let mut inputs = launch_inputs();
        inputs.packaged_executable = Some(sidecar.clone());
        inputs.user_data_directory = Some(user_data.clone());

        let spec = select_daemon_launch(inputs).unwrap();

        assert_eq!(spec.program, DaemonProgram::Packaged(sidecar));
        assert_eq!(spec.working_directory, user_data);
        assert_eq!(
            spec.default_memory_root,
            Some(spec.working_directory.join("AI Memory Root"))
        );
        assert!(spec.default_memory_root.unwrap().is_absolute());
        assert!(spec.create_working_directory);
    }

    #[test]
    fn explicit_operator_configuration_wins_without_user_data_discovery() {
        let operator_directory = env::temp_dir().join("operator-owned-daemon-root");
        let mut inputs = launch_inputs();
        inputs.explicit_command = Some("custom-daemon --managed".to_string());
        inputs.operator_working_directory = Some(operator_directory.clone());
        inputs.packaged_executable = Some(env::temp_dir().join("ignored-sidecar"));
        inputs.memory_root_is_configured = true;

        let spec = select_daemon_launch(inputs).unwrap();

        assert_eq!(
            spec.program,
            DaemonProgram::Explicit {
                program: "custom-daemon".to_string(),
                args: vec!["--managed".to_string()]
            }
        );
        assert_eq!(spec.working_directory, operator_directory);
        assert_eq!(spec.default_memory_root, None);
        assert!(!spec.create_working_directory);
    }

    #[test]
    fn debug_fallback_may_use_a_runtime_discovered_workspace() {
        let workspace = env::temp_dir().join(format!(
            "zharwing-debug-workspace-{}-{}",
            process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
        ));
        fs::create_dir_all(workspace.join("apps").join("daemon").join("src")).unwrap();
        fs::write(workspace.join("package.json"), b"{}").unwrap();
        fs::write(
            workspace
                .join("apps")
                .join("daemon")
                .join("src")
                .join("index.ts"),
            b"",
        )
        .unwrap();
        let mut inputs = launch_inputs();
        inputs.debug_build = true;
        inputs.debug_workspace_root = Some(workspace.clone());

        let spec = select_daemon_launch(inputs).unwrap();
        let _ = fs::remove_dir_all(&workspace);

        assert_eq!(spec.program, DaemonProgram::DebugPnpm);
        assert_eq!(spec.working_directory, workspace);
        assert_eq!(spec.default_memory_root, None);
        assert!(!spec.create_working_directory);
    }

    #[test]
    fn release_without_a_sidecar_or_explicit_command_fails_closed() {
        let error = select_daemon_launch(launch_inputs()).unwrap_err();
        assert_eq!(
            error,
            "No packaged daemon sidecar or explicit native daemon command is available."
        );
    }
}
