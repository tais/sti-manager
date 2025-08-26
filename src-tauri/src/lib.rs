use std::fs;
use std::path::{Path, PathBuf};
use std::collections::{HashSet, HashMap};
use std::sync::{Arc, Mutex};
use serde::{Deserialize, Serialize};
use tauri_plugin_dialog::DialogExt;

mod sti;

use sti::{StiParser, StiFile};

// Global caches for parsed STI files and directory scan results
type StiCache = Arc<Mutex<HashMap<String, Arc<StiFile>>>>;
type DirectoryCache = Arc<Mutex<HashMap<String, bool>>>;

lazy_static::lazy_static! {
    static ref STI_CACHE: StiCache = Arc::new(Mutex::new(HashMap::new()));
    static ref DIRECTORY_CACHE: DirectoryCache = Arc::new(Mutex::new(HashMap::new()));
}

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
    
    // Try to get from cache first
    let cached_file = {
        let cache = STI_CACHE.lock().unwrap();
        cache.get(&file_path).cloned()
    };
    
    let (sti_file, file_size) = if let Some(cached) = cached_file {
        // Get file size without re-reading the entire file
        let metadata = fs::metadata(path)
            .map_err(|e| format!("Failed to get file metadata: {}", e))?;
        (cached, metadata.len())
    } else {
        // Parse and cache the file
        let file_data = fs::read(path)
            .map_err(|e| format!("Failed to read file: {}", e))?;
        
        let parsed_file = StiParser::parse(&file_data)
            .map_err(|e| {
                match e {
                    sti::types::StiError::InvalidFormat(msg) => format!("Invalid STI format in '{}': {}", file_path, msg),
                    sti::types::StiError::Io(io_err) => format!("IO error reading '{}': {}", file_path, io_err),
                    sti::types::StiError::Decompression(decomp_err) => format!("Decompression error in '{}': {}", file_path, decomp_err),
                    sti::types::StiError::UnsupportedFormat(unsup_err) => format!("Unsupported format in '{}': {}", file_path, unsup_err),
                }
            })?;
        
        let file_size = file_data.len() as u64;
        let arc_file = Arc::new(parsed_file);
        
        // Cache the parsed file
        {
            let mut cache = STI_CACHE.lock().unwrap();
            // Limit cache size to prevent memory issues
            if cache.len() > 50 {
                cache.clear(); // Simple eviction strategy
            }
            cache.insert(file_path.clone(), arc_file.clone());
        }
        
        (arc_file, file_size)
    };
    
    let mut info = StiFileInfo::from(sti_file.as_ref());
    info.file_size = file_size;
    
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
    // Try to get from cache first
    let cached_file = {
        let cache = STI_CACHE.lock().unwrap();
        cache.get(&file_path).cloned()
    };
    
    let sti_file = if let Some(cached) = cached_file {
        cached
    } else {
        // Parse and cache the file
        let path = Path::new(&file_path);
        let file_data = fs::read(path)
            .map_err(|e| format!("Failed to read file: {}", e))?;
        
        let parsed_file = StiParser::parse(&file_data)
            .map_err(|e| format!("Failed to parse STI file: {}", e))?;
        
        let arc_file = Arc::new(parsed_file);
        
        // Cache the parsed file
        {
            let mut cache = STI_CACHE.lock().unwrap();
            // Limit cache size to prevent memory issues
            if cache.len() > 50 {
                cache.clear(); // Simple eviction strategy
            }
            cache.insert(file_path.clone(), arc_file.clone());
        }
        
        arc_file
    };
    
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
    // Try to get from cache first
    let cached_file = {
        let cache = STI_CACHE.lock().unwrap();
        cache.get(&file_path).cloned()
    };
    
    let sti_file = if let Some(cached) = cached_file {
        cached
    } else {
        // Parse and cache the file
        let path = Path::new(&file_path);
        let file_data = fs::read(path)
            .map_err(|e| format!("Failed to read file: {}", e))?;
        
        let parsed_file = StiParser::parse(&file_data)
            .map_err(|e| format!("Failed to parse STI file: {}", e))?;
        
        let arc_file = Arc::new(parsed_file);
        
        // Cache the parsed file
        {
            let mut cache = STI_CACHE.lock().unwrap();
            // Limit cache size to prevent memory issues
            if cache.len() > 50 {
                cache.clear(); // Simple eviction strategy
            }
            cache.insert(file_path.clone(), arc_file.clone());
        }
        
        arc_file
    };
    
    serde_json::to_value(&sti_file.header)
        .map_err(|e| format!("Failed to serialize metadata: {}", e))
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EditableImage {
    pub width: u16,
    pub height: u16,
    pub data: Vec<u8>, // Palette indices for 8-bit, RGB565 bytes for 16-bit
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EditableStiFile {
    pub file_path: String,
    pub is_8bit: bool,
    pub is_16bit: bool,
    pub palette: Option<Vec<[u8; 3]>>,
    pub images: Vec<EditableImage>,
    pub transparent_color: u32,
    pub flags: u32,
}

#[tauri::command]
async fn enter_edit_mode(file_path: String) -> Result<EditableStiFile, String> {
    // Try to get from cache first
    let cached_file = {
        let cache = STI_CACHE.lock().unwrap();
        cache.get(&file_path).cloned()
    };
    
    let sti_file = if let Some(cached) = cached_file {
        cached
    } else {
        // Parse and cache the file
        let path = Path::new(&file_path);
        let file_data = fs::read(path)
            .map_err(|e| format!("Failed to read file: {}", e))?;
        
        let parsed_file = StiParser::parse(&file_data)
            .map_err(|e| format!("Failed to parse STI file: {}", e))?;
        
        let arc_file = Arc::new(parsed_file);
        
        // Cache the parsed file
        {
            let mut cache = STI_CACHE.lock().unwrap();
            if cache.len() > 50 {
                cache.clear();
            }
            cache.insert(file_path.clone(), arc_file.clone());
        }
        
        arc_file
    };
    
    // Convert to editable format
    let mut editable_images = Vec::new();
    for image in &sti_file.images {
        let pixel_data = image.decompressed_data.as_ref()
            .ok_or("Image data not decompressed")?;
        
        editable_images.push(EditableImage {
            width: image.width,
            height: image.height,
            data: pixel_data.clone(),
        });
    }
    
    Ok(EditableStiFile {
        file_path: file_path.clone(),
        is_8bit: sti_file.is_8bit(),
        is_16bit: sti_file.is_16bit(),
        palette: sti_file.palette.map(|p| p.to_vec()),
        images: editable_images,
        transparent_color: sti_file.header.transparent_color,
        flags: sti_file.header.flags.into(),
    })
}

#[tauri::command]
async fn update_image_data(file_path: String, image_index: usize, image_data: EditableImage) -> Result<(), String> {
    // For now, just validate the operation - actual implementation would update cached data
    if image_data.data.len() != (image_data.width as usize * image_data.height as usize) &&
       image_data.data.len() != (image_data.width as usize * image_data.height as usize * 2) {
        return Err("Invalid image data size".to_string());
    }
    
    // TODO: Update the cached STI file with new image data
    Ok(())
}

#[tauri::command]
async fn create_sti_backup(file_path: String) -> Result<String, String> {
    let path = Path::new(&file_path);
    if !path.exists() {
        return Err("STI file does not exist".to_string());
    }
    
    // Create backup path with timestamp
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    let backup_path = format!("{}.backup.{}", file_path, timestamp);
    
    // Copy the file to backup location
    fs::copy(&file_path, &backup_path)
        .map_err(|e| format!("Failed to create backup: {}", e))?;
    
    Ok(backup_path)
}

#[tauri::command]
async fn validate_sti_integrity(file_path: String) -> Result<bool, String> {
    let path = Path::new(&file_path);
    if !path.exists() {
        return Ok(false);
    }
    
    // Try to parse the STI file to validate integrity
    match fs::read(path) {
        Ok(file_data) => {
            match StiParser::parse(&file_data) {
                Ok(_) => Ok(true),
                Err(_) => Ok(false),
            }
        },
        Err(_) => Ok(false),
    }
}

#[tauri::command]
async fn restore_sti_from_backup(file_path: String, backup_path: String) -> Result<(), String> {
    let backup = Path::new(&backup_path);
    if !backup.exists() {
        return Err("Backup file does not exist".to_string());
    }
    
    // Copy backup back to original location
    fs::copy(&backup_path, &file_path)
        .map_err(|e| format!("Failed to restore from backup: {}", e))?;
    
    // Clear cache to force reload
    {
        let mut cache = STI_CACHE.lock().unwrap();
        cache.remove(&file_path);
    }
    
    Ok(())
}

#[tauri::command]
async fn add_new_image(file_path: String, image_data: EditableImage, position: Option<usize>) -> Result<usize, String> {
    // Validate image data
    if image_data.data.len() != (image_data.width as usize * image_data.height as usize) &&
       image_data.data.len() != (image_data.width as usize * image_data.height as usize * 2) {
        return Err("Invalid image data size".to_string());
    }
    
    // Create backup first
    let backup_path = create_sti_backup(file_path.clone()).await?;
    
    // Try to get cached STI file or parse it
    let cached_file = {
        let cache = STI_CACHE.lock().unwrap();
        cache.get(&file_path).cloned()
    };
    
    let mut sti_file = if let Some(cached) = cached_file {
        (*cached).clone()
    } else {
        let path = Path::new(&file_path);
        let file_data = fs::read(path)
            .map_err(|e| format!("Failed to read file: {}", e))?;
        StiParser::parse(&file_data)
            .map_err(|e| format!("Failed to parse STI file: {}", e))?
    };
    
    // Create new STI image
    let mut new_image = if sti_file.is_8bit() {
        let sub_header = sti::StiSubImageHeader {
            data_offset: 0,
            data_size: 0,
            offset_x: 0,
            offset_y: 0,
            height: image_data.height,
            width: image_data.width,
        };
        sti::StiImage::with_header(sub_header)
    } else {
        sti::StiImage::new(image_data.width, image_data.height)
    };
    
    new_image.decompressed_data = Some(image_data.data);
    new_image.width = image_data.width;
    new_image.height = image_data.height;
    
    // Insert at specified position or at the end
    let insert_pos = position.unwrap_or(sti_file.images.len());
    let insert_pos = insert_pos.min(sti_file.images.len());
    
    sti_file.images.insert(insert_pos, new_image);
    sti_file.header.num_images = sti_file.images.len() as u16;
    
    // Save the modified STI file
    save_modified_sti_file(&file_path, &sti_file).await?;
    
    Ok(insert_pos)
}

#[tauri::command]
async fn reorder_images(file_path: String, new_order: Vec<usize>) -> Result<(), String> {
    // Create backup first
    let backup_path = create_sti_backup(file_path.clone()).await?;
    
    // Get cached STI file or parse it
    let cached_file = {
        let cache = STI_CACHE.lock().unwrap();
        cache.get(&file_path).cloned()
    };
    
    let mut sti_file = if let Some(cached) = cached_file {
        (*cached).clone()
    } else {
        let path = Path::new(&file_path);
        let file_data = fs::read(path)
            .map_err(|e| format!("Failed to read file: {}", e))?;
        StiParser::parse(&file_data)
            .map_err(|e| format!("Failed to parse STI file: {}", e))?
    };
    
    // Validate new_order
    if new_order.len() != sti_file.images.len() {
        return Err("New order length doesn't match image count".to_string());
    }
    
    let mut used_indices = vec![false; sti_file.images.len()];
    for &index in &new_order {
        if index >= sti_file.images.len() {
            return Err(format!("Invalid index {} in new order", index));
        }
        if used_indices[index] {
            return Err(format!("Duplicate index {} in new order", index));
        }
        used_indices[index] = true;
    }
    
    // Reorder images according to new_order
    let original_images = sti_file.images.clone();
    sti_file.images.clear();
    
    for &index in &new_order {
        sti_file.images.push(original_images[index].clone());
    }
    
    // Save the modified STI file
    save_modified_sti_file(&file_path, &sti_file).await?;
    
    Ok(())
}

#[tauri::command]
async fn remove_images_from_sti(file_path: String, indices: Vec<usize>) -> Result<(), String> {
    if indices.is_empty() {
        return Ok(());
    }
    
    // Create backup first
    let backup_path = create_sti_backup(file_path.clone()).await?;
    
    // Get cached STI file or parse it
    let cached_file = {
        let cache = STI_CACHE.lock().unwrap();
        cache.get(&file_path).cloned()
    };
    
    let mut sti_file = if let Some(cached) = cached_file {
        (*cached).clone()
    } else {
        let path = Path::new(&file_path);
        let file_data = fs::read(path)
            .map_err(|e| format!("Failed to read file: {}", e))?;
        StiParser::parse(&file_data)
            .map_err(|e| format!("Failed to parse STI file: {}", e))?
    };
    
    // Validate indices
    for &index in &indices {
        if index >= sti_file.images.len() {
            return Err(format!("Invalid index {} for removal", index));
        }
    }
    
    // Check if we're not removing all images
    if indices.len() >= sti_file.images.len() {
        return Err("Cannot remove all images from STI file".to_string());
    }
    
    // Sort indices in descending order to remove from the end first
    let mut sorted_indices = indices.clone();
    sorted_indices.sort_by(|a, b| b.cmp(a));
    
    // Remove images
    for &index in &sorted_indices {
        sti_file.images.remove(index);
    }
    
    // Update header
    sti_file.header.num_images = sti_file.images.len() as u16;
    
    // Save the modified STI file
    save_modified_sti_file(&file_path, &sti_file).await?;
    
    Ok(())
}

#[tauri::command]
async fn delete_image(file_path: String, image_index: usize) -> Result<(), String> {
    // Use the new remove_images_from_sti function for single image removal
    remove_images_from_sti(file_path, vec![image_index]).await
}

#[tauri::command]
async fn save_sti_file(file_path: String, editable_sti: EditableStiFile) -> Result<(), String> {
    // Convert EditableStiFile back to StiFile format
    let mut sti_file = convert_editable_to_sti_file(&editable_sti)
        .map_err(|e| format!("Error converting editable STI: {}", e))?;
    
    // Compress image data using ETRLE if needed
    compress_sti_images(&mut sti_file)
        .map_err(|e| format!("Error compressing images: {}", e))?;
    
    // Calculate and update header sizes
    update_sti_header_sizes(&mut sti_file)
        .map_err(|e| format!("Error updating header sizes: {}", e))?;
    
    // Write the STI file to bytes
    let file_bytes = sti::StiParser::write(&sti_file)
        .map_err(|e| format!("Error writing STI file structure: {}", e))?;
    
    // Write to disk
    fs::write(&file_path, &file_bytes)
        .map_err(|e| format!("Error writing to disk '{}': {}", file_path, e))?;
    
    // Clear the cache to force reload from disk
    {
        let mut cache = STI_CACHE.lock().unwrap();
        cache.remove(&file_path);
    }
    
    Ok(())
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

// Cached recursive check if a directory contains STI files (with depth limit for performance)
fn directory_contains_sti_files(dir_path: &Path) -> bool {
    let path_str = dir_path.to_string_lossy().to_string();
    
    // Check cache first
    {
        let cache = DIRECTORY_CACHE.lock().unwrap();
        if let Some(&cached_result) = cache.get(&path_str) {
            return cached_result;
        }
    }
    
    // Perform the check with depth limit
    let result = directory_contains_sti_files_with_depth(dir_path, 0, 3); // Limit to 3 levels deep
    
    // Cache the result
    {
        let mut cache = DIRECTORY_CACHE.lock().unwrap();
        // Limit cache size to prevent memory issues
        if cache.len() > 200 {
            cache.clear(); // Simple eviction strategy
        }
        cache.insert(path_str, result);
    }
    
    result
}

fn directory_contains_sti_files_with_depth(dir_path: &Path, current_depth: usize, max_depth: usize) -> bool {
    if current_depth > max_depth {
        return false;
    }
    
    if let Ok(entries) = fs::read_dir(dir_path) {
        for entry in entries.flatten() {
            let path = entry.path();
            
            // Skip hidden files and directories
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                if name.starts_with('.') {
                    continue;
                }
            }
            
            if path.is_file() {
                if let Some(extension) = path.extension().and_then(|ext| ext.to_str()) {
                    if extension.to_lowercase() == "sti" {
                        return true;
                    }
                }
            } else if path.is_dir() && current_depth < max_depth {
                // Recursively check subdirectories with depth limit
                if directory_contains_sti_files_with_depth(&path, current_depth + 1, max_depth) {
                    return true;
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
    // Try to get from cache first
    let cached_file = {
        let cache = STI_CACHE.lock().unwrap();
        cache.get(&file_path).cloned()
    };
    
    let sti_file = if let Some(cached) = cached_file {
        cached
    } else {
        // Parse and cache the file
        let path = Path::new(&file_path);
        let file_data = fs::read(path)
            .map_err(|e| format!("Failed to read file: {}", e))?;
        
        let parsed_file = StiParser::parse(&file_data)
            .map_err(|e| format!("Failed to parse STI file: {}", e))?;
        
        let arc_file = Arc::new(parsed_file);
        
        // Cache the parsed file
        {
            let mut cache = STI_CACHE.lock().unwrap();
            // Limit cache size to prevent memory issues
            if cache.len() > 50 {
                cache.clear(); // Simple eviction strategy
            }
            cache.insert(file_path.clone(), arc_file.clone());
        }
        
        arc_file
    };
    
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

// Helper functions for STI file saving

fn convert_editable_to_sti_file(editable: &EditableStiFile) -> Result<StiFile, String> {
    use sti::{StiFile, StiImage, StiHeader, StiFlags, StiSubImageHeader};
    
    let mut sti_file = StiFile::new();
    
    // Convert header
    let mut header = StiHeader::default();
    header.signature = [b'S', b'T', b'C', b'I'];
    header.transparent_color = editable.transparent_color;
    header.flags = StiFlags::from(editable.flags);
    
    if editable.is_8bit {
        header.flags.indexed = true;
        header.flags.rgb = false;
        header.flags.etrle_compressed = true; // Enable ETRLE compression for 8-bit
        header.palette_colors = 256;
        header.num_images = editable.images.len() as u16;
        header.color_depth = 8;
        
        // For 8-bit multi-image files, DON'T set width/height in main header
        // These are stored in individual sub-image headers
        if header.num_images == 1 {
            // Single image 8-bit files can have width/height in main header
            if let Some(first_image) = editable.images.first() {
                header.width = first_image.width;
                header.height = first_image.height;
            }
        } else {
            // Multi-image files: width/height should be 0 in main header
            header.width = 0;
            header.height = 0;
        }
    } else if editable.is_16bit {
        header.flags.rgb = true;
        header.flags.indexed = false;
        header.color_depth = 16;
        header.num_images = 1; // 16-bit files typically have one image
        
        if let Some(first_image) = editable.images.first() {
            header.width = first_image.width;
            header.height = first_image.height;
        }
    }
    
    sti_file.header = header;
    
    // Convert palette
    if editable.is_8bit {
        if let Some(palette_data) = &editable.palette {
            let mut palette = [[0u8; 3]; 256];
            for (i, color) in palette_data.iter().enumerate() {
                if i < 256 {
                    palette[i] = *color;
                }
            }
            sti_file.palette = Some(palette);
        } else {
            return Err("8-bit STI file requires a palette".to_string());
        }
    }
    
    // Convert images
    for editable_image in editable.images.iter() {
        let mut image = if editable.is_8bit {
            // Create sub-image header for 8-bit images
            let sub_header = StiSubImageHeader {
                data_offset: 0, // Will be set properly in compress_sti_images
                data_size: 0, // Will be set after compression
                offset_x: 0,
                offset_y: 0,
                height: editable_image.height,
                width: editable_image.width,
            };
            
            StiImage::with_header(sub_header)
        } else {
            StiImage::new(editable_image.width, editable_image.height)
        };
        
        // Set decompressed data (will be compressed later if needed)
        image.decompressed_data = Some(editable_image.data.clone());
        image.width = editable_image.width;
        image.height = editable_image.height;
        
        sti_file.images.push(image);
    }
    
    Ok(sti_file)
}

fn compress_sti_images(sti_file: &mut StiFile) -> Result<(), String> {
    use sti::etrle::EtrleDecoder;
    
    if sti_file.is_8bit() && sti_file.header.flags.etrle_compressed {
        // Compress 8-bit ETRLE images with proper offset calculation
        let mut cumulative_data_offset = 0u32;
        
        for (index, image) in sti_file.images.iter_mut().enumerate() {
            if let Some(decompressed_data) = &image.decompressed_data {
                let encoder = EtrleDecoder::new(image.width, image.height);
                let compressed_data = encoder.compress(decompressed_data)
                    .map_err(|e| format!("Failed to compress image data: {}", e))?;
                
                image.raw_data = compressed_data;
                
                // Update sub-header with compressed size and cumulative offset
                if let Some(header) = &mut image.header {
                    header.data_size = image.raw_data.len() as u32;
                    
                    // data_offset is cumulative from the start of image data section
                    header.data_offset = cumulative_data_offset;
                }
                
                // Add this image's size to the cumulative offset for next image
                cumulative_data_offset += image.raw_data.len() as u32;
            }
        }
    } else if sti_file.is_16bit() {
        // For 16-bit files, raw_data = decompressed_data (no compression)
        for image in &mut sti_file.images {
            if let Some(decompressed_data) = &image.decompressed_data {
                image.raw_data = decompressed_data.clone();
            }
        }
    } else {
        // For uncompressed 8-bit files, raw_data = decompressed_data
        let mut cumulative_data_offset = 0u32;
        
        for (index, image) in sti_file.images.iter_mut().enumerate() {
            if let Some(decompressed_data) = &image.decompressed_data {
                image.raw_data = decompressed_data.clone();
                
                // Update sub-header with data size and cumulative offset
                if let Some(header) = &mut image.header {
                    header.data_size = image.raw_data.len() as u32;
                    header.data_offset = cumulative_data_offset;
                }
                
                // Add this image's size to the cumulative offset for next image
                cumulative_data_offset += image.raw_data.len() as u32;
            }
        }
    }
    
    Ok(())
}

// Helper function to save modified STI files with proper compression and validation
async fn save_modified_sti_file(file_path: &str, sti_file: &StiFile) -> Result<(), String> {
    // Convert to editable format first
    let editable_sti = convert_sti_to_editable(sti_file)?;
    
    // Use existing save function
    save_sti_file(file_path.to_string(), editable_sti).await
}

fn convert_sti_to_editable(sti_file: &StiFile) -> Result<EditableStiFile, String> {
    let mut editable_images = Vec::new();
    
    for image in &sti_file.images {
        let pixel_data = image.decompressed_data.as_ref()
            .ok_or("Image data not decompressed")?;
        
        editable_images.push(EditableImage {
            width: image.width,
            height: image.height,
            data: pixel_data.clone(),
        });
    }
    
    Ok(EditableStiFile {
        file_path: String::new(), // Will be set by caller
        is_8bit: sti_file.is_8bit(),
        is_16bit: sti_file.is_16bit(),
        palette: sti_file.palette.map(|p| p.to_vec()),
        images: editable_images,
        transparent_color: sti_file.header.transparent_color,
        flags: sti_file.header.flags.into(),
    })
}

fn update_sti_header_sizes(sti_file: &mut StiFile) -> Result<(), String> {
    if sti_file.is_8bit() {
        // Calculate total compressed size for 8-bit files
        let mut total_compressed_size = 0u32;
        let mut total_original_size = 0u32;
        
        for image in &sti_file.images {
            total_compressed_size += image.raw_data.len() as u32;
            if let Some(decompressed) = &image.decompressed_data {
                total_original_size += decompressed.len() as u32;
            }
        }
        
        sti_file.header.compressed_size = total_compressed_size;
        sti_file.header.original_size = total_original_size;
    } else if sti_file.is_16bit() {
        // For 16-bit files, raw data = decompressed data
        if let Some(first_image) = sti_file.images.first() {
            let data_size = first_image.raw_data.len() as u32;
            sti_file.header.compressed_size = data_size;
            sti_file.header.original_size = data_size;
        }
    }
    
    Ok(())
}

#[tauri::command]
async fn clear_sti_cache() -> Result<(), String> {
    let mut sti_cache = STI_CACHE.lock().unwrap();
    let mut dir_cache = DIRECTORY_CACHE.lock().unwrap();
    sti_cache.clear();
    dir_cache.clear();
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
            debug_sti_file,
            clear_sti_cache,
            enter_edit_mode,
            update_image_data,
            add_new_image,
            reorder_images,
            delete_image,
            remove_images_from_sti,
            create_sti_backup,
            validate_sti_integrity,
            restore_sti_from_backup
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
