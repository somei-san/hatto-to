use std::time::Instant;

use tauri::{AppHandle, Manager, State};

use crate::model::{AppState, Note, Settings};
use crate::persistence::{enforce_trash_limit, save_notes, save_settings, save_trash};
use crate::window::{create_note_with_window, open_note_window, open_settings_window, open_trash_window};

// ── Tauri Commands ──────────────────────────────────────────

#[tauri::command]
pub(crate) fn get_note(id: String, state: State<AppState>) -> Option<Note> {
    let notes = state.notes.lock().unwrap_or_else(|e| e.into_inner());
    notes.iter().find(|n| n.id == id).cloned()
}

#[tauri::command]
pub(crate) fn update_note_content(id: String, content: String, state: State<AppState>) {
    let mut notes = state.notes.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(note) = notes.iter_mut().find(|n| n.id == id) {
        note.content = content;
        save_notes(&notes);
    }
}

#[tauri::command]
pub(crate) fn update_note_color(id: String, color: String, state: State<AppState>) {
    let mut notes = state.notes.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(note) = notes.iter_mut().find(|n| n.id == id) {
        note.color = color;
        save_notes(&notes);
    }
}

#[tauri::command]
pub(crate) fn update_note_geometry(
    id: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    state: State<AppState>,
) {
    let mut notes = state.notes.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(note) = notes.iter_mut().find(|n| n.id == id) {
        note.x = x;
        note.y = y;
        note.width = width;
        note.height = height;
        save_notes(&notes);
    }
}

#[tauri::command]
pub(crate) fn update_note_zoom(id: String, zoom: u32, state: State<AppState>) {
    let mut notes = state.notes.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(note) = notes.iter_mut().find(|n| n.id == id) {
        note.zoom = zoom.clamp(50, 200);
        save_notes(&notes);
    }
}

#[tauri::command]
pub(crate) fn update_note_pinned(id: String, pinned: bool, state: State<AppState>) {
    let mut notes = state.notes.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(note) = notes.iter_mut().find(|n| n.id == id) {
        note.pinned = pinned;
        save_notes(&notes);
    }
}

#[tauri::command]
pub(crate) fn delete_note(id: String, app: AppHandle, state: State<AppState>) {
    {
        let mut notes = state.notes.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(pos) = notes.iter().position(|n| n.id == id) {
            let note = notes.remove(pos);
            save_notes(&notes);
            let mut trash = state.trash.lock().unwrap_or_else(|e| e.into_inner());
            trash.push(note);
            enforce_trash_limit(&mut trash);
            save_trash(&trash);
        }
    }
    if let Some(win) = app.get_webview_window(&format!("note-{}", id)) {
        let _ = win.close();
    }
}

#[tauri::command]
pub(crate) fn get_trash(state: State<AppState>) -> Vec<Note> {
    state.trash.lock().unwrap_or_else(|e| e.into_inner()).clone()
}

#[tauri::command]
pub(crate) fn restore_note(id: String, app: AppHandle, state: State<AppState>) -> Option<Note> {
    let note = {
        let mut trash = state.trash.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(pos) = trash.iter().position(|n| n.id == id) {
            let note = trash.remove(pos);
            save_trash(&trash);
            Some(note)
        } else {
            None
        }
    };
    if let Some(note) = note {
        open_note_window(&app, &note);
        let mut notes = state.notes.lock().unwrap_or_else(|e| e.into_inner());
        notes.push(note.clone());
        save_notes(&notes);
        Some(note)
    } else {
        None
    }
}

#[tauri::command]
pub(crate) fn empty_trash(state: State<AppState>) {
    let mut trash = state.trash.lock().unwrap_or_else(|e| e.into_inner());
    trash.clear();
    save_trash(&trash);
}

#[tauri::command]
pub(crate) fn get_settings(state: State<AppState>) -> Settings {
    state.settings.lock().unwrap_or_else(|e| e.into_inner()).clone()
}

#[tauri::command]
pub(crate) fn update_settings(
    default_color: String,
    font_size: u32,
    zoom: u32,
    opacity: u32,
    edit_on_single_click: bool,
    bring_all_to_front: bool,
    show_pin_button: bool,
    show_new_button: bool,
    show_color_button: bool,
    state: State<AppState>,
) {
    let mut settings = state.settings.lock().unwrap_or_else(|e| e.into_inner());
    settings.default_color = default_color;
    settings.font_size = font_size.clamp(8, 72);
    settings.zoom = zoom.clamp(50, 200);
    settings.opacity = opacity.clamp(20, 100);
    settings.edit_on_single_click = edit_on_single_click;
    settings.bring_all_to_front = bring_all_to_front;
    settings.show_pin_button = show_pin_button;
    settings.show_new_button = show_new_button;
    settings.show_color_button = show_color_button;
    save_settings(&settings);
}

#[tauri::command]
pub(crate) fn open_settings(app: AppHandle) {
    open_settings_window(&app, None);
}

#[tauri::command]
pub(crate) fn open_trash(app: AppHandle) {
    open_trash_window(&app);
}

#[tauri::command]
pub(crate) fn create_note(app: AppHandle, state: State<AppState>) -> Note {
    create_note_with_window(&app, &state)
}

#[tauri::command]
pub(crate) fn bring_other_notes_to_front(caller_id: String, app: AppHandle, state: State<AppState>) {
    // Cooldown: skip if triggered within last 1 second
    {
        let mut last = state.last_bring_to_front.lock().unwrap_or_else(|e| e.into_inner());
        if last.elapsed() < std::time::Duration::from_secs(1) {
            return;
        }
        *last = Instant::now();
    }
    // Clone IDs only, release lock before window operations to avoid deadlock
    let ids: Vec<String> = {
        let notes = state.notes.lock().unwrap_or_else(|e| e.into_inner());
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
