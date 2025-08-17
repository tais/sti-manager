use std::fs;
use std::path::Path;
use serde::{Deserialize, Serialize};

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
        .map_err(|e| format!("Failed to parse STI file: {}", e))?;
    
    let mut info = StiFileInfo::from(&sti_file);
    info.file_size = file_data.len() as u64;
    
    Ok(info)
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
        .invoke_handler(tauri::generate_handler![
            open_sti_file,
            get_sti_image,
            get_sti_metadata,
            save_sti_file,
            export_image
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
