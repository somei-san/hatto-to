use std::time::Instant;

use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};

use crate::model::{resolve_color, AppState, Note, RecoverMutex};
use crate::persistence::save_notes;

const DEFAULT_POSITION: (f64, f64) = (120.0, 120.0);

// ── Note Creation Helper ────────────────────────────────────

/// Create a new note with offset positioning and open its window.
/// Shared by create_note command, app menu, and tray menu.
pub(crate) fn create_note_with_window(app: &AppHandle, state: &AppState) -> Note {
    let default_color = state
        .settings
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .default_color
        .clone();
    let color = resolve_color(&default_color);
    // Build note with offset — release notes lock before opening window
    let n = {
        let notes = state.notes.recover();
        let offset = ((notes.len() % 20) as f64) * 30.0;
        let mut n = Note::new(&color);
        n.x += offset;
        n.y += offset;
        n
    };
    open_note_window(app, &n);
    {
        let mut notes = state.notes.recover();
        notes.push(n.clone());
        if let Err(e) = save_notes(&notes) {
            eprintln!("save notes error: {}", e);
        }
    }
    n
}

// ── Window Management ───────────────────────────────────────

/// モニターの論理座標範囲を確認し、付箋の位置が全モニター外なら
/// プライマリモニター上のデフォルト位置にクランプする。
/// モニター情報が取得できない場合は検証不能なので元の座標をそのまま返す。
fn clamp_to_screen(app: &AppHandle, x: f64, y: f64) -> (f64, f64) {
    let Ok(monitors) = app.available_monitors() else {
        return (x, y);
    };
    if monitors.is_empty() {
        return (x, y);
    }
    for monitor in &monitors {
        let sf = monitor.scale_factor();
        let mx = monitor.position().x as f64 / sf;
        let my = monitor.position().y as f64 / sf;
        let mw = monitor.size().width as f64 / sf;
        let mh = monitor.size().height as f64 / sf;
        // 付箋の左上コーナーがモニター内にあれば OK（端50px のマージンあり）
        if x >= mx && x < mx + mw - 50.0 && y >= my && y < my + mh - 50.0 {
            return (x, y);
        }
    }
    // どのモニターにも収まらない → プライマリモニターの左上付近にリセット
    let (base_x, base_y) = app
        .primary_monitor()
        .ok()
        .flatten()
        .map(|m| {
            let sf = m.scale_factor();
            (m.position().x as f64 / sf, m.position().y as f64 / sf)
        })
        .unwrap_or((0.0, 0.0));
    (base_x + DEFAULT_POSITION.0, base_y + DEFAULT_POSITION.1)
}

pub(crate) fn open_note_window(app: &AppHandle, note: &Note) {
    let label = format!("note-{}", note.id);
    let url = format!("note.html?id={}", note.id);

    let (x, y) = clamp_to_screen(app, note.x, note.y);
    let Ok(win) = WebviewWindowBuilder::new(app, &label, WebviewUrl::App(url.into()))
        .title("") // No title for Stickies-like feel
        .inner_size(note.width, note.height)
        .min_inner_size(200.0, 150.0)
        .position(x, y)
        .decorations(false)
        .transparent(true)
        .always_on_top(note.pinned)
        .accept_first_mouse(true)
        .visible(true)
        .build()
    else {
        return;
    };

    // Bring other notes to front when this window receives native focus.
    // Using WindowEvent::Focused is more reliable than JS focus events, as it
    // fires after macOS animations complete (e.g. Mission Control, app switching).
    let app_handle = app.clone();
    let note_id = note.id.clone();
    win.on_window_event(move |event| {
        if let tauri::WindowEvent::Focused(true) = event {
            bring_others_to_front(&app_handle, &note_id);
        }
    });
}

/// Bring all other note windows to the front when one note receives focus.
/// Includes a 500ms cooldown to prevent cascading calls from programmatic set_focus().
fn bring_others_to_front(app: &AppHandle, caller_id: &str) {
    let state: State<AppState> = app.state();

    if !state.settings.recover().bring_all_to_front {
        return;
    }

    {
        let mut last = state.last_bring_to_front.recover();
        if last.elapsed() < std::time::Duration::from_millis(500) {
            return;
        }
        *last = Instant::now();
    }

    let ids: Vec<String> = {
        let notes = state.notes.recover();
        notes
            .iter()
            .filter(|n| n.id != caller_id)
            .map(|n| n.id.clone())
            .collect()
    };

    for id in &ids {
        if let Some(win) = app.get_webview_window(&format!("note-{}", id)) {
            let _ = win.show();
            let _ = win.set_focus();
        }
    }
    // Re-focus the caller so it stays on top
    if let Some(win) = app.get_webview_window(&format!("note-{}", caller_id)) {
        let _ = win.set_focus();
    }
}

// ── Window Management (Settings) ────────────────────────────

const VALID_TABS: &[&str] = &["settings", "help"];

pub(crate) fn open_settings_window(app: &AppHandle, tab: Option<&str>) {
    let tab = tab.filter(|t| VALID_TABS.contains(t));
    if let Some(win) = app.get_webview_window("settings") {
        if let Some(t) = tab {
            let _ = win.emit("switch-tab", t);
        }
        let _ = win.set_focus();
        return;
    }
    let url = match tab {
        Some(t) => format!("settings.html?tab={}", t),
        None => "settings.html".to_string(),
    };
    let _ = WebviewWindowBuilder::new(app, "settings", WebviewUrl::App(url.into()))
        .title("貼っとっと — 設定 / ヘルプ")
        .inner_size(440.0, 600.0)
        .min_inner_size(380.0, 460.0)
        .resizable(true)
        .visible(true)
        .build();
}

pub(crate) fn open_trash_window(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("trash") {
        let _ = win.set_focus();
        return;
    }
    let _ = WebviewWindowBuilder::new(app, "trash", WebviewUrl::App("trash.html".into()))
        .title("ゴミ箱")
        .inner_size(360.0, 480.0)
        .min_inner_size(300.0, 300.0)
        .resizable(true)
        .visible(true)
        .build();
}

// ── Bring All Notes to Front ────────────────────────────────

pub(crate) fn bring_all_to_front(app: &AppHandle) {
    let state: State<AppState> = app.state();
    let notes = state.notes.recover();
    for note in notes.iter() {
        if let Some(win) = app.get_webview_window(&format!("note-{}", note.id)) {
            let _ = win.show();
            let _ = win.set_focus();
        } else {
            // Window was closed (e.g. via ⌘W) — recreate it
            open_note_window(app, note);
        }
    }
}
