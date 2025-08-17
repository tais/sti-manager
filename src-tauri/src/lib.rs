use std::fs;
use std::path::{Path, PathBuf};
use std::collections::HashSet;
use serde::{Deserialize, Serialize};
use tauri_plugin_dialog::DialogExt;

mod sti;

use sti::{StiParser, StiFile};

#[derive(Debug, Serialize, Deserialize)]
pub struct StiFileInfo {
    pub width: u16,
    pub height: u16,
    pub num_images: u16,
    pub is_16bit: bool,
    pub is_8bit: bool,
    pub is_animated: bool,
    pub is_compressed: bool,
    pub file_size: u64,
}

impl From<&StiFile> for StiFileInfo {
    fn from(sti_file: &StiFile) -> Self {
        Self {
            width: if sti_file.is_16bit() { 
                sti_file.header.width 
            } else { 
                sti_file.images.first().map(|img| img.width).unwrap_or(0)
            },
            height: if sti_file.is_16bit() { 
                sti_file.header.height 
            } else { 
                sti_file.images.first().map(|img| img.height).unwrap_or(0)
            },
            num_images: sti_file.header.num_images,
            is_16bit: sti_file.is_16bit(),
            is_8bit: sti_file.is_8bit(),
            is_animated: sti_file.is_animated(),
            is_compressed: sti_file.is_compressed(),
            file_size: 0, // Will be set by caller
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct StiImageData {
    pub width: u16,
    pub height: u16,
    pub data: Vec<u8>,
    pub palette: Option<Vec<[u8; 3]>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DirectoryItem {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
    pub is_sti_file: bool,
    pub contains_sti_files: bool, // New field for intelligent filtering
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DirectoryContents {
    pub current_path: String,
    pub parent_path: Option<String>,
    pub items: Vec<DirectoryItem>,
    pub sti_count: usize,
}

// Tauri commands
#[tauri::command]
async fn open_sti_file(file_path: String) -> Result<StiFileInfo, String> {
    let path = Path::new(&file_path);
    
    if !path.exists() {
        return Err("File does not exist".to_string());
    }
    
    let file_data = fs::read(path)
        .map_err(|e| format!("Failed to read file: {}", e))?;
    
    let sti_file = StiParser::parse(&file_data)
        .map_err(|e| format!("Failed to parse STI file '{}': {}", file_path, e))?;
    
    let mut info = StiFileInfo::from(&sti_file);
    info.file_size = file_data.len() as u64;
    
    Ok(info)
}

#[tauri::command]
async fn debug_sti_file(file_path: String) -> Result<String, String> {
    let path = Path::new(&file_path);
    
    if !path.exists() {
        return Err("File does not exist".to_string());
    }
    
    let file_data = fs::read(path)
        .map_err(|e| format!("Failed to read file: {}", e))?;
    
    if file_data.len() < 64 {
        return Ok(format!("File too small: {} bytes (need at least 64 for header)", file_data.len()));
    }
    
    // Read first 64 bytes as header
    let signature = &file_data[0..4];
    let original_size = u32::from_le_bytes([file_data[4], file_data[5], file_data[6], file_data[7]]);
    let compressed_size = u32::from_le_bytes([file_data[8], file_data[9], file_data[10], file_data[11]]);
    let transparent_color = u32::from_le_bytes([file_data[12], file_data[13], file_data[14], file_data[15]]);
    let flags_value = u32::from_le_bytes([file_data[16], file_data[17], file_data[18], file_data[19]]);
    let height = u16::from_le_bytes([file_data[20], file_data[21]]);
    let width = u16::from_le_bytes([file_data[22], file_data[23]]);
    
    let flags = sti::types::StiFlags::from(flags_value);
    
    let mut debug_info = format!(
        "STI Debug Information for: {}\n\
         File size: {} bytes\n\
         Signature: {:?} ({})\n\
         Original size: {}\n\
         Compressed size: {}\n\
         Transparent color: {}\n\
         Flags value: 0x{:08X}\n\
         Flags breakdown:\n\
         - Transparent: {}\n\
         - Alpha: {}\n\
         - RGB (16-bit): {}\n\
         - Indexed (8-bit): {}\n\
         - ZLIB compressed: {}\n\
         - ETRLE compressed: {}\n\
         Height: {}\n\
         Width: {}\n",
        file_path,
        file_data.len(),
        signature,
        String::from_utf8_lossy(signature),
        original_size,
        compressed_size,
        transparent_color,
        flags_value,
        flags.transparent,
        flags.alpha,
        flags.rgb,
        flags.indexed,
        flags.zlib_compressed,
        flags.etrle_compressed,
        height,
        width
    );
    
    // Try to parse and add detailed error info
    match StiParser::parse(&file_data) {
        Ok(sti_file) => {
            debug_info.push_str(&format!("\nParsing: SUCCESS\nImages loaded: {}\n", sti_file.images.len()));
        }
        Err(e) => {
            debug_info.push_str(&format!("\nParsing: FAILED\nError: {}\n", e));
        }
    }
    
    Ok(debug_info)
}

#[tauri::command]
async fn get_sti_image(file_path: String, image_index: usize) -> Result<StiImageData, String> {
    let path = Path::new(&file_path);
    let file_data = fs::read(path)
        .map_err(|e| format!("Failed to read file: {}", e))?;
    
    let sti_file = StiParser::parse(&file_data)
        .map_err(|e| format!("Failed to parse STI file: {}", e))?;
    
    if image_index >= sti_file.images.len() {
        return Err("Image index out of bounds".to_string());
    }
    
    let image = &sti_file.images[image_index];
    let pixel_data = image.decompressed_data.as_ref()
        .ok_or("Image data not decompressed")?;
    
    let palette = sti_file.palette.map(|p| p.to_vec());
    
    Ok(StiImageData {
        width: image.width,
        height: image.height,
        data: pixel_data.clone(),
        palette,
    })
}

#[tauri::command]
async fn get_sti_metadata(file_path: String) -> Result<serde_json::Value, String> {
    let path = Path::new(&file_path);
    let file_data = fs::read(path)
        .map_err(|e| format!("Failed to read file: {}", e))?;
    
    let sti_file = StiParser::parse(&file_data)
        .map_err(|e| format!("Failed to parse STI file: {}", e))?;
    
    serde_json::to_value(&sti_file.header)
        .map_err(|e| format!("Failed to serialize metadata: {}", e))
}

#[tauri::command]
async fn save_sti_file(_file_path: String, _sti_data: serde_json::Value) -> Result<(), String> {
    // This is a placeholder for saving STI files
    // Implementation would deserialize the sti_data and use StiParser::write
    Err("STI file saving not yet implemented".to_string())
}

#[tauri::command]
async fn select_directory(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use std::sync::mpsc;
    
    let (tx, rx) = mpsc::channel();
    
    app.dialog()
        .file()
        .set_title("Select Directory Containing STI Files")
        .pick_folder(move |result| {
            let _ = tx.send(result);
        });
    
    match rx.recv() {
        Ok(Some(path)) => {
            // Convert FilePath to PathBuf, then to string
            let path_buf = path.as_path().ok_or("Invalid path")?;
            Ok(Some(path_buf.to_string_lossy().to_string()))
        },
        Ok(None) => Ok(None),
        Err(_) => Err("Failed to receive dialog result".to_string()),
    }
}

#[tauri::command]
async fn browse_directory(directory_path: String) -> Result<DirectoryContents, String> {
    let path = Path::new(&directory_path);
    
    if !path.exists() {
        return Err("Directory does not exist".to_string());
    }
    
    if !path.is_dir() {
        return Err("Path is not a directory".to_string());
    }
    
    let mut directories = Vec::new();
    let mut sti_files = Vec::new();
    let mut sti_count = 0;
    
    // Read directory entries - optimized single pass
    let entries = fs::read_dir(path)
        .map_err(|e| format!("Failed to read directory: {}", e))?;
    
    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let entry_path = entry.path();
        
        // Get filename once
        let file_name = match entry_path.file_name().and_then(|n| n.to_str()) {
            Some(name) => name,
            None => continue,
        };
        
        // Skip hidden files/directories
        if file_name.starts_with('.') {
            continue;
        }
        
        let is_directory = entry_path.is_dir();
        
        if is_directory {
            // Only check if directory contains STI files when needed, not recursively
            let contains_sti_files = directory_contains_sti_files(&entry_path);
            if contains_sti_files {
                directories.push(DirectoryItem {
                    name: file_name.to_string(),
                    path: entry_path.to_string_lossy().to_string(),
                    is_directory: true,
                    is_sti_file: false,
                    contains_sti_files: true,
                });
            }
        } else if file_name.to_lowercase().ends_with(".sti") {
            sti_count += 1;
            sti_files.push(DirectoryItem {
                name: file_name.to_string(),
                path: entry_path.to_string_lossy().to_string(),
                is_directory: false,
                is_sti_file: true,
                contains_sti_files: false,
            });
        }
    }
    
    // Simple sorting: directories first, then STI files, both by name
    directories.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    sti_files.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    
    // Combine directories and files
    let mut items = directories;
    items.extend(sti_files);
    
    let parent_path = path.parent()
        .map(|p| p.to_string_lossy().to_string());
    
    Ok(DirectoryContents {
        current_path: directory_path,
        parent_path,
        items,
        sti_count,
    })
}

// Fast, non-recursive check if a directory contains STI files directly
fn directory_contains_sti_files(dir_path: &Path) -> bool {
    if let Ok(entries) = fs::read_dir(dir_path) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(extension) = path.extension().and_then(|ext| ext.to_str()) {
                    if extension.to_lowercase() == "sti" {
                        return true;
                    }
                }
            } else if path.is_dir() {
                // Check one level deep only to avoid performance issues
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    if !name.starts_with('.') && directory_contains_sti_files(&path) {
                        return true;
                    }
                }
            }
        }
    }
    false
}

#[tauri::command]
async fn scan_for_sti_files(directory_path: String, recursive: bool) -> Result<Vec<String>, String> {
    let mut sti_files = Vec::new();
    scan_directory_for_sti(&Path::new(&directory_path), &mut sti_files, recursive)?;
    Ok(sti_files)
}

fn scan_directory_for_sti(dir: &Path, sti_files: &mut Vec<String>, recursive: bool) -> Result<(), String> {
    if !dir.is_dir() {
        return Ok(());
    }
    
    let entries = fs::read_dir(dir)
        .map_err(|e| format!("Failed to read directory {}: {}", dir.display(), e))?;
    
    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let path = entry.path();
        
        if path.is_dir() && recursive {
            // Skip hidden directories
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                if !name.starts_with('.') {
                    scan_directory_for_sti(&path, sti_files, recursive)?;
                }
            }
        } else if path.is_file() {
            if let Some(extension) = path.extension().and_then(|ext| ext.to_str()) {
                if extension.to_lowercase() == "sti" {
                    sti_files.push(path.to_string_lossy().to_string());
                }
            }
        }
    }
    
    Ok(())
}


#[tauri::command]
async fn export_image(file_path: String, image_index: usize, output_path: String, format: String) -> Result<(), String> {
    let path = Path::new(&file_path);
    let file_data = fs::read(path)
        .map_err(|e| format!("Failed to read file: {}", e))?;
    
    let sti_file = StiParser::parse(&file_data)
        .map_err(|e| format!("Failed to parse STI file: {}", e))?;
    
    if image_index >= sti_file.images.len() {
        return Err("Image index out of bounds".to_string());
    }
    
    let image = &sti_file.images[image_index];
    let pixel_data = image.decompressed_data.as_ref()
        .ok_or("Image data not decompressed")?;
    
    // Convert to RGB format for export
    let rgb_data = if sti_file.is_8bit() {
        let palette = sti_file.palette.as_ref()
            .ok_or("8-bit image missing palette")?;
        
        let mut rgb = Vec::with_capacity(pixel_data.len() * 3);
        for &pixel in pixel_data {
            let color = palette[pixel as usize];
            rgb.extend_from_slice(&color);
        }
        rgb
    } else {
        // Convert 16-bit RGB565 to 24-bit RGB
        let mut rgb = Vec::with_capacity(pixel_data.len() / 2 * 3);
        for chunk in pixel_data.chunks(2) {
            if chunk.len() == 2 {
                let rgb565 = u16::from_le_bytes([chunk[0], chunk[1]]);
                let r = ((rgb565 >> 11) & 0x1F) << 3;
                let g = ((rgb565 >> 5) & 0x3F) << 2;
                let b = (rgb565 & 0x1F) << 3;
                rgb.push(r as u8);
                rgb.push(g as u8);
                rgb.push(b as u8);
            }
        }
        rgb
    };
    
    // Use the image crate to save the file
    let img = image::RgbImage::from_raw(image.width as u32, image.height as u32, rgb_data)
        .ok_or("Failed to create image from data")?;
    
    match format.to_lowercase().as_str() {
        "png" => img.save_with_format(&output_path, image::ImageFormat::Png),
        "jpeg" | "jpg" => img.save_with_format(&output_path, image::ImageFormat::Jpeg),
        "bmp" => img.save_with_format(&output_path, image::ImageFormat::Bmp),
        _ => return Err(format!("Unsupported export format: {}", format)),
    }
    .map_err(|e| format!("Failed to save image: {}", e))?;
    
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            open_sti_file,
            get_sti_image,
            get_sti_metadata,
            save_sti_file,
            export_image,
            select_directory,
            browse_directory,
            scan_for_sti_files,
            debug_sti_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
